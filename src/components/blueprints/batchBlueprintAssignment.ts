/** Per-batch blueprint assignment (localStorage write-through + Supabase). */

export interface BatchBlueprintAssignment {
  batchId: string
  blueprintId: string
  blueprintName: string
  assignedAt: string
}

const STORAGE_KEY = 'credyx.batch_blueprint_assignments.v1'
export const BATCH_BLUEPRINT_CHANGED_EVENT = 'credyx:batch-blueprint-changed'

function notifyChanged(batchId: string): void {
  try {
    window.dispatchEvent(
      new CustomEvent(BATCH_BLUEPRINT_CHANGED_EVENT, { detail: { batchId } })
    )
  } catch {
    /* ignore */
  }
}

function readAll(): Record<string, BatchBlueprintAssignment> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, BatchBlueprintAssignment>
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, BatchBlueprintAssignment>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function replaceBatchBlueprintAssignments(
  map: Record<string, BatchBlueprintAssignment>
): void {
  writeAll(map)
}

export function getBatchBlueprintAssignment(
  batchId: string
): BatchBlueprintAssignment | null {
  return readAll()[batchId] ?? null
}

export function assignBatchBlueprint(
  batchId: string,
  blueprintId: string,
  blueprintName: string
): BatchBlueprintAssignment {
  const next: BatchBlueprintAssignment = {
    batchId,
    blueprintId,
    blueprintName,
    assignedAt: new Date().toISOString(),
  }
  const map = readAll()
  map[batchId] = next
  writeAll(map)
  void import('../../services/supabase/blueprintPersist').then((m) =>
    m.persistBatchAssignment(next)
  )
  notifyChanged(batchId)
  return next
}

export function clearBatchBlueprintAssignment(batchId: string): void {
  const map = readAll()
  delete map[batchId]
  writeAll(map)
  void import('../../services/supabase/blueprintPersist').then((m) =>
    m.clearBatchAssignmentFromDb(batchId)
  )
  notifyChanged(batchId)
}
