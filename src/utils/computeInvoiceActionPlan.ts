import type { Broker } from '../types/broker'
import type { Invoice } from '../types/invoice'
import type {
  InvoiceActionPlan,
  InvoiceCalendarEvent,
  InvoiceCalendarEventOwner,
} from '../types/invoiceActionPlan'
import { INVOICE_PLAN_STRATEGY_VERSION } from '../types/invoiceActionPlan'

export type ComputeInvoicePlanInput = {
  invoice: Invoice
  clientId: string
  /** Broker master record when known (inquiry days + terms). */
  broker?: Pick<Broker, 'payment_terms_days' | 'payment_status_inquiry_days'> | null
  /** Managed tier → chase events owned by Credyx staff. */
  chaseOwner?: InvoiceCalendarEventOwner
  now?: Date
}

function addDays(isoDate: string, days: number): Date {
  const d = new Date(`${isoDate}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const OPEN_STATUSES = new Set(['pending', 'approved', 'hold'])

/**
 * Rules-based invoice action plan skeleton (no LLM).
 * Uses broker payment_terms_days + payment_status_inquiry_days before inventing cadence.
 */
export function computeInvoiceActionPlan(input: ComputeInvoicePlanInput): {
  plan: InvoiceActionPlan
  events: InvoiceCalendarEvent[]
} | null {
  const { invoice, clientId } = input
  if (!OPEN_STATUSES.has(invoice.status)) return null

  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const terms =
    input.broker?.payment_terms_days ??
    (invoice.due_date && invoice.invoice_date
      ? Math.max(
          1,
          Math.round(
            (Date.parse(invoice.due_date) - Date.parse(invoice.invoice_date)) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 30)
  const inquiryDays = input.broker?.payment_status_inquiry_days ?? 15
  const chaseOwner: InvoiceCalendarEventOwner = input.chaseOwner ?? 'user'

  const expected =
    invoice.expected_payment_date ||
    invoice.due_date ||
    toDateKey(addDays(invoice.invoice_date, terms))

  const planId = newId('iap')
  const plan: InvoiceActionPlan = {
    id: planId,
    invoice_id: invoice.id,
    client_id: clientId,
    strategy_version: INVOICE_PLAN_STRATEGY_VERSION,
    expected_payment_date: expected,
    expected_payment_confidence: invoice.expected_payment_date ? 'medium' : 'low',
    status: 'active',
    created_at: nowIso,
    updated_at: nowIso,
  }

  const events: InvoiceCalendarEvent[] = []

  // Paperwork check shortly after invoice date if still early.
  const paperworkDue = addDays(invoice.invoice_date, 2)
  if (paperworkDue.getTime() >= now.getTime() - 1000 * 60 * 60 * 24) {
    events.push({
      id: newId('ice'),
      plan_id: planId,
      invoice_id: invoice.id,
      client_id: clientId,
      type: 'paperwork_check',
      title: `Confirm paperwork complete — #${invoice.invoice_number}`,
      detail: 'Verify rate con, BOL, POD, and invoice packet are with the broker.',
      due_at: paperworkDue.toISOString(),
      owner: 'user',
      status: 'pending',
      completed_at: null,
      completion_note: null,
      created_at: nowIso,
      updated_at: nowIso,
    })
  }

  // Payment status inquiry after configured days from invoice (or expected − buffer).
  const statusDue = addDays(invoice.invoice_date, inquiryDays)
  events.push({
    id: newId('ice'),
    plan_id: planId,
    invoice_id: invoice.id,
    client_id: clientId,
    type: 'payment_status_check',
    title: `Check payment status — #${invoice.invoice_number}`,
    detail: `Broker inquiry cadence: ${inquiryDays} days after invoice (${invoice.broker_name}).`,
    due_at: statusDue.toISOString(),
    owner: chaseOwner,
    status: 'pending',
    completed_at: null,
    completion_note: null,
    created_at: nowIso,
    updated_at: nowIso,
  })

  events.push({
    id: newId('ice'),
    plan_id: planId,
    invoice_id: invoice.id,
    client_id: clientId,
    type: 'expected_payment',
    title: `Expected payment — #${invoice.invoice_number}`,
    detail: `Forecast based on ${invoice.expected_payment_date ? 'invoice expected date' : `Net ${terms} / due date`}.`,
    due_at: `${expected}T17:00:00.000Z`,
    owner: 'system',
    status: 'pending',
    completed_at: null,
    completion_note: null,
    created_at: nowIso,
    updated_at: nowIso,
  })

  // Escalation a few days after expected if still open (placeholder for Phase 3 polish).
  const escalateDue = addDays(expected, 5)
  events.push({
    id: newId('ice'),
    plan_id: planId,
    invoice_id: invoice.id,
    client_id: clientId,
    type: 'escalate',
    title: `Escalate if unpaid — #${invoice.invoice_number}`,
    detail: 'Follow up if payment has not posted after the expected date.',
    due_at: escalateDue.toISOString(),
    owner: chaseOwner,
    status: 'pending',
    completed_at: null,
    completion_note: null,
    created_at: nowIso,
    updated_at: nowIso,
  })

  return { plan, events }
}
