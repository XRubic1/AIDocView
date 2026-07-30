import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import { formatCurrency } from '../../../utils/format'
import { isInvoiceOverdue, isOpenArInvoice } from '../../../utils/invoiceAging'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../../../utils/paymentVariance'

type OverdueRingChartProps = {
  invoices: Invoice[]
  payments: Payment[]
}

const SIZE = 148
const STROKE = 10
const RADIUS = (SIZE - STROKE) / 2 - 4
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const CORE_R = RADIUS - STROKE - 6

/**
 * Overdue share of Open Balance — approved open A/R past expected-pay policy.
 * Center $ is remaining open balance (same basis as Open Balance card).
 */
export default function OverdueRingChart({ invoices, payments }: OverdueRingChartProps) {
  const navigate = useNavigate()

  const { overdueCount, overdueAmount, totalOpen, progress } = useMemo(() => {
    let overdueBal = 0
    let overdueN = 0
    let openTotal = 0

    for (const inv of invoices) {
      if (!isOpenArInvoice(inv)) continue
      const balance = getInvoiceOpenArBalance(inv, payments)
      if (balance <= AMOUNT_EPSILON) continue

      openTotal += balance
      if (isInvoiceOverdue(inv)) {
        overdueBal += balance
        overdueN += 1
      }
    }

    const pct = openTotal > AMOUNT_EPSILON ? overdueBal / openTotal : 0
    return {
      overdueCount: overdueN,
      overdueAmount: overdueBal,
      totalOpen: openTotal,
      progress: Math.min(1, Math.max(0, pct)),
    }
  }, [invoices, payments])

  const dashOffset = CIRCUMFERENCE * (1 - progress)
  const hasOverdue = overdueAmount > AMOUNT_EPSILON

  return (
    <button
      type="button"
      className={`cd-overdue-ring${hasOverdue ? ' is-active' : ''}`}
      onClick={() => navigate('/client/invoices?status=overdue')}
      aria-label={`${formatCurrency(overdueAmount)} overdue of ${formatCurrency(totalOpen)} open balance, ${overdueCount} invoices`}
    >
      <div className="cd-overdue-ring__chart" aria-hidden>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <defs>
            <linearGradient id="cd-overdue-core-base" x1="20%" y1="0%" x2="80%" y2="100%">
              <stop offset="0%" stopColor="#1a2332" />
              <stop offset="55%" stopColor="#111827" />
              <stop offset="100%" stopColor="#0d1520" />
            </linearGradient>
            <radialGradient id="cd-overdue-core-wash-tr" cx="100%" cy="0%" r="80%">
              <stop offset="0%" stopColor="#1684FE" stopOpacity="0.18" />
              <stop offset="55%" stopColor="#1684FE" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="cd-overdue-core-wash-bl" cx="0%" cy="100%" r="55%">
              <stop offset="0%" stopColor="#1684FE" stopOpacity="0.06" />
              <stop offset="50%" stopColor="#1684FE" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle
            className="cd-overdue-ring__track"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
          />
          <circle
            className="cd-overdue-ring__progress"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
          <circle
            className="cd-overdue-ring__core"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={CORE_R}
            fill="url(#cd-overdue-core-base)"
          />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={CORE_R} fill="url(#cd-overdue-core-wash-tr)" />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={CORE_R} fill="url(#cd-overdue-core-wash-bl)" />
        </svg>
        <div className="cd-overdue-ring__center">
          <span className="cd-overdue-ring__amount tabular-nums">
            {formatCurrency(overdueAmount)}
          </span>
          <span className="cd-overdue-ring__count tabular-nums">
            {overdueCount} overdue
          </span>
        </div>
      </div>
    </button>
  )
}
