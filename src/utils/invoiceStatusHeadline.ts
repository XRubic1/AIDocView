import type { Invoice, InvoiceNote } from '../types/invoice'
import { getOpenDisputes } from '../services/clientInvoiceActions'
import { isReceiptDisputeHold } from '../services/paymentReceiptConfirmationService'
import { invoiceHasOpenDisputedStatus } from './clientInvoiceDisputeStatus'
import { invoiceHasWillPayStatus } from './invoiceWillPay'

export type InvoiceStatusHeadlineKind =
  | 'will_pay'
  | 'call_back'
  | 'dispute'
  | 'hold'
  | 'released'

export type InvoiceNoteStatusDisplay =
  | 'will_pay'
  | 'call_back'
  | 'open_disputed'
  | 'on_hold'
  | null

export interface InvoiceStatusHeadline {
  kind: InvoiceStatusHeadlineKind
  /** ISO timestamp used to pick the latest note. */
  at: string
  title: string
  /** Carrier-facing body (extra text after the status label). */
  note: string
  scheduledDate: string | null
}

type Candidate = InvoiceStatusHeadline & { seq: number }

const SLASH_DATE = /(\d{1,2}\/\d{1,2}\/\d{4})/

/** Format YYYY-MM-DD as MM/DD/YYYY without timezone shift. */
function formatYmd(ymd: string): string {
  const [year, month, day] = ymd.split('-')
  if (!year || !month || !day) return ymd
  return `${month}/${day}/${year}`
}

function slashDateToIso(raw: string): string | null {
  const match = raw.match(SLASH_DATE)
  if (!match) return null
  const [month, day, year] = match[1].split('/').map(Number)
  if (!month || !day || !year) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function noteTimeMs(iso: string | undefined): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/** Text after " — " on a Status: … note. */
function statusNoteExtra(text: string): string {
  const idx = text.indexOf(' — ')
  if (idx < 0) return ''
  return text.slice(idx + 3).trim()
}

function candidateFromStatusNote(note: InvoiceNote, seq: number): Candidate | null {
  const text = note.note?.trim() || ''
  if (!text) return null
  const isStatus = note.type === 'status_update' || /^status:/i.test(text)
  if (!isStatus) return null

  const at = note.created_at
  const extra = statusNoteExtra(text)
  const scheduledDate = slashDateToIso(text)

  if (/hold released/i.test(text) || /^documents accepted/i.test(text)) {
    return {
      kind: 'released',
      at,
      seq,
      title: 'Hold released',
      note: extra || text,
      scheduledDate: null,
    }
  }
  if (/will pay/i.test(text)) {
    return {
      kind: 'will_pay',
      at,
      seq,
      title: 'Will Pay',
      note: extra,
      scheduledDate,
    }
  }
  if (/call back/i.test(text)) {
    return {
      kind: 'call_back',
      at,
      seq,
      title: 'Call Back',
      note: extra,
      scheduledDate,
    }
  }
  return null
}

function candidateFromHoldNote(note: InvoiceNote, seq: number): Candidate | null {
  if (note.type !== 'hold_reason') return null
  const text = note.note?.trim() || ''
  if (!text) return null
  return {
    kind: 'hold',
    at: note.created_at,
    seq,
    title: 'On Hold',
    note: text,
    scheduledDate: null,
  }
}

function candidateFromDisputeNote(note: InvoiceNote, seq: number): Candidate | null {
  const text = note.note?.trim() || ''
  if (note.type !== 'dispute' && !/^dispute opened/i.test(text)) return null
  if (/resolved|closed/i.test(text)) return null
  return {
    kind: 'dispute',
    at: note.created_at,
    seq,
    title: 'Open dispute',
    note: text.replace(/^dispute opened:\s*/i, '').trim() || text,
    scheduledDate: null,
  }
}

/**
 * Latest status-defining note on the invoice.
 * Newer On Hold / Will Pay / Call Back / dispute replaces whatever came before it.
 */
export function getInvoiceStatusHeadline(
  invoice: Pick<
    Invoice,
    | 'status'
    | 'notes_history'
    | 'disputes'
    | 'collection_status'
    | 'collection_date'
    | 'updated_at'
    | 'hold_reason'
  >
): InvoiceStatusHeadline | null {
  const candidates: Candidate[] = []
  let seq = 0
  const notes = invoice.notes_history ?? []
  const disputeNoteKeys = new Set<string>()

  for (const note of notes) {
    seq += 1
    if (note.visibility === 'internal') continue
    const fromHold = candidateFromHoldNote(note, seq)
    if (fromHold) {
      candidates.push(fromHold)
      continue
    }
    const fromStatus = candidateFromStatusNote(note, seq)
    if (fromStatus) {
      candidates.push(fromStatus)
      continue
    }
    const fromDispute = candidateFromDisputeNote(note, seq)
    if (fromDispute) {
      disputeNoteKeys.add(`${fromDispute.at}|${fromDispute.note}`)
      candidates.push(fromDispute)
    }
  }

  for (const dispute of getOpenDisputes(invoice as Invoice)) {
    const at = dispute.responded_at || dispute.created_at
    const note = dispute.description?.trim() || 'Under review with Credyx'
    if (disputeNoteKeys.has(`${dispute.created_at}|${note}`)) continue
    seq += 1
    candidates.push({
      kind: 'dispute',
      at,
      seq,
      title: 'Open dispute',
      note,
      scheduledDate: null,
    })
  }

  if (
    invoice.collection_status === 'W/P' &&
    !candidates.some((c) => c.kind === 'will_pay')
  ) {
    seq += 1
    candidates.push({
      kind: 'will_pay',
      at: invoice.updated_at || invoice.collection_date || '',
      seq,
      title: 'Will Pay',
      note: '',
      scheduledDate: invoice.collection_date?.trim() || null,
    })
  }

  if (
    invoice.collection_status === 'C/B' &&
    !candidates.some((c) => c.kind === 'call_back')
  ) {
    seq += 1
    candidates.push({
      kind: 'call_back',
      at: invoice.updated_at || invoice.collection_date || '',
      seq,
      title: 'Call Back',
      note: '',
      scheduledDate: invoice.collection_date?.trim() || null,
    })
  }

  if (
    invoice.status === 'hold' &&
    !isReceiptDisputeHold(invoice) &&
    !candidates.some((c) => c.kind === 'hold')
  ) {
    seq += 1
    candidates.push({
      kind: 'hold',
      at: invoice.updated_at || '',
      seq,
      title: 'On Hold',
      note: invoice.hold_reason?.trim() || '',
      scheduledDate: null,
    })
  }

  if (
    isReceiptDisputeHold(invoice) &&
    !candidates.some((c) => c.kind === 'dispute')
  ) {
    seq += 1
    candidates.push({
      kind: 'dispute',
      at: invoice.updated_at || '',
      seq,
      title: 'Open dispute',
      note: 'Payment receipt disputed — Credyx is reviewing.',
      scheduledDate: null,
    })
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const delta = noteTimeMs(b.at) - noteTimeMs(a.at)
    if (delta !== 0) return delta
    return b.seq - a.seq
  })

  const { seq: _seq, ...headline } = candidates[0]
  return headline
}

/**
 * Status pill driven by the latest note (On Hold / Will Pay / Call Back / Open Disputed).
 * Null means fall through to short paid / open / overdue / etc.
 */
export function getInvoiceNoteStatusDisplay(
  invoice: Invoice,
  options?: { paymentDisputed?: boolean }
): InvoiceNoteStatusDisplay {
  const headline = getInvoiceStatusHeadline(invoice)
  if (headline?.kind === 'hold') return 'on_hold'
  if (headline?.kind === 'will_pay') return 'will_pay'
  if (headline?.kind === 'call_back') return 'call_back'
  if (headline?.kind === 'dispute') return 'open_disputed'
  if (headline?.kind === 'released') {
    if (invoiceHasWillPayStatus(invoice)) return 'will_pay'
    if (invoice.collection_status === 'C/B') return 'call_back'
    return null
  }
  if (invoice.status === 'hold' && !isReceiptDisputeHold(invoice)) return 'on_hold'
  if (invoiceHasOpenDisputedStatus(invoice, options)) return 'open_disputed'
  if (invoiceHasWillPayStatus(invoice)) return 'will_pay'
  if (invoice.collection_status === 'C/B') return 'call_back'
  return null
}

/** Overview card for a winning Will Pay note — sits above an older open dispute. */
export function getWillPayOverviewNote(invoice: Invoice): { title: string; note: string } | null {
  const headline = getInvoiceStatusHeadline(invoice)
  if (headline?.kind !== 'will_pay') return null

  const dateLabel = headline.scheduledDate
    ? `Payment date ${formatYmd(headline.scheduledDate)}`
    : 'Broker scheduled a payment'
  const extra = headline.note.trim()
  return {
    title: 'Will Pay',
    note: extra ? `${dateLabel} — ${extra}` : dateLabel,
  }
}

/** Overview card when Call Back is the latest status note. */
export function getCallBackOverviewNote(invoice: Invoice): { title: string; note: string } | null {
  const headline = getInvoiceStatusHeadline(invoice)
  if (headline?.kind !== 'call_back') return null

  const dateLabel = headline.scheduledDate
    ? `Call back ${formatYmd(headline.scheduledDate)}`
    : 'Broker asked Credyx to call back'
  const extra = headline.note.trim()
  return {
    title: 'Call Back',
    note: extra ? `${dateLabel} — ${extra}` : dateLabel,
  }
}
