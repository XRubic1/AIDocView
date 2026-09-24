/**
 * Phase 2: pick an invoice blueprint whose Start matches a live event.
 * No pre-assignment required — winner is assigned on enroll.
 */
import type { BlueprintFlowNode, SavedBlueprint } from '../../types/blueprintGraph'
import { blueprintPriority } from '../../types/blueprintGraph'
import type { Invoice } from '../../types/invoice'
import { listSavedBlueprints } from './blueprintStore'
import {
  getTriggerEntry,
  normalizeTriggerFilters,
  type BlueprintTriggerFilters,
} from './blueprintTriggerFilters'
import { normalizeWhenMatch } from './blueprintWhenMatch'

export type BlueprintMatchEvent =
  | 'hold'
  | 'hold_cleared'
  | 'ppw'
  | 'purchased'
  /** Current open-A/R state — assign any Start that matches filters. */
  | 'sync'
  /** Broker just added to the catalog. */
  | 'broker_created'
  /** Confirmed payment posted on the invoice. */
  | 'payment_posted'
  /** Batch Process completed (status → submitted). */
  | 'batch_processed'

export type BlueprintMatch = {
  blueprint: SavedBlueprint
  score: number
  reason: string
}

function getStartNode(nodes: BlueprintFlowNode[]): BlueprintFlowNode | null {
  return nodes.find((n) => n.data.kind === 'trigger') ?? null
}

function isInvoiceBlueprint(bp: SavedBlueprint): boolean {
  const start = getStartNode(bp.nodes)
  if (!start) return false
  const subject = start.data.triggerSubject
  return subject !== 'brokers' && subject !== 'batches'
}

function isBrokerBlueprint(bp: SavedBlueprint): boolean {
  const start = getStartNode(bp.nodes)
  if (!start) return false
  return start.data.triggerSubject === 'brokers'
}

function isBatchBlueprint(bp: SavedBlueprint): boolean {
  const start = getStartNode(bp.nodes)
  if (!start) return false
  return start.data.triggerSubject === 'batches'
}

function hasWhenPaymentPosted(
  nodes: BlueprintFlowNode[],
  match: 'yes' | 'no' | 'any' = 'yes'
): boolean {
  return nodes.some((n) => {
    if (n.data.kind !== 'if' && n.data.kind !== 'elseif') return false
    if (n.data.checkId !== 'payment_posted') return false
    if (match === 'any') return true
    return normalizeWhenMatch(n.data) === match
  })
}

function hasBrokerCreatedWhen(nodes: BlueprintFlowNode[]): boolean {
  return nodes.some(
    (n) =>
      (n.data.kind === 'if' || n.data.kind === 'elseif') &&
      n.data.checkId === 'broker_created'
  )
}

function hasBatchProcessedWhen(nodes: BlueprintFlowNode[]): boolean {
  return nodes.some(
    (n) =>
      (n.data.kind === 'if' || n.data.kind === 'elseif') &&
      n.data.checkId === 'batch_processed'
  )
}

function holdOnly(filters: BlueprintTriggerFilters): boolean {
  const s = filters.invoices.statuses
  return s.length === 1 && s[0] === 'hold'
}

function hasWhenOnHold(
  nodes: BlueprintFlowNode[],
  match: 'yes' | 'no' | 'any' = 'yes'
): boolean {
  return nodes.some((n) => {
    if (n.data.kind !== 'if' && n.data.kind !== 'elseif') return false
    if (n.data.checkId !== 'on_hold') return false
    if (match === 'any') return true
    return normalizeWhenMatch(n.data) === match
  })
}

function invoicePassesGate(invoice: Invoice, filters: BlueprintTriggerFilters): boolean {
  const { openOnly, statuses, minDaysPastDue } = filters.invoices
  const terminal = new Set([
    'paid',
    'rejected',
    'written_off',
    'write_off_pending',
    'force_closed',
  ])
  if (openOnly && terminal.has(invoice.status)) return false

  const status = invoice.status as string
  if (statuses.length > 0 && !statuses.includes(status as never)) {
    // Event just happened — allow hold event even if Start lists hold and invoice is hold
    if (!(status === 'hold' && statuses.includes('hold'))) return false
  }

  const minPast = Number(minDaysPastDue)
  if (Number.isFinite(minPast) && minPast > 0 && invoice.due_date) {
    const due = new Date(invoice.due_date).getTime()
    const daysPast = Math.floor((Date.now() - due) / 86_400_000)
    if (daysPast < minPast) return false
  }
  return true
}

/**
 * Score how well a saved invoice blueprint fits this event.
 * Higher = more specific / preferred. 0 = no match.
 */
export function scoreBlueprintForEvent(
  bp: SavedBlueprint,
  event: BlueprintMatchEvent,
  invoice: Invoice
): BlueprintMatch | null {
  if (event === 'broker_created') {
    if (!isBrokerBlueprint(bp)) return null
    const start = getStartNode(bp.nodes)
    if (!start) return null
    const entry = getTriggerEntry(start.data)
    let score = 50
    if (entry === 'event') score += 30
    if (hasBrokerCreatedWhen(bp.nodes)) score += 25
    // Start with no When still matches create if entry is event
    if (entry !== 'event' && !hasBrokerCreatedWhen(bp.nodes)) return null
    return {
      blueprint: bp,
      score,
      reason: hasBrokerCreatedWhen(bp.nodes)
        ? 'When · Broker created'
        : 'Start · broker create event',
    }
  }

  if (event === 'batch_processed') {
    if (!isBatchBlueprint(bp)) return null
    const start = getStartNode(bp.nodes)
    if (!start) return null
    const entry = getTriggerEntry(start.data)
    let score = 50
    if (entry === 'event') score += 30
    if (hasBatchProcessedWhen(bp.nodes)) score += 25
    if (entry !== 'event' && !hasBatchProcessedWhen(bp.nodes)) return null
    return {
      blueprint: bp,
      score,
      reason: hasBatchProcessedWhen(bp.nodes)
        ? 'When · Batch processed'
        : 'Start · batch process event',
    }
  }

  if (event === 'payment_posted') {
    if (!isInvoiceBlueprint(bp)) return null
    if (!hasWhenPaymentPosted(bp.nodes, 'yes')) return null
    const start = getStartNode(bp.nodes)
    if (!start) return null
    let score = 80
    if (getTriggerEntry(start.data) === 'event') score += 10
    return {
      blueprint: bp,
      score,
      reason: 'When · Payment posted',
    }
  }

  if (!isInvoiceBlueprint(bp)) return null
  const start = getStartNode(bp.nodes)
  if (!start) return null
  const filters = normalizeTriggerFilters(start.data.triggerFilters)
  const entry = getTriggerEntry(start.data)

  // Soft gate: invoice should still be in Start statuses (with event nuance below)
  const statuses = filters.invoices.statuses
  const includesHold = statuses.includes('hold')
  const includesOpen =
    statuses.includes('pending') ||
    statuses.includes('review') ||
    statuses.includes('approved')

  if (event === 'hold') {
    // “Removed from hold” graphs: enroll on place-hold and park at When until clear
    if (hasWhenOnHold(bp.nodes, 'no') && !hasWhenOnHold(bp.nodes, 'yes')) {
      const terminal = new Set([
        'paid',
        'rejected',
        'written_off',
        'write_off_pending',
        'force_closed',
      ])
      if (filters.invoices.openOnly && terminal.has(invoice.status)) return null
      let score = 85
      if (entry === 'event') score += 10
      return {
        blueprint: bp,
        score,
        reason: 'When · Removed from hold (park until clear)',
      }
    }
    // Must be hold-specific — not a broad aging chase that merely lists “hold” in statuses
    if (!holdOnly(filters) && !hasWhenOnHold(bp.nodes, 'yes')) {
      return null
    }
    const terminal = new Set([
      'paid',
      'rejected',
      'written_off',
      'write_off_pending',
      'force_closed',
    ])
    if (filters.invoices.openOnly && terminal.has(invoice.status)) return null
    let score = holdOnly(filters) ? 100 : 70
    if (hasWhenOnHold(bp.nodes, 'yes')) score += 25
    if (entry === 'event') score += 5
    if (filters.invoices.minDaysPastDue) score -= 25
    return {
      blueprint: bp,
      score,
      reason: holdOnly(filters)
        ? 'hold-only Start'
        : 'When · On hold',
    }
  }

  if (event === 'hold_cleared') {
    // Needs When · Removed from hold (on_hold + Match false)
    if (!hasWhenOnHold(bp.nodes, 'no')) return null
    const terminal = new Set([
      'paid',
      'rejected',
      'written_off',
      'write_off_pending',
      'force_closed',
    ])
    if (filters.invoices.openOnly && terminal.has(invoice.status)) return null
    let score = 80
    if (entry === 'event') score += 10
    if (holdOnly(filters)) score += 5
    return {
      blueprint: bp,
      score,
      reason: 'When · Removed from hold',
    }
  }

  if (event === 'ppw') {
    // Hold-track blueprints are for hold, not PPW
    if (holdOnly(filters)) return null
    if (hasWhenOnHold(bp.nodes, 'yes') && !includesOpen) return null
    if (!includesOpen && statuses.length > 0 && !includesHold) {
      // weird filter set — skip
      return null
    }
    if (statuses.length > 0 && !includesOpen && includesHold) return null
    let score = 60
    if (includesOpen && !includesHold) score = 90
    if (entry === 'event') score += 5
    if (!invoicePassesGate(invoice, filters)) {
      // PPW often on approved — loosen if Start has approved/pending
      if (!includesOpen) return null
    }
    return {
      blueprint: bp,
      score,
      reason: 'paperwork / open-A/R Start',
    }
  }

  if (event === 'sync') {
    // Realtime assign: Start filters must pass for the invoice as it is now
    if (!invoicePassesGate(invoice, filters)) return null
    if (holdOnly(filters) && invoice.status !== 'hold') return null
    // Removed-from-hold-only graphs: assign while on hold (park); release uses hold_cleared
    if (hasWhenOnHold(bp.nodes, 'no') && !hasWhenOnHold(bp.nodes, 'yes')) {
      if (invoice.status !== 'hold') return null
      let score = 70
      if (entry === 'event') score += 10
      return {
        blueprint: bp,
        score,
        reason: 'When · Removed from hold (park until clear)',
      }
    }
    if (invoice.status === 'hold' && (holdOnly(filters) || hasWhenOnHold(bp.nodes, 'yes'))) {
      let score = holdOnly(filters) ? 95 : 80
      if (hasWhenOnHold(bp.nodes, 'yes')) score += 10
      return { blueprint: bp, score, reason: 'hold track matches sync' }
    }
    if (holdOnly(filters)) return null
    let score = 45
    if (statuses.length === 0 || statuses.includes(invoice.status as never)) score += 25
    if (entry === 'filter') score += 15
    if (filters.invoices.minDaysPastDue) score += 10
    if (score < 40) return null
    return {
      blueprint: bp,
      score,
      reason: 'Start filters match open invoice',
    }
  }

  // purchased — new invoice entered Credyx
  if (!includesOpen && !statuses.includes('pending')) {
    // Broad default filters include pending — if only hold, not purchase
    if (holdOnly(filters)) return null
  }
  if (holdOnly(filters)) return null
  if (!statuses.includes('pending') && !statuses.includes('review') && statuses.length > 0) {
    // Must allow newly created pending/review invoices
    if (!includesOpen) return null
  }
  let score = 40
  if (statuses.includes('pending')) score += 30
  if (entry === 'filter') score += 10
  if (filters.invoices.minDaysPastDue) score -= 20 // past-due chase not for day-0 purchase
  if (score < 30) return null
  if (!invoicePassesGate(invoice, filters)) {
    // New invoices are often pending
    if (invoice.status !== 'pending' && invoice.status !== 'review') return null
  }
  return {
    blueprint: bp,
    score,
    reason: 'Start matches new / open invoice',
  }
}

/** All matches: priority (high first), then fit score, then recently updated. */
export function findMatchingBlueprints(
  event: BlueprintMatchEvent,
  invoice: Invoice
): BlueprintMatch[] {
  const matches: BlueprintMatch[] = []
  for (const bp of listSavedBlueprints()) {
    const m = scoreBlueprintForEvent(bp, event, invoice)
    if (m && m.score > 0) matches.push(m)
  }
  return matches.sort((a, b) => {
    const p = blueprintPriority(b.blueprint) - blueprintPriority(a.blueprint)
    if (p !== 0) return p
    if (b.score !== a.score) return b.score - a.score
    return b.blueprint.updatedAt.localeCompare(a.blueprint.updatedAt)
  })
}

export function findBestMatchingBlueprint(
  event: BlueprintMatchEvent,
  invoice: Invoice
): BlueprintMatch | null {
  return findMatchingBlueprints(event, invoice)[0] ?? null
}

/** Broker create / broker-subject match (no invoice required). */
export function findBestMatchingBrokerBlueprint(
  event: 'broker_created'
): BlueprintMatch | null {
  const matches: BlueprintMatch[] = []
  // Dummy invoice unused for broker_created scoring
  const stub = { status: 'approved' } as Invoice
  for (const bp of listSavedBlueprints()) {
    const m = scoreBlueprintForEvent(bp, event, stub)
    if (m && m.score > 0) matches.push(m)
  }
  matches.sort((a, b) => {
    const p = blueprintPriority(b.blueprint) - blueprintPriority(a.blueprint)
    if (p !== 0) return p
    if (b.score !== a.score) return b.score - a.score
    return b.blueprint.updatedAt.localeCompare(a.blueprint.updatedAt)
  })
  return matches[0] ?? null
}

/** Batch process / batch-subject match (no invoice required). */
export function findBestMatchingBatchBlueprint(
  event: 'batch_processed'
): BlueprintMatch | null {
  const matches: BlueprintMatch[] = []
  const stub = { status: 'approved' } as Invoice
  for (const bp of listSavedBlueprints()) {
    const m = scoreBlueprintForEvent(bp, event, stub)
    if (m && m.score > 0) matches.push(m)
  }
  matches.sort((a, b) => {
    const p = blueprintPriority(b.blueprint) - blueprintPriority(a.blueprint)
    if (p !== 0) return p
    if (b.score !== a.score) return b.score - a.score
    return b.blueprint.updatedAt.localeCompare(a.blueprint.updatedAt)
  })
  return matches[0] ?? null
}
