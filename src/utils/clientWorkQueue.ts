/**
 * Client-centric work rollup for admin ops.
 * One row per carrier with open work across holds, disputes, payments, chase, batches, callbacks.
 */
import type { Invoice } from '../types/invoice'
import type { PendingBatch } from '../types/admin'
import { mockBrokers } from '../data/mockBrokers'
import { getAllSharedCalendarEvents } from '../data/sharedCalendarEvents'
import { listPendingPayments } from '../services/clientPaymentService'
import {
  listAwaitingReceiptPayments,
  listReceiptDisputedPayments,
} from '../services/paymentReceiptConfirmationService'
import { listPendingWriteOffs } from '../services/writeOffApprovalService'
import { getClientById } from '../services/clientRegistry'
import { listBlueprintRuns } from '../components/blueprints/blueprintRuns'
import { buildCollectionsChaseQueue } from './collectionsChase'

export type ClientWorkSeverity = 'critical' | 'high' | 'medium' | 'low'

export type ClientWorkCategory =
  | 'holds'
  | 'disputes'
  | 'payments'
  | 'callbacks'
  | 'batches'
  | 'overdue'
  | 'chase'

export type ClientWorkItemKind =
  | 'hold'
  | 'dispute'
  | 'pending_payment'
  | 'awaiting_receipt'
  | 'write_off'
  | 'callback'
  | 'batch'
  | 'overdue'
  | 'chase_attention'
  | 'chase_followup'
  | 'chase_inquiry'
  | 'blueprint_blocked'

export type ClientWorkItem = {
  id: string
  kind: ClientWorkItemKind
  category: ClientWorkCategory
  severity: ClientWorkSeverity
  label: string
  detail: string
  invoiceId?: string
  invoiceNumber?: string
  batchId?: string
  href: string
  activityAt: string
}

export type ClientWorkSummary = {
  clientId: string
  clientName: string
  holds: number
  disputes: number
  payments: number
  callbacks: number
  batches: number
  overdue: number
  chase: number
  totalOpen: number
  severity: ClientWorkSeverity
  nextDueLabel: string
  newestActivityAt: string
  items: ClientWorkItem[]
  links: {
    workQueue: string
    invoices: string
    paymentPosting: string
    collections: string
    calendar: string
    batches: string
  }
}

export type ClientWorkCategoryFilter =
  | 'all'
  | ClientWorkCategory

/** One invoice (or non-invoice bucket) with all related open issues. */
export type ClientWorkInvoiceGroup = {
  key: string
  invoiceId?: string
  invoiceNumber?: string
  batchId?: string
  title: string
  severity: ClientWorkSeverity
  issues: ClientWorkItem[]
}

const SEVERITY_RANK: Record<ClientWorkSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function todayKey(asOf = new Date()): string {
  const y = asOf.getFullYear()
  const m = String(asOf.getMonth() + 1).padStart(2, '0')
  const d = String(asOf.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function worseSeverity(a: ClientWorkSeverity, b: ClientWorkSeverity): ClientWorkSeverity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b
}

function ensureBucket(
  map: Map<string, ClientWorkSummary>,
  clientId: string,
  clientName: string
): ClientWorkSummary {
  let row = map.get(clientId)
  if (!row) {
    const name =
      clientName.trim() ||
      getClientById(clientId)?.name ||
      'Unknown client'
    row = {
      clientId,
      clientName: name,
      holds: 0,
      disputes: 0,
      payments: 0,
      callbacks: 0,
      batches: 0,
      overdue: 0,
      chase: 0,
      totalOpen: 0,
      severity: 'low',
      nextDueLabel: '—',
      newestActivityAt: '',
      items: [],
      links: {
        workQueue: `/admin/work-queue?client=${encodeURIComponent(clientId)}`,
        invoices: `/invoices?client=${encodeURIComponent(clientId)}`,
        paymentPosting: `/payment-posting?client=${encodeURIComponent(clientId)}`,
        collections: `/collections?client=${encodeURIComponent(clientId)}`,
        calendar: `/admin/calendar?client=${encodeURIComponent(clientId)}`,
        batches: `/batches?client=${encodeURIComponent(clientId)}`,
      },
    }
    map.set(clientId, row)
  }
  return row
}

function pushItem(row: ClientWorkSummary, item: ClientWorkItem): void {
  row.items.push(item)
  row.totalOpen += 1
  row.severity = worseSeverity(row.severity, item.severity)

  switch (item.category) {
    case 'holds':
      row.holds += 1
      break
    case 'disputes':
      row.disputes += 1
      break
    case 'payments':
      row.payments += 1
      break
    case 'callbacks':
      row.callbacks += 1
      break
    case 'batches':
      row.batches += 1
      break
    case 'overdue':
      row.overdue += 1
      break
    case 'chase':
      row.chase += 1
      break
  }

  if (!row.newestActivityAt || item.activityAt > row.newestActivityAt) {
    row.newestActivityAt = item.activityAt
  }
}

function resolveClientFromInvoice(
  invoice: Invoice | undefined,
  fallbackId?: string,
  fallbackName?: string
): { id: string; name: string } | null {
  const id = (invoice?.client_id || fallbackId || '').trim()
  if (!id) return null
  const name = (invoice?.client_name || fallbackName || '').trim()
  return { id, name }
}

/**
 * Build one summary per client that has open admin work.
 * Pass live invoice/batch arrays; payment/chase/calendar sources are read internally.
 */
export function buildClientWorkSummaries(input: {
  invoices: Invoice[]
  batches: PendingBatch[]
  asOf?: Date
}): ClientWorkSummary[] {
  const asOf = input.asOf ?? new Date()
  const today = todayKey(asOf)
  const map = new Map<string, ClientWorkSummary>()
  const invoiceById = new Map(input.invoices.map((inv) => [inv.id, inv]))

  // Holds
  for (const inv of input.invoices) {
    if (inv.status !== 'hold' || !inv.client_id) continue
    const row = ensureBucket(map, inv.client_id, inv.client_name)
    pushItem(row, {
      id: `hold-${inv.id}`,
      kind: 'hold',
      category: 'holds',
      severity: 'high',
      label: `Hold · ${inv.invoice_number}`,
      detail: inv.hold_reason || 'Invoice on hold',
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      href: `/invoices?client=${encodeURIComponent(inv.client_id)}&status=hold&invoice=${encodeURIComponent(inv.id)}`,
      activityAt: inv.updated_at || inv.created_at || asOf.toISOString(),
    })
  }

  // Overdue collections (>= 15 days since expected)
  for (const inv of input.invoices) {
    const days = inv.days_since_expected || 0
    if (
      days < 15 ||
      inv.status === 'paid' ||
      inv.status === 'force_closed' ||
      inv.status === 'written_off' ||
      !inv.client_id
    ) {
      continue
    }
    const row = ensureBucket(map, inv.client_id, inv.client_name)
    pushItem(row, {
      id: `overdue-${inv.id}`,
      kind: 'overdue',
      category: 'overdue',
      severity: days >= 60 ? 'critical' : days >= 30 ? 'high' : 'medium',
      label: `Overdue · ${inv.invoice_number}`,
      detail: `${days}d past expected · ${inv.broker_name}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      href: `/collections?client=${encodeURIComponent(inv.client_id)}`,
      activityAt: inv.expected_payment_date || inv.due_date || inv.created_at || asOf.toISOString(),
    })
  }

  // Pending batches
  for (const batch of input.batches) {
    if (
      batch.status !== 'ready_to_post' &&
      batch.status !== 'verification' &&
      batch.status !== 'approval'
    ) {
      continue
    }
    if (!batch.client_id) continue
    const row = ensureBucket(map, batch.client_id, batch.client_name)
    pushItem(row, {
      id: `batch-${batch.id}`,
      kind: 'batch',
      category: 'batches',
      severity: 'medium',
      label: `Batch · ${batch.batch_number}`,
      detail: `${batch.status.replace(/_/g, ' ')} · ${batch.total_invoices} invoices`,
      batchId: batch.id,
      href: `/batches?client=${encodeURIComponent(batch.client_id)}`,
      activityAt: batch.submitted_at || asOf.toISOString(),
    })
  }

  // Payment queues — resolve client via invoice
  const addPaymentItems = (
    payments: ReturnType<typeof listPendingPayments>,
    kind: ClientWorkItemKind,
    category: ClientWorkCategory,
    severity: ClientWorkSeverity,
    labelPrefix: string,
    statusParam: string
  ) => {
    for (const payment of payments) {
      const inv = invoiceById.get(payment.invoice_id)
      const client = resolveClientFromInvoice(inv)
      if (!client) continue
      const row = ensureBucket(map, client.id, client.name)
      pushItem(row, {
        id: `${kind}-${payment.id}`,
        kind,
        category,
        severity,
        label: `${labelPrefix} · ${payment.invoice_number}`,
        detail: `${payment.broker_name} · $${payment.amount.toFixed(2)}`,
        invoiceId: payment.invoice_id,
        invoiceNumber: payment.invoice_number,
        href: `/payment-posting?client=${encodeURIComponent(client.id)}&tab=${statusParam}`,
        activityAt: payment.received_date || payment.payment_date || asOf.toISOString(),
      })
    }
  }

  addPaymentItems(
    listPendingPayments(),
    'pending_payment',
    'payments',
    'high',
    'Payment approval',
    'pending'
  )
  addPaymentItems(
    listAwaitingReceiptPayments(),
    'awaiting_receipt',
    'payments',
    'medium',
    'Awaiting receipt',
    'awaiting'
  )
  addPaymentItems(
    listReceiptDisputedPayments(),
    'dispute',
    'disputes',
    'critical',
    'Receipt dispute',
    'disputes'
  )

  for (const inv of listPendingWriteOffs()) {
    if (!inv.client_id) continue
    const row = ensureBucket(map, inv.client_id, inv.client_name)
    pushItem(row, {
      id: `writeoff-${inv.id}`,
      kind: 'write_off',
      category: 'payments',
      severity: 'high',
      label: `Write-off · ${inv.invoice_number}`,
      detail: 'Write-off approval needed',
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      href: `/payment-posting?client=${encodeURIComponent(inv.client_id)}&tab=writeoffs`,
      activityAt: inv.updated_at || inv.created_at || asOf.toISOString(),
    })
  }

  // Collections chase
  const chase = buildCollectionsChaseQueue(input.invoices, mockBrokers, asOf.getTime())
  for (const item of chase) {
    const inv = item.invoice
    if (!inv.client_id) continue
    const row = ensureBucket(map, inv.client_id, inv.client_name)
    const isAttention = item.status === 'needs_attention'
    const isFollowup = item.status === 'due_for_followup'
    pushItem(row, {
      id: `chase-${inv.id}-${item.status}`,
      kind: isAttention
        ? 'chase_attention'
        : isFollowup
          ? 'chase_followup'
          : 'chase_inquiry',
      category: 'chase',
      severity: isAttention ? 'critical' : isFollowup ? 'high' : 'medium',
      label: `${isAttention ? 'Call needed' : isFollowup ? 'Follow-up' : 'Inquiry'} · ${inv.invoice_number}`,
      detail: `${inv.broker_name} · ${item.daysSincePpw}d since PPW`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      href: `/collections?client=${encodeURIComponent(inv.client_id)}`,
      activityAt: inv.collections_last_inquiry_at || inv.updated_at || asOf.toISOString(),
    })
  }

  // Blueprint parked on a missing email. One row per invoice, from the live run.
  try {
    for (const run of listBlueprintRuns()) {
      if (run.subject !== 'invoice' || run.status !== 'waiting' || !run.subjectId) continue
      const step = run.currentStep.toLowerCase()
      const missingBroker = step.includes('no broker email')
      const missingCarrier = step.includes('no carrier email')
      if (!missingBroker && !missingCarrier) continue
      const inv = input.invoices.find((row) => row.id === run.subjectId)
      if (!inv?.client_id) continue
      const row = ensureBucket(map, inv.client_id, inv.client_name)
      pushItem(row, {
        id: `blueprint-${missingBroker ? 'broker' : 'carrier'}-${inv.id}`,
        kind: 'blueprint_blocked',
        category: 'chase',
        severity: 'high',
        label: missingBroker
          ? `No broker email · ${inv.invoice_number}`
          : `No carrier email · ${inv.invoice_number}`,
        detail: missingBroker
          ? `No broker email · ${inv.broker_name || 'broker'} · ${run.blueprintName} is waiting`
          : `No carrier email · ${run.blueprintName} is waiting`,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        href: `/invoices?invoice=${encodeURIComponent(inv.id)}`,
        activityAt: run.updatedAt || asOf.toISOString(),
      })
    }
  } catch {
    /* blueprint run storage is unavailable outside the browser */
  }

  // Call-backs from invoice collection_status + shared calendar call events due today or overdue
  for (const inv of input.invoices) {
    if (inv.collection_status !== 'C/B' || !inv.client_id) continue
    if (
      inv.status === 'paid' ||
      inv.status === 'force_closed' ||
      inv.status === 'written_off'
    ) {
      continue
    }
    const due = (inv.collection_date || '').slice(0, 10)
    const row = ensureBucket(map, inv.client_id, inv.client_name)
    pushItem(row, {
      id: `callback-inv-${inv.id}`,
      kind: 'callback',
      category: 'callbacks',
      severity: due && due <= today ? 'critical' : 'high',
      label: `Callback · ${inv.invoice_number}`,
      detail: due ? `Scheduled ${due} · ${inv.broker_name}` : inv.broker_name,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      href: `/admin/calendar?client=${encodeURIComponent(inv.client_id)}`,
      activityAt: due || inv.updated_at || asOf.toISOString(),
    })
  }

  for (const event of getAllSharedCalendarEvents()) {
    if (event.type !== 'call' || event.status === 'done') continue
    if (!event.clientId) continue
    // Only surface due today or overdue for the work queue
    if (event.dueDate > today) continue
    const row = ensureBucket(map, event.clientId, event.clientName)
    pushItem(row, {
      id: `callback-cal-${event.id}`,
      kind: 'callback',
      category: 'callbacks',
      severity: 'critical',
      label: event.title || 'Callback',
      detail: event.detail || event.dueLabel || event.dueDate,
      invoiceId: event.invoiceId,
      invoiceNumber: event.invoiceNumber,
      href: `/admin/calendar?client=${encodeURIComponent(event.clientId)}`,
      activityAt: event.dueDate,
    })
  }

  const summaries = [...map.values()].filter((row) => row.totalOpen > 0)

  for (const row of summaries) {
    row.items.sort((a, b) => {
      const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      if (sev !== 0) return sev
      return (b.activityAt || '').localeCompare(a.activityAt || '')
    })
    const top = row.items[0]
    row.nextDueLabel = top?.label ?? '—'
  }

  summaries.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (sev !== 0) return sev
    if (a.totalOpen !== b.totalOpen) return b.totalOpen - a.totalOpen
    return a.clientName.localeCompare(b.clientName, undefined, { sensitivity: 'base' })
  })

  return summaries
}

/** Human label for an issue kind shown under a grouped invoice. */
export function clientWorkIssueLabel(kind: ClientWorkItemKind): string {
  switch (kind) {
    case 'hold':
      return 'Hold'
    case 'dispute':
      return 'Dispute'
    case 'pending_payment':
      return 'Pending payment'
    case 'awaiting_receipt':
      return 'Awaiting receipt'
    case 'write_off':
      return 'Write-off'
    case 'callback':
      return 'Callback'
    case 'batch':
      return 'Batch'
    case 'overdue':
      return 'Overdue'
    case 'chase_attention':
      return 'Chase · needs call'
    case 'chase_followup':
      return 'Chase · follow-up'
    case 'chase_inquiry':
      return 'Chase · inquiry'
    case 'blueprint_blocked':
      return 'Blueprint'
    default:
      return kind
  }
}

/**
 * Group a client's open items by invoice so multiple issues on one invoice
 * appear together (e.g. overdue + dispute under INV-2053).
 */
export function groupClientWorkItemsByInvoice(
  items: ClientWorkItem[]
): ClientWorkInvoiceGroup[] {
  const map = new Map<string, ClientWorkInvoiceGroup>()

  for (const item of items) {
    let key: string
    let title: string
    if (item.invoiceId) {
      key = `inv-${item.invoiceId}`
      title = item.invoiceNumber
        ? `Invoice ${item.invoiceNumber}`
        : `Invoice ${item.invoiceId}`
    } else if (item.batchId) {
      key = `batch-${item.batchId}`
      title = item.label || 'Pending batch'
    } else {
      key = `item-${item.id}`
      title = item.label
    }

    let group = map.get(key)
    if (!group) {
      group = {
        key,
        invoiceId: item.invoiceId,
        invoiceNumber: item.invoiceNumber,
        batchId: item.batchId,
        title,
        severity: item.severity,
        issues: [],
      }
      map.set(key, group)
    }

    group.issues.push(item)
    group.severity = worseSeverity(group.severity, item.severity)
    if (!group.invoiceNumber && item.invoiceNumber) {
      group.invoiceNumber = item.invoiceNumber
      group.title = `Invoice ${item.invoiceNumber}`
    }
  }

  return [...map.values()].sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (sev !== 0) return sev
    return (a.invoiceNumber || a.title).localeCompare(
      b.invoiceNumber || b.title,
      undefined,
      { numeric: true, sensitivity: 'base' }
    )
  })
}

/** Filter summaries by category and optional search text. */
export function filterClientWorkSummaries(
  summaries: ClientWorkSummary[],
  opts: { category?: ClientWorkCategoryFilter; search?: string } = {}
): ClientWorkSummary[] {
  const category = opts.category ?? 'all'
  const q = (opts.search ?? '').trim().toLowerCase()

  return summaries.filter((row) => {
    if (category !== 'all') {
      const count = row[category]
      if (typeof count !== 'number' || count <= 0) return false
    }
    if (!q) return true
    return (
      row.clientName.toLowerCase().includes(q) ||
      row.items.some(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.detail.toLowerCase().includes(q) ||
          (item.invoiceNumber ?? '').toLowerCase().includes(q)
      )
    )
  })
}
