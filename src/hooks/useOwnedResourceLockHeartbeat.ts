import { useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  heartbeatLock,
  releaseLock,
  LOCK_HEARTBEAT_MS,
  type ResourceLockType,
} from '../services/resourceLockService'

/**
 * Heartbeat an owned workspace lock while `resourceId` is set.
 * Releases when the id changes/clears, on pagehide, or on unmount.
 */
export function useOwnedResourceLockHeartbeat(
  type: ResourceLockType,
  resourceId: string | null | undefined,
  user: User | null | undefined
): void {
  const userId = user?.id ?? null
  const prevIdRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(userId)
  const typeRef = useRef(type)
  userIdRef.current = userId
  typeRef.current = type

  useEffect(() => {
    if (!userId) {
      const prev = prevIdRef.current
      if (prev) {
        // Cannot release without user id
        prevIdRef.current = null
      }
      return
    }

    const prev = prevIdRef.current
    if (prev && prev !== resourceId) {
      releaseLock(type, prev, userId)
    }
    prevIdRef.current = resourceId ?? null

    if (!resourceId) return

    heartbeatLock(type, resourceId, userId)
    const interval = window.setInterval(() => {
      heartbeatLock(type, resourceId, userId)
    }, LOCK_HEARTBEAT_MS)

    const onHide = () => {
      releaseLock(type, resourceId, userId)
      prevIdRef.current = null
    }
    window.addEventListener('pagehide', onHide)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('pagehide', onHide)
    }
  }, [type, resourceId, userId])

  // Release on full unmount (leaving the page/workspace host).
  useEffect(() => {
    return () => {
      const held = prevIdRef.current
      const uid = userIdRef.current
      const lockType = typeRef.current
      if (held && uid) {
        releaseLock(lockType, held, uid)
        prevIdRef.current = null
      }
    }
  }, [])
}
