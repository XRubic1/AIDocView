/**
 * Persist / hydrate Credyx Blueprints (graphs, runs, assignments) via Supabase.
 * Local localStorage remains the write-through cache.
 */
import type { SavedBlueprint } from '../../types/blueprintGraph'
import type {
  BlueprintRunHistoryEvent,
  BlueprintRunRow,
  BlueprintRunStatus,
  BlueprintRunSubject,
} from '../../components/blueprints/blueprintRuns'
import type { InvoiceBlueprintAssignment } from '../../components/blueprints/invoiceBlueprintAssignment'
import type { BrokerBlueprintAssignment } from '../../components/blueprints/brokerBlueprintAssignment'
import type { BatchBlueprintAssignment } from '../../components/blueprints/batchBlueprintAssignment'
import {
  ensureDemoBlueprintSeeded,
  listSavedBlueprints,
  replaceSavedBlueprints,
} from '../../components/blueprints/blueprintStore'
import { replaceBlueprintRunsFromHydrate } from '../../components/blueprints/blueprintRuns'
import { replaceInvoiceBlueprintAssignments } from '../../components/blueprints/invoiceBlueprintAssignment'
import { replaceBrokerBlueprintAssignments } from '../../components/blueprints/brokerBlueprintAssignment'
import { replaceBatchBlueprintAssignments } from '../../components/blueprints/batchBlueprintAssignment'
import { isSupabaseConfigured, getSupabase } from '../../lib/supabase'

export type BlueprintRow = {
  id: string
  name: string
  priority: number
  nodes: unknown
  edges: unknown
  created_at?: string
  updated_at: string
}

export type BlueprintRunDbRow = {
  id: string
  subject: string
  subject_id: string | null
  subject_label: string
  client_label: string
  blueprint_id: string
  blueprint_name: string
  status: string
  current_step: string
  current_node_id: string | null
  wait_until: string | null
  started_at: string
  updated_at: string
  history?: unknown
}

export function savedBlueprintToRow(bp: SavedBlueprint): BlueprintRow {
  return {
    id: bp.id,
    name: bp.name,
    priority: Number.isFinite(Number(bp.priority)) ? Number(bp.priority) : 0,
    nodes: bp.nodes,
    edges: bp.edges,
    updated_at: bp.updatedAt,
  }
}

export function blueprintRowToSaved(row: BlueprintRow): SavedBlueprint {
  return {
    id: row.id,
    name: row.name,
    priority: row.priority ?? 0,
    nodes: Array.isArray(row.nodes) ? (row.nodes as SavedBlueprint['nodes']) : [],
    edges: Array.isArray(row.edges) ? (row.edges as SavedBlueprint['edges']) : [],
    updatedAt: row.updated_at || new Date().toISOString(),
  }
}

function parseHistory(raw: unknown): BlueprintRunHistoryEvent[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: BlueprintRunHistoryEvent[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const e = item as Partial<BlueprintRunHistoryEvent>
    if (typeof e.id !== 'string' || typeof e.at !== 'string' || typeof e.title !== 'string') {
      continue
    }
    out.push({
      id: e.id,
      at: e.at,
      kind: (e.kind as BlueprintRunHistoryEvent['kind']) || 'note',
      title: e.title,
      detail: typeof e.detail === 'string' ? e.detail : undefined,
      blueprintName:
        typeof e.blueprintName === 'string' ? e.blueprintName : undefined,
      blueprintId: typeof e.blueprintId === 'string' ? e.blueprintId : undefined,
      completedNodeId:
        typeof e.completedNodeId === 'string' ? e.completedNodeId : undefined,
      stepNodeId: typeof e.stepNodeId === 'string' ? e.stepNodeId : undefined,
      emailSent: typeof e.emailSent === 'boolean' ? e.emailSent : undefined,
      noteAdded: typeof e.noteAdded === 'boolean' ? e.noteAdded : undefined,
    })
  }
  return out
}

export function blueprintRunToRow(run: BlueprintRunRow): BlueprintRunDbRow {
  return {
    id: run.id,
    subject: run.subject,
    subject_id: run.subjectId ?? null,
    subject_label: run.subjectLabel ?? '',
    client_label: run.clientLabel ?? '',
    blueprint_id: run.blueprintId,
    blueprint_name: run.blueprintName,
    status: run.status,
    current_step: run.currentStep ?? '',
    current_node_id: run.currentNodeId ?? null,
    wait_until: run.waitUntil,
    started_at: run.startedAt,
    updated_at: run.updatedAt,
    history: run.history ?? [],
  }
}

export function blueprintRunRowToApp(row: BlueprintRunDbRow): BlueprintRunRow {
  return {
    id: row.id,
    subject: row.subject as BlueprintRunSubject,
    subjectId: row.subject_id ?? undefined,
    subjectLabel: row.subject_label ?? '',
    clientLabel: row.client_label ?? '',
    blueprintId: row.blueprint_id,
    blueprintName: row.blueprint_name,
    status: row.status as BlueprintRunStatus,
    currentStep: row.current_step ?? '',
    currentNodeId: row.current_node_id ?? undefined,
    waitUntil: row.wait_until,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    history: parseHistory(row.history),
  }
}

function warn(scope: string, message: string): void {
  console.warn(`[blueprintPersist] ${scope}: ${message}`)
}

export async function persistBlueprint(bp: SavedBlueprint): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase
    .from('blueprints')
    .upsert(savedBlueprintToRow(bp), { onConflict: 'id' })
  if (error) warn('blueprint upsert', error.message)
}

export async function deleteBlueprintFromDb(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.from('blueprints').delete().eq('id', id)
  if (error) warn('blueprint delete', error.message)
}

const latestRunToSave = new Map<string, BlueprintRunRow>()
const runSaveChain = new Map<string, Promise<void>>()

/**
 * Save a run. Saves for the same run are queued and only the newest state is written,
 * so an older save can never finish last and roll the run back.
 */
export function persistBlueprintRun(run: BlueprintRunRow): Promise<void> {
  if (!isSupabaseConfigured()) return Promise.resolve()
  latestRunToSave.set(run.id, run)
  const prev = runSaveChain.get(run.id) ?? Promise.resolve()
  const next = prev.then(async () => {
    const latest = latestRunToSave.get(run.id)
    if (!latest) return
    latestRunToSave.delete(run.id)
    const supabase = getSupabase()
    if (!supabase) return
    const { error } = await supabase
      .from('blueprint_runs')
      .upsert(blueprintRunToRow(latest), { onConflict: 'id' })
    if (error) warn('run upsert', error.message)
  })
  runSaveChain.set(run.id, next)
  void next.finally(() => {
    if (runSaveChain.get(run.id) === next) runSaveChain.delete(run.id)
  })
  return next
}

export async function deleteBlueprintRunFromDb(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.from('blueprint_runs').delete().eq('id', id)
  if (error) warn('run delete', error.message)
}

export async function persistInvoiceAssignment(
  a: InvoiceBlueprintAssignment
): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.from('invoice_blueprint_assignments').upsert(
    {
      invoice_id: a.invoiceId,
      blueprint_id: a.blueprintId,
      blueprint_name: a.blueprintName,
      assigned_at: a.assignedAt,
    },
    { onConflict: 'invoice_id' }
  )
  if (error) warn('invoice assignment upsert', error.message)
}

export async function clearInvoiceAssignmentFromDb(invoiceId: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase
    .from('invoice_blueprint_assignments')
    .delete()
    .eq('invoice_id', invoiceId)
  if (error) warn('invoice assignment delete', error.message)
}

export async function persistBrokerAssignment(
  a: BrokerBlueprintAssignment
): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.from('broker_blueprint_assignments').upsert(
    {
      broker_id: a.brokerId,
      blueprint_id: a.blueprintId,
      blueprint_name: a.blueprintName,
      assigned_at: a.assignedAt,
    },
    { onConflict: 'broker_id' }
  )
  if (error) warn('broker assignment upsert', error.message)
}

export async function clearBrokerAssignmentFromDb(brokerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase
    .from('broker_blueprint_assignments')
    .delete()
    .eq('broker_id', brokerId)
  if (error) warn('broker assignment delete', error.message)
}

export async function persistBatchAssignment(
  a: BatchBlueprintAssignment
): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.from('batch_blueprint_assignments').upsert(
    {
      batch_id: a.batchId,
      blueprint_id: a.blueprintId,
      blueprint_name: a.blueprintName,
      assigned_at: a.assignedAt,
    },
    { onConflict: 'batch_id' }
  )
  if (error) warn('batch assignment upsert', error.message)
}

export async function clearBatchAssignmentFromDb(batchId: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase
    .from('batch_blueprint_assignments')
    .delete()
    .eq('batch_id', batchId)
  if (error) warn('batch assignment delete', error.message)
}

/**
 * Admin hydrate: replace local blueprint caches from Supabase.
 * Empty blueprints table → seed demos and upsert them.
 */
export async function hydrateBlueprintsFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  const [bpRes, runsRes, invRes, broRes, batRes] = await Promise.all([
    supabase.from('blueprints').select('*').order('updated_at', { ascending: false }),
    supabase.from('blueprint_runs').select('*').order('updated_at', { ascending: false }),
    supabase.from('invoice_blueprint_assignments').select('*'),
    supabase.from('broker_blueprint_assignments').select('*'),
    supabase.from('batch_blueprint_assignments').select('*'),
  ])

  if (bpRes.error) throw new Error(`blueprints: ${bpRes.error.message}`)
  if (runsRes.error) throw new Error(`blueprint_runs: ${runsRes.error.message}`)
  if (invRes.error) throw new Error(`invoice_blueprint_assignments: ${invRes.error.message}`)
  if (broRes.error) throw new Error(`broker_blueprint_assignments: ${broRes.error.message}`)
  if (batRes.error) throw new Error(`batch_blueprint_assignments: ${batRes.error.message}`)

  let blueprints = ((bpRes.data ?? []) as BlueprintRow[]).map(blueprintRowToSaved)
  if (blueprints.length === 0) {
    ensureDemoBlueprintSeeded()
    blueprints = listSavedBlueprints()
    for (const bp of blueprints) {
      await persistBlueprint(bp)
    }
  } else {
    replaceSavedBlueprints(blueprints)
  }

  const runs = ((runsRes.data ?? []) as BlueprintRunDbRow[]).map(blueprintRunRowToApp)
  replaceBlueprintRunsFromHydrate(runs)

  const invMap: Record<string, InvoiceBlueprintAssignment> = {}
  for (const row of invRes.data ?? []) {
    const r = row as {
      invoice_id: string
      blueprint_id: string
      blueprint_name: string
      assigned_at: string
    }
    invMap[r.invoice_id] = {
      invoiceId: r.invoice_id,
      blueprintId: r.blueprint_id,
      blueprintName: r.blueprint_name,
      assignedAt: r.assigned_at,
    }
  }
  replaceInvoiceBlueprintAssignments(invMap)

  const broMap: Record<string, BrokerBlueprintAssignment> = {}
  for (const row of broRes.data ?? []) {
    const r = row as {
      broker_id: string
      blueprint_id: string
      blueprint_name: string
      assigned_at: string
    }
    broMap[r.broker_id] = {
      brokerId: r.broker_id,
      blueprintId: r.blueprint_id,
      blueprintName: r.blueprint_name,
      assignedAt: r.assigned_at,
    }
  }
  replaceBrokerBlueprintAssignments(broMap)

  const batMap: Record<string, BatchBlueprintAssignment> = {}
  for (const row of batRes.data ?? []) {
    const r = row as {
      batch_id: string
      blueprint_id: string
      blueprint_name: string
      assigned_at: string
    }
    batMap[r.batch_id] = {
      batchId: r.batch_id,
      blueprintId: r.blueprint_id,
      blueprintName: r.blueprint_name,
      assignedAt: r.assigned_at,
    }
  }
  replaceBatchBlueprintAssignments(batMap)
}
