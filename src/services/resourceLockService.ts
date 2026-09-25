/**
 * Realtime workspace locks for batches + invoices.
 * Persists via updateBatch / updateInvoice so tenantDataLiveSync fans out.
 */
import type { User } from '@supabase/supabase-js'
import { getBatchById, updateBatch } from '../data/mockBatches'
import { getInvoiceById, updateInvoice } from '../data/mockInvoices'
import { getAdminUserDisplayName } from '../config/adminNav'
import { notifyTenantDataUpdated } from './supabase/tenantDataLiveSync'
import { getAdminStaffRole } from '../utils/adminRoles'

export const AI_DOC_SPLIT_LOCK = 'AI Doc Split'

/** Heartbeat interval while a workspace is open. */
export const LOCK_HEARTBEAT_MS = 30_000

/** Locks older than this without a heartbeat are reclaimable. */
export const LOCK_STALE_MS = 2 * 60_000

export type ResourceLockType = 'batch' | 'invoice'

export type ResourceLockState = {
  in_use: boolean
  in_use_by?: string
  in_use_by_user_id?: string | null
  in_use_at?: string | null
}

export type LockActor = {
  userId: string
  displayName: string
}

export type AcquireLockResult =
  | { ok: true; state: ResourceLockState }
  | {
      ok: false
      reason: 'not_found' | 'held_by_other' | 'held_by_ai'
      holderName: string
      holderUserId: string | null
      state: ResourceLockState
    }

function nowIso(): string {
  return new Date().toISOString()
}

function isStale(inUseAt: string | null | undefined): boolean {
  if (!inUseAt) return true
  const t = Date.parse(inUseAt)
  if (Number.isNaN(t)) return true
  return Date.now() - t > LOCK_STALE_MS
}

/** Resolve staff display name for lock bubbles (full_name preferred). */
export function resolveStaffLockDisplayName(user: User | null | undefined): string {
  const meta = user?.user_metadata as Record<string, unknown> | undefined
  const full = String(meta?.full_name ?? meta?.name ?? '').trim()
  if (full) return full
  return getAdminUserDisplayName(user?.email ?? null) || 'Staff'
}

export function isSuperAdminUser(user: User | null | undefined): boolean {
  return getAdminStaffRole(user) === 'super_admin'
}

export function getLockState(
  type: ResourceLockType,
  id: string
): ResourceLockState | null {
  if (type === 'batch') {
    const batch = getBatchById(id)
    if (!batch) return null
    return {
      in_use: batch.in_use === true,
      in_use_by: batch.in_use_by,
      in_use_by_user_id: batch.in_use_by_user_id ?? null,
      in_use_at: batch.in_use_at ?? null,
    }
  }
  const inv = getInvoiceById(id)
  if (!inv) return null
  return {
    in_use: inv.in_use === true,
    in_use_by: inv.in_use_by,
    in_use_by_user_id: inv.in_use_by_user_id ?? null,
    in_use_at: inv.in_use_at ?? null,
  }
}

function clearLockFields(): ResourceLockState {
  return {
    in_use: false,
    in_use_by: undefined,
    in_use_by_user_id: null,
    in_use_at: null,
  }
}

function heldLockFields(actor: LockActor): ResourceLockState {
  return {
    in_use: true,
    in_use_by: actor.displayName,
    in_use_by_user_id: actor.userId,
    in_use_at: nowIso(),
  }
}

function persistLock(
  type: ResourceLockType,
  id: string,
  fields: ResourceLockState
): ResourceLockState | null {
  if (type === 'batch') {
    const batch = getBatchById(id)
    if (!batch) return null
    updateBatch(id, {
      in_use: fields.in_use,
      in_use_by: fields.in_use_by,
      in_use_by_user_id: fields.in_use_by_user_id ?? null,
      in_use_at: fields.in_use_at ?? null,
    })
    notifyTenantDataUpdated(['batches'], batch.client_id)
    return fields
  }
  const inv = getInvoiceById(id)
  if (!inv) return null
  updateInvoice(id, {
    in_use: fields.in_use,
    in_use_by: fields.in_use_by,
    in_use_by_user_id: fields.in_use_by_user_id ?? null,
    in_use_at: fields.in_use_at ?? null,
  })
  notifyTenantDataUpdated(['invoices'], inv.client_id)
  return fields
}

function isAiLock(state: ResourceLockState): boolean {
  return state.in_use === true && state.in_use_by === AI_DOC_SPLIT_LOCK && !state.in_use_by_user_id
}

function isHeldByOtherLiveHuman(state: ResourceLockState, userId: string): boolean {
  if (!state.in_use) return false
  if (isStale(state.in_use_at)) return false
  if (state.in_use_by_user_id && state.in_use_by_user_id !== userId) return true
  // Legacy / AI-style lock without user id but with a live timestamp & non-AI label
  if (
    !state.in_use_by_user_id &&
    state.in_use_by &&
    state.in_use_by !== AI_DOC_SPLIT_LOCK &&
    !isStale(state.in_use_at)
  ) {
    return true
  }
  return false
}

/**
 * Acquire a human workspace lock.
 * Succeeds when free, owned by the same user, or stale.
 * Fails when another live human or AI Doc Split holds it.
 */
export function tryAcquireLock(
  type: ResourceLockType,
  id: string,
  actor: LockActor
): AcquireLockResult {
  const state = getLockState(type, id)
  if (!state) {
    return {
      ok: false,
      reason: 'not_found',
      holderName: 'Unknown',
      holderUserId: null,
      state: clearLockFields(),
    }
  }

  if (state.in_use && isAiLock(state) && !isStale(state.in_use_at)) {
    return {
      ok: false,
      reason: 'held_by_ai',
      holderName: state.in_use_by || AI_DOC_SPLIT_LOCK,
      holderUserId: null,
      state,
    }
  }

  if (isHeldByOtherLiveHuman(state, actor.userId)) {
    return {
      ok: false,
      reason: 'held_by_other',
      holderName: state.in_use_by || 'Another user',
      holderUserId: state.in_use_by_user_id ?? null,
      state,
    }
  }

  // Same user re-entering, free, or stale → take lock
  const next = heldLockFields(actor)
  const saved = persistLock(type, id, next)
  if (!saved) {
    return {
      ok: false,
      reason: 'not_found',
      holderName: 'Unknown',
      holderUserId: null,
      state,
    }
  }
  return { ok: true, state: saved }
}

/** Refresh in_use_at if the caller still owns the lock. */
export function heartbeatLock(
  type: ResourceLockType,
  id: string,
  userId: string
): boolean {
  const state = getLockState(type, id)
  if (!state?.in_use) return false
  if (state.in_use_by_user_id !== userId) return false
  persistLock(type, id, {
    ...state,
    in_use_at: nowIso(),
  })
  return true
}

/** Clear lock only if the caller owns it. */
export function releaseLock(
  type: ResourceLockType,
  id: string,
  userId: string
): boolean {
  const state = getLockState(type, id)
  if (!state?.in_use) return false
  if (state.in_use_by_user_id !== userId) return false
  persistLock(type, id, clearLockFields())
  return true
}

/**
 * Force-clear any lock. Super admin only.
 * Also used after Override cancels AI Doc Split (caller must already be authorized).
 */
export function forceReleaseLock(
  type: ResourceLockType,
  id: string,
  user: User | null | undefined
): { ok: true } | { ok: false; reason: 'forbidden' | 'not_found' } {
  if (!isSuperAdminUser(user)) {
    return { ok: false, reason: 'forbidden' }
  }
  const state = getLockState(type, id)
  if (!state) return { ok: false, reason: 'not_found' }
  persistLock(type, id, clearLockFields())
  return { ok: true }
}

/** Clear lock without role check — for AI Doc Split pipeline unlock only. */
export function clearAiDocSplitLock(batchId: string): void {
  const batch = getBatchById(batchId)
  if (!batch) return
  if (batch.in_use_by && batch.in_use_by !== AI_DOC_SPLIT_LOCK) return
  if (batch.in_use_by_user_id) return
  updateBatch(batchId, clearLockFields())
  notifyTenantDataUpdated(['batches'], batch.client_id)
}

/** Set AI Doc Split lock; does not clobber a live human lock. */
export function setAiDocSplitLock(batchId: string): boolean {
  const batch = getBatchById(batchId)
  if (!batch) return false
  if (
    batch.in_use &&
    batch.in_use_by_user_id &&
    !isStale(batch.in_use_at)
  ) {
    return false
  }
  updateBatch(batchId, {
    in_use: true,
    in_use_by: AI_DOC_SPLIT_LOCK,
    in_use_by_user_id: null,
    in_use_at: nowIso(),
  })
  notifyTenantDataUpdated(['batches'], batch.client_id)
  return true
}

/** Whether a lock state should show the presence bubble. */
export function isResourceLocked(state: ResourceLockState | null | undefined): boolean {
  return Boolean(state?.in_use)
}

/** True when lock is a human holder (vs AI Doc Split). */
export function isHumanLock(state: ResourceLockState | null | undefined): boolean {
  if (!state?.in_use) return false
  return Boolean(state.in_use_by_user_id) || Boolean(
    state.in_use_by && state.in_use_by !== AI_DOC_SPLIT_LOCK
  )
}
