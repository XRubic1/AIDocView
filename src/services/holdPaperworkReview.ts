import { getInvoiceById, updateInvoice } from '../data/mockInvoices'
import type { Invoice, InvoiceNote } from '../types/invoice'
import { mockBrokers } from '../data/mockBrokers'
import {
  resolveBrokerPaperworkEmail,
  sendBrokerPacketForInvoice,
} from '../utils/paperworkSender'
import {
  HOLD_DOCS_ACCEPTED_PREFIX,
  HOLD_DOCS_REJECTED_PREFIX,
  invoiceHasPendingHoldPaperworkReview,
} from '../utils/holdPaperworkReview'
import {
  notifyClientDocumentsAccepted,
  notifyClientDocumentsRejected,
} from '../data/mockNotifications'
import { notifyTenantDataUpdated } from './supabase/tenantDataLiveSync'
import { logAuditEvent } from '../utils/auditLogger'

function appendNote(invoice: Invoice, note: InvoiceNote): InvoiceNote[] {
  return [...(invoice.notes_history || []), note]
}

function flattenNotes(notes: InvoiceNote[]): string {
  return notes
    .filter((n) => n.visibility !== 'internal')
    .map((n) => n.note)
    .join('\n')
}

const CLOSED_INVOICE_STATUSES = new Set<Invoice['status']>([
  'paid',
  'written_off',
  'force_closed',
  'write_off_pending',
])

/**
 * Credyx accepts carrier docs: notify carrier, send broker packet, release hold if needed.
 */
export async function acceptHoldPaperwork(
  invoiceId: string,
  reviewedBy: string
): Promise<{ invoice?: Invoice; packetError?: string }> {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || !invoiceHasPendingHoldPaperworkReview(invoice)) {
    return { invoice }
  }

  const wasHold = invoice.status === 'hold'
  const now = new Date().toISOString()
  const broker = mockBrokers.find((b) => b.id === invoice.broker_id)
  const recipient = resolveBrokerPaperworkEmail(broker)
  let packetError: string | undefined
  let packetSent = false

  if (recipient) {
    const sent = await sendBrokerPacketForInvoice(invoice, {
      recipientEmail: recipient,
      sentBy: reviewedBy,
      skipIfAlreadySent: false,
      message: 'Revised paperwork after Credyx accepted carrier documents.',
    })
    packetSent = Boolean(sent.success && !sent.error)
    if (!sent.success) packetError = sent.error
  } else {
    packetError = 'No broker paperwork email on file'
  }

  const fresh = getInvoiceById(invoiceId) ?? invoice
  const noteText = packetSent
    ? `${HOLD_DOCS_ACCEPTED_PREFIX} — packet sent to broker.`
    : wasHold
      ? `${HOLD_DOCS_ACCEPTED_PREFIX} — hold released.${packetError ? ` Packet not sent: ${packetError}.` : ''}`
      : `${HOLD_DOCS_ACCEPTED_PREFIX}.${packetError ? ` Packet not sent: ${packetError}.` : ''}`

  const note: InvoiceNote = {
    id: `note-docs-accepted-${Date.now()}`,
    note: noteText,
    created_by: reviewedBy,
    created_at: now,
    type: 'status_update',
    visibility: 'client',
  }
  const notes_history = appendNote(fresh, note)

  const patch: Partial<Invoice> = {
    notes_history,
    notes: flattenNotes(notes_history),
  }
  if (wasHold) {
    patch.status = 'approved'
    patch.approved_by = reviewedBy
    patch.approved_at = now
    patch.hold_reason = undefined
  }

  const updated = updateInvoice(invoiceId, patch)

  if (updated) {
    if (wasHold) delete updated.hold_reason
    notifyClientDocumentsAccepted({
      clientId: updated.client_id,
      invoiceId: updated.id,
      invoiceNumber: updated.invoice_number,
      packetSent,
      holdReleased: wasHold,
      batchId: updated.batch_id,
      batchNumber: updated.batch_number,
    })
    logAuditEvent(
      'invoice_status_changed',
      'invoice',
      updated.id,
      updated.invoice_number,
      `${reviewedBy} accepted documents on ${updated.invoice_number}`,
      'admin',
      reviewedBy,
      'Admin',
      undefined,
      { packet_sent: packetSent, packet_error: packetError, released_hold: wasHold }
    )
    notifyTenantDataUpdated(['invoices'], updated.client_id)
  }

  return { invoice: updated, packetError }
}

/**
 * Credyx rejects docs: place/keep hold, notify carrier with the reason.
 */
export function rejectHoldPaperwork(
  invoiceId: string,
  reason: string,
  reviewedBy: string
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  const trimmed = reason.trim()
  if (!invoice || !trimmed || !invoiceHasPendingHoldPaperworkReview(invoice)) {
    return invoice
  }

  const now = new Date().toISOString()
  const canHold = !CLOSED_INVOICE_STATUSES.has(invoice.status)
  const note: InvoiceNote = {
    id: `note-docs-rejected-${Date.now()}`,
    note: `${HOLD_DOCS_REJECTED_PREFIX} — ${trimmed}`,
    created_by: reviewedBy,
    created_at: now,
    type: canHold ? 'hold_reason' : 'status_update',
    visibility: 'client',
  }
  const notes_history = appendNote(invoice, note)

  const patch: Partial<Invoice> = {
    notes_history,
    notes: flattenNotes(notes_history),
  }
  if (canHold) {
    patch.status = 'hold'
    patch.hold_reason = trimmed
  }

  const updated = updateInvoice(invoiceId, patch)

  if (updated) {
    notifyClientDocumentsRejected({
      clientId: updated.client_id,
      invoiceId: updated.id,
      invoiceNumber: updated.invoice_number,
      reason: trimmed,
      batchId: updated.batch_id,
      batchNumber: updated.batch_number,
    })
    logAuditEvent(
      'invoice_status_changed',
      'invoice',
      updated.id,
      updated.invoice_number,
      `${reviewedBy} rejected documents on ${updated.invoice_number}`,
      'admin',
      reviewedBy,
      'Admin',
      undefined,
      { reason: trimmed }
    )
    notifyTenantDataUpdated(['invoices'], updated.client_id)
  }

  return updated
}
