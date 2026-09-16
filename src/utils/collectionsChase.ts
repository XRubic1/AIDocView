/**
 * Collections chase queue — days since PPW vs broker inquiry threshold.
 * AI email chase is future; Credyx uses this queue manually today.
 */
import type { Invoice } from '../types/invoice'
import type { Broker } from '../types/broker'
import { getDaysSincePpwSent, getPpwSentAt } from './ppwSent'
import { getInvoiceById, updateInvoice, updateInvoiceAsync } from '../data/mockInvoices'
import { sendTransactionalEmail } from '../services/emailService'
import { resolveBrokerPaperworkEmail } from './paperworkSender'
import { formatCurrency } from './format'
import { COLLECTIONS_POLICY } from './collectionsPolicy'
import {
  getCollectionsTrackStage,
  type CollectionsTrackStage,
} from './collectionsTrack'

/** Fallback inquiry age — live value is COLLECTIONS_POLICY.defaultInquiryDays. */
export const DEFAULT_INQUIRY_DAYS = 15
/** @deprecated Use COLLECTIONS_POLICY.followupAfterDays */
export const FOLLOWUP_AFTER_DAYS = 3
/** @deprecated Use COLLECTIONS_POLICY.needsAttentionAfterDays */
export const NEEDS_ATTENTION_AFTER_DAYS = 5

export type ChaseQueueStatus =
  | 'not_due'
  | 'due_for_inquiry'
  | 'awaiting_response'
  | 'due_for_followup'
  | 'needs_attention'
  | 'ppw_check_due'
  | 'payment_waiting'
  | 'payment_verify'
  | 'past_due_urgent'

export interface ChaseQueueItem {
  invoice: Invoice
  broker: Broker | undefined
  daysSincePpw: number
  inquiryThreshold: number
  preferredContact: Broker['preferred_contact']
  status: ChaseQueueStatus
  ppwSentAt: string
}

function resolveInquiryDays(broker: Broker | undefined): number {
  const n = broker?.payment_status_inquiry_days
  return typeof n === 'number' && n >= 0 ? n : COLLECTIONS_POLICY.defaultInquiryDays
}

function followupClock(invoice: Invoice, nowMs: number): ChaseQueueStatus {
  const lastInquiry = invoice.collections_last_inquiry_at
    ? new Date(invoice.collections_last_inquiry_at).getTime()
    : null

  if (!lastInquiry || !Number.isFinite(lastInquiry)) {
    return 'due_for_inquiry'
  }

  const daysSinceInquiry = Math.floor((nowMs - lastInquiry) / (1000 * 60 * 60 * 24))
  if (daysSinceInquiry >= COLLECTIONS_POLICY.needsAttentionAfterDays) return 'needs_attention'
  if (daysSinceInquiry >= COLLECTIONS_POLICY.followupAfterDays) return 'due_for_followup'
  return 'awaiting_response'
}

function chaseFromTrack(
  stage: CollectionsTrackStage,
  invoice: Invoice,
  nowMs: number
): ChaseQueueStatus {
  if (invoice.collections_needs_attention) return 'needs_attention'
  switch (stage) {
    case 'no_ppw':
      return 'not_due'
    case 'ppw_waiting':
      return 'not_due'
    case 'ppw_check': {
      const clock = followupClock(invoice, nowMs)
      return clock === 'due_for_inquiry' ? 'ppw_check_due' : clock
    }
    case 'payment_waiting':
      return 'payment_waiting'
    case 'payment_verify': {
      const clock = followupClock(invoice, nowMs)
      return clock === 'due_for_inquiry' ? 'payment_verify' : clock
    }
    case 'past_due_urgent':
      return 'past_due_urgent'
    default:
      return 'not_due'
  }
}

/** Classify chase status for one invoice. */
export function getChaseStatus(invoice: Invoice, broker: Broker | undefined, nowMs = Date.now()): ChaseQueueStatus {
  if (invoice.status === 'paid' || invoice.status === 'force_closed' || invoice.status === 'written_off') {
    return 'not_due'
  }

  const stage = getCollectionsTrackStage({
    invoice,
    broker,
    asOf: new Date(nowMs),
  })
  return chaseFromTrack(stage, invoice, nowMs)
}

/**
 * Build chase queue for open invoices that have PPW sent.
 * @returns Items sorted: needs_attention first, then followup, then inquiry.
 */
export function buildCollectionsChaseQueue(
  invoices: Invoice[],
  brokers: Broker[],
  nowMs = Date.now()
): ChaseQueueItem[] {
  const brokerById = new Map(brokers.map((b) => [b.id, b]))
  const items: ChaseQueueItem[] = []

  for (const invoice of invoices) {
    if (
      invoice.status === 'paid' ||
      invoice.status === 'force_closed' ||
      invoice.status === 'written_off' ||
      invoice.status === 'write_off_pending' ||
      invoice.status === 'hold' ||
      invoice.status === 'pending'
    ) {
      continue
    }

    const ppwSentAt = getPpwSentAt(invoice)
    if (!ppwSentAt) continue

    const days = getDaysSincePpwSent(invoice, nowMs)
    if (days == null) continue

    const broker = brokerById.get(invoice.broker_id)
    const status = getChaseStatus(invoice, broker, nowMs)
    if (status === 'not_due' || status === 'payment_waiting') continue

    items.push({
      invoice,
      broker,
      daysSincePpw: days,
      inquiryThreshold: resolveInquiryDays(broker),
      preferredContact: broker?.preferred_contact ?? 'either',
      status,
      ppwSentAt,
    })
  }

  const order: Record<ChaseQueueStatus, number> = {
    past_due_urgent: 0,
    needs_attention: 1,
    due_for_followup: 2,
    payment_verify: 3,
    ppw_check_due: 4,
    due_for_inquiry: 5,
    awaiting_response: 6,
    payment_waiting: 7,
    not_due: 8,
  }
  items.sort((a, b) => order[a.status] - order[b.status] || b.daysSincePpw - a.daysSincePpw)
  return items
}

/** Persist broker contacted + optional inquiry timestamp (manual Credyx action). */
export async function markBrokerContactedForCollections(
  invoiceId: string,
  opts: { asInquiry?: boolean; asFollowup?: boolean } = {}
): Promise<Invoice | undefined> {
  const now = new Date().toISOString()
  const inv = getInvoiceById(invoiceId)
  const noteText = opts.asInquiry
    ? 'Payment status inquiry emailed to broker.'
    : opts.asFollowup
      ? 'Payment status follow-up emailed to broker.'
      : 'Broker contacted (collections).'
  const history = [...(inv?.notes_history ?? [])]
  history.push({
    id: `note-contact-${Date.now()}`,
    note: noteText,
    created_by: 'Credyx',
    created_at: now,
    type: 'status_update',
    visibility: 'client',
  })
  const patch: Partial<Invoice> = {
    broker_contacted: true,
    last_broker_contact: now,
    notes_history: history,
    notes: inv?.notes ? `${inv.notes}\n${noteText}` : noteText,
  }
  if (opts.asInquiry) {
    patch.collections_last_inquiry_at = now
    patch.collections_needs_attention = false
  }
  if (opts.asFollowup) {
    patch.collections_followup_at = now
  }
  return updateInvoiceAsync(invoiceId, patch)
}

export async function markBrokerPaperworkConfirmed(
  invoiceId: string,
  authorName = 'Credyx'
): Promise<Invoice | undefined> {
  const inv = getInvoiceById(invoiceId)
  if (!inv) return undefined
  const now = new Date().toISOString()
  const lifecycle = {
    ...(inv.email_lifecycle ?? { paperwork_status: 'unknown' as const }),
    paperwork_status: 'good' as const,
    payment: {
      ...(inv.email_lifecycle?.payment ?? {}),
      startedAt: inv.email_lifecycle?.payment?.startedAt ?? now,
    },
  }
  const noteText = 'Status: Broker confirmed paperwork'
  const history = [...(inv.notes_history ?? [])]
  history.push({
    id: `note-ppw-confirmed-${Date.now()}`,
    note: noteText,
    created_by: authorName,
    created_at: now,
    type: 'status_update',
    visibility: 'client',
  })
  return updateInvoiceAsync(invoiceId, {
    email_lifecycle: lifecycle,
    collections_needs_attention: false,
    notes_history: history,
    notes: inv.notes ? `${inv.notes}\n${noteText}` : noteText,
  })
}

/** Update expected payment date from broker status (manual or future AI). */
export async function setExpectedPaymentFromBrokerStatus(
  invoiceId: string,
  expectedPaymentDate: string,
  note?: string
): Promise<Invoice | undefined> {
  const patch: Partial<Invoice> = {
    expected_payment_date: expectedPaymentDate,
    collections_needs_attention: false,
  }
  if (note?.trim()) {
    const inv = (await import('../data/mockInvoices')).getInvoiceById(invoiceId)
    const history = [...(inv?.notes_history ?? [])]
    history.push({
      id: `note-${Date.now()}`,
      note: note.trim(),
      created_by: 'Credyx',
      created_at: new Date().toISOString(),
      type: 'status_update',
      visibility: 'client',
    })
    patch.notes_history = history
  }
  return updateInvoiceAsync(invoiceId, patch)
}

/** Send payment-status inquiry email (manual trigger; AI will automate later). */
export async function sendBrokerPaymentStatusInquiry(
  invoice: Invoice,
  broker: Broker
): Promise<{ ok: boolean; error?: string }> {
  const email =
    broker.emails?.find((e) => e.category === 'accounting')?.email?.trim() ||
    resolveBrokerPaperworkEmail(broker) ||
    broker.email
  if (!email) return { ok: false, error: 'No broker email on file' }

  const result = await sendTransactionalEmail('broker_payment_status_inquiry', email, {
    invoiceNumber: invoice.invoice_number,
    loadNumber: invoice.load_number ?? '',
    amount: formatCurrency(invoice.amount),
    brokerName: broker.name,
  })

  if (result.ok) {
    await markBrokerContactedForCollections(invoice.id, { asInquiry: true })
    try {
      const { recordOutboundMessage } = await import('../services/emailLifecycleService')
      recordOutboundMessage({
        invoice,
        to: email,
        subject: `Payment status — Invoice ${invoice.invoice_number}`,
        body: `Payment status inquiry for load ${invoice.load_number ?? '—'} · ${formatCurrency(invoice.amount)}.`,
        templateId: 'broker_payment_status_inquiry',
        messageId: result.id,
      })
    } catch (err) {
      console.warn('[collectionsChase] inbox log failed', err)
    }
  }
  return result
}

/** Send follow-up email; after NEEDS_ATTENTION_AFTER_DAYS Credyx should mark needs attention. */
export async function sendBrokerPaymentStatusFollowup(
  invoice: Invoice,
  broker: Broker
): Promise<{ ok: boolean; error?: string }> {
  const email =
    broker.emails?.find((e) => e.category === 'accounting')?.email?.trim() ||
    resolveBrokerPaperworkEmail(broker) ||
    broker.email
  if (!email) return { ok: false, error: 'No broker email on file' }

  const result = await sendTransactionalEmail('broker_payment_status_followup', email, {
    invoiceNumber: invoice.invoice_number,
    brokerName: broker.name,
  })

  if (result.ok) {
    await markBrokerContactedForCollections(invoice.id, { asFollowup: true })
    try {
      const { recordOutboundMessage } = await import('../services/emailLifecycleService')
      recordOutboundMessage({
        invoice,
        to: email,
        subject: `Payment follow-up — Invoice ${invoice.invoice_number}`,
        body: `Payment status follow-up for load ${invoice.load_number ?? '—'}.`,
        templateId: 'broker_payment_status_followup',
        messageId: result.id,
      })
    } catch (err) {
      console.warn('[collectionsChase] inbox log failed', err)
    }
  }
  return result
}
