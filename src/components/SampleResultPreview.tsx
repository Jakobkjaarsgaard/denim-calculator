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
        <div>
          <span className="brand-eyebrow">Why measure laid flat?</span>
          <h2 className="sample-preview-title">
            Sample Result: Second-Hand Listing vs Favourite Pair
          </h2>
        </div>
        <div className="mode-primary-actions">
          <button
            type="button"
            id="btn-home-compare-my-jeans"
            data-testid="btn-compare-my-jeans"
            className={`btn ${!isExampleMode ? 'btn-primary' : ''}`}
            onClick={onCompareMyJeans}
          >
            Compare my jeans
          </button>
          <button
            type="button"
            id="btn-home-try-example"
            data-testid="btn-try-example"
            className={`btn ${isExampleMode ? 'btn-primary' : 'btn-accent'}`}
            onClick={onTryExample}
          >
            Try an example
          </button>
        </div>
      </div>

      <p className="field-hint" style={{ margin: '0 0 8px' }}>
        Japanese denim tagged W32 can measure anywhere from 38 cm to 43 cm flat
        depending on wash history and cut. Comparing flat garment measurements
        against a pair you already own shows exactly where a listing differs and
        what to ask the seller.
      </p>

      <div className="sample-preview-grid">
        <div className="sample-mini-box">
          <strong>Sample verdict (Listing A vs 42 / 34 / 24 cm ref):</strong>
          <p style={{ margin: '4px 0 0' }}>
            Waist similar (0 cm). <strong>3 cm narrower laid flat at the thigh</strong>{' '}
            and <strong>3 cm narrower laid flat at the hem</strong>. Three-field
            total: <strong>6 cm</strong>.
          </p>
        </div>
        <div className="sample-mini-box">
          <strong>Sample seller question when thigh is missing:</strong>
          <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
            “Could you please share the thigh width measured 2.5 cm below the
            crotch seam (straight across one leg, laid flat) in cm?”
          </p>
        </div>
      </div>
    </section>
  )
}
