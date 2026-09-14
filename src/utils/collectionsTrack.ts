/**
 * Open A/R collections track after an invoice is approved:
 * PPW sent → paperwork check (per broker) → broker confirmed → wait Net terms →
 * payment verify (call broker) → past-due urgent collection.
 */
import type { Broker } from '../types/broker'
import type { Invoice } from '../types/invoice'
import { COLLECTIONS_POLICY } from './collectionsPolicy'
import { daysFromYmd } from './collectionsPolicy'
import { getEffectiveInvoiceDueDate } from './invoiceAging'
import { getDaysSincePpwSent, getPpwSentAt } from './ppwSent'

/** Operational stage for Credyx collections work (overlay, not stored status). */
export type CollectionsTrackStage =
  | 'no_ppw'
  | 'ppw_waiting'
  | 'ppw_check'
  | 'payment_waiting'
  | 'payment_verify'
  | 'past_due_urgent'

export function isBrokerPaperworkConfirmed(invoice: Pick<Invoice, 'email_lifecycle'>): boolean {
  return invoice.email_lifecycle?.paperwork_status === 'good'
}

/** Days after PPW before paperwork-received check. Broker override, else Settings default (7). */
export function resolvePaperworkCheckDays(broker?: Pick<Broker, 'paperwork_status_check_days'> | null): number {
  const n = broker?.paperwork_status_check_days
  if (typeof n === 'number' && n > 0) return n
  return COLLECTIONS_POLICY.defaultPaperworkCheckDays
}

/**
 * Days after PPW before payment inquiry when the broker has no Net / due date.
 * Falls back to Settings default inquiry days.
 */
export function resolvePaymentInquiryDays(broker?: Pick<Broker, 'payment_status_inquiry_days'> | null): number {
  const n = broker?.payment_status_inquiry_days
  if (typeof n === 'number' && n >= 0) return n
  return COLLECTIONS_POLICY.defaultInquiryDays
}

export function collectionsTrackLabel(stage: CollectionsTrackStage): string {
  switch (stage) {
    case 'no_ppw':
      return 'PPW not sent'
    case 'ppw_waiting':
      return 'PPW waiting'
    case 'ppw_check':
      return 'PPW status check'
    case 'payment_waiting':
      return 'Payment waiting'
    case 'payment_verify':
      return 'Payment verify'
    case 'past_due_urgent':
      return 'Urgent collection'
    default:
      return stage
  }
}

export type CollectionsTrackInput = {
  invoice: Invoice
  broker?: Pick<Broker, 'paperwork_status_check_days' | 'payment_status_inquiry_days'> | null
  asOf?: Date
  paperworkCheckDays?: number
  paymentVerifyUrgentDays?: number
}

/**
 * Derive collections track for an open invoice.
 * Closed / pending / hold callers should skip this queue separately.
 */
export function getCollectionsTrackStage(input: CollectionsTrackInput): CollectionsTrackStage {
  const { invoice } = input
  const asOf = input.asOf ?? new Date()
  const ppwAt = getPpwSentAt(invoice)
  if (!ppwAt) return 'no_ppw'

  const checkDays = input.paperworkCheckDays ?? resolvePaperworkCheckDays(input.broker)
  const confirmed = isBrokerPaperworkConfirmed(invoice)
  const daysSincePpw = getDaysSincePpwSent(invoice, asOf.getTime()) ?? 0

  if (!confirmed) {
    if (daysSincePpw < checkDays) return 'ppw_waiting'
    return 'ppw_check'
  }

  const due = getEffectiveInvoiceDueDate(invoice)
  const urgentAfter = input.paymentVerifyUrgentDays ?? COLLECTIONS_POLICY.paymentVerifyUrgentDays

  if (due) {
    const daysPastDue = daysFromYmd(due, asOf)
    if (daysPastDue == null || daysPastDue < 0) return 'payment_waiting'
    if (daysPastDue >= urgentAfter) return 'past_due_urgent'
    return 'payment_verify'
  }

  // No Net / due date — wait inquiry days after PPW, then verify.
  const inquiryDays = resolvePaymentInquiryDays(input.broker)
  if (daysSincePpw < inquiryDays) return 'payment_waiting'
  if (daysSincePpw >= inquiryDays + urgentAfter) return 'past_due_urgent'
  return 'payment_verify'
}

/** Rows that belong in the visually distinct urgent-collection queue. */
export function isUrgentCollectionStage(stage: CollectionsTrackStage): boolean {
  return stage === 'past_due_urgent' || stage === 'no_ppw'
}
