import { formatCurrency } from '../../../utils/format'

type CompactAgingBarProps = {
  aging: {
    '1_15': number
    '16_30': number
    '31_45': number
    '46_60': number
    '61_90': number
    over_91: number
    total: number
  }
  loading?: boolean
}

const BUCKETS = [
  { key: '1_15' as const, color: '#1684FE' },
  { key: '16_30' as const, color: '#38BDF8' },
  { key: '31_45' as const, color: '#A78BFA' },
  { key: '46_60' as const, color: '#FBBF24' },
  { key: '61_90' as const, color: '#FB923C' },
  { key: 'over_91' as const, color: '#F87171' },
]

/**
 * Compact aging A/R bar - shows color-coded buckets with 2 summary labels.
 * Bucket details appear on hover. Fits inside the Open Balance card.
 */
export default function CompactAgingBar({ aging, loading = false }: CompactAgingBarProps) {
  const total = aging.total > 0 ? aging.total : 0
  const current = aging['1_15'] + aging['16_30']
  const aged = Math.max(0, total - current)

  const segments = BUCKETS.map((b) => {
    const amount = aging[b.key] ?? 0
    const pct = total > 0 ? (amount / total) * 100 : 0
    return { ...b, amount, pct }
  })

  if (loading) {
    return (
      <div className="cd-compact-aging is-loading" aria-label="Loading aging bar">
        <div className="cd-compact-aging__head">
          <span className="cd-compact-aging__title">Aging A/R</span>
        </div>
        <div className="cd-compact-aging__bar">
          <span className="cd-compact-aging__bar-empty" />
        </div>
      </div>
    )
  }

  return (
    <div className="cd-compact-aging" aria-label="Aging A/R">
      <div className="cd-compact-aging__head">
        <span className="cd-compact-aging__title">Aging A/R</span>
        <div className="cd-compact-aging__summary">
          <span className="cd-compact-aging__summary-item">
            <span className="cd-compact-aging__summary-label">Current</span>
            <span className="cd-compact-aging__summary-value tabular-nums">
              {formatCurrency(current)}
            </span>
          </span>
          <span className="cd-compact-aging__summary-item">
            <span className="cd-compact-aging__summary-label">31+ days</span>
            <span className="cd-compact-aging__summary-value tabular-nums">
              {formatCurrency(aged)}
            </span>
          </span>
        </div>
      </div>
      <div
        className="cd-compact-aging__bar"
        role="img"
        aria-label="A/R aging distribution"
      >
        {total <= 0 ? (
          <span className="cd-compact-aging__bar-empty" />
        ) : (
          segments.map((seg) =>
            seg.pct > 0 ? (
              <span
                key={seg.key}
                className="cd-compact-aging__bar-seg"
                style={{ width: `${seg.pct}%`, background: seg.color }}
                title={`${seg.key.replace('_', '-')}: ${formatCurrency(seg.amount)}`}
              />
            ) : null
          )
        )}
      </div>
    </div>
  )
}
