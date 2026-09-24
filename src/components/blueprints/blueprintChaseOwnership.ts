/**
 * When a blueprint owns broker payment / follow-up emails, old Run chase
 * must skip the payment track for that invoice (avoid double-send).
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

/** Whether assign should stamp email_lifecycle.blueprint_owns_chase. */
export function resolveBlueprintOwnsChaseFlag(
  blueprintId: string | null | undefined
): boolean {
  if (!blueprintId || !isBlueprintsRunnerEnabled()) return false
  const bp = getSavedBlueprint(blueprintId)
  if (!bp) return false
  return blueprintGraphOwnsBrokerChaseEmails(bp.nodes)
}

/** Stamp / clear email_lifecycle.blueprint_owns_chase for server cron. */
export function syncInvoiceBlueprintOwnsChaseFlag(
  invoiceId: string,
  blueprintId: string | null
): void {
  const inv = getInvoiceById(invoiceId)
  if (!inv) return
  const owns = resolveBlueprintOwnsChaseFlag(blueprintId)
  const prev = inv.email_lifecycle
  if (prev?.blueprint_owns_chase === owns) return
  const next: InvoiceEmailLifecycle = {
    paperwork_status: prev?.paperwork_status ?? 'unknown',
    ...(prev ?? {}),
    blueprint_owns_chase: owns,
  }
  updateInvoice(invoiceId, { email_lifecycle: next })
}
