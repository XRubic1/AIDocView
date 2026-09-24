/**
 * Broker subject live runner — enroll on broker.created (and later broker events).
 * Then-do → broker notes + admin alerts. Does not send chase emails.
 */
import type { Edge } from '@xyflow/react'
import { isBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { getBrokerById } from '../../data/mockBrokers'
import type { Broker } from '../../types/broker'
import type { BlueprintFlowNode, BlueprintNodeData } from '../../types/blueprintGraph'
import { findBestMatchingBrokerBlueprint } from './blueprintAutoMatch'
import {
  formatCatalogCardLine,
  lookupWaitUntilById,
} from './blueprintCatalog'
import {
  assignBrokerBlueprint,
  getBrokerBlueprintAssignment,
} from './brokerBlueprintAssignment'
import {
  getPrimaryRunForBroker,
  startBrokerRun,
  upsertBlueprintRun,
  type BlueprintRunRow,
} from './blueprintRuns'
import { getSavedBlueprint } from './blueprintStore'
import { getActionIds } from './blueprintSubject'
import { executeBlueprintBrokerThenDo } from './blueprintRunnerActions'
import { resolveBlueprintWaitUntil } from './blueprintWaitUntil'
import { whenNodePasses } from './blueprintWhenMatch'
import { onCredyxEvent } from '../../services/credyxEvents'
import { notifyTenantDataUpdated } from '../../services/supabase/tenantDataLiveSync'

export type BrokerRunnerLog = {
  brokerId: string
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

function evaluateWhenRaw(checkId: string | undefined, _broker: Broker, meta?: {
  justCreated?: boolean
}): boolean {
  if (!checkId) return false
  switch (checkId) {
    case 'broker_created':
      return Boolean(meta?.justCreated)
    case 'broker_replied':
    case 'no_reply':
    case 'broker_cancelled':
    case 'payment_posted':
      return false
    default:
      return false
  }
}

function evaluateWhenNode(
  data: BlueprintNodeData,
  broker: Broker,
  meta?: { justCreated?: boolean }
): boolean {
  return whenNodePasses(data, evaluateWhenRaw(data.checkId, broker, meta))
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
  broker: Broker,
  meta?: { justCreated?: boolean }
): BlueprintFlowNode | null {
  if (isWhen(from.data)) {
    const matched = evaluateWhenNode(from.data, broker, meta)
    return nextAfterWhen(from.id, nodes, edges, matched)
  }
  const targets = nextNodes(from.id, nodes, edges)
  if (targets.length === 0) return null
  const whenTargets = targets.filter((t) => isWhen(t.data))
  const otherTargets = targets.filter((t) => !isWhen(t.data))
  if (whenTargets.length > 0) {
    const matched = whenTargets.find((t) =>
      evaluateWhenNode(t.data, broker, meta)
    )
    if (matched) return matched
    if (whenTargets[0]) return whenTargets[0]
    return otherTargets[0] ?? null
  }
  return otherTargets[0] ?? targets[0] ?? null
}

function loadAssignedGraph(brokerId: string) {
  const assignment = getBrokerBlueprintAssignment(brokerId)
  if (!assignment) return null
  const bp = getSavedBlueprint(assignment.blueprintId)
  if (!bp) return null
  return { assignment, bp }
}

function ensureBrokerEnrollment(
  broker: Broker,
  reason: string
): { run: BlueprintRunRow; created: boolean } | null {
  const loaded = loadAssignedGraph(broker.id)
  if (!loaded) return null
  const { assignment, bp } = loaded
  const existing = getPrimaryRunForBroker(broker)
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
  const run = startBrokerRun({
    brokerId: broker.id,
    brokerName: broker.name,
    blueprintId: assignment.blueprintId,
    blueprintName: assignment.blueprintName,
    currentNodeId: start?.id,
    currentStep: start?.data.label || 'Start with',
    status: 'active',
    waitUntil: null,
  })
  return { run, created: true }
}

export function advanceBrokerRun(
  brokerId: string,
  options?: { forceWake?: boolean; authorName?: string; justCreated?: boolean }
): BrokerRunnerLog {
  if (!isBlueprintsRunnerEnabled()) {
    return { brokerId, ok: false, detail: 'Blueprint runner is off.' }
  }
  const broker = getBrokerById(brokerId)
  if (!broker) return { brokerId, ok: false, detail: 'Broker not found.' }

  const loaded = loadAssignedGraph(brokerId)
  if (!loaded) return { brokerId, ok: false, detail: 'No blueprint assigned.' }
  const { assignment, bp } = loaded
  let run = getPrimaryRunForBroker(broker)
  if (!run || run.status === 'completed' || run.status === 'stopped') {
    return { brokerId, ok: false, detail: 'No live enrollment to advance.' }
  }
  if (run.status === 'paused') {
    return { brokerId, ok: false, detail: 'Run is paused.' }
  }
  if (run.status === 'waiting' && run.waitUntil && !options?.forceWake) {
    if (new Date(run.waitUntil).getTime() > Date.now()) {
      return {
        brokerId,
        ok: true,
        detail: `Still waiting until ${run.waitUntil}.`,
      }
    }
  }

  const byId = new Map(bp.nodes.map((n) => [n.id, n]))
  let current =
    (run.currentNodeId ? byId.get(run.currentNodeId) : null) ??
    getStartNode(bp.nodes)
  if (!current) return { brokerId, ok: false, detail: 'Blueprint has no nodes.' }

  const meta = { justCreated: Boolean(options?.justCreated) }
  const details: string[] = []
  let guard = 0

  if (
    current.data.kind === 'wait' &&
    (options?.forceWake ||
      !run.waitUntil ||
      new Date(run.waitUntil).getTime() <= Date.now())
  ) {
    const next = pickNext(current, bp.nodes, bp.edges, broker, meta)
    if (!next) {
      run = upsertBlueprintRun({
        ...run,
        status: 'stopped',
        currentStep: 'Stopped · no next step after Wait',
        waitUntil: null,
      })
      return { brokerId, ok: true, detail: 'Wait ended with no next card.' }
    }
    current = next
  }

  while (current && guard < 40) {
    guard += 1

    if (current.data.kind === 'wait') {
      const resolved = resolveBlueprintWaitUntil(
        { kind: 'broker', broker },
        current
      )
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
      const ok = evaluateWhenNode(current.data, broker, meta)
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
        const result = executeBlueprintBrokerThenDo({
          brokerId,
          actionId,
          blueprintName: assignment.blueprintName,
          config: current.data.actionConfigs?.[actionId],
          authorName: options?.authorName,
        })
        details.push(result.detail)
      }
      if (ids.length === 0) details.push('Then do card has no tasks — skipped.')
      const next = pickNext(current, bp.nodes, bp.edges, broker, meta)
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

    const next = pickNext(current, bp.nodes, bp.edges, broker, meta)
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
    notifyTenantDataUpdated(['brokers'])
  } catch {
    /* ignore */
  }

  return { brokerId, ok: true, detail: details.join(' ') || 'Advanced.' }
}

export function enrollBrokerForEvent(
  broker: Broker,
  event: 'broker_created',
  reason: string
): BrokerRunnerLog {
  if (!isBlueprintsRunnerEnabled()) {
    return { brokerId: broker.id, ok: false, detail: 'Blueprint runner is off.' }
  }
  const best = findBestMatchingBrokerBlueprint(event)
  if (!best) {
    return {
      brokerId: broker.id,
      ok: false,
      detail: `No broker blueprint matches “${event}”.`,
    }
  }
  assignBrokerBlueprint(broker.id, best.blueprint.id, best.blueprint.name)
  const result = ensureBrokerEnrollment(broker, reason)
  if (!result) {
    return { brokerId: broker.id, ok: false, detail: 'Could not enroll.' }
  }
  if (!result.created) {
    return {
      brokerId: broker.id,
      ok: true,
      detail: `Already enrolled (${result.run.status}).`,
    }
  }
  return advanceBrokerRun(broker.id, {
    forceWake: true,
    justCreated: event === 'broker_created',
  })
}

const handledCreates = new Set<string>()

/** New broker added to Credyx catalog. */
export function onBrokerCreated(brokerId: string): void {
  try {
    if (!isBlueprintsRunnerEnabled()) return
    if (handledCreates.has(brokerId)) return
    handledCreates.add(brokerId)
    const broker = getBrokerById(brokerId)
    if (!broker) return
    enrollBrokerForEvent(broker, 'broker_created', 'broker created')
  } catch (err) {
    console.warn('[blueprints] onBrokerCreated', err)
  }
}

let listenerReady = false

/** Register bus listener once (safe to call repeatedly). */
export function ensureBrokerBlueprintListener(): void {
  if (listenerReady) return
  listenerReady = true
  onCredyxEvent((event) => {
    if (event.type === 'broker.created') {
      onBrokerCreated(event.id)
    }
  })
}

ensureBrokerBlueprintListener()
