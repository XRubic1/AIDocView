/** Per-broker blueprint assignment (localStorage write-through + Supabase). */

export interface BrokerBlueprintAssignment {
  brokerId: string
  blueprintId: string
  blueprintName: string
  assignedAt: string
}

const STORAGE_KEY = 'credyx.broker_blueprint_assignments.v1'
export const BROKER_BLUEPRINT_CHANGED_EVENT = 'credyx:broker-blueprint-changed'

function notifyChanged(brokerId: string): void {
  try {
    window.dispatchEvent(
      new CustomEvent(BROKER_BLUEPRINT_CHANGED_EVENT, { detail: { brokerId } })
    )
  } catch {
    /* ignore */
  }
}

function readAll(): Record<string, BrokerBlueprintAssignment> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, BrokerBlueprintAssignment>
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, BrokerBlueprintAssignment>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function replaceBrokerBlueprintAssignments(
  map: Record<string, BrokerBlueprintAssignment>
): void {
  writeAll(map)
}

export function getBrokerBlueprintAssignment(
  brokerId: string
): BrokerBlueprintAssignment | null {
  return readAll()[brokerId] ?? null
}

export function assignBrokerBlueprint(
  brokerId: string,
  blueprintId: string,
  blueprintName: string
): BrokerBlueprintAssignment {
  const next: BrokerBlueprintAssignment = {
    brokerId,
    blueprintId,
    blueprintName,
    assignedAt: new Date().toISOString(),
  }
  const map = readAll()
  map[brokerId] = next
  writeAll(map)
  void import('../../services/supabase/blueprintPersist').then((m) =>
    m.persistBrokerAssignment(next)
  )
  notifyChanged(brokerId)
  return next
}

export function clearBrokerBlueprintAssignment(brokerId: string): void {
  const map = readAll()
  delete map[brokerId]
  writeAll(map)
  void import('../../services/supabase/blueprintPersist').then((m) =>
    m.clearBrokerAssignmentFromDb(brokerId)
  )
  notifyChanged(brokerId)
}
