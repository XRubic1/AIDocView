import { useNavigate } from 'react-router-dom'
import { useCountUp } from '../../../hooks/useCountUp'
import { formatCurrency } from '../../../utils/format'

export type KpiTrend = 'up' | 'down' | 'flat'

export type KpiStat = {
  key: string
  label: string
  amount: number
  /** Count / window context (e.g. "3 invoices"). */
  sub: string
  navigateTo: string
  /** Only overdue uses danger tone; paid uses success. */
  tone?: 'neutral' | 'danger' | 'success'
  /** Comparison vs prior period — shown with an arrow. */
  trend?: KpiTrend
  /** Optional override for the trend caption (defaults to “vs prior 30 days”). */
  trendLabel?: string
}

type KpiStatRowProps = {
  stats: KpiStat[]
  loading?: boolean
}

function trendArrow(trend: KpiTrend): string {
  if (trend === 'up') return '↑'
  if (trend === 'down') return '↓'
  return '→'
}

/** Single KPI card with optional count-up on the amount. */
function KpiCard({
  stat,
  loading,
}: {
  stat: KpiStat
  loading: boolean
}) {
  const navigate = useNavigate()
  const animated = useCountUp(loading ? 0 : stat.amount, { decimals: 2, duration: 700 })
  const tone = stat.tone || 'neutral'
  const trend = stat.trend ?? 'flat'
  const trendCaption = stat.trendLabel || 'vs prior 30 days'

  return (
    <button
      type="button"
      className={`cdv2-kpi tone-${tone}${loading ? ' is-loading' : ''}`}
      onClick={() => navigate(stat.navigateTo)}
      title={`View ${stat.label}`}
    >
      <span className="cdv2-kpi__label">{stat.label}</span>
      <span className="cdv2-kpi__amount tabular-nums">
        {loading ? '—' : formatCurrency(animated)}
      </span>
      <span className="cdv2-kpi__sub">{loading ? '…' : stat.sub}</span>
      {!loading ? (
        <span className={`cdv2-kpi__trend is-${trend}`}>
          <span className="cdv2-kpi__trend-arrow" aria-hidden>
            {trendArrow(trend)}
          </span>
          {trendCaption}
        </span>
      ) : null}
    </button>
  )
}

/**
 * Four flat KPI cards: Open Balance · Overdue · Coming due · Paid 30d.
 */
export default function KpiStatRow({ stats, loading = false }: KpiStatRowProps) {
  return (
    <section className="cdv2-kpi-row" aria-label="Account snapshot">
      {stats.map((stat) => (
        <KpiCard key={stat.key} stat={stat} loading={loading} />
      ))}
    </section>
  )
}
