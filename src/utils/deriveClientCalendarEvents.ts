/**
 * Build carrier Assistant calendar events + due-today actions from live invoices/payments.
 */

import type { AssistantActionItem, AssistantCalendarEvent } from '../types/assistant'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { formatCurrency } from './format'
import { isOpenArInvoice } from './invoiceAging'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from './paymentVariance'
import { computeCashCollectionForecast } from './cashCollectionForecast'
import { isClientVisibleHold } from './clientInvoiceView'
import { deriveHoldExplanation } from './assistantHoldExplanation'
import { getOpenDisputes } from '../services/clientInvoiceActions'
import { applyAssistantCompletions } from './assistantTaskStore'

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

/** Past due dates surface as today so they stay actionable. */
function clampToTodayOrLater(dateKey: string, asOf = new Date()): string {
  const today = todayKey(asOf)
  return dateKey < today ? today : dateKey
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

  const forecast = computeCashCollectionForecast(invoices, payments, 45, asOf)
  const predictedById = new Map(
    forecast.top_invoices.map((row) => [row.invoice_id, row.predicted_date])
  )

  const openWithBalance = invoices.filter(
    (inv) => isOpenArInvoice(inv) && getInvoiceOpenArBalance(inv, payments) > AMOUNT_EPSILON
  )

  for (const inv of openWithBalance.slice(0, 40)) {
    const rawDate =
      predictedById.get(inv.id) ||
      inv.expected_payment_date ||
      inv.due_date ||
      today
    const dueDate = clampToTodayOrLater(rawDate.slice(0, 10), asOf)
    events.push({
      id: `live-expect-${inv.id}`,
      type: 'expected_payment',
      title: 'Expected payment',
      invoiceNumber: inv.invoice_number,
      invoiceId: inv.id,
      brokerName: inv.broker_name,
      dueDate,
      dueLabel: formatShortDate(dueDate),
      owner: 'system',
      status: 'pending',
      detail: predictedById.has(inv.id)
        ? `Forecast expected pay based on ${inv.broker_name}’s recent payment pattern.`
        : `Expected payment date on file for invoice #${inv.invoice_number}.`,
      amountLabel: formatCurrency(getInvoiceOpenArBalance(inv, payments)),
    })
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
