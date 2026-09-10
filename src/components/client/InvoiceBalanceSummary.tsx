import { type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import {
  classifyPaymentVariance,
  formatSignedInvoiceBalanceDisplay,
  getInvoiceBalanceState,
} from '../../utils/paymentVariance'
import { useClientTheme } from '../../theme/ThemeContext'

interface InvoiceBalanceSummaryProps {
  invoiceNumber: string
  brokerName: string
  loadNumber?: string
  invoiceAmount: number
  receivedToDate: number
  amountApplying?: number
  /** Posted but not yet confirmed (awaiting receipt / pending / disputed). */
  pendingConfirmation?: number
  /** Short corrections already awaiting client confirmation. */
  pendingShortCorrection?: number
  /** When true, amountApplying adds to pending instead of confirmed (managed receipt flow). */
  applyingAsPending?: boolean
  /** Short payment correction amount being posted (always reduces received when applied). */
  shortCorrectionApplying?: number
  /** Managed clients — short correction awaits confirmation before reducing received. */
  shortCorrectionAwaitingConfirm?: boolean
  /** When true, pending copy reads "awaiting your confirmation" (client portal). */
  clientView?: boolean
  /** Hide invoice # / broker header (e.g. when shown in panel chrome). */
  hideIdentity?: boolean
  /** Optional status pill shown on Confirmed received or Balance due. */
  statusBadge?: ReactNode
  /** Where to place statusBadge. Written-off invoices use balance. */
  statusBadgePlacement?: 'confirmed' | 'balance'
  /** Use warning/yellow tone for the balance row (write-off). */
  writtenOff?: boolean
}

/** Prominent balance strip — short red, over green, zero neutral. */
export default function InvoiceBalanceSummary({
  invoiceNumber,
  brokerName,
  loadNumber,
  invoiceAmount,
  receivedToDate,
  amountApplying = 0,
  pendingConfirmation = 0,
  pendingShortCorrection = 0,
  applyingAsPending = false,
  shortCorrectionApplying = 0,
  shortCorrectionAwaitingConfirm = false,
  clientView = false,
  hideIdentity = false,
  statusBadge,
  statusBadgePlacement = 'confirmed',
  writtenOff = false,
}: InvoiceBalanceSummaryProps) {
  const c = useClientTheme()
  const pending = Math.max(0, pendingConfirmation)
  const shortPending = Math.max(0, pendingShortCorrection)
  const regularApplying =
    !shortCorrectionApplying && Number.isFinite(amountApplying) && amountApplying > 0
      ? amountApplying
      : 0
  const correction =
    Number.isFinite(shortCorrectionApplying) && shortCorrectionApplying > 0
      ? shortCorrectionApplying
      : 0

  let projectedConfirmed = receivedToDate
  let projectedPending = pending
  let projectedShortPending = shortPending

  if (regularApplying > 0) {
    if (applyingAsPending) projectedPending += regularApplying
    else projectedConfirmed += regularApplying
  }

  if (correction > 0) {
    if (shortCorrectionAwaitingConfirm) projectedShortPending += correction
    else projectedConfirmed -= correction
  }

  const currentTotal = receivedToDate + pending - shortPending
  const projectedTotal = projectedConfirmed + projectedPending - projectedShortPending
  const current = getInvoiceBalanceState(invoiceAmount, currentTotal)
  const projected = getInvoiceBalanceState(invoiceAmount, projectedTotal)
  const projectedVariance = classifyPaymentVariance(invoiceAmount, projectedTotal)

  const toneColor = (tone: typeof current.tone) => {
    if (writtenOff && (tone === 'short' || tone === 'open' || tone === 'zero')) {
      return c.warning
    }
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
    if (writtenOff && (tone === 'short' || tone === 'open' || tone === 'zero')) {
      return c.stat.amber
    }
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

  const showProjected =
    (regularApplying > 0 || correction > 0) &&
    projectedVariance !== null &&
    projectedTotal !== currentTotal
  const showPendingNotice =
    pending > 0 ||
    shortPending > 0 ||
    (applyingAsPending && regularApplying > 0) ||
    (shortCorrectionAwaitingConfirm && correction > 0)

  return (
    <div className="invoice-balance-summary">
      {!hideIdentity && (
        <div className="invoice-balance-summary__identity">
          <p className="invoice-balance-summary__inv-num">{invoiceNumber}</p>
          <p className="invoice-balance-summary__meta">
            {brokerName}
            {loadNumber ? ` · Load ${loadNumber}` : ''}
          </p>
        </div>
      )}

      {showPendingNotice && (
        <div
          className="invoice-balance-summary__pending-notice"
          style={{ borderColor: `${c.warning}55`, backgroundColor: `${c.warning}12` }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: c.warning }} aria-hidden />
          <div className="min-w-0">
            {pending > 0 && (
              <p className="invoice-balance-summary__pending-notice-title">
                {formatCurrency(pending)}{' '}
                {clientView ? 'awaiting your confirmation' : 'awaiting client confirmation'}
              </p>
            )}
            {shortPending > 0 && (
              <p className="invoice-balance-summary__pending-notice-title">
                {formatCurrency(shortPending)} short correction awaiting confirmation
              </p>
            )}
            {applyingAsPending && regularApplying > 0 && (
              <p className="invoice-balance-summary__pending-notice-hint">
                This payment will also require client receipt confirmation before it applies to the
                invoice.
              </p>
            )}
            {shortCorrectionAwaitingConfirm && correction > 0 && (
              <p className="invoice-balance-summary__pending-notice-hint">
                This short payment correction requires client confirmation before received total is
                reduced.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="invoice-balance-summary__figures">
        <div className="invoice-balance-summary__fig">
          <span className="invoice-balance-summary__fig-label">Invoice total</span>
          <span className="invoice-balance-summary__fig-value financial-nums">
            {formatCurrency(invoiceAmount)}
          </span>
        </div>
        <div className="invoice-balance-summary__fig">
          <span className="invoice-balance-summary__fig-label inline-flex items-center gap-1 flex-nowrap min-w-0">
            Confirmed received
            {statusBadgePlacement === 'confirmed' ? statusBadge : null}
          </span>
          <span className="invoice-balance-summary__fig-value financial-nums">
            {formatCurrency(receivedToDate)}
          </span>
        </div>
        {pending > 0 && (
          <div className="invoice-balance-summary__fig invoice-balance-summary__fig--pending">
            <span className="invoice-balance-summary__fig-label">Pending confirmation</span>
            <span
              className="invoice-balance-summary__fig-value financial-nums"
              style={{ color: c.warning }}
            >
              {formatCurrency(pending)}
            </span>
          </div>
        )}
        {shortPending > 0 && (
          <div className="invoice-balance-summary__fig invoice-balance-summary__fig--short-pending">
            <span className="invoice-balance-summary__fig-label">Pending correction</span>
            <span
              className="invoice-balance-summary__fig-value financial-nums"
              style={{ color: c.error }}
            >
              −{formatCurrency(shortPending)}
            </span>
          </div>
        )}
        {regularApplying > 0 && (
          <div className="invoice-balance-summary__fig">
            <span className="invoice-balance-summary__fig-label">This payment</span>
            <span className="invoice-balance-summary__fig-value financial-nums">
              {formatCurrency(regularApplying)}
            </span>
          </div>
        )}
        {correction > 0 && (
          <div className="invoice-balance-summary__fig invoice-balance-summary__fig--short-pending">
            <span className="invoice-balance-summary__fig-label">This correction</span>
            <span
              className="invoice-balance-summary__fig-value financial-nums"
              style={{ color: c.error }}
            >
              −{formatCurrency(correction)}
            </span>
          </div>
        )}
        <div
          className={`invoice-balance-summary__fig invoice-balance-summary__fig--balance invoice-balance-summary__fig--${writtenOff ? 'written-off' : current.tone}`}
          style={{ backgroundColor: toneBg(current.tone) }}
        >
          <span className="invoice-balance-summary__fig-label inline-flex items-center gap-1 flex-nowrap min-w-0">
            {(pending > 0 || shortPending > 0) && current.tone === 'zero'
              ? 'Paid in full when confirmed'
              : current.tone === 'open' || current.tone === 'short'
                ? 'Outstanding'
                : current.label}
            {statusBadgePlacement === 'balance' ? statusBadge : null}
          </span>
          <span
            className="invoice-balance-summary__fig-value invoice-balance-summary__fig-value--balance financial-nums"
            style={{ color: toneColor(current.tone) }}
          >
            {formatSignedInvoiceBalanceDisplay(current)}
          </span>
        </div>
      </div>

      {showProjected && (
        <div
          className={`invoice-balance-summary__projected invoice-balance-summary__fig--${projected.tone}`}
          style={{ borderColor: `${toneColor(projected.tone)}44` }}
        >
          <div className="invoice-balance-summary__projected-main">
            <span className="invoice-balance-summary__projected-label">
              {shortCorrectionAwaitingConfirm && correction > 0
                ? 'Total after client confirms correction'
                : 'Total after this payment'}
            </span>
            <span className="invoice-balance-summary__projected-total financial-nums">
              {formatCurrency(projectedTotal)}
            </span>
          </div>
          <div className="invoice-balance-summary__projected-breakdown">
            <span>
              {formatCurrency(projectedConfirmed)} confirmed
              {projectedPending > 0 && <> · {formatCurrency(projectedPending)} pending</>}
              {projectedShortPending > 0 && (
                <> · −{formatCurrency(projectedShortPending)} correction pending</>
              )}
            </span>
            <span
              className="invoice-balance-summary__projected-value financial-nums"
              style={{ color: toneColor(projected.tone) }}
            >
              {projected.tone === 'zero'
                ? 'Paid in full'
                : formatSignedInvoiceBalanceDisplay(projected)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
