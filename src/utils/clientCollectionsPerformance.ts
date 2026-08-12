/**
 * Carrier-facing invoice performance — plain language over admin chase jargon.
 * Built on admin collections rows, then mapped for portal clarity.
 */
import type { AdminCollectionsRow } from './adminCollections'
import type { ChaseQueueStatus } from './collectionsChase'
import type { CollectionsUrgentReason } from './collectionsPolicy'
import { formatDate } from './format'

/** High-level performance a carrier can scan in one glance. */
export type ClientInvoicePerformance =
  | 'needs_attention'
  | 'overdue'
  | 'payment_promised'
  | 'credyx_working'
  | 'with_broker'
  | 'on_track'
  | 'not_sent'

export type ClientCollectionsFocus =
  | 'all'
  | 'needs_attention'
  | 'overdue'
  | 'payment_promised'
  | 'credyx_working'
  | 'on_track'

export type ClientPerformanceRow = AdminCollectionsRow & {
  performance: ClientInvoicePerformance
  /** Short pill label — one status. */
  performanceLabel: string
  performancePillClass: string
  /** One plain sentence: what Credyx / the broker is doing. */
  whatsHappening: string
  /** Optional next cue (pay date, follow-up, etc.). */
  whatsNext: string | null
  /** Workflow step for carriers: Submitted → Verified → Invoiced → Follow-up. */
  progressStep: 'submitted' | 'verified' | 'invoiced' | 'follow_up'
  progressLabel: string
}

const PERF_RANK: Record<ClientInvoicePerformance, number> = {
  needs_attention: 0,
  overdue: 1,
  payment_promised: 2,
  credyx_working: 3,
  with_broker: 4,
  not_sent: 5,
  on_track: 6,
}

export function clientPerformanceRank(p: ClientInvoicePerformance): number {
  return PERF_RANK[p]
}

/** Map admin chase + urgency into one carrier performance state. */
export function resolveClientPerformance(row: AdminCollectionsRow): ClientInvoicePerformance {
  if (!row.ppwSentAt) return 'not_sent'
  if (row.collectionStatus === 'W/P' && row.confirmedPayDate) {
    // Missed Will Pay stays urgent / needs attention
    if (row.urgentReasons.includes('will_pay_missed')) return 'needs_attention'
    return 'payment_promised'
  }
  if (row.isUrgent || row.chaseStatus === 'needs_attention') return 'needs_attention'
  if (row.isOverdue) return 'overdue'
  if (row.chaseStatus !== 'not_due') return 'credyx_working'
  if (row.ppwSentAt) return 'with_broker'
  return 'on_track'
}

export function clientPerformanceLabel(p: ClientInvoicePerformance): string {
  switch (p) {
    case 'needs_attention':
      return 'Needs attention'
    case 'overdue':
      return 'Past due'
    case 'payment_promised':
      return 'Payment promised'
    case 'credyx_working':
      return 'Credyx working'
    case 'with_broker':
      return 'With broker'
    case 'not_sent':
      return 'Not sent yet'
    default:
      return 'On track'
  }
}

export function clientPerformancePillClass(p: ClientInvoicePerformance): string {
  switch (p) {
    case 'needs_attention':
      return 'status-pill status-pill--overdue'
    case 'overdue':
      return 'status-pill status-pill--warn'
    case 'payment_promised':
      return 'status-pill status-pill--approved'
    case 'credyx_working':
      return 'status-pill status-pill--pending'
    case 'with_broker':
      return 'status-pill status-pill--hold'
    case 'not_sent':
      return 'status-pill status-pill--warn'
    default:
      return 'status-pill status-pill--approved'
  }
}

/** Translate urgent/chase signals into one carrier-readable sentence. */
export function describeWhatsHappening(row: AdminCollectionsRow): string {
  const reasons = row.urgentReasons

  if (reasons.includes('will_pay_missed') && row.confirmedPayDate) {
    return `Broker promised payment by ${formatDate(row.confirmedPayDate)} — date passed; Credyx is following up.`
  }
  if (row.collectionStatus === 'W/P' && row.confirmedPayDate) {
    return `Broker confirmed they will pay by ${formatDate(row.confirmedPayDate)}.`
  }
  if (reasons.includes('callback_missed') || row.collectionStatus === 'C/B') {
    const when = row.invoice.collection_date
      ? ` (callback ${formatDate(row.invoice.collection_date)})`
      : ''
    return `Credyx has a call scheduled with the broker${when}.`
  }
  if (!row.ppwSentAt) {
    return 'Invoice is not with the broker yet — Credyx still preparing or verifying paperwork.'
  }
  if (reasons.includes('overdue') || row.isOverdue) {
    return `Past due ${row.daysPastDue}d — Credyx is chasing the broker for payment status.`
  }
  if (reasons.includes('risky_broker')) {
    return 'This broker is on your watch list — Credyx is watching payment closely.'
  }
  if (reasons.includes('stale_contact') || reasons.includes('needs_call')) {
    return 'Credyx is reaching out to the broker for an update.'
  }
  if (reasons.includes('no_ppw')) {
    return 'Paperwork has not been sent to the broker yet.'
  }

  return describeChaseForCarrier(row.chaseStatus, row.lastContact)
}

function describeChaseForCarrier(
  status: ChaseQueueStatus,
  lastContact: string | null
): string {
  switch (status) {
    case 'needs_attention':
      return 'Credyx needs to contact the broker — follow-up in progress.'
    case 'due_for_followup':
      return 'Credyx is due to follow up with the broker.'
    case 'due_for_inquiry':
      return 'Credyx is checking payment status with the broker.'
    case 'awaiting_response':
      return lastContact
        ? `Waiting on the broker’s reply (last contact ${formatDate(lastContact)}).`
        : 'Waiting on the broker’s reply.'
    default:
      return lastContact
        ? `On track — last broker contact ${formatDate(lastContact)}.`
        : 'On track — invoice is with the broker and within terms.'
  }
}

export function describeWhatsNext(row: AdminCollectionsRow): string | null {
  if (row.confirmedPayDate && row.collectionStatus === 'W/P') {
    if (row.urgentReasons.includes('will_pay_missed')) {
      return 'Expect an update after Credyx follows up on the missed date.'
    }
    return `Watch for payment around ${formatDate(row.confirmedPayDate)}.`
  }
  if (row.collectionStatus === 'C/B' && row.invoice.collection_date) {
    return `Next broker call: ${formatDate(row.invoice.collection_date)}.`
  }
  if (!row.ppwSentAt) {
    return 'You’ll see progress once Credyx submits the invoice to the broker.'
  }
  if (row.isOverdue) {
    return 'Credyx continues follow-up until payment is confirmed.'
  }
  if (row.chaseStatus === 'awaiting_response') {
    return 'No action needed from you — Credyx is waiting on the broker.'
  }
  if (row.dueDate) {
    return `Due ${formatDate(row.dueDate)}.`
  }
  return null
}

/** Carrier workflow step (Submitted → Verified → Invoiced → Follow-up). */
export function resolveProgressStep(
  row: AdminCollectionsRow
): ClientPerformanceRow['progressStep'] {
  if (!row.ppwSentAt) {
    // Approved A/R with Credyx = paperwork ready; not yet invoiced to broker
    return row.invoice.status === 'approved' ? 'verified' : 'submitted'
  }
  if (row.chaseStatus !== 'not_due' || row.isOverdue || row.isUrgent) {
    return 'follow_up'
  }
  return 'invoiced'
}

export function progressStepLabel(step: ClientPerformanceRow['progressStep']): string {
  switch (step) {
    case 'submitted':
      return 'Submitted'
    case 'verified':
      return 'Verified'
    case 'invoiced':
      return 'Invoiced'
    case 'follow_up':
      return 'Follow-up'
  }
}

export function progressStepPillClass(step: ClientPerformanceRow['progressStep']): string {
  switch (step) {
    case 'submitted':
      return 'status-pill status-pill--pending'
    case 'verified':
      return 'status-pill status-pill--hold'
    case 'invoiced':
      return 'status-pill status-pill--approved'
    case 'follow_up':
      return 'status-pill status-pill--warn'
  }
}

/** Drop internal-only reasons from display; keep the most useful one for a pill. */
export function primaryCarrierAttentionReason(
  reasons: CollectionsUrgentReason[]
): CollectionsUrgentReason | null {
  const priority: CollectionsUrgentReason[] = [
    'will_pay_missed',
    'callback_missed',
    'overdue',
    'needs_call',
    'stale_contact',
    'risky_broker',
    'no_ppw',
  ]
  for (const r of priority) {
    if (reasons.includes(r)) return r
  }
  return null
}

export function carrierAttentionLabel(reason: CollectionsUrgentReason): string {
  switch (reason) {
    case 'will_pay_missed':
      return 'Promised date passed'
    case 'callback_missed':
      return 'Callback due'
    case 'overdue':
      return 'Past due'
    case 'needs_call':
    case 'stale_contact':
      return 'Update needed'
    case 'risky_broker':
      return 'Watch-list broker'
    case 'no_ppw':
      return 'Not sent yet'
    default:
      return 'Needs attention'
  }
}

export function toClientPerformanceRow(row: AdminCollectionsRow): ClientPerformanceRow {
  const performance = resolveClientPerformance(row)
  const progressStep = resolveProgressStep(row)
  return {
    ...row,
    performance,
    performanceLabel: clientPerformanceLabel(performance),
    performancePillClass: clientPerformancePillClass(performance),
    whatsHappening: describeWhatsHappening(row),
    whatsNext: describeWhatsNext(row),
    progressStep,
    progressLabel: progressStepLabel(progressStep),
  }
}

export function buildClientPerformanceRows(
  adminRows: AdminCollectionsRow[]
): ClientPerformanceRow[] {
  return adminRows.map(toClientPerformanceRow)
}

export function matchesClientCollectionsFocus(
  row: ClientPerformanceRow,
  focus: ClientCollectionsFocus
): boolean {
  if (focus === 'all') return true
  if (focus === 'needs_attention') return row.performance === 'needs_attention'
  if (focus === 'overdue') return row.performance === 'overdue' || row.isOverdue
  if (focus === 'payment_promised') return row.performance === 'payment_promised'
  if (focus === 'credyx_working') {
    return (
      row.performance === 'credyx_working' ||
      row.performance === 'needs_attention' ||
      (row.chaseStatus !== 'not_due' && row.performance !== 'on_track')
    )
  }
  if (focus === 'on_track') {
    return row.performance === 'on_track' || row.performance === 'with_broker'
  }
  return true
}

export function clientCollectionsFocusLabel(focus: ClientCollectionsFocus): string {
  switch (focus) {
    case 'needs_attention':
      return 'Needs attention'
    case 'overdue':
      return 'Past due'
    case 'payment_promised':
      return 'Payment promised'
    case 'credyx_working':
      return 'Credyx working'
    case 'on_track':
      return 'On track'
    default:
      return 'All open'
  }
}
