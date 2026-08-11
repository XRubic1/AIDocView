import { getInvoiceById, updateInvoice, addInvoice, addInvoiceAsync, updateInvoiceAsync } from '../data/mockInvoices'
import { mockBrokers } from '../data/mockBrokers'
import {
  addPayment,
  addPaymentAsync,
  getConfirmedPaymentTotal,
  getPaymentById,
  getPaymentsByInvoiceId,
  getPaymentsForClientInvoiceIds,
  mockPayments,
  updatePayment,
} from '../data/mockPayments'
import type { Invoice, InvoiceNote } from '../types/invoice'
import type { Payment } from '../types/payment'
import type { ShortPayReason } from '../types/payment'
import type { ClientCapabilities } from '../utils/clientCapabilities'
import { getClientCapabilities } from '../utils/clientCapabilities'
import { getClientById } from './clientRegistry'
import { logAuditEvent } from '../utils/auditLogger'
import { isPostableForPayment, isAdminPostableForPayment } from '../utils/invoiceAging'
import { formatCurrency } from '../utils/format'
import { resolveDueDatesFromBroker } from '../utils/invoiceDueDate'
import {
  notifyAdminPaymentReported,
  notifyAdminWriteOffRequested,
} from './adminNotificationService'
import { notifyClientPaymentPosted, type ClientPaymentNotifyKind } from '../data/mockNotifications'
import {
  buildReceiptConfirmationDeadline,
  CLIENT_RECEIPT_CONFIRMATION_DAYS,
} from './paymentReceiptConfirmationService'
import { CREDYX_FORCE_CONFIRM_ACTOR } from '../utils/paymentStatus'
import { recordShortPaymentFeeReimbursement } from './reimbursementAccountService'

/** Classify Credyx-posted payment for client bell copy. */
function resolveClientPaymentNotifyKind(
  invoiceAmount: number,
  confirmedBeforePost: number,
  postedAmount: number,
  isShort: boolean
): ClientPaymentNotifyKind {
  if (isShort) return 'short'
  const projected = confirmedBeforePost + postedAmount
  if (projected > invoiceAmount + 0.01) return 'over'
  return 'payment'
}

function notifyClientOfAdminPayment(input: {
  clientId: string
  invoiceId: string
  invoiceNumber: string
  paymentId: string
  amount: number
  invoiceAmount: number
  confirmedBeforePost: number
  isShort: boolean
  awaitingConfirmation: boolean
}): void {
  notifyClientPaymentPosted({
    clientId: input.clientId,
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    paymentId: input.paymentId,
    amount: input.amount,
    kind: resolveClientPaymentNotifyKind(
      input.invoiceAmount,
      input.confirmedBeforePost,
      input.amount,
      input.isShort
    ),
    awaitingConfirmation: input.awaitingConfirmation,
  })
}

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

export interface PostAdminPaymentOptions {
  /** Dedicated admins — confirm immediately and close invoice as Credyx (managed clients). */
  forceConfirm?: boolean
}

function buildCredyxForceConfirmClientNote(amount: number, kind: 'payment' | 'short'): InvoiceNote {
  return {
    id: `note-credyx-force-${Date.now()}`,
    note:
      kind === 'short'
        ? `Credyx confirmed a short payment correction of ${formatCurrency(amount)} and updated this invoice.`
        : `Credyx confirmed receipt of ${formatCurrency(amount)} and closed this invoice.`,
    created_by: CREDYX_FORCE_CONFIRM_ACTOR,
    created_at: new Date().toISOString(),
    type: 'client_note',
    visibility: 'client',
  }
}

/** Invoices eligible for payment posting (approved, paid, short, or written-off — posting reopens). */
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
  const wasWrittenOff =
    invoice.status === 'written_off' || invoice.status === 'write_off_pending'
  const wasOnHold = invoice.status === 'hold'

  // Payment row is the timeline note — do not also append a confirmation invoice note.
  const reopenNote: InvoiceNote | null = wasWrittenOff
    ? {
        id: `note-posted-${Date.now()}`,
        note: `Invoice reopened from write-off. ${noteSuffix}`.trim(),
        created_by: authorName,
        created_at: new Date().toISOString(),
        type: 'client_note',
      }
    : null

  return updateInvoice(invoice.id, {
    status: isShort ? 'approved' : 'paid',
    paid_amount: totalReceived,
    notes_history: reopenNote
      ? [...(invoice.notes_history || []), reopenNote]
      : invoice.notes_history,
    days_since_expected: isShort ? invoice.days_since_expected : 0,
    overpayment_accepted_at: isOver ? undefined : invoice.overpayment_accepted_at,
    write_off_request: wasWrittenOff ? undefined : invoice.write_off_request,
    // Payment settles the hold — clear reason so short-paid invoices look open.
    hold_reason: wasOnHold ? undefined : invoice.hold_reason,
    updated_at: new Date().toISOString(),
  })
}

async function applyPaymentToInvoiceAsync(
  invoice: Invoice,
  totalReceived: number,
  authorName: string,
  noteSuffix: string
): Promise<Invoice | undefined> {
  const isShort = totalReceived < invoice.amount - 0.01
  const isOver = totalReceived > invoice.amount + 0.01
  const wasWrittenOff =
    invoice.status === 'written_off' || invoice.status === 'write_off_pending'
  const wasOnHold = invoice.status === 'hold'

  const reopenNote: InvoiceNote | null = wasWrittenOff
    ? {
        id: `note-posted-${Date.now()}`,
        note: `Invoice reopened from write-off. ${noteSuffix}`.trim(),
        created_by: authorName,
        created_at: new Date().toISOString(),
        type: 'client_note',
      }
    : null

  return updateInvoiceAsync(invoice.id, {
    status: isShort ? 'approved' : 'paid',
    paid_amount: totalReceived,
    notes_history: reopenNote
      ? [...(invoice.notes_history || []), reopenNote]
      : invoice.notes_history,
    days_since_expected: isShort ? invoice.days_since_expected : 0,
    overpayment_accepted_at: isOver ? undefined : invoice.overpayment_accepted_at,
    write_off_request: wasWrittenOff ? undefined : invoice.write_off_request,
    hold_reason: wasOnHold ? undefined : invoice.hold_reason,
    updated_at: new Date().toISOString(),
  })
}

/** Invoice eligible for a client-posted payment (blocks while a legacy pending row exists). */
function getEligibleInvoiceForClientPost(
  invoiceId: string,
  capabilities?: Pick<ClientCapabilities, 'canPostPayment'>
): Invoice | undefined {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || !isPostableForPayment(invoice)) return undefined

  const caps = getClientCapabilities(getClientById(invoice.client_id)?.service_tier)
  const canPost = capabilities?.canPostPayment ?? caps.canPostPayment
  if (!canPost) return undefined
  if (getPaymentsByInvoiceId(invoice.id).some((p) => p.status === 'pending')) return undefined
  return invoice
}

function isValidClientPaymentInput(input: PostClientPaymentInput): boolean {
  return Number.isFinite(input.amount) && input.amount > 0 && !!input.paymentDate && !!input.receivedDate
}

/** Client posts apply immediately — confirmed on the account with no Credyx approval gate. */
function buildClientPostedPaymentPayload(
  invoice: Invoice,
  input: PostClientPaymentInput,
  authorName: string
): Omit<Payment, 'id'> {
  const now = new Date().toISOString()
  return {
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    broker_name: invoice.broker_name,
    amount: input.amount,
    payment_date: input.paymentDate,
    received_date: input.receivedDate,
    payment_method: input.paymentMethod,
    payment_reference: input.paymentReference?.trim() || undefined,
    status: 'confirmed',
    posted_source: 'client',
    posted_by: authorName,
    confirmed_by: authorName,
    confirmed_at: now,
    notes: input.notes?.trim() || undefined,
    batch_id: invoice.batch_id,
    batch_number: invoice.batch_number,
    load_number: invoice.load_number,
  }
}

function clientPostNoteSuffix(input: PostClientPaymentInput): string {
  return input.notes?.trim()
    ? `Posted ${formatCurrency(input.amount)} via ${input.paymentMethod.toUpperCase()}. ${input.notes.trim()}`
    : `Posted ${formatCurrency(input.amount)} via ${input.paymentMethod.toUpperCase()}`
}

function varianceFromTotals(invoiceAmount: number, totalReceived: number): PostPaymentResult['variance'] {
  if (totalReceived < invoiceAmount - 0.01) return 'short'
  if (totalReceived > invoiceAmount + 0.01) return 'over'
  return 'full'
}

function logClientPaymentPosted(
  updated: Invoice,
  payment: Payment,
  authorName: string,
  variance: PostPaymentResult['variance'],
  totalReceived: number
): void {
  notifyAdminPaymentReported({
    clientName: updated.client_name,
    invoiceNumber: updated.invoice_number,
    amount: payment.amount,
  })

  logAuditEvent(
    'payment_received',
    'invoice',
    updated.id,
    updated.invoice_number,
    `${authorName} posted ${formatCurrency(payment.amount)} on ${updated.invoice_number}`,
    'client-portal',
    authorName,
    'Client',
    undefined,
    {
      payment_id: payment.id,
      status: 'confirmed',
      variance,
      total_received: totalReceived,
    }
  )
}

/**
 * Post a broker payment against an invoice.
 * Client posts are confirmed immediately and update paid_amount / invoice status.
 */
export function postClientPayment(
  input: PostClientPaymentInput,
  authorName: string,
  capabilities?: Pick<ClientCapabilities, 'canPostPayment'>
): PostPaymentResult | undefined {
  const invoice = getEligibleInvoiceForClientPost(input.invoiceId, capabilities)
  if (!invoice || !isValidClientPaymentInput(input)) return undefined

  const payment = addPayment(buildClientPostedPaymentPayload(invoice, input, authorName))
  const totalReceived = getConfirmedPaymentTotal(invoice.id)
  const variance = varianceFromTotals(invoice.amount, totalReceived)
  const updated = applyPaymentToInvoice(invoice, totalReceived, authorName, clientPostNoteSuffix(input))
  if (!updated) return undefined

  logClientPaymentPosted(updated, payment, authorName, variance, totalReceived)
  return { payment, invoice: updated, variance }
}

/** Awaited client post — use after ad-hoc invoice create so payment persist follows invoice save. */
export async function postClientPaymentAsync(
  input: PostClientPaymentInput,
  authorName: string,
  capabilities?: Pick<ClientCapabilities, 'canPostPayment'>
): Promise<PostPaymentResult | undefined> {
  const invoice = getEligibleInvoiceForClientPost(input.invoiceId, capabilities)
  if (!invoice || !isValidClientPaymentInput(input)) return undefined

  const payment = await addPaymentAsync(buildClientPostedPaymentPayload(invoice, input, authorName))
  const totalReceived = getConfirmedPaymentTotal(invoice.id)
  const variance = varianceFromTotals(invoice.amount, totalReceived)
  const updated = await applyPaymentToInvoiceAsync(
    invoice,
    totalReceived,
    authorName,
    clientPostNoteSuffix(input)
  )
  if (!updated) return undefined

  logClientPaymentPosted(updated, payment, authorName, variance, totalReceived)
  return { payment, invoice: updated, variance }
}

export interface PostClientShortPaymentInput extends PostClientPaymentInput {
  parentPaymentId: string
  shortPayReason?: ShortPayReason
}

/**
 * Client short-payment correction against a confirmed payment (typically on a closed invoice).
 * Reduces applied received immediately — remaining shortfall stays in open A/R unless written off.
 */
export function postClientShortPayment(
  input: PostClientShortPaymentInput,
  authorName: string,
  capabilities?: Pick<ClientCapabilities, 'canPostPayment'>
): PostPaymentResult | undefined {
  const invoice = getEligibleInvoiceForClientPost(input.invoiceId, capabilities)
  if (!invoice || !isValidClientPaymentInput(input)) return undefined

  const parent = getPaymentById(input.parentPaymentId)
  if (!parent || parent.invoice_id !== invoice.id || parent.status !== 'confirmed') {
    return undefined
  }
  if (parent.parent_payment_id || parent.payment_kind === 'short') return undefined

  const confirmedReceived = getConfirmedPaymentTotal(invoice.id)
  if (input.amount > confirmedReceived + 0.01) return undefined

  const shortPayReason: ShortPayReason = input.shortPayReason ?? 'wrong_amount'
  const reasonLabel = shortPayReason === 'chargeback' ? 'Chargeback' : 'Wrong amount posted'
  const parentRef = parent.payment_reference
    ? ` (ref ${parent.payment_reference})`
    : ` on ${formatDateShort(parent.received_date)}`
  const noteSuffix = input.notes?.trim()
    ? `Short payment — ${reasonLabel} of ${formatCurrency(input.amount)} against payment${parentRef}. ${input.notes.trim()}`
    : `Short payment — ${reasonLabel} of ${formatCurrency(input.amount)} against payment${parentRef}`

  const now = new Date().toISOString()
  const payment = addPayment({
    ...buildClientPostedPaymentPayload(invoice, input, authorName),
    confirmed_at: now,
    notes: input.notes?.trim() || undefined,
    parent_payment_id: parent.id,
    payment_kind: 'short',
    short_pay_reason: shortPayReason,
  })

  const totalReceived = getConfirmedPaymentTotal(invoice.id)
  const variance = varianceFromTotals(invoice.amount, totalReceived)
  const updated = applyPaymentToInvoice(invoice, totalReceived, authorName, noteSuffix)
  if (!updated) return undefined

  logClientPaymentPosted(updated, payment, authorName, variance, totalReceived)
  return { payment, invoice: updated, variance }
}

/** Admin posts a payment — managed clients require receipt confirmation within 30 days. */
export function postAdminPayment(
  input: PostClientPaymentInput,
  adminName: string
): PostPaymentResult | undefined {
  const invoice = getInvoiceById(input.invoiceId)
  if (!invoice || !isAdminPostableForPayment(invoice)) return undefined
  if (!Number.isFinite(input.amount) || input.amount <= 0) return undefined

  const client = getClientById(invoice.client_id)
  const isManaged = client?.service_tier === 'managed'
  const confirmedBeforePost = getConfirmedPaymentTotal(invoice.id)

  if (isManaged) {
    const pendingNote: InvoiceNote = {
      id: `note-awaiting-receipt-${Date.now()}`,
      note: `Credyx posted ${formatCurrency(input.amount)} — please confirm receipt within ${CLIENT_RECEIPT_CONFIRMATION_DAYS} days or open a dispute if funds were not received.`,
      created_by: adminName,
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
      status: 'awaiting_receipt',
      posted_source: 'credyx',
      posted_by: adminName,
      client_confirmation_deadline: buildReceiptConfirmationDeadline(),
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

    notifyClientOfAdminPayment({
      clientId: invoice.client_id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      paymentId: payment.id,
      amount: input.amount,
      invoiceAmount: invoice.amount,
      confirmedBeforePost,
      isShort: false,
      awaitingConfirmation: true,
    })

    return { payment, invoice: updated, variance: 'full' }
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

  notifyClientOfAdminPayment({
    clientId: invoice.client_id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    paymentId: payment.id,
    amount: input.amount,
    invoiceAmount: invoice.amount,
    confirmedBeforePost,
    isShort: false,
    awaitingConfirmation: false,
  })

  return { payment, invoice: updated, variance }
}

/** Awaited admin post — ensures invoice exists in Supabase before payment save. */
export async function postAdminPaymentAsync(
  input: PostClientPaymentInput,
  adminName: string,
  options?: PostAdminPaymentOptions
): Promise<PostPaymentResult | undefined> {
  const invoice = getInvoiceById(input.invoiceId)
  if (!invoice || !isAdminPostableForPayment(invoice)) return undefined
  if (!Number.isFinite(input.amount) || input.amount <= 0) return undefined

  const client = getClientById(invoice.client_id)
  const isManaged = client?.service_tier === 'managed'
  const forceConfirm = options?.forceConfirm === true && isManaged
  const confirmedBeforePost = getConfirmedPaymentTotal(invoice.id)

  const paymentBase = {
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    broker_name: invoice.broker_name,
    amount: input.amount,
    payment_date: input.paymentDate,
    received_date: input.receivedDate,
    payment_method: input.paymentMethod,
    payment_reference: input.paymentReference?.trim() || undefined,
    posted_source: 'credyx' as const,
    posted_by: adminName,
    notes: input.notes?.trim() || undefined,
    batch_id: invoice.batch_id,
    batch_number: invoice.batch_number,
    load_number: invoice.load_number,
  }

  if (isManaged && !forceConfirm) {
    const pendingNote: InvoiceNote = {
      id: `note-awaiting-receipt-${Date.now()}`,
      note: `Credyx posted ${formatCurrency(input.amount)} — please confirm receipt within ${CLIENT_RECEIPT_CONFIRMATION_DAYS} days or open a dispute if funds were not received.`,
      created_by: adminName,
      created_at: new Date().toISOString(),
      type: 'client_note',
      visibility: 'client',
    }

    const payment = await addPaymentAsync({
      ...paymentBase,
      status: 'awaiting_receipt',
      client_confirmation_deadline: buildReceiptConfirmationDeadline(),
    })

    const updated = await updateInvoiceAsync(invoice.id, {
      notes_history: [...(invoice.notes_history || []), pendingNote],
      updated_at: new Date().toISOString(),
    })
    if (!updated) return undefined

    notifyClientOfAdminPayment({
      clientId: invoice.client_id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      paymentId: payment.id,
      amount: input.amount,
      invoiceAmount: invoice.amount,
      confirmedBeforePost,
      isShort: false,
      awaitingConfirmation: true,
    })

    return { payment, invoice: updated, variance: 'full' }
  }

  const now = new Date().toISOString()
  const payment = await addPaymentAsync({
    ...paymentBase,
    status: 'confirmed',
    confirmed_by: adminName,
    confirmed_at: now,
    ...(forceConfirm
      ? { client_confirmed_at: now, client_confirmed_by: CREDYX_FORCE_CONFIRM_ACTOR }
      : {}),
  })

  if (forceConfirm) {
    await updateInvoiceAsync(invoice.id, {
      notes_history: [
        ...(invoice.notes_history || []),
        buildCredyxForceConfirmClientNote(input.amount, 'payment'),
      ],
      updated_at: now,
    })
  }

  const totalReceived = getConfirmedPaymentTotal(invoice.id)
  const isShort = totalReceived < invoice.amount - 0.01
  const isOver = totalReceived > invoice.amount + 0.01
  const variance: PostPaymentResult['variance'] = isShort ? 'short' : isOver ? 'over' : 'full'

  const noteSuffix = forceConfirm
    ? `Credyx force-confirmed receipt of ${formatCurrency(input.amount)} — invoice closed by Credyx`
    : input.notes?.trim()
      ? `Posted ${formatCurrency(input.amount)} via ${input.paymentMethod.toUpperCase()}. ${input.notes.trim()}`
      : `Posted ${formatCurrency(input.amount)} via ${input.paymentMethod.toUpperCase()}`

  const updated = await applyPaymentToInvoiceAsync(invoice, totalReceived, adminName, noteSuffix)
  if (!updated) return undefined

  if (forceConfirm) {
    logAuditEvent(
      'payment_received',
      'invoice',
      updated.id,
      updated.invoice_number,
      `${adminName} force-confirmed ${formatCurrency(input.amount)} — Credyx closed ${updated.invoice_number}`,
      'admin',
      adminName,
      'Admin',
      undefined,
      { payment_id: payment.id, action: 'credyx_force_confirm' }
    )
  }

  notifyClientOfAdminPayment({
    clientId: invoice.client_id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    paymentId: payment.id,
    amount: input.amount,
    invoiceAmount: invoice.amount,
    confirmedBeforePost,
    isShort: false,
    awaitingConfirmation: false,
  })

  return { payment, invoice: updated, variance }
}

export interface PostAdminShortPaymentInput extends PostClientPaymentInput {
  parentPaymentId: string
  shortPayReason: ShortPayReason
}

/** Confirmed payments eligible as parent for a short payment correction. */
export function listParentPaymentCandidates(invoiceId: string): Payment[] {
  return getPaymentsByInvoiceId(invoiceId)
    .filter(
      (payment) =>
        payment.status === 'confirmed' &&
        !payment.parent_payment_id &&
        payment.payment_kind !== 'short'
    )
    .sort((a, b) => b.received_date.localeCompare(a.received_date))
}

/**
 * Post a short payment linked to an existing payment — always reduces received total
 * once confirmed. Managed clients must confirm before the correction applies.
 */
export function postAdminShortPayment(
  input: PostAdminShortPaymentInput,
  adminName: string,
  options?: PostAdminPaymentOptions
): PostPaymentResult | undefined {
  const invoice = getInvoiceById(input.invoiceId)
  if (!invoice || !isAdminPostableForPayment(invoice)) return undefined
  if (!Number.isFinite(input.amount) || input.amount <= 0) return undefined

  const parent = getPaymentById(input.parentPaymentId)
  if (!parent || parent.invoice_id !== invoice.id || parent.status !== 'confirmed') {
    return undefined
  }
  if (parent.parent_payment_id) return undefined

  const confirmedReceived = getConfirmedPaymentTotal(invoice.id)
  if (input.amount > confirmedReceived + 0.01) return undefined

  const client = getClientById(invoice.client_id)
  const isManaged = client?.service_tier === 'managed'
  const forceConfirm = options?.forceConfirm === true && isManaged

  const reasonLabel =
    input.shortPayReason === 'chargeback' ? 'Chargeback' : 'Wrong amount posted'
  const parentRef = parent.payment_reference
    ? ` (ref ${parent.payment_reference})`
    : ` on ${formatDateShort(parent.received_date)}`

  const noteSuffix = input.notes?.trim()
    ? `Short payment — ${reasonLabel} of ${formatCurrency(input.amount)} against payment${parentRef}. ${input.notes.trim()}`
    : `Short payment — ${reasonLabel} of ${formatCurrency(input.amount)} against payment${parentRef}`

  if (isManaged && !forceConfirm) {
    const pendingNote: InvoiceNote = {
      id: `note-awaiting-short-${Date.now()}`,
      note: `Credyx posted short payment correction of ${formatCurrency(input.amount)} — please confirm within ${CLIENT_RECEIPT_CONFIRMATION_DAYS} days or open a dispute if this correction is incorrect.`,
      created_by: adminName,
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
      status: 'awaiting_receipt',
      posted_source: 'credyx',
      posted_by: adminName,
      client_confirmation_deadline: buildReceiptConfirmationDeadline(),
      // Store full short-pay label so invoice details / insights can show the reason + note.
      notes: noteSuffix,
      batch_id: invoice.batch_id,
      batch_number: invoice.batch_number,
      load_number: invoice.load_number,
      parent_payment_id: parent.id,
      payment_kind: 'short',
      short_pay_reason: input.shortPayReason,
    })

    const updated = updateInvoice(invoice.id, {
      notes_history: [...(invoice.notes_history || []), pendingNote],
      updated_at: new Date().toISOString(),
    })
    if (!updated) return undefined

    const variance: PostPaymentResult['variance'] =
      confirmedReceived > invoice.amount + 0.01
        ? 'over'
        : confirmedReceived < invoice.amount - 0.01
          ? 'short'
          : 'full'

    notifyClientOfAdminPayment({
      clientId: invoice.client_id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      paymentId: payment.id,
      amount: input.amount,
      invoiceAmount: invoice.amount,
      confirmedBeforePost: confirmedReceived,
      isShort: true,
      awaitingConfirmation: true,
    })

    return { payment, invoice: updated, variance }
  }

  const now = new Date().toISOString()
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
    confirmed_at: now,
    ...(forceConfirm
      ? { client_confirmed_at: now, client_confirmed_by: CREDYX_FORCE_CONFIRM_ACTOR }
      : {}),
    notes: input.notes?.trim() || undefined,
    batch_id: invoice.batch_id,
    batch_number: invoice.batch_number,
    load_number: invoice.load_number,
    parent_payment_id: parent.id,
    payment_kind: 'short',
    short_pay_reason: input.shortPayReason,
  })

  if (forceConfirm) {
    updateInvoice(invoice.id, {
      notes_history: [
        ...(invoice.notes_history || []),
        buildCredyxForceConfirmClientNote(input.amount, 'short'),
      ],
      updated_at: now,
    })
  }

  const totalReceived = getConfirmedPaymentTotal(invoice.id)
  const isShort = totalReceived < invoice.amount - 0.01
  const isOver = totalReceived > invoice.amount + 0.01
  const variance: PostPaymentResult['variance'] = isShort ? 'short' : isOver ? 'over' : 'full'

  const appliedNoteSuffix = forceConfirm
    ? `Credyx force-confirmed short correction of ${formatCurrency(input.amount)} — invoice updated by Credyx`
    : noteSuffix

  const updated = applyPaymentToInvoice(invoice, totalReceived, adminName, appliedNoteSuffix)
  if (!updated) return undefined

  if (forceConfirm) {
    logAuditEvent(
      'payment_received',
      'invoice',
      updated.id,
      updated.invoice_number,
      `${adminName} force-confirmed short correction of ${formatCurrency(input.amount)} on ${updated.invoice_number}`,
      'admin',
      adminName,
      'Admin',
      undefined,
      { payment_id: payment.id, action: 'credyx_force_confirm_short' }
    )
  }

  void recordShortPaymentFeeReimbursement(payment)

  notifyClientOfAdminPayment({
    clientId: invoice.client_id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    paymentId: payment.id,
    amount: input.amount,
    invoiceAmount: invoice.amount,
    confirmedBeforePost: confirmedReceived,
    isShort: true,
    awaitingConfirmation: false,
  })

  return { payment, invoice: updated, variance }
}

function formatDateShort(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${month}/${day}/${year}`
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
  return buildAdHocInvoiceForPayment(input, authorName)
}

/** Persist ad-hoc invoice before posting payment (avoids FK race on Supabase). */
export async function createAdHocInvoiceForPaymentAsync(
  input: CreateAdHocInvoiceInput,
  authorName: string
): Promise<Invoice> {
  return addInvoiceAsync(buildAdHocInvoicePayload(input, authorName))
}

function buildAdHocInvoicePayload(
  input: CreateAdHocInvoiceInput,
  authorName: string
): Omit<Invoice, 'id' | 'created_at'> {
  const broker = mockBrokers.find(
    (b) => b.name.toLowerCase() === input.brokerName.trim().toLowerCase()
  )
  const today = new Date().toISOString().split('T')[0]
  const dueDates = resolveDueDatesFromBroker(broker?.payment_terms_days)

  return {
    invoice_number: input.invoiceNumber.trim(),
    client_id: input.clientId,
    client_name: input.clientName,
    broker_id: broker?.id ?? '',
    broker_name: input.brokerName.trim(),
    amount: input.amount,
    invoice_date: today,
    ...dueDates,
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
  }
}

function buildAdHocInvoiceForPayment(
  input: CreateAdHocInvoiceInput,
  authorName: string
): Invoice {
  return addInvoice(buildAdHocInvoicePayload(input, authorName))
}

/** Create invoice + post payment in one step (unmatched remittance). */
export async function postClientPaymentOnNewInvoiceAsync(
  invoiceInput: CreateAdHocInvoiceInput,
  paymentInput: Omit<PostClientPaymentInput, 'invoiceId'>,
  authorName: string,
  capabilities?: Pick<ClientCapabilities, 'canPostPayment' | 'canCreateAdHocInvoice'>
): Promise<PostPaymentResult | undefined> {
  const caps = getClientCapabilities(getClientById(invoiceInput.clientId)?.service_tier)
  if (!(capabilities?.canCreateAdHocInvoice ?? caps.canCreateAdHocInvoice)) return undefined
  if (!(capabilities?.canPostPayment ?? caps.canPostPayment)) return undefined
  if (!invoiceInput.invoiceNumber.trim() || !invoiceInput.brokerName.trim()) return undefined
  if (!Number.isFinite(invoiceInput.amount) || invoiceInput.amount <= 0) return undefined

  const invoice = await createAdHocInvoiceForPaymentAsync(invoiceInput, authorName)
  return postClientPaymentAsync({ ...paymentInput, invoiceId: invoice.id }, authorName, capabilities)
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
 * a confirmed Payment row and updates the invoice via applyPaymentToInvoice.
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

export interface PostPaymentAndWriteOffOptions extends MarkClientInvoiceAsPaidOptions {
  /** Required explanation — remaining balance is marked uncollectable. */
  writeOffNote: string
}

/**
 * Mark remaining shortfall as written off immediately so it does not stay in open A/R.
 */
export function applyClientWriteOff(
  invoiceId: string,
  authorName: string,
  writeOffNoteText: string,
  capabilities?: Pick<ClientCapabilities, 'canRequestWriteOff'>
): Invoice | undefined {
  const note = writeOffNoteText.trim()
  if (!note) return undefined

  const invoice = getInvoiceById(invoiceId)
  if (!invoice || invoice.status === 'write_off_pending') return undefined

  const caps = getClientCapabilities(getClientById(invoice.client_id)?.service_tier)
  if (!(capabilities?.canRequestWriteOff ?? caps.canRequestWriteOff)) return undefined

  const received = getConfirmedPaymentTotal(invoice.id)
  const shortfall = invoice.amount - received
  if (shortfall < 0.01) return undefined

  const now = new Date().toISOString()
  const writeOffNote: InvoiceNote = {
    id: `note-close-writeoff-${Date.now()}`,
    note: `Write-off ${formatCurrency(shortfall)} — ${note}`,
    created_by: authorName,
    created_at: now,
    type: 'client_note',
  }

  const updated = updateInvoice(invoiceId, {
    status: 'written_off',
    paid_amount: received,
    notes_history: [...(invoice.notes_history || []), writeOffNote],
    write_off_request: {
      requested_by: authorName,
      requested_at: now,
      client_note: note,
      received_amount: received,
      shortfall,
      resolved_at: now,
      resolved_by: authorName,
      resolution: 'approved',
    },
    days_since_expected: 0,
    updated_at: now,
  })
  if (!updated) return undefined

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
    `${authorName} wrote off ${formatCurrency(shortfall)} on ${updated.invoice_number}`,
    'client-portal',
    authorName,
    'Client',
    undefined,
    { close_type: 'written_off', received, shortfall }
  )

  return updated
}

/**
 * Post a short payment and write off the remaining balance in one step.
 * Remaining is written off immediately so it does not stay in open A/R.
 */
export function postClientPaymentAndRequestWriteOff(
  invoiceId: string,
  authorName: string,
  options: PostPaymentAndWriteOffOptions,
  capabilities?: Pick<ClientCapabilities, 'canPostPayment' | 'canRequestWriteOff'>
): PostPaymentResult | undefined {
  const writeOffNoteText = options.writeOffNote.trim()
  if (!writeOffNoteText) return undefined
  if (!Number.isFinite(options.amountReceived) || options.amountReceived <= 0) return undefined

  const invoice = getInvoiceById(invoiceId)
  if (!invoice) return undefined
  const projectedReceived = getConfirmedPaymentTotal(invoice.id) + options.amountReceived
  if (invoice.amount - projectedReceived < 0.01) return undefined

  const posted = postClientPayment(
    {
      invoiceId,
      amount: options.amountReceived,
      paymentDate: options.paymentDate ?? new Date().toISOString().split('T')[0],
      receivedDate: options.receivedDate ?? new Date().toISOString().split('T')[0],
      paymentMethod: options.paymentMethod ?? 'check',
      paymentReference: options.paymentReference?.trim() || undefined,
      notes: options.optionalNote?.trim() || undefined,
    },
    authorName,
    capabilities
  )
  if (!posted) return undefined

  const writtenOff = applyClientWriteOff(invoiceId, authorName, writeOffNoteText, capabilities)
  if (!writtenOff) return undefined

  return { payment: posted.payment, invoice: writtenOff, variance: 'short' }
}

/** Confirm a leftover pending payment (legacy client posts) and apply it to the invoice. */
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

/** List leftover pending client-reported payments (new client posts confirm immediately). */
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
    'payment_rejected',
    'invoice',
    payment.invoice_id,
    payment.invoice_number,
    `${adminName} rejected ${formatCurrency(payment.amount)} on ${payment.invoice_number}`,
    'admin-portal',
    adminName,
    'Admin',
    undefined,
    { reason: opts.reason.trim() }
  )

  return payment
}
