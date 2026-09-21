import { useNavigate } from 'react-router-dom'
import { useCountUp } from '../../../hooks/useCountUp'
import { formatCurrency } from '../../../utils/format'
import type { KpiTrend } from '../dashboard-v2/KpiStatRow'

export type HeroCashBandProps = {
  openBalance: number
  openTrend?: KpiTrend
  overdueAmount: number
  overdueCount: number
  overdueTrend?: KpiTrend
  comingDueAmount: number
  comingDueCount: number
  confirmedPayAmount: number
  confirmedPayCount: number
  loading?: boolean
}

function trendGlyph(trend: KpiTrend | undefined): string {
  if (trend === 'up') return '↑'
  if (trend === 'down') return '↓'
  return '→'
}

/**
 * Waitlist-branded hero: one big open balance, overdue callout, compact cash chips.
 * Open balance is the only large figure — other KPIs stay secondary.
 */
export default function HeroCashBand({
  openBalance,
  openTrend = 'flat',
  overdueAmount,
  overdueCount,
  overdueTrend = 'flat',
  comingDueAmount,
  comingDueCount,
  confirmedPayAmount,
  confirmedPayCount,
  loading = false,
}: HeroCashBandProps) {
  const navigate = useNavigate()
  const openAnimated = useCountUp(loading ? 0 : openBalance, { decimals: 2, duration: 700 })
  const overdueAnimated = useCountUp(loading ? 0 : overdueAmount, {
    decimals: 2,
    duration: 700,
  })

  return (
    <section className={`cdv3-hero${loading ? ' is-loading' : ''}`} aria-label="Cash overview">
      <button
        type="button"
        className="cdv3-hero__open"
        onClick={() => navigate('/client/invoices')}
        title="View open invoices"
      >
        <span className="cdv3-hero__eyebrow">Open balance</span>
        <span className="cdv3-hero__open-row">
          <span className="cdv3-hero__open-amount tabular-nums">
            {loading ? '—' : formatCurrency(openAnimated)}
          </span>
          {!loading ? (
            <span className={`cdv3-hero__trend is-${openTrend}`} title="vs prior 30 days">
              {trendGlyph(openTrend)}
            </span>
          ) : null}
        </span>
        <span className="cdv3-hero__hint">All open A/R</span>
      </button>

      <button
        type="button"
        className={`cdv3-hero__overdue${overdueCount > 0 ? ' has-risk' : ''}`}
        onClick={() => navigate('/client/invoices?status=overdue')}
        title="View overdue invoices"
      >
        <span className="cdv3-hero__eyebrow">Overdue</span>
        <span className="cdv3-hero__overdue-row">
          <span className="cdv3-hero__overdue-amount tabular-nums">
            {loading ? '—' : formatCurrency(overdueAnimated)}
          </span>
          {!loading && overdueCount > 0 ? (
            <span className="cdv3-hero__count tabular-nums">{overdueCount}</span>
          ) : null}
          {!loading ? (
            <span className={`cdv3-hero__trend is-${overdueTrend}`} title="vs prior 30 days">
              {trendGlyph(overdueTrend)}
            </span>
          ) : null}
        </span>
        <span className="cdv3-hero__hint">
          {overdueCount > 0 ? 'Needs follow-up' : 'Nothing past due'}
        </span>
      </button>

      <div className="cdv3-hero__chips">
        <button
          type="button"
          className="cdv3-chip"
          onClick={() => navigate('/client/invoices?status=approved')}
          title="View coming due"
        >
          <span className="cdv3-chip__label">Coming due</span>
          <span className="cdv3-chip__value tabular-nums">
            {loading ? '—' : formatCurrency(comingDueAmount)}
          </span>
          {!loading && comingDueCount > 0 ? (
            <span className="cdv3-chip__meta tabular-nums">{comingDueCount} inv</span>
          ) : (
            <span className="cdv3-chip__meta">Next 30d</span>
          )}
        </button>
        <button
          type="button"
          className="cdv3-chip cdv3-chip--success"
          onClick={() => navigate('/client/invoices')}
          title="View confirmed pay"
        >
          <span className="cdv3-chip__label">Confirmed pay</span>
          <span className="cdv3-chip__value tabular-nums">
            {loading ? '—' : formatCurrency(confirmedPayAmount)}
          </span>
          {!loading && confirmedPayCount > 0 ? (
            <span className="cdv3-chip__meta tabular-nums">{confirmedPayCount} inv</span>
          ) : (
            <span className="cdv3-chip__meta">Last 30d</span>
          )}
        </button>
      </div>
    </section>
  )
}
