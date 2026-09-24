/**
 * Batch subject live runner — enroll on batch.processed.
 * Then-do → admin alerts. Carrier process email stays on Settings.
 */
import type { Edge } from '@xyflow/react'
import { isBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { getBatchById, type Batch } from '../../data/mockBatches'
import type { BlueprintFlowNode, BlueprintNodeData } from '../../types/blueprintGraph'
import { findBestMatchingBatchBlueprint } from './blueprintAutoMatch'
import {
  formatCatalogCardLine,
  lookupWaitUntilById,
} from './blueprintCatalog'
import {
  assignBatchBlueprint,
  getBatchBlueprintAssignment,
} from './batchBlueprintAssignment'
import {
  getPrimaryRunForBatch,
  startBatchRun,
  upsertBlueprintRun,
  type BlueprintRunRow,
} from './blueprintRuns'
import { getSavedBlueprint } from './blueprintStore'
import { getActionIds } from './blueprintSubject'
import { executeBlueprintBatchThenDo } from './blueprintRunnerActions'
import { resolveBlueprintWaitUntil } from './blueprintWaitUntil'
import { whenNodePasses } from './blueprintWhenMatch'
import { onCredyxEvent } from '../../services/credyxEvents'
import { notifyTenantDataUpdated } from '../../services/supabase/tenantDataLiveSync'

export type BatchRunnerLog = {
  batchId: string
  ok: boolean
  detail: string
}

function isWhen(data: BlueprintNodeData): boolean {
  return data.kind === 'if' || data.kind === 'elseif'
}

function waitStepLine(node: BlueprintFlowNode): string {
  const wait = lookupWaitUntilById(node.data.waitUntilId)
  const line = wait
    ? formatCatalogCardLine(wait, node.data.days)
    : node.data.fieldKey?.trim() || 'Wait until…'
  return `Wait until · ${line}`
}

function getStartNode(nodes: BlueprintFlowNode[]): BlueprintFlowNode | null {
  return nodes.find((n) => n.data.kind === 'trigger') ?? null
}

function evaluateWhenRaw(
  checkId: string | undefined,
  _batch: Batch,
  meta?: { justProcessed?: boolean }
): boolean {
  if (!checkId) return false
  switch (checkId) {
    case 'batch_processed':
      return Boolean(meta?.justProcessed) || _batch.status === 'submitted'
    default:
      return false
  }
}

function evaluateWhenNode(
  data: BlueprintNodeData,
  batch: Batch,
  meta?: { justProcessed?: boolean }
): boolean {
  return whenNodePasses(data, evaluateWhenRaw(data.checkId, batch, meta))
}

function nextNodes(
  fromId: string,
  nodes: BlueprintFlowNode[],
  edges: Edge[]
): BlueprintFlowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return edges
    .filter((e) => e.source === fromId)
    .map((e) => byId.get(e.target))
    .filter((n): n is BlueprintFlowNode => !!n)
}

function nextAfterWhen(
  fromId: string,
  nodes: BlueprintFlowNode[],
  edges: Edge[],
  matched: boolean
): BlueprintFlowNode | null {
  const outs = nextNodes(fromId, nodes, edges)
  if (!matched) return null
  return outs[0] ?? null
}

function pickNext(
  from: BlueprintFlowNode,
  nodes: BlueprintFlowNode[],
  edges: Edge[],
  batch: Batch,
  meta?: { justProcessed?: boolean }
): BlueprintFlowNode | null {
  if (isWhen(from.data)) {
    const matched = evaluateWhenNode(from.data, batch, meta)
    return nextAfterWhen(from.id, nodes, edges, matched)
  }
  const targets = nextNodes(from.id, nodes, edges)
  if (targets.length === 0) return null
  const whenTargets = targets.filter((t) => isWhen(t.data))
  const otherTargets = targets.filter((t) => !isWhen(t.data))
  if (whenTargets.length > 0) {
    const matched = whenTargets.find((t) =>
      evaluateWhenNode(t.data, batch, meta)
    )
    if (matched) return matched
    if (whenTargets[0]) return whenTargets[0]
    return otherTargets[0] ?? null
  }
  return otherTargets[0] ?? targets[0] ?? null
}

function loadAssignedGraph(batchId: string) {
  const assignment = getBatchBlueprintAssignment(batchId)
  if (!assignment) return null
  const bp = getSavedBlueprint(assignment.blueprintId)
  if (!bp) return null
  return { assignment, bp }
}

function ensureBatchEnrollment(
  batch: Batch,
  reason: string
): { run: BlueprintRunRow; created: boolean } | null {
  const loaded = loadAssignedGraph(batch.id)
  if (!loaded) return null
  const { assignment, bp } = loaded
  const existing = getPrimaryRunForBatch(batch)
  if (
    existing &&
    (existing.status === 'waiting' ||
      existing.status === 'active' ||
      existing.status === 'paused')
  ) {
    if (existing.blueprintId !== assignment.blueprintId) {
      upsertBlueprintRun({
        ...existing,
        status: 'stopped',
        currentStep: `Stopped · switching to ${assignment.blueprintName}`,
        waitUntil: null,
      })
    } else {
      return { run: existing, created: false }
    }
  }

  const start = getStartNode(bp.nodes)
  void reason
  const run = startBatchRun({
    batchId: batch.id,
    batchNumber: batch.batch_number,
    clientLabel: batch.client_name,
    blueprintId: assignment.blueprintId,
    blueprintName: assignment.blueprintName,
    currentNodeId: start?.id,
    currentStep: start?.data.label || 'Start with',
    status: 'active',
    waitUntil: null,
  })
  return { run, created: true }
}

export async function advanceBatchRun(
  batchId: string,
  options?: {
    forceWake?: boolean
    authorName?: string
    justProcessed?: boolean
  }
): Promise<BatchRunnerLog> {
  if (!isBlueprintsRunnerEnabled()) {
    return { batchId, ok: false, detail: 'Blueprint runner is off.' }
  }
  const batch = getBatchById(batchId)
  if (!batch) return { batchId, ok: false, detail: 'Batch not found.' }

  const loaded = loadAssignedGraph(batchId)
  if (!loaded) return { batchId, ok: false, detail: 'No blueprint assigned.' }
  const { assignment, bp } = loaded
  let run = getPrimaryRunForBatch(batch)
  if (!run || run.status === 'completed' || run.status === 'stopped') {
    return { batchId, ok: false, detail: 'No live enrollment to advance.' }
  }
  if (run.status === 'paused') {
    return { batchId, ok: false, detail: 'Run is paused.' }
  }
  if (run.status === 'waiting' && run.waitUntil && !options?.forceWake) {
    if (new Date(run.waitUntil).getTime() > Date.now()) {
      return {
        batchId,
        ok: true,
        detail: `Still waiting until ${run.waitUntil}.`,
      }
    }
  }

  const byId = new Map(bp.nodes.map((n) => [n.id, n]))
  let current =
    (run.currentNodeId ? byId.get(run.currentNodeId) : null) ??
    getStartNode(bp.nodes)
  if (!current) return { batchId, ok: false, detail: 'Blueprint has no nodes.' }

  const meta = { justProcessed: Boolean(options?.justProcessed) }
  const details: string[] = []
  let guard = 0

  if (
    current.data.kind === 'wait' &&
    (options?.forceWake ||
      !run.waitUntil ||
      new Date(run.waitUntil).getTime() <= Date.now())
  ) {
    const next = pickNext(current, bp.nodes, bp.edges, batch, meta)
    if (!next) {
      run = upsertBlueprintRun({
        ...run,
        status: 'stopped',
        currentStep: 'Stopped · no next step after Wait',
        waitUntil: null,
      })
      return { batchId, ok: true, detail: 'Wait ended with no next card.' }
    }
    current = next
  }

  while (current && guard < 40) {
    guard += 1

    if (current.data.kind === 'wait') {
      const resolved = resolveBlueprintWaitUntil({ kind: 'batch' }, current)
      run = upsertBlueprintRun({
        ...run,
        status: 'waiting',
        currentNodeId: current.id,
        currentStep: waitStepLine(current),
        waitUntil: resolved.waitUntil,
        blueprintId: assignment.blueprintId,
        blueprintName: assignment.blueprintName,
      })
      details.push(`Waiting: ${resolved.detail}`)
      break
    }

    if (isWhen(current.data)) {
      const ok = evaluateWhenNode(current.data, batch, meta)
      const next = nextAfterWhen(current.id, bp.nodes, bp.edges, ok)
      if (!ok) {
        run = upsertBlueprintRun({
          ...run,
          status: 'waiting',
          currentNodeId: current.id,
          currentStep: `Waiting · ${current.data.label || current.data.checkId || 'When'}`,
          waitUntil: null,
          blueprintId: assignment.blueprintId,
          blueprintName: assignment.blueprintName,
        })
        details.push('Parked at When until it matches.')
        break
      }
      if (!next) {
        run = upsertBlueprintRun({
          ...run,
          status: 'completed',
          currentStep: 'Done',
          waitUntil: null,
        })
        details.push('When matched — Done.')
        break
      }
      details.push(`When matched → ${next.data.label || next.data.kind}`)
      current = next
      continue
    }

    if (current.data.kind === 'action') {
      const ids = getActionIds(current.data)
      run = upsertBlueprintRun({
        ...run,
        status: 'active',
        currentNodeId: current.id,
        currentStep: `Then do · ${current.data.label || 'tasks'}`,
        waitUntil: null,
      })
      for (const actionId of ids) {
        const result = await executeBlueprintBatchThenDo({
          batchId,
          batchNumber: batch.batch_number,
          clientId: batch.client_id,
          clientName: batch.client_name,
          actionId,
          blueprintName: assignment.blueprintName,
          config: current.data.actionConfigs?.[actionId],
          authorName: options?.authorName,
        })
        details.push(result.detail)
      }
      if (ids.length === 0) details.push('Then do card has no tasks — skipped.')
      const next = pickNext(current, bp.nodes, bp.edges, batch, meta)
      if (!next) {
        run = upsertBlueprintRun({
          ...run,
          status: 'completed',
          currentStep: 'Done · after Then do',
          waitUntil: null,
        })
        details.push('Done.')
        break
      }
      current = next
      continue
    }

    if (current.data.kind === 'stop') {
      run = upsertBlueprintRun({
        ...run,
        status: 'completed',
        currentNodeId: current.id,
        currentStep: 'Done',
        waitUntil: null,
      })
      details.push('Done.')
      break
    }

    const next = pickNext(current, bp.nodes, bp.edges, batch, meta)
    if (!next) {
      run = upsertBlueprintRun({
        ...run,
        status: 'completed',
        currentStep: 'Done',
        waitUntil: null,
      })
      details.push('Done.')
      break
    }
    current = next
  }

  try {
    notifyTenantDataUpdated(['batches'], batch.client_id)
  } catch {
    /* ignore */
  }

  return { batchId, ok: true, detail: details.join(' ') || 'Advanced.' }
}

export async function enrollBatchForEvent(
  batch: Batch,
  event: 'batch_processed',
  reason: string
): Promise<BatchRunnerLog> {
  if (!isBlueprintsRunnerEnabled()) {
    return { batchId: batch.id, ok: false, detail: 'Blueprint runner is off.' }
  }
  const best = findBestMatchingBatchBlueprint(event)
  if (!best) {
    return {
      batchId: batch.id,
      ok: false,
      detail: `No batch blueprint matches “${event}”.`,
    }
  }
  assignBatchBlueprint(batch.id, best.blueprint.id, best.blueprint.name)
  const result = ensureBatchEnrollment(batch, reason)
  if (!result) {
    return { batchId: batch.id, ok: false, detail: 'Could not enroll.' }
  }
  if (!result.created) {
    return {
      batchId: batch.id,
      ok: true,
      detail: `Already enrolled (${result.run.status}).`,
    }
  }
  return advanceBatchRun(batch.id, {
    forceWake: true,
    justProcessed: event === 'batch_processed',
  })
}

const handledProcessed = new Set<string>()

/** Batch Process completed (submitted). */
export async function onBatchProcessed(batchId: string): Promise<void> {
  try {
    if (!isBlueprintsRunnerEnabled()) return
    if (handledProcessed.has(batchId)) return
    handledProcessed.add(batchId)
    const batch = getBatchById(batchId)
    if (!batch) return
    await enrollBatchForEvent(batch, 'batch_processed', 'batch processed')
  } catch (err) {
    console.warn('[blueprints] onBatchProcessed', err)
  }
}

let listenerReady = false

/** Register bus listener once (safe to call repeatedly). */
export function ensureBatchBlueprintListener(): void {
  if (listenerReady) return
  listenerReady = true
  onCredyxEvent((event) => {
    if (event.type === 'batch.processed') {
      void onBatchProcessed(event.id)
    }
  })
}

ensureBatchBlueprintListener()
