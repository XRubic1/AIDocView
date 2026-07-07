import { getInvoiceById, updateInvoice, addInvoice } from '../data/mockInvoices'
import { mockBrokers } from '../data/mockBrokers'
import {
  addPayment,
  getConfirmedPaymentTotal,
  getPaymentById,
  getPaymentsByInvoiceId,
  getPaymentsForClientInvoiceIds,
  mockPayments,
  updatePayment,
} from '../data/mockPayments'
import type { Invoice, InvoiceNote } from '../types/invoice'
import type { Payment } from '../types/payment'
import type { ClientCapabilities } from '../utils/clientCapabilities'
import { getClientCapabilities } from '../utils/clientCapabilities'
import { getClientById } from './clientRegistry'
import { buildPaymentConfirmationNote } from './clientInvoiceActions'
import { logAuditEvent } from '../utils/auditLogger'
import { isPostableForPayment } from '../utils/invoiceAging'
import { formatCurrency } from '../utils/format'
import { notifyAdminPaymentReported } from './adminNotificationService'

export interface PostClientPaymentInput {
  invoiceId: string
  amount: number
  paymentDate: string
  receivedDate: string
  paymentMethod: Payment['payment_method']
  paymentReference?: string
  notes?: string
}

export type PostPaymentResult = {
  payment: Payment
  invoice: Invoice
  variance: 'full' | 'short' | 'over'
}

/** Invoices eligible for payment posting (approved, paid, or short — not written off). */
export function listPostableInvoices(invoices: Invoice[]): Invoice[] {
  return invoices
    .filter((inv) => isPostableForPayment(inv))
    .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date))
}

export function getClientPayments(clientId: string, invoices: Invoice[]): Payment[] {
  const ids = new Set(
    invoices.filter((inv) => inv.client_id === clientId).map((inv) => inv.id)
  )
  return getPaymentsForClientInvoiceIds(ids).sort((a, b) =>
    b.received_date.localeCompare(a.received_date)
  )
}

function applyPaymentToInvoice(
  invoice: Invoice,
  totalReceived: number,
  authorName: string,
  noteSuffix: string
): Invoice | undefined {
  const isShort = totalReceived < invoice.amount - 0.01
  const isOver = totalReceived > invoice.amount + 0.01

  const noteText = buildPaymentConfirmationNote(invoice.amount, totalReceived, noteSuffix)

  const paidNote: InvoiceNote = {
    id: `note-posted-${Date.now()}`,
    note: noteText,
    created_by: authorName,
    created_at: new Date().toISOString(),
    type: 'client_note',
  }

  return updateInvoice(invoice.id, {
    status: isShort ? 'approved' : 'paid',
    paid_amount: totalReceived,
    notes_history: [...(invoice.notes_history || []), paidNote],
    days_since_expected: isShort ? invoice.days_since_expected : 0,
    overpayment_accepted_at: isOver ? undefined : invoice.overpayment_accepted_at,
    updated_at: new Date().toISOString(),
  })
}

/**
 * Post a broker payment against an invoice — client posts create pending payments.
 */
export function postClientPayment(
  input: PostClientPaymentInput,
  authorName: string,
  capabilities?: Pick<ClientCapabilities, 'canPostPayment'>
): PostPaymentResult | undefined {
  const invoice = getInvoiceById(input.invoiceId)
  if (!invoice || !isPostableForPayment(invoice)) return undefined

  const caps = getClientCapabilities(getClientById(invoice.client_id)?.service_tier)
  const canPost = capabilities?.canPostPayment ?? caps.canPostPayment
  if (!canPost) return undefined
  if (getPaymentsByInvoiceId(invoice.id).some((p) => p.status === 'pending')) return undefined
  if (!Number.isFinite(input.amount) || input.amount <= 0) return undefined
  if (!input.paymentDate || !input.receivedDate) return undefined

  const pendingNote: InvoiceNote = {
    id: `note-pending-${Date.now()}`,
    note: `Payment of ${formatCurrency(input.amount)} reported, awaiting confirmation.`,
    created_by: authorName,
    created_at: new Date().toISOString(),
    type: 'client_note',
    visibility: 'client',
  }

  const payment = addPayment({
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    broker_name: invoice.broker_name,
    amount: input.amount,
    payment_date: input.paymentDate,
    received_date: input.receivedDate,
    payment_method: input.paymentMethod,
    payment_reference: input.paymentReference?.trim() || undefined,
    status: 'pending',
    posted_source: 'client',
    posted_by: authorName,
    notes: input.notes?.trim() || undefined,
    batch_id: invoice.batch_id,
    batch_number: invoice.batch_number,
    load_number: invoice.load_number,
  })

  const updated = updateInvoice(invoice.id, {
    notes_history: [...(invoice.notes_history || []), pendingNote],
    updated_at: new Date().toISOString(),
  })
  if (!updated) return undefined

  notifyAdminPaymentReported({
    clientName: invoice.client_name,
    invoiceNumber: invoice.invoice_number,
    amount: input.amount,
  })

  logAuditEvent(
    'payment_received',
    'invoice',
    updated.id,
    updated.invoice_number,
    `${authorName} reported ${formatCurrency(input.amount)} on ${updated.invoice_number} (pending)`,
    'client-portal',
    authorName,
    'Client',
    undefined,
    { payment_id: payment.id, status: 'pending' }
  )

  return { payment, invoice: updated, variance: 'full' }
}

/** Admin posts a confirmed payment directly. */
export function postAdminPayment(
  input: PostClientPaymentInput,
  adminName: string
): PostPaymentResult | undefined {
  const invoice = getInvoiceById(input.invoiceId)
  if (!invoice || !isPostableForPayment(invoice)) return undefined
  if (!Number.isFinite(input.amount) || input.amount <= 0) return undefined

  const payment = addPayment({
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    broker_name: invoice.broker_name,
    amount: input.amount,
    payment_date: input.paymentDate,
    received_date: input.receivedDate,
    payment_method: input.paymentMethod,
    payment_reference: input.paymentReference?.trim() || undefined,
    status: 'confirmed',
    posted_source: 'credyx',
    posted_by: adminName,
    confirmed_by: adminName,
    confirmed_at: new Date().toISOString(),
    notes: input.notes?.trim() || undefined,
    batch_id: invoice.batch_id,
    batch_number: invoice.batch_number,
    load_number: invoice.load_number,
  })

  const totalReceived = getConfirmedPaymentTotal(invoice.id)
  const isShort = totalReceived < invoice.amount - 0.01
  const isOver = totalReceived > invoice.amount + 0.01
  const variance: PostPaymentResult['variance'] = isShort ? 'short' : isOver ? 'over' : 'full'

  const noteSuffix = input.notes?.trim()
    ? `Posted ${formatCurrency(input.amount)} via ${input.paymentMethod.toUpperCase()}. ${input.notes.trim()}`
    : `Posted ${formatCurrency(input.amount)} via ${input.paymentMethod.toUpperCase()}`

  const updated = applyPaymentToInvoice(invoice, totalReceived, adminName, noteSuffix)
  if (!updated) return undefined

  return { payment, invoice: updated, variance }
}

export interface CreateAdHocInvoiceInput {
  clientId: string
  clientName: string
  invoiceNumber: string
  brokerName: string
  amount: number
  loadNumber?: string
}

/** Create an approved invoice when posting payment against a load not yet in the system. */
export function createAdHocInvoiceForPayment(
  input: CreateAdHocInvoiceInput,
  authorName: string
): Invoice {
  const broker = mockBrokers.find(
    (b) => b.name.toLowerCase() === input.brokerName.trim().toLowerCase()
  )
  const today = new Date().toISOString().split('T')[0]
  const due = new Date()
  due.setDate(due.getDate() + 30)
  const dueStr = due.toISOString().split('T')[0]

  return addInvoice({
    invoice_number: input.invoiceNumber.trim(),
    client_id: input.clientId,
    client_name: input.clientName,
    broker_id: broker?.id ?? '',
    broker_name: input.brokerName.trim(),
    amount: input.amount,
    invoice_date: today,
    due_date: dueStr,
    expected_payment_date: dueStr,
    status: 'approved',
    approved_at: new Date().toISOString(),
    approved_by: authorName,
    load_number: input.loadNumber?.trim() || undefined,
    documents_count: 0,
    broker_contacted: false,
    days_since_expected: 0,
    notes_history: [
      {
        id: `note-adhoc-${Date.now()}`,
        note: 'Invoice created when posting broker payment.',
        created_by: authorName,
        created_at: new Date().toISOString(),
        type: 'client_note',
      },
    ],
  })
}

/** Create invoice + post payment in one step (unmatched remittance). */
export function postClientPaymentOnNewInvoice(
  invoiceInput: CreateAdHocInvoiceInput,
  paymentInput: Omit<PostClientPaymentInput, 'invoiceId'>,
  authorName: string,
  capabilities?: Pick<ClientCapabilities, 'canPostPayment' | 'canCreateAdHocInvoice'>
): PostPaymentResult | undefined {
  const caps = getClientCapabilities(getClientById(invoiceInput.clientId)?.service_tier)
  if (!(capabilities?.canCreateAdHocInvoice ?? caps.canCreateAdHocInvoice)) return undefined
  if (!(capabilities?.canPostPayment ?? caps.canPostPayment)) return undefined
  if (!invoiceInput.invoiceNumber.trim() || !invoiceInput.brokerName.trim()) return undefined
  if (!Number.isFinite(invoiceInput.amount) || invoiceInput.amount <= 0) return undefined

  const invoice = createAdHocInvoiceForPayment(invoiceInput, authorName)
  return postClientPayment({ ...paymentInput, invoiceId: invoice.id }, authorName, capabilities)
}

export interface ConfirmClientPaymentInput {
  paymentId: string
  paymentMethod: Payment['payment_method']
  paymentReference?: string
  receivedDate: string
  notes?: string
}

/** Options for marking an invoice paid from invoice detail / batch views. */
export interface MarkClientInvoiceAsPaidOptions {
  amountReceived: number
  optionalNote?: string
  paymentDate?: string
  receivedDate?: string
  paymentMethod?: Payment['payment_method']
  paymentReference?: string
}

/**
 * Mark invoice paid — routes through postClientPayment so every path writes
 * a Payment row and updates the invoice via applyPaymentToInvoice.
 */
export function markClientInvoiceAsPaid(
  invoiceId: string,
  authorName: string,
  options: MarkClientInvoiceAsPaidOptions,
  capabilities?: Pick<ClientCapabilities, 'canPostPayment'>
): Invoice | undefined {
  const today = new Date().toISOString().split('T')[0]
  const result = postClientPayment(
    {
      invoiceId,
      amount: options.amountReceived,
      paymentDate: options.paymentDate ?? today,
      receivedDate: options.receivedDate ?? today,
      paymentMethod: options.paymentMethod ?? 'check',
      paymentReference: options.paymentReference?.trim() || undefined,
      notes: options.optionalNote?.trim() || undefined,
    },
    authorName,
    capabilities
  )
  return result?.invoice
}

/** Confirm a pending payment and apply it to the invoice. */
export function confirmClientPayment(
  input: ConfirmClientPaymentInput,
  authorName: string
): { payment: Payment; invoice: Invoice } | undefined {
  const existing = getPaymentById(input.paymentId)
  if (!existing || existing.status !== 'pending') return undefined

  const payment = updatePayment(input.paymentId, {
    status: 'confirmed',
    payment_method: input.paymentMethod,
    payment_reference: input.paymentReference?.trim() || undefined,
    received_date: input.receivedDate,
    notes: input.notes?.trim() || undefined,
    confirmed_by: authorName,
    confirmed_at: new Date().toISOString(),
  })
  if (!payment) return undefined

  const invoice = getInvoiceById(payment.invoice_id)
  if (!invoice || !isPostableForPayment(invoice)) return undefined

  const totalReceived = getConfirmedPaymentTotal(invoice.id)
  const isShort = totalReceived < invoice.amount - 0.01
  const isOver = totalReceived > invoice.amount + 0.01
  const noteSuffix = input.notes?.trim() || `Confirmed ${formatCurrency(payment.amount)}`
  const updated = applyPaymentToInvoice(invoice, totalReceived, authorName, noteSuffix)
  if (!updated) return undefined

  logAuditEvent(
    'payment_received',
    'invoice',
    updated.id,
    updated.invoice_number,
    `${authorName} confirmed ${formatCurrency(payment.amount)} on ${updated.invoice_number}`,
    'client-portal',
    authorName,
    'Client',
    undefined,
    {
      payment_id: payment.id,
      action: 'confirmed',
      variance: isShort ? 'short' : isOver ? 'over' : 'full',
      total_received: totalReceived,
      invoice_amount: invoice.amount,
    }
  )

  return { payment, invoice: updated }
}

/** List pending client-reported payments for admin queue. */
export function listPendingPayments(): Payment[] {
  return mockPayments.filter((p) => p.status === 'pending')
}

/** Reject a pending client-reported payment. */
export function rejectClientPayment(
  paymentId: string,
  adminName: string,
  opts: { reason: string }
): Payment | undefined {
  const existing = getPaymentById(paymentId)
  if (!existing || existing.status !== 'pending') return undefined
  if (!opts.reason.trim()) return undefined

  const payment = updatePayment(paymentId, {
    status: 'rejected',
    rejection_reason: opts.reason.trim(),
  })
  if (!payment) return undefined

  const invoice = getInvoiceById(payment.invoice_id)
  if (invoice) {
    const rejectNote: InvoiceNote = {
      id: `note-reject-${Date.now()}`,
      note: `Payment of ${formatCurrency(payment.amount)} was not confirmed: ${opts.reason.trim()}`,
      created_by: adminName,
      created_at: new Date().toISOString(),
      type: 'client_note',
      visibility: 'client',
    }
    updateInvoice(invoice.id, {
      notes_history: [...(invoice.notes_history || []), rejectNote],
      updated_at: new Date().toISOString(),
    })
  }

  logAuditEvent(
    'payment_received',
    'invoice',
    payment.invoice_id,
    payment.invoice_number,
    `${adminName} rejected ${formatCurrency(payment.amount)} on ${payment.invoice_number}`,
    'admin-portal',
    adminName,
    'Admin',
    undefined,
    { action: 'rejected', reason: opts.reason.trim() }
  )

  return payment
}
