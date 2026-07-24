/**
 * Shared calendar events visible to both Credyx admin and the carrier client.
 * Persisted in localStorage (mock-first); BroadcastChannel keeps tabs in sync.
 */

import type {
  AssistantCalendarEvent,
  AssistantCalendarEventType,
  AssistantEventStatus,
} from '../types/assistant'

const STORAGE_KEY = 'credyx:shared-calendar-events'
const CHANNEL = 'credyx-shared-calendar-events'
const UPDATED_EVENT = 'credyx-shared-calendar-updated'

export type SharedCalendarEventCreator = 'admin' | 'client'

/** Shared event — calendar row plus meeting / email metadata. */
export type SharedCalendarEvent = AssistantCalendarEvent & {
  clientId: string
  clientName: string
  createdBy: SharedCalendarEventCreator
  createdAt: string
  /** Join link for meetings (Zoom, Meet, etc.). */
  meetingUrl?: string
  /** Custom body the sender wants in the email. */
  emailMessage?: string
  /** Whether notify emails were requested at create time. */
  emailRequested?: boolean
}

function emitUpdated(clientId?: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(UPDATED_EVENT, { detail: { clientId } })
  )
}

let broadcast: BroadcastChannel | null = null

function getBroadcast(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null
  }
  if (!broadcast) {
    broadcast = new BroadcastChannel(CHANNEL)
    broadcast.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; clientId?: string } | null
      if (data?.type === 'shared-calendar-updated') {
        emitUpdated(data.clientId)
      }
    }
  }
  return broadcast
}

function readAll(): SharedCalendarEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSharedCalendarEvent)
  } catch {
    return []
  }
}

function writeAll(events: SharedCalendarEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function isSharedCalendarEvent(value: unknown): value is SharedCalendarEvent {
  if (!value || typeof value !== 'object') return false
  const e = value as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    typeof e.clientId === 'string' &&
    typeof e.type === 'string' &&
    typeof e.title === 'string' &&
    typeof e.dueDate === 'string'
  )
}

/** All shared events (admin overview). */
export function getAllSharedCalendarEvents(): SharedCalendarEvent[] {
  return readAll().sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

/** Shared events for one carrier. */
export function getSharedCalendarEventsForClient(clientId: string): SharedCalendarEvent[] {
  if (!clientId) return []
  return getAllSharedCalendarEvents().filter((e) => e.clientId === clientId)
}

/** Upsert a shared event and notify listeners. */
export function upsertSharedCalendarEvent(event: SharedCalendarEvent): SharedCalendarEvent {
  const all = readAll()
  const idx = all.findIndex((e) => e.id === event.id)
  if (idx >= 0) all[idx] = event
  else all.push(event)
  writeAll(all)
  try {
    getBroadcast()?.postMessage({
      type: 'shared-calendar-updated',
      clientId: event.clientId,
    })
  } catch {
    /* ignore */
  }
  emitUpdated(event.clientId)
  return event
}

/** Subscribe to shared calendar changes (same tab + cross-tab). */
export function subscribeSharedCalendarEvents(
  onUpdate: (clientId?: string) => void
): () => void {
  getBroadcast()
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ clientId?: string }>).detail
    onUpdate(detail?.clientId)
  }
  window.addEventListener(UPDATED_EVENT, handler)
  return () => window.removeEventListener(UPDATED_EVENT, handler)
}

/** Map shared event → assistant calendar row (drops extra fields safely). */
export function sharedEventToAssistantEvent(
  event: SharedCalendarEvent
): AssistantCalendarEvent {
  return {
    id: event.id,
    type: event.type as AssistantCalendarEventType,
    title: event.title,
    invoiceNumber: event.invoiceNumber,
    invoiceId: event.invoiceId,
    brokerName: event.brokerName,
    dueDate: event.dueDate,
    dueLabel: event.dueLabel,
    owner: event.owner,
    status: event.status as AssistantEventStatus,
    detail: event.detail,
    amountLabel: event.amountLabel,
    meetingUrl: event.meetingUrl,
  }
}
