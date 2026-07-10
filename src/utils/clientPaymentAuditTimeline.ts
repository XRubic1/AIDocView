import { getPaymentById } from '../data/mockPayments'
import type { AuditLog } from '../types/audit'
import type { Invoice, InvoiceNote } from '../types/invoice'
import type { Payment } from '../types/payment'
import { getAllAuditLogs } from './auditLogger'
import { clientVisibleNotes } from './clientInvoiceView'
import { formatCurrency } from './format'
import { CREDYX_FORCE_CONFIRM_ACTOR, PAYMENT_STATUS_LABELS } from './paymentStatus'

export type PaymentAuditTone = 'neutral' | 'success' | 'warning' | 'error' | 'info'

export interface PaymentAuditTimelineEntry {
  id: string
  timestamp: string
  title: string
  detail: string
  tone: PaymentAuditTone
  kind: 'activity' | 'note'
}

const METHOD_LABELS: Record<string, string> = {
  check: 'Check',
  wire: 'Wire',
  ach: 'ACH',
  credit_card: 'Card',
}

function pushNote(entries: PaymentAuditTimelineEntry[], note: InvoiceNote) {
  const titleByType: Record<string, string> = {
    dispute: 'Dispute',
    client_note: 'Client note',
    hold_reason: 'On hold',
    approval: 'Approved',
    rejection: 'Rejected',
    note: 'Note',
  }
  entries.push({
    id: `note-${note.id}`,
    timestamp: note.created_at,
    title: titleByType[note.type ?? 'note'] ?? 'Update',
    detail: note.note,
    tone: note.type === 'dispute' ? 'warning' : 'neutral',
    kind: 'note',
  })
}

function paymentTone(status: Payment['status']): PaymentAuditTone {
  switch (status) {
    case 'confirmed':
      return 'success'
    case 'reversed':
    case 'rejected':
      return 'error'
    case 'disputed':
    case 'awaiting_receipt':
    case 'pending':
      return 'warning'
    default:
      return 'info'
  }
}

function pushPaymentActivity(entries: PaymentAuditTimelineEntry[], payment: Payment) {
  const method = METHOD_LABELS[payment.payment_method] ?? payment.payment_method
  const statusLabel = PAYMENT_STATUS_LABELS[payment.status] ?? payment.status
  const credyxForceConfirmed =
    payment.status === 'confirmed' && payment.client_confirmed_by === CREDYX_FORCE_CONFIRM_ACTOR
  let detail = `${formatCurrency(payment.amount)} · ${method}`
  if (payment.payment_reference) detail += ` · Ref ${payment.payment_reference}`
  if (payment.notes) detail += ` — ${payment.notes}`

  let title: string
  if (credyxForceConfirmed) {
    title =
      payment.payment_kind === 'short'
        ? 'Credyx confirmed correction'
        : 'Credyx closed invoice'
  } else {
    title = `Payment ${statusLabel}`
  }

  entries.push({
    id: `payment-${payment.id}`,
    timestamp: payment.received_date || payment.payment_date,
    title,
    detail,
    tone: paymentTone(payment.status),
    kind: 'activity',
  })

  if (payment.moved_from_payment_id) {
    const source = getPaymentById(payment.moved_from_payment_id)
    entries.push({
      id: `move-in-${payment.id}`,
      timestamp: payment.received_date || payment.payment_date,
      title: 'Funds posted from another invoice',
      detail: source
        ? `${formatCurrency(payment.amount)} moved from ${source.invoice_number}${
            source.load_number ? ` (load ${source.load_number})` : ''
          }`
        : `${formatCurrency(payment.amount)} transferred from another invoice`,
      tone: 'success',
      kind: 'activity',
    })
  }

  if (payment.reversal_reason) {
    entries.push({
      id: `reversal-${payment.id}`,
      timestamp: payment.reversed_at || payment.received_date,
      title: payment.reversal_type === 'moved' ? 'Funds moved out' : 'Payment reversed',
      detail: payment.reversal_reason,
      tone: 'warning',
      kind: 'activity',
    })
  }

  if (payment.moved_to_payment_id) {
    const target = getPaymentById(payment.moved_to_payment_id)
    entries.push({
      id: `move-out-${payment.id}`,
      timestamp: payment.reversed_at || payment.received_date,
      title: 'Funds moved to another invoice',
      detail: target
        ? `${formatCurrency(payment.amount)} moved to ${target.invoice_number}${
            target.load_number ? ` (load ${target.load_number})` : ''
          }`
        : `${formatCurrency(payment.amount)} moved to another invoice`,
      tone: 'warning',
      kind: 'activity',
    })
  }

  if (payment.dispute) {
    entries.push({
      id: `dispute-open-${payment.id}`,
      timestamp: payment.dispute.created_at,
      title: 'Receipt dispute opened',
      detail: payment.dispute.description,
      tone: 'warning',
      kind: 'activity',
    })
    if (payment.dispute.response) {
      entries.push({
        id: `dispute-resolved-${payment.id}`,
        timestamp: payment.dispute.resolved_at || payment.dispute.created_at,
        title: 'Credyx dispute response',
        detail: payment.dispute.response,
        tone: 'info',
        kind: 'activity',
      })
    }
  }

  if (payment.rejection_reason) {
    entries.push({
      id: `reject-${payment.id}`,
      timestamp: payment.received_date,
      title: 'Payment rejected',
      detail: payment.rejection_reason,
      tone: 'error',
      kind: 'activity',
    })
  }
}

function pushAuditLog(entries: PaymentAuditTimelineEntry[], log: AuditLog) {
  entries.push({
    id: `audit-${log.id}`,
    timestamp: log.timestamp,
    title: log.user_name || 'System',
    detail: log.description,
    tone:
      log.severity === 'error' ? 'error' : log.severity === 'warning' ? 'warning' : 'neutral',
    kind: 'activity',
  })
}

/**
 * Unified invoice + payment activity feed for the client payment confirmation panel.
 */
export function buildClientPaymentAuditTimeline(
  invoice: Invoice,
  invoicePayments: Payment[],
  focusPaymentId?: string
): PaymentAuditTimelineEntry[] {
  const entries: PaymentAuditTimelineEntry[] = []

  clientVisibleNotes(invoice.notes_history).forEach((note) => pushNote(entries, note))
  invoicePayments.forEach((payment) => pushPaymentActivity(entries, payment))

  const paymentIds = new Set(invoicePayments.map((p) => p.id))
  if (focusPaymentId) paymentIds.add(focusPaymentId)

  getAllAuditLogs()
    .filter(
      (log) =>
        log.entity_id === invoice.id ||
        (typeof log.metadata?.payment_id === 'string' &&
          paymentIds.has(log.metadata.payment_id))
    )
    .forEach((log) => pushAuditLog(entries, log))

  const seen = new Set<string>()
  return entries
    .filter((entry) => {
      if (seen.has(entry.id)) return false
      seen.add(entry.id)
      return true
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}
