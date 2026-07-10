import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { isShortPayment } from '../types/payment'
import { formatCurrency } from './format'

/**
 * Fee credit when a short payment reimburses part of a collected invoice.
 * Proportional to fee originally charged: (short ÷ invoice) × original fee.
 *
 * Example: $1,000 invoice at 2% → $20 fee; $200 short → $2 credit.
 */
export function calculateProportionalFeeCredit(
  shortAmount: number,
  invoiceAmount: number,
  originalFeeCharged: number
): number {
  if (
    !Number.isFinite(shortAmount) ||
    !Number.isFinite(invoiceAmount) ||
    !Number.isFinite(originalFeeCharged) ||
    shortAmount <= 0 ||
    invoiceAmount <= 0 ||
    originalFeeCharged <= 0
  ) {
    return 0
  }

  const ratio = Math.min(1, shortAmount / invoiceAmount)
  return Math.round(ratio * originalFeeCharged * 100) / 100
}

/** Fee attributed to a confirmed payment at the given rate %. */
export function getPaymentAttributedFee(paymentAmount: number, ratePct: number): number {
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || !Number.isFinite(ratePct)) return 0
  return Math.round(paymentAmount * (ratePct / 100) * 100) / 100
}

/** Original fee charged on the parent payment slice (rate × parent amount). */
export function getParentPaymentOriginalFee(
  parentPayment: Payment,
  ratePct: number
): number {
  return getPaymentAttributedFee(parentPayment.amount, ratePct)
}

/** Fee credit for a short payment against a parent payment on an invoice. */
export function calculateShortPaymentFeeCredit(
  shortPayment: Payment,
  parentPayment: Payment,
  invoice: Invoice,
  ratePct: number
): number {
  if (!isShortPayment(shortPayment) || shortPayment.status !== 'confirmed') return 0

  const originalFee = getParentPaymentOriginalFee(parentPayment, ratePct)
  return calculateProportionalFeeCredit(shortPayment.amount, invoice.amount, originalFee)
}

export function formatShortPaymentFeeCreditDescription(
  invoiceNumber: string,
  shortAmount: number,
  feeCredit: number
): string {
  return `Short payment fee credit — ${invoiceNumber} (${formatCurrency(shortAmount)} reimbursed, ${formatCurrency(feeCredit)} fee credit)`
}
