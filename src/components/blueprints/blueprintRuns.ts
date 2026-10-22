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

export type BlueprintRunSubject = 'invoice' | 'broker' | 'batch'

export type BlueprintRunHistoryKind =
  | 'enrolled'
  | 'wait'
  | 'when'
  | 'action'
  | 'advance'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'note'

/** One step that actually ran (or parked) on an enrollment. */
export type BlueprintRunHistoryEvent = {
  id: string
  at: string
  /** Monotonic order within a run (preferred over timestamp for display). */
  seq?: number
  kind: BlueprintRunHistoryKind
  title: string
  detail?: string
  /** Blueprint name at the time of the event (survives later switches). */
  blueprintName?: string
  blueprintId?: string
  /** Graph node that finished when this event was logged (drives "completed at" on steps). */
  completedNodeId?: string
  /** Then-do card this event belongs to. */
  stepNodeId?: string
  /** Then-do results: an email actually went out / a note was written. */
  emailSent?: boolean
  noteAdded?: boolean
}

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
  /** Chronological log of everything that ran on this enrollment. */
  history?: BlueprintRunHistoryEvent[]
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

/** Replace runs from Supabase hydrate; marks seeded so demo seed does not reappear. */
function lastEventAt(row: BlueprintRunRow | undefined): string {
  const h = row?.history ?? []
  return h.length ? h[h.length - 1].at : ''
}

export function replaceBlueprintRunsFromHydrate(rows: BlueprintRunRow[]): void {
  // Keep whichever copy saw the latest step: a DB row can land before this
  // browser's newest save does, and must not roll the run back.
  const local = new Map(readAll().map((r) => [r.id, r]))
  const merged = rows.map((incoming) => {
    const mine = local.get(incoming.id)
    return mine && lastEventAt(mine) > lastEventAt(incoming) ? mine : incoming
  })
  const incomingIds = new Set(rows.map((r) => r.id))
  const freshCutoff = Date.now() - 2 * 60 * 1000
  for (const mine of local.values()) {
    // Created here moments ago and not saved yet — keep it.
    if (!incomingIds.has(mine.id) && new Date(mine.updatedAt).getTime() > freshCutoff) {
      merged.push(mine)
    }
  }
  writeAll(merged)
  localStorage.setItem(SEED_FLAG, '1')
  try {
    window.dispatchEvent(new CustomEvent('credyx:blueprint-runs-changed'))
  } catch {
    /* ignore */
  }
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
  void import('../../services/supabase/blueprintPersist').then(async (m) => {
    for (const row of next) {
      await m.persistBlueprintRun(row)
    }
  })
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

/** Active enrollments for an invoice (by id; label match only when no subjectId). */
export function findRunsForInvoice(invoice: {
  id: string
  invoice_number: string
}): BlueprintRunRow[] {
  const all = listBlueprintRuns().filter((r) => r.subject === 'invoice')
  const byId = all.filter((r) => r.subjectId && r.subjectId === invoice.id)
  if (byId.length > 0) return byId
  const num = normLabel(invoice.invoice_number)
  // Demo Activity rows have no subjectId — only match those by label
  return all.filter((r) => !r.subjectId && normLabel(r.subjectLabel) === num)
}

/** Manual action log — not an enrollment the Blueprints tab should treat as current. */
function isManualActionLogRun(run: BlueprintRunRow): boolean {
  return run.id.startsWith('run-inv-actions-')
}

/** Runs already saved. Does not write the demo Activity seed. */
export function listStoredBlueprintRuns(): BlueprintRunRow[] {
  return readAll()
}

/**
 * Same pick as getPrimaryRunForInvoice, but only rows already stored.
 * Used by the invoice overview so opening an invoice does not seed demo runs.
 */
export function getStoredPrimaryRunForInvoice(invoice: {
  id: string
  invoice_number: string
}): BlueprintRunRow | null {
  const all = listStoredBlueprintRuns().filter(
    (r) => r.subject === 'invoice' && !isManualActionLogRun(r)
  )
  const byId = all.filter((r) => r.subjectId && r.subjectId === invoice.id)
  const runs =
    byId.length > 0
      ? byId
      : all.filter(
          (r) => !r.subjectId && normLabel(r.subjectLabel) === normLabel(invoice.invoice_number)
        )
  if (runs.length === 0) return null
  return pickPrimaryRun(runs)
}

/**
 * Running (waiting/active) beats paused — a chase paused for a hold sits beside
 * the hold run. Then paused, then the most recently updated.
 */
function pickPrimaryRun(runs: BlueprintRunRow[]): BlueprintRunRow | null {
  return (
    runs.find((r) => r.status === 'waiting' || r.status === 'active') ??
    runs.find((r) => r.status === 'paused') ??
    runs[0] ??
    null
  )
}

/** Latest non-terminal run preferred; else most recently updated. */
export function getPrimaryRunForInvoice(invoice: {
  id: string
  invoice_number: string
}): BlueprintRunRow | null {
  const runs = findRunsForInvoice(invoice).filter((r) => !isManualActionLogRun(r))
  if (runs.length === 0) return null
  return pickPrimaryRun(runs)
}

function newHistoryEventId(): string {
  return `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function inferHistoryKind(
  prev: BlueprintRunRow | undefined,
  next: BlueprintRunRow
): BlueprintRunHistoryKind {
  if (!prev) return 'enrolled'
  if (next.status === 'waiting') {
    return /when/i.test(next.currentStep) ? 'when' : 'wait'
  }
  if (next.status === 'completed') return 'completed'
  if (next.status === 'stopped') return 'stopped'
  if (next.status === 'paused') return 'paused'
  if (/then do|email|notify|packet|follow/i.test(next.currentStep)) return 'action'
  if (/when/i.test(next.currentStep)) return 'when'
  return 'advance'
}

export type UpsertBlueprintRunOpts = {
  /** Explicit history line (preferred when the runner has richer detail). */
  historyEvent?: Omit<BlueprintRunHistoryEvent, 'id' | 'at'>
  /** Extra lines after the primary event (e.g. each Then-do result). */
  extraHistory?: Array<Omit<BlueprintRunHistoryEvent, 'id' | 'at'>>
  /** Skip auto history when nothing meaningful changed. */
  silent?: boolean
}

export function upsertBlueprintRun(
  row: BlueprintRunRow,
  opts?: UpsertBlueprintRunOpts
): BlueprintRunRow {
  ensureBlueprintRunsSeeded()
  const prev = readAll().find((r) => r.id === row.id)
  const at = new Date().toISOString()
  const history = [...(row.history ?? prev?.history ?? [])]

  if (!opts?.silent) {
    const events: Array<Omit<BlueprintRunHistoryEvent, 'id' | 'at'>> = []
    if (opts?.historyEvent) {
      events.push(opts.historyEvent)
    } else if (
      !prev ||
      prev.currentStep !== row.currentStep ||
      prev.status !== row.status
    ) {
      events.push({
        kind: inferHistoryKind(prev, row),
        title: row.currentStep || BLUEPRINT_RUN_STATUS_LABELS[row.status],
        detail:
          row.status === 'waiting' && row.waitUntil
            ? `Wake ${new Date(row.waitUntil).toLocaleString()}`
            : undefined,
      })
    }
    if (opts?.extraHistory?.length) events.push(...opts.extraHistory)

    // Stamp which step just finished so the invoice can show when it was completed.
    const finishedNode =
      prev?.currentNodeId && prev.currentNodeId !== row.currentNodeId
        ? prev.currentNodeId
        : row.status === 'completed' && prev?.status !== 'completed'
          ? row.currentNodeId
          : undefined
    if (finishedNode && events.length === 0) {
      events.push({
        kind: inferHistoryKind(prev, row),
        title: row.currentStep || BLUEPRINT_RUN_STATUS_LABELS[row.status],
      })
    }
    if (finishedNode && events.length > 0) {
      ;(events[0] as { completedNodeId?: string }).completedNodeId = finishedNode
    }
    // Stable order: wall clock + monotonic seq (avoids Done sorting before Then-do)
    let seq = 0
    const baseSeq =
      history.reduce((max, ev) => Math.max(max, ev.seq ?? 0), 0) + 1
    for (const ev of events) {
      history.push({
        id: newHistoryEventId(),
        at: new Date(Date.parse(at) + seq).toISOString(),
        seq: baseSeq + seq,
        kind: ev.kind,
        title: ev.title,
        detail: ev.detail,
        blueprintName: ev.blueprintName ?? row.blueprintName,
        blueprintId: ev.blueprintId ?? row.blueprintId,
        completedNodeId: ev.completedNodeId,
        stepNodeId: ev.stepNodeId,
        emailSent: ev.emailSent,
        noteAdded: ev.noteAdded,
      })
      seq += 1
    }
  }

  // Cap so localStorage / jsonb stays bounded
  const capped =
    history.length > 200 ? history.slice(history.length - 200) : history

  const next: BlueprintRunRow = {
    ...row,
    history: capped,
    updatedAt: at,
  }
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
  void import('../../services/supabase/blueprintPersist').then((m) =>
    m.persistBlueprintRun(next)
  )
  return next
}

/** Collapse noisy duplicate lines (same step within 3s from double enroll). */
function dedupeHistoryEvents(
  events: Array<BlueprintRunHistoryEvent & { blueprintName: string; runId: string }>
): Array<BlueprintRunHistoryEvent & { blueprintName: string; runId: string }> {
  const out: Array<BlueprintRunHistoryEvent & { blueprintName: string; runId: string }> =
    []
  for (const ev of events) {
    const prev = out[out.length - 1]
    if (
      prev &&
      prev.kind === ev.kind &&
      prev.title === ev.title &&
      (prev.detail || '') === (ev.detail || '') &&
      prev.blueprintName === ev.blueprintName &&
      Math.abs(Date.parse(ev.at) - Date.parse(prev.at)) < 3000
    ) {
      continue
    }
    // Drop per-task "Ran · …" lines when the previous Then-do already lists them
    if (
      prev &&
      prev.kind === 'action' &&
      ev.kind === 'action' &&
      /^Ran · /i.test(ev.title) &&
      Math.abs(Date.parse(ev.at) - Date.parse(prev.at)) < 3000
    ) {
      continue
    }
    out.push(ev)
  }
  return out
}

/** All history events for an invoice (oldest first), across matching runs. */
export function listInvoiceBlueprintHistory(invoice: {
  id: string
  invoice_number: string
}): Array<BlueprintRunHistoryEvent & { blueprintName: string; runId: string }> {
  const runs = findRunsForInvoice(invoice)
  const out: Array<
    BlueprintRunHistoryEvent & { blueprintName: string; runId: string }
  > = []
  for (const run of runs) {
    for (const ev of run.history ?? []) {
      out.push({
        ...ev,
        blueprintName: ev.blueprintName || run.blueprintName,
        runId: run.id,
      })
    }
  }
  out.sort((a, b) => {
    const sa = a.seq
    const sb = b.seq
    if (typeof sa === 'number' && typeof sb === 'number' && a.runId === b.runId) {
      return sa - sb
    }
    const t = a.at.localeCompare(b.at)
    if (t !== 0) return t
    if (typeof sa === 'number' && typeof sb === 'number') return sa - sb
    return a.id.localeCompare(b.id)
  })
  return dedupeHistoryEvents(out)
}

/** Wipe history on all runs for an invoice (keeps current enrollment status). */
export function clearInvoiceBlueprintHistory(invoice: {
  id: string
  invoice_number: string
}): void {
  const runs = findRunsForInvoice(invoice)
  for (const run of runs) {
    upsertBlueprintRun({ ...run, history: [] }, { silent: true })
  }
}

/** Record a staff-triggered Then-do on this invoice without moving the live enrollment. */
export function appendInvoiceActionHistory(input: {
  invoiceId: string
  invoiceNumber: string
  clientLabel: string
  blueprintId: string
  blueprintName: string
  title: string
  detail?: string
}): void {
  const invoice = { id: input.invoiceId, invoice_number: input.invoiceNumber }
  const event = {
    kind: 'action' as const,
    title: input.title,
    detail: input.detail,
    blueprintName: input.blueprintName,
    blueprintId: input.blueprintId,
  }
  const existing = getPrimaryRunForInvoice(invoice)
  if (existing) {
    upsertBlueprintRun(existing, { historyEvent: event })
    return
  }

  const now = new Date().toISOString()
  upsertBlueprintRun(
    {
      id: `run-inv-actions-${input.invoiceId}`,
      subject: 'invoice',
      subjectId: input.invoiceId,
      subjectLabel: input.invoiceNumber,
      clientLabel: input.clientLabel,
      blueprintId: input.blueprintId,
      blueprintName: input.blueprintName,
      status: 'completed',
      currentStep: 'Manual actions',
      waitUntil: null,
      startedAt: now,
      updatedAt: now,
    },
    { historyEvent: event }
  )
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
  /** Separate row (e.g. a hold run beside a paused chase). Default: one row per invoice. */
  runId?: string
}): BlueprintRunRow {
  const waitDays = input.waitDays ?? 5
  const now = new Date().toISOString()
  const status = input.status ?? 'waiting'
  const runId = input.runId ?? `run-inv-${input.invoiceId}`
  const existing = readAll().find((r) => r.id === runId)
  const step =
    input.currentStep ?? `Wait until · ${waitDays} days from this step`
  return upsertBlueprintRun(
    {
      id: runId,
      subject: 'invoice',
      subjectId: input.invoiceId,
      subjectLabel: input.invoiceNumber,
      clientLabel: input.clientLabel,
      blueprintId: input.blueprintId,
      blueprintName: input.blueprintName,
      status,
      currentStep: step,
      currentNodeId: input.currentNodeId,
      waitUntil:
        input.waitUntil !== undefined
          ? input.waitUntil
          : status === 'waiting'
            ? daysFromNow(waitDays)
            : null,
      startedAt: existing?.startedAt ?? now,
      updatedAt: now,
      history: existing?.history,
    },
    {
      historyEvent: {
        kind: 'enrolled',
        title: existing ? 'Re-enrolled' : 'Enrolled',
        detail: `${input.blueprintName} · ${step}`,
      },
    }
  )
}

/** Enroll a broker on a blueprint run. */
export function startBrokerRun(input: {
  brokerId: string
  brokerName: string
  blueprintId: string
  blueprintName: string
  currentNodeId?: string
  currentStep?: string
  status?: BlueprintRunStatus
  waitUntil?: string | null
  waitDays?: number
}): BlueprintRunRow {
  const waitDays = input.waitDays ?? 5
  const now = new Date().toISOString()
  const status = input.status ?? 'active'
  return upsertBlueprintRun({
    id: `run-broker-${input.brokerId}`,
    subject: 'broker',
    subjectId: input.brokerId,
    subjectLabel: input.brokerName,
    clientLabel: '',
    blueprintId: input.blueprintId,
    blueprintName: input.blueprintName,
    status,
    currentStep: input.currentStep ?? 'Start with',
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

export function getPrimaryRunForBroker(broker: {
  id: string
  name: string
}): BlueprintRunRow | null {
  const runs = listBlueprintRuns().filter((r) => {
    if (r.subject !== 'broker') return false
    if (r.subjectId && r.subjectId === broker.id) return true
    return false
  })
  if (runs.length === 0) return null
  const live = runs.find(
    (r) =>
      r.status === 'waiting' || r.status === 'active' || r.status === 'paused'
  )
  return live ?? runs[0] ?? null
}

/** Enroll a batch on a blueprint run. */
export function startBatchRun(input: {
  batchId: string
  batchNumber: string
  clientLabel: string
  blueprintId: string
  blueprintName: string
  currentNodeId?: string
  currentStep?: string
  status?: BlueprintRunStatus
  waitUntil?: string | null
  waitDays?: number
}): BlueprintRunRow {
  const waitDays = input.waitDays ?? 1
  const now = new Date().toISOString()
  const status = input.status ?? 'active'
  return upsertBlueprintRun({
    id: `run-batch-${input.batchId}`,
    subject: 'batch',
    subjectId: input.batchId,
    subjectLabel: input.batchNumber,
    clientLabel: input.clientLabel,
    blueprintId: input.blueprintId,
    blueprintName: input.blueprintName,
    status,
    currentStep: input.currentStep ?? 'Start with',
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

export function getPrimaryRunForBatch(batch: {
  id: string
  batch_number: string
}): BlueprintRunRow | null {
  const runs = listBlueprintRuns().filter((r) => {
    if (r.subject !== 'batch') return false
    if (r.subjectId && r.subjectId === batch.id) return true
    return false
  })
  if (runs.length === 0) return null
  const live = runs.find(
    (r) =>
      r.status === 'waiting' || r.status === 'active' || r.status === 'paused'
  )
  return live ?? runs[0] ?? null
}

/** @deprecated Use startInvoiceRun */
export function startDemoInvoiceRun(
  input: Parameters<typeof startInvoiceRun>[0]
): BlueprintRunRow {
  return startInvoiceRun(input)
}

export const BLUEPRINT_RUNS_CHANGED_EVENT = 'credyx:blueprint-runs-changed'
