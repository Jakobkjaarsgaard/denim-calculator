interface SampleResultPreviewProps {
  isExampleMode: boolean
  onCompareMyJeans: () => void
  onTryExample: () => void
}

export function SampleResultPreview({
  isExampleMode,
  onCompareMyJeans,
  onTryExample,
}: SampleResultPreviewProps) {
  return (
    <section
      className="sample-preview-card"
      aria-label="Sample comparison result for first-time visitors"
      data-testid="home-sample-result"
    >
      <div className="sample-preview-header">
        <h2 className="sample-preview-title">
          Sample Verdict: Listing A vs 42 / 34 / 24 cm Reference
        </h2>
        <div className="mode-primary-actions">
          <button
            type="button"
            id="btn-home-compare-my-jeans"
            data-testid="btn-compare-my-jeans"
            className={`btn btn-sm ${!isExampleMode ? 'btn-primary' : ''}`}
            onClick={onCompareMyJeans}
          >
            Compare my jeans
          </button>
          <button
            type="button"
            id="btn-home-try-example"
            data-testid="btn-try-example"
            className={`btn btn-sm ${isExampleMode ? 'btn-primary' : 'btn-accent'}`}
            onClick={onTryExample}
          >
            Try an example
          </button>
        </div>
      </div>

      <p className="field-hint">
        Tagged <code style={{ fontFamily: 'var(--font-mono)' }}>W32</code> pairs
        vary 3–5 cm across washes. Comparing flat garment measurements shows
        exactly where a pair differs and what to ask the seller.
      </p>

      <div className="sample-preview-grid">
        <div className="sample-mini-box">
          <strong style={{ color: 'var(--ink-primary)' }}>
            Difference summary:
          </strong>{' '}
          Waist similar (0 cm).{' '}
          <strong style={{ color: 'var(--ink-primary)' }}>
            3 cm narrower laid flat at the thigh
          </strong>{' '}
          and{' '}
          <strong style={{ color: 'var(--ink-primary)' }}>
            3 cm narrower laid flat at the hem
          </strong>{' '}
          (Three-field total: 6 cm).
        </div>
        <div className="sample-mini-box">
          <strong style={{ color: 'var(--ink-primary)' }}>
            Generated seller question:
          </strong>{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            “Could you share thigh width measured 2.5 cm below the crotch seam
            (laid flat) in cm?”
          </span>
        </div>
      </div>
    </section>
  )
}
