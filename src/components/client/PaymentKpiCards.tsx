import { useMemo } from 'react'
import { DollarSign, Clock, CheckCircle2, Hash } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { computePaymentTrendSummary } from '../../utils/paymentTrends'
import type { Payment } from '../../types/payment'
import { getAwaitingReceiptPayments } from '../../utils/paymentStatus'
import { useClientTheme } from '../../theme/ThemeContext'

type PaymentStatusFilter = 'all' | 'pending' | 'confirmed' | 'awaiting_receipt'

interface PaymentKpiCardsProps {
  payments: Payment[]
  statusFilter: PaymentStatusFilter
  onStatusFilter: (status: 'confirmed' | 'pending' | 'awaiting_receipt') => void
  showAwaitingConfirmation?: boolean
  /** Put Confirm KPI first (mobile payments home). */
  prioritizeConfirm?: boolean
}

/** Compact payment stats — matches invoice search `client-stat-strip` sizing (no charts). */
export default function PaymentKpiCards({
  payments,
  statusFilter,
  onStatusFilter,
  showAwaitingConfirmation = false,
  prioritizeConfirm = false,
}: PaymentKpiCardsProps) {
  const c = useClientTheme()
  const summary = useMemo(() => computePaymentTrendSummary(payments, 6), [payments])
  const awaitingReceipt = useMemo(() => getAwaitingReceiptPayments(payments), [payments])
  const awaitingReceiptAmount = useMemo(
    () => awaitingReceipt.reduce((sum, p) => sum + p.amount, 0),
    [awaitingReceipt]
  )

  const colClass = showAwaitingConfirmation
    ? 'grid-cols-2 lg:grid-cols-4'
    : 'grid-cols-1 sm:grid-cols-3'

  return (
    <section
      className={`client-stat-strip grid ${colClass}${
        prioritizeConfirm ? ' payment-kpi-strip--confirm-first' : ''
      } border-b shrink-0`}
      style={{ borderColor: c.border }}
      aria-label="Payment summary"
    >
      <button
        type="button"
        onClick={() => onStatusFilter('confirmed')}
        aria-pressed={statusFilter === 'confirmed'}
        className="payment-kpi-cell payment-kpi-cell--paid flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b sm:border-b-0 text-left transition-colors hover:opacity-90"
        style={{
          backgroundColor: c.stat.green,
          borderColor: c.border,
          boxShadow: statusFilter === 'confirmed' ? `inset 0 -2px 0 ${c.success}` : undefined,
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <DollarSign className="w-3.5 h-3.5 shrink-0" style={{ color: c.success }} />
          <span className="text-xs font-medium truncate client-stat-strip__label-full" style={{ color: c.secondary }}>
            Total Paid
          </span>
          <span className="text-xs font-medium truncate client-stat-strip__label-short" style={{ color: c.secondary }}>
            Paid
          </span>
        </div>
        <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
          {formatCurrency(summary.totalPaid)}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onStatusFilter('pending')}
        aria-pressed={statusFilter === 'pending'}
        className="payment-kpi-cell payment-kpi-cell--pending flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b sm:border-b-0 text-left transition-colors hover:opacity-90"
        style={{
          backgroundColor: c.stat.amber,
          borderColor: c.border,
          boxShadow: statusFilter === 'pending' ? `inset 0 -2px 0 ${c.warning}` : undefined,
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} />
          <span className="text-xs font-medium truncate client-stat-strip__label-full" style={{ color: c.secondary }}>
            Pending
          </span>
          <span className="text-xs font-medium truncate client-stat-strip__label-short" style={{ color: c.secondary }}>
            Pending
          </span>
        </div>
        <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
          {formatCurrency(summary.totalPending)}
        </span>
      </button>

      {showAwaitingConfirmation && (
        <button
          type="button"
          onClick={() => onStatusFilter('awaiting_receipt')}
          aria-pressed={statusFilter === 'awaiting_receipt'}
          className="payment-kpi-cell payment-kpi-cell--confirm flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0 text-left transition-colors hover:opacity-90"
          style={{
            backgroundColor: awaitingReceipt.length > 0 ? c.stat.amber : c.stat.blue,
            borderColor: c.border,
            boxShadow:
              statusFilter === 'awaiting_receipt'
                ? `inset 0 -2px 0 ${awaitingReceipt.length > 0 ? c.warning : c.info}`
                : undefined,
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <CheckCircle2
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: awaitingReceipt.length > 0 ? c.warning : c.info }}
            />
            <span className="text-xs font-medium truncate client-stat-strip__label-full" style={{ color: c.secondary }}>
              Confirm payment
            </span>
            <span className="text-xs font-medium truncate client-stat-strip__label-short" style={{ color: c.secondary }}>
              Confirm
            </span>
          </div>
          <span
            className="text-lg font-bold tabular-nums shrink-0"
            style={{ color: awaitingReceipt.length > 0 ? c.warning : c.primary }}
            title={
              awaitingReceipt.length > 0
                ? `${formatCurrency(awaitingReceiptAmount)} to confirm`
                : 'None awaiting'
            }
          >
            {awaitingReceipt.length}
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={() => onStatusFilter('confirmed')}
        aria-pressed={statusFilter === 'confirmed'}
        className="payment-kpi-cell payment-kpi-cell--received flex items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:opacity-90"
        style={{
          backgroundColor: c.stat.blue,
          borderColor: c.border,
          boxShadow: statusFilter === 'confirmed' ? `inset 0 -2px 0 ${c.info}` : undefined,
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Hash className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
          <span className="text-xs font-medium truncate client-stat-strip__label-full" style={{ color: c.secondary }}>
            Payments Received
          </span>
          <span className="text-xs font-medium truncate client-stat-strip__label-short" style={{ color: c.secondary }}>
            Received
          </span>
        </div>
        <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
          {summary.confirmedCount}
        </span>
      </button>
    </section>
  )
}
