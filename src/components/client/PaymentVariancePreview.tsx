import { CircleCheck, AlertTriangle, TrendingUp } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { classifyPaymentVariance, type PaymentVarianceKind } from '../../utils/paymentVariance'
import { useClientTheme } from '../../theme/ThemeContext'

interface PaymentVariancePreviewProps {
  invoiceAmount: number
  amountApplying: number
  priorReceived?: number
  compact?: boolean
}

/** Live pre-submit summary: invoice total, this payment, projected status. */
export default function PaymentVariancePreview({
  invoiceAmount,
  amountApplying,
  priorReceived = 0,
  compact = false,
}: PaymentVariancePreviewProps) {
  const c = useClientTheme()
  const projectedTotal = priorReceived + amountApplying
  const variance = classifyPaymentVariance(invoiceAmount, projectedTotal)

  if (!variance || !Number.isFinite(amountApplying) || amountApplying <= 0) {
    return null
  }

  const styles: Record<
    PaymentVarianceKind,
    { bg: string; color: string; label: string; icon: typeof CircleCheck }
  > = {
    full: { bg: c.stat.green, color: c.success, label: 'Full pay', icon: CircleCheck },
    short: { bg: c.stat.amber, color: c.warning, label: 'Short pay', icon: AlertTriangle },
    over: { bg: c.stat.red, color: c.error, label: 'Overpay', icon: TrendingUp },
  }

  const tone = styles[variance]
  const Icon = tone.icon
  const diff =
    variance === 'short'
      ? invoiceAmount - projectedTotal
      : variance === 'over'
        ? projectedTotal - invoiceAmount
        : 0

  return (
    <div
      className={`payment-variance-preview ${compact ? 'payment-variance-preview--compact' : ''}`}
      style={{ backgroundColor: tone.bg, borderColor: `${tone.color}33` }}
    >
      <div className="payment-variance-preview__header">
        <Icon className="w-4 h-4 shrink-0" style={{ color: tone.color }} />
        <span className="payment-variance-preview__badge" style={{ color: tone.color }}>
          {tone.label}
        </span>
      </div>
      <dl className="payment-variance-preview__grid">
        <div>
          <dt style={{ color: c.secondary }}>Invoice total</dt>
          <dd className="financial-nums" style={{ color: c.primary }}>
            {formatCurrency(invoiceAmount)}
          </dd>
        </div>
        <div>
          <dt style={{ color: c.secondary }}>This payment</dt>
          <dd className="financial-nums" style={{ color: c.primary }}>
            {formatCurrency(amountApplying)}
          </dd>
        </div>
        <div>
          <dt style={{ color: c.secondary }}>Total after post</dt>
          <dd className="financial-nums" style={{ color: c.primary }}>
            {formatCurrency(projectedTotal)}
          </dd>
        </div>
        <div>
          <dt style={{ color: c.secondary }}>Result</dt>
          <dd className="financial-nums" style={{ color: tone.color }}>
            {variance === 'full' && 'Paid in full'}
            {variance === 'short' && `Short ${formatCurrency(diff)}`}
            {variance === 'over' && `Over ${formatCurrency(diff)}`}
          </dd>
        </div>
      </dl>
    </div>
  )
}
