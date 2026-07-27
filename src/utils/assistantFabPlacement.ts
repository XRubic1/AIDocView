/**
 * Where the Assistant buddy lives: floating bubble or docked in the top nav.
 * Persists in localStorage so the choice survives reloads.
 */

export type AssistantFabPlacement = 'float' | 'dock'

const placementKey = (mode: string) => `credyx-assistant-fab-placement-${mode}`
const OPEN_EVENT = 'credyx-assistant-open'
const UNDOCK_EVENT = 'credyx-assistant-undock'

type Listener = () => void
const listeners = new Map<string, Set<Listener>>()

function emit(mode: string) {
  listeners.get(mode)?.forEach((fn) => {
    try {
      fn()
    } catch {
      // ignore subscriber errors
    }
  })
}

/** Read current placement (defaults to floating). */
export function getAssistantFabPlacement(
  mode: 'client' | 'admin'
): AssistantFabPlacement {
  try {
    const raw = localStorage.getItem(placementKey(mode))
    if (raw === 'dock' || raw === 'float') return raw
  } catch {
    // private mode
  }
  return 'float'
}

/** Dock the bubble into the top nav, or float it again. */
export function setAssistantFabPlacement(
  mode: 'client' | 'admin',
  placement: AssistantFabPlacement
) {
  try {
    localStorage.setItem(placementKey(mode), placement)
  } catch {
    // private mode
  }
  emit(mode)
}

export function subscribeAssistantFabPlacement(
  mode: 'client' | 'admin',
  listener: Listener
): () => void {
  const key = mode
  if (!listeners.has(key)) listeners.set(key, new Set())
  listeners.get(key)!.add(listener)
  return () => listeners.get(key)?.delete(listener)
}

/** Ask the host (AssistantFab) to open the chat drawer. */
export function requestAssistantOpen(prompt?: string) {
  window.dispatchEvent(
    new CustomEvent(OPEN_EVENT, { detail: { prompt: prompt ?? undefined } })
  )
}

export function subscribeAssistantOpen(
  listener: (prompt?: string) => void
): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ prompt?: string }>).detail
    listener(detail?.prompt)
  }
  window.addEventListener(OPEN_EVENT, handler)
  return () => window.removeEventListener(OPEN_EVENT, handler)
}

/** Ask the host to float the buddy at a screen position (from header drag-out). */
export function requestAssistantUndock(position?: { left: number; top: number }) {
  window.dispatchEvent(
    new CustomEvent(UNDOCK_EVENT, { detail: { position } })
  )
}

export function subscribeAssistantUndock(
  listener: (position?: { left: number; top: number }) => void
): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ position?: { left: number; top: number } }>)
      .detail
    listener(detail?.position)
  }
  window.addEventListener(UNDOCK_EVENT, handler)
  return () => window.removeEventListener(UNDOCK_EVENT, handler)
}
