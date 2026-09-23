/**
 * Preview remaining blueprint steps after the current enrollment node (UI only).
 */
import type { Edge } from '@xyflow/react'
import type { BlueprintFlowNode, BlueprintNodeData } from '../../types/blueprintGraph'
import {
  formatCatalogCardLine,
  lookupActionById,
  lookupEventById,
  lookupWaitUntilById,
} from './blueprintCatalog'
import { getActionIds } from './blueprintSubject'
import { getSavedBlueprint } from './blueprintStore'
import { formatTriggerCardLine } from './blueprintTriggerFilters'

export type UpcomingStepKind = 'wait' | 'when' | 'action' | 'done' | 'start' | 'other'

export type UpcomingBlueprintStep = {
  nodeId: string
  kind: UpcomingStepKind
  title: string
  detail: string
  /** Branch paths after a When — listed as sibling options. */
  branchHint?: string
}

function isWhen(data: BlueprintNodeData): boolean {
  return data.kind === 'if' || data.kind === 'elseif'
}

function kindOf(data: BlueprintNodeData): UpcomingStepKind {
  if (data.kind === 'trigger') return 'start'
  if (data.kind === 'wait') return 'wait'
  if (isWhen(data)) return 'when'
  if (data.kind === 'branch_true' || data.kind === 'branch_false') return 'when'
  if (data.kind === 'action') return 'action'
  if (data.kind === 'stop') return 'done'
  return 'other'
}

function describe(data: BlueprintNodeData): { title: string; detail: string } {
  const title = data.label?.trim() || '(untitled)'
  if (data.kind === 'trigger') {
    return { title, detail: formatTriggerCardLine(data) }
  }
  if (data.kind === 'wait') {
    const wait = lookupWaitUntilById(data.waitUntilId)
    const line = wait
      ? formatCatalogCardLine(wait, data.days)
      : data.fieldKey?.trim() || 'Wait not set'
    return { title, detail: line }
  }
  if (isWhen(data)) {
    const event = lookupEventById(data.checkId)
    const line = event
      ? formatCatalogCardLine(event, data.fieldValue)
      : data.fieldKey?.trim() || 'Event not set'
    return { title, detail: line }
  }
  if (data.kind === 'action') {
    const ids = getActionIds(data)
    if (ids.length === 0) {
      return { title, detail: data.status?.trim() || 'Then do (not set up)' }
    }
    const lines = ids.map((id) => {
      const a = lookupActionById(id)
      return a?.cardLine ?? a?.defaultTitle ?? id
    })
    return {
      title: ids.length === 1 ? (lookupActionById(ids[0])?.defaultTitle ?? title) : title,
      detail: lines.join(' · '),
    }
  }
  if (data.kind === 'stop') {
    return { title: title === '(untitled)' ? 'Done' : title, detail: 'Enrollment ends' }
  }
  return { title, detail: '' }
}

/** Find the Wait (or other) node the run is sitting on. */
export function resolveCurrentNodeId(
  nodes: BlueprintFlowNode[],
  edges: Edge[],
  opts: { currentNodeId?: string | null; currentStep?: string | null }
): string | null {
  if (opts.currentNodeId && nodes.some((n) => n.id === opts.currentNodeId)) {
    return opts.currentNodeId
  }
  const step = (opts.currentStep ?? '').trim().toLowerCase()
  if (step) {
    const byField = nodes.find((n) => {
      if (n.data.kind !== 'wait') return false
      const wait = lookupWaitUntilById(n.data.waitUntilId)
      const line = wait
        ? formatCatalogCardLine(wait, n.data.days)
        : n.data.fieldKey ?? ''
      return (
        line.toLowerCase().includes(step.replace(/^wait until\s*[·•]\s*/i, '')) ||
        step.includes(line.toLowerCase()) ||
        (n.data.fieldKey && step.includes(n.data.fieldKey.toLowerCase()))
      )
    })
    if (byField) return byField.id
    const anyWait = nodes.find((n) => n.data.kind === 'wait')
    if (anyWait && /wait/i.test(step)) return anyWait.id
  }
  // Fallback: first wait after Start
  const start = nodes.find((n) => n.data.kind === 'trigger')
  if (start) {
    const out = edges.filter((e) => e.source === start.id)
    for (const e of out) {
      const n = nodes.find((x) => x.id === e.target)
      if (n?.data.kind === 'wait') return n.id
    }
  }
  return nodes.find((n) => n.data.kind === 'wait')?.id ?? null
}

/**
 * Steps that run after the current node wakes / advances.
 * Walks outgoing paths; When branches are labeled as options.
 */
export function listUpcomingStepsAfter(
  nodes: BlueprintFlowNode[],
  edges: Edge[],
  fromNodeId: string
): UpcomingBlueprintStep[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const steps: UpcomingBlueprintStep[] = []
  const visited = new Set<string>()

  function walk(nodeId: string, branchHint?: string) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    const node = byId.get(nodeId)
    if (!node) return

    const { title, detail } = describe(node.data)
    steps.push({
      nodeId,
      kind: kindOf(node.data),
      title,
      detail,
      branchHint,
    })

    if (node.data.kind === 'stop') return

    const outs = edges.filter((e) => e.source === nodeId)
    for (const e of outs) {
      const t = byId.get(e.target)
      if (!t) continue
      let hint = branchHint
      if (t.data.kind === 'branch_true') hint = 'True path'
      else if (t.data.kind === 'branch_false') hint = 'False path'
      else if (isWhen(t.data)) {
        hint = `If: ${lookupEventById(t.data.checkId)?.label ?? t.data.label ?? 'event'}`
      }
      walk(t.id, hint)
    }
  }

  const starters = edges
    .filter((e) => e.source === fromNodeId)
    .map((e) => ({ e, n: byId.get(e.target) }))
    .filter((x): x is { e: Edge; n: BlueprintFlowNode } => !!x.n)

  for (const { n: t } of starters) {
    let hint: string | undefined
    if (t.data.kind === 'branch_true') hint = 'True path'
    else if (t.data.kind === 'branch_false') hint = 'False path'
    else if (isWhen(t.data)) {
      hint = `If: ${lookupEventById(t.data.checkId)?.label ?? t.data.label ?? 'event'}`
    }
    walk(t.id, hint)
  }

  return steps
}

/** Load assigned blueprint and list steps after the current wait (or start). */
export function getUpcomingStepsForInvoiceRun(opts: {
  blueprintId: string | null | undefined
  currentNodeId?: string | null
  currentStep?: string | null
}): UpcomingBlueprintStep[] {
  if (!opts.blueprintId) return []
  const bp = getSavedBlueprint(opts.blueprintId)
  if (!bp) return []
  const fromId = resolveCurrentNodeId(bp.nodes, bp.edges, opts)
  if (!fromId) {
    // Show full path from Start if we can't pin a wait
    const start = bp.nodes.find((n) => n.data.kind === 'trigger')
    if (!start) return []
    return listUpcomingStepsAfter(bp.nodes, bp.edges, start.id)
  }
  return listUpcomingStepsAfter(bp.nodes, bp.edges, fromId)
}

/** First Wait node id in a blueprint (for demo enrollment). */
export function findFirstWaitNodeId(
  nodes: BlueprintFlowNode[],
  edges: Edge[]
): string | null {
  return resolveCurrentNodeId(nodes, edges, {})
}
