/**
 * When a batch blueprint owns the carrier “batch processed” email,
 * Settings · Email sends must not also send (avoid double Process email).
 */
import type { BlueprintFlowNode } from '../../types/blueprintGraph'
import { isBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { findBestMatchingBatchBlueprint } from './blueprintAutoMatch'
import { getSavedBlueprint } from './blueprintStore'
import { getBatchBlueprintAssignment } from './batchBlueprintAssignment'
import { getActionIds } from './blueprintSubject'

export const BATCH_CARRIER_EMAIL_ACTION_IDS = new Set([
  'email_carrier_batch_processed',
])

export function blueprintGraphOwnsBatchCarrierEmail(
  nodes: BlueprintFlowNode[]
): boolean {
  for (const n of nodes) {
    if (n.data.kind !== 'action') continue
    for (const id of getActionIds(n.data)) {
      if (BATCH_CARRIER_EMAIL_ACTION_IDS.has(id)) return true
    }
  }
  return false
}

function blueprintOwnsCarrierEmail(blueprintId: string): boolean {
  const bp = getSavedBlueprint(blueprintId)
  if (!bp) return false
  return blueprintGraphOwnsBatchCarrierEmail(bp.nodes)
}

/**
 * Skip Settings `batch_processed_carrier` send when Live runner will send
 * via Then-do (assigned graph, or best-match on Process).
 */
export function shouldSkipSettingsBatchCarrierEmail(batchId: string): boolean {
  if (!isBlueprintsRunnerEnabled()) return false
  const assignment = getBatchBlueprintAssignment(batchId)
  if (assignment) return blueprintOwnsCarrierEmail(assignment.blueprintId)
  const best = findBestMatchingBatchBlueprint('batch_processed')
  if (!best) return false
  return blueprintGraphOwnsBatchCarrierEmail(best.blueprint.nodes)
}
