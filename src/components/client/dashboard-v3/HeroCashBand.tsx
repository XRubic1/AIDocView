import { useNavigate } from 'react-router-dom'
import { useCountUp } from '../../../hooks/useCountUp'
import { formatCurrency } from '../../../utils/format'

export type HeroCashBandProps = {
  openBalance: number
  /** Invoices with a balance still owed. */
  openCount: number
  expectedAmount: number
  expectedCount: number
  paidAmount: number
  paidCount: number
  overdueAmount: number
  overdueCount: number
  loading?: boolean
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * Three cash numbers — owed, expected, paid — plus an overdue card that only
 * appears when something is actually overdue.
 */
export default function HeroCashBand({
  openBalance,
  openCount,
  expectedAmount,
  expectedCount,
  paidAmount,
  paidCount,
  overdueAmount,
  overdueCount,
  loading = false,
}: HeroCashBandProps) {
  const navigate = useNavigate()
  const openAnimated = useCountUp(loading ? 0 : openBalance, { decimals: 2, duration: 700 })
  const showOverdue = !loading && overdueCount > 0

  return (
    <section
      className={`cdv3-kpis${showOverdue ? ' has-overdue' : ''}${loading ? ' is-loading' : ''}`}
      aria-label="Cash overview"
    >
      <button type="button" className="cdv3-kpi is-primary" onClick={() => navigate('/client/invoices')}>
        <span className="cdv3-kpi__label">Open balance</span>
        <span className="cdv3-kpi__value tabular-nums">{loading ? '—' : formatCurrency(openAnimated)}</span>
        <span className="cdv3-kpi__sub">{loading ? ' ' : openCount > 0 ? `${plural(openCount, 'open invoice')} with brokers` : 'Nothing owed right now'}</span>
      </button>

      <button
        type="button"
        className="cdv3-kpi"
        onClick={() => navigate('/client/invoices?status=approved')}
      >
        <span className="cdv3-kpi__label">Expected next 30 days</span>
        <span className="cdv3-kpi__value is-accent tabular-nums">
          {loading ? '—' : formatCurrency(expectedAmount)}
        </span>
        <span className="cdv3-kpi__sub">
          {loading ? ' ' : expectedCount > 0 ? `${plural(expectedCount, 'invoice')} due` : 'Nothing due yet'}
        </span>
      </button>

      <button type="button" className="cdv3-kpi" onClick={() => navigate('/client/payments')}>
        <span className="cdv3-kpi__label">Paid last 30 days</span>
        <span className="cdv3-kpi__value tabular-nums">{loading ? '—' : formatCurrency(paidAmount)}</span>
        <span className="cdv3-kpi__sub">
          {loading ? ' ' : paidCount > 0 ? plural(paidCount, 'payment') : 'No payments yet'}
        </span>
      </button>

      {showOverdue ? (
        <button
          type="button"
          className="cdv3-kpi is-alert"
          onClick={() => navigate('/client/invoices?status=overdue')}
        >
          <span className="cdv3-kpi__label">Overdue</span>
          <span className="cdv3-kpi__value tabular-nums">{formatCurrency(overdueAmount)}</span>
          <span className="cdv3-kpi__sub">{plural(overdueCount, 'invoice')} past due</span>
        </button>
      ) : null}
    </section>
  )
}
