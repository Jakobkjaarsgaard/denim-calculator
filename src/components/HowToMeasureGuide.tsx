import { useState } from 'react'
import {
  DIMENSION_ORDER,
  DIMENSION_SPECS,
  type DimensionKey,
} from '../domain/types'

interface HowToMeasureGuideProps {
  defaultOpen?: boolean
  audienceLabel?: string
}

export function HowToMeasureGuide({
  defaultOpen = false,
  audienceLabel = 'How to measure (interactive garment diagram & shared buyer/seller guide)',
}: HowToMeasureGuideProps) {
  const [selectedDim, setSelectedDim] = useState<DimensionKey>('thigh')
  const activeSpec = DIMENSION_SPECS[selectedDim]

  return (
    <details className="guide-details" open={defaultOpen}>
      <summary>{audienceLabel}</summary>

      <p className="field-hint" style={{ marginTop: '8px' }}>
        All widths (Flat waist, Thigh, Knee, Hem) are measured as{' '}
        <strong>flat widths</strong> on buttoned jeans laid flat and
        unstretched. Tagged sizes (such as W32), body waist, and flat garment
        waist are distinct—never infer a garment measurement from a size tag.
      </p>

      {/* Interactive SVG Technical Garment Diagram */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '12px',
          alignItems: 'center',
          background: '#ffffff',
          border: '1px solid var(--border-stone)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px',
          marginTop: '10px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <svg
            viewBox="0 0 260 320"
            style={{ width: '100%', maxWidth: '220px', height: 'auto' }}
            role="img"
            aria-label="Technical diagram of selvedge jeans laid flat showing 6 measurement points"
          >
            {/* Jeans silhouette laid flat */}
            <path
              d="M 55 24 L 205 24 L 212 105 L 198 296 L 150 296 L 130 120 L 110 296 L 62 296 L 48 105 Z"
              fill="#e8eef5"
              stroke="#1b314e"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Waistband line */}
            <path
              d="M 55 44 L 205 44"
              stroke="#1b314e"
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
            {/* Front fly / rise seam */}
            <path
              d="M 130 24 L 130 120"
              stroke={selectedDim === 'frontRise' ? '#b63a2b' : '#1b314e'}
              strokeWidth={selectedDim === 'frontRise' ? '3.5' : '2'}
            />

            {/* 1. Flat Waist Callout Line */}
            <g
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedDim('waist')}
            >
              <line
                x1="55"
                y1="16"
                x2="205"
                y2="16"
                stroke={selectedDim === 'waist' ? '#b63a2b' : '#1b314e'}
                strokeWidth={selectedDim === 'waist' ? '3.5' : '2'}
              />
              <circle cx="55" cy="16" r="3.5" fill="#b63a2b" />
              <circle cx="205" cy="16" r="3.5" fill="#b63a2b" />
              <text
                x="130"
                y="11"
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill={selectedDim === 'waist' ? '#b63a2b' : '#141c26'}
              >
                1. Flat waist
              </text>
            </g>

            {/* 2. Thigh (2.5 cm below crotch) */}
            <g
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedDim('thigh')}
            >
              <line
                x1="133"
                y1="138"
                x2="209"
                y2="138"
                stroke={selectedDim === 'thigh' ? '#b63a2b' : '#1b314e'}
                strokeWidth={selectedDim === 'thigh' ? '3.5' : '2'}
              />
              <circle cx="133" cy="138" r="3" fill="#b63a2b" />
              <circle cx="209" cy="138" r="3" fill="#b63a2b" />
              <text
                x="171"
                y="133"
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="700"
                fill={selectedDim === 'thigh' ? '#b63a2b' : '#141c26'}
              >
                2. Thigh (-2.5cm)
              </text>
            </g>

            {/* 3. Front Rise label */}
            <g
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedDim('frontRise')}
            >
              <text
                x="124"
                y="78"
                textAnchor="end"
                fontSize="9.5"
                fontWeight="700"
                fill={selectedDim === 'frontRise' ? '#b63a2b' : '#141c26'}
              >
                3. Front rise
              </text>
            </g>

            {/* 4. Knee (33 cm down inseam) */}
            <g
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedDim('knee')}
            >
              <line
                x1="141"
                y1="212"
                x2="203"
                y2="212"
                stroke={selectedDim === 'knee' ? '#b63a2b' : '#1b314e'}
                strokeWidth={selectedDim === 'knee' ? '3.5' : '2'}
              />
              <text
                x="172"
                y="207"
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="700"
                fill={selectedDim === 'knee' ? '#b63a2b' : '#141c26'}
              >
                4. Knee (-33cm)
              </text>
            </g>

            {/* 5. Hem / Leg Opening */}
            <g
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedDim('hem')}
            >
              <line
                x1="150"
                y1="304"
                x2="198"
                y2="304"
                stroke={selectedDim === 'hem' ? '#b63a2b' : '#1b314e'}
                strokeWidth={selectedDim === 'hem' ? '3.5' : '2'}
              />
              <text
                x="174"
                y="316"
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="700"
                fill={selectedDim === 'hem' ? '#b63a2b' : '#141c26'}
              >
                5. Hem
              </text>
            </g>

            {/* 6. Inseam */}
            <g
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedDim('inseam')}
            >
              <line
                x1="128"
                y1="122"
                x2="108"
                y2="294"
                stroke={selectedDim === 'inseam' ? '#b63a2b' : '#145439'}
                strokeWidth={selectedDim === 'inseam' ? '3.5' : '2'}
                strokeDasharray="4 2"
              />
              <text
                x="96"
                y="212"
                textAnchor="end"
                fontSize="9.5"
                fontWeight="700"
                fill={selectedDim === 'inseam' ? '#b63a2b' : '#145439'}
              >
                6. Inseam
              </text>
            </g>
          </svg>
        </div>

        <div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              marginBottom: '8px',
            }}
          >
            {DIMENSION_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className={`btn btn-sm ${selectedDim === key ? 'btn-primary' : ''}`}
                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                onClick={() => setSelectedDim(key)}
              >
                {DIMENSION_SPECS[key].shortLabel}
              </button>
            ))}
          </div>
          <div
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-stone)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px',
            }}
          >
            <strong style={{ color: 'var(--indigo-primary)' }}>
              {activeSpec.label}
            </strong>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
              {activeSpec.howToMeasure}
            </p>
          </div>
        </div>
      </div>

      <table className="guide-table">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Method used by this app</th>
          </tr>
        </thead>
        <tbody>
          {DIMENSION_ORDER.map((key) => {
            const spec = DIMENSION_SPECS[key]
            return (
              <tr key={key}>
                <th scope="row">{spec.shortLabel}</th>
                <td>{spec.howToMeasure}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </details>
  )
}
