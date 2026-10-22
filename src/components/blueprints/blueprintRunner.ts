/**
 * Parallel invoice blueprint runner.
 * Phase 2: auto-match on hold / PPW / purchase when no assignment.
 * Then-do → notes/status only. Does not call email-lifecycle chase.
 */
import type { Edge } from '@xyflow/react'
import { isBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { getInvoiceById, mockInvoices } from '../../data/mockInvoices'
import { getConfirmedPaymentTotal } from '../../data/mockPayments'
import { getPpwSentAt, hasPpwBeenSent } from '../../utils/ppwSent'
import { isSupabaseConfigured } from '../../lib/supabase'
import type { Invoice } from '../../types/invoice'
import type { BlueprintFlowNode, BlueprintNodeData, SavedBlueprint } from '../../types/blueprintGraph'
import { findBestMatchingBlueprint, scoreBlueprintForEvent, type BlueprintMatchEvent } from './blueprintAutoMatch'
import { blueprintPriority } from '../../types/blueprintGraph'
import {
  formatCatalogCardLine,
  lookupWaitUntilById,
} from './blueprintCatalog'
import {
  assignInvoiceBlueprint,
  clearInvoiceBlueprintAssignment,
  getInvoiceBlueprintAssignment,
} from './invoiceBlueprintAssignment'
import {
  getPrimaryRunForInvoice,
  listBlueprintRuns,
  startInvoiceRun,
  upsertBlueprintRun,
  type BlueprintRunRow,
} from './blueprintRuns'
import { getSavedBlueprint, listSavedBlueprints } from './blueprintStore'
import { nextBlueprintAfter } from './blueprintHandoffMap'
import { getActionIds } from './blueprintSubject'
import {
  normalizeTriggerFilters,
  type BlueprintTriggerFilters,
} from './blueprintTriggerFilters'
import {
  cardSendsToBroker,
  executeBlueprintThenDo,
  noteMissingBrokerEmail,
} from './blueprintRunnerActions'
import { addAdminInvoiceNote } from '../../services/adminInvoiceNoteActions'
import { BROKER_CONFIRMED_NOTE } from '../../../supabase/functions/_shared/standardBlueprints'
import { resolveBlueprintWaitUntil } from './blueprintWaitUntil'
import { notifyTenantDataUpdated } from '../../services/supabase/tenantDataLiveSync'
import { whenNodePasses } from './blueprintWhenMatch'
import { getActiveStageConfig } from './blueprintStagesConfig'
import {
  HOLD_PAUSE_PREFIX,
  planInvoiceStage,
  stageBlueprintIds,
  stepBeforeHoldPause,
  type InvoiceStageFacts,
} from '../../../supabase/functions/_shared/invoiceStages'

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

function waitStepLine(node: BlueprintFlowNode): string {
  const wait = lookupWaitUntilById(node.data.waitUntilId)
  const line = wait
    ? formatCatalogCardLine(wait, node.data.days, node.data.waitUnit)
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

function evaluateWhenRaw(
  checkId: string | undefined,
  invoice: Invoice,
  meta?: { justProcessed?: boolean }
): boolean {
  if (!checkId) return false
  switch (checkId) {
    case 'on_hold':
      return invoice.status === 'hold'
    case 'payment_posted':
      return (
        invoice.status === 'paid' ||
        getConfirmedPaymentTotal(invoice.id) > 0
      )
    case 'invoice_processed':
      return (
        Boolean(meta?.justProcessed) ||
        invoice.status === 'approved' ||
        invoice.status === 'hold' ||
        invoice.status === 'paid' ||
        invoice.status === 'force_closed'
      )
    case 'ppw_sent':
      return hasPpwBeenSent(invoice)
    case 'paperwork_good':
      return invoice.email_lifecycle?.paperwork_status === 'good'
    case 'broker_replied':
    case 'no_reply':
      // Reply reading is not in this MVP — never invent a reply.
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

function evaluateWhenNode(
  data: BlueprintNodeData,
  invoice: Invoice,
  meta?: { justProcessed?: boolean }
): boolean {
  return whenNodePasses(data, evaluateWhenRaw(data.checkId, invoice, meta))
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
  invoice: Invoice,
  meta?: { justProcessed?: boolean }
): BlueprintFlowNode | null {
  if (isWhen(from.data)) {
    const matched = evaluateWhenNode(from.data, invoice, meta)
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
    const matched = whenTargets.find((t) =>
      evaluateWhenNode(t.data, invoice, meta)
    )
    if (matched) return matched
    // Enter the When so advance can park — never skip Whens (any blueprint)
    if (whenTargets[0]) return whenTargets[0]
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
    // Event assigned a different blueprint — stop the old run and enroll fresh
    if (existing.blueprintId !== assignment.blueprintId) {
      upsertBlueprintRun(
        {
          ...existing,
          status: 'stopped',
          currentStep: `Stopped · switching to ${assignment.blueprintName}`,
          waitUntil: null,
        },
        {
          historyEvent: {
            kind: 'stopped',
            title: 'Stopped · switching blueprint',
            detail: `From ${existing.blueprintName} → ${assignment.blueprintName} (${reason})`,
          },
        }
      )
    } else {
      return { run: existing, created: false }
    }
  }

  // Same blueprint already finished this episode — do not re-run on a duplicate hook
  if (
    existing &&
    existing.blueprintId === assignment.blueprintId &&
    (existing.status === 'completed' || existing.status === 'stopped') &&
    (reason === 'invoice held' ||
      reason === 'status change' ||
      reason === 'realtime sync')
  ) {
    return { run: existing, created: false }
  }

  const start = getStartNode(bp.nodes)
  // Always enroll at Start, then advance — never jump to a Wait (would skip Whens).
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
export async function advanceInvoiceRun(
  invoiceId: string,
  options?: {
    forceWake?: boolean
    authorName?: string
    justProcessed?: boolean
    /** Staff run from the invoice Actions panel. Ignores the Live runner switch. */
    manual?: boolean
    /** Do not park on Wait cards — continue into the next step. */
    skipWaits?: boolean
    toEmails?: string[]
    /** Blueprints already started in this handoff chain. */
    handoffVisited?: Set<string>
  }
): Promise<BlueprintRunnerLog> {
  if (!options?.manual && !isBlueprintsRunnerEnabled()) {
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
  const meta = { justProcessed: Boolean(options?.justProcessed) }

  // If waking from Wait, move to the next card first
  if (
    current.data.kind === 'wait' &&
    (options?.skipWaits ||
      options?.forceWake ||
      !run.waitUntil ||
      new Date(run.waitUntil).getTime() <= Date.now())
  ) {
    const next = pickNext(current, bp.nodes, bp.edges, invoice, meta)
    if (!next) {
      run = upsertBlueprintRun(
        {
          ...run,
          status: 'stopped',
          currentStep: 'Stopped · no next step after Wait',
          waitUntil: null,
        },
        {
          historyEvent: {
            kind: 'stopped',
            title: 'Wait ended — no next card',
            detail: 'Connect a step after Wait in the editor.',
          },
        }
      )
      return { invoiceId, ok: true, detail: 'Wait ended with no next card.' }
    }
    current = next
    run = upsertBlueprintRun(
      {
        ...run,
        status: 'active',
        currentNodeId: current.id,
        currentStep: `Woke · ${current.data.label || current.data.kind}`,
        waitUntil: null,
      },
      {
        historyEvent: {
          kind: 'advance',
          title: 'Wait finished — continuing',
          detail: `Next: ${current.data.label || current.data.kind}`,
        },
      }
    )
  }

  while (current && guard < 40) {
    guard += 1

    if (current.data.kind === 'wait') {
      if (options?.skipWaits) {
        const next = pickNext(current, bp.nodes, bp.edges, invoice, meta)
        details.push(`Skipped wait · ${current.data.label || 'Wait'}`)
        if (!next) {
          run = upsertBlueprintRun(
            {
              ...run,
              status: 'completed',
              currentStep: 'Done · after skipped wait',
              waitUntil: null,
            },
            {
              historyEvent: {
                kind: 'completed',
                title: 'Done · waits skipped',
              },
            }
          )
          break
        }
        current = next
        continue
      }
      const resolved = resolveBlueprintWaitUntil(
        { kind: 'invoice', invoice },
        current
      )
      run = upsertBlueprintRun(
        {
          ...run,
          status: 'waiting',
          currentNodeId: current.id,
          currentStep: waitStepLine(current),
          waitUntil: resolved.waitUntil,
          blueprintId: assignment.blueprintId,
          blueprintName: assignment.blueprintName,
        },
        {
          historyEvent: {
            kind: 'wait',
            title: waitStepLine(current),
            detail: resolved.detail,
          },
        }
      )
      details.push(`Waiting: ${resolved.detail}`)
      break
    }

    if (isWhen(current.data)) {
      const ok = evaluateWhenNode(current.data, invoice, meta)
      const next = nextAfterWhen(current.id, bp.nodes, bp.edges, ok)
      if (!ok) {
        if (options?.skipWaits) {
          const forced: BlueprintFlowNode | null = nextNodes(current.id, bp.nodes, bp.edges)[0] ?? null
          details.push(
            `When not matched — continued (${current.data.label || 'When'})`
          )
          if (!forced) {
            run = upsertBlueprintRun(
              {
                ...run,
                status: 'completed',
                currentStep: 'Done',
                waitUntil: null,
              },
              {
                historyEvent: {
                  kind: 'completed',
                  title: 'Done',
                  detail: 'When did not match and nothing follows it.',
                },
              }
            )
            break
          }
          current = forced
          continue
        }
        // Always park unmatched Whens (every blueprint) until invoice state changes
        run = upsertBlueprintRun(
          {
            ...run,
            status: 'waiting',
            currentNodeId: current.id,
            currentStep: whenParkStepLine(current.data),
            waitUntil: null,
            blueprintId: assignment.blueprintId,
            blueprintName: assignment.blueprintName,
          },
          {
            historyEvent: {
              kind: 'when',
              title: whenParkStepLine(current.data),
              detail: 'Parked until this When matches the invoice.',
            },
          }
        )
        details.push(`Parked at When until it matches (${whenParkStepLine(current.data)}).`)
        break
      }
      if (!next) {
        run = upsertBlueprintRun(
          {
            ...run,
            status: 'completed',
            currentNodeId: current.id,
            currentStep: 'Done',
            waitUntil: null,
          },
          {
            historyEvent: {
              kind: 'completed',
              title: 'Done',
              detail: 'When matched — no next card.',
            },
          }
        )
        details.push('When matched — no next card (Done).')
        break
      }
      details.push(`When matched → ${next.data.label || next.data.kind}`)
      run = upsertBlueprintRun(
        {
          ...run,
          status: 'active',
          currentNodeId: next.id,
          currentStep: `When matched · ${next.data.label || next.data.kind}`,
          waitUntil: null,
        },
        {
          historyEvent: {
            kind: 'when',
            title: 'When matched — continue',
            detail: `→ ${next.data.label || next.data.kind}`,
          },
        }
      )
      current = next
      continue
    }

    if (current.data.kind === 'action') {
      const ids = getActionIds(current.data)
      const actionResults: string[] = []
      let sendFailed = false
      let emailSent = false
      let noteAdded = false
      const cardHasNote = ids.includes('add_note')
      if (cardSendsToBroker(ids)) {
        const blocked = noteMissingBrokerEmail(invoice, assignment.blueprintName)
        if (blocked) {
          const retryAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
          run = upsertBlueprintRun(
            {
              ...run,
              status: 'waiting',
              currentNodeId: current.id,
              currentStep: 'Waiting · no broker email',
              waitUntil: retryAt,
            },
            {
              historyEvent: {
                kind: 'wait',
                title: 'Waiting · no broker email',
                detail: blocked,
              },
            }
          )
          details.push(blocked)
          break
        }
      }
      for (const actionId of ids) {
        if (sendFailed) break
        const result = await executeBlueprintThenDo({
          invoiceId,
          actionId,
          blueprintName: assignment.blueprintName,
          config: current.data.actionConfigs?.[actionId],
          authorName: options?.authorName,
          skipIfAlreadySent: options?.skipWaits ? false : undefined,
          toEmails: options?.toEmails,
          skipPortalNote: cardHasNote && actionId !== 'add_note',
        })
        details.push(result.detail)
        actionResults.push(result.detail)
        if (result.ok && !result.skipped) {
          if (
            actionId === 'email_broker_packet' ||
            actionId === 'email_payment_status' ||
            actionId === 'email_followup'
          ) {
            emailSent = true
          }
          if (actionId === 'add_note') noteAdded = true
        }
        if (
          !result.ok &&
          !result.skipped &&
          (actionId === 'email_broker_packet' ||
            actionId === 'email_payment_status' ||
            actionId === 'email_followup')
        ) {
          sendFailed = true
        }
      }
      if (sendFailed) {
        run = upsertBlueprintRun(
          {
            ...run,
            status: 'stopped',
            currentNodeId: current.id,
            currentStep: 'Stopped · send failed',
            waitUntil: null,
          },
          {
            historyEvent: {
              kind: 'stopped',
              title: 'Stopped · send failed',
              detail: actionResults.join(' · ') || undefined,
            },
          }
        )
        details.push('Stopped — the send did not go out, so later steps were not run.')
        break
      }
      if (ids.length === 0) {
        details.push('Then do card has no tasks — skipped.')
        actionResults.push('No tasks on this card — skipped.')
      }
      run = upsertBlueprintRun(
        {
          ...run,
          status: 'active',
          currentNodeId: current.id,
          currentStep: `Then do · ${current.data.label || 'tasks'}`,
          waitUntil: null,
        },
        {
          historyEvent: {
            kind: 'action',
            title: `Then do · ${current.data.label || 'tasks'}`,
            detail: actionResults.join(' · ') || undefined,
            stepNodeId: current.id,
            emailSent,
            noteAdded,
          },
        }
      )
      const next = pickNext(current, bp.nodes, bp.edges, invoice, meta)
      if (!next) {
        run = upsertBlueprintRun(
          {
            ...run,
            status: 'completed',
            currentStep: 'Done · after Then do',
            waitUntil: null,
          },
          {
            historyEvent: {
              kind: 'completed',
              title: 'Done · after Then do',
            },
          }
        )
        details.push('Done.')
        break
      }
      current = next
      continue
    }

    if (current.data.kind === 'stop') {
      run = upsertBlueprintRun(
        {
          ...run,
          status: 'completed',
          currentNodeId: current.id,
          currentStep: 'Done',
          waitUntil: null,
        },
        {
          historyEvent: {
            kind: 'completed',
            title: 'Done',
            detail: 'Reached Done card.',
          },
        }
      )
      details.push('Done.')
      break
    }

    // Start / other — step forward
    const next = pickNext(current, bp.nodes, bp.edges, invoice, meta)
    if (!next) {
      run = upsertBlueprintRun(
        {
          ...run,
          status: 'completed',
          currentNodeId: current.id,
          currentStep: 'Done',
          waitUntil: null,
        },
        {
          historyEvent: {
            kind: 'completed',
            title: 'Done',
          },
        }
      )
      details.push('Done.')
      break
    }
    current = next
  }

  if (run.status === 'completed' && !options?.skipWaits) {
    const handoff = await continueMappedBlueprint(
      invoice,
      loaded.assignment.blueprintId,
      options?.handoffVisited ?? new Set<string>()
    )
    if (handoff) details.push(handoff)
  }

  try {
    notifyTenantDataUpdated(['invoices'], invoice.client_id)
  } catch {
    /* ignore */
  }

  return {
    invoiceId,
    ok: true,
    detail: details.join(' ') || 'Advanced.',
  }
}

/**
 * Main-grid link: the blueprint that just finished points at another one.
 * Skipped for editor skip-wait test runs so a preview does not chain the map.
 */
async function continueMappedBlueprint(
  invoice: Invoice,
  finishedBlueprintId: string,
  visited: Set<string>
): Promise<string | null> {
  if (visited.has(finishedBlueprintId) || visited.size >= 8) return null
  visited.add(finishedBlueprintId)
  const nextId = nextBlueprintAfter(finishedBlueprintId)
  if (!nextId || visited.has(nextId)) return null
  // Stages on: the invoice's stage picks between stage blueprints, not "then start".
  const stages = getActiveStageConfig()
  if (stages) {
    const managed = stageBlueprintIds(stages)
    if (managed.has(finishedBlueprintId) && managed.has(nextId)) return null
  }
  const next = getSavedBlueprint(nextId)
  if (!next) return null
  const start = next.nodes.find((node) => node.data.kind === 'trigger')
  if (start?.data.triggerSubject === 'brokers' || start?.data.triggerSubject === 'batches') {
    return null
  }
  assignInvoiceBlueprint(invoice.id, next.id, next.name)
  const log = await enrollInvoiceIfNeeded(invoice, 'previous blueprint finished', {
    handoffVisited: visited,
  })
  return log.ok
    ? `Next blueprint · ${next.name}`
    : `Next blueprint ${next.name} did not start. ${log.detail}`
}

/**
 * Staff run from the invoice Actions panel.
 * `normal` enrolls and stops on each Wait. `skip_waits` restarts and runs every step now.
 */
export async function runInvoiceBlueprintManual(input: {
  invoiceId: string
  blueprintId: string
  mode: 'normal' | 'skip_waits'
  authorName?: string
  toEmails?: string[]
}): Promise<BlueprintRunnerLog> {
  const invoice = getInvoiceById(input.invoiceId)
  if (!invoice) return { invoiceId: input.invoiceId, ok: false, detail: 'Invoice not found.' }
  const bp = getSavedBlueprint(input.blueprintId)
  if (!bp) return { invoiceId: input.invoiceId, ok: false, detail: 'Blueprint not found.' }

  assignInvoiceBlueprint(invoice.id, bp.id, bp.name)

  if (input.mode === 'skip_waits') {
    const existing = getPrimaryRunForInvoice(invoice)
    if (
      existing &&
      (existing.status === 'waiting' ||
        existing.status === 'active' ||
        existing.status === 'paused')
    ) {
      upsertBlueprintRun(
        {
          ...existing,
          status: 'stopped',
          currentStep: 'Stopped · run every step',
          waitUntil: null,
        },
        {
          historyEvent: {
            kind: 'stopped',
            title: 'Stopped · run every step',
            detail: 'Restarting from the start with waits skipped.',
          },
        }
      )
    }
  }

  const enrolled = ensureEnrollment(invoice, 'Actions panel')
  if (!enrolled) {
    return { invoiceId: invoice.id, ok: false, detail: 'Could not enroll this blueprint.' }
  }

  return advanceInvoiceRun(invoice.id, {
    manual: true,
    forceWake: input.mode === 'skip_waits',
    skipWaits: input.mode === 'skip_waits',
    authorName: input.authorName,
    toEmails: input.toEmails,
  })
}

/**
 * Stop the invoice's current run (if live) and start the same blueprint again from the top.
 * Waits are respected; use runInvoiceBlueprintManual(skip_waits) to run every step at once.
 */
export async function rerunInvoiceBlueprint(
  invoiceId: string,
  authorName?: string
): Promise<BlueprintRunnerLog> {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice) return { invoiceId, ok: false, detail: 'Invoice not found.' }
  const run = getPrimaryRunForInvoice(invoice)
  const blueprintId = run?.blueprintId ?? getInvoiceBlueprintAssignment(invoiceId)?.blueprintId
  if (!blueprintId) return { invoiceId, ok: false, detail: 'No blueprint to rerun.' }

  const life = invoice.email_lifecycle
  if (life) {
    const track = life.paperwork_status === 'good' ? 'payment' : 'paperwork'
    const state = { ...(life[track] ?? {}) }
    if (state.firstAskedAt || state.secondAskedAt) {
      delete state.firstAskedAt
      delete state.secondAskedAt
      const { persistInvoiceLifecycle } = await import('../../services/emailLifecycleService')
      await persistInvoiceLifecycle(invoiceId, { ...life, [track]: state })
    }
  }

  if (run && (run.status === 'waiting' || run.status === 'active' || run.status === 'paused')) {
    upsertBlueprintRun(
      { ...run, status: 'stopped', currentStep: 'Stopped · rerun', waitUntil: null },
      {
        historyEvent: {
          kind: 'stopped',
          title: 'Stopped · rerun',
          detail: 'Restarting this blueprint from the start.',
        },
      }
    )
  }
  return runInvoiceBlueprintManual({ invoiceId, blueprintId, mode: 'normal', authorName })
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
  upsertBlueprintRun(
    {
      ...run,
      status: 'stopped',
      currentStep: `Stopped · ${reason}`,
      waitUntil: null,
    },
    {
      historyEvent: {
        kind: 'stopped',
        title: `Stopped · ${reason}`,
      },
    }
  )
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

function paymentChaseBlueprint(): SavedBlueprint | null {
  const standard = getSavedBlueprint('bp-standard-payment-chase')
  if (standard) return standard
  return (
    listSavedBlueprints().find((bp) =>
      bp.nodes.some(
        (node) =>
          (node.data.kind === 'if' || node.data.kind === 'elseif') &&
          node.data.checkId === 'paperwork_good' &&
          node.data.whenMatch !== 'no'
      )
    ) ?? null
  )
}

/** After paperwork is confirmed, stop the paperwork chase and park on the payment clock. */
export async function startPaymentChaseAfterConfirm(invoiceId: string): Promise<BlueprintRunnerLog> {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice) return { invoiceId, ok: false, detail: 'Invoice not found.' }
  if (invoice.email_lifecycle?.paperwork_status !== 'good') {
    return { invoiceId, ok: false, detail: 'Paperwork is not logged good.' }
  }
  const hasConfirmNote = (invoice.notes_history ?? []).some((row) =>
    row.note.includes('Payment chase started')
  )
  if (!hasConfirmNote) {
    addAdminInvoiceNote(invoice.id, BROKER_CONFIRMED_NOTE, 'Credyx', {
      visibility: 'internal',
    })
  }
  // Stages on: paperwork is now good, so the Payment stage blueprint takes over.
  const staged = await routeInvoiceByStage(invoiceId, 'broker confirmed')
  if (staged) return staged
  const bp = paymentChaseBlueprint()
  if (!bp) return { invoiceId, ok: false, detail: 'No payment chase blueprint.' }
  const existing = getPrimaryRunForInvoice(invoice)
  if (
    existing &&
    existing.blueprintId === bp.id &&
    (existing.status === 'waiting' || existing.status === 'active' || existing.status === 'paused')
  ) {
    return { invoiceId, ok: true, detail: 'Payment chase already running.' }
  }
  assignInvoiceBlueprint(invoice.id, bp.id, bp.name)
  const enrolled = ensureEnrollment(invoice, 'broker confirmed')
  if (!enrolled) return { invoiceId, ok: false, detail: 'Could not enroll payment chase.' }
  if (!enrolled.created) {
    return { invoiceId, ok: true, detail: 'Payment chase already running.' }
  }
  return advanceInvoiceRun(invoice.id, { manual: true, forceWake: true })
}

export async function enrollInvoiceIfNeeded(
  invoice: Invoice,
  reason: string,
  options?: { justProcessed?: boolean; handoffVisited?: Set<string> }
): Promise<BlueprintRunnerLog> {
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
  // Always advance from Start until Wait / parked When / Done
  return advanceInvoiceRun(invoice.id, {
    forceWake: true,
    justProcessed: options?.justProcessed,
    handoffVisited: options?.handoffVisited,
  })
}

/** Look up invoice by id, invoice #, or load # (for editor test runs). */
function findInvoiceByQuery(query: string): Invoice | undefined {
  const needle = query.trim().toLowerCase()
  if (!needle) return undefined
  const byId = getInvoiceById(query.trim())
  if (byId) return byId
  return (
    mockInvoices.find((i) => i.invoice_number.toLowerCase() === needle) ||
    mockInvoices.find((i) => (i.load_number || '').toLowerCase() === needle) ||
    mockInvoices.find((i) => i.invoice_number.toLowerCase().includes(needle)) ||
    mockInvoices.find((i) => (i.load_number || '').toLowerCase().includes(needle))
  )
}

/**
 * Editor test: assign this blueprint to an invoice (by # or load #) or batch
 * (by id / batch #), restart enrollment, force-advance through Wait so Then-do runs now.
 */
export async function testRunBlueprintByQuery(opts: {
  blueprintId: string
  blueprintName: string
  query: string
}): Promise<
  BlueprintRunnerLog & {
    invoiceNumber?: string
    loadNumber?: string
    batchNumber?: string
  }
> {
  if (!isBlueprintsRunnerEnabled()) {
    return {
      invoiceId: '',
      ok: false,
      detail: 'Turn on Live runner first.',
    }
  }
  const invoice = findInvoiceByQuery(opts.query)
  if (invoice) {
    assignInvoiceBlueprint(invoice.id, opts.blueprintId, opts.blueprintName)

    const existing = getPrimaryRunForInvoice(invoice)
    if (
      existing &&
      (existing.status === 'waiting' ||
        existing.status === 'active' ||
        existing.status === 'paused')
    ) {
      upsertBlueprintRun({
        ...existing,
        status: 'stopped',
        currentStep: 'Stopped · editor test re-run',
        waitUntil: null,
      })
    }

    const enrolled = ensureEnrollment(invoice, 'editor test run')
    if (!enrolled) {
      return {
        invoiceId: invoice.id,
        ok: false,
        detail: 'Could not enroll — save the blueprint first?',
        invoiceNumber: invoice.invoice_number,
        loadNumber: invoice.load_number,
      }
    }

    const log = await advanceInvoiceRun(invoice.id, {
      forceWake: true,
      justProcessed: true,
    })
    return {
      ...log,
      invoiceNumber: invoice.invoice_number,
      loadNumber: invoice.load_number,
      detail: `${invoice.invoice_number}${invoice.load_number ? ` · Load ${invoice.load_number}` : ''}: ${log.detail}`,
    }
  }

  const { testRunBlueprintByBatchQuery } = await import('./blueprintBatchRunner')
  const batchLog = await testRunBlueprintByBatchQuery(opts)
  if (batchLog.batchId || batchLog.batchNumber) {
    return {
      invoiceId: batchLog.batchId,
      ok: batchLog.ok,
      detail: batchLog.detail,
      batchNumber: batchLog.batchNumber,
    }
  }

  return {
    invoiceId: '',
    ok: false,
    detail: `No invoice or batch found for “${opts.query.trim()}”. Try invoice #, load #, or batch #.`,
  }
}

/** Assign (if needed) + enroll for a live event. */
export async function enrollForEvent(
  invoice: Invoice,
  event: BlueprintMatchEvent,
  reason: string
): Promise<BlueprintRunnerLog> {
  return withInvoiceEnrollLock(invoice.id, async () => {
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
    const log = await enrollInvoiceIfNeeded(invoice, reason, {
      justProcessed: event === 'invoice_processed',
    })
    if (!log.ok) return log
    return {
      ...log,
      detail: `${log.detail} [${resolved.via}: ${resolved.blueprintName}]`,
    }
  })
}

function stageFactsOf(invoice: Invoice): InvoiceStageFacts {
  return {
    status: invoice.status,
    // A broker pay promise (Will Pay + date) means the paperwork was accepted.
    paperworkStatus:
      invoice.collection_status === 'W/P' && invoice.collection_date
        ? 'good'
        : (invoice.email_lifecycle?.paperwork_status ?? null),
    ppwSent: hasPpwBeenSent(invoice),
  }
}

/**
 * Stages on (Blueprints → Stages): put the invoice on its stage's blueprint.
 * A hold pauses the other stage chase; removing it resumes (or restarts) that chase,
 * or moves on to Payment when paperwork was confirmed meanwhile.
 * Returns null when stages are off so callers keep the older matching.
 * Same plan as the server cron (supabase/functions/_shared/invoiceStages.ts).
 */
export async function routeInvoiceByStage(
  invoiceId: string,
  reason: string
): Promise<BlueprintRunnerLog | null> {
  const config = getActiveStageConfig()
  if (!config) return null
  if (!isBlueprintsRunnerEnabled()) {
    return { invoiceId, ok: false, detail: 'Blueprint runner is off.' }
  }
  // A step inside a running route can change the stage (e.g. packet sent → paperwork).
  // Wait for that route to finish, then route again instead of dropping this call.
  for (let tries = 0; tries < 5 && enrollInFlight.has(invoiceId); tries += 1) {
    await enrollInFlight.get(invoiceId)?.catch(() => undefined)
  }

  return withInvoiceEnrollLock(invoiceId, async () => {
    const invoice = getInvoiceById(invoiceId)
    if (!invoice) return { invoiceId, ok: false, detail: 'Invoice not found.' }
    const rows = listBlueprintRuns().filter(
      (r) => r.subject === 'invoice' && r.subjectId === invoiceId
    )
    const rowById = new Map(rows.map((r) => [r.id, r]))
    const plan = planInvoiceStage(
      stageFactsOf(invoice),
      rows.map((r) => ({
        id: r.id,
        blueprintId: r.blueprintId,
        status: r.status,
        currentStep: r.currentStep,
      })),
      config
    )
    const notes: string[] = []

    for (const { id } of plan.pause) {
      const row = rowById.get(id)
      if (!row) continue
      upsertBlueprintRun(
        { ...row, status: 'paused', currentStep: `${HOLD_PAUSE_PREFIX}${row.currentStep}` },
        {
          historyEvent: {
            kind: 'paused',
            title: 'Paused · invoice on hold',
            detail: `Was at: ${row.currentStep}`,
          },
        }
      )
      notes.push(`paused ${row.blueprintName}`)
    }

    for (const { run, step } of plan.stop) {
      const row = rowById.get(run.id)
      if (!row) continue
      upsertBlueprintRun(
        { ...row, status: 'stopped', currentStep: step, waitUntil: null },
        { historyEvent: { kind: 'stopped', title: step } }
      )
      notes.push(`stopped ${row.blueprintName}`)
    }

    for (const { run, step } of plan.retire) {
      const row = rowById.get(run.id)
      if (row) upsertBlueprintRun({ ...row, currentStep: step }, { silent: true })
    }

    for (const { id } of plan.resume) {
      const row = rowById.get(id)
      if (!row) continue
      const step = stepBeforeHoldPause(row.currentStep)
      upsertBlueprintRun(
        { ...row, status: 'waiting', currentStep: step },
        { historyEvent: { kind: 'advance', title: 'Resumed after hold', detail: step } }
      )
      assignInvoiceBlueprint(invoice.id, row.blueprintId, row.blueprintName)
      const log = await advanceInvoiceRun(invoice.id, { authorName: 'Credyx Blueprint' })
      notes.push(`resumed ${row.blueprintName}: ${log.detail}`)
    }

    if (plan.enroll && plan.targetBlueprintId) {
      const bp = getSavedBlueprint(plan.targetBlueprintId)
      if (!bp) {
        notes.push('stage blueprint not found — check Blueprints → Stages')
      } else {
        assignInvoiceBlueprint(invoice.id, bp.id, bp.name)
        const start = getStartNode(bp.nodes)
        startInvoiceRun({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          clientLabel: invoice.client_name,
          blueprintId: bp.id,
          blueprintName: bp.name,
          currentNodeId: start?.id,
          currentStep: start?.data.label || 'Start with',
          status: 'active',
          waitUntil: null,
          // Hold runs get their own row so the paused chase keeps its place.
          runId: plan.stage === 'hold' ? `run-inv-${invoice.id}-hold` : undefined,
        })
        const log = await advanceInvoiceRun(invoice.id, {
          forceWake: true,
          justProcessed: reason === 'invoice processed',
        })
        notes.push(`started ${bp.name}: ${log.detail}`)
      }
    } else if (plan.targetBlueprintId && plan.resume.length === 0) {
      const live = rows.find(
        (r) =>
          r.blueprintId === plan.targetBlueprintId &&
          (r.status === 'waiting' || r.status === 'active')
      )
      if (live) assignInvoiceBlueprint(invoice.id, live.blueprintId, live.blueprintName)
      if (await tryAdvanceParkedWhen(invoiceId, { justProcessed: reason === 'invoice processed' })) {
        notes.push('advanced parked When')
      }
    }

    return {
      invoiceId,
      ok: true,
      detail: `Stage: ${plan.stage ?? 'not started'}${notes.length ? ` · ${notes.join('; ')}` : ''} (${reason})`,
    }
  })
}

/** Hold placed — auto-match hold blueprints if none assigned. */
export function onInvoiceHeld(invoiceId: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      runBlueprintLifecycleHook(async () => {
        try {
          if (!isBlueprintsRunnerEnabled()) return
          if (await routeInvoiceByStage(invoiceId, 'invoice held')) return
          const invoice = getInvoiceById(invoiceId)
          if (!invoice) return
          await enrollForEvent(invoice, 'hold', 'invoice held')
        } catch (err) {
          console.warn('[blueprints] onInvoiceHeld enroll', err)
        } finally {
          resolve()
        }
      })
    } catch (err) {
      console.warn('[blueprints] onInvoiceHeld', err)
      resolve()
    }
  })
}

/** True when the live run is sitting on a When (parked until it matches). */
function isParkedAtWhen(invoiceId: string): boolean {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice) return false
  const run = getPrimaryRunForInvoice(invoice)
  if (!run || (run.status !== 'waiting' && run.status !== 'active')) return false
  const loaded = loadAssignedGraph(invoiceId)
  if (!loaded || !run.currentNodeId) return false
  const node = loaded.bp.nodes.find((n) => n.id === run.currentNodeId)
  return Boolean(node && isWhen(node.data))
}

/**
 * If parked on a When that now matches, advance (Then-do / Wait / Done).
 * Works for every blueprint — not hold-specific.
 */
export async function tryAdvanceParkedWhen(
  invoiceId: string,
  options?: { justProcessed?: boolean }
): Promise<boolean> {
  if (!isBlueprintsRunnerEnabled()) return false
  const invoice = getInvoiceById(invoiceId)
  if (!invoice) return false
  const run = getPrimaryRunForInvoice(invoice)
  if (!run || (run.status !== 'waiting' && run.status !== 'active' && run.status !== 'paused')) {
    return false
  }
  if (run.status === 'paused') return false
  const loaded = loadAssignedGraph(invoiceId)
  if (!loaded || !run.currentNodeId) return false
  const node = loaded.bp.nodes.find((n) => n.id === run.currentNodeId)
  if (!node || !isWhen(node.data)) return false
  const meta = { justProcessed: Boolean(options?.justProcessed) }
  if (!evaluateWhenNode(node.data, invoice, meta)) return false
  await advanceInvoiceRun(invoiceId, {
    forceWake: true,
    justProcessed: options?.justProcessed,
  })
  return true
}

/** Hold cleared / approved — only run a “removed from hold” blueprint if one exists. */
export function onInvoiceHoldCleared(invoiceId: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      runBlueprintLifecycleHook(async () => {
        try {
          if (!isBlueprintsRunnerEnabled()) return
          if (await routeInvoiceByStage(invoiceId, 'hold cleared')) return
          const invoice = getInvoiceById(invoiceId)
          if (!invoice) return

          // Parked on When · Removed from hold (Match false) — continue that graph
          if (await tryAdvanceParkedWhen(invoiceId)) return

          const best = findBestMatchingBlueprint('hold_cleared', invoice)
          if (!best) {
            // No blueprint for “removed from hold” → do nothing else.
            // Stop a live hold-track run so it doesn’t keep waiting.
            const run = getPrimaryRunForInvoice(invoice)
            if (
              run &&
              (run.status === 'waiting' ||
                run.status === 'active' ||
                run.status === 'paused')
            ) {
              const loaded = loadAssignedGraph(invoiceId)
              const start = loaded ? getStartNode(loaded.bp.nodes) : null
              const filters = start
                ? normalizeTriggerFilters(start.data.triggerFilters)
                : null
              const holdTrack =
                (filters && assignedBlueprintMatchesHold(filters)) ||
                (loaded &&
                  loaded.bp.nodes.some(
                    (n) =>
                      (n.data.kind === 'if' || n.data.kind === 'elseif') &&
                      n.data.checkId === 'on_hold'
                  ))
              if (holdTrack) {
                stopInvoiceRun(
                  invoiceId,
                  'hold cleared — no removed-from-hold blueprint'
                )
              }
            }
            return
          }

          const run = getPrimaryRunForInvoice(invoice)
          if (
            run &&
            (run.status === 'waiting' ||
              run.status === 'active' ||
              run.status === 'paused')
          ) {
            if (isParkedAtWhen(invoiceId)) return
            stopInvoiceRun(invoiceId, 'hold cleared')
          }

          await enrollForEvent(invoice, 'hold_cleared', 'hold cleared')
        } catch (err) {
          console.warn('[blueprints] onInvoiceHoldCleared enroll', err)
        } finally {
          resolve()
        }
      })
    } catch (err) {
      console.warn('[blueprints] onInvoiceHoldCleared', err)
      resolve()
    }
  })
}

/** PPW / paperwork track started — stop hold run; auto-match paperwork blueprint. */
export function onInvoicePpwSent(invoiceId: string): void {
  try {
    runBlueprintLifecycleHook(async () => {
      if (!isBlueprintsRunnerEnabled()) return
      if (await routeInvoiceByStage(invoiceId, 'PPW sent')) return
      const invoice = getInvoiceById(invoiceId)
      if (!invoice) return

      await tryAdvanceParkedWhen(invoiceId)

      const existing = getPrimaryRunForInvoice(invoice)
      if (existing && (existing.status === 'waiting' || existing.status === 'active')) {
        const loaded = loadAssignedGraph(invoiceId)
        const start = loaded ? getStartNode(loaded.bp.nodes) : null
        const filters = start
          ? normalizeTriggerFilters(start.data.triggerFilters)
          : null
        if (filters && assignedBlueprintMatchesHold(filters)) {
          stopInvoiceRun(invoiceId, 'PPW sent — hold track ended')
        } else if (existing && !isParkedAtWhen(invoiceId)) {
          stopInvoiceRun(invoiceId, 'restarting for PPW')
        }
      }

      await enrollForEvent(invoice, 'ppw', 'PPW sent')
    })
  } catch (err) {
    console.warn('[blueprints] onInvoicePpwSent', err)
  }
}

/** Invoice settled via batch Process (approved / hold). */
export function onInvoiceProcessed(invoiceId: string): void {
  try {
    runBlueprintLifecycleHook(async () => {
      if (!isBlueprintsRunnerEnabled()) return
      if (await routeInvoiceByStage(invoiceId, 'invoice processed')) return
      const invoice = getInvoiceById(invoiceId)
      if (!invoice) return

      if (await tryAdvanceParkedWhen(invoiceId, { justProcessed: true })) {
        return
      }

      await enrollForEvent(invoice, 'invoice_processed', 'invoice processed')
    })
  } catch (err) {
    console.warn('[blueprints] onInvoiceProcessed', err)
  }
}

/** Invoice entered Credyx (batch / purchase) — auto-match open-invoice blueprints. */
export function onInvoicePurchased(invoiceId: string): void {
  try {
    runBlueprintLifecycleHook(async () => {
      if (!isBlueprintsRunnerEnabled()) return
      if (await routeInvoiceByStage(invoiceId, 'invoice purchased')) return
      const invoice = getInvoiceById(invoiceId)
      if (!invoice) return
      await enrollForEvent(invoice, 'purchased', 'invoice purchased')
    })
  } catch (err) {
    console.warn('[blueprints] onInvoicePurchased', err)
  }
}

/** Confirmed payment posted — wake parked Payment When; enroll payment blueprints. */
const handledPaymentPosts = new Set<string>()

export function onPaymentPosted(invoiceId: string): void {
  try {
    runBlueprintLifecycleHook(async () => {
      if (!isBlueprintsRunnerEnabled()) return
      const invoice = getInvoiceById(invoiceId)
      if (!invoice) return

      if (await tryAdvanceParkedWhen(invoiceId)) {
        handledPaymentPosts.add(invoiceId)
        return
      }

      // Dedupe burst from emit + microtask
      const key = `${invoiceId}:${getConfirmedPaymentTotal(invoiceId)}`
      if (handledPaymentPosts.has(key)) return
      handledPaymentPosts.add(key)

      await enrollForEvent(invoice, 'payment_posted', 'payment posted')
    })
  } catch (err) {
    console.warn('[blueprints] onPaymentPosted', err)
  }
}

const TERMINAL_FOR_SYNC = new Set([
  'paid',
  'rejected',
  'written_off',
  'write_off_pending',
  'force_closed',
])

/**
 * Realtime assign + enroll for one invoice (current status).
 * Also wakes a parked When when it now matches.
 */
export async function syncInvoiceBlueprints(
  invoiceId: string,
  reason = 'realtime sync'
): Promise<BlueprintRunnerLog> {
  if (!isBlueprintsRunnerEnabled()) {
    return { invoiceId, ok: false, detail: 'Blueprint runner is off.' }
  }
  const staged = await routeInvoiceByStage(invoiceId, reason)
  if (staged) return staged
  const invoice = getInvoiceById(invoiceId)
  if (!invoice) {
    return { invoiceId, ok: false, detail: 'Invoice not found.' }
  }

  if (TERMINAL_FOR_SYNC.has(invoice.status)) {
    const run = getPrimaryRunForInvoice(invoice)
    if (run && (run.status === 'waiting' || run.status === 'active' || run.status === 'paused')) {
      stopInvoiceRun(invoiceId, 'invoice closed')
    }
    return { invoiceId, ok: true, detail: 'Terminal status — no open blueprint.' }
  }

  if (await tryAdvanceParkedWhen(invoiceId)) {
    return { invoiceId, ok: true, detail: `Advanced parked When (${reason}).` }
  }

  // Already on a live Wait / active path for the assigned BP — keep it
  const existing = getPrimaryRunForInvoice(invoice)
  const assignment = getInvoiceBlueprintAssignment(invoiceId)
  if (
    existing &&
    assignment &&
    existing.blueprintId === assignment.blueprintId &&
    (existing.status === 'waiting' || existing.status === 'active' || existing.status === 'paused')
  ) {
    return {
      invoiceId,
      ok: true,
      detail: `Already on ${assignment.blueprintName} (${existing.status}).`,
    }
  }

  // Finished this assignment already — do not loop enroll on status/sync ticks
  const passiveSync =
    reason === 'status change' ||
    reason === 'realtime sync' ||
    reason.startsWith('assign') ||
    reason.includes('hydrate') ||
    reason.includes('Live runner')
  if (
    passiveSync &&
    existing &&
    assignment &&
    existing.blueprintId === assignment.blueprintId &&
    (existing.status === 'completed' || existing.status === 'stopped')
  ) {
    return {
      invoiceId,
      ok: true,
      detail: `Already finished ${assignment.blueprintName} (${existing.status}).`,
    }
  }

  const event: BlueprintMatchEvent =
    invoice.status === 'hold' ? 'hold' : 'sync'

  // Stale hold assignment on an open invoice — drop so sync can pick an open-A/R blueprint
  if (assignment && invoice.status !== 'hold') {
    const bp = getSavedBlueprint(assignment.blueprintId)
    const stillFits = bp ? scoreBlueprintForEvent(bp, event, invoice) : null
    if (!stillFits || stillFits.score <= 0) {
      clearInvoiceBlueprintAssignment(invoiceId)
    }
  }

  return enrollForEvent(invoice, event, reason)
}

/** Assign every open invoice to its best-matching blueprint (hydrate / Live runner on). */
export async function syncAllOpenInvoiceBlueprints(reason = 'assign all open'): Promise<{
  assigned: number
  logs: BlueprintRunnerLog[]
}> {
  if (!isBlueprintsRunnerEnabled()) {
    return { assigned: 0, logs: [] }
  }
  const logs: BlueprintRunnerLog[] = []
  let assigned = 0
  for (const inv of mockInvoices) {
    if (TERMINAL_FOR_SYNC.has(inv.status)) continue
    const log = await syncInvoiceBlueprints(inv.id, reason)
    logs.push(log)
    if (getInvoiceBlueprintAssignment(inv.id)) assigned += 1
  }
  return { assigned, logs }
}

/** Wake all due Wait clocks (server cron when configured, else local). */
export type BlueprintDebugStep = {
  index: number
  id: string
  kind: string
  label: string
  isCurrent: boolean
  config: Record<string, unknown>
  /** When cards: does the condition pass right now? */
  whenPasses?: boolean
  /** Wait cards: what the runner would resolve as the wake time. */
  waitResolves?: { waitUntil: string; detail: string; inMinutes: number } | { error: string }
}

export type BlueprintDebugSnapshot = {
  generatedAt: string
  runnerEnabled: boolean
  serverConfigured: boolean
  lastAutoTickAt: string | null
  invoice: Record<string, unknown>
  assignment: Record<string, unknown> | null
  run: Record<string, unknown> | null
  steps: BlueprintDebugStep[]
  /** Plain-English: what the next check will do with this run, and why. */
  verdict: string[]
  recentHistory: Array<Record<string, unknown>>
}

/** Everything needed to see why an invoice's blueprint is (or is not) moving. */
export function debugInvoiceBlueprint(invoiceId: string): BlueprintDebugSnapshot {
  const now = new Date()
  const invoice = getInvoiceById(invoiceId)
  const run = invoice ? getPrimaryRunForInvoice(invoice) : null
  const assignment = getInvoiceBlueprintAssignment(invoiceId)
  const loaded = invoice ? loadAssignedGraph(invoiceId) : null
  const verdict: string[] = []

  let lastAuto: string | null = null
  try {
    const raw = localStorage.getItem('credyx:blueprint-auto-tick-at')
    if (raw) lastAuto = new Date(Number(raw)).toISOString()
  } catch {
    /* ignore */
  }

  // Walk the graph in order from the trigger card.
  const steps: BlueprintDebugStep[] = []
  if (loaded && invoice) {
    const { bp } = loaded
    const byId = new Map(bp.nodes.map((n) => [n.id, n]))
    const start = bp.nodes.find((n) => n.data.kind === 'trigger') ?? bp.nodes[0]
    const seen = new Set<string>()
    let cur: BlueprintFlowNode | undefined = start
    while (cur && !seen.has(cur.id) && steps.length < 40) {
      seen.add(cur.id)
      const d = cur.data
      const step: BlueprintDebugStep = {
        index: steps.length,
        id: cur.id,
        kind: String(d.kind),
        label: d.label?.trim() || String(d.kind),
        isCurrent: run?.currentNodeId === cur.id,
        config: {
          checkId: d.checkId,
          whenMatch: d.whenMatch,
          waitUntilId: d.waitUntilId,
          days: d.days,
          waitUnit: d.waitUnit,
          actionIds: d.actionIds,
        },
      }
      if (isWhen(d)) {
        try {
          step.whenPasses = evaluateWhenNode(d, invoice)
        } catch (err) {
          step.whenPasses = undefined
          step.config.error = String(err)
        }
      }
      if (d.kind === 'wait') {
        try {
          const r = resolveBlueprintWaitUntil({ kind: 'invoice', invoice }, cur, now)
          step.waitResolves = {
            waitUntil: r.waitUntil,
            detail: r.detail,
            inMinutes: Math.round((new Date(r.waitUntil).getTime() - now.getTime()) / 60_000),
          }
        } catch (err) {
          step.waitResolves = { error: String(err) }
        }
      }
      steps.push(step)
      cur = nextNodes(cur.id, bp.nodes, bp.edges)[0]
      if (cur && !byId.has(cur.id)) break
    }
  }

  // Verdict mirrors tickBlueprintRuns so it explains what that check would do.
  if (!isBlueprintsRunnerEnabled()) verdict.push('The Live runner is OFF — nothing advances. Turn automation on.')
  if (!invoice) verdict.push('Invoice not found in the local store.')
  else if (!assignment && !run) verdict.push('No blueprint is assigned and there is no run.')
  else if (!run) verdict.push('A blueprint is assigned but there is no run. Use Start enrollment / Rerun.')
  else {
    const waitMs = run.waitUntil ? new Date(run.waitUntil).getTime() - now.getTime() : null
    const currentStep = steps.find((s) => s.isCurrent)
    if (run.status === 'completed' || run.status === 'stopped') {
      verdict.push(`Run is ${run.status} (${run.currentStep}). It will not move again. Use Rerun.`)
    } else if (run.status === 'paused') {
      verdict.push('Run is PAUSED (usually because the invoice is on hold). It resumes when the hold is removed.')
    } else if (!currentStep) {
      verdict.push(
        `Run points at node "${run.currentNodeId ?? '(none)'}" which is not on the assigned blueprint's path — it was probably started from another blueprint or the graph was edited. Rerun to reset.`
      )
    } else if (currentStep.kind === 'trigger') {
      verdict.push('Run is sitting on the first (trigger) card and has not advanced. The next check will push it forward; Rerun does it now.')
    } else if (run.status === 'waiting' && run.waitUntil) {
      if (waitMs != null && waitMs > 0) {
        verdict.push(`Waiting on a clock step. Wakes ${new Date(run.waitUntil).toLocaleString()} (in ${Math.ceil(waitMs / 60_000)} min).`)
      } else {
        verdict.push(
          `Wake time ${new Date(run.waitUntil).toLocaleString()} has PASSED (${Math.abs(Math.round((waitMs ?? 0) / 60_000))} min ago). It is due — the next check will advance it. Checks run every 5 min while an admin tab is open, or when you press Run blueprints.`
        )
      }
    } else if (run.status === 'waiting' && currentStep.kind !== 'wait') {
      verdict.push(
        currentStep.whenPasses
          ? `Parked on "${currentStep.label}" and its condition is TRUE now — the next check will advance it.`
          : `Parked on "${currentStep.label}" — its condition is still FALSE, so it keeps waiting.`
      )
    } else if (run.status === 'waiting') {
      verdict.push('On a Wait step with no wake time stored — the next check will schedule it.')
    } else if (run.status === 'active') {
      const idleMin = Math.round((now.getTime() - new Date(run.updatedAt || 0).getTime()) / 60_000)
      verdict.push(`Run is ACTIVE (idle ${idleMin} min). If it stays active it never finished its first advance; the check re-kicks it after 2 min.`)
    }
    if (currentStep?.kind === 'wait') {
      const cfg = currentStep.config
      verdict.push(
        `Wait is configured as: ${String(cfg.waitUntilId ?? 'pause_days')} · ${String(cfg.days ?? '?')} ${String(cfg.waitUnit ?? 'days')}.`
      )
    }
  }
  if (lastAuto) verdict.push(`Last automatic check from this browser: ${new Date(lastAuto).toLocaleString()}.`)
  else verdict.push('No automatic check has run from this browser yet.')

  const stripped = run ? (({ history: _history, ...rest }) => rest)(run) : null
  return {
    generatedAt: now.toISOString(),
    runnerEnabled: isBlueprintsRunnerEnabled(),
    serverConfigured: isSupabaseConfigured(),
    lastAutoTickAt: lastAuto,
    invoice: invoice
      ? {
          id: invoice.id,
          number: invoice.invoice_number,
          status: invoice.status,
          ppwSent: hasPpwBeenSent(invoice),
          ppwSentAt: getPpwSentAt(invoice),
          paperworkStatus: invoice.email_lifecycle?.paperwork_status ?? null,
          lastReplyStatus: invoice.email_lifecycle?.last_reply_status ?? null,
          collectionStatus: invoice.collection_status ?? null,
          collectionDate: invoice.collection_date ?? null,
          sendHistory: (invoice.document_send_history ?? []).map((r) => ({
            at: r.sent_at,
            status: r.status,
            to: r.email_address,
          })),
        }
      : {},
    assignment: assignment ? { ...assignment } : null,
    run: stripped ? { ...stripped } : null,
    steps,
    verdict,
    recentHistory: (run?.history ?? []).slice(-15).map((ev) => ({
      at: ev.at,
      kind: ev.kind,
      title: ev.title,
      detail: ev.detail,
      completedNodeId: ev.completedNodeId,
    })),
  }
}

export type DashboardStepState = 'done' | 'now' | 'next'

export type BlueprintDashboardStep = {
  id: string
  number: number
  name: string
  kind: 'when' | 'wait' | 'action' | 'stop'
  state: DashboardStepState
  /** When this step actually ran (done steps). */
  ranAt?: string
  /** When this step is planned to run (current / upcoming), if it can be known. */
  runsAt?: string
  /** For a condition step that is still waiting: what it waits for. */
  waitingFor?: string
  /** What the card is set up to do. */
  plansEmail: boolean
  plansNote: boolean
  /** What actually happened (done Then-do steps). */
  emailSent?: boolean
  noteAdded?: boolean
  result?: string
  /** Why a planned email did not go out (from the step result). */
  emailWhy?: string
}

export type BlueprintDashboardActivity = {
  id: string
  at: string
  step: string
  detail?: string
  emailSent?: boolean
  noteAdded?: boolean
  plansEmail: boolean
  plansNote: boolean
}

export type BlueprintDashboardStatus =
  | 'none'
  | 'waiting'
  | 'overdue'
  | 'running'
  | 'stuck'
  | 'paused'
  | 'done'
  | 'stopped'

export type BlueprintDashboard = {
  status: BlueprintDashboardStatus
  statusText: string
  blueprintName: string
  lastCheckedAt: string | null
  nextRunAt: string | null
  nextRunText: string
  steps: BlueprintDashboardStep[]
  /** What each Then-do step actually did in this run, newest first. */
  activity: BlueprintDashboardActivity[]
  snapshot: BlueprintDebugSnapshot
}

const EMAIL_ACTIONS = new Set(['email_broker_packet', 'email_payment_status', 'email_followup'])

/** Add a pause_days style duration to a time (days land at 09:00 like the runner). */
function addWaitDuration(fromIso: string, days: unknown, unit: unknown): string | undefined {
  const n = Number(days)
  if (!Number.isFinite(n)) return undefined
  const d = new Date(fromIso)
  if (unit === 'minutes') return new Date(d.getTime() + n * 60_000).toISOString()
  if (unit === 'hours') return new Date(d.getTime() + n * 3_600_000).toISOString()
  d.setDate(d.getDate() + n)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

/** Simple per-step view of an invoice's blueprint: what ran, when, and what runs next. */
export function buildBlueprintDashboard(invoiceId: string): BlueprintDashboard {
  const snapshot = debugInvoiceBlueprint(invoiceId)
  const invoice = getInvoiceById(invoiceId)
  const run = invoice ? getPrimaryRunForInvoice(invoice) : null
  const now = Date.now()

  // Only this enrollment's events (after the latest "enrolled").
  const all = run?.history ?? []
  let startIdx = 0
  all.forEach((ev, i) => {
    if (ev.kind === 'enrolled') startIdx = i
  })
  const episode = all.slice(startIdx)

  const graphSteps = snapshot.steps.filter((s) => s.kind !== 'trigger')
  const currentIdx = graphSteps.findIndex((s) => s.isCurrent)
  const live = run && (run.status === 'waiting' || run.status === 'active' || run.status === 'paused')
  const finished = run && run.status === 'completed'

  const steps: BlueprintDashboardStep[] = graphSteps.map((s, i) => {
    const ids = Array.isArray(s.config.actionIds) ? (s.config.actionIds as string[]) : []
    const kind: BlueprintDashboardStep['kind'] =
      s.kind === 'wait' ? 'wait' : s.kind === 'action' ? 'action' : s.kind === 'stop' ? 'stop' : 'when'
    let state: DashboardStepState = 'next'
    if (finished) state = 'done'
    else if (currentIdx >= 0 && i < currentIdx) state = 'done'
    else if (currentIdx >= 0 && i === currentIdx) state = s.kind === 'action' ? 'done' : 'now'

    const actionEv = [...episode].reverse().find((ev) => ev.kind === 'action' && ev.stepNodeId === s.id)
    const doneEv = [...episode].reverse().find((ev) => ev.completedNodeId === s.id)
    const step: BlueprintDashboardStep = {
      id: s.id,
      number: i + 1,
      name:
        s.kind === 'wait'
          ? `${s.label} (${String(s.config.days ?? '?')} ${String(s.config.waitUnit ?? 'days')})`
          : s.label,
      kind,
      state,
      plansEmail: ids.some((id) => EMAIL_ACTIONS.has(id)),
      plansNote: ids.includes('add_note'),
    }
    if (state === 'done') {
      step.ranAt = actionEv?.at ?? doneEv?.at
      if (kind === 'action' && actionEv) {
        step.result = actionEv.detail
        step.emailSent =
          actionEv.emailSent ?? (step.plansEmail ? /sent|emailed/i.test(actionEv.detail ?? '') : undefined)
        step.noteAdded =
          actionEv.noteAdded ?? (step.plansNote ? /note/i.test(actionEv.detail ?? '') : undefined)
        if (step.emailSent === false) {
          const why = (actionEv.detail ?? '')
            .split(' · ')
            .find((part) => /email/i.test(part) && /not sent|failed|skip/i.test(part))
          step.emailWhy = why?.replace(/^Email not sent — /, '') || undefined
        }
      }
    }
    return step
  })

  // Fill missing "ran at" with the next known time (steps passed together).
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].state === 'done' && !steps[i].ranAt) {
      steps[i].ranAt = steps.slice(i + 1).find((x) => x.ranAt)?.ranAt ?? episode[0]?.at
    }
  }

  // Plan forward from the current step.
  if (live && currentIdx >= 0) {
    const cur = graphSteps[currentIdx]
    let t: string | undefined =
      cur.kind === 'wait'
        ? run?.waitUntil ??
          (cur.waitResolves && !('error' in cur.waitResolves) ? cur.waitResolves.waitUntil : undefined)
        : undefined
    if (cur.kind !== 'wait' && cur.kind !== 'trigger' && cur.whenPasses === false) {
      steps[currentIdx].waitingFor = cur.label
    }
    if (cur.kind === 'wait') steps[currentIdx].runsAt = t
    for (let i = currentIdx + 1; i < graphSteps.length; i += 1) {
      const g = graphSteps[i]
      if (g.kind === 'wait') {
        const waitId = g.config.waitUntilId ?? 'pause_days'
        t = t && waitId === 'pause_days' ? addWaitDuration(t, g.config.days, g.config.waitUnit) : undefined
        steps[i].runsAt = t
      } else if (g.kind === 'action' || g.kind === 'stop') {
        steps[i].runsAt = t
      } else if (g.whenPasses === false) {
        steps[i].waitingFor = g.label
        t = undefined
      }
    }
  } else if (live && currentIdx < 0) {
    // Still on the trigger card: the first step runs on the next check.
    if (steps[0]) steps[0].runsAt = new Date(now).toISOString()
  }

  const nextStep = steps.find((s) => s.state !== 'done')
  const nextRunAt = nextStep?.runsAt ?? null
  const fmtIn = (iso: string) => {
    const diff = new Date(iso).getTime() - now
    const mins = Math.round(Math.abs(diff) / 60_000)
    const span = mins < 90 ? `${mins} min` : mins < 2160 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} days`
    return diff >= 0 ? `in ${span}` : `${span} overdue`
  }

  let status: BlueprintDashboardStatus = 'none'
  let statusText = 'Not running'
  const idleMs = run ? now - new Date(run.updatedAt || 0).getTime() : 0
  if (!run) {
    status = 'none'
    statusText = 'No run on this invoice'
  } else if (run.status === 'completed') {
    status = 'done'
    statusText = 'Finished'
  } else if (run.status === 'stopped') {
    status = 'stopped'
    statusText = `Stopped · ${run.currentStep.replace(/^Stopped · /, '')}`
  } else if (run.status === 'paused') {
    status = 'paused'
    statusText = 'Paused while the invoice is on hold'
  } else if (run.status === 'active' && idleMs > 2 * 60_000) {
    status = 'stuck'
    statusText = 'Stuck — press Run check now'
  } else if (run.status === 'active') {
    status = 'running'
    statusText = 'Running'
  } else if (nextRunAt && new Date(nextRunAt).getTime() < now) {
    status = 'overdue'
    statusText = 'Due now — running shortly'
  } else {
    status = 'waiting'
    statusText = 'Waiting'
  }

  let nextRunText = '—'
  if (status === 'stuck') nextRunText = 'On the next check'
  else if (nextStep?.waitingFor && !nextRunAt) nextRunText = `When “${nextStep.waitingFor}” happens`
  else if (nextRunAt) nextRunText = fmtIn(nextRunAt)
  else if (status === 'waiting') nextRunText = 'After the previous step'

  const stepById = new Map(steps.map((s) => [s.id, s]))
  const activity: BlueprintDashboardActivity[] = episode
    .filter((ev) => ev.kind === 'action' || ev.kind === 'stopped')
    .map((ev) => {
      const step = ev.stepNodeId ? stepById.get(ev.stepNodeId) : undefined
      return {
        id: ev.id,
        at: ev.at,
        step: step?.name ?? ev.title.replace(/^Then do · /, ''),
        detail: ev.detail,
        emailSent: ev.emailSent,
        noteAdded: ev.noteAdded,
        plansEmail: step?.plansEmail ?? false,
        plansNote: step?.plansNote ?? false,
      }
    })
    .reverse()

  return {
    status,
    statusText,
    activity,
    blueprintName: run?.blueprintName ?? String(snapshot.assignment?.blueprintName ?? ''),
    lastCheckedAt: snapshot.lastAutoTickAt ?? run?.updatedAt ?? null,
    nextRunAt,
    nextRunText,
    steps,
    snapshot,
  }
}

/**
 * Runs that no clock will ever wake: a parked When that is already true, an
 * "active" run that never finished its first advance, or a Wait with no wake time.
 * The server check only looks at due Waits, so this always runs in the browser too.
 */
async function healStuckInvoiceRuns(
  now: number,
  authorName?: string,
  opts?: { serverHandlesWaiting?: boolean }
): Promise<{ advanced: number; logs: BlueprintRunnerLog[] }> {
  const logs: BlueprintRunnerLog[] = []
  let advanced = 0
  for (const run of listBlueprintRuns()) {
    if (run.subject !== 'invoice' || !run.subjectId) continue
    // The server already walks every waiting run (parked Whens included). Doing it here too
    // would send the same email twice — only rescue runs the server ignores.
    if (opts?.serverHandlesWaiting && run.status === 'waiting') continue
    // Self-heal runs that no clock will ever wake:
    //  - parked on a When whose condition is already true (event was missed, e.g. PPW sent)
    //  - left "active" without finishing its first advance (never reached a Wait)
    if (!run.waitUntil && (run.status === 'waiting' || run.status === 'active')) {
      const idleMs = now - new Date(run.updatedAt || 0).getTime()
      if (run.status === 'active') {
        if (idleMs < STUCK_ACTIVE_RUN_MS) continue
        const log = await advanceInvoiceRun(run.subjectId, { forceWake: true, authorName })
        logs.push(log)
        if (log.ok) advanced += 1
      } else if (await tryAdvanceParkedWhen(run.subjectId)) {
        logs.push({ invoiceId: run.subjectId, ok: true, detail: 'Advanced parked When (tick).' })
        advanced += 1
      } else {
        // Waiting on a Wait step but no wake time was ever stored — schedule it now.
        const inv = getInvoiceById(run.subjectId)
        const loaded = inv ? loadAssignedGraph(run.subjectId) : null
        const node = loaded?.bp.nodes.find((n) => n.id === run.currentNodeId)
        if (inv && node && node.data.kind === 'wait') {
          const resolved = resolveBlueprintWaitUntil({ kind: 'invoice', invoice: inv }, node)
          upsertBlueprintRun(
            { ...run, waitUntil: resolved.waitUntil },
            {
              historyEvent: {
                kind: 'wait',
                title: `Wait scheduled · ${resolved.detail}`,
                detail: `Wake ${new Date(resolved.waitUntil).toLocaleString()}`,
              },
            }
          )
          logs.push({ invoiceId: run.subjectId, ok: true, detail: 'Scheduled missing wake time.' })
        }
      }
    }
  }
  return { advanced, logs }
}

/** An "active" run idle this long never finished its first advance — kick it again. */
const STUCK_ACTIVE_RUN_MS = 2 * 60 * 1000

export async function tickBlueprintRuns(authorName?: string): Promise<{
  advanced: number
  logs: BlueprintRunnerLog[]
}> {
  if (!isBlueprintsRunnerEnabled()) {
    return { advanced: 0, logs: [] }
  }

  try {
    const { invokeBlueprintWakeCron } = await import('../../services/blueprintWakeCron')
    const server = await invokeBlueprintWakeCron(40)
    if (server) {
      const healed = await healStuckInvoiceRuns(Date.now(), authorName, {
        serverHandlesWaiting: true,
      })
      return {
        advanced: server.advanced + healed.advanced,
        logs: [
          ...(server.details ?? []).map((detail) => ({
            invoiceId: '',
            ok: true,
            detail,
          })),
          ...healed.logs,
        ],
      }
    }
  } catch (err) {
    console.warn('[tickBlueprintRuns] server wake unavailable', err)
  }

  const now = Date.now()
  const healed = await healStuckInvoiceRuns(now, authorName)
  const logs: BlueprintRunnerLog[] = [...healed.logs]
  let advanced = healed.advanced

  const { advanceBrokerRun } = await import('./blueprintBrokerRunner')
  const { advanceBatchRun } = await import('./blueprintBatchRunner')

  for (const run of listBlueprintRuns()) {
    if (!run.subjectId) continue

    if (run.subject === 'invoice') {
      if (run.status !== 'waiting') continue
      if (!run.waitUntil || new Date(run.waitUntil).getTime() > now) continue
      const log = await advanceInvoiceRun(run.subjectId, {
        forceWake: true,
        authorName,
      })
      logs.push(log)
      if (log.ok) advanced += 1
      continue
    }

    if (run.status !== 'waiting') continue
    // Parked Whens have null waitUntil — only clock Waits tick here
    if (!run.waitUntil || new Date(run.waitUntil).getTime() > now) continue

    if (run.subject === 'broker') {
      const log = advanceBrokerRun(run.subjectId, {
        forceWake: true,
        authorName,
      })
      logs.push({
        invoiceId: run.subjectId,
        ok: log.ok,
        detail: log.detail,
      })
      if (log.ok) advanced += 1
      continue
    }

    if (run.subject === 'batch') {
      const log = await advanceBatchRun(run.subjectId, { forceWake: true })
      logs.push({
        invoiceId: run.subjectId,
        ok: log.ok,
        detail: log.detail,
      })
      if (log.ok) advanced += 1
    }
  }
  return { advanced, logs }
}

/** Re-entrancy guard so status→sync does not double-fire inside hold/PPW hooks. */
let blueprintLifecycleDepth = 0

function beginBlueprintLifecycle(): void {
  blueprintLifecycleDepth += 1
}

function endBlueprintLifecycle(): void {
  blueprintLifecycleDepth = Math.max(0, blueprintLifecycleDepth - 1)
}

/** Run a sync hook; keep the guard up until async work finishes. */
function runBlueprintLifecycleHook(fn: () => void | Promise<void>): void {
  beginBlueprintLifecycle()
  try {
    const result = fn()
    if (result && typeof (result as Promise<void>).then === 'function') {
      void (result as Promise<void>).finally(() => endBlueprintLifecycle())
      return
    }
  } catch (err) {
    endBlueprintLifecycle()
    throw err
  }
  endBlueprintLifecycle()
}

/** True while a lifecycle hook is running (updateInvoice should not also sync). */
export function isBlueprintLifecycleHookActive(): boolean {
  return blueprintLifecycleDepth > 0
}

/** Prevent concurrent enrolls on the same invoice (status sync vs hold hook). */
const enrollInFlight = new Map<string, Promise<BlueprintRunnerLog>>()

async function withInvoiceEnrollLock(
  invoiceId: string,
  work: () => Promise<BlueprintRunnerLog>
): Promise<BlueprintRunnerLog> {
  const existing = enrollInFlight.get(invoiceId)
  if (existing) return existing
  const p = work().finally(() => {
    if (enrollInFlight.get(invoiceId) === p) enrollInFlight.delete(invoiceId)
  })
  enrollInFlight.set(invoiceId, p)
  return p
}
