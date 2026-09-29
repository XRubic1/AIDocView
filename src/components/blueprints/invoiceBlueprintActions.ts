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
  nodeId: string
  actionId: string
  label: string
  detail: string
  blueprintId: string
  blueprintName: string
  config?: BlueprintActionTaskConfig
}

const INVOICE_ACTION_IDS = new Set(INVOICE_ACTION_OPTIONS.map((a) => a.id))

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** True when running this Then-do can send an email. */
export function invoiceActionSendsEmail(action: {
  actionId: string
  config?: BlueprintActionTaskConfig
}): boolean {
  if (action.actionId === 'notify_carrier') {
    const channel = action.config?.channel || 'both'
    return channel === 'email' || channel === 'both'
  }
  return (
    action.actionId === 'email_broker_packet' ||
    action.actionId === 'email_payment_status' ||
    action.actionId === 'email_followup'
  )
}

/** Split a send-to box into addresses. Duplicates are dropped. */
export function parseActionRecipientEmails(raw: string): {
  emails: string[]
  invalid: string[]
} {
  const emails: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  for (const part of raw.split(/[,;\n]+/)) {
    const value = part.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (EMAIL_RE.test(value)) emails.push(value)
    else invalid.push(value)
  }
  return { emails, invalid }
}

function triggerSubject(bp: SavedBlueprint): string | undefined {
  const trigger = bp.nodes.find((n) => n.data?.kind === 'trigger')
  return trigger?.data?.triggerSubject
}

/** Invoice graphs only. First copy of the same action + template + label wins. */
export function collectInvoiceBlueprintActions(
  blueprints: SavedBlueprint[],
  options?: { perNode?: boolean }
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
        const key = options?.perNode
          ? `${bp.id}|${node.id}|${actionId}`
          : `${actionId}|${config?.templateId?.trim() || ''}|${label}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          key,
          nodeId: node.id,
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

function stepIdentity(step: InvoiceBlueprintAction): string {
  const template = step.config?.templateId?.trim() || ''
  const message = step.config?.message?.trim() || ''
  return `${step.actionId}|${template}|${step.label}|${message}`
}

/** Every distinct Then-do on one saved blueprint, in graph order. */
export function listBlueprintActionSteps(blueprint: SavedBlueprint): InvoiceBlueprintAction[] {
  const steps = collectInvoiceBlueprintActions([blueprint], { perNode: true })
  const seen = new Set<string>()
  return steps.filter((step) => {
    const id = stepIdentity(step)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

export type InvoiceActionBlueprintCard = {
  key: string
  blueprintId: string
  blueprintName: string
  steps: InvoiceBlueprintAction[]
}

/**
 * One card per blueprint name. A second saved copy of the same name stays hidden.
 * Newest copy wins.
 */
export function listInvoiceActionBlueprints(
  blueprints: SavedBlueprint[] = listSavedBlueprints()
): InvoiceActionBlueprintCard[] {
  const byName = new Map<string, InvoiceActionBlueprintCard>()
  const ordered = [...blueprints].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  for (const bp of ordered) {
    const steps = listBlueprintActionSteps(bp)
    if (steps.length === 0) continue
    const nameKey = bp.name.trim().toLowerCase()
    if (byName.has(nameKey)) continue
    byName.set(nameKey, {
      key: bp.id,
      blueprintId: bp.id,
      blueprintName: bp.name,
      steps,
    })
  }
  return [...byName.values()]
}

export function listInvoiceBlueprintActions(): InvoiceBlueprintAction[] {
  return collectInvoiceBlueprintActions(listSavedBlueprints())
}
