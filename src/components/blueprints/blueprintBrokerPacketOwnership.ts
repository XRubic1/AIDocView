/**
 * When a Live invoice blueprint Then-do sends the broker paperwork packet,
 * Process must skip Settings PPW for that invoice (avoid double-send).
 */
import type { BlueprintFlowNode } from '../../types/blueprintGraph'
import type { Invoice } from '../../types/invoice'
import { isBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { findBestMatchingBlueprint } from './blueprintAutoMatch'
import { getInvoiceBlueprintAssignment } from './invoiceBlueprintAssignment'
import { getSavedBlueprint } from './blueprintStore'
import { getActionIds } from './blueprintSubject'

const PACKET_ACTION = 'email_broker_packet'
const CHASE_WITH_PACKET = new Set(['email_payment_status', 'email_followup'])

/** True when any Then-do will send the real broker packet (with attachments). */
export function blueprintGraphOwnsBrokerPacket(
  nodes: BlueprintFlowNode[]
): boolean {
  for (const n of nodes) {
    if (n.data.kind !== 'action') continue
    for (const id of getActionIds(n.data)) {
      if (id === PACKET_ACTION) return true
      if (!CHASE_WITH_PACKET.has(id)) continue
      const tpl = n.data.actionConfigs?.[id]?.templateId?.trim()
      if (tpl === 'broker_packet') return true
    }
  }
  return false
}

function blueprintOwnsPacket(blueprintId: string): boolean {
  const bp = getSavedBlueprint(blueprintId)
  if (!bp) return false
  return blueprintGraphOwnsBrokerPacket(bp.nodes)
}

/**
 * Skip Process / Settings PPW when Live runner will send the packet
 * via Then-do (assigned graph, or best-match on invoice_processed).
 */
export function shouldSkipProcessPpwForInvoice(invoice: Invoice): boolean {
  if (!isBlueprintsRunnerEnabled()) return false
  const assignment = getInvoiceBlueprintAssignment(invoice.id)
  if (assignment && blueprintOwnsPacket(assignment.blueprintId)) return true
  const best = findBestMatchingBlueprint('invoice_processed', invoice)
  if (best && blueprintGraphOwnsBrokerPacket(best.blueprint.nodes)) return true
  return false
}
