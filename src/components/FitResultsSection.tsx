import { useRef, useState } from 'react'
import {
  compareCandidate,
  rankCandidates,
  type CandidateComparisonResult,
  type DimensionComparisonRow,
} from '../domain/comparison'
import {
  SIMILAR_MEASUREMENT_THRESHOLD_CM,
  type CandidateListing,
  type ReferencePair,
  type Unit,
} from '../domain/types'
import { formatStoredMeasurement } from '../domain/units'

interface FitResultsSectionProps {
  reference: ReferencePair
  candidates: CandidateListing[]
  activeCandidateIndex: number
  displayUnit: Unit
  onSelectCandidate: (index: number) => void
  onBackToListings: () => void
  onStartNewComparisonKeepRef: () => void
}

function getRowStatusBadge(row: DimensionComparisonRow) {
  if (row.status === 'confirmed_comparable') {
    if (row.isSimilar) {
      return (
        <span className="status-badge badge-ok">
          Similar (≤ {SIMILAR_MEASUREMENT_THRESHOLD_CM} cm)
        </span>
      )
    }
    return <span className="status-badge badge-diff">Confirmed difference</span>
  }
  if (row.status === 'indicative_unknown_method') {
    return (
      <span className="status-badge badge-warn">
        Indicative only (method unknown)
      </span>
    )
  }
  if (row.status === 'incompatible_method') {
    return (
      <span className="status-badge badge-err">
        Incompatible measuring method
      </span>
    )
  }
  if (row.status === 'missing_candidate') {
    return <span className="status-badge badge-warn">Missing on listing</span>
  }
  if (row.status === 'missing_reference') {
    return <span className="status-badge badge-warn">Missing on reference</span>
  }
  return <span className="status-badge">Not entered</span>
}

interface SellerQuestionCardProps {
  comparison: CandidateComparisonResult
}

function SellerQuestionCard({ comparison }: SellerQuestionCardProps) {
  const [copyStatus, setCopyStatus] = useState<string>('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(comparison.sellerQuestion)
        setCopyStatus('Copied seller question to clipboard.')
        return
      }
      throw new Error('Clipboard API unavailable')
    } catch {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.select()
      }
      setCopyStatus(
        'Clipboard access unavailable — text selected below so you can copy manually.'
      )
    }
  }

  return (
    <div
      className="seller-question-box"
      data-testid={`seller-question-box-${comparison.candidateId}`}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '6px',
        }}
      >
        <h4>
          What to ask the seller ({comparison.candidateName || 'Listing'})
        </h4>
        <button
          type="button"
          data-testid={`btn-copy-seller-question-${comparison.candidateId}`}
          className="btn btn-sm btn-primary"
          onClick={handleCopy}
        >
          Copy seller question
        </button>
      </div>
      <textarea
        ref={textareaRef}
        readOnly
        rows={3}
        data-testid={`seller-question-textarea-${comparison.candidateId}`}
        aria-label={`Copyable seller question for ${comparison.candidateName}`}
        className="textarea-input"
        style={{ fontSize: '0.84rem', fontFamily: 'var(--font-mono)' }}
        value={comparison.sellerQuestion}
        onFocus={(e) => e.currentTarget.select()}
      />
      {copyStatus && (
        <p
          className="field-hint"
          data-testid={`copy-status-${comparison.candidateId}`}
          style={{ marginTop: '4px', fontWeight: 600, color: 'var(--indigo-primary)' }}
        >
          {copyStatus}
        </p>
      )}
    </div>
  )
}

export function FitResultsSection({
  reference,
  candidates,
  activeCandidateIndex,
  displayUnit,
  onSelectCandidate,
  onBackToListings,
  onStartNewComparisonKeepRef,
}: FitResultsSectionProps) {
  const comparisons = candidates.map((cand) =>
    compareCandidate(reference, cand, displayUnit)
  )
  const ranking = rankCandidates(reference, candidates, displayUnit)

  return (
    <section
      className="section-card"
      aria-labelledby="results-section-heading"
      data-testid="fit-results-section"
    >
      <div className="section-header">
        <div>
          <span className="section-step-tag">
            Step 3 of 3 • Fit Explanation & Seller Questions
          </span>
          <h2 id="results-section-heading" style={{ marginTop: '4px' }}>
            Where Each Listing Differs & What to Ask
          </h2>
        </div>
        <button
          type="button"
          id="btn-results-new-comparison"
          data-testid="btn-results-new-comparison"
          className="btn btn-sm"
          onClick={onStartNewComparisonKeepRef}
        >
          New comparison (keep reference)
        </button>
      </div>

      {/* Multi-Candidate Ranking Banner (Only offered when >= 2 candidates and full 3-field coverage) */}
      {candidates.length >= 2 && ranking.isEligible && (
        <div
          className="ranking-banner"
          data-testid="closest-measurements-panel"
          role="region"
          aria-label="Closest measurements ranking"
        >
          <p className="ranking-headline" data-testid="ranking-headline">
            {ranking.headline}
          </p>
          <p className="field-hint" style={{ margin: '0 0 8px', color: 'var(--ink-primary)' }}>
            <strong>Basis:</strong> {ranking.basisLabel}
          </p>

          <div className="ranking-cards-grid">
            {ranking.entries.map((entry) => (
              <div
                key={entry.candidateId}
                className={`ranking-entry-card ${entry.isClosest ? 'closest-winner' : ''}`}
                data-testid={`ranking-card-${entry.candidateId}`}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    marginBottom: '6px',
                  }}
                >
                  <strong>{entry.candidateName}</strong>
                  {entry.isClosest ? (
                    <span className="status-badge badge-ok">
                      {entry.isTiedForClosest
                        ? 'Joint closest (tie)'
                        : 'Closest on 3 stated fields'}
                    </span>
                  ) : (
                    <span className="status-badge">Rank #{entry.rank}</span>
                  )}
                </div>

                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.82rem',
                    marginBottom: '6px',
                  }}
                >
                  <div>
                    Three-field total:{' '}
                    <strong data-testid={`ranking-total-${entry.candidateId}`}>
                      {entry.score.totalAbsDeltaCm} cm
                    </strong>
                  </div>
                  <div className="field-hint" style={{ marginTop: '2px' }}>
                    Components (counted equally): Flat waist |Δ|{' '}
                    {entry.score.waistAbsDeltaCm} cm + Thigh |Δ|{' '}
                    {entry.score.thighAbsDeltaCm} cm + Hem |Δ|{' '}
                    {entry.score.hemAbsDeltaCm} cm
                  </div>
                </div>

                <div
                  className="field-hint"
                  style={{
                    borderTop: '1px solid var(--bg-subtle)',
                    paddingTop: '6px',
                  }}
                >
                  <strong>Front rise, Knee & Inseam (shown separately):</strong>{' '}
                  {entry.secondaryRows
                    .map(
                      (r) =>
                        `${r.shortLabel}: ${
                          r.status === 'confirmed_comparable'
                            ? r.signedDeltaText
                            : 'not comparable'
                        }`
                    )
                    .join(' • ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ineligible Multi-Candidate Explanation when a priority measurement is missing or incompatible */}
      {candidates.length >= 2 && !ranking.isEligible && (
        <div
          className="ranking-banner ineligible"
          data-testid="ranking-unavailable-panel"
          role="region"
          aria-label="Closest measurements ranking unavailable"
        >
          <p className="ranking-headline">
            Closest measurements ranking unavailable — missing comparable priority
            field
          </p>
          <p className="field-hint" style={{ margin: '0 0 6px', color: 'var(--ink-primary)' }}>
            {ranking.ineligibleReason}
          </p>
          <ul
            style={{
              margin: '0',
              paddingLeft: '18px',
              fontSize: '0.84rem',
              color: 'var(--status-warn-text)',
              fontWeight: 600,
            }}
          >
            {ranking.missingDetails.map((detail, i) => (
              <li key={i}>{detail}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Candidate Switcher Bar in Results */}
      {candidates.length > 1 && (
        <div
          className="candidate-tabs-bar"
          role="tablist"
          aria-label="Switch candidate result view"
        >
          {candidates.map((cand, idx) => (
            <button
              key={cand.id}
              type="button"
              role="tab"
              aria-selected={idx === activeCandidateIndex}
              data-testid={`results-tab-candidate-${idx}`}
              className={`candidate-tab-btn ${idx === activeCandidateIndex ? 'active' : ''}`}
              onClick={() => onSelectCandidate(idx)}
            >
              {cand.name || `Candidate ${idx + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Per-Candidate Detailed Comparison Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {comparisons.map((comp, idx) => {
          const cand = candidates[idx]
          const isActive = idx === activeCandidateIndex

          return (
            <article
              key={comp.candidateId}
              data-testid={`candidate-result-card-${comp.candidateId}`}
              style={{
                border: isActive
                  ? '2px solid var(--indigo-primary)'
                  : '1px solid var(--border-stone)',
                borderRadius: 'var(--radius-md)',
                padding: '14px',
                background: '#ffffff',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  marginBottom: '10px',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                    {comp.candidateName || `Candidate ${idx + 1}`}{' '}
                    <span
                      style={{
                        fontWeight: 400,
                        fontSize: '0.88rem',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      vs {reference.name || 'Your Reference Pair'}
                    </span>
                  </h3>
                  {cand?.url && (
                    <a
                      href={cand.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="field-hint"
                      style={{ color: 'var(--indigo-primary)' }}
                    >
                      Reference listing link ↗
                    </a>
                  )}
                </div>

                {comp.threeFieldScore ? (
                  <div
                    className="status-badge badge-ok"
                    style={{ fontSize: '0.86rem', padding: '5px 10px' }}
                    data-testid={`three-field-total-${comp.candidateId}`}
                  >
                    Three-field total: {comp.threeFieldScore.totalAbsDeltaCm} cm
                    <span
                      style={{
                        fontWeight: 400,
                        fontSize: '0.76rem',
                        marginLeft: '6px',
                      }}
                    >
                      (Waist {comp.threeFieldScore.waistAbsDeltaCm} + Thigh{' '}
                      {comp.threeFieldScore.thighAbsDeltaCm} + Hem{' '}
                      {comp.threeFieldScore.hemAbsDeltaCm} cm)
                    </span>
                  </div>
                ) : (
                  <span
                    className="status-badge badge-warn"
                    data-testid={`three-field-incomplete-${comp.candidateId}`}
                  >
                    Three-field total requires confirmed Flat waist, Thigh & Hem
                  </span>
                )}
              </div>

              {/* Lead One-Sentence Summary */}
              <div
                className="lead-summary-box"
                data-testid={`lead-summary-${comp.candidateId}`}
              >
                <p className="lead-summary-text">{comp.leadSummary}</p>
              </div>

              {/* Condition Note when condition differs */}
              {comp.conditionNote && (
                <div
                  className="field-error-msg"
                  data-testid={`condition-note-${comp.candidateId}`}
                  style={{
                    background: 'var(--status-warn-bg)',
                    borderColor: 'var(--status-warn-border)',
                    color: 'var(--status-warn-text)',
                    marginBottom: '12px',
                  }}
                >
                  {comp.conditionNote}
                </div>
              )}

              {/* Dimension-by-Dimension Comparison Rows */}
              <div className="comparison-rows-list">
                {comp.rows.map((row) => (
                  <div
                    key={row.dimension}
                    data-testid={`comp-row-${comp.candidateId}-${row.dimension}`}
                    className={`comparison-row-card status-${row.status} ${
                      row.isSimilar ? 'is-similar' : 'is-different'
                    }`}
                  >
                    <div className="comp-row-top">
                      <span className="comp-dim-title">
                        {row.label}{' '}
                        {row.isPriority && (
                          <span className="priority-pill">3-field rank</span>
                        )}
                      </span>
                      {getRowStatusBadge(row)}
                    </div>

                    <div className="comp-values-strip">
                      <span>
                        Reference:{' '}
                        <strong>
                          {formatStoredMeasurement(
                            row.referenceMeasurement,
                            displayUnit
                          )}
                        </strong>
                      </span>
                      <span>
                        Listing:{' '}
                        <strong>
                          {formatStoredMeasurement(
                            row.candidateMeasurement,
                            displayUnit
                          )}
                        </strong>
                      </span>
                      <span>
                        Delta: <strong>{row.signedDeltaText}</strong>
                      </span>
                    </div>

                    <p
                      className="comp-explanation"
                      data-testid={`comp-explanation-${comp.candidateId}-${row.dimension}`}
                    >
                      {row.explanationText}
                    </p>

                    {row.roundedDeltaCm !== undefined &&
                      row.status !== 'incompatible_method' && (
                        <div
                          aria-hidden="true"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            margin: '5px 0',
                          }}
                        >
                          <div
                            style={{
                              position: 'relative',
                              flex: 1,
                              maxWidth: '220px',
                              height: '6px',
                              background: 'var(--bg-subtle)',
                              borderRadius: '99px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                position: 'absolute',
                                left: '50%',
                                top: 0,
                                bottom: 0,
                                width: '1px',
                                background: 'var(--border-strong)',
                              }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left:
                                  row.roundedDeltaCm < 0
                                    ? `${Math.max(0, 50 - Math.min(50, (Math.abs(row.roundedDeltaCm) / 6) * 50))}%`
                                    : '50%',
                                width: `${Math.min(50, (Math.abs(row.roundedDeltaCm) / 6) * 50)}%`,
                                background: row.isSimilar
                                  ? 'var(--status-ok-text)'
                                  : row.roundedDeltaCm < 0
                                    ? 'var(--selvedge-red)'
                                    : 'var(--indigo-primary)',
                                borderRadius: '99px',
                                transition: 'all 0.2s ease',
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--ink-muted)',
                            }}
                          >
                            {row.isSimilar
                              ? '≈ Match'
                              : row.roundedDeltaCm < 0
                                ? '← Tighter / shorter'
                                : 'Roomier / longer →'}
                          </span>
                        </div>
                      )}

                    <p
                      className="comp-method-status"
                      data-testid={`comp-method-${comp.candidateId}-${row.dimension}`}
                    >
                      Method status: {row.methodStatusLabel}
                    </p>
                  </div>
                ))}
              </div>

              {/* Adjustable Assumption & General Fabric Note */}
              <p className="field-hint" style={{ margin: '8px 0' }}>
                <strong>Display assumption:</strong> Absolute delta up to and
                including {SIMILAR_MEASUREMENT_THRESHOLD_CM} cm reads “similar
                measurement” (actual delta always shown). {comp.generalFitNote}
              </p>

              {/* Copyable Seller Question */}
              <SellerQuestionCard comparison={comp} />
            </article>
          )
        })}
      </div>

      <div className="step-footer-nav">
        <button
          type="button"
          id="btn-results-to-listings"
          data-testid="btn-results-to-listings"
          className="btn"
          onClick={onBackToListings}
        >
          ← Back: Edit candidate listings
        </button>
      </div>
    </section>
  )
}
