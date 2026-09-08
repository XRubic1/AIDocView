/**
 * Hold / dispute / claim invoices must not drive broker avg-pay or overdue.
 * The pay clock pauses until paperwork, a claim, or a dispute is resolved.
 */
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'

export type BrokerPayBlockReason = 'hold' | 'dispute' | 'claim'

export type InvoicePayClock = {
  paused: boolean
  hold: boolean
  dispute: boolean
  claim: boolean
  reasons: BrokerPayBlockReason[]
  /** Short UI label, e.g. "Hold — claim". */
  label: string | null
}

const CLAIM_RE =
  /\bclaim\b|cargo claim|loss\s*\/\s*damage|loss and damage|freight claim|os&d|overage.?shortage/i

function isActiveDisputeStatus(status: string | undefined): boolean {
  return status === 'open' || status === 'under_review'
}

function invoiceHasOpenDispute(invoice: Invoice): boolean {
  return (invoice.disputes ?? []).some((d) => isActiveDisputeStatus(d.status))
}

function paymentsHaveOpenDispute(payments: Payment[]): boolean {
  return payments.some(
    (p) => p.dispute && isActiveDisputeStatus(p.dispute.status)
  )
}

function looksLikeClaim(invoice: Invoice): boolean {
  const hold = invoice.hold_reason ?? ''
  const notes = invoice.notes ?? ''
  const disputeText = (invoice.disputes ?? [])
    .map((d) => `${d.reason} ${d.description}`)
    .join(' ')
  return CLAIM_RE.test(`${hold} ${notes} ${disputeText}`)
}

/**
 * Whether this invoice should be excluded from avg days-to-pay and open-overdue.
 */
export function classifyInvoicePayClock(
  invoice: Invoice,
  invoicePayments: Payment[] = []
): InvoicePayClock {
  const hold = invoice.status === 'hold'
  const dispute = invoiceHasOpenDispute(invoice) || paymentsHaveOpenDispute(invoicePayments)
  const claim = looksLikeClaim(invoice)
  const reasons: BrokerPayBlockReason[] = []
  if (hold) reasons.push('hold')
  if (dispute) reasons.push('dispute')
  if (claim && !reasons.includes('hold')) reasons.push('claim')
  else if (claim && hold) {
    // Hold already listed; claim is extra context in the label.
  }

  const paused = hold || dispute
  let label: string | null = null
  if (paused) {
    if (claim && hold) label = 'Hold — claim'
    else if (hold) label = 'Hold'
    else if (dispute && claim) label = 'Dispute — claim'
    else if (dispute) label = 'Dispute'
  } else if (claim) {
    label = 'Claim (collecting)'
  }

  return { paused, hold, dispute, claim, reasons, label }
}

/** Payments that belong to one invoice. */
export function paymentsForInvoice(payments: Payment[], invoiceId: string): Payment[] {
  return payments.filter((p) => p.invoice_id === invoiceId)
}

/** Map of invoice id → pay-clock classification. */
export function classifyBrokerInvoicePayClocks(
  invoices: Invoice[],
  payments: Payment[]
): Map<string, InvoicePayClock> {
  const byInvoice = new Map<string, Payment[]>()
  for (const p of payments) {
    const list = byInvoice.get(p.invoice_id) ?? []
    list.push(p)
    byInvoice.set(p.invoice_id, list)
  }

  const map = new Map<string, InvoicePayClock>()
  for (const inv of invoices) {
    map.set(inv.id, classifyInvoicePayClock(inv, byInvoice.get(inv.id) ?? []))
  }
  return map
}

export function isInvoicePayClockPaused(
  invoice: Invoice,
  payments: Payment[] = []
): boolean {
  return classifyInvoicePayClock(invoice, payments).paused
}
