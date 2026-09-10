import { useNavigate } from 'react-router-dom'
import { useCountUp } from '../../../hooks/useCountUp'
import { formatCurrency } from '../../../utils/format'

export type KpiTrend = 'up' | 'down' | 'flat'

export type KpiStat = {
  key: string
  label: string
  amount: number
  /** Optional count, e.g. "3 invoices". */
  sub?: string
  navigateTo: string
  /** Only overdue uses danger tone; paid uses success. */
  tone?: 'neutral' | 'danger' | 'success'
  /** Comparison vs prior period — arrow only, caption in the title. */
  trend?: KpiTrend
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

/** Single KPI card — label + amount, no extra captions. */
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

  return (
    <article
      className={`cdv2-kpi tone-${tone}${loading ? ' is-loading' : ''}`}
    >
      <button
        type="button"
        className="cdv2-kpi__hit"
        onClick={() => navigate(stat.navigateTo)}
        title={`View ${stat.label}`}
      >
        <span className="cdv2-kpi__top">
          <span className="cdv2-kpi__label">{stat.label}</span>
          {!loading && stat.sub ? (
            <span className="cdv2-kpi__sub" title={`${stat.sub} invoices`}>
              {stat.sub}
            </span>
          ) : null}
        </span>
        <span className="cdv2-kpi__value">
          <span className="cdv2-kpi__amount tabular-nums">
            {loading ? '—' : formatCurrency(animated)}
          </span>
          {!loading ? (
            <span
              className={`cdv2-kpi__trend is-${trend}`}
              title="vs prior 30 days"
            >
              {trendArrow(trend)}
            </span>
          ) : null}
        </span>
      </button>
    </article>
  )
}

/** Four compact KPI cards: Open Balance · Overdue · Coming due · Confirmed pay. */
export default function KpiStatRow({ stats, loading = false }: KpiStatRowProps) {
  return (
    <section className="cdv2-kpi-row" aria-label="Account snapshot">
      {stats.map((stat) => (
        <KpiCard key={stat.key} stat={stat} loading={loading} />
      ))}
    </section>
  )
}
