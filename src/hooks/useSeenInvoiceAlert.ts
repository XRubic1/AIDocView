import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Tracks whether a group of invoices (e.g. held or overdue) contains items the
 * user has not seen yet, persisting the "seen" set in localStorage so the alert
 * survives reloads until the user interacts.
 *
 * A card is considered to have new items when any current invoice id is missing
 * from the stored seen set. Calling {@link acknowledge} marks the current ids as
 * seen and clears the alert.
 */

/** Safely reads a stored id list; returns an empty set on any failure. */
function readSeenSet(storageKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set()
  } catch {
    return new Set()
  }
}

/** Safely writes the id list; ignores storage errors (e.g. private mode). */
function writeSeenSet(storageKey: string, ids: string[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(ids))
  } catch {
    /* storage unavailable — degrade gracefully */
  }
}

export interface SeenInvoiceAlert {
  /** True when at least one current id has not been acknowledged yet. */
  hasNew: boolean
  /** How many current ids are new (unseen). */
  newCount: number
  /** Marks all current ids as seen and clears the alert. */
  acknowledge: () => void
}

/**
 * @param storageKey Stable per-client, per-category key (null disables tracking).
 * @param currentIds Current invoice ids in the category.
 */
export function useSeenInvoiceAlert(
  storageKey: string | null,
  currentIds: string[]
): SeenInvoiceAlert {
  // Stable primitive so effects/memos only re-run when the id set changes.
  const idsSignature = useMemo(() => currentIds.join('|'), [currentIds])

  const [newCount, setNewCount] = useState(0)

  useEffect(() => {
    if (!storageKey) {
      setNewCount(0)
      return
    }
    const seen = readSeenSet(storageKey)
    const unseen = currentIds.filter((id) => !seen.has(id)).length
    setNewCount(unseen)
    // idsSignature captures currentIds changes; storageKey guards client switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, idsSignature])

  const acknowledge = useCallback(() => {
    if (!storageKey) return
    writeSeenSet(storageKey, currentIds)
    setNewCount(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, idsSignature])

  return { hasNew: newCount > 0, newCount, acknowledge }
}
