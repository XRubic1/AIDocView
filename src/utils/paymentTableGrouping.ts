import type { Payment } from '../types/payment'
import { isShortPayment } from '../types/payment'
import { AMOUNT_EPSILON, getEffectivePaymentAmount } from './paymentVariance'

export interface PaymentTableGroup {
  payment: Payment
  children: Payment[]
  /** Child row shown alone because its parent is outside the active filter. */
  orphanChild?: boolean
}

const ACTIVE_STATUSES = new Set<Payment['status']>([
  'pending',
  'awaiting_receipt',
  'disputed',
  'confirmed',
])

function sortPaymentsChronologically(a: Payment, b: Payment) {
  const byReceived = a.received_date.localeCompare(b.received_date)
  if (byReceived !== 0) return byReceived
  const byPaymentDate = a.payment_date.localeCompare(b.payment_date)
  if (byPaymentDate !== 0) return byPaymentDate
  return b.amount - a.amount
}

function getCumulativeReceivedBeforePayment(
  target: Payment,
  allPayments: Payment[]
): number {
  const invoicePayments = allPayments
    .filter((payment) => payment.invoice_id === target.invoice_id)
    .sort(sortPaymentsChronologically)

  let cumulative = 0
  for (const payment of invoicePayments) {
    if (payment.id === target.id) break
    if (ACTIVE_STATUSES.has(payment.status)) {
      cumulative += isShortPayment(payment)
        ? getEffectivePaymentAmount(payment)
        : payment.amount
    }
  }
  return cumulative
}

/**
 * Whether the gray invoice amount should appear on a payment row.
 * Nested supplemental children hide it when the parent row already established invoice context
 * (invoice was not materially overpaid before the child). Orphans and late supplementals still show it.
 */
export function shouldShowGrayInvoiceAmount(
  payment: Payment,
  isOverpaid: boolean,
  invoiceAmount: number | undefined,
  allPayments: Payment[],
  options: { isNestedChild: boolean; isOrphanChild: boolean }
): boolean {
  if (!isOverpaid || invoiceAmount == null) return false
  if (!options.isNestedChild || options.isOrphanChild) return true

  const receivedBefore = getCumulativeReceivedBeforePayment(payment, allPayments)
  return receivedBefore > invoiceAmount + AMOUNT_EPSILON
}

/**
 * One group per invoice — earliest active payment is the parent; all others nest underneath.
 */
export function buildPaymentChildMap(
  payments: Payment[],
  _invoiceAmountById: Map<string, number>
): Map<string, Payment[]> {
  const childMap = new Map<string, Payment[]>()
  const byInvoice = new Map<string, Payment[]>()

  for (const payment of payments) {
    const list = byInvoice.get(payment.invoice_id) ?? []
    list.push(payment)
    byInvoice.set(payment.invoice_id, list)
  }

  const attachChild = (parentId: string, child: Payment) => {
    const list = childMap.get(parentId) ?? []
    if (list.some((p) => p.id === child.id)) return
    list.push(child)
    list.sort(sortPaymentsChronologically)
    childMap.set(parentId, list)
  }

  for (const [, invoicePayments] of byInvoice) {
    const active = [...invoicePayments]
      .filter((p) => ACTIVE_STATUSES.has(p.status))
      .sort(sortPaymentsChronologically)

    if (active.length === 0) continue

    const root = active[0]
    for (let i = 1; i < active.length; i++) {
      attachChild(root.id, active[i])
    }

    // Rejected / reversed rows nest under the invoice parent when one exists (same UX as short/over).
    for (const payment of invoicePayments) {
      if (payment.status !== 'rejected' && payment.status !== 'reversed') continue
      if (payment.id === root.id) continue
      // Cross-invoice moved-fund rows link to their source in the block below.
      if (
        payment.moved_from_payment_id &&
        !active.some((p) => p.id === payment.moved_from_payment_id)
      ) {
        continue
      }
      attachChild(root.id, payment)
    }

    // Moved-fund rows stay linked to their source when it is outside this invoice group.
    for (const payment of invoicePayments) {
      if (!payment.moved_from_payment_id) continue
      if (active.some((p) => p.id === payment.id)) continue
      const sourceInGroup = active.some((p) => p.id === payment.moved_from_payment_id)
      if (!sourceInGroup) {
        attachChild(payment.moved_from_payment_id, payment)
      }
    }
  }

  return childMap
}

/** Top-level table rows in display order, with nested overpayment children. */
export function buildPaymentTableGroups(
  orderedPayments: Payment[],
  allPayments: Payment[],
  invoiceAmountById: Map<string, number>
): PaymentTableGroup[] {
  const childMap = buildPaymentChildMap(allPayments, invoiceAmountById)
  const childToParent = new Map<string, string>()

  for (const [parentId, children] of childMap) {
    for (const child of children) {
      childToParent.set(child.id, parentId)
    }
  }

  const visibleIds = new Set(orderedPayments.map((payment) => payment.id))
  const groups: PaymentTableGroup[] = []

  for (const payment of orderedPayments) {
    const parentId = childToParent.get(payment.id)

    if (parentId) {
      if (visibleIds.has(parentId)) continue
      groups.push({ payment, children: [], orphanChild: true })
      continue
    }

    groups.push({
      payment,
      children: (childMap.get(payment.id) ?? []).filter((child) => visibleIds.has(child.id)),
    })
  }

  return groups
}

export function flattenPaymentTableGroups(groups: PaymentTableGroup[]): Payment[] {
  const flat: Payment[] = []
  for (const group of groups) {
    flat.push(group.payment)
    flat.push(...group.children)
  }
  return flat
}

export function isShortPaymentChild(payment: Payment): boolean {
  return isShortPayment(payment)
}

/** Rejected / reversed rows nested under a parent — excluded from supplemental totals. */
export function isInactivePaymentChild(payment: Payment): boolean {
  return payment.status === 'rejected' || payment.status === 'reversed'
}

/** True when a nested child payment was posted after the invoice was already fully paid. */
export function isOverpaymentChild(
  payment: Payment,
  allPayments: Payment[],
  invoiceAmount: number
): boolean {
  if (invoiceAmount <= 0) return false
  if (isInactivePaymentChild(payment)) return false
  const receivedBefore = getCumulativeReceivedBeforePayment(payment, allPayments)
  return receivedBefore >= invoiceAmount - AMOUNT_EPSILON
}
