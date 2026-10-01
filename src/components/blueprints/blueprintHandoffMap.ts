/**
 * Main blueprint grid: when one blueprint finishes, start the one it points to.
 * Stored locally for the runner and mirrored to platform_settings.
 */

export interface BlueprintHandoffLink {
  fromId: string
  toId: string
}

export interface BlueprintHandoffMap {
  links: BlueprintHandoffLink[]
  positions: Record<string, { x: number; y: number }>
}

const STORAGE_KEY = 'credyx.blueprint_handoff_map.v1'
export const BLUEPRINT_HANDOFF_CHANGED_EVENT = 'credyx:blueprint-handoff-changed'

const EMPTY: BlueprintHandoffMap = { links: [], positions: {} }

let cache: BlueprintHandoffMap | null = null

function normalize(raw: unknown): BlueprintHandoffMap {
  if (!raw || typeof raw !== 'object') return { links: [], positions: {} }
  const value = raw as Partial<BlueprintHandoffMap>
  const links: BlueprintHandoffLink[] = []
  const seenFrom = new Set<string>()
  if (Array.isArray(value.links)) {
    for (const row of value.links) {
      if (!row || typeof row !== 'object') continue
      const fromId = String((row as BlueprintHandoffLink).fromId ?? '').trim()
      const toId = String((row as BlueprintHandoffLink).toId ?? '').trim()
      if (!fromId || !toId || fromId === toId || seenFrom.has(fromId)) continue
      seenFrom.add(fromId)
      links.push({ fromId, toId })
    }
  }
  const positions: BlueprintHandoffMap['positions'] = {}
  if (value.positions && typeof value.positions === 'object') {
    for (const [id, pos] of Object.entries(value.positions)) {
      if (!pos || typeof pos !== 'object') continue
      const x = Number((pos as { x?: number }).x)
      const y = Number((pos as { y?: number }).y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      positions[id] = { x, y }
    }
  }
  return { links, positions }
}

function readLocal(): BlueprintHandoffMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { links: [], positions: {} }
    return normalize(JSON.parse(raw))
  } catch {
    return { links: [], positions: {} }
  }
}

function writeLocal(map: BlueprintHandoffMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

export function getBlueprintHandoffMap(): BlueprintHandoffMap {
  if (!cache) cache = readLocal()
  return cache
}

/** Replace the in-memory map (hydrate). Does not write Supabase. */
export function applyBlueprintHandoffMap(next: BlueprintHandoffMap): void {
  cache = normalize(next)
  writeLocal(cache)
  try {
    window.dispatchEvent(new CustomEvent(BLUEPRINT_HANDOFF_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

/** Blueprint that should start when `fromId` finishes. One successor per blueprint. */
export function nextBlueprintAfter(fromId: string, map: BlueprintHandoffMap = getBlueprintHandoffMap()): string | null {
  const hit = map.links.find((link) => link.fromId === fromId)
  return hit?.toId ?? null
}

/** True when adding from → to would loop back to from. */
export function handoffLinkWouldCycle(
  links: BlueprintHandoffLink[],
  fromId: string,
  toId: string
): boolean {
  if (fromId === toId) return true
  const nextOf = new Map<string, string>()
  for (const link of links) {
    if (link.fromId === fromId) continue
    nextOf.set(link.fromId, link.toId)
  }
  nextOf.set(fromId, toId)
  const seen = new Set<string>()
  let cursor: string | undefined = fromId
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    cursor = nextOf.get(cursor)
    if (cursor === fromId) return true
  }
  return false
}

export function emptyBlueprintHandoffMap(): BlueprintHandoffMap {
  return { links: [...EMPTY.links], positions: { ...EMPTY.positions } }
}
