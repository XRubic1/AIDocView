const PREFIX = 'credyx-packet-queued:'

/** Remember a batch that is waiting for another client's packet creation. */
export function markPacketCreationQueued(batchId: string, queued: boolean): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    const key = `${PREFIX}${batchId}`
    if (queued) sessionStorage.setItem(key, '1')
    else sessionStorage.removeItem(key)
  } catch {
    // Private browsing can block sessionStorage.
  }
}

export function isPacketCreationQueued(batchId: string): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false
    return sessionStorage.getItem(`${PREFIX}${batchId}`) === '1'
  } catch {
    return false
  }
}
