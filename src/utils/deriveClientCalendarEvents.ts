/**
 * Build carrier Assistant calendar events + due-today actions from live invoices/payments.
 */

import type { AssistantActionItem, AssistantCalendarEvent } from '../types/assistant'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { formatCurrency } from './format'
import { isOpenArInvoice } from './invoiceAging'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from './paymentVariance'
import { isClientVisibleHold } from './clientInvoiceView'
import { deriveHoldExplanation } from './assistantHoldExplanation'
import { getOpenDisputes } from '../services/clientInvoiceActions'
import { applyAssistantCompletions } from './assistantTaskStore'
import { getWillPayScheduledDate, invoiceHasWillPayStatus } from './invoiceWillPay'
import { isPlaceholderPaymentDueDate } from './invoiceDueDate'
import {
  getNextBrokerFollowup,
  toBrokerFollowupCalendarEvent,
} from './nextBrokerFollowup'
import { mockBrokers } from '../data/mockBrokers'

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDateKey(key: string): Date {
  const [y, m, day] = key.split('-').map(Number)
  return new Date(y, m - 1, day, 12, 0, 0, 0)
}

function formatShortDate(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function addDaysKey(dateKey: string, days: number): string {
  const d = parseDateKey(dateKey)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

function todayKey(asOf = new Date()): string {
  return toDateKey(asOf)
}

/** Normalize invoice date fields to YYYY-MM-DD. */
function normalizeDateKey(raw?: string | null): string | null {
  if (!raw?.trim()) return null
  const t = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return toDateKey(d)
}

/**
 * Calendar pay date from the invoice itself — Will Pay schedule, then expected, then due.
 * Does not use broker-lag forecasts.
 */
export function getClientCalendarInvoicePayDate(
  invoice: Pick<
    Invoice,
    | 'status'
    | 'collection_status'
    | 'collection_date'
    | 'notes_history'
    | 'expected_payment_date'
    | 'due_date'
    | 'invoice_date'
    | 'created_at'
  >
): { date: string; kind: 'will_pay' | 'expected' } | null {
  if (invoiceHasWillPayStatus(invoice)) {
    const scheduled = normalizeDateKey(getWillPayScheduledDate(invoice))
    if (scheduled) return { date: scheduled, kind: 'will_pay' }
  }
  const expected =
    normalizeDateKey(invoice.expected_payment_date) || normalizeDateKey(invoice.due_date)
  if (!expected) return null
  if (isPlaceholderPaymentDueDate(invoice, expected)) return null
  return { date: expected, kind: 'expected' }
}

function holdNeedsDocs(invoice: Invoice): boolean {
  if (!isClientVisibleHold(invoice)) return false
  const reason = (invoice.hold_reason ?? '').toLowerCase()
  if (!reason) return true
  return /pod|bol|doc|paper|missing|proof|rate.?con|lumper|scale/.test(reason)
}

function missingDocuments(invoice: Invoice): boolean {
  if (holdNeedsDocs(invoice)) return true
  const openDisputes = getOpenDisputes(invoice)
  if (openDisputes.some((d) => d.reason === 'missing_documents')) return true
  const count = invoice.documents_count ?? invoice.document_doc_ids?.length ?? 0
  // Explicit empty packet on hold / pending review only — avoid flooding open A/R.
  return count === 0 && (invoice.status === 'hold' || invoice.status === 'pending')
}

/**
 * Derive carrier-facing calendar events from tenant invoices + payments.
 */
export function deriveClientCalendarEvents(
  invoices: Invoice[],
  payments: Payment[],
  asOf = new Date()
): AssistantCalendarEvent[] {
  const events: AssistantCalendarEvent[] = []
  const today = todayKey(asOf)

  for (const inv of invoices) {
    if (!missingDocuments(inv)) continue
    events.push({
      id: `live-docs-${inv.id}`,
      type: 'paperwork_check',
      title: holdNeedsDocs(inv) ? 'Upload missing docs' : 'Upload POD / paperwork',
      invoiceNumber: inv.invoice_number,
      invoiceId: inv.id,
      brokerName: inv.broker_name,
      dueDate: today,
      dueLabel: formatShortDate(today),
      owner: 'user',
      status: 'pending',
        detail:
          deriveHoldExplanation(inv, 'client').detail ||
          inv.hold_reason?.trim() ||
          'Documents are missing for this invoice. Upload so Credyx can continue.',
      amountLabel: formatCurrency(inv.amount),
    })
  }

  const openWithBalance = invoices.filter(
    (inv) => isOpenArInvoice(inv) && getInvoiceOpenArBalance(inv, payments) > AMOUNT_EPSILON
  )

  for (const inv of openWithBalance) {
    const pay = getClientCalendarInvoicePayDate(inv)
    if (!pay) continue
    const isWillPay = pay.kind === 'will_pay'
    events.push({
      id: isWillPay ? `live-willpay-${inv.id}` : `live-expect-${inv.id}`,
      type: 'expected_payment',
      title: isWillPay ? 'Will Pay' : 'Expected payment',
      invoiceNumber: inv.invoice_number,
      invoiceId: inv.id,
      brokerName: inv.broker_name,
      dueDate: pay.date,
      dueLabel: formatShortDate(pay.date),
      owner: 'system',
      status: 'pending',
      detail: isWillPay
        ? `Broker confirmed they will pay invoice #${inv.invoice_number} on ${formatShortDate(pay.date)}.`
        : `Expected payment date on invoice #${inv.invoice_number}.`,
      amountLabel: formatCurrency(getInvoiceOpenArBalance(inv, payments)),
    })
  }

  const brokerById = new Map(mockBrokers.map((b) => [b.id, b]))
  for (const inv of openWithBalance) {
    const broker = brokerById.get(inv.broker_id)
    const followup = getNextBrokerFollowup({ invoice: inv, broker, asOf })
    if (!followup) continue
    const evt = toBrokerFollowupCalendarEvent({
      invoice: inv,
      followup,
      asOf,
      audience: 'client',
    })
    if (evt) events.push(evt)
  }

  const recentCutoff = addDaysKey(today, -14)
  const confirmed = payments
    .filter((p) => p.status === 'confirmed')
    .filter((p) => {
      const d = (p.received_date || p.payment_date || '').slice(0, 10)
      return d >= recentCutoff
    })
    .slice(0, 25)

  for (const payment of confirmed) {
    const inv = invoices.find((i) => i.id === payment.invoice_id)
    const dueDate = (payment.received_date || payment.payment_date || today).slice(0, 10)
    events.push({
      id: `live-posted-${payment.id}`,
      type: 'payment_posted',
      title: 'Payment posted',
      invoiceNumber: inv?.invoice_number ?? payment.invoice_number ?? '—',
      invoiceId: payment.invoice_id,
      brokerName: payment.broker_name || inv?.broker_name || '—',
      dueDate,
      dueLabel: formatShortDate(dueDate),
      owner: 'system',
      status: 'pending',
      detail: `Payment ${formatCurrency(payment.amount)} was posted${
        inv ? ` for invoice #${inv.invoice_number}` : ''
      }.`,
      amountLabel: formatCurrency(payment.amount),
    })
  }

  return applyAssistantCompletions(
    events.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title))
  )
}

/** Carrier due-today action cards from derived calendar (docs only). */
export function deriveClientDueTodayActions(
  invoices: Invoice[],
  payments: Payment[],
  asOf = new Date()
): AssistantActionItem[] {
  const today = todayKey(asOf)
  return deriveClientCalendarEvents(invoices, payments, asOf)
    .filter(
      (e) =>
        e.type === 'paperwork_check' &&
        e.status === 'pending' &&
        e.dueDate === today
    )
    .slice(0, 8)
    .map((e) => ({
      id: e.id.replace('live-docs-', 'act-'),
      // Short label — the card UI shows invoice # separately (avoid "Upload… — #123" twice).
      title: e.title.includes('POD') ? 'Upload POD' : 'Missing docs',
      invoiceNumber: e.invoiceNumber,
      invoiceId: e.invoiceId,
      brokerName: e.brokerName,
      dueLabel: 'Due today',
      status: 'pending' as const,
      kind: 'upload_docs' as const,
      amountLabel: e.amountLabel,
      detail: e.detail,
    }))
}

/** Count pending docs tasks due today (FAB badge). */
export function deriveClientDueTodayCount(
  invoices: Invoice[],
  payments: Payment[],
  asOf = new Date()
): number {
  return deriveClientDueTodayActions(invoices, payments, asOf).length
}
