import { useState } from 'react'
import {
  CONDITION_LABELS,
  DIMENSION_ORDER,
  DIMENSION_SPECS,
  type DimensionKey,
  type GarmentCondition,
  type ReferencePair,
  type StoredMeasurement,
  type Unit,
} from '../domain/types'
import {
  formatStoredMeasurement,
  getDisplayInputString,
  parseMeasurementInput,
} from '../domain/units'
import { HowToMeasureGuide } from './HowToMeasureGuide'

interface ReferencePairSectionProps {
  reference: ReferencePair
  displayUnit: Unit
  onUpdateReference: (next: ReferencePair) => void
  onNextStep: () => void
}

interface FieldDraft {
  text: string
  unit: Unit
  error?: string
}

export function ReferencePairSection({
  reference,
  displayUnit,
  onUpdateReference,
  onNextStep,
}: ReferencePairSectionProps) {
  const [drafts, setDrafts] = useState<Partial<Record<DimensionKey, FieldDraft>>>({})
  const [halveWaistCircumference, setHalveWaistCircumference] = useState<boolean>(
    reference.measurements.waist?.convention === 'circumference_halved'
  )

  const handleNameChange = (name: string) => {
    onUpdateReference({
      ...reference,
      name,
    })
  }

  const handleConditionChange = (condition: GarmentCondition) => {
    onUpdateReference({
      ...reference,
      condition,
    })
  }

  const applyDimensionInput = (
    dim: DimensionKey,
    rawText: string,
    halveOverride?: boolean
  ) => {
    const shouldHalve =
      dim === 'waist' ? (halveOverride ?? halveWaistCircumference) : false
    const parsed = parseMeasurementInput(rawText, displayUnit, {
      halveCircumference: shouldHalve,
    })

    if (parsed.kind === 'blank') {
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[dim]
        return next
      })
      const nextMeasurements = { ...reference.measurements }
      delete nextMeasurements[dim]
      onUpdateReference({
        ...reference,
        measurements: nextMeasurements,
      })
      return
    }

    if (parsed.kind === 'error') {
      setDrafts((prev) => ({
        ...prev,
        [dim]: {
          text: rawText,
          unit: displayUnit,
          error: parsed.error,
        },
      }))
      return
    }

    // Valid measurement
    setDrafts((prev) => ({
      ...prev,
      [dim]: {
        text: rawText,
        unit: displayUnit,
        error: undefined,
      },
    }))

    const stored: StoredMeasurement = {
      cm: parsed.cm,
      rawInput: parsed.rawInput,
      enteredUnit: parsed.enteredUnit,
      convention: parsed.convention,
      conversionNote: parsed.conversionNote,
      confirmed: true,
    }

    onUpdateReference({
      ...reference,
      measurements: {
        ...reference.measurements,
        [dim]: stored,
      },
    })
  }

  const handleToggleHalveWaist = (checked: boolean) => {
    setHalveWaistCircumference(checked)
    const currentWaist = reference.measurements.waist
    const currentDraft = drafts.waist
    const rawToReapply =
      currentDraft && currentDraft.unit === displayUnit
        ? currentDraft.text
        : currentWaist
          ? currentWaist.rawInput
          : ''
    if (rawToReapply.trim() !== '') {
      applyDimensionInput('waist', rawToReapply, checked)
    }
  }

  const getInputValue = (dim: DimensionKey): string => {
    const draft = drafts[dim]
    if (draft && draft.unit === displayUnit) {
      if (draft.error) {
        return draft.text
      }
      // If user is actively typing a decimal or fraction like "41." or "8 ", preserve their keystrokes
      const stored = reference.measurements[dim]
      if (stored && stored.enteredUnit === displayUnit && stored.convention !== 'circumference_halved') {
        return draft.text
      }
      if (stored && stored.convention === 'circumference_halved') {
        return draft.text
      }
    }
    return getDisplayInputString(reference.measurements[dim], displayUnit)
  }

  return (
    <section
      className="section-card"
      aria-labelledby="ref-section-heading"
      data-testid="reference-pair-section"
    >
      <div className="section-header">
        <div>
          <span className="section-step-tag">Step 1 of 3 • Reference Pair</span>
          <h2 id="ref-section-heading" style={{ marginTop: '4px' }}>
            Your Favourite Jeans (Reference Pair)
          </h2>
        </div>
      </div>

      <div className="form-row-grid">
        <div className="field-group">
          <label className="field-label" htmlFor="ref-pair-name">
            Reference pair name
          </label>
          <input
            id="ref-pair-name"
            data-testid="ref-pair-name-input"
            type="text"
            className="text-input"
            placeholder="e.g. Warehouse 1001XX (Worn 2 years)"
            value={reference.name}
            onChange={(e) => handleNameChange(e.target.value)}
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="ref-pair-condition">
            Reference garment condition
          </label>
          <select
            id="ref-pair-condition"
            data-testid="ref-pair-condition-select"
            className="select-input"
            value={reference.condition}
            onChange={(e) =>
              handleConditionChange(e.target.value as GarmentCondition)
            }
          >
            {(Object.keys(CONDITION_LABELS) as GarmentCondition[]).map((cond) => (
              <option key={cond} value={cond}>
                {CONDITION_LABELS[cond]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <HowToMeasureGuide
        defaultOpen={false}
        audienceLabel="How to measure your reference pair (click to view all 6 methods)"
      />

      <div className="measurements-grid">
        {DIMENSION_ORDER.map((dim) => {
          const spec = DIMENSION_SPECS[dim]
          const stored = reference.measurements[dim]
          const draft = drafts[dim]
          const errorMsg =
            draft && draft.unit === displayUnit ? draft.error : undefined
          const inputId = `ref-input-${dim}`

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
                  data-testid={`ref-input-${dim}`}
                  type="text"
                  inputMode="decimal"
                  className={`text-input ${errorMsg ? 'has-error' : ''}`}
                  placeholder={
                    displayUnit === 'cm'
                      ? 'e.g. 42 or 41,5'
                      : 'e.g. 16.5 or 12 1/2'
                  }
                  value={getInputValue(dim)}
                  onChange={(e) => applyDimensionInput(dim, e.target.value)}
                  aria-invalid={Boolean(errorMsg)}
                  aria-describedby={
                    errorMsg ? `ref-error-${dim}` : undefined
                  }
                />
                <span
                  className="input-unit-badge"
                  data-testid={`ref-unit-${dim}`}
                  aria-label={`Unit: ${displayUnit}`}
                >
                  {displayUnit}
                </span>
              </div>

              {dim === 'waist' && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.78rem',
                    color: 'var(--ink-secondary)',
                    marginTop: '2px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    id="ref-waist-halve-circumference"
                    data-testid="ref-waist-halve-checkbox"
                    type="checkbox"
                    checked={halveWaistCircumference}
                    onChange={(e) => handleToggleHalveWaist(e.target.checked)}
                  />
                  <span>
                    Entered as explicit waistband circumference (halve to flat width)
                  </span>
                </label>
              )}

              {errorMsg && (
                <div
                  id={`ref-error-${dim}`}
                  data-testid={`ref-error-${dim}`}
                  className="field-error-msg"
                  role="alert"
                >
                  {errorMsg}
                </div>
              )}

              {!errorMsg && stored?.conversionNote && (
                <div
                  data-testid={`ref-conversion-note-${dim}`}
                  className="field-conversion-note"
                >
                  {stored.conversionNote}
                </div>
              )}

              {!errorMsg && stored && (
                <div
                  className="field-hint"
                  data-testid={`ref-stored-summary-${dim}`}
                >
                  Stored: <strong>{formatStoredMeasurement(stored, displayUnit)}</strong>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="step-footer-nav">
        <span className="field-hint">
          Confirmed reference measurements save automatically on this device.
        </span>
        <button
          type="button"
          id="btn-ref-to-listings"
          data-testid="btn-ref-to-listings"
          className="btn btn-primary"
          onClick={onNextStep}
        >
          Next: Candidate listings →
        </button>
      </div>
    </section>
  )
}
