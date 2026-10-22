/** Start-card filters + compile preview (UI / dry-run only — no live engine). */

import type { Edge } from '@xyflow/react'
import type { BlueprintFlowNode, BlueprintNodeData } from '../../types/blueprintGraph'
import type { BlueprintSubject } from './blueprintCatalog'
import {
  formatCatalogCardLine,
  lookupWaitUntilById,
} from './blueprintCatalog'
import { formatWhenCardLine } from './blueprintWhenMatch'

export type BlueprintTriggerEntry = 'filter' | 'event'

/** Invoice statuses that can enter a chase blueprint (exclude paid / closed). */
export const INVOICE_TRIGGER_STATUS_OPTIONS: {
  id: BlueprintInvoiceTriggerStatus
  label: string
}[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'review', label: 'In review' },
  { id: 'approved', label: 'Approved' },
  { id: 'hold', label: 'On hold' },
  { id: 'write_off_pending', label: 'Write-off pending' },
]

export type BlueprintInvoiceTriggerStatus =
  | 'pending'
  | 'review'
  | 'approved'
  | 'hold'
  | 'write_off_pending'

export type BlueprintInvoiceTriggerFilters = {
  openOnly: boolean
  statuses: BlueprintInvoiceTriggerStatus[]
  /** Empty string = no past-due gate. */
  minDaysPastDue: string
}

export type BlueprintBrokerTriggerFilters = {
  activeOnly: boolean
  /** Empty string = no gate. */
  minDaysNoPayment: string
}

export type BlueprintBatchTriggerFilters = {
  /** When true, only submitted (processed) batches qualify as a gate. */
  submittedOnly: boolean
}

export type BlueprintTriggerFilters = {
  invoices: BlueprintInvoiceTriggerFilters
  brokers: BlueprintBrokerTriggerFilters
  batches: BlueprintBatchTriggerFilters
}

export function defaultInvoiceTriggerFilters(): BlueprintInvoiceTriggerFilters {
  return {
    openOnly: true,
    statuses: ['pending', 'review', 'approved', 'hold'],
    minDaysPastDue: '',
  }
}

export function defaultBrokerTriggerFilters(): BlueprintBrokerTriggerFilters {
  return {
    activeOnly: true,
    minDaysNoPayment: '',
  }
}

export function defaultBatchTriggerFilters(): BlueprintBatchTriggerFilters {
  return {
    submittedOnly: true,
  }
}

export function defaultTriggerFilters(): BlueprintTriggerFilters {
  return {
    invoices: defaultInvoiceTriggerFilters(),
    brokers: defaultBrokerTriggerFilters(),
    batches: defaultBatchTriggerFilters(),
  }
}

export function normalizeTriggerFilters(
  raw?: BlueprintTriggerFilters | null
): BlueprintTriggerFilters {
  const defaults = defaultTriggerFilters()
  if (!raw) return defaults
  const allowed = new Set(INVOICE_TRIGGER_STATUS_OPTIONS.map((o) => o.id))
  const cleaned = (Array.isArray(raw.invoices?.statuses) ? raw.invoices.statuses : [])
    .filter((s): s is BlueprintInvoiceTriggerStatus =>
      allowed.has(s as BlueprintInvoiceTriggerStatus)
    )
  return {
    invoices: {
      openOnly: raw.invoices?.openOnly ?? defaults.invoices.openOnly,
      statuses: cleaned.length > 0 ? cleaned : defaults.invoices.statuses,
      minDaysPastDue: raw.invoices?.minDaysPastDue ?? '',
    },
    brokers: {
      activeOnly: raw.brokers?.activeOnly ?? defaults.brokers.activeOnly,
      minDaysNoPayment: raw.brokers?.minDaysNoPayment ?? '',
    },
    batches: {
      submittedOnly: raw.batches?.submittedOnly ?? defaults.batches.submittedOnly,
    },
  }
}

export function getTriggerEntry(data: BlueprintNodeData): BlueprintTriggerEntry {
  return data.triggerEntry === 'event' ? 'event' : 'filter'
}

function statusLabel(id: BlueprintInvoiceTriggerStatus): string {
  return INVOICE_TRIGGER_STATUS_OPTIONS.find((o) => o.id === id)?.label ?? id
}

/** Plain-English card / dry-run line for a Start node. */
export function formatTriggerCardLine(data: BlueprintNodeData): string {
  const subject: BlueprintSubject =
    data.triggerSubject === 'brokers' || data.triggerSubject === 'batches'
      ? data.triggerSubject
      : 'invoices'
  const entry = getTriggerEntry(data)
  const filters = normalizeTriggerFilters(data.triggerFilters)

  if (entry === 'event') {
    if (subject === 'batches') {
      const gate = formatBatchFilterBits(filters.batches)
      if (gate) return `When an event happens · gate: ${gate}`
      return 'When something happens to a batch'
    }
    const gate =
      subject === 'invoices'
        ? formatInvoiceFilterBits(filters.invoices)
        : formatBrokerFilterBits(filters.brokers)
    if (gate) return `When an event happens · gate: ${gate}`
    return subject === 'brokers'
      ? 'When something happens to a broker'
      : 'When something happens to an invoice'
  }

  if (subject === 'brokers') {
    const bits = formatBrokerFilterBits(filters.brokers)
    return bits ? `Brokers that match · ${bits}` : 'Brokers that match'
  }

  if (subject === 'batches') {
    const bits = formatBatchFilterBits(filters.batches)
    return bits ? `Batches that match · ${bits}` : 'Batches that match'
  }

  const bits = formatInvoiceFilterBits(filters.invoices)
  return bits ? `Invoices that match · ${bits}` : 'Invoices that match'
}

function formatInvoiceFilterBits(f: BlueprintInvoiceTriggerFilters): string {
  const parts: string[] = []
  if (f.openOnly) parts.push('open only')
  if (f.statuses.length > 0 && f.statuses.length < INVOICE_TRIGGER_STATUS_OPTIONS.length) {
    parts.push(f.statuses.map(statusLabel).join(' / '))
  }
  const days = f.minDaysPastDue.trim()
  if (days) parts.push(`${days}+ days past due`)
  return parts.join(' · ')
}

function formatBrokerFilterBits(f: BlueprintBrokerTriggerFilters): string {
  const parts: string[] = []
  if (f.activeOnly) parts.push('active only')
  const days = f.minDaysNoPayment.trim()
  if (days) parts.push(`${days}+ days with no payment`)
  return parts.join(' · ')
}

function formatBatchFilterBits(f: BlueprintBatchTriggerFilters): string {
  const parts: string[] = []
  if (f.submittedOnly) parts.push('submitted only')
  return parts.join(' · ')
}

export type CompiledWaitIndex = {
  nodeId: string
  title: string
  line: string
}

export type CompiledEventIndex = {
  nodeId: string
  title: string
  line: string
  checkId: string
}

export type CompiledBlueprintIndex = {
  waits: CompiledWaitIndex[]
  events: CompiledEventIndex[]
}

/** What a future runner would index from Wait / When cards (UI preview). */
export function compileBlueprintIndex(
  nodes: BlueprintFlowNode[],
  _edges: Edge[]
): CompiledBlueprintIndex {
  const waits: CompiledWaitIndex[] = []
  const events: CompiledEventIndex[] = []

  for (const n of nodes) {
    if (n.data.kind === 'wait') {
      const wait = lookupWaitUntilById(n.data.waitUntilId)
      const line = wait
        ? formatCatalogCardLine(wait, n.data.days, n.data.waitUnit)
        : n.data.fieldKey?.trim() || 'Wait not set'
      waits.push({
        nodeId: n.id,
        title: n.data.label?.trim() || 'Wait until',
        line,
      })
    }
    if (n.data.kind === 'if' || n.data.kind === 'elseif') {
      const checkId = n.data.checkId ?? ''
      events.push({
        nodeId: n.id,
        title: n.data.label?.trim() || 'When',
        line: formatWhenCardLine(n.data),
        checkId,
      })
    }
  }

  return { waits, events }
}

export function triggerSubjectNoun(subject: BlueprintSubject | null | undefined): string {
  if (subject === 'brokers') return 'brokers'
  if (subject === 'batches') return 'batches'
  return 'invoices'
}
