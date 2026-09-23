/**
 * Blueprint run activity — UI preview of enrolled invoices / brokers.
 * Demo seed only until a live runner writes real rows.
 */

export type BlueprintRunStatus =
  | 'waiting'
  | 'active'
  | 'paused'
  | 'completed'
  | 'stopped'

export type BlueprintRunSubject = 'invoice' | 'broker'

export interface BlueprintRunRow {
  id: string
  /** Invoice or broker display subject. */
  subject: BlueprintRunSubject
  /** Real invoice.id / broker.id when known (preferred match). */
  subjectId?: string
  /** Human label — invoice # or broker name (demo data). */
  subjectLabel: string
  /** Optional carrier / client name for context. */
  clientLabel: string
  blueprintId: string
  blueprintName: string
  status: BlueprintRunStatus
  /** Plain-English current step (e.g. Wait until · 5 days). */
  currentStep: string
  /** Graph node id when known (preferred for “what’s next”). */
  currentNodeId?: string
  /** ISO wake time when status is waiting; null otherwise. */
  waitUntil: string | null
  startedAt: string
  updatedAt: string
}

export const BLUEPRINT_RUN_STATUS_LABELS: Record<BlueprintRunStatus, string> = {
  waiting: 'Waiting',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  stopped: 'Stopped',
}

const STORAGE_KEY = 'credyx.blueprint_runs.v1'
const SEED_FLAG = 'credyx.blueprint_runs.seeded.v1'

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function daysAgo(days: number, hour = 14): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

/** Demo enrollments so Activity has something to show before the live engine. */
export function seedBlueprintRunsDemo(): BlueprintRunRow[] {
  return [
    {
      id: 'run-hold-wait-1',
      subject: 'invoice',
      subjectLabel: 'INV-10482',
      clientLabel: 'Summit Hauling LLC',
      blueprintId: 'bp-hold-reminder',
      blueprintName: 'Hold reminder to carrier',
      status: 'waiting',
      currentStep: 'Wait until · 5 days from this step',
      waitUntil: daysFromNow(3),
      startedAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
    {
      id: 'run-hold-wait-2',
      subject: 'invoice',
      subjectLabel: 'INV-10501',
      clientLabel: 'Ridge Line Transport',
      blueprintId: 'bp-hold-reminder',
      blueprintName: 'Hold reminder to carrier',
      status: 'waiting',
      currentStep: 'Wait until · 5 days from this step',
      waitUntil: daysFromNow(1),
      startedAt: daysAgo(4),
      updatedAt: daysAgo(4),
    },
    {
      id: 'run-chase-active',
      subject: 'invoice',
      subjectLabel: 'INV-10390',
      clientLabel: 'Prairie Freight Co',
      blueprintId: 'bp-risk-ladder',
      blueprintName: 'Risk ladder chase',
      status: 'active',
      currentStep: 'Then do · Notify the carrier',
      waitUntil: null,
      startedAt: daysAgo(12),
      updatedAt: daysAgo(0, 10),
    },
    {
      id: 'run-broker-wait',
      subject: 'broker',
      subjectLabel: 'Horizon Logistics',
      clientLabel: 'Summit Hauling LLC',
      blueprintId: 'bp-broker-slow-pay',
      blueprintName: 'Slow-payor follow-up',
      status: 'waiting',
      currentStep: 'Wait until · Net terms + 15 late days',
      waitUntil: daysFromNow(6),
      startedAt: daysAgo(20),
      updatedAt: daysAgo(1),
    },
    {
      id: 'run-paused-hold',
      subject: 'invoice',
      subjectLabel: 'INV-10211',
      clientLabel: 'Blue Mesa Carriers',
      blueprintId: 'bp-hold-reminder',
      blueprintName: 'Hold reminder to carrier',
      status: 'paused',
      currentStep: 'Paused · claim open on account',
      waitUntil: null,
      startedAt: daysAgo(18),
      updatedAt: daysAgo(3),
    },
    {
      id: 'run-done-1',
      subject: 'invoice',
      subjectLabel: 'INV-10155',
      clientLabel: 'Prairie Freight Co',
      blueprintId: 'bp-hold-reminder',
      blueprintName: 'Hold reminder to carrier',
      status: 'completed',
      currentStep: 'Done · carrier notified',
      waitUntil: null,
      startedAt: daysAgo(25),
      updatedAt: daysAgo(8),
    },
    {
      id: 'run-stopped-paid',
      subject: 'invoice',
      subjectLabel: 'INV-10088',
      clientLabel: 'Ridge Line Transport',
      blueprintId: 'bp-risk-ladder',
      blueprintName: 'Risk ladder chase',
      status: 'stopped',
      currentStep: 'Stopped · invoice paid',
      waitUntil: null,
      startedAt: daysAgo(40),
      updatedAt: daysAgo(15),
    },
  ]
}

function readAll(): BlueprintRunRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is BlueprintRunRow =>
        !!r &&
        typeof r === 'object' &&
        typeof (r as BlueprintRunRow).id === 'string' &&
        typeof (r as BlueprintRunRow).blueprintName === 'string' &&
        typeof (r as BlueprintRunRow).status === 'string'
    )
  } catch {
    return []
  }
}

function writeAll(list: BlueprintRunRow[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function ensureBlueprintRunsSeeded(): void {
  if (localStorage.getItem(SEED_FLAG) === '1' && readAll().length > 0) return
  writeAll(seedBlueprintRunsDemo())
  localStorage.setItem(SEED_FLAG, '1')
}

export function listBlueprintRuns(): BlueprintRunRow[] {
  ensureBlueprintRunsSeeded()
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function resetBlueprintRunsDemo(): BlueprintRunRow[] {
  const next = seedBlueprintRunsDemo()
  writeAll(next)
  localStorage.setItem(SEED_FLAG, '1')
  return next
}

export type BlueprintRunStatusFilter = 'all' | BlueprintRunStatus

export function filterBlueprintRuns(
  rows: BlueprintRunRow[],
  status: BlueprintRunStatusFilter,
  subject: 'all' | BlueprintRunSubject
): BlueprintRunRow[] {
  return rows.filter((r) => {
    if (status !== 'all' && r.status !== status) return false
    if (subject !== 'all' && r.subject !== subject) return false
    return true
  })
}

export function countRunsByStatus(
  rows: BlueprintRunRow[]
): Record<BlueprintRunStatusFilter, number> {
  const counts: Record<BlueprintRunStatusFilter, number> = {
    all: rows.length,
    waiting: 0,
    active: 0,
    paused: 0,
    completed: 0,
    stopped: 0,
  }
  for (const r of rows) counts[r.status] += 1
  return counts
}

function normLabel(s: string): string {
  return s.trim().toLowerCase()
}

/** Active enrollments for an invoice (by id or invoice number). */
export function findRunsForInvoice(invoice: {
  id: string
  invoice_number: string
}): BlueprintRunRow[] {
  const num = normLabel(invoice.invoice_number)
  return listBlueprintRuns().filter((r) => {
    if (r.subject !== 'invoice') return false
    if (r.subjectId && r.subjectId === invoice.id) return true
    return normLabel(r.subjectLabel) === num
  })
}

/** Latest non-terminal run preferred; else most recently updated. */
export function getPrimaryRunForInvoice(invoice: {
  id: string
  invoice_number: string
}): BlueprintRunRow | null {
  const runs = findRunsForInvoice(invoice)
  if (runs.length === 0) return null
  const live = runs.find((r) =>
    r.status === 'waiting' || r.status === 'active' || r.status === 'paused'
  )
  return live ?? runs[0] ?? null
}

export function upsertBlueprintRun(row: BlueprintRunRow): BlueprintRunRow {
  ensureBlueprintRunsSeeded()
  const next = { ...row, updatedAt: new Date().toISOString() }
  const list = readAll().filter((r) => r.id !== next.id)
  writeAll([next, ...list])
  try {
    window.dispatchEvent(
      new CustomEvent('credyx:blueprint-runs-changed', {
        detail: { runId: next.id, subjectId: next.subjectId },
      })
    )
  } catch {
    /* ignore */
  }
  return next
}

/** Enroll an invoice on a Wait (or start) step — used by the live runner. */
export function startInvoiceRun(input: {
  invoiceId: string
  invoiceNumber: string
  clientLabel: string
  blueprintId: string
  blueprintName: string
  waitDays?: number
  currentNodeId?: string
  currentStep?: string
  status?: BlueprintRunStatus
  waitUntil?: string | null
}): BlueprintRunRow {
  const waitDays = input.waitDays ?? 5
  const now = new Date().toISOString()
  const status = input.status ?? 'waiting'
  return upsertBlueprintRun({
    id: `run-inv-${input.invoiceId}`,
    subject: 'invoice',
    subjectId: input.invoiceId,
    subjectLabel: input.invoiceNumber,
    clientLabel: input.clientLabel,
    blueprintId: input.blueprintId,
    blueprintName: input.blueprintName,
    status,
    currentStep:
      input.currentStep ?? `Wait until · ${waitDays} days from this step`,
    currentNodeId: input.currentNodeId,
    waitUntil:
      input.waitUntil !== undefined
        ? input.waitUntil
        : status === 'waiting'
          ? daysFromNow(waitDays)
          : null,
    startedAt: now,
    updatedAt: now,
  })
}

/** @deprecated Use startInvoiceRun */
export function startDemoInvoiceRun(
  input: Parameters<typeof startInvoiceRun>[0]
): BlueprintRunRow {
  return startInvoiceRun(input)
}

export const BLUEPRINT_RUNS_CHANGED_EVENT = 'credyx:blueprint-runs-changed'
