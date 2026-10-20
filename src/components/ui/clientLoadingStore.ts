import { useSyncExternalStore } from 'react'

let activeLoads = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

/** Mark one data load as in flight; returns the matching end callback. */
export function beginClientLoading(): () => void {
  activeLoads += 1
  emit()
  let ended = false
  return () => {
    if (ended) return
    ended = true
    activeLoads = Math.max(0, activeLoads - 1)
    emit()
  }
}

/** True while any client page data load is running (drives the top loading bar). */
export function useClientLoading(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => activeLoads > 0,
    () => false
  )
}
