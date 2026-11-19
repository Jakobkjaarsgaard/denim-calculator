import { SIMILAR_MEASUREMENT_THRESHOLD_CM } from '../domain/types'

export function WebsiteFooter() {
  return (
    <footer
      className="section-card"
      style={{
        marginTop: '24px',
        borderTop: '3px solid var(--indigo-primary)',
      }}
      aria-label="Methodology, privacy, and founder concierge notes"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          fontSize: '0.84rem',
        }}
      >
        <div>
          <span className="brand-eyebrow">Methodology</span>
          <h3 style={{ margin: '2px 0 6px', fontSize: '0.96rem' }}>
            Fair Three-Field Comparison
          </h3>
          <p className="field-hint" style={{ margin: 0 }}>
            Multi-candidate <strong>Closest measurements</strong> ranking uses
            the equal-weighted sum of absolute differences across{' '}
            <strong>Flat waist</strong>, <strong>Thigh</strong> (2.5 cm below
            crotch), and <strong>Hem</strong> in cm, rounded to 0.1 cm. An
            adjustable product assumption of{' '}
            <strong>±{SIMILAR_MEASUREMENT_THRESHOLD_CM} cm</strong> reads
            “similar measurement” while always displaying the exact delta.
          </p>
        </div>

        <div>
          <span className="brand-eyebrow">Evidence & Honesty</span>
          <h3 style={{ margin: '2px 0 6px', fontSize: '0.96rem' }}>
            No Fabricated Fit Probabilities
          </h3>
          <p className="field-hint" style={{ margin: 0 }}>
            Missing measurements, unconfirmed methods (“I don’t know”), or
            incompatible conventions (thigh measured at the crotch) never default
            to zero and never allow an incomplete listing to win. Fabric stretch,
            washing, and wear affect feel—reported measurements are compared as
            supplied without predicting shrinkage percentages.
          </p>
        </div>

        <div>
          <span className="brand-eyebrow">On-Device Privacy</span>
          <h3 style={{ margin: '2px 0 6px', fontSize: '0.96rem' }}>
            No Account, API Key, or Tracking
          </h3>
          <p className="field-hint" style={{ margin: 0 }}>
            Confirmed numeric measurements and pair names save locally on your
            device only. Listing screenshots and raw OCR text stay in memory
            during review and are discarded on dismissal. Zero third-party
            analytics calls.
          </p>
        </div>
      </div>
    </footer>
  )
}
