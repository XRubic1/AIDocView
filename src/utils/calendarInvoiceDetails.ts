/**
 * Invoice facts for calendar event detail — purchase date, submitter, notes.
 */
import type { Invoice, InvoiceNote } from '../types/invoice'
import { clientVisibleNotes } from './clientInvoiceView'
import { formatDate, formatDateTime } from './format'

export type CalendarInvoiceNoteFact = {
  id: string
  text: string
  by: string
  atLabel: string
  typeLabel: string
}

export type CalendarInvoiceFacts = {
  invoiceId: string
  invoiceNumber: string
  brokerName: string
  loadNumber: string | null
  statusLabel: string
  /** Invoice / load date. */
  purchasedOn: string | null
  /** Carrier (and confirming user when known). */
  purchasedBy: string | null
  /** When the packet landed in Credyx, if different from the invoice date. */
  submittedOn: string | null
  notes: CalendarInvoiceNoteFact[]
}

const NOTE_CAP = 5
const NOTE_MAX_CHARS = 180

const NOTE_TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  client_note: 'Client note',
  hold_reason: 'On hold',
  approval: 'Approved',
  rejection: 'Rejected',
  dispute: 'Dispute',
  status_update: 'Status',
}

function ymd(raw?: string | null): string | null {
  if (!raw?.trim()) return null
  const t = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function truncateNote(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= NOTE_MAX_CHARS) return t
  return `${t.slice(0, NOTE_MAX_CHARS - 1).trimEnd()}…`
}

function statusLabel(status: Invoice['status']): string {
  switch (status) {
    case 'approved':
      return 'Open'
    case 'hold':
      return 'On hold'
    case 'paid':
      return 'Paid'
    case 'pending':
      return 'Pending'
    case 'review':
      return 'In review'
    case 'write_off_pending':
      return 'Write-off pending'
    case 'written_off':
      return 'Written off'
    case 'force_closed':
      return 'Closed'
    case 'rejected':
      return 'Rejected'
    default:
      return status
  }
}

/** Notes newest-first, with hold/free-text fallback when history is empty. */
function collectNotes(invoice: Invoice, includeInternal?: boolean): InvoiceNote[] {
  const raw = includeInternal
    ? [...(invoice.notes_history ?? [])]
    : clientVisibleNotes(invoice.notes_history)
  if (raw.length > 0) {
    return raw.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  const fallback: InvoiceNote[] = []
  if (invoice.hold_reason) {
    fallback.push({
      id: 'hold-fallback',
      note: invoice.hold_reason,
      created_by: invoice.reviewed_by || 'Credyx',
      created_at: invoice.reviewed_at || invoice.updated_at || invoice.created_at,
      type: 'hold_reason',
    })
  }
  if (invoice.notes) {
    fallback.push({
      id: 'note-fallback',
      note: invoice.notes,
      created_by: invoice.reviewed_by || 'Credyx',
      created_at: invoice.created_at,
      type: 'note',
    })
  }
  return fallback
}

/**
 * Who submitted / purchased this invoice — confirming user, else the carrier.
 */
export function resolveInvoicePurchasedBy(invoice: Invoice): string | null {
  const person = invoice.ai_confirmed_by?.trim() || ''
  const carrier = invoice.client_name?.trim() || ''
  if (person && carrier && person.toLowerCase() !== carrier.toLowerCase()) {
    return `${person} · ${carrier}`
  }
  return person || carrier || null
}

/**
 * Build scannable invoice facts for the calendar detail rail.
 */
export function buildCalendarInvoiceFacts(
  invoice: Invoice,
  options?: { includeInternal?: boolean; maxNotes?: number }
): CalendarInvoiceFacts {
  const purchasedYmd = ymd(invoice.invoice_date)
  const submittedYmd = ymd(invoice.created_at)
  const submittedOn =
    submittedYmd && submittedYmd !== purchasedYmd ? formatDate(invoice.created_at) : null

  const cap = options?.maxNotes ?? NOTE_CAP
  const notes = collectNotes(invoice, options?.includeInternal)
    .slice(0, cap)
    .map((n) => ({
      id: n.id,
      text: truncateNote(n.note),
      by: n.created_by?.trim() || 'Credyx',
      atLabel: formatDateTime(n.created_at),
      typeLabel: NOTE_TYPE_LABELS[n.type ?? 'note'] ?? 'Note',
    }))

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    brokerName: invoice.broker_name,
    loadNumber: invoice.load_number?.trim() || null,
    statusLabel: statusLabel(invoice.status),
    purchasedOn: purchasedYmd ? formatDate(invoice.invoice_date) : null,
    purchasedBy: resolveInvoicePurchasedBy(invoice),
    submittedOn,
    notes,
  }
}

/** Find the invoice attached to a calendar event. */
export function findCalendarInvoice(
  invoices: Invoice[],
  opts: { invoiceId?: string; invoiceNumber?: string; clientId?: string }
): Invoice | undefined {
  const id = opts.invoiceId?.trim()
  if (id && id !== '—') {
    const byId = invoices.find((inv) => inv.id === id)
    if (byId) return byId
  }
  const number = opts.invoiceNumber?.trim()
  if (!number || number === '—') return undefined
  const matches = invoices.filter((inv) => inv.invoice_number === number)
  if (opts.clientId) {
    const scoped = matches.find((inv) => inv.client_id === opts.clientId)
    if (scoped) return scoped
  }
  return matches[0]
}
