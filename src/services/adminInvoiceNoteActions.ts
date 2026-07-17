import { getInvoiceById, updateInvoice } from '../data/mockInvoices'
import type { Invoice, InvoiceNote } from '../types/invoice'
import { formatDate } from '../utils/format'

export type AdminNoteVisibility = 'client' | 'internal'

export type InvoiceStatusNoteKind = 'will_pay' | 'call_back' | 'payment_confirmed'

const STATUS_NOTE_LABELS: Record<InvoiceStatusNoteKind, string> = {
  will_pay: 'Will Pay',
  call_back: 'Call Back',
  payment_confirmed: 'Payment status confirmed',
}

export function getInvoiceStatusNoteLabel(kind: InvoiceStatusNoteKind): string {
  return STATUS_NOTE_LABELS[kind]
}

export function collectionStatusLabel(status?: Invoice['collection_status']): string | null {
  if (status === 'W/P') return 'Will Pay'
  if (status === 'C/B') return 'Call Back'
  return null
}

function appendNote(
  invoice: Invoice,
  note: InvoiceNote
): { notes_history: InvoiceNote[]; notes: string } {
  const notes_history = [...(invoice.notes_history || []), note]
  // Keep legacy flat notes client-facing only (internal stays out of the concatenated string).
  const notes =
    note.visibility === 'internal'
      ? invoice.notes || ''
      : invoice.notes
        ? `${invoice.notes}\n${note.note}`
        : note.note
  return { notes_history, notes }
}

/**
 * Credyx-authored free-text note.
 * Default visibility is `client` (carrier can see); set `internal` for Credyx-only.
 */
export function addAdminInvoiceNote(
  invoiceId: string,
  noteText: string,
  authorName: string,
  options?: { visibility?: AdminNoteVisibility }
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || !noteText.trim()) return undefined

  const visibility = options?.visibility ?? 'client'
  const newNote: InvoiceNote = {
    id: `note-admin-${Date.now()}`,
    note: noteText.trim(),
    created_by: authorName,
    created_at: new Date().toISOString(),
    type: 'note',
    visibility,
  }

  return updateInvoice(invoiceId, appendNote(invoice, newNote))
}

export interface PostInvoiceStatusNoteInput {
  kind: InvoiceStatusNoteKind
  authorName: string
  /** Required for Will Pay / Call Back. */
  collectionDate?: string
  /** Optional extra context shown after the status label (carrier-visible). */
  extraNote?: string
}

/**
 * Post an internal collection status with a carrier-visible status note.
 * Will Pay / Call Back update `collection_status` + `collection_date`.
 * Payment confirmed is a status note only (does not mark the invoice paid).
 */
export function postInvoiceStatusNote(
  invoiceId: string,
  input: PostInvoiceStatusNoteInput
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice) return undefined

  const label = STATUS_NOTE_LABELS[input.kind]
  const extra = input.extraNote?.trim()
  const date = input.collectionDate?.trim()

  if ((input.kind === 'will_pay' || input.kind === 'call_back') && !date) {
    return undefined
  }

  let body = `Status: ${label}`
  if (date && (input.kind === 'will_pay' || input.kind === 'call_back')) {
    body += ` · ${formatDate(date)}`
  }
  if (extra) body += ` — ${extra}`

  const newNote: InvoiceNote = {
    id: `note-status-${Date.now()}`,
    note: body,
    created_by: input.authorName,
    created_at: new Date().toISOString(),
    type: 'status_update',
    visibility: 'client',
  }

  const { notes_history, notes } = appendNote(invoice, newNote)
  const patch: Partial<Invoice> = { notes_history, notes }

  if (input.kind === 'will_pay') {
    patch.collection_status = 'W/P'
    patch.collection_date = date
  } else if (input.kind === 'call_back') {
    patch.collection_status = 'C/B'
    patch.collection_date = date
  }

  return updateInvoice(invoiceId, patch)
}
