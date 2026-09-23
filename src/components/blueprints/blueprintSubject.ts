import type { Edge } from '@xyflow/react'
import type { BlueprintFlowNode, BlueprintNodeData } from '../../types/blueprintGraph'
import type { BlueprintCatalogOption, BlueprintSubject } from './blueprintCatalog'
import { TRIGGER_SUBJECT_OPTIONS } from './blueprintCatalog'

/** Infer brokers vs invoices from the Start box this step connects back to. */
export function resolveSubjectForNode(
  nodeId: string,
  nodes: BlueprintFlowNode[],
  edges: Edge[]
): BlueprintSubject | null {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const visited = new Set<string>()
  const queue = [nodeId]

  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)

    const node = byId.get(id)
    if (!node) continue

    if (node.data.kind === 'trigger') {
      const subject = node.data.triggerSubject
      if (subject === 'brokers' || subject === 'invoices') return subject
      const label = (node.data.label || '').toLowerCase()
      if (label.includes('invoice')) return 'invoices'
      return 'brokers'
    }

    for (const e of edges) {
      if (e.target === id) queue.push(e.source)
    }
  }

  return null
}

export function subjectLabel(subject: BlueprintSubject | null): string {
  if (!subject) return 'nothing yet'
  return TRIGGER_SUBJECT_OPTIONS.find((o) => o.id === subject)?.label ?? subject
}

export function patchFromCatalogOption(
  field: 'waitUntilId' | 'checkId',
  optionId: string,
  opt: BlueprintCatalogOption,
  days?: string
): Partial<BlueprintNodeData> {
  const nextDays = opt.needsDays ? (days ?? opt.defaultDays ?? '') : ''
  const d = nextDays.trim() || '…'
  const line = opt.cardTemplate.replace(/\{days\}/g, d)
  if (field === 'waitUntilId') {
    return {
      waitUntilId: optionId,
      days: nextDays,
      label: opt.defaultTitle,
      fieldKey: line,
    }
  }
  return {
    checkId: optionId,
    fieldValue: nextDays,
    label: opt.defaultTitle,
    fieldKey: line,
  }
}

export function patchFromAction(action: {
  id: string
  defaultTitle: string
  cardLine: string
}): Partial<BlueprintNodeData> {
  return {
    actionId: action.id,
    actionIds: [action.id],
    status: action.cardLine,
  }
}

/** Normalize Then-do task ids (supports legacy single actionId). */
export function getActionIds(data: BlueprintNodeData): string[] {
  if (Array.isArray(data.actionIds) && data.actionIds.length > 0) {
    return data.actionIds.filter(Boolean)
  }
  if (data.actionId) return [data.actionId]
  return []
}

/** Update tasks only — never renames the card title. */
export function patchFromActionIds(
  ids: string[],
  resolve: (id: string) => { id: string; defaultTitle: string; cardLine: string } | null
): Partial<BlueprintNodeData> {
  const unique = [...new Set(ids.filter(Boolean))]
  const actions = unique
    .map((id) => resolve(id))
    .filter((a): a is { id: string; defaultTitle: string; cardLine: string } => !!a)
  if (actions.length === 0) {
    return {
      actionId: '',
      actionIds: [],
      status: 'Add tasks on the right',
    }
  }
  return {
    actionId: actions[0].id,
    actionIds: actions.map((a) => a.id),
    status: actions.map((a) => a.cardLine).join(' · '),
  }
}
