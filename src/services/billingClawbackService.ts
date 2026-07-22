import { mockPayments, getPaymentById } from '../data/mockPayments'
import { getInvoiceById } from '../data/mockInvoices'
import { getClientById } from './clientRegistry'
import {
  formatBillingPeriod,
  getBillForPeriod,
  parseBillingPeriod,
} from './arBillingService'
import { getReimbursementLedger, recordManualBillingCredit } from './reimbursementAccountService'
import { getPaymentAttributedFee } from '../utils/shortPaymentFeeCredit'
import { formatCurrency } from '../utils/format'
import type { Payment } from '../types/payment'
import type { BillingFeeTermsSnapshot, ClientBill } from '../types/billing'
import type { ReimbursementLedgerEntry } from '../types/reimbursement'

/** Suggested fee clawback when a billed collection is later reversed/unprocessed. */
export interface BillingFeeClawbackSuggestion {
  id: string
  clientId: string
  paymentId: string
  invoiceId: string
  invoiceNumber: string
  loadNumber?: string
  paymentAmount: number
  /** Fee amount to reimburse (from fee terms × payment). */
  feeCreditAmount: number
  /** Fee terms used for the suggestion (locked from the issued bill when present). */
  billedFeeTerms: BillingFeeTermsSnapshot
  /** Human label e.g. "1%" or "$50 flat". */
  billedFeeLabel: string
  /** Credyx bill period that included this collection (YYYY-MM). */
  billedPeriod: string
  billedBillId: string
  confirmedAt: string
  reversedAt: string
  reversalType?: 'moved' | 'unprocessed'
  reversalReason?: string
  /** System-generated explanation for the discount tab. */
  systemNote: string
  /** True when a ledger credit already exists for this payment. */
  reimbursed: boolean
  reimbursementEntry?: ReimbursementLedgerEntry
}

function periodFromIso(iso: string): { year: number; month: number } {
  const d = new Date(iso)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** Display label for locked / resolved fee terms. */
export function formatBilledFeeLabel(terms: BillingFeeTermsSnapshot): string {
  if (terms.fee_type === 'flat') {
    return `$${Number(terms.flat_fee_amount ?? 0).toFixed(2)} flat`
  }
  return `${terms.fee_percentage ?? 0}%`
}

/**
 * Resolve the fee terms that applied when the Credyx bill was issued.
 * Prefer bill.fee_terms_snapshot; else infer from line items; else current client terms.
 */
export function resolveBilledFeeTerms(
  bill: ClientBill,
  clientId: string
): BillingFeeTermsSnapshot | undefined {
  if (bill.fee_terms_snapshot?.fee_type) {
    return bill.fee_terms_snapshot
  }

  // Older bills may lack a snapshot — recover rate from the issued line description.
  for (const item of bill.line_items) {
    const pctMatch = item.description.match(/Collection fee — ([\d.]+)% of/i)
    if (pctMatch) {
      return { fee_type: 'percentage', fee_percentage: Number(pctMatch[1]) }
    }
    const flatMatch = item.description.match(/Collection fee — \$([\d.]+) ×/i)
    if (flatMatch) {
      return { fee_type: 'flat', flat_fee_amount: Number(flatMatch[1]) }
    }
  }

  const client = getClientById(clientId)
  const terms = client?.fee_terms
  if (!terms?.fee_type) return undefined
  return {
    fee_type: terms.fee_type,
    fee_percentage: terms.fee_percentage,
    flat_fee_amount: terms.flat_fee_amount,
  }
}

/**
 * Fee charged on a collected payment under the bill's locked fee terms.
 * Percentage → rate × payment; flat → flat amount when this was the invoice's
 * only billed collection in that period.
 */
export function estimateBilledFeeForPayment(
  payment: Payment,
  bill: ClientBill
): number {
  const terms = resolveBilledFeeTerms(bill, bill.client_id)
  if (!terms?.fee_type) return 0

  if (terms.fee_type === 'flat') {
    const flat = terms.flat_fee_amount ?? 0
    if (flat <= 0) return 0
    const period = parseBillingPeriod(bill.period)
    const siblings = mockPayments.filter((p) => {
      if (p.invoice_id !== payment.invoice_id) return false
      if (p.id === payment.id) return false
      if (p.status !== 'confirmed' && p.status !== 'reversed') return false
      const at = p.confirmed_at ?? p.received_date
      if (!at) return false
      const pp = periodFromIso(at)
      return pp.year === period.year && pp.month === period.month
    })
    // Other collections still count for the flat fee → no clawback.
    const otherStillBillable = siblings.some((p) => p.status === 'confirmed')
    return otherStillBillable ? 0 : roundMoney(flat)
  }

  const ratePct = terms.fee_percentage ?? 0
  return getPaymentAttributedFee(payment.amount, ratePct)
}

function buildSystemNote(
  payment: Payment,
  billedPeriod: string,
  feeCredit: number,
  bill: ClientBill,
  feeLabel: string
): string {
  const kind =
    payment.reversal_type === 'moved'
      ? 'moved to another invoice'
      : payment.reversal_type === 'unprocessed'
        ? 'unprocessed'
        : 'reversed'
  const reason = payment.reversal_reason ? ` Reason: ${payment.reversal_reason}.` : ''
  return (
    `Payment of ${formatCurrency(payment.amount)} on invoice ${payment.invoice_number} was ${kind} ` +
    `after Credyx bill ${billedPeriod} was issued (${bill.issued_at.slice(0, 10)}). ` +
    `Fee at bill time: ${feeLabel}. Suggested fee reimbursement: ${formatCurrency(feeCredit)}.${reason}`
  )
}

/**
 * List fee clawback suggestions for a client.
 * A payment qualifies when it was confirmed in period P, Credyx bill for P was already
 * issued at reversal time, and the payment is now reversed/unprocessed.
 */
export function listBillingFeeClawbackSuggestions(
  clientId: string
): BillingFeeClawbackSuggestion[] {
  const client = getClientById(clientId)
  if (!client) return []

  const ledger = getReimbursementLedger(clientId)
  const suggestions: BillingFeeClawbackSuggestion[] = []

  for (const payment of mockPayments) {
    if (payment.status !== 'reversed') continue
    if (!payment.confirmed_at || !payment.reversed_at) continue

    const invoice = getInvoiceById(payment.invoice_id)
    if (!invoice || invoice.client_id !== clientId) continue

    const billedPeriodObj = periodFromIso(payment.confirmed_at)
    const billedPeriod = formatBillingPeriod(billedPeriodObj)
    const bill = getBillForPeriod(clientId, billedPeriodObj)
    if (!bill) continue

    // Only if the Credyx invoice was already sent before the reversal.
    if (new Date(bill.issued_at).getTime() > new Date(payment.reversed_at).getTime()) {
      continue
    }

    const billedFeeTerms = resolveBilledFeeTerms(bill, clientId)
    if (!billedFeeTerms) continue

    const feeCredit = estimateBilledFeeForPayment(payment, bill)
    if (feeCredit <= 0) continue

    const billedFeeLabel = formatBilledFeeLabel(billedFeeTerms)
    const reimbursementEntry = ledger.find(
      (e) =>
        e.payment_id === payment.id &&
        e.credit_type === 'reversal_fee_reimbursement' &&
        e.status !== 'voided'
    )

    suggestions.push({
      id: `clawback-${payment.id}`,
      clientId,
      paymentId: payment.id,
      invoiceId: payment.invoice_id,
      invoiceNumber: payment.invoice_number,
      loadNumber: payment.load_number ?? invoice.load_number,
      paymentAmount: payment.amount,
      feeCreditAmount: feeCredit,
      billedFeeTerms,
      billedFeeLabel,
      billedPeriod,
      billedBillId: bill.id,
      confirmedAt: payment.confirmed_at,
      reversedAt: payment.reversed_at,
      reversalType: payment.reversal_type,
      reversalReason: payment.reversal_reason,
      systemNote: buildSystemNote(payment, billedPeriod, feeCredit, bill, billedFeeLabel),
      reimbursed: Boolean(reimbursementEntry),
      reimbursementEntry,
    })
  }

  return suggestions.sort((a, b) => b.reversedAt.localeCompare(a.reversedAt))
}

/**
 * Manually approve a clawback suggestion → credit on account for next Credyx invoice.
 */
export async function approveBillingFeeClawback(
  suggestionId: string,
  options?: { createdBy?: string }
): Promise<ReimbursementLedgerEntry> {
  const paymentId = suggestionId.replace(/^clawback-/, '')
  const payment = getPaymentById(paymentId)
  if (!payment || payment.status !== 'reversed') {
    throw new Error('Reversed payment not found')
  }

  const invoice = getInvoiceById(payment.invoice_id)
  if (!invoice) throw new Error('Invoice not found')

  const suggestions = listBillingFeeClawbackSuggestions(invoice.client_id)
  const suggestion = suggestions.find((s) => s.id === suggestionId)
  if (!suggestion) {
    throw new Error('This payment is not eligible for fee reimbursement (bill may not have been issued)')
  }
  if (suggestion.reimbursed) {
    throw new Error('This reversal was already reimbursed')
  }

  return recordManualBillingCredit({
    clientId: suggestion.clientId,
    amount: suggestion.feeCreditAmount,
    creditType: 'reversal_fee_reimbursement',
    reason: `Fee reimbursement — ${suggestion.invoiceNumber} reversed after bill ${suggestion.billedPeriod} (billed at ${suggestion.billedFeeLabel})`,
    note: suggestion.systemNote,
    invoiceId: suggestion.invoiceId,
    invoiceNumber: suggestion.invoiceNumber,
    createdBy: options?.createdBy ?? 'admin',
    paymentId: suggestion.paymentId,
  })
}
