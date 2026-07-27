import { mockBrokers } from '../data/mockBrokers'
import {
  getActiveInvoiceActionPlan,
  listCalendarEventsForClient,
  listCalendarEventsForInvoice,
  saveInvoiceActionPlan,
  updateCalendarEventStatus,
} from '../data/invoiceActionPlanStore'
import type { Invoice } from '../types/invoice'
import type { InvoiceCalendarEvent } from '../types/invoiceActionPlan'
import type { AssistantCalendarEvent } from '../types/assistant'
import { computeInvoiceActionPlan } from '../utils/computeInvoiceActionPlan'

export type EnsureInvoicePlanArgs = {
  invoice: Invoice
  clientId: string
  /** Managed clients → Credyx owns chase events. */
  managedTier?: boolean
  force?: boolean
}

/** Ensure an active action plan exists for an open invoice. */
export function ensureInvoiceActionPlan(args: EnsureInvoicePlanArgs) {
  const existing = getActiveInvoiceActionPlan(args.invoice.id)
  if (existing && !args.force) {
    return {
      plan: existing,
      events: listCalendarEventsForInvoice(args.invoice.id),
    }
  }

  const broker = mockBrokers.find(
    (b) =>
      b.id === args.invoice.broker_id ||
      b.name === args.invoice.broker_name
  )

  const computed = computeInvoiceActionPlan({
    invoice: args.invoice,
    clientId: args.clientId,
    broker: broker ?? null,
    chaseOwner: args.managedTier ? 'credyx_staff' : 'user',
  })
  if (!computed) return null

  saveInvoiceActionPlan(computed.plan, computed.events)
  return computed
}

export function getInvoiceCalendarEvents(invoiceId: string): InvoiceCalendarEvent[] {
  return listCalendarEventsForInvoice(invoiceId)
}

export function getClientInvoiceCalendarEvents(clientId: string): InvoiceCalendarEvent[] {
  return listCalendarEventsForClient(clientId)
}

/** Map DB/local calendar event → Assistant calendar shape. */
export function toAssistantCalendarEvent(
  event: InvoiceCalendarEvent,
  invoice: Pick<Invoice, 'invoice_number' | 'broker_name' | 'amount'>
): AssistantCalendarEvent {
  const due = new Date(event.due_at)
  const dueDate = due.toISOString().slice(0, 10)
  const dueLabel = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    invoiceNumber: invoice.invoice_number,
    invoiceId: event.invoice_id,
    brokerName: invoice.broker_name,
    dueDate,
    dueLabel,
    owner: event.owner,
    status: event.status,
    detail: event.detail,
    amountLabel: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(invoice.amount),
  }
}

export function completeInvoiceCalendarEvent(eventId: string, note?: string) {
  return updateCalendarEventStatus(eventId, 'done', note)
}

export function snoozeInvoiceCalendarEvent(eventId: string) {
  return updateCalendarEventStatus(eventId, 'snoozed')
}
