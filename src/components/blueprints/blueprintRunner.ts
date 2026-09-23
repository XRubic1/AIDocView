/**
 * Parallel invoice blueprint runner.
 * Phase 2: auto-match on hold / PPW / purchase when no assignment.
 * Then-do → notes/status only. Does not call email-lifecycle chase.
 */
import type { Edge } from '@xyflow/react'
import { isBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { getInvoiceById } from '../../data/mockInvoices'
import type { Invoice } from '../../types/invoice'
import type { BlueprintFlowNode, BlueprintNodeData } from '../../types/blueprintGraph'
import { findBestMatchingBlueprint, scoreBlueprintForEvent, type BlueprintMatchEvent } from './blueprintAutoMatch'
import { blueprintPriority } from '../../types/blueprintGraph'
import {
  formatCatalogCardLine,
  lookupWaitUntilById,
} from './blueprintCatalog'
import {
  assignInvoiceBlueprint,
  getInvoiceBlueprintAssignment,
} from './invoiceBlueprintAssignment'
import {
  getPrimaryRunForInvoice,
  listBlueprintRuns,
  startInvoiceRun,
  upsertBlueprintRun,
  type BlueprintRunRow,
} from './blueprintRuns'
import { getSavedBlueprint } from './blueprintStore'
import { getActionIds } from './blueprintSubject'
import {
  normalizeTriggerFilters,
  type BlueprintTriggerFilters,
} from './blueprintTriggerFilters'
import { findFirstWaitNodeId } from './blueprintUpcomingSteps'
import { executeBlueprintThenDo } from './blueprintRunnerActions'
import { notifyTenantDataUpdated } from '../../services/supabase/tenantDataLiveSync'
import {
  normalizeWhenMatch,
  whenNodePasses,
} from './blueprintWhenMatch'

export type BlueprintRunnerLog = {
  invoiceId: string
  ok: boolean
  detail: string
}

function isWhen(data: BlueprintNodeData): boolean {
  return data.kind === 'if' || data.kind === 'elseif'
}

function isBranchTrue(data: BlueprintNodeData): boolean {
  return data.kind === 'branch_true'
}

function isBranchFalse(data: BlueprintNodeData): boolean {
  return data.kind === 'branch_false'
}

function isBranch(data: BlueprintNodeData): boolean {
  return isBranchTrue(data) || isBranchFalse(data)
}

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function parseWaitDays(node: BlueprintFlowNode): number {
  const n = Number(node.data.days)
  return Number.isFinite(n) && n >= 0 ? n : 3
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

/** Assigned blueprint Start includes On hold. */
export function assignedBlueprintMatchesHold(filters: BlueprintTriggerFilters): boolean {
  return filters.invoices.statuses.includes('hold')
}

/** Paperwork / PPW track: not a hold-only Start. */
export function assignedBlueprintMatchesPpw(filters: BlueprintTriggerFilters): boolean {
  const statuses = filters.invoices.statuses
  if (statuses.length === 0) return true
  const holdOnly = statuses.length === 1 && statuses[0] === 'hold'
  return !holdOnly
}

function evaluateWhenRaw(checkId: string | undefined, invoice: Invoice): boolean {
  if (!checkId) return false
  switch (checkId) {
    case 'on_hold':
      return invoice.status === 'hold'
    case 'broker_replied':
    case 'no_reply':
      // Phase 1: no live reply signal — treat as false so path doesn't invent mail.
      return false
    default:
      return (
        invoice.status === 'approved' ||
        invoice.status === 'pending' ||
        invoice.status === 'review' ||
        invoice.status === 'hold'
      )
  }
}

function evaluateWhenNode(data: BlueprintNodeData, invoice: Invoice): boolean {
  return whenNodePasses(data, evaluateWhenRaw(data.checkId, invoice))
}

function shouldParkWhenUntilTrue(data: BlueprintNodeData): boolean {
  // Match when · False (e.g. removed from hold) — sit here until the world changes
  return normalizeWhenMatch(data) === 'no'
}

function whenParkStepLine(data: BlueprintNodeData): string {
  const label = data.label?.trim() || data.checkId || 'When'
  return `Waiting · ${label}`
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

/** Next card after a When — single path when polarity switch is used; legacy True/False cards still work. */
function nextAfterWhen(
  fromId: string,
  nodes: BlueprintFlowNode[],
  edges: Edge[],
  matched: boolean
): BlueprintFlowNode | null {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const outs = edges
    .filter((e) => e.source === fromId)
    .map((e) => byId.get(e.target))
    .filter((n): n is BlueprintFlowNode => !!n)

  const trueCard = outs.find((n) => isBranchTrue(n.data))
  const falseCard = outs.find((n) => isBranchFalse(n.data))
  if (trueCard || falseCard) {
    if (matched && trueCard) return trueCard
    if (!matched && falseCard) return falseCard
    if (matched) return outs.find((n) => !isBranchFalse(n.data)) ?? outs[0] ?? null
    return falseCard ?? null
  }

  // Polarity switch on When: only continue when this card's match succeeded
  if (!matched) return null
  return outs[0] ?? null
}

function pickNext(
  from: BlueprintFlowNode,
  nodes: BlueprintFlowNode[],
  edges: Edge[],
  invoice: Invoice
): BlueprintFlowNode | null {
  if (isWhen(from.data)) {
    const matched = evaluateWhenNode(from.data, invoice)
    return nextAfterWhen(from.id, nodes, edges, matched)
  }

  if (isBranch(from.data)) {
    return nextNodes(from.id, nodes, edges)[0] ?? null
  }

  const targets = nextNodes(from.id, nodes, edges)
  if (targets.length === 0) return null

  const whenTargets = targets.filter((t) => isWhen(t.data))
  const otherTargets = targets.filter((t) => !isWhen(t.data))

  if (whenTargets.length > 0) {
    const matched = whenTargets.find((t) => evaluateWhenNode(t.data, invoice))
    if (matched) return matched
    if (otherTargets[0]) return otherTargets[0]
    return null
  }
  return otherTargets[0] ?? targets[0] ?? null
}

function loadAssignedGraph(invoiceId: string) {
  const assignment = getInvoiceBlueprintAssignment(invoiceId)
  if (!assignment) return null
  const bp = getSavedBlueprint(assignment.blueprintId)
  if (!bp) return null
  return { assignment, bp }
}

function ensureEnrollment(
  invoice: Invoice,
  reason: string
): { run: BlueprintRunRow; created: boolean } | null {
  const loaded = loadAssignedGraph(invoice.id)
  if (!loaded) return null
  const { assignment, bp } = loaded
  const existing = getPrimaryRunForInvoice(invoice)
  if (
    existing &&
    (existing.status === 'waiting' ||
      existing.status === 'active' ||
      existing.status === 'paused')
  ) {
    return { run: existing, created: false }
  }

  const start = getStartNode(bp.nodes)
  const waitId = findFirstWaitNodeId(bp.nodes, bp.edges)
  const waitNode = waitId ? bp.nodes.find((n) => n.id === waitId) : null

  if (waitNode) {
    const days = parseWaitDays(waitNode)
    const run = startInvoiceRun({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      clientLabel: invoice.client_name,
      blueprintId: assignment.blueprintId,
      blueprintName: assignment.blueprintName,
      waitDays: days,
      currentNodeId: waitNode.id,
      currentStep: waitStepLine(waitNode),
      status: 'waiting',
      waitUntil: daysFromNow(days),
    })
    return { run, created: true }
  }

  // No Wait — park on Start / first step as active and advance immediately
  const firstId = start?.id
  const run = startInvoiceRun({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    clientLabel: invoice.client_name,
    blueprintId: assignment.blueprintId,
    blueprintName: assignment.blueprintName,
    currentNodeId: firstId,
    currentStep: start?.data.label || 'Start with',
    status: 'active',
    waitUntil: null,
  })
  void reason
  return { run, created: true }
}

/**
 * Advance one enrollment until Wait / blocked When / Done / max steps.
 */
export function advanceInvoiceRun(
  invoiceId: string,
  options?: { forceWake?: boolean; authorName?: string }
): BlueprintRunnerLog {
  if (!isBlueprintsRunnerEnabled()) {
    return { invoiceId, ok: false, detail: 'Blueprint runner is off.' }
  }

  const invoice = getInvoiceById(invoiceId)
  if (!invoice) {
    return { invoiceId, ok: false, detail: 'Invoice not found.' }
  }

  const loaded = loadAssignedGraph(invoiceId)
  if (!loaded) {
    return { invoiceId, ok: false, detail: 'No blueprint assigned.' }
  }
  const { assignment, bp } = loaded
  let run = getPrimaryRunForInvoice(invoice)
  if (!run || run.status === 'completed' || run.status === 'stopped') {
    return { invoiceId, ok: false, detail: 'No live enrollment to advance.' }
  }

  if (run.status === 'paused') {
    return { invoiceId, ok: false, detail: 'Run is paused.' }
  }

  if (run.status === 'waiting' && run.waitUntil && !options?.forceWake) {
    if (new Date(run.waitUntil).getTime() > Date.now()) {
      return {
        invoiceId,
        ok: true,
        detail: `Still waiting until ${run.waitUntil}.`,
      }
    }
  }

  const byId = new Map(bp.nodes.map((n) => [n.id, n]))
  let current =
    (run.currentNodeId ? byId.get(run.currentNodeId) : null) ??
    bp.nodes.find((n) => n.data.kind === 'wait') ??
    getStartNode(bp.nodes)

  if (!current) {
    return { invoiceId, ok: false, detail: 'Blueprint has no nodes.' }
  }

  const details: string[] = []
  let guard = 0

  // If waking from Wait, move to the next card first
  if (current.data.kind === 'wait' && (options?.forceWake || !run.waitUntil || new Date(run.waitUntil).getTime() <= Date.now())) {
    const next = pickNext(current, bp.nodes, bp.edges, invoice)
    if (!next) {
      run = upsertBlueprintRun({
        ...run,
        status: 'stopped',
        currentStep: 'Stopped · no next step after Wait',
        waitUntil: null,
      })
      return { invoiceId, ok: true, detail: 'Wait ended with no next card.' }
    }
    current = next
  }

  while (current && guard < 40) {
    guard += 1

    if (current.data.kind === 'wait') {
      const days = parseWaitDays(current)
      run = upsertBlueprintRun({
        ...run,
        status: 'waiting',
        currentNodeId: current.id,
        currentStep: waitStepLine(current),
        waitUntil: daysFromNow(days),
        blueprintId: assignment.blueprintId,
        blueprintName: assignment.blueprintName,
      })
      details.push(`Waiting: ${waitStepLine(current)}`)
      break
    }

    if (isWhen(current.data)) {
      const ok = evaluateWhenNode(current.data, invoice)
      const next = nextAfterWhen(current.id, bp.nodes, bp.edges, ok)
      const polarity = normalizeWhenMatch(current.data)
      if (!ok) {
        if (shouldParkWhenUntilTrue(current.data)) {
          run = upsertBlueprintRun({
            ...run,
            status: 'waiting',
            currentNodeId: current.id,
            currentStep: whenParkStepLine(current.data),
            waitUntil: null,
            blueprintId: assignment.blueprintId,
            blueprintName: assignment.blueprintName,
          })
          details.push(
            `Parked at When until it matches (${polarity === 'no' ? 'e.g. hold cleared' : 'condition'}).`
          )
          break
        }
        run = upsertBlueprintRun({
          ...run,
          status: 'stopped',
          currentNodeId: current.id,
          currentStep: `Stopped · When did not match`,
          waitUntil: null,
        })
        details.push('When did not match — enrollment stopped.')
        break
      }
      if (!next) {
        run = upsertBlueprintRun({
          ...run,
          status: 'completed',
          currentNodeId: current.id,
          currentStep: 'Done',
          waitUntil: null,
        })
        details.push('When matched — no next card (Done).')
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
        const result = executeBlueprintThenDo({
          invoiceId,
          actionId,
          blueprintName: assignment.blueprintName,
          config: current.data.actionConfigs?.[actionId],
          authorName: options?.authorName,
        })
        details.push(result.detail)
      }
      if (ids.length === 0) {
        details.push('Then do card has no tasks — skipped.')
      }
      const next = pickNext(current, bp.nodes, bp.edges, invoice)
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

    // Start / other — step forward
    const next = pickNext(current, bp.nodes, bp.edges, invoice)
    if (!next) {
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
    current = next
  }

  try {
    notifyTenantDataUpdated()
  } catch {
    /* ignore */
  }

  return {
    invoiceId,
    ok: true,
    detail: details.join(' ') || 'Advanced.',
  }
}

export function stopInvoiceRun(
  invoiceId: string,
  reason: string
): BlueprintRunnerLog {
  if (!isBlueprintsRunnerEnabled()) {
    return { invoiceId, ok: false, detail: 'Blueprint runner is off.' }
  }
  const invoice = getInvoiceById(invoiceId)
  if (!invoice) return { invoiceId, ok: false, detail: 'Invoice not found.' }
  const run = getPrimaryRunForInvoice(invoice)
  if (!run || run.status === 'completed' || run.status === 'stopped') {
    return { invoiceId, ok: true, detail: 'No live run to stop.' }
  }
  upsertBlueprintRun({
    ...run,
    status: 'stopped',
    currentStep: `Stopped · ${reason}`,
    waitUntil: null,
  })
  return { invoiceId, ok: true, detail: `Stopped: ${reason}` }
}

/**
 * Resolve which blueprint to run for an event.
 * Highest priority wins, then fit score. Assignment wins only on a full tie.
 */
function resolveBlueprintForEvent(
  invoice: Invoice,
  event: BlueprintMatchEvent
): { blueprintId: string; blueprintName: string; via: 'assigned' | 'auto' } | null {
  const best = findBestMatchingBlueprint(event, invoice)
  const assignment = getInvoiceBlueprintAssignment(invoice.id)
  let assignedScore = 0
  let assignedPriority = 0
  if (assignment) {
    const bp = getSavedBlueprint(assignment.blueprintId)
    const scored = bp ? scoreBlueprintForEvent(bp, event, invoice) : null
    if (scored) {
      assignedScore = scored.score
      assignedPriority = blueprintPriority(bp!)
    }
  }

  const bestPriority = best ? blueprintPriority(best.blueprint) : -Infinity
  const assignedWins =
    assignment &&
    assignedScore > 0 &&
    (assignedPriority > bestPriority ||
      (assignedPriority === bestPriority &&
        (!best || assignedScore >= best.score)))

  if (assignedWins && assignment) {
    return {
      blueprintId: assignment.blueprintId,
      blueprintName: assignment.blueprintName,
      via: 'assigned',
    }
  }

  if (!best) return null

  assignInvoiceBlueprint(invoice.id, best.blueprint.id, best.blueprint.name)
  return {
    blueprintId: best.blueprint.id,
    blueprintName: best.blueprint.name,
    via: 'auto',
  }
}

export function enrollInvoiceIfNeeded(
  invoice: Invoice,
  reason: string
): BlueprintRunnerLog {
  if (!isBlueprintsRunnerEnabled()) {
    return { invoiceId: invoice.id, ok: false, detail: 'Blueprint runner is off.' }
  }
  if (!getInvoiceBlueprintAssignment(invoice.id)) {
    return { invoiceId: invoice.id, ok: false, detail: 'No blueprint assigned.' }
  }
  const result = ensureEnrollment(invoice, reason)
  if (!result) {
    return { invoiceId: invoice.id, ok: false, detail: 'Could not enroll.' }
  }
  if (!result.created) {
    return {
      invoiceId: invoice.id,
      ok: true,
      detail: `Already enrolled (${result.run.status}).`,
    }
  }
  // If enrolled on Start with no Wait, advance once
  if (result.run.status === 'active') {
    return advanceInvoiceRun(invoice.id, { forceWake: true })
  }
  return {
    invoiceId: invoice.id,
    ok: true,
    detail: `Enrolled: ${result.run.currentStep} (${reason}).`,
  }
}

/** Assign (if needed) + enroll for a live event. */
export function enrollForEvent(
  invoice: Invoice,
  event: BlueprintMatchEvent,
  reason: string
): BlueprintRunnerLog {
  if (!isBlueprintsRunnerEnabled()) {
    return { invoiceId: invoice.id, ok: false, detail: 'Blueprint runner is off.' }
  }
  const resolved = resolveBlueprintForEvent(invoice, event)
  if (!resolved) {
    return {
      invoiceId: invoice.id,
      ok: false,
      detail: `No blueprint matches event “${event}”.`,
    }
  }
  const log = enrollInvoiceIfNeeded(invoice, reason)
  if (!log.ok) return log
  return {
    ...log,
    detail: `${log.detail} [${resolved.via}: ${resolved.blueprintName}]`,
  }
}

/** Hold placed — auto-match hold blueprints if none assigned. */
export function onInvoiceHeld(invoiceId: string): void {
  try {
    if (!isBlueprintsRunnerEnabled()) return
    const invoice = getInvoiceById(invoiceId)
    if (!invoice) return
    enrollForEvent(invoice, 'hold', 'invoice held')
  } catch (err) {
    console.warn('[blueprints] onInvoiceHeld', err)
  }
}

/** Hold cleared / approved — advance parked “removed from hold” runs; else enroll. */
export function onInvoiceHoldCleared(invoiceId: string): void {
  try {
    if (!isBlueprintsRunnerEnabled()) return
    const invoice = getInvoiceById(invoiceId)
    if (!invoice) return

    const run = getPrimaryRunForInvoice(invoice)
    if (
      run &&
      (run.status === 'waiting' || run.status === 'active' || run.status === 'paused')
    ) {
      const loaded = loadAssignedGraph(invoiceId)
      const parkedWhen =
        loaded && run.currentNodeId
          ? loaded.bp.nodes.find((n) => n.id === run.currentNodeId)
          : null
      if (
        parkedWhen &&
        isWhen(parkedWhen.data) &&
        shouldParkWhenUntilTrue(parkedWhen.data)
      ) {
        advanceInvoiceRun(invoiceId, { forceWake: true })
        return
      }
      stopInvoiceRun(invoiceId, 'hold cleared')
    }

    enrollForEvent(invoice, 'hold_cleared', 'hold cleared')
  } catch (err) {
    console.warn('[blueprints] onInvoiceHoldCleared', err)
  }
}

/** PPW / paperwork track started — stop hold run; auto-match paperwork blueprint. */
export function onInvoicePpwSent(invoiceId: string): void {
  try {
    if (!isBlueprintsRunnerEnabled()) return
    const invoice = getInvoiceById(invoiceId)
    if (!invoice) return

    const existing = getPrimaryRunForInvoice(invoice)
    if (existing && (existing.status === 'waiting' || existing.status === 'active')) {
      const loaded = loadAssignedGraph(invoiceId)
      const start = loaded ? getStartNode(loaded.bp.nodes) : null
      const filters = start
        ? normalizeTriggerFilters(start.data.triggerFilters)
        : null
      if (filters && assignedBlueprintMatchesHold(filters)) {
        stopInvoiceRun(invoiceId, 'PPW sent — hold track ended')
      } else if (existing) {
        stopInvoiceRun(invoiceId, 'restarting for PPW')
      }
    }

    enrollForEvent(invoice, 'ppw', 'PPW sent')
  } catch (err) {
    console.warn('[blueprints] onInvoicePpwSent', err)
  }
}

/** Invoice entered Credyx (batch / purchase) — auto-match open-invoice blueprints. */
export function onInvoicePurchased(invoiceId: string): void {
  try {
    if (!isBlueprintsRunnerEnabled()) return
    const invoice = getInvoiceById(invoiceId)
    if (!invoice) return
    enrollForEvent(invoice, 'purchased', 'invoice purchased')
  } catch (err) {
    console.warn('[blueprints] onInvoicePurchased', err)
  }
}

/** Wake all due Wait clocks. */
export function tickBlueprintRuns(authorName?: string): {
  advanced: number
  logs: BlueprintRunnerLog[]
} {
  if (!isBlueprintsRunnerEnabled()) {
    return { advanced: 0, logs: [] }
  }
  const now = Date.now()
  const logs: BlueprintRunnerLog[] = []
  let advanced = 0
  for (const run of listBlueprintRuns()) {
    if (run.subject !== 'invoice' || !run.subjectId) continue
    if (run.status !== 'waiting') continue
    if (!run.waitUntil || new Date(run.waitUntil).getTime() > now) continue
    const log = advanceInvoiceRun(run.subjectId, {
      forceWake: true,
      authorName,
    })
    logs.push(log)
    if (log.ok) advanced += 1
  }
  return { advanced, logs }
}
