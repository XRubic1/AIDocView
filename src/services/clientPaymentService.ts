import { getInvoiceById, updateInvoice, addInvoice } from '../data/mockInvoices'
import { mockBrokers } from '../data/mockBrokers'
import {
  addPayment,
  getConfirmedPaymentTotal,
  getPaymentById,
  getPaymentsForClientInvoiceIds,
  updatePayment,
} from '../data/mockPayments'
import type { Invoice, InvoiceNote } from '../types/invoice'
import type { Payment } from '../types/payment'
import { buildPaymentConfirmationNote } from './clientInvoiceActions'
import { logAuditEvent } from '../utils/auditLogger'
import { isOpenArInvoice } from '../utils/invoiceAging'
import { formatCurrency } from '../utils/format'

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

/** Approved open A/R invoices eligible for a new payment post. */
export function listPostableInvoices(invoices: Invoice[]): Invoice[] {
  return invoices
    .filter((inv) => isOpenArInvoice(inv))
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
 * Post a broker payment against an open invoice — creates payment row and updates invoice.
 * Supports full, short, and over payments (routes to pay variance queues).
 */
export function postClientPayment(
  input: PostClientPaymentInput,
  authorName: string
): PostPaymentResult | undefined {
  const invoice = getInvoiceById(input.invoiceId)
  if (!invoice || !isOpenArInvoice(invoice)) return undefined
  if (!Number.isFinite(input.amount) || input.amount <= 0) return undefined
  if (!input.paymentDate || !input.receivedDate) return undefined

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

  const updated = applyPaymentToInvoice(invoice, totalReceived, authorName, noteSuffix)
  if (!updated) return undefined

  logAuditEvent(
    'payment_received',
    'invoice',
    updated.id,
    updated.invoice_number,
    `${authorName} posted ${formatCurrency(input.amount)} on ${updated.invoice_number}`,
    'client-portal',
    authorName,
    'Client',
    undefined,
    {
      payment_id: payment.id,
      variance,
      total_received: totalReceived,
      invoice_amount: invoice.amount,
    }
  )

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
  authorName: string
): PostPaymentResult | undefined {
  if (!invoiceInput.invoiceNumber.trim() || !invoiceInput.brokerName.trim()) return undefined
  if (!Number.isFinite(invoiceInput.amount) || invoiceInput.amount <= 0) return undefined

  const invoice = createAdHocInvoiceForPayment(invoiceInput, authorName)
  return postClientPayment({ ...paymentInput, invoiceId: invoice.id }, authorName)
}

export interface ConfirmClientPaymentInput {
  paymentId: string
  paymentMethod: Payment['payment_method']
  paymentReference?: string
  receivedDate: string
  notes?: string
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
  })
  if (!payment) return undefined

  const invoice = getInvoiceById(payment.invoice_id)
  if (!invoice) return undefined

  const totalReceived = getConfirmedPaymentTotal(invoice.id)
  const noteSuffix = input.notes?.trim() || `Confirmed ${formatCurrency(payment.amount)}`
  const updated = applyPaymentToInvoice(invoice, totalReceived, authorName, noteSuffix)
  if (!updated) return undefined

  return { payment, invoice: updated }
}
