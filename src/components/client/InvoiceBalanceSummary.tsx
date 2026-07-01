import { formatCurrency } from '../../utils/format'
import { classifyPaymentVariance, getInvoiceBalanceState } from '../../utils/paymentVariance'
import { useClientTheme } from '../../theme/ThemeContext'

interface InvoiceBalanceSummaryProps {
  invoiceNumber: string
  brokerName: string
  loadNumber?: string
  invoiceAmount: number
  receivedToDate: number
  amountApplying?: number
}

/** Prominent balance strip — short red, over green, zero neutral. */
export default function InvoiceBalanceSummary({
  invoiceNumber,
  brokerName,
  loadNumber,
  invoiceAmount,
  receivedToDate,
  amountApplying = 0,
}: InvoiceBalanceSummaryProps) {
  const c = useClientTheme()
  const current = getInvoiceBalanceState(invoiceAmount, receivedToDate)
  const projectedReceived = receivedToDate + (Number.isFinite(amountApplying) ? amountApplying : 0)
  const projected = getInvoiceBalanceState(invoiceAmount, projectedReceived)
  const projectedVariance = classifyPaymentVariance(invoiceAmount, projectedReceived)

  const toneColor = (tone: typeof current.tone) => {
    switch (tone) {
      case 'short':
      case 'open':
        return c.error
      case 'over':
        return c.success
      case 'zero':
        return c.primary
      default:
        return c.primary
    }
  }

  const toneBg = (tone: typeof current.tone) => {
    switch (tone) {
      case 'short':
      case 'open':
        return c.stat.red
      case 'over':
        return c.stat.green
      case 'zero':
        return c.stat.slate
      default:
        return c.stat.slate
    }
  }

  const formatBalance = (signed: number, tone: typeof current.tone) => {
    if (tone === 'over') return formatCurrency(Math.abs(signed))
    return formatCurrency(Math.max(0, signed))
  }

  const showProjected =
    Number.isFinite(amountApplying) && amountApplying > 0 && projectedVariance !== null

  return (
    <div className="invoice-balance-summary">
      <div className="invoice-balance-summary__identity">
        <p className="invoice-balance-summary__inv-num">{invoiceNumber}</p>
        <p className="invoice-balance-summary__meta">
          {brokerName}
          {loadNumber ? ` · Load ${loadNumber}` : ''}
        </p>
      </div>

      <div className="invoice-balance-summary__figures">
        <div className="invoice-balance-summary__fig">
          <span className="invoice-balance-summary__fig-label">Invoice total</span>
          <span className="invoice-balance-summary__fig-value financial-nums">
            {formatCurrency(invoiceAmount)}
          </span>
        </div>
        <div className="invoice-balance-summary__fig">
          <span className="invoice-balance-summary__fig-label">Received</span>
          <span className="invoice-balance-summary__fig-value financial-nums">
            {formatCurrency(receivedToDate)}
          </span>
        </div>
        <div
          className={`invoice-balance-summary__fig invoice-balance-summary__fig--balance invoice-balance-summary__fig--${current.tone}`}
          style={{ backgroundColor: toneBg(current.tone) }}
        >
          <span className="invoice-balance-summary__fig-label">{current.label}</span>
          <span
            className="invoice-balance-summary__fig-value invoice-balance-summary__fig-value--balance financial-nums"
            style={{ color: toneColor(current.tone) }}
          >
            {formatBalance(current.signedBalance, current.tone)}
          </span>
        </div>
      </div>

      {showProjected && (
        <div
          className={`invoice-balance-summary__projected invoice-balance-summary__fig--${projected.tone}`}
          style={{ borderColor: `${toneColor(projected.tone)}44` }}
        >
          <span className="invoice-balance-summary__projected-label">After this payment</span>
          <span
            className="invoice-balance-summary__projected-value financial-nums"
            style={{ color: toneColor(projected.tone) }}
          >
            {projected.tone === 'zero' && 'Paid in full'}
            {projected.tone === 'short' &&
              `${formatCurrency(projected.signedBalance)} still due`}
            {projected.tone === 'over' &&
              `${formatCurrency(Math.abs(projected.signedBalance))} over`}
            {projected.tone === 'open' &&
              `${formatCurrency(projected.signedBalance)} due`}
          </span>
        </div>
      )}
    </div>
  )
}
