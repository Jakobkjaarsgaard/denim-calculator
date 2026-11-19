import { useEffect, useRef, useState } from 'react'
import {
  FIXTURE_AMBIGUOUS_WAIST_TEXT,
  FIXTURE_EXPLICIT_CIRCUMFERENCE_TEXT,
  FIXTURE_TAGGED_AND_PRICE_TEXT,
  SYNTHETIC_OCR_LISTING_TEXT,
} from '../domain/fixtures'
import { isAcceptedScreenshotFile, runBrowserLocalOcr } from '../domain/ocr'
import {
  parseListingText,
  resolveProposalToMeasurement,
  type IgnoredLineItem,
  type ParsedProposal,
  type WaistConventionChoice,
} from '../domain/parser'
import {
  createSyntheticListingImageFile,
  createUnreadableDenimPhotoFile,
} from '../domain/syntheticImage'
import {
  CONDITION_LABELS,
  DIMENSION_ORDER,
  DIMENSION_SPECS,
  type CandidateListing,
  type DimensionKey,
  type GarmentCondition,
  type MeasurementConvention,
  type StoredMeasurement,
  type Unit,
} from '../domain/types'
import {
  formatStoredMeasurement,
  getDisplayInputString,
  parseMeasurementInput,
  roundToOneDecimal,
} from '../domain/units'
import { HowToMeasureGuide } from './HowToMeasureGuide'

interface CandidateListingSectionProps {
  candidates: CandidateListing[]
  activeCandidateIndex: number
  displayUnit: Unit
  isExampleMode: boolean
  onSelectCandidate: (index: number) => void
  onUpdateCandidate: (index: number, next: CandidateListing) => void
  onAddCandidate: () => void
  onAddExampleCandidateB?: () => void
  onRemoveCandidate: (index: number) => void
  onBackStep: () => void
  onNextStep: () => void
}

interface FieldDraft {
  text: string
  unit: Unit
  error?: string
}

interface ScreenshotSession {
  file: File
  previewUrl: string
  ocrRunning: boolean
  ocrProgress: string
  ocrError?: string
}

interface StagedReviewSession {
  sourceType: 'text' | 'ocr'
  proposals: ParsedProposal[]
  ignoredItems: IgnoredLineItem[]
  hasMixedUnitsAcrossListing: boolean
  reviewError?: string
  protectedDimensions: Set<DimensionKey>
}

export function CandidateListingSection({
  candidates,
  activeCandidateIndex,
  displayUnit,
  isExampleMode,
  onSelectCandidate,
  onUpdateCandidate,
  onAddCandidate,
  onAddExampleCandidateB,
  onRemoveCandidate,
  onBackStep,
  onNextStep,
}: CandidateListingSectionProps) {
  const candidate = candidates[activeCandidateIndex] ?? candidates[0]

  // Per-candidate transient states (never persisted to localStorage)
  const [draftsByCandidate, setDraftsByCandidate] = useState<
    Record<string, Partial<Record<DimensionKey, FieldDraft>>>
  >({})
  const [manuallyEditedByCandidate, setManuallyEditedByCandidate] = useState<
    Record<string, Set<DimensionKey>>
  >({})
  const [pastedTextByCandidate, setPastedTextByCandidate] = useState<
    Record<string, string>
  >({})
  const [reviewByCandidate, setReviewByCandidate] = useState<
    Record<string, StagedReviewSession | undefined>
  >({})
  const [screenshotByCandidate, setScreenshotByCandidate] = useState<
    Record<string, ScreenshotSession | undefined>
  >({})
  const [fileErrorByCandidate, setFileErrorByCandidate] = useState<
    Record<string, string | undefined>
  >({})

  // Track active OCR jobs so cancelled or delayed OCR never overwrites edits
  const ocrJobCounterRef = useRef(0)
  const activeOcrJobByCandidateRef = useRef<Record<string, number>>({})
  const cancelledOcrJobsRef = useRef<Set<number>>(new Set())
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Cleanup all object URLs on unmount
  const screenshotMapRef = useRef(screenshotByCandidate)
  useEffect(() => {
    screenshotMapRef.current = screenshotByCandidate
  }, [screenshotByCandidate])
  useEffect(() => {
    return () => {
      Object.values(screenshotMapRef.current).forEach((session) => {
        if (session?.previewUrl) {
          URL.revokeObjectURL(session.previewUrl)
        }
      })
    }
  }, [])

  if (!candidate) {
    return null
  }

  const candId = candidate.id
  const drafts = draftsByCandidate[candId] ?? {}
  const manualEdits = manuallyEditedByCandidate[candId] ?? new Set<DimensionKey>()
  const pastedText = pastedTextByCandidate[candId] ?? ''
  const reviewSession = reviewByCandidate[candId]
  const screenshotSession = screenshotByCandidate[candId]
  const fileError = fileErrorByCandidate[candId]

  const markDimensionManuallyEdited = (dim: DimensionKey) => {
    setManuallyEditedByCandidate((prev) => {
      const nextSet = new Set(prev[candId] ?? [])
      nextSet.add(dim)
      return { ...prev, [candId]: nextSet }
    })
    // Also if a review session is currently open, uncheck that dimension so delayed/open review won't overwrite it
    setReviewByCandidate((prev) => {
      const currentReview = prev[candId]
      if (!currentReview) return prev
      const nextProtected = new Set(currentReview.protectedDimensions)
      nextProtected.add(dim)
      return {
        ...prev,
        [candId]: {
          ...currentReview,
          protectedDimensions: nextProtected,
          proposals: currentReview.proposals.map((p) =>
            p.dimension === dim ? { ...p, selectedForImport: false } : p
          ),
        },
      }
    })
  }

  const handleCandidateMetaChange = (
    patch: Partial<Pick<CandidateListing, 'name' | 'url' | 'condition'>>
  ) => {
    onUpdateCandidate(activeCandidateIndex, {
      ...candidate,
      ...patch,
    })
  }

  const applyManualDimensionInput = (
    dim: DimensionKey,
    rawText: string,
    conventionOverride?: MeasurementConvention
  ) => {
    markDimensionManuallyEdited(dim)

    const existing = candidate.measurements[dim]
    const targetConvention =
      conventionOverride ?? existing?.convention ?? 'standard'
    const shouldHalve =
      dim === 'waist' && targetConvention === 'circumference_halved'

    const parsed = parseMeasurementInput(rawText, displayUnit, {
      halveCircumference: shouldHalve,
      convention: targetConvention,
    })

    if (parsed.kind === 'blank') {
      setDraftsByCandidate((prev) => {
        const candDrafts = { ...(prev[candId] ?? {}) }
        delete candDrafts[dim]
        return { ...prev, [candId]: candDrafts }
      })
      const nextMeasurements = { ...candidate.measurements }
      delete nextMeasurements[dim]
      onUpdateCandidate(activeCandidateIndex, {
        ...candidate,
        measurements: nextMeasurements,
      })
      return
    }

    if (parsed.kind === 'error') {
      setDraftsByCandidate((prev) => ({
        ...prev,
        [candId]: {
          ...(prev[candId] ?? {}),
          [dim]: {
            text: rawText,
            unit: displayUnit,
            error: parsed.error,
          },
        },
      }))
      return
    }

    setDraftsByCandidate((prev) => ({
      ...prev,
      [candId]: {
        ...(prev[candId] ?? {}),
        [dim]: {
          text: rawText,
          unit: displayUnit,
          error: undefined,
        },
      },
    }))

    const conventionNote =
      targetConvention === 'incompatible'
        ? dim === 'thigh'
          ? 'Measured at crotch (not 2.5 cm below)'
          : 'Incompatible measuring method'
        : existing?.conventionNote

    const stored: StoredMeasurement = {
      cm: parsed.cm,
      rawInput: parsed.rawInput,
      enteredUnit: parsed.enteredUnit,
      convention: parsed.convention,
      conventionNote,
      conversionNote: parsed.conversionNote,
      confirmed: true,
    }

    onUpdateCandidate(activeCandidateIndex, {
      ...candidate,
      measurements: {
        ...candidate.measurements,
        [dim]: stored,
      },
    })
  }

  const handleMethodConventionChange = (
    dim: DimensionKey,
    newConvention: MeasurementConvention
  ) => {
    markDimensionManuallyEdited(dim)
    const existing = candidate.measurements[dim]
    if (!existing) return

    const conventionNote =
      newConvention === 'incompatible'
        ? dim === 'thigh'
          ? 'Measured at crotch (not 2.5 cm below)'
          : 'Incompatible measuring method'
        : newConvention === 'unknown'
          ? 'Measuring method unconfirmed'
          : undefined

    onUpdateCandidate(activeCandidateIndex, {
      ...candidate,
      measurements: {
        ...candidate.measurements,
        [dim]: {
          ...existing,
          convention: newConvention,
          conventionNote,
        },
      },
    })
  }

  const getInputValue = (dim: DimensionKey): string => {
    const draft = drafts[dim]
    if (draft && draft.unit === displayUnit) {
      if (draft.error) {
        return draft.text
      }
      const stored = candidate.measurements[dim]
      if (
        stored &&
        stored.enteredUnit === displayUnit &&
        stored.convention !== 'circumference_halved'
      ) {
        return draft.text
      }
    }
    return getDisplayInputString(candidate.measurements[dim], displayUnit)
  }

  // Open staged review form from parsed text (never directly overwrites candidate measurements!)
  const openReviewForText = (
    rawText: string,
    sourceType: 'text' | 'ocr',
    protectedDimsSnapshot: Set<DimensionKey>
  ) => {
    const parsed = parseListingText(rawText)
    const proposals = parsed.proposals.map((p) => {
      const isProtected = protectedDimsSnapshot.has(p.dimension)
      return {
        ...p,
        selectedForImport: isProtected ? false : p.selectedForImport,
      }
    })

    setReviewByCandidate((prev) => ({
      ...prev,
      [candId]: {
        sourceType,
        proposals,
        ignoredItems: parsed.ignoredItems,
        hasMixedUnitsAcrossListing: parsed.hasMixedUnitsAcrossListing,
        protectedDimensions: protectedDimsSnapshot,
      },
    }))
  }

  const handleParsePastedText = (textOverride?: string) => {
    const textToParse = textOverride ?? pastedText
    if (!textToParse.trim()) return
    // Any field already manually edited on this candidate is protected from silent overwrite
    const protectedSnapshot = new Set(manualEdits)
    openReviewForText(textToParse, 'text', protectedSnapshot)
  }

  // Screenshot file handling
  const handleSelectScreenshotFile = (file: File | null) => {
    setFileErrorByCandidate((prev) => ({ ...prev, [candId]: undefined }))
    if (!file) return

    if (!isAcceptedScreenshotFile(file)) {
      setFileErrorByCandidate((prev) => ({
        ...prev,
        [candId]:
          'Unsupported file format. Please choose a PNG, JPEG, or WebP screenshot.',
      }))
      return
    }

    // Revoke previous preview URL if present
    const existingSession = screenshotByCandidate[candId]
    if (existingSession?.previewUrl) {
      URL.revokeObjectURL(existingSession.previewUrl)
    }

    // Cancel any running OCR job for this candidate
    const prevJob = activeOcrJobByCandidateRef.current[candId]
    if (prevJob) {
      cancelledOcrJobsRef.current.add(prevJob)
    }

    const previewUrl = URL.createObjectURL(file)
    setScreenshotByCandidate((prev) => ({
      ...prev,
      [candId]: {
        file,
        previewUrl,
        ocrRunning: false,
        ocrProgress: '',
        ocrError: undefined,
      },
    }))
  }

  const handleDismissScreenshot = () => {
    const existingSession = screenshotByCandidate[candId]
    if (existingSession?.previewUrl) {
      URL.revokeObjectURL(existingSession.previewUrl)
    }
    const prevJob = activeOcrJobByCandidateRef.current[candId]
    if (prevJob) {
      cancelledOcrJobsRef.current.add(prevJob)
    }
    setScreenshotByCandidate((prev) => {
      const next = { ...prev }
      delete next[candId]
      return next
    })
    setFileErrorByCandidate((prev) => ({ ...prev, [candId]: undefined }))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRunOcr = async () => {
    const currentScreenshot = screenshotByCandidate[candId]
    if (!currentScreenshot || currentScreenshot.ocrRunning) return

    ocrJobCounterRef.current += 1
    const jobId = ocrJobCounterRef.current
    activeOcrJobByCandidateRef.current[candId] = jobId

    // Snapshot manually edited fields right now; any edits made while OCR runs will also be added to manualEdits
    setScreenshotByCandidate((prev) => {
      const s = prev[candId]
      if (!s) return prev
      return {
        ...prev,
        [candId]: {
          ...s,
          ocrRunning: true,
          ocrProgress: 'Starting local English OCR…',
          ocrError: undefined,
        },
      }
    })

    const outcome = await runBrowserLocalOcr(currentScreenshot.file, {
      simulatedDelayMs: 350,
      shouldCancel: () =>
        cancelledOcrJobsRef.current.has(jobId) ||
        activeOcrJobByCandidateRef.current[candId] !== jobId,
      onProgress: (progressText) => {
        if (
          cancelledOcrJobsRef.current.has(jobId) ||
          activeOcrJobByCandidateRef.current[candId] !== jobId
        ) {
          return
        }
        setScreenshotByCandidate((prev) => {
          const s = prev[candId]
          if (!s) return prev
          return {
            ...prev,
            [candId]: {
              ...s,
              ocrProgress: progressText,
            },
          }
        })
      },
    })

    // Check if cancelled or superseded while running
    if (
      outcome.status === 'cancelled' ||
      cancelledOcrJobsRef.current.has(jobId) ||
      activeOcrJobByCandidateRef.current[candId] !== jobId
    ) {
      setScreenshotByCandidate((prev) => {
        const s = prev[candId]
        if (!s) return prev
        return {
          ...prev,
          [candId]: {
            ...s,
            ocrRunning: false,
            ocrProgress: 'OCR cancelled. Your manual entries remain untouched.',
          },
        }
      })
      return
    }

    if (outcome.status === 'error') {
      setScreenshotByCandidate((prev) => {
        const s = prev[candId]
        if (!s) return prev
        return {
          ...prev,
          [candId]: {
            ...s,
            ocrRunning: false,
            ocrProgress: '',
            ocrError: outcome.message,
          },
        }
      })
      return
    }

    // OCR succeeded! Verify whether the parsed text actually contains any measurement proposals
    const parsedCheck = parseListingText(outcome.text)
    if (parsedCheck.proposals.length === 0) {
      setScreenshotByCandidate((prev) => {
        const s = prev[candId]
        if (!s) return prev
        return {
          ...prev,
          [candId]: {
            ...s,
            ocrRunning: false,
            ocrProgress: '',
            ocrError:
              'No labelled garment dimensions were found in the screenshot text. The image remains open below so you can type any numbers you see directly.',
          },
        }
      })
      return
    }

    setScreenshotByCandidate((prev) => {
      const s = prev[candId]
      if (!s) return prev
      return {
        ...prev,
        [candId]: {
          ...s,
          ocrRunning: false,
          ocrProgress: 'OCR complete — review extracted measurements below.',
          ocrError: undefined,
        },
      }
    })

    // Use the latest manual edits set so anything edited during OCR is protected!
    setManuallyEditedByCandidate((latestManualMap) => {
      const latestProtected = new Set(latestManualMap[candId] ?? [])
      openReviewForText(outcome.text, 'ocr', latestProtected)
      return latestManualMap
    })
  }

  const handleCancelOcr = () => {
    const jobId = activeOcrJobByCandidateRef.current[candId]
    if (jobId) {
      cancelledOcrJobsRef.current.add(jobId)
    }
    setScreenshotByCandidate((prev) => {
      const s = prev[candId]
      if (!s) return prev
      return {
        ...prev,
        [candId]: {
          ...s,
          ocrRunning: false,
          ocrProgress: 'OCR cancelled. Your manual entries remain untouched.',
        },
      }
    })
  }

  // Review form proposal mutators
  const updateReviewProposal = (
    proposalId: string,
    updater: (p: ParsedProposal) => ParsedProposal
  ) => {
    setReviewByCandidate((prev) => {
      const session = prev[candId]
      if (!session) return prev
      return {
        ...prev,
        [candId]: {
          ...session,
          reviewError: undefined,
          proposals: session.proposals.map((p) =>
            p.id === proposalId ? updater(p) : p
          ),
        },
      }
    })
  }

  const selectDuplicateProposal = (
    dimension: DimensionKey,
    proposalId: string,
    checked: boolean
  ) => {
    setReviewByCandidate((prev) => {
      const session = prev[candId]
      if (!session) return prev
      return {
        ...prev,
        [candId]: {
          ...session,
          reviewError: undefined,
          proposals: session.proposals.map((p) => {
            if (p.dimension !== dimension) return p
            if (p.id === proposalId) {
              return { ...p, selectedForImport: checked }
            }
            return checked ? { ...p, selectedForImport: false } : p
          }),
        },
      }
    })
  }

  const handleApplyReviewedMeasurements = () => {
    if (!reviewSession) return
    const selectedProposals = reviewSession.proposals.filter(
      (p) => p.selectedForImport
    )

    if (selectedProposals.length === 0) {
      setReviewByCandidate((prev) => ({
        ...prev,
        [candId]: {
          ...reviewSession,
          reviewError:
            'Select at least one proposed measurement to apply, or click Dismiss Review.',
        },
      }))
      return
    }

    const nextMeasurements = { ...candidate.measurements }
    const nextDrafts = { ...(draftsByCandidate[candId] ?? {}) }

    for (const prop of selectedProposals) {
      const resolved = resolveProposalToMeasurement(prop)
      if (!resolved.ok) {
        const spec = DIMENSION_SPECS[prop.dimension]
        setReviewByCandidate((prev) => ({
          ...prev,
          [candId]: {
            ...reviewSession,
            reviewError: `${spec.shortLabel}: ${resolved.error}`,
          },
        }))
        return
      }
      nextMeasurements[prop.dimension] = resolved.measurement
      delete nextDrafts[prop.dimension]
    }

    setDraftsByCandidate((prev) => ({
      ...prev,
      [candId]: nextDrafts,
    }))

    onUpdateCandidate(activeCandidateIndex, {
      ...candidate,
      measurements: nextMeasurements,
    })

    // Close review form after applying
    setReviewByCandidate((prev) => {
      const next = { ...prev }
      delete next[candId]
      return next
    })
  }

  const handleDismissReview = () => {
    setReviewByCandidate((prev) => {
      const next = { ...prev }
      delete next[candId]
      return next
    })
  }

  return (
    <section
      className="section-card"
      aria-labelledby="listings-section-heading"
      data-testid="candidate-listings-section"
    >
      <div className="section-header">
        <div>
          <span className="section-step-tag">
            Step 2 of 3 • Candidate Listings ({candidates.length} of 3)
          </span>
          <h2 id="listings-section-heading" style={{ marginTop: '4px' }}>
            Second-Hand Candidates & Evidence Review
          </h2>
        </div>
      </div>

      {/* Candidate Switcher Bar (Wraps cleanly at 390px without horizontal scrolling) */}
      <div
        className="candidate-tabs-bar"
        role="tablist"
        aria-label="Candidate listings"
      >
        {candidates.map((cand, idx) => {
          const isActive = idx === activeCandidateIndex
          return (
            <button
              key={cand.id}
              type="button"
              role="tab"
              id={`tab-candidate-${idx}`}
              data-testid={`tab-candidate-${idx}`}
              aria-selected={isActive}
              className={`candidate-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelectCandidate(idx)}
            >
              {cand.name || `Candidate ${idx + 1}`}
            </button>
          )
        })}

        {candidates.length < 3 && (
          <button
            type="button"
            id="btn-add-candidate"
            data-testid="btn-add-candidate"
            className="btn btn-sm btn-accent"
            onClick={onAddCandidate}
          >
            + Add candidate ({candidates.length}/3)
          </button>
        )}

        {isExampleMode &&
          candidates.length === 1 &&
          onAddExampleCandidateB && (
            <button
              type="button"
              id="btn-add-example-b"
              data-testid="btn-add-example-b"
              className="btn btn-sm btn-primary"
              onClick={onAddExampleCandidateB}
            >
              + Add Example B (41.5 / 33.5 / 24 cm)
            </button>
          )}

        {candidates.length > 1 && (
          <button
            type="button"
            id="btn-remove-active-candidate"
            data-testid="btn-remove-active-candidate"
            className="btn btn-sm btn-danger"
            onClick={() => onRemoveCandidate(activeCandidateIndex)}
          >
            Remove {candidate.name || 'candidate'}
          </button>
        )}
      </div>

      {/* Candidate Metadata Row */}
      <div className="form-row-grid">
        <div className="field-group">
          <label className="field-label" htmlFor="cand-name-input">
            Candidate name
          </label>
          <input
            id="cand-name-input"
            data-testid="cand-name-input"
            type="text"
            className="text-input"
            placeholder="e.g. Candidate A (OrSlow 105 on Grailed)"
            value={candidate.name}
            onChange={(e) =>
              handleCandidateMetaChange({ name: e.target.value })
            }
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="cand-condition-select">
            Listing condition
          </label>
          <select
            id="cand-condition-select"
            data-testid="cand-condition-select"
            className="select-input"
            value={candidate.condition}
            onChange={(e) =>
              handleCandidateMetaChange({
                condition: e.target.value as GarmentCondition,
              })
            }
          >
            {(Object.keys(CONDITION_LABELS) as GarmentCondition[]).map(
              (cond) => (
                <option key={cond} value={cond}>
                  {CONDITION_LABELS[cond]}
                </option>
              )
            )}
          </select>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="cand-url-input">
            Optional listing URL (reference only, never scraped)
          </label>
          <input
            id="cand-url-input"
            data-testid="cand-url-input"
            type="url"
            className="text-input"
            placeholder="https://example.com/listing/12345"
            value={candidate.url ?? ''}
            onChange={(e) => handleCandidateMetaChange({ url: e.target.value })}
          />
        </div>
      </div>

      {/* Two Evidence Shortcuts: Paste Listing Text & Add a Screenshot */}
      <div className="shortcuts-grid">
        {/* Shortcut 1: Paste Listing Text */}
        <div className="shortcut-box">
          <h3>Shortcut 1: Paste listing text</h3>
          <p className="field-hint" style={{ marginBottom: '6px' }}>
            Paste seller notes. Tagged sizes (W32), prices (€95), and unlabelled
            numbers are ignored. Measurements require review before applying.
          </p>
          <textarea
            id="paste-listing-textarea"
            data-testid="paste-listing-textarea"
            className="textarea-input"
            rows={4}
            placeholder="e.g. Tagged W32 L32, asking €95, flat waist 42 cm, thigh (2.5 cm below crotch) 31 cm, leg opening 8 1/2 in."
            value={pastedText}
            onChange={(e) =>
              setPastedTextByCandidate((prev) => ({
                ...prev,
                [candId]: e.target.value,
              }))
            }
          />
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginTop: '8px',
            }}
          >
            <button
              type="button"
              id="btn-parse-listing-text"
              data-testid="btn-parse-listing-text"
              className="btn btn-primary btn-sm"
              disabled={!pastedText.trim()}
              onClick={() => handleParsePastedText()}
            >
              Review parsed measurements
            </button>
            <button
              type="button"
              data-testid="btn-preset-tag-price-hem"
              className="btn btn-sm"
              onClick={() => {
                setPastedTextByCandidate((prev) => ({
                  ...prev,
                  [candId]: FIXTURE_TAGGED_AND_PRICE_TEXT,
                }))
                handleParsePastedText(FIXTURE_TAGGED_AND_PRICE_TEXT)
              }}
            >
              Sample: W32 / €95 / hem 8 1/2 in
            </button>
            <button
              type="button"
              data-testid="btn-preset-circumference"
              className="btn btn-sm"
              onClick={() => {
                setPastedTextByCandidate((prev) => ({
                  ...prev,
                  [candId]: FIXTURE_EXPLICIT_CIRCUMFERENCE_TEXT,
                }))
                handleParsePastedText(FIXTURE_EXPLICIT_CIRCUMFERENCE_TEXT)
              }}
            >
              Sample: 84 cm circumference
            </button>
            <button
              type="button"
              data-testid="btn-preset-ambiguous-waist"
              className="btn btn-sm"
              onClick={() => {
                setPastedTextByCandidate((prev) => ({
                  ...prev,
                  [candId]: FIXTURE_AMBIGUOUS_WAIST_TEXT,
                }))
                handleParsePastedText(FIXTURE_AMBIGUOUS_WAIST_TEXT)
              }}
            >
              Sample: Ambiguous “waist 84”
            </button>
          </div>
        </div>

        {/* Shortcut 2: Add a Screenshot (On-demand Local OCR) */}
        <div className="shortcut-box">
          <h3>Shortcut 2: Add a screenshot (local OCR)</h3>
          <p className="field-hint" style={{ marginBottom: '6px' }}>
            Accepts PNG, JPEG, or WebP. Shows a local visual preview and runs
            browser-local English OCR on demand. Never saved to storage.
          </p>

          <label
            className="field-label"
            htmlFor="screenshot-file-input"
            style={{ marginBottom: '4px' }}
          >
            Choose screenshot image (PNG, JPEG, WebP)
          </label>
          <input
            ref={fileInputRef}
            id="screenshot-file-input"
            data-testid="screenshot-file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            onChange={(e) =>
              handleSelectScreenshotFile(e.target.files?.[0] ?? null)
            }
          />

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginTop: '8px',
            }}
          >
            <button
              type="button"
              id="btn-load-synthetic-legible-screenshot"
              data-testid="btn-load-synthetic-legible-screenshot"
              className="btn btn-sm"
              onClick={async () => {
                const file = await createSyntheticListingImageFile(
                  SYNTHETIC_OCR_LISTING_TEXT
                )
                handleSelectScreenshotFile(file)
              }}
            >
              Load legible test screenshot
            </button>
            <button
              type="button"
              id="btn-load-unreadable-screenshot"
              data-testid="btn-load-unreadable-screenshot"
              className="btn btn-sm"
              onClick={async () => {
                const file = await createUnreadableDenimPhotoFile()
                handleSelectScreenshotFile(file)
              }}
            >
              Load photo without text
            </button>
          </div>

          {fileError && (
            <div
              className="field-error-msg"
              data-testid="screenshot-file-error"
              role="alert"
            >
              {fileError}
            </div>
          )}

          {screenshotSession && (
            <div
              className="screenshot-preview-container"
              data-testid="screenshot-preview-container"
            >
              <img
                src={screenshotSession.previewUrl}
                alt={`Screenshot preview: ${screenshotSession.file.name}`}
                className="screenshot-preview-img"
                data-testid="screenshot-preview-img"
              />
              <p className="field-hint" style={{ marginBottom: '8px' }}>
                Visual reference: <strong>{screenshotSession.file.name}</strong>.
                You can type observed numbers directly into the fields below or
                run local OCR.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {!screenshotSession.ocrRunning ? (
                  <button
                    type="button"
                    id="btn-run-ocr"
                    data-testid="btn-run-ocr"
                    className="btn btn-primary btn-sm"
                    onClick={handleRunOcr}
                  >
                    Run local OCR
                  </button>
                ) : (
                  <button
                    type="button"
                    id="btn-cancel-ocr"
                    data-testid="btn-cancel-ocr"
                    className="btn btn-danger btn-sm"
                    onClick={handleCancelOcr}
                  >
                    Cancel OCR
                  </button>
                )}

                <button
                  type="button"
                  id="btn-dismiss-screenshot"
                  data-testid="btn-dismiss-screenshot"
                  className="btn btn-sm"
                  onClick={handleDismissScreenshot}
                >
                  Dismiss screenshot
                </button>
              </div>

              {screenshotSession.ocrProgress && (
                <p
                  className="field-hint"
                  data-testid="ocr-progress-status"
                  style={{ marginTop: '6px', fontWeight: 600 }}
                >
                  {screenshotSession.ocrProgress}
                </p>
              )}

              {screenshotSession.ocrError && (
                <div
                  className="field-error-msg"
                  data-testid="ocr-error-alert"
                  role="alert"
                  style={{ marginTop: '6px' }}
                >
                  {screenshotSession.ocrError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Staged Import Review Form */}
      {reviewSession && (
        <div
          className="review-panel"
          data-testid="import-review-form"
          role="region"
          aria-label="Review proposed listing measurements"
        >
          <div className="review-panel-header">
            <h3>
              Review Proposed Measurements (
              {reviewSession.sourceType === 'ocr'
                ? 'From Screenshot OCR'
                : 'From Pasted Text'}
              )
            </h3>
            <span className="status-badge badge-warn">
              Requires confirmation before saving
            </span>
          </div>

          {reviewSession.hasMixedUnitsAcrossListing && (
            <div
              className="field-error-msg"
              style={{
                background: 'var(--status-warn-bg)',
                borderColor: 'var(--status-warn-border)',
                color: 'var(--status-warn-text)',
                marginBottom: '10px',
              }}
            >
              Note: This listing mixes centimetres and inches across lines. Verify
              each unit below before applying.
            </div>
          )}

          {reviewSession.proposals.length === 0 ? (
            <p className="field-hint">
              No explicitly labelled garment dimensions were detected. Tagged
              sizes, prices, and unlabelled numbers were ignored.
            </p>
          ) : (
            <div className="review-proposal-list">
              {reviewSession.proposals.map((prop) => {
                const spec = DIMENSION_SPECS[prop.dimension]
                const isProtected = reviewSession.protectedDimensions.has(
                  prop.dimension
                )
                const resolvedPreview = resolveProposalToMeasurement(prop)

                return (
                  <div
                    key={prop.id}
                    className="review-proposal-item"
                    data-testid={`review-proposal-${prop.dimension}-${prop.id}`}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          data-testid={`review-checkbox-${prop.dimension}`}
                          checked={prop.selectedForImport}
                          onChange={(e) => {
                            if (prop.hasDuplicateDimension) {
                              selectDuplicateProposal(
                                prop.dimension,
                                prop.id,
                                e.target.checked
                              )
                            } else {
                              updateReviewProposal(prop.id, (p) => ({
                                ...p,
                                selectedForImport: e.target.checked,
                              }))
                            }
                          }}
                        />
                        <span>{spec.label}</span>
                      </label>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {isProtected && (
                          <span
                            className="status-badge badge-warn"
                            data-testid={`review-protected-badge-${prop.dimension}`}
                          >
                            Manual edit protected (check to override)
                          </span>
                        )}
                        {prop.hasDuplicateDimension && (
                          <span className="status-badge badge-warn">
                            Multiple values found for {spec.shortLabel} — pick one
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      className="review-source-line"
                      data-testid={`review-source-${prop.dimension}`}
                    >
                      Source line: “{prop.sourceLine}”
                    </div>

                    <div className="review-controls-row">
                      {/* Range or multiple numbers selector */}
                      {prop.isRange && prop.valueOptions && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span className="field-hint">
                            Range detected — choose value:
                          </span>
                          {prop.valueOptions.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              className={`btn btn-sm ${prop.rawNumber === opt ? 'btn-primary' : ''}`}
                              onClick={() =>
                                updateReviewProposal(prop.id, (p) => ({
                                  ...p,
                                  rawNumber: opt,
                                }))
                              }
                            >
                              Use {opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Conflicting units selector */}
                      {prop.hasConflictingUnits &&
                        prop.conflictingUnitOptions && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span className="field-hint">
                              Conflicting units — choose:
                            </span>
                            {prop.conflictingUnitOptions.map((opt) => (
                              <button
                                key={opt.label}
                                type="button"
                                className={`btn btn-sm ${
                                  prop.rawNumber === opt.rawNumber &&
                                  prop.selectedUnit === opt.unit
                                    ? 'btn-primary'
                                    : ''
                                }`}
                                onClick={() =>
                                  updateReviewProposal(prop.id, (p) => ({
                                    ...p,
                                    rawNumber: opt.rawNumber,
                                    selectedUnit: opt.unit,
                                    needsUnitConfirmation: false,
                                  }))
                                }
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}

                      {/* Value input */}
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                        }}
                      >
                        <span>Value:</span>
                        <input
                          type="text"
                          data-testid={`review-value-input-${prop.dimension}`}
                          className="text-input"
                          style={{ width: '92px', padding: '4px 8px' }}
                          value={prop.rawNumber}
                          onChange={(e) =>
                            updateReviewProposal(prop.id, (p) => ({
                              ...p,
                              rawNumber: e.target.value,
                            }))
                          }
                        />
                      </label>

                      {/* Unit selector (highlighted if bare number needs unit confirmation) */}
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                        }}
                      >
                        <span>Unit:</span>
                        <select
                          data-testid={`review-unit-select-${prop.dimension}`}
                          className="select-input"
                          style={{ width: 'auto', padding: '4px 8px' }}
                          value={prop.selectedUnit ?? ''}
                          onChange={(e) => {
                            const val = e.target.value as Unit | ''
                            updateReviewProposal(prop.id, (p) => ({
                              ...p,
                              selectedUnit: val === '' ? null : val,
                            }))
                          }}
                        >
                          <option value="">Confirm unit…</option>
                          <option value="cm">cm</option>
                          <option value="in">in (inches)</option>
                        </select>
                      </label>

                      {/* Waist convention selector when waist is ambiguous or circumference */}
                      {prop.dimension === 'waist' && (
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                          }}
                        >
                          <span>Waist convention:</span>
                          <select
                            data-testid="review-waist-convention-select"
                            className="select-input"
                            style={{ width: 'auto', padding: '4px 8px' }}
                            value={prop.waistConvention}
                            onChange={(e) => {
                              const choice = e.target
                                .value as WaistConventionChoice
                              updateReviewProposal(prop.id, (p) => ({
                                ...p,
                                waistConvention: choice,
                                convention:
                                  choice === 'circumference'
                                    ? 'circumference_halved'
                                    : choice === 'flat'
                                      ? 'standard'
                                      : 'unknown',
                              }))
                            }}
                          >
                            <option value="unconfirmed">
                              Confirm waist convention…
                            </option>
                            <option value="flat">
                              Flat waist (laid flat, use as-is)
                            </option>
                            <option value="circumference">
                              Waistband circumference (halve to flat width)
                            </option>
                          </select>
                        </label>
                      )}

                      {/* Measuring method status selector */}
                      {prop.dimension !== 'waist' && (
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                          }}
                        >
                          <span>Method match:</span>
                          <select
                            data-testid={`review-method-select-${prop.dimension}`}
                            className="select-input"
                            style={{ width: 'auto', padding: '4px 8px' }}
                            value={prop.convention}
                            onChange={(e) =>
                              updateReviewProposal(prop.id, (p) => ({
                                ...p,
                                convention: e.target
                                  .value as MeasurementConvention,
                              }))
                            }
                          >
                            <option value="standard">
                              Methods match our guide
                            </option>
                            <option value="unknown">
                              I don’t know (indicative delta only)
                            </option>
                            <option value="incompatible">
                              Incompatible method (e.g. thigh at crotch)
                            </option>
                          </select>
                        </label>
                      )}
                    </div>

                    {/* Preview or resolution prompt */}
                    <div style={{ marginTop: '6px' }}>
                      {resolvedPreview.ok ? (
                        <span
                          className="status-badge badge-ok"
                          data-testid={`review-resolved-preview-${prop.dimension}`}
                        >
                          Proposed:{' '}
                          {roundToOneDecimal(resolvedPreview.measurement.cm)} cm
                          {Math.abs(
                            resolvedPreview.measurement.cm -
                              roundToOneDecimal(resolvedPreview.measurement.cm)
                          ) > 0.001
                            ? ` (canonical ${Number(resolvedPreview.measurement.cm.toFixed(2))} cm)`
                            : ''}
                          {resolvedPreview.measurement.conversionNote
                            ? ` • ${resolvedPreview.measurement.conversionNote}`
                            : ''}
                        </span>
                      ) : (
                        <span
                          className="status-badge badge-warn"
                          data-testid={`review-unresolved-warning-${prop.dimension}`}
                        >
                          Action needed: {resolvedPreview.error}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {reviewSession.ignoredItems.length > 0 && (
            <div
              className="field-hint"
              data-testid="review-ignored-items"
              style={{ marginBottom: '10px' }}
            >
              <strong>Ignored non-measurement items:</strong>{' '}
              {reviewSession.ignoredItems
                .map((item) => `“${item.sourceLine}” (${item.reason})`)
                .join(' • ')}
            </div>
          )}

          {reviewSession.reviewError && (
            <div
              className="field-error-msg"
              data-testid="review-apply-error"
              role="alert"
              style={{ marginBottom: '10px' }}
            >
              {reviewSession.reviewError}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              id="btn-apply-review"
              data-testid="btn-apply-review"
              className="btn btn-primary"
              onClick={handleApplyReviewedMeasurements}
            >
              Confirm & apply selected measurements
            </button>
            <button
              type="button"
              id="btn-dismiss-review"
              data-testid="btn-dismiss-review"
              className="btn"
              onClick={handleDismissReview}
            >
              Dismiss review
            </button>
          </div>
        </div>
      )}

      <HowToMeasureGuide
        defaultOpen={false}
        audienceLabel="Seller measuring guide (check whether listing methods match)"
      />

      {/* Manual 6 Garment Measurements Grid for Active Candidate */}
      <div className="measurements-grid">
        {DIMENSION_ORDER.map((dim) => {
          const spec = DIMENSION_SPECS[dim]
          const stored = candidate.measurements[dim]
          const draft = drafts[dim]
          const errorMsg =
            draft && draft.unit === displayUnit ? draft.error : undefined
          const inputId = `cand-input-${dim}`

          return (
            <div
              key={dim}
              className={`measurement-card ${spec.isPriority ? 'priority-field' : ''}`}
            >
              <label className="field-label" htmlFor={inputId}>
                <span>{spec.label}</span>
                {spec.isPriority && (
                  <span className="priority-pill">Priority 3-field</span>
                )}
              </label>

              <p className="field-hint">{spec.howToMeasure}</p>

              <div className="input-with-unit">
                <input
                  id={inputId}
                  data-testid={`cand-input-${dim}`}
                  type="text"
                  inputMode="decimal"
                  className={`text-input ${errorMsg ? 'has-error' : ''}`}
                  placeholder={
                    displayUnit === 'cm'
                      ? 'e.g. 42 or 31,5'
                      : 'e.g. 16.5 or 8 1/2'
                  }
                  value={getInputValue(dim)}
                  onChange={(e) =>
                    applyManualDimensionInput(dim, e.target.value)
                  }
                  aria-invalid={Boolean(errorMsg)}
                />
                <span
                  className="input-unit-badge"
                  data-testid={`cand-unit-${dim}`}
                  aria-label={`Unit: ${displayUnit}`}
                >
                  {displayUnit}
                </span>
              </div>

              {/* Method status selector for this dimension */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  marginTop: '4px',
                }}
              >
                <label
                  htmlFor={`cand-method-${dim}`}
                  className="field-hint"
                  style={{ fontWeight: 600 }}
                >
                  Measuring method convention:
                </label>
                <select
                  id={`cand-method-${dim}`}
                  data-testid={`cand-method-${dim}`}
                  className="select-input"
                  style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                  value={stored?.convention ?? 'standard'}
                  onChange={(e) =>
                    handleMethodConventionChange(
                      dim,
                      e.target.value as MeasurementConvention
                    )
                  }
                >
                  <option value="standard">Methods match our guide</option>
                  {dim === 'waist' && (
                    <option value="circumference_halved">
                      Halved from waistband circumference
                    </option>
                  )}
                  <option value="unknown">
                    I don’t know (indicative delta, excluded from ranking)
                  </option>
                  <option value="incompatible">
                    {dim === 'thigh'
                      ? 'Measured at crotch (incompatible)'
                      : 'Incompatible measuring method'}
                  </option>
                </select>
              </div>

              {errorMsg && (
                <div
                  data-testid={`cand-error-${dim}`}
                  className="field-error-msg"
                  role="alert"
                >
                  {errorMsg}
                </div>
              )}

              {!errorMsg && stored?.conversionNote && (
                <div
                  data-testid={`cand-conversion-note-${dim}`}
                  className="field-conversion-note"
                >
                  {stored.conversionNote}
                </div>
              )}

              {!errorMsg && stored && (
                <div
                  className="field-hint"
                  data-testid={`cand-stored-summary-${dim}`}
                >
                  Stored:{' '}
                  <strong>{formatStoredMeasurement(stored, displayUnit)}</strong>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="step-footer-nav">
        <button
          type="button"
          id="btn-listings-to-ref"
          data-testid="btn-listings-to-ref"
          className="btn"
          onClick={onBackStep}
        >
          ← Back: Reference pair
        </button>
        <button
          type="button"
          id="btn-listings-to-results"
          data-testid="btn-listings-to-results"
          className="btn btn-primary"
          onClick={onNextStep}
        >
          Next: View fit explanation & seller questions →
        </button>
      </div>
    </section>
  )
}
