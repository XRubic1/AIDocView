/**
 * Then-do tasks staff can run on an invoice, taken from saved invoice blueprints.
 */
import type { SavedBlueprint } from '../../types/blueprintGraph'
import type { BlueprintActionTaskConfig } from './blueprintActionSetup'
import { INVOICE_ACTION_OPTIONS, lookupActionById } from './blueprintCatalog'
import { listSavedBlueprints } from './blueprintStore'
import { getActionIds } from './blueprintSubject'

export type InvoiceBlueprintAction = {
  /** Stable key for this card (action + template + label). */
  key: string
  actionId: string
  label: string
  detail: string
  blueprintId: string
  blueprintName: string
  config?: BlueprintActionTaskConfig
}

const INVOICE_ACTION_IDS = new Set(INVOICE_ACTION_OPTIONS.map((a) => a.id))

function triggerSubject(bp: SavedBlueprint): string | undefined {
  const trigger = bp.nodes.find((n) => n.data?.kind === 'trigger')
  return trigger?.data?.triggerSubject
}

/** Invoice graphs only. First copy of the same action + template + label wins. */
export function collectInvoiceBlueprintActions(
  blueprints: SavedBlueprint[]
): InvoiceBlueprintAction[] {
  const out: InvoiceBlueprintAction[] = []
  const seen = new Set<string>()

  for (const bp of blueprints) {
    const subject = triggerSubject(bp)
    if (subject === 'brokers' || subject === 'batches') continue

    for (const node of bp.nodes) {
      if (node.data?.kind !== 'action') continue
      for (const actionId of getActionIds(node.data)) {
        if (!INVOICE_ACTION_IDS.has(actionId)) continue
        const catalog = lookupActionById(actionId)
        const config = node.data.actionConfigs?.[actionId]
        const label = (node.data.label || catalog?.defaultTitle || actionId).trim()
        const detail = (node.data.status || catalog?.cardLine || '').trim()
        const key = `${actionId}|${config?.templateId?.trim() || ''}|${label}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          key,
          actionId,
          label,
          detail,
          blueprintId: bp.id,
          blueprintName: bp.name,
          config,
        })
      }
    }
  }

  return out
}

export function listInvoiceBlueprintActions(): InvoiceBlueprintAction[] {
  return collectInvoiceBlueprintActions(listSavedBlueprints())
}
