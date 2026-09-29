import type { SavedBlueprint } from '../../types/blueprintGraph'
import { STANDARD_CHASE_BLUEPRINTS } from '../../../supabase/functions/_shared/standardBlueprints'
import {
  BATCH_PROCESSED_NOTICE_BLUEPRINT,
  LEGACY_DEMO_BLUEPRINT_IDS,
  NEW_BROKER_ONBOARDING_BLUEPRINT,
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

/** Replace local cache from Supabase hydrate (does not auto-seed). */
export function replaceSavedBlueprints(list: SavedBlueprint[]): void {
  writeAll(list)
}

/** Drop old IF/Net demo; seed chase + onboarding + batch notice if missing. */
export function ensureDemoBlueprintSeeded(): void {
  const existing = readAll()
  const withoutLegacy = existing.filter(
    (b) =>
      !LEGACY_DEMO_BLUEPRINT_IDS.includes(
        b.id as (typeof LEGACY_DEMO_BLUEPRINT_IDS)[number]
      )
  )
  const hasChase = withoutLegacy.some((b) => b.id === RISK_LADDER_DEMO_BLUEPRINT.id)
  const hasNewBroker = withoutLegacy.some(
    (b) => b.id === NEW_BROKER_ONBOARDING_BLUEPRINT.id
  )
  const hasBatchProcessed = withoutLegacy.some(
    (b) => b.id === BATCH_PROCESSED_NOTICE_BLUEPRINT.id
  )
  const missingStandard = STANDARD_CHASE_BLUEPRINTS.some(
    (bp) => !withoutLegacy.some((b) => b.id === bp.id)
  )
  const confirmedStandard = STANDARD_CHASE_BLUEPRINTS.find((bp) => bp.id === 'bp-standard-broker-confirmed')
  const savedConfirmed = withoutLegacy.find((b) => b.id === 'bp-standard-broker-confirmed')
  const staleConfirmed = Boolean(
    confirmedStandard &&
      savedConfirmed &&
      !savedConfirmed.nodes.some((node) => {
        const ids = node.data.actionIds?.length
          ? node.data.actionIds
          : node.data.actionId
            ? [node.data.actionId]
            : []
        return node.data.kind === 'action' && ids.includes('add_note')
      })
  )
  const removedLegacy = withoutLegacy.length !== existing.length

  if (hasChase && hasNewBroker && hasBatchProcessed && !missingStandard && !removedLegacy && !staleConfirmed) return

  let next = withoutLegacy
  if (!hasChase) next = [RISK_LADDER_DEMO_BLUEPRINT, ...next]
  if (!hasNewBroker) next = [NEW_BROKER_ONBOARDING_BLUEPRINT, ...next]
  if (!hasBatchProcessed) next = [BATCH_PROCESSED_NOTICE_BLUEPRINT, ...next]
  for (const bp of STANDARD_CHASE_BLUEPRINTS) {
    if (!next.some((b) => b.id === bp.id)) next = [bp as SavedBlueprint, ...next]
  }
  if (staleConfirmed && confirmedStandard) {
    next = next.map((b) => (b.id === confirmedStandard.id ? (confirmedStandard as SavedBlueprint) : b))
  }
  writeAll(next)
  if (staleConfirmed && confirmedStandard) {
    const upgraded = next.find((b) => b.id === confirmedStandard.id)
    if (upgraded) {
      void import('../../services/supabase/blueprintPersist').then((m) => m.persistBlueprint(upgraded))
    }
  }
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
  void import('../../services/supabase/blueprintPersist').then((m) =>
    m.persistBlueprint(next)
  )
  return next
}

export function deleteSavedBlueprint(id: string): void {
  writeAll(readAll().filter((b) => b.id !== id))
  void import('../../services/supabase/blueprintPersist').then((m) =>
    m.deleteBlueprintFromDb(id)
  )
}

export function newBlueprintId(): string {
  return `bp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
