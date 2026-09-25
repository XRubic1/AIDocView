/**
 * When a blueprint owns broker payment / follow-up emails, old Run chase
 * must skip the payment track for that invoice (avoid double-send).
 * Paperwork track is skipped when the graph includes follow-up + Wait
 * (post-PPW reminder sequence).
 */
import type { BlueprintFlowNode } from '../../types/blueprintGraph'
import type { InvoiceEmailLifecycle } from '../../types/emailLifecycle'
import { isBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { getInvoiceById, updateInvoice } from '../../data/mockInvoices'
import { getSavedBlueprint } from './blueprintStore'
import { getActionIds } from './blueprintSubject'

/** Then-do ids that replace email-lifecycle payment chase. */
export const BROKER_CHASE_EMAIL_ACTION_IDS = new Set([
  'email_payment_status',
  'email_followup',
])

/** True when any Then-do card includes payment / follow-up broker email. */
export function blueprintGraphOwnsBrokerChaseEmails(
  nodes: BlueprintFlowNode[]
): boolean {
  for (const n of nodes) {
    if (n.data.kind !== 'action') continue
    for (const id of getActionIds(n.data)) {
      if (BROKER_CHASE_EMAIL_ACTION_IDS.has(id)) return true
    }
  }
  return false
}

/**
 * Post-PPW paperwork reminders: follow-up email + at least one Wait
 * (timers between asks). Packet-only graphs do not own paperwork chase.
 */
export function blueprintGraphOwnsPaperworkChase(
  nodes: BlueprintFlowNode[]
): boolean {
  let hasFollowup = false
  let hasWait = false
  for (const n of nodes) {
    if (n.data.kind === 'wait') hasWait = true
    if (n.data.kind !== 'action') continue
    for (const id of getActionIds(n.data)) {
      if (id === 'email_followup') hasFollowup = true
    }
  }
  return hasFollowup && hasWait
}

/** Whether assign should stamp email_lifecycle.blueprint_owns_chase. */
export function resolveBlueprintOwnsChaseFlag(
  blueprintId: string | null | undefined
): boolean {
  if (!blueprintId || !isBlueprintsRunnerEnabled()) return false
  const bp = getSavedBlueprint(blueprintId)
  if (!bp) return false
  return blueprintGraphOwnsBrokerChaseEmails(bp.nodes)
}

export function resolveBlueprintOwnsPaperworkFlag(
  blueprintId: string | null | undefined
): boolean {
  if (!blueprintId || !isBlueprintsRunnerEnabled()) return false
  const bp = getSavedBlueprint(blueprintId)
  if (!bp) return false
  return blueprintGraphOwnsPaperworkChase(bp.nodes)
}

/** Stamp / clear email_lifecycle ownership flags for server cron. */
export function syncInvoiceBlueprintOwnsChaseFlag(
  invoiceId: string,
  blueprintId: string | null
): void {
  const inv = getInvoiceById(invoiceId)
  if (!inv) return
  const ownsChase = resolveBlueprintOwnsChaseFlag(blueprintId)
  const ownsPaperwork = resolveBlueprintOwnsPaperworkFlag(blueprintId)
  const prev = inv.email_lifecycle
  if (
    prev?.blueprint_owns_chase === ownsChase &&
    prev?.blueprint_owns_paperwork === ownsPaperwork
  ) {
    return
  }
  const next: InvoiceEmailLifecycle = {
    paperwork_status: prev?.paperwork_status ?? 'unknown',
    ...(prev ?? {}),
    blueprint_owns_chase: ownsChase,
    blueprint_owns_paperwork: ownsPaperwork,
  }
  updateInvoice(invoiceId, { email_lifecycle: next })
}
