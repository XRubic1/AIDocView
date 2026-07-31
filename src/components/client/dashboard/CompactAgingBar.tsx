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
  { key: '1_15' as const, label: '1–15d', color: '#1684FE' },
  { key: '16_30' as const, label: '16–30d', color: '#38BDF8' },
  { key: '31_45' as const, label: '31–45d', color: '#A78BFA' },
  { key: '46_60' as const, label: '46–60d', color: '#FBBF24' },
  { key: '61_90' as const, label: '61–90d', color: '#FB923C' },
  { key: 'over_91' as const, label: '91+d', color: '#F87171' },
]

/**
 * Compact aging A/R — Current / 31+ summary + color bar.
 * Hover / focus the bar to see every aging bucket amount.
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
        <div className="cd-compact-aging__title-row">
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
      <div className="cd-compact-aging__title-row">
        <span className="cd-compact-aging__title">Aging A/R</span>
        <span className="cd-compact-aging__hint">Hover bar for details</span>
      </div>

      <div className="cd-compact-aging__summary">
        <div className="cd-compact-aging__summary-item">
          <span className="cd-compact-aging__summary-label">Current (≤30d)</span>
          <span className="cd-compact-aging__summary-value tabular-nums">
            {formatCurrency(current)}
          </span>
        </div>
        <div className="cd-compact-aging__summary-item is-aged">
          <span className="cd-compact-aging__summary-label">31+ days</span>
          <span className="cd-compact-aging__summary-value tabular-nums">
            {formatCurrency(aged)}
          </span>
        </div>
      </div>

      <div className="cd-compact-aging__bar-wrap">
        <div
          className="cd-compact-aging__bar"
          role="img"
          tabIndex={0}
          aria-label="A/R aging distribution. Hover or focus for full bucket breakdown."
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
                />
              ) : null
            )
          )}
        </div>

        <div className="cd-compact-aging__tooltip" role="tooltip">
          <p className="cd-compact-aging__tooltip-title">Open by age</p>
          <ul className="cd-compact-aging__tooltip-list">
            {segments.map((seg) => (
              <li key={seg.key} className="cd-compact-aging__tooltip-row">
                <i
                  className="cd-compact-aging__tooltip-swatch"
                  style={{ background: seg.color }}
                  aria-hidden
                />
                <span className="cd-compact-aging__tooltip-label">{seg.label}</span>
                <span className="cd-compact-aging__tooltip-amt tabular-nums">
                  {formatCurrency(seg.amount)}
                </span>
              </li>
            ))}
          </ul>
          <div className="cd-compact-aging__tooltip-total">
            <span>Total open</span>
            <span className="tabular-nums">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Compact text legend — fills space without bulky dots */}
      <ul className="cd-compact-aging__legend">
        {segments.map((seg) => (
          <li key={seg.key} className="cd-compact-aging__legend-item">
            <span
              className="cd-compact-aging__legend-swatch"
              style={{ background: seg.color }}
              aria-hidden
            />
            <span className="cd-compact-aging__legend-label">{seg.label}</span>
            <span className="cd-compact-aging__legend-amt tabular-nums">
              {formatCurrency(seg.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
