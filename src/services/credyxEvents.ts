/**
 * Thin domain event bus for blueprint enrollment and other listeners.
 * Fire-and-forget — listeners must not throw into callers.
 */

export type CredyxEventType =
  | 'broker.created'
  | 'invoice.held'
  | 'invoice.hold_cleared'
  | 'invoice.ppw_sent'
  | 'invoice.purchased'
  | 'payment.posted'
  | 'batch.processed'

export type CredyxEventPayload = {
  type: CredyxEventType
  /** Primary entity id (broker / invoice / batch / payment). */
  id: string
  at: string
  meta?: Record<string, unknown>
}

type CredyxEventListener = (event: CredyxEventPayload) => void

const listeners = new Set<CredyxEventListener>()

export function onCredyxEvent(listener: CredyxEventListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Emit a domain event to all subscribers (errors are swallowed per listener). */
export function emitCredyxEvent(
  type: CredyxEventType,
  id: string,
  meta?: Record<string, unknown>
): void {
  const event: CredyxEventPayload = {
    type,
    id,
    at: new Date().toISOString(),
    meta,
  }
  try {
    window.dispatchEvent(
      new CustomEvent('credyx:domain-event', { detail: event })
    )
  } catch {
    /* ignore */
  }
  for (const listener of listeners) {
    try {
      listener(event)
    } catch (err) {
      console.warn('[credyxEvents]', type, err)
    }
  }
}
