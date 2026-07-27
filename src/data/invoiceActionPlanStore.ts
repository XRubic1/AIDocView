import type {
  InvoiceActionPlan,
  InvoiceCalendarEvent,
} from '../types/invoiceActionPlan'

const PLAN_KEY = 'credyx_invoice_action_plans_v1'
const EVENT_KEY = 'credyx_invoice_calendar_events_v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

let plans: InvoiceActionPlan[] = []
let events: InvoiceCalendarEvent[] = []
let hydrated = false

function ensureHydrated(): void {
  if (hydrated || typeof localStorage === 'undefined') return
  plans = readJson(PLAN_KEY, [])
  events = readJson(EVENT_KEY, [])
  hydrated = true
}

function persist(): void {
  if (typeof localStorage === 'undefined') return
  writeJson(PLAN_KEY, plans)
  writeJson(EVENT_KEY, events)
}

export function getActiveInvoiceActionPlan(invoiceId: string): InvoiceActionPlan | null {
  ensureHydrated()
  return plans.find((p) => p.invoice_id === invoiceId && p.status === 'active') ?? null
}

export function listActivePlansForClient(clientId: string): InvoiceActionPlan[] {
  ensureHydrated()
  return plans.filter((p) => p.client_id === clientId && p.status === 'active')
}

export function listCalendarEventsForClient(
  clientId: string,
  opts?: { includeObsolete?: boolean }
): InvoiceCalendarEvent[] {
  ensureHydrated()
  return events.filter((e) => {
    if (e.client_id !== clientId) return false
    if (!opts?.includeObsolete && e.status === 'obsolete') return false
    return true
  })
}

export function listCalendarEventsForInvoice(invoiceId: string): InvoiceCalendarEvent[] {
  ensureHydrated()
  return events.filter((e) => e.invoice_id === invoiceId && e.status !== 'obsolete')
}

/** Supersede prior active plan, then insert plan + events. */
export function saveInvoiceActionPlan(
  plan: InvoiceActionPlan,
  planEvents: InvoiceCalendarEvent[]
): void {
  ensureHydrated()
  const now = new Date().toISOString()
  plans = plans.map((p) =>
    p.invoice_id === plan.invoice_id && p.status === 'active'
      ? { ...p, status: 'superseded' as const, updated_at: now }
      : p
  )
  // Mark prior pending events obsolete when replacing the plan.
  events = events.map((e) =>
    e.invoice_id === plan.invoice_id && e.status === 'pending'
      ? { ...e, status: 'obsolete' as const, updated_at: now }
      : e
  )
  plans = [plan, ...plans]
  events = [...planEvents, ...events]
  persist()
}

export function updateCalendarEventStatus(
  eventId: string,
  status: InvoiceCalendarEvent['status'],
  note?: string
): InvoiceCalendarEvent | null {
  ensureHydrated()
  const idx = events.findIndex((e) => e.id === eventId)
  if (idx < 0) return null
  const now = new Date().toISOString()
  events[idx] = {
    ...events[idx],
    status,
    completed_at: status === 'done' ? now : events[idx].completed_at,
    completion_note: note ?? events[idx].completion_note,
    updated_at: now,
  }
  persist()
  return events[idx]
}

export function clearInvoiceActionPlanStore(): void {
  plans = []
  events = []
  hydrated = true
  persist()
}
