/**
 * Session memory for carrier Assistant tasks (mock-first).
 * Tracks pending POD uploads and completed paperwork events.
 */

const PENDING_UPLOAD_KEY = 'credyx:assistant-pending-upload'
const COMPLETED_EVENTS_KEY = 'credyx:assistant-completed-events'
const COMPLETED_INVOICE_DOCS_KEY = 'credyx:assistant-completed-invoice-docs'

export type AssistantPendingUpload = {
  eventId: string
  invoiceId: string
}

/** Remember which paperwork task launched the invoice upload flow. */
export function stashAssistantPendingUpload(pending: AssistantPendingUpload): void {
  try {
    sessionStorage.setItem(PENDING_UPLOAD_KEY, JSON.stringify(pending))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/** Read pending upload without clearing it. */
export function peekAssistantPendingUpload(): AssistantPendingUpload | null {
  try {
    const raw = sessionStorage.getItem(PENDING_UPLOAD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AssistantPendingUpload
    if (!parsed?.eventId || !parsed?.invoiceId) return null
    return parsed
  } catch {
    return null
  }
}

export function clearAssistantPendingUpload(): void {
  try {
    sessionStorage.removeItem(PENDING_UPLOAD_KEY)
  } catch {
    // Ignore.
  }
}

function readIdSet(key: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

function writeIdSet(key: string, ids: Set<string>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify([...ids]))
  } catch {
    // Ignore.
  }
}

/** Mark a calendar/event id completed (e.g. after Mark done or successful upload). */
export function markAssistantEventCompleted(eventId: string): void {
  if (!eventId) return
  const ids = readIdSet(COMPLETED_EVENTS_KEY)
  ids.add(eventId)
  writeIdSet(COMPLETED_EVENTS_KEY, ids)
}

export function getCompletedAssistantEventIds(): Set<string> {
  return readIdSet(COMPLETED_EVENTS_KEY)
}

/** Mark paperwork for an invoice complete after docs are uploaded. */
export function markAssistantInvoiceDocsUploaded(invoiceId: string): void {
  if (!invoiceId) return
  const ids = readIdSet(COMPLETED_INVOICE_DOCS_KEY)
  ids.add(invoiceId)
  writeIdSet(COMPLETED_INVOICE_DOCS_KEY, ids)

  const pending = peekAssistantPendingUpload()
  if (pending && pending.invoiceId === invoiceId) {
    markAssistantEventCompleted(pending.eventId)
    clearAssistantPendingUpload()
  }
}

export function getInvoicesWithUploadedDocs(): Set<string> {
  return readIdSet(COMPLETED_INVOICE_DOCS_KEY)
}

const CUSTOM_EVENTS_KEY = 'credyx:assistant-custom-events'

/** @deprecated Prefer shared calendar store — kept only to clear old session keys. */
export function clearLegacyCustomAssistantEvents(): void {
  try {
    sessionStorage.removeItem(CUSTOM_EVENTS_KEY)
  } catch {
    // Ignore.
  }
}

/**
 * Apply session completions onto mock calendar events (paperwork → done after upload).
 */
export function applyAssistantCompletions<
  T extends { id: string; invoiceId: string; type: string; status: string },
>(events: T[]): T[] {
  const doneEvents = getCompletedAssistantEventIds()
  const doneInvoices = getInvoicesWithUploadedDocs()
  return events.map((e) => {
    if (e.status === 'done') return e
    if (doneEvents.has(e.id)) return { ...e, status: 'done' as T['status'] }
    if (e.type === 'paperwork_check' && doneInvoices.has(e.invoiceId)) {
      return { ...e, status: 'done' as T['status'] }
    }
    return e
  })
}
