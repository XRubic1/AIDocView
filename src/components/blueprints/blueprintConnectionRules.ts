/**
 * Which blueprint cards may connect — kind topology + brokers/invoices subject match.
 * Pure helpers for canvas, context menu, and authoring warnings.
 */

import type { Edge } from '@xyflow/react'
import {
  BLUEPRINT_NODE_KIND_LABELS,
  type BlueprintFlowNode,
  type BlueprintNodeData,
  type BlueprintNodeKind,
} from '../../types/blueprintGraph'
import {
  BROKER_ACTION_OPTIONS,
  BROKER_EVENT_OPTIONS,
  BROKER_WAIT_UNTIL_OPTIONS,
  BATCH_ACTION_OPTIONS,
  BATCH_EVENT_OPTIONS,
  BATCH_WAIT_UNTIL_OPTIONS,
  INVOICE_ACTION_OPTIONS,
  INVOICE_EVENT_OPTIONS,
  INVOICE_WAIT_UNTIL_OPTIONS,
  type BlueprintSubject,
} from './blueprintCatalog'
import { getActionIds, resolveSubjectForNode, subjectLabel } from './blueprintSubject'

export type ConnectResult = { ok: true } | { ok: false; reason: string }

const ALLOWED_TARGETS: Record<BlueprintNodeKind, ReadonlySet<BlueprintNodeKind>> = {
  trigger: new Set(['wait', 'if', 'elseif', 'action', 'stop']),
  wait: new Set(['wait', 'if', 'elseif', 'action', 'stop']),
  if: new Set(['wait', 'if', 'elseif', 'action', 'stop', 'branch_true', 'branch_false']),
  elseif: new Set(['wait', 'if', 'elseif', 'action', 'stop', 'branch_true', 'branch_false']),
  branch_true: new Set(['wait', 'if', 'elseif', 'action', 'stop']),
  branch_false: new Set(['wait', 'if', 'elseif', 'action', 'stop']),
  action: new Set(['wait', 'if', 'elseif', 'action', 'stop']),
  stop: new Set(),
}

function kindLabel(kind: BlueprintNodeKind): string {
  return BLUEPRINT_NODE_KIND_LABELS[kind]
}

function idsIn(
  list: { id: string }[],
  id: string | undefined
): boolean {
  return !!id && list.some((o) => o.id === id)
}

/** Subject implied by catalog ids on the card (null if empty or shared across both). */
export function inferSubjectFromCardData(
  data: BlueprintNodeData
): BlueprintSubject | null {
  if (data.kind === 'trigger') {
    if (
      data.triggerSubject === 'brokers' ||
      data.triggerSubject === 'invoices' ||
      data.triggerSubject === 'batches'
    ) {
      return data.triggerSubject
    }
    return null
  }

  const votes = new Set<BlueprintSubject>()

  if (data.kind === 'wait' && data.waitUntilId) {
    const inBroker = idsIn(BROKER_WAIT_UNTIL_OPTIONS, data.waitUntilId)
    const inInvoice = idsIn(INVOICE_WAIT_UNTIL_OPTIONS, data.waitUntilId)
    const inBatch = idsIn(BATCH_WAIT_UNTIL_OPTIONS, data.waitUntilId)
    if (inBroker && !inInvoice && !inBatch) votes.add('brokers')
    if (inInvoice && !inBroker && !inBatch) votes.add('invoices')
    if (inBatch && !inBroker && !inInvoice) votes.add('batches')
  }

  if ((data.kind === 'if' || data.kind === 'elseif') && data.checkId) {
    const inBroker = idsIn(BROKER_EVENT_OPTIONS, data.checkId)
    const inInvoice = idsIn(INVOICE_EVENT_OPTIONS, data.checkId)
    const inBatch = idsIn(BATCH_EVENT_OPTIONS, data.checkId)
    if (inBroker && !inInvoice && !inBatch) votes.add('brokers')
    if (inInvoice && !inBroker && !inBatch) votes.add('invoices')
    if (inBatch && !inBroker && !inInvoice) votes.add('batches')
  }

  if (data.kind === 'action') {
    for (const actionId of getActionIds(data)) {
      const inBroker = idsIn(BROKER_ACTION_OPTIONS, actionId)
      const inInvoice = idsIn(INVOICE_ACTION_OPTIONS, actionId)
      const inBatch = idsIn(BATCH_ACTION_OPTIONS, actionId)
      if (inBroker && !inInvoice && !inBatch) votes.add('brokers')
      if (inInvoice && !inBroker && !inBatch) votes.add('invoices')
      if (inBatch && !inBroker && !inInvoice) votes.add('batches')
    }
  }

  if (votes.size === 1) return [...votes][0]
  return null
}

export function resolveNodeSubject(
  node: BlueprintFlowNode,
  nodes: BlueprintFlowNode[],
  edges: Edge[]
): BlueprintSubject | null {
  return (
    resolveSubjectForNode(node.id, nodes, edges) ??
    inferSubjectFromCardData(node.data)
  )
}

export function canConnectKinds(
  sourceKind: BlueprintNodeKind,
  targetKind: BlueprintNodeKind
): ConnectResult {
  if (targetKind === 'trigger') {
    return {
      ok: false,
      reason: 'Start with can’t be connected after another card.',
    }
  }
  if (sourceKind === 'stop') {
    return {
      ok: false,
      reason: 'Done can’t connect to another step.',
    }
  }
  if (!ALLOWED_TARGETS[sourceKind].has(targetKind)) {
    if (targetKind === 'branch_true' || targetKind === 'branch_false') {
      return {
        ok: false,
        reason: 'True/False can only follow a When card.',
      }
    }
    return {
      ok: false,
      reason: `${kindLabel(sourceKind)} can’t connect to ${kindLabel(targetKind)}.`,
    }
  }
  return { ok: true }
}

/**
 * Right-click Add: when a tip is selected, return a disable reason for that kind.
 * No tip → all kinds allowed (free-standing place).
 */
export function reasonAddKindDisabled(
  tipKind: BlueprintNodeKind | null,
  addKind: BlueprintNodeKind
): string | null {
  if (!tipKind) return null
  const result = canConnectKinds(tipKind, addKind)
  return result.ok ? null : result.reason
}

function subjectMismatchReason(
  sourceSubject: BlueprintSubject,
  targetSubject: BlueprintSubject,
  targetKind: BlueprintNodeKind
): string {
  const card = kindLabel(targetKind)
  return `This ${card} is for ${subjectLabel(targetSubject)}; Start is ${subjectLabel(sourceSubject)}.`
}

export function canConnectNodes(
  source: BlueprintFlowNode,
  target: BlueprintFlowNode,
  nodes: BlueprintFlowNode[],
  edges: Edge[]
): ConnectResult {
  if (source.id === target.id) {
    return { ok: false, reason: 'A card can’t connect to itself.' }
  }

  const kindResult = canConnectKinds(source.data.kind, target.data.kind)
  if (!kindResult.ok) return kindResult

  const sourceSubject = resolveNodeSubject(source, nodes, edges)
  const targetSubject = resolveNodeSubject(target, nodes, edges)
  if (sourceSubject && targetSubject && sourceSubject !== targetSubject) {
    return {
      ok: false,
      reason: subjectMismatchReason(
        sourceSubject,
        targetSubject,
        target.data.kind
      ),
    }
  }

  return { ok: true }
}

/** Whether auto-linking a new card after the tip is allowed (place may still happen). */
export function canInsertAfterTip(
  tip: BlueprintFlowNode,
  newData: BlueprintNodeData,
  nodes: BlueprintFlowNode[],
  edges: Edge[]
): ConnectResult {
  const kindResult = canConnectKinds(tip.data.kind, newData.kind)
  if (!kindResult.ok) return kindResult

  const tipSubject = resolveNodeSubject(tip, nodes, edges)
  const newSubject = inferSubjectFromCardData(newData)
  if (tipSubject && newSubject && tipSubject !== newSubject) {
    return {
      ok: false,
      reason: subjectMismatchReason(tipSubject, newSubject, newData.kind),
    }
  }

  return { ok: true }
}
