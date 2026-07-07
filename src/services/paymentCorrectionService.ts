import {
  addPayment,
  getConfirmedPaymentTotal,
  getPaymentById,
  mockPayments,
  updatePayment,
} from '../data/mockPayments'
import { getInvoiceById, updateInvoice } from '../data/mockInvoices'
import type { Invoice, InvoiceNote } from '../types/invoice'
import type { Payment } from '../types/payment'
import { formatCurrency } from '../utils/format'
import { logAuditEvent } from '../utils/auditLogger'
import { isPostableForPayment, getDaysOutstanding } from '../utils/invoiceAging'
import { buildPaymentConfirmationNote } from './clientInvoiceActions'
import type { ClientCapabilities } from '../utils/clientCapabilities'
import { assertCapability } from '../utils/clientCapabilities'
import { notifyAdminPaymentReported } from './adminNotificationService'

function isCorrectableSourceInvoice(invoice: Invoice): boolean {
  return (
    invoice.status !== 'written_off' &&
    invoice.status !== 'force_closed' &&
    invoice.status !== 'write_off_pending'
  )
}

function recomputeInvoiceFromConfirmed(invoice: Invoice, authorName: string, noteSuffix: string): Invoice | undefined {
  const totalReceived = getConfirmedPaymentTotal(invoice.id)
  const isShort = totalReceived < invoice.amount - 0.01
  const isOver = totalReceived > invoice.amount + 0.01

  const paidNote: InvoiceNote = {
    id: `note-recompute-${Date.now()}`,
    note: buildPaymentConfirmationNote(invoice.amount, totalReceived, noteSuffix),
    created_by: authorName,
    created_at: new Date().toISOString(),
    type: 'note',
    visibility: 'internal',
  }

  return updateInvoice(invoice.id, {
    status: totalReceived <= 0 ? 'approved' : isShort ? 'approved' : 'paid',
    paid_amount: totalReceived > 0 ? totalReceived : undefined,
    days_since_expected: isShort ? getDaysOutstanding(invoice) : 0,
    overpayment_accepted_at: isOver ? invoice.overpayment_accepted_at : undefined,
    notes_history: [...(invoice.notes_history || []), paidNote],
    updated_at: new Date().toISOString(),
  })
}

/** List pending client-reported payments for admin queue. */
export function listPendingPaymentsFromStore(): Payment[] {
  return mockPayments.filter((p) => p.status === 'pending')
}

/** Reverse a confirmed payment (unprocess or move step 1). */
export function reversePayment(
  paymentId: string,
  adminName: string,
  opts: { reason: string; reversalType: 'moved' | 'unprocessed' }
): Payment | undefined {
  const payment = getPaymentById(paymentId)
  if (!payment || payment.status !== 'confirmed') return undefined
  if (!opts.reason.trim()) return undefined

  const sourceInvoice = getInvoiceById(payment.invoice_id)
  if (!sourceInvoice || !isCorrectableSourceInvoice(sourceInvoice)) return undefined

  const now = new Date().toISOString()
  const reversed = updatePayment(paymentId, {
    status: 'reversed',
    reversed_at: now,
    reversed_by: adminName,
    reversal_reason: opts.reason.trim(),
    reversal_type: opts.reversalType,
  })
  if (!reversed) return undefined

  const noteSuffix =
    opts.reversalType === 'unprocessed'
      ? `Payment of ${formatCurrency(payment.amount)} unprocessed due to: ${opts.reason.trim()}`
      : `Reversed ${formatCurrency(payment.amount)} due to: ${opts.reason.trim()}`

  recomputeInvoiceFromConfirmed(sourceInvoice, adminName, noteSuffix)

  logAuditEvent(
    'payment_received',
    'invoice',
    payment.invoice_id,
    payment.invoice_number,
    `${adminName} ${opts.reversalType === 'unprocessed' ? 'unprocessed' : 'reversed'} payment ${formatCurrency(payment.amount)} on ${payment.invoice_number}`,
    'admin-portal',
    adminName,
    'Admin',
    undefined,
    { reversal_type: opts.reversalType, action: opts.reversalType }
  )

  return reversed
}

/** Move funds: reverse source, create confirmed payment on target invoice. */
export function movePaymentFunds(
  paymentId: string,
  targetInvoiceId: string,
  adminName: string,
  reason: string,
  capabilities?: Pick<ClientCapabilities, 'canCorrectPayments'>
): { original: Payment; repost: Payment } | undefined {
  if (capabilities) {
    try {
      assertCapability(capabilities, 'canCorrectPayments', 'Payment corrections')
    } catch {
      return undefined
    }
  }

  const payment = getPaymentById(paymentId)
  if (!payment || payment.status !== 'confirmed') return undefined

  const sourceInvoice = getInvoiceById(payment.invoice_id)
  const target = getInvoiceById(targetInvoiceId)
  if (!sourceInvoice || !target) return undefined
  if (!isCorrectableSourceInvoice(sourceInvoice)) return undefined
  if (!isPostableForPayment(target)) return undefined
  if (sourceInvoice.client_id !== target.client_id) return undefined

  const original = reversePayment(paymentId, adminName, {
    reason,
    reversalType: 'moved',
  })
  if (!original) return undefined

  const repost = addPayment({
    invoice_id: target.id,
    invoice_number: target.invoice_number,
    broker_name: target.broker_name,
    amount: original.amount,
    payment_date: original.payment_date,
    received_date: original.received_date,
    payment_method: original.payment_method,
    payment_reference: original.payment_reference,
    status: 'confirmed',
    posted_source: capabilities ? 'client' : 'credyx',
    posted_by: adminName,
    moved_from_payment_id: original.id,
    batch_id: target.batch_id,
    batch_number: target.batch_number,
    load_number: target.load_number,
    notes: `Moved from ${original.invoice_number}: ${reason.trim()}`,
  })

  updatePayment(original.id, { moved_to_payment_id: repost.id })

  const loadLabel = original.load_number ?? '—'
  const sourceNote: InvoiceNote = {
    id: `note-move-src-${Date.now()}`,
    note: `Funds moved to invoice ${target.invoice_number} (load ${target.load_number ?? '—'}) due to: ${reason.trim()}`,
    created_by: adminName,
    created_at: new Date().toISOString(),
    type: 'note',
    visibility: 'internal',
  }

  const targetNote: InvoiceNote = {
    id: `note-move-tgt-${Date.now()}`,
    note: `Funds moved from Invoice ${original.invoice_number} (Load ${loadLabel}) due to: ${reason.trim()}`,
    created_by: adminName,
    created_at: new Date().toISOString(),
    type: 'client_note',
    visibility: 'client',
  }

  updateInvoice(sourceInvoice.id, {
    notes_history: [...(sourceInvoice.notes_history || []), sourceNote],
  })

  recomputeInvoiceFromConfirmed(
    target,
    adminName,
    `Received moved funds ${formatCurrency(repost.amount)} from ${original.invoice_number}`
  )

  updateInvoice(target.id, {
    notes_history: [...(getInvoiceById(target.id)?.notes_history || []), targetNote],
  })

  if (capabilities) {
    notifyAdminPaymentReported({
      clientName: sourceInvoice.client_name,
      invoiceNumber: `${original.invoice_number} → ${target.invoice_number}`,
      amount: original.amount,
    })
  }

  return { original, repost }
}

/** Fully unprocess a confirmed payment. */
export function unprocessPayment(
  paymentId: string,
  adminName: string,
  reason: string,
  capabilities?: Pick<ClientCapabilities, 'canCorrectPayments'>
): Payment | undefined {
  if (capabilities) {
    try {
      assertCapability(capabilities, 'canCorrectPayments', 'Payment corrections')
    } catch {
      return undefined
    }
  }

  const payment = getPaymentById(paymentId)
  if (!payment) return undefined

  const reversed = reversePayment(paymentId, adminName, { reason, reversalType: 'unprocessed' })

  if (reversed && capabilities) {
    notifyAdminPaymentReported({
      clientName: getInvoiceById(payment.invoice_id)?.client_name ?? 'Client',
      invoiceNumber: payment.invoice_number,
      amount: payment.amount,
    })
  }

  return reversed
}
