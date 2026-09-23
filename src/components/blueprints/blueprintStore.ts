import type { SavedBlueprint } from '../../types/blueprintGraph'
import {
  LEGACY_DEMO_BLUEPRINT_IDS,
  RISK_LADDER_DEMO_BLUEPRINT,
} from './blueprintSeed'

const STORAGE_KEY = 'credyx.blueprints.v1'

function readAll(): SavedBlueprint[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (b): b is SavedBlueprint =>
        !!b &&
        typeof b === 'object' &&
        typeof (b as SavedBlueprint).id === 'string' &&
        typeof (b as SavedBlueprint).name === 'string' &&
        Array.isArray((b as SavedBlueprint).nodes) &&
        Array.isArray((b as SavedBlueprint).edges)
    )
  } catch {
    return []
  }
}

function writeAll(list: SavedBlueprint[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

/** Drop old IF/Net demo; seed plain-English draft if missing. */
export function ensureDemoBlueprintSeeded(): void {
  const existing = readAll()
  const withoutLegacy = existing.filter(
    (b) =>
      !LEGACY_DEMO_BLUEPRINT_IDS.includes(
        b.id as (typeof LEGACY_DEMO_BLUEPRINT_IDS)[number]
      )
  )
  const hasDemo = withoutLegacy.some((b) => b.id === RISK_LADDER_DEMO_BLUEPRINT.id)
  const removedLegacy = withoutLegacy.length !== existing.length

  if (hasDemo && !removedLegacy) return

  const next = hasDemo
    ? withoutLegacy
    : [RISK_LADDER_DEMO_BLUEPRINT, ...withoutLegacy]
  writeAll(next)
}

export function listSavedBlueprints(): SavedBlueprint[] {
  ensureDemoBlueprintSeeded()
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getSavedBlueprint(id: string): SavedBlueprint | null {
  return listSavedBlueprints().find((b) => b.id === id) ?? null
}

export function saveBlueprint(blueprint: SavedBlueprint): SavedBlueprint {
  const next: SavedBlueprint = {
    ...blueprint,
    updatedAt: new Date().toISOString(),
  }
  const list = readAll().filter((b) => b.id !== next.id)
  writeAll([next, ...list])
  return next
}

export function deleteSavedBlueprint(id: string): void {
  writeAll(readAll().filter((b) => b.id !== id))
}

export function newBlueprintId(): string {
  return `bp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
