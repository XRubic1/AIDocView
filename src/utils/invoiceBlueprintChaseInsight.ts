/**
 * Admin overview card for a live invoice blueprint: what happens next, and when.
 */
import type { BlueprintFlowNode, SavedBlueprint } from '../types/blueprintGraph'
import type { Invoice } from '../types/invoice'
import { getActionIds } from '../components/blueprints/blueprintSubject'
import {
  formatCatalogCardLine,
  lookupActionById,
  lookupWaitUntilById,
} from '../components/blueprints/blueprintCatalog'
import { formatWhenCardLine } from '../components/blueprints/blueprintWhenMatch'
import { getSavedBlueprint } from '../components/blueprints/blueprintStore'
import { getStoredPrimaryRunForInvoice } from '../components/blueprints/blueprintRuns'
import type { InvoiceMobileInsight } from './invoiceMobileInsights'

const EMAIL_ACTION_IDS = new Set([
  'email_broker_packet',
  'email_payment_status',
  'email_followup',
])

function outgoing(fromId: string, bp: SavedBlueprint): BlueprintFlowNode[] {
  const byId = new Map(bp.nodes.map((node) => [node.id, node]))
  return bp.edges
    .filter((edge) => edge.source === fromId)
    .map((edge) => byId.get(edge.target))
    .filter((node): node is BlueprintFlowNode => Boolean(node))
}

function isWhen(node: BlueprintFlowNode): boolean {
  return node.data.kind === 'if' || node.data.kind === 'elseif'
}

/** First Then-do after this card, walking through Wait and When cards. */
function nextActionAfter(from: BlueprintFlowNode, bp: SavedBlueprint): BlueprintFlowNode | null {
  const seen = new Set<string>([from.id])
  let frontier = outgoing(from.id, bp)
  for (let step = 0; step < 8 && frontier.length > 0; step += 1) {
    const action = frontier.find((node) => node.data.kind === 'action')
    if (action) return action
    const next: BlueprintFlowNode[] = []
    for (const node of frontier) {
      if (seen.has(node.id) || node.data.kind === 'stop') continue
      seen.add(node.id)
      next.push(...outgoing(node.id, bp))
    }
    frontier = next
  }
  return null
}

function statusName(node: BlueprintFlowNode): string {
  const label = node.data.label?.trim()
  if (label && !/^then do$/i.test(label)) return label
  return node.data.status?.trim() || label || 'Next status'
}

function stepSendsEmail(node: BlueprintFlowNode): boolean {
  return getActionIds(node.data).some((id) => {
    if (EMAIL_ACTION_IDS.has(id)) return true
    if (id !== 'notify_carrier') return false
    const channel = node.data.actionConfigs?.[id]?.channel || 'both'
    return channel === 'email' || channel === 'both'
  })
}

/** Calendar days from today until the wake time. Negative means the wait is already due. */
export function calendarDaysUntil(waitUntil: string, now: Date = new Date()): number | null {
  const target = new Date(waitUntil)
  if (!Number.isFinite(target.getTime())) return null
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(target)
  end.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

function clockLabel(target: Date): string {
  return target.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** Date and clock for a wake time. Overdue waits keep the time instead of saying “now”. */
function sendWhenLabel(
  waitUntil: string | null,
  now: Date
): { label: string; overdue: boolean } | null {
  if (!waitUntil) return null
  const target = new Date(waitUntil)
  if (!Number.isFinite(target.getTime())) return null
  const time = clockLabel(target)
  const days = calendarDaysUntil(waitUntil, now)
  const overdue = target.getTime() <= now.getTime()
  let label: string
  if (days === 0) label = `today at ${time}`
  else if (!overdue && days === 1) label = `tomorrow at ${time}`
  else {
    label = `${target.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })} at ${time}`
  }
  return { label, overdue }
}

/** When the step after the current wait actually starts. */
function nextStepRunPhrase(waitUntil: string | null, now: Date): string {
  const when = sendWhenLabel(waitUntil, now)
  if (!when) return 'Runs on the next blueprint check unless the broker replies'
  if (when.overdue) {
    return `Scheduled ${when.label}. Sends on the next blueprint check unless the broker replies`
  }
  return `Runs ${when.label} unless the broker replies`
}

function parkedWhenInsight(node: BlueprintFlowNode): InvoiceMobileInsight {
  const checkId = node.data.checkId
  const title = node.data.label?.trim() || 'Waiting'
  let subtitle = formatWhenCardLine(node.data)
  if (checkId === 'ppw_sent') subtitle = 'Waiting until the packet is sent to the broker'
  else if (checkId === 'paperwork_good') subtitle = 'Waiting until paperwork is confirmed'
  else if (checkId === 'broker_replied' || checkId === 'no_reply') {
    subtitle = 'Waiting on a reply from the broker'
  } else if (checkId === 'on_hold') {
    subtitle =
      node.data.whenMatch === 'no'
        ? 'Waiting until the invoice comes off hold'
        : 'Waiting while the invoice is on hold'
  }
  return {
    id: 'blueprint-chase',
    title,
    subtitle,
    tone: 'info',
    icon: 'clock',
    action: 'none',
  }
}

function card(
  title: string,
  subtitle: string,
  icon: InvoiceMobileInsight['icon'] = 'clock'
): InvoiceMobileInsight {
  return {
    id: 'blueprint-chase',
    title,
    subtitle,
    tone: 'info',
    icon,
    action: 'none',
  }
}

export type BlueprintChaseStepState = 'done' | 'current' | 'upcoming'

export type InvoiceBlueprintChaseStep = {
  id: string
  number: number
  label: string
  detail: string
  state: BlueprintChaseStepState
}

export type InvoiceBlueprintChaseTrack = {
  blueprintName: string
  steps: InvoiceBlueprintChaseStep[]
}

function orderedSteps(bp: SavedBlueprint): BlueprintFlowNode[] {
  const start = bp.nodes.find((node) => node.data.kind === 'trigger') ?? bp.nodes[0]
  if (!start) return []
  const steps: BlueprintFlowNode[] = []
  const seen = new Set<string>()
  let current: BlueprintFlowNode | undefined = start
  while (current && !seen.has(current.id) && steps.length < 24) {
    seen.add(current.id)
    if (
      current.data.kind !== 'trigger' &&
      current.data.kind !== 'branch_true' &&
      current.data.kind !== 'branch_false'
    ) {
      steps.push(current)
    }
    current = outgoing(current.id, bp)[0]
  }
  return steps
}

function waitDetail(node: BlueprintFlowNode): string {
  const wait = lookupWaitUntilById(node.data.waitUntilId)
  if (wait) return formatCatalogCardLine(wait, node.data.days, node.data.waitUnit)
  return node.data.fieldKey?.trim() || node.data.label?.trim() || 'Wait'
}

function actionDetail(node: BlueprintFlowNode): string {
  const status = node.data.status?.trim()
  if (status) return status
  const actionId = getActionIds(node.data)[0]
  const catalog = actionId ? lookupActionById(actionId) : null
  return catalog?.cardLine?.trim() || node.data.label?.trim() || 'Then do'
}

function isNextStep(
  node: BlueprintFlowNode,
  index: number,
  nodes: BlueprintFlowNode[],
  currentIndex: number,
  bp: SavedBlueprint
): boolean {
  if (currentIndex < 0) return false
  const current = nodes[currentIndex]
  if (!current) return false
  const upcoming = nextActionAfter(current, bp)
  return Boolean(upcoming && upcoming.id === node.id && index > currentIndex)
}

function stepRunDetail(
  node: BlueprintFlowNode,
  bp: SavedBlueprint,
  index: number,
  currentIndex: number,
  nodes: BlueprintFlowNode[],
  waitUntil: string | null,
  now: Date
): string {
  if (isNextStep(node, index, nodes, currentIndex, bp)) {
    const about = actionDetail(node)
    return `${about}. ${nextStepRunPhrase(waitUntil, now)}`
  }
  return stepDetail(node, bp, index === currentIndex, waitUntil, now)
}

function stepDetail(
  node: BlueprintFlowNode,
  bp: SavedBlueprint,
  isCurrent: boolean,
  waitUntil: string | null,
  now: Date
): string {
  if (node.data.kind === 'stop') return 'Done'
  if (isWhen(node)) return parkedWhenInsight(node).subtitle
  if (node.data.kind === 'action') return actionDetail(node)
  if (node.data.kind === 'wait') {
    const base = waitDetail(node)
    if (!isCurrent) return base
    const next = nextActionAfter(node, bp)
    const phrase = nextStepRunPhrase(waitUntil, now)
    return next ? `${statusName(next)}. ${phrase}` : `${base}. ${phrase}`
  }
  return node.data.label?.trim() || 'Step'
}

/** Numbered path for the live blueprint. Current step is the one the run is on. */
export function getInvoiceBlueprintChaseTrack(
  invoice: Pick<Invoice, 'id' | 'invoice_number'>,
  now: Date = new Date()
): InvoiceBlueprintChaseTrack | null {
  const run = getStoredPrimaryRunForInvoice(invoice)
  if (!run || (run.status !== 'waiting' && run.status !== 'active' && run.status !== 'paused')) {
    return null
  }
  const bp = getSavedBlueprint(run.blueprintId)
  if (!bp) return null
  const nodes = orderedSteps(bp)
  if (nodes.length === 0) return null
  const currentIndex = run.currentNodeId
    ? nodes.findIndex((node) => node.id === run.currentNodeId)
    : -1
  return {
    blueprintName: run.blueprintName || bp.name,
    steps: nodes.map((node, index) => ({
      id: node.id,
      number: index + 1,
      label: node.data.label?.trim() || statusName(node),
      detail: stepRunDetail(
        node,
        bp,
        index,
        currentIndex,
        nodes,
        run.waitUntil,
        now
      ),
      state: currentIndex < 0 ? 'upcoming' : index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
    })),
  }
}

/** Title stays the chase timing; the status name is called out in front. */
function withNextStatus(
  name: string,
  detail: string,
  icon: InvoiceMobileInsight['icon']
): InvoiceMobileInsight {
  return card('Next status', `${name} · ${detail}`, icon)
}

/** Live blueprint on this invoice, for the admin overview. Null when nothing is enrolled. */
export function getInvoiceBlueprintChaseInsight(
  invoice: Pick<Invoice, 'id' | 'invoice_number'>,
  now: Date = new Date()
): InvoiceMobileInsight | null {
  const run = getStoredPrimaryRunForInvoice(invoice)
  if (!run || (run.status !== 'waiting' && run.status !== 'active' && run.status !== 'paused')) {
    return null
  }

  const bp = getSavedBlueprint(run.blueprintId)
  const node =
    bp && run.currentNodeId
      ? bp.nodes.find((item) => item.id === run.currentNodeId) ?? null
      : null

  if (run.status === 'paused') {
    return card(run.blueprintName, run.currentStep || 'Paused')
  }

  const upcoming = node && bp ? nextActionAfter(node, bp) : null

  if (node && isWhen(node) && !run.waitUntil) {
    if (upcoming?.data.kind === 'action') {
      return withNextStatus(
        statusName(upcoming),
        parkedWhenInsight(node).subtitle,
        stepSendsEmail(upcoming) ? 'mail' : 'clock'
      )
    }
    return parkedWhenInsight(node)
  }

  if (run.status === 'waiting' && node?.data.kind === 'wait') {
    if (upcoming?.data.kind === 'action') {
      const sends = stepSendsEmail(upcoming)
      return withNextStatus(
        statusName(upcoming),
        nextStepRunPhrase(run.waitUntil, now),
        sends ? 'mail' : 'clock'
      )
    }
    return card('Next step', nextStepRunPhrase(run.waitUntil, now), 'mail')
  }

  if (run.status === 'waiting' && run.waitUntil) {
    return card(run.blueprintName || 'Next step', nextStepRunPhrase(run.waitUntil, now), 'mail')
  }

  if (node && isWhen(node)) return parkedWhenInsight(node)

  if (run.status === 'active') {
    return card(run.blueprintName, run.currentStep || 'Running')
  }

  return card(run.blueprintName, run.currentStep || 'Waiting')
}
