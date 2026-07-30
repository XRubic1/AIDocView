/**
 * Structured payment truth for the Assistant — same math as the Payments / invoice UI.
 * Prefer this over guessing from free-text notes.
 */

import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { isShortPayment } from '../types/payment'
import {
  getClientDisplayBalanceState,
  getClientInvoiceStatusParts,
  getClientPostedPendingTotal,
  getInvoiceOpenArBalance,
  getInvoiceReceivedAmount,
} from './paymentVariance'
import { PAYMENT_STATUS_LABELS } from './paymentStatus'
import { formatCurrency } from './format'

export type AssistantPaymentHeadline =
  | 'unpaid'
  | 'partially_paid'
  | 'paid'
  | 'overpaid'
  | 'awaiting_carrier_receipt'
  | 'awaiting_credyx_confirm'
  | 'payment_disputed'
  | 'payment_reversed'
  | 'payment_rejected'
  | 'written_off'
  | 'force_closed'
  | 'on_hold'

export type AssistantPaymentStatus = {
  invoiceId: string
  invoiceNumber: string
  brokerName: string
  /** One-line status the user should see first. */
  headline: AssistantPaymentHeadline
  headlineLabel: string
  /** Plain explanation — structured, not guessed. */
  summary: string
  faceAmount: number
  faceAmountLabel: string
  confirmedReceived: number
  confirmedReceivedLabel: string
  /** Credyx-posted amount awaiting carrier receipt confirm (excludes short corrections). */
  postedAwaitingConfirm: number
  postedAwaitingConfirmLabel: string
  /** Face − (confirmed + awaiting remittance − awaiting short corrections), floored at 0. */
  remainingAfterPending: number
  remainingAfterPendingLabel: string
  /** True when awaiting remittance is under face (short/partial broker pay). */
  isPartialRemittance: boolean
  balanceDue: number
  balanceDueLabel: string
  balanceTone: 'open' | 'short' | 'over' | 'zero'
  displayStatus: string
  variance: 'short_paid' | 'overpaid' | 'awaiting_credyx' | null
  invoiceStatus: Invoice['status']
  why?: {
    source: 'payment' | 'hold' | 'write_off'
    paymentStatus?: Payment['status']
    paymentStatusLabel?: string
    reason?: string
    reversalType?: 'moved' | 'unprocessed'
    date?: string
  }
  payments: Array<{
    id: string
    amount: number
    amountLabel: string
    status: Payment['status']
    statusLabel: string
    date: string
    reason?: string
    reversalType?: Payment['reversal_type']
  }>
}

/** Sum of Credyx remittances awaiting carrier confirm (not short corrections). */
function sumAwaitingRemittance(rows: Payment[]): number {
  return rows
    .filter(
      (p) =>
        (p.status === 'awaiting_receipt' || p.status === 'disputed') &&
        !isShortPayment(p)
    )
    .reduce((sum, p) => sum + p.amount, 0)
}

/** Short corrections awaiting confirm (reduce received once confirmed). */
function sumAwaitingShortCorrection(rows: Payment[]): number {
  return rows
    .filter(
      (p) =>
        (p.status === 'awaiting_receipt' ||
          p.status === 'pending' ||
          p.status === 'disputed') &&
        isShortPayment(p)
    )
    .reduce((sum, p) => sum + p.amount, 0)
}

function headlineLabel(
  h: AssistantPaymentHeadline,
  opts?: { isPartialRemittance?: boolean }
): string {
  switch (h) {
    case 'unpaid':
      return 'Unpaid — balance due'
    case 'partially_paid':
      return 'Partially paid — balance due'
    case 'paid':
      return 'Paid in full'
    case 'overpaid':
      return 'Overpaid'
    case 'awaiting_carrier_receipt':
      return opts?.isPartialRemittance
        ? 'Partial payment awaiting confirmation'
        : 'Awaiting your payment confirmation'
    case 'awaiting_credyx_confirm':
      return 'Paid — awaiting Credyx confirm'
    case 'payment_disputed':
      return 'Payment disputed — funds on hold'
    case 'payment_reversed':
      return 'Payment reversed — balance due again'
    case 'payment_rejected':
      return 'Payment rejected'
    case 'written_off':
      return 'Written off'
    case 'force_closed':
      return 'Force closed'
    case 'on_hold':
      return 'On hold'
    default:
      return 'Payment status'
  }
}

function pickWhyPayment(rows: Payment[]): AssistantPaymentStatus['why'] | undefined {
  const priority: Payment['status'][] = [
    'disputed',
    'reversed',
    'rejected',
    'awaiting_receipt',
    'pending',
    'confirmed',
  ]
  for (const status of priority) {
    const p = rows.find((r) => r.status === status)
    if (!p) continue
    const reason =
      (status === 'reversed' && p.reversal_reason?.trim()) ||
      (status === 'rejected' && p.rejection_reason?.trim()) ||
      (status === 'disputed' &&
        [p.dispute?.reason, p.dispute?.description].filter(Boolean).join(' — ')) ||
      p.notes?.trim() ||
      undefined
    return {
      source: 'payment',
      paymentStatus: p.status,
      paymentStatusLabel: PAYMENT_STATUS_LABELS[p.status],
      reason: reason || undefined,
      reversalType: p.reversal_type,
      date: p.reversed_at || p.confirmed_at || p.received_date || p.payment_date,
    }
  }
  return undefined
}

/** Build a carrier-accurate payment snapshot for one invoice. */
export function buildPaymentStatusSnapshot(
  invoice: Invoice,
  allPayments: Payment[]
): AssistantPaymentStatus {
  const rows = allPayments
    .filter((p) => p.invoice_id === invoice.id)
    .sort((a, b) =>
      (b.received_date || b.payment_date || '').localeCompare(
        a.received_date || a.payment_date || ''
      )
    )

  const confirmedReceived = getInvoiceReceivedAmount(invoice, allPayments)
  const pendingClientPosted = getClientPostedPendingTotal(invoice.id, allPayments)
  const postedAwaitingConfirm = sumAwaitingRemittance(rows)
  const awaitingShortCorrection = sumAwaitingShortCorrection(rows)
  const appliedInclPending =
    confirmedReceived + postedAwaitingConfirm - awaitingShortCorrection
  const remainingAfterPending = Math.max(0, invoice.amount - appliedInclPending)
  const isPartialRemittance =
    postedAwaitingConfirm > 0.01 && remainingAfterPending > 0.01

  const balanceDue = getInvoiceOpenArBalance(invoice, allPayments)
  const balance = getClientDisplayBalanceState(
    invoice.amount,
    confirmedReceived,
    pendingClientPosted
  )
  const parts = getClientInvoiceStatusParts(invoice, balance, {
    pendingClientPosted,
    confirmedReceived,
    invoiceAmount: invoice.amount,
  })

  const hasDisputed = rows.some((p) => p.status === 'disputed')
  const hasReversed = rows.some((p) => p.status === 'reversed')
  const hasRejected = rows.some((p) => p.status === 'rejected')
  const hasAwaitingReceipt = rows.some((p) => p.status === 'awaiting_receipt')

  let headline: AssistantPaymentHeadline = 'unpaid'
  if (invoice.status === 'written_off' || invoice.status === 'write_off_pending') {
    headline = 'written_off'
  } else if (invoice.status === 'force_closed') {
    headline = 'force_closed'
  } else if (invoice.status === 'hold') {
    headline = 'on_hold'
  } else if (hasDisputed) {
    headline = 'payment_disputed'
  } else if (hasReversed && balanceDue > 0.01) {
    headline = 'payment_reversed'
  } else if (hasRejected && balanceDue > 0.01 && confirmedReceived < 0.01) {
    headline = 'payment_rejected'
  } else if (hasAwaitingReceipt) {
    headline = 'awaiting_carrier_receipt'
  } else if (parts.variance === 'awaiting_credyx') {
    headline = 'awaiting_credyx_confirm'
  } else if (parts.variance === 'overpaid' || balance.tone === 'over') {
    headline = 'overpaid'
  } else if (parts.status === 'paid' || balance.tone === 'zero') {
    headline = 'paid'
  } else if (confirmedReceived > 0.01 && balanceDue > 0.01) {
    headline = 'partially_paid'
  } else {
    headline = 'unpaid'
  }

  // Prefer "short" tone when remittance under face is awaiting confirm.
  const balanceTone =
    isPartialRemittance && headline === 'awaiting_carrier_receipt'
      ? 'short'
      : balance.tone

  // "Why" must explain the CURRENT state. On settled invoices (paid/overpaid/awaiting
  // confirm) an old rejected/reversed row is history, not the reason — skip it there.
  const settled =
    headline === 'paid' || headline === 'overpaid' || headline === 'awaiting_credyx_confirm'
  const why = settled
    ? undefined
    : pickWhyPayment(rows) ||
      (invoice.hold_reason
        ? { source: 'hold' as const, reason: invoice.hold_reason }
        : invoice.write_off_request
          ? {
              source: 'write_off' as const,
              reason: invoice.write_off_request.client_note || undefined,
            }
          : undefined)

  let summary = ''
  if (headline === 'payment_reversed') {
    summary = `A payment was reversed${
      why?.reason ? ` (${why.reason})` : ''
    }. Confirmed received is ${formatCurrency(confirmedReceived)}, so ${formatCurrency(
      balanceDue
    )} is due again. Invoice status may still say “${invoice.status}” — money truth is the balance.`
  } else if (headline === 'payment_disputed') {
    summary = `Payment is disputed and funds are on hold${
      why?.reason ? `: ${why.reason}` : '.'
    }`
  } else if (headline === 'paid') {
    summary = `Paid in full — ${formatCurrency(confirmedReceived)} confirmed against ${formatCurrency(
      invoice.amount
    )}.`
    if (hasRejected || hasReversed) {
      summary += ` An earlier payment attempt was ${
        hasRejected ? 'rejected' : 'reversed'
      } — that row in the history below is superseded and doesn’t affect the balance.`
    }
  } else if (headline === 'partially_paid') {
    summary = `${formatCurrency(confirmedReceived)} confirmed; ${formatCurrency(
      balanceDue
    )} still due.`
  } else if (headline === 'unpaid') {
    summary = `Nothing confirmed yet. Balance due ${formatCurrency(balanceDue)}.`
  } else if (headline === 'awaiting_carrier_receipt') {
    if (isPartialRemittance) {
      summary = `Yes — short remittance. Credyx posted ${formatCurrency(
        postedAwaitingConfirm
      )} of ${formatCurrency(
        invoice.amount
      )}. Confirm what you received (or dispute). ${formatCurrency(
        remainingAfterPending
      )} still due after this payment.`
    } else if (postedAwaitingConfirm > 0.01) {
      summary = `Credyx posted ${formatCurrency(
        postedAwaitingConfirm
      )} — confirm you received the funds (or dispute).`
    } else {
      summary = 'Credyx posted a payment — confirm you received the funds (or dispute).'
    }
  } else if (headline === 'awaiting_credyx_confirm') {
    summary = 'You posted a payment — waiting for Credyx to confirm.'
  } else if (headline === 'overpaid') {
    summary = `Overpaid — confirmed ${formatCurrency(confirmedReceived)} vs face ${formatCurrency(
      invoice.amount
    )}.`
  } else if (headline === 'payment_rejected') {
    summary = `Payment was rejected${why?.reason ? `: ${why.reason}` : '.'} Balance due ${formatCurrency(
      balanceDue
    )}.`
  } else {
    summary = `Balance due ${formatCurrency(balanceDue)}. Display status: ${parts.status}.`
  }

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    brokerName: invoice.broker_name,
    headline,
    headlineLabel: headlineLabel(headline, { isPartialRemittance }),
    summary,
    faceAmount: invoice.amount,
    faceAmountLabel: formatCurrency(invoice.amount),
    confirmedReceived,
    confirmedReceivedLabel: formatCurrency(confirmedReceived),
    postedAwaitingConfirm,
    postedAwaitingConfirmLabel: formatCurrency(postedAwaitingConfirm),
    remainingAfterPending,
    remainingAfterPendingLabel: formatCurrency(remainingAfterPending),
    isPartialRemittance,
    balanceDue,
    balanceDueLabel: formatCurrency(balanceDue),
    balanceTone,
    displayStatus: parts.status,
    variance: parts.variance,
    invoiceStatus: invoice.status,
    why,
    payments: rows.slice(0, 8).map((p) => ({
      id: p.id,
      amount: p.amount,
      amountLabel: formatCurrency(p.amount),
      status: p.status,
      statusLabel: PAYMENT_STATUS_LABELS[p.status],
      date: (p.received_date || p.payment_date || '').slice(0, 10),
      reason:
        p.reversal_reason?.trim() ||
        p.rejection_reason?.trim() ||
        p.dispute?.description?.trim() ||
        undefined,
      reversalType: p.reversal_type,
    })),
  }
}

/** Build snapshots for every invoice the user mentioned (or that has matching payments). */
export function buildPaymentStatusSnapshots(
  invoices: Invoice[],
  payments: Payment[],
  limit = 4
): AssistantPaymentStatus[] {
  return invoices.slice(0, limit).map((inv) => buildPaymentStatusSnapshot(inv, payments))
}

/** Detect payment-status questions (includes follow-ups like “why?” when invoice # is in context). */
export function isPaymentStatusQuery(prompt: string): boolean {
  if (
    /\b(payment|paid|pay|reversed|reversal|balance\s*due|what\s+happened|receipt|disputed?|rejected|short\s*pay|shortfall|underpaid|partial|still\s+due|remittance)\b/i.test(
      prompt
    )
  ) {
    return true
  }
  // “What’s going on with Inv #…” / status of a named invoice
  if (
    /\b(what('s| is|s)?\s+(going\s+on|up|the\s+status)|status\s+(of|on)|look\s+at)\b/i.test(
      prompt
    ) &&
    /\b(invoice|inv\s*#|#\s*\d{3,})\b/i.test(prompt)
  ) {
    return true
  }
  // “why / more details” after discussing a payment invoice
  return (
    /\b(why|more details|give me more|explain)\b/i.test(prompt) &&
    /\b(invoice|#\s*\d{3,}|\breversed\b|\bbalance\b|\bpaid\b|\bpayment\b)\b/i.test(prompt)
  )
}
