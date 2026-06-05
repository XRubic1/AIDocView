import { getInvoiceById, updateInvoice } from '../data/mockInvoices'
import { Invoice, InvoiceDispute, InvoiceNote } from '../types/invoice'
import { formatCurrency } from '../utils/format'
import { addInvoiceDocuments } from './invoiceDocumentStore'
import { notifyAdminClientDocumentUpload } from './adminNotificationService'
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
}

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

/** Mark an approved open A/R invoice as paid (client confirms payment received). */
export function markClientInvoiceAsPaid(
  invoiceId: string,
  authorName: string,
  options: ClientMarkPaidOptions
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || invoice.status !== 'approved') return undefined

  const amountReceived = options.amountReceived
  if (!Number.isFinite(amountReceived) || amountReceived <= 0) return undefined

  const noteText = buildPaymentConfirmationNote(
    invoice.amount,
    amountReceived,
    options.optionalNote
  )

  const paidNote: InvoiceNote = {
    id: `note-paid-${Date.now()}`,
    note: noteText,
    created_by: authorName,
    created_at: new Date().toISOString(),
    type: 'client_note',
  }

  const notesHistory = [...(invoice.notes_history || []), paidNote]

  return updateInvoice(invoiceId, {
    status: 'paid',
    paid_amount: amountReceived,
    notes_history: notesHistory,
    days_since_expected: 0,
  })
}

/** Upload additional documents from the client invoice detail page. */
export function uploadClientInvoiceDocuments(
  invoiceId: string,
  files: File[],
  uploadedBy: string
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || files.length === 0) return undefined

  const added = addInvoiceDocuments(invoiceId, files, uploadedBy, 'client')
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

  const updated = updateInvoice(invoiceId, {
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
