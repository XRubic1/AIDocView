import { getInvoiceById, updateInvoice, updateInvoiceAsync } from '../data/mockInvoices'
import { Invoice, InvoiceDispute, InvoiceNote } from '../types/invoice'
import type { Payment } from '../types/payment'
import { formatCurrency } from '../utils/format'
import {
  canCloseShortPaymentAsUncollectable,
  getInvoiceReceivedAmount,
  getShortfallAmount,
  isShortPaymentInvoice,
} from '../utils/shortPayments'
import {
  canAcceptOverpayment,
} from '../utils/overPayments'
import { getOverageAmount } from '../utils/paymentVariance'
import { addInvoiceDocuments } from './invoiceDocumentStore'
import { notifyAdminClientDocumentUpload, notifyAdminWriteOffRequested } from './adminNotificationService'
import type { ClientCapabilities } from '../utils/clientCapabilities'
import { getClientCapabilities } from '../utils/clientCapabilities'
import { getClientById } from './clientRegistry'
import { logAuditEvent } from '../utils/auditLogger'

const DISPUTE_REASON_LABELS: Record<string, string> = {
  amount_discrepancy: 'Amount discrepancy',
  missing_documents: 'Missing documents',
  broker_rejection: 'Broker rejection',
  payment_delay: 'Payment delay',
  other: 'Other',
}

export function getDisputeReasonLabel(reason: string): string {
  return DISPUTE_REASON_LABELS[reason] || reason
}

export const DISPUTE_REASON_OPTIONS = [
  { value: 'amount_discrepancy', label: 'Amount discrepancy' },
  { value: 'missing_documents', label: 'Missing documents' },
  { value: 'broker_rejection', label: 'Broker rejection' },
  { value: 'payment_delay', label: 'Payment delay' },
  { value: 'other', label: 'Other' },
] as const

/** Append a client-authored note to an invoice in the mock store. */
export function addClientInvoiceNote(
  invoiceId: string,
  noteText: string,
  authorName: string
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || !noteText.trim()) return undefined

  const newNote: InvoiceNote = {
    id: `note-${Date.now()}`,
    note: noteText.trim(),
    created_by: authorName,
    created_at: new Date().toISOString(),
    type: 'client_note',
  }

  const notesHistory = [...(invoice.notes_history || []), newNote]
  const notes = invoice.notes ? `${invoice.notes}\n${noteText.trim()}` : noteText.trim()

  return updateInvoice(invoiceId, {
    notes_history: notesHistory,
    notes,
  })
}

/** Open a new dispute on an invoice and log it in notes history. */
export function openClientInvoiceDispute(
  invoiceId: string,
  reason: string,
  description: string,
  authorName: string
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || !description.trim()) return undefined

  const reasonLabel = getDisputeReasonLabel(reason)
  const dispute: InvoiceDispute = {
    id: `dispute-${Date.now()}`,
    reason,
    description: description.trim(),
    status: 'open',
    created_by: authorName,
    created_at: new Date().toISOString(),
  }

  const disputeNote: InvoiceNote = {
    id: `note-dispute-${Date.now()}`,
    note: `Dispute opened: ${reasonLabel} — ${description.trim()}`,
    created_by: authorName,
    created_at: new Date().toISOString(),
    type: 'dispute',
  }

  const disputes = [...(invoice.disputes || []), dispute]
  const notesHistory = [...(invoice.notes_history || []), disputeNote]

  return updateInvoice(invoiceId, {
    disputes,
    notes_history: notesHistory,
  })
}

export function getOpenDisputes(invoice: Invoice): InvoiceDispute[] {
  return (invoice.disputes || []).filter((d) => d.status === 'open' || d.status === 'under_review')
}

export type InvoiceDisputeBadgeVariant = 'open' | 'reviewing' | 'responded'

export interface InvoiceDisputeBadge {
  label: string
  variant: InvoiceDisputeBadgeVariant
}

/**
 * Single dispute badge for invoice list rows.
 *
 * Cycle: Disputed → Response ready → (client opens new dispute) → Disputed → Response ready …
 * Open disputes always beat a prior response-ready state on the same invoice.
 */
export function getInvoiceDisputeRowBadge(invoice: Invoice): InvoiceDisputeBadge | null {
  const disputes = invoice.disputes ?? []
  if (disputes.length === 0) return null

  const open = disputes.filter((d) => d.status === 'open')
  const active = disputes.filter((d) => d.status === 'open' || d.status === 'under_review')
  const withResponse = disputes.filter((d) => d.response?.trim())

  // Client opened a dispute — show disputed (overrides any older response-ready badge).
  if (open.length > 0) {
    if (active.length > 1) {
      return { label: `${active.length} disputes`, variant: 'open' }
    }
    return { label: 'Disputed', variant: 'open' }
  }

  if (active.length > 1) {
    return { label: `${active.length} disputes`, variant: 'open' }
  }

  if (active.length === 1) {
    const dispute = active[0]
    if (dispute.response?.trim()) {
      return { label: 'Response ready', variant: 'responded' }
    }
    return { label: 'Disputed', variant: 'open' }
  }

  if (withResponse.length > 0) {
    return { label: 'Response ready', variant: 'responded' }
  }

  return null
}

export interface ClientMarkPaidOptions {
  amountReceived: number
  optionalNote?: string
  paymentDate?: string
  receivedDate?: string
  paymentMethod?: Payment['payment_method']
  paymentReference?: string
}

/** Re-export — all mark-as-paid paths use postClientPayment under the hood. */
export { markClientInvoiceAsPaid } from './clientPaymentService'

export function buildPaymentConfirmationNote(
  invoiceAmount: number,
  amountReceived: number,
  optionalNote?: string
): string {
  const diff = invoiceAmount - amountReceived
  let amountPart: string

  if (Math.abs(diff) < 0.01) {
    amountPart = `paid in full (${formatCurrency(amountReceived)})`
  } else if (diff > 0) {
    amountPart = `received ${formatCurrency(amountReceived)} (short by ${formatCurrency(diff)})`
  } else {
    amountPart = `received ${formatCurrency(amountReceived)} (over by ${formatCurrency(Math.abs(diff))})`
  }

  const base = `Payment confirmed by client — ${amountPart}`
  return optionalNote?.trim() ? `${base}. ${optionalNote.trim()}` : base
}

export interface CloseUncollectableOptions {
  note: string
}

/**
 * Write off the remaining balance on a short-paid invoice.
 * Written-off invoices are fee-exempt (unlike admin force-close for collections).
 */
export function closeClientInvoiceAsUncollectable(
  invoiceId: string,
  authorName: string,
  options: CloseUncollectableOptions,
  payments: Payment[],
  capabilities?: Pick<ClientCapabilities, 'canRequestWriteOff'>
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || !options.note.trim()) return undefined

  const caps = getClientCapabilities(getClientById(invoice.client_id)?.service_tier)
  if (!(capabilities?.canRequestWriteOff ?? caps.canRequestWriteOff)) return undefined
  if (!canCloseShortPaymentAsUncollectable(invoice)) return undefined
  if (payments.some((p) => p.invoice_id === invoiceId && p.status === 'pending')) return undefined

  const received = getInvoiceReceivedAmount(invoice, payments)
  if (!isShortPaymentInvoice(invoice, payments)) return undefined

  const shortfall = getShortfallAmount(invoice, received)
  const now = new Date().toISOString()
  const confirmNote: InvoiceNote = {
    id: `note-close-confirm-${Date.now()}`,
    note: `Payment confirmed by client — ${formatCurrency(received)} received`,
    created_by: authorName,
    created_at: now,
    type: 'client_note',
  }
  const writeOffNote: InvoiceNote = {
    id: `note-close-writeoff-${Date.now() + 1}`,
    note: `Write-off ${formatCurrency(shortfall)} — ${options.note.trim()}`,
    created_by: authorName,
    created_at: new Date(Date.now() + 1000).toISOString(),
    type: 'client_note',
  }

  const notesHistory = [...(invoice.notes_history || []), confirmNote, writeOffNote]

  const updated = updateInvoice(invoiceId, {
    status: 'write_off_pending',
    paid_amount: received,
    notes_history: notesHistory,
    write_off_request: {
      requested_by: authorName,
      requested_at: now,
      client_note: options.note.trim(),
      received_amount: received,
      shortfall,
    },
    updated_at: now,
  })

  if (updated) {
    notifyAdminWriteOffRequested({
      clientId: updated.client_id,
      clientName: updated.client_name,
      invoiceNumber: updated.invoice_number,
      shortfall,
    })

    logAuditEvent(
      'invoice_closed',
      'invoice',
      updated.id,
      updated.invoice_number,
      `${authorName} requested write-off on ${updated.invoice_number} (${formatCurrency(shortfall)} balance)`,
      'client-portal',
      authorName,
      'Client',
      undefined,
      { close_type: 'write_off_requested', received, shortfall }
    )
  }

  return updated
}

export interface AcceptOverpaymentOptions {
  note: string
}

/**
 * Accept excess payment on an overpaid invoice — records the overage for accounting
 * and marks the variance resolved (invoice stays paid at received amount).
 */
export function acceptClientOverpayment(
  invoiceId: string,
  authorName: string,
  options: AcceptOverpaymentOptions,
  payments: Payment[]
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || !options.note.trim()) return undefined
  if (!canAcceptOverpayment(invoice, payments)) return undefined

  const received = getInvoiceReceivedAmount(invoice, payments)
  const overage = getOverageAmount(invoice, received)
  const now = new Date().toISOString()

  const acceptNote: InvoiceNote = {
    id: `note-over-accept-${Date.now()}`,
    note: `Overpayment accepted — received ${formatCurrency(received)} on ${formatCurrency(invoice.amount)} invoice (excess ${formatCurrency(overage)}). ${options.note.trim()}`,
    created_by: authorName,
    created_at: now,
    type: 'client_note',
  }

  const notesHistory = [...(invoice.notes_history || []), acceptNote]

  const updated = updateInvoice(invoiceId, {
    status: 'paid',
    paid_amount: received,
    overpayment_accepted_at: now,
    notes_history: notesHistory,
    days_since_expected: 0,
    updated_at: now,
  })

  if (updated) {
    logAuditEvent(
      'payment_received',
      'invoice',
      updated.id,
      updated.invoice_number,
      `${authorName} accepted overpayment on ${updated.invoice_number} (+${formatCurrency(overage)})`,
      'client-portal',
      authorName,
      'Client',
      undefined,
      { overage, received, invoice_amount: invoice.amount }
    )
  }

  return updated
}

/** Upload additional documents from the client invoice detail page. */
export async function uploadClientInvoiceDocuments(
  invoiceId: string,
  files: File[],
  uploadedBy: string
): Promise<Invoice | undefined> {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || files.length === 0) return undefined

  const added = await addInvoiceDocuments(invoiceId, files, uploadedBy, 'client')
  const fileNames = added.map((doc) => doc.file_name)
  const label =
    fileNames.length <= 3
      ? fileNames.join(', ')
      : `${fileNames.slice(0, 3).join(', ')} +${fileNames.length - 3} more`

  const uploadNote: InvoiceNote = {
    id: `note-upload-${Date.now()}`,
    note: `Uploaded ${added.length} document${added.length > 1 ? 's' : ''}: ${label}`,
    created_by: uploadedBy,
    created_at: new Date().toISOString(),
    type: 'client_note',
  }

  const documentDocIds = [...(invoice.document_doc_ids ?? []), ...added.map((doc) => doc.id)]

  const updated = await updateInvoiceAsync(invoiceId, {
    documents_count: (invoice.documents_count ?? 0) + added.length,
    document_doc_ids: documentDocIds,
    notes_history: [...(invoice.notes_history || []), uploadNote],
  })

  if (updated) {
    notifyAdminClientDocumentUpload({
      invoiceId: updated.id,
      invoiceNumber: updated.invoice_number,
      clientName: updated.client_name,
      fileNames,
      fileCount: added.length,
    })

    logAuditEvent(
      'document_uploaded',
      'document',
      updated.id,
      updated.invoice_number,
      `${uploadedBy} uploaded ${added.length} document(s) to ${updated.invoice_number}`,
      'client-portal',
      uploadedBy,
      'Client',
      undefined,
      { file_names: fileNames }
    )
  }

  return updated
}
