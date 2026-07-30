import { useMemo } from 'react'
import type { AgingAR } from '../../../types/admin'
import { formatCurrency } from '../../../utils/format'

type DashboardAgingCardProps = {
  aging: AgingAR
}

const BUCKETS: Array<{
  key: keyof Pick<AgingAR, '1_15' | '16_30' | '31_45' | '46_60' | '61_90' | 'over_91'>
  short: string
  color: string
}> = [
  { key: '1_15', short: '0–15', color: '#1684FE' },
  { key: '16_30', short: '16–30', color: '#38BDF8' },
  { key: '31_45', short: '31–45', color: '#A78BFA' },
  { key: '46_60', short: '46–60', color: '#FBBF24' },
  { key: '61_90', short: '61–90', color: '#FB923C' },
  { key: 'over_91', short: '91+', color: '#F87171' },
]

/**
 * Compact open A/R aging band — spans the bottom of the main dashboard column.
 */
export default function DashboardAgingCard({ aging }: DashboardAgingCardProps) {
  const total = aging.total > 0 ? aging.total : 0

  const rows = useMemo(
    () =>
      BUCKETS.map((b) => {
        const amount = aging[b.key] ?? 0
        return {
          ...b,
          amount,
          pct: total > 0 ? (amount / total) * 100 : 0,
        }
      }),
    [aging, total]
  )

  const current = aging['1_15'] + aging['16_30']
  const aged = Math.max(0, total - current)

  return (
    <section className="cd-aging" aria-label="Aging A/R">
      <div className="cd-aging__lead">
        <header className="cd-aging__head">
          <h2>Aging A/R</h2>
          <span className="cd-aging__total tabular-nums">
            {total > 0 ? formatCurrency(total) : '—'}
          </span>
        </header>

        <div className="cd-aging__summary">
          <div>
            <span className="cd-aging__summary-label">Current</span>
            <span className="cd-aging__summary-value tabular-nums is-blue">
              {formatCurrency(current)}
            </span>
          </div>
          <div>
            <span className="cd-aging__summary-label">Aged 31+</span>
            <span className="cd-aging__summary-value tabular-nums">
              {formatCurrency(aged)}
            </span>
          </div>
        </div>
      </div>

      <div className="cd-aging__chart">
        <div
          className="cd-aging__stack"
          role="img"
          aria-label="A/R aging distribution"
        >
          {total <= 0 ? (
            <span className="cd-aging__stack-empty" />
          ) : (
            rows.map((row) =>
              row.pct > 0 ? (
                <span
                  key={row.key}
                  className="cd-aging__stack-seg"
                  style={{ width: `${row.pct}%`, background: row.color }}
                  title={`${row.short}: ${formatCurrency(row.amount)}`}
                />
              ) : null
            )
          )}
        </div>

        <ul className="cd-aging__rows">
          {rows.map((row) => (
            <li key={row.key} className="cd-aging__row" title={formatCurrency(row.amount)}>
              <i className="cd-aging__dot" style={{ background: row.color }} aria-hidden />
              <span className="cd-aging__label">{row.short}</span>
              <span
                className={`cd-aging__amt tabular-nums${row.amount <= 0 ? ' is-zero' : ''}`}
              >
                {row.amount > 0 ? formatCurrency(row.amount) : '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
