import type { BlueprintNodeData, BlueprintNodeKind } from '../../types/blueprintGraph'
import type { BlueprintSubject } from './blueprintCatalog'

const STORAGE_KEY = 'credyx.blueprintCards.v1'

export type SavedBlueprintCard = {
  id: string
  name: string
  updatedAt: string
  /** Subject hint for catalog filtering when inserting */
  subject?: BlueprintSubject | null
  kind: BlueprintNodeKind
  data: BlueprintNodeData
}

function readAll(): SavedBlueprintCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (c): c is SavedBlueprintCard =>
        !!c &&
        typeof c === 'object' &&
        typeof (c as SavedBlueprintCard).id === 'string' &&
        typeof (c as SavedBlueprintCard).name === 'string' &&
        typeof (c as SavedBlueprintCard).data === 'object'
    )
  } catch {
    return []
  }
}

function writeAll(list: SavedBlueprintCard[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function listSavedCards(): SavedBlueprintCard[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function saveCard(input: {
  id?: string
  name: string
  subject?: BlueprintSubject | null
  data: BlueprintNodeData
}): SavedBlueprintCard {
  const name = input.name.trim() || input.data.label || 'Saved card'
  const card: SavedBlueprintCard = {
    id: input.id || `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    updatedAt: new Date().toISOString(),
    subject: input.subject ?? null,
    kind: input.data.kind,
    data: { ...input.data },
  }
  const rest = readAll().filter((c) => c.id !== card.id)
  writeAll([card, ...rest])
  return card
}

/** Upsert by id when present; otherwise by name+kind. */
export function upsertCardByName(input: {
  id?: string
  name: string
  subject?: BlueprintSubject | null
  data: BlueprintNodeData
}): SavedBlueprintCard {
  const name = input.name.trim() || input.data.label || 'Saved card'
  if (input.id) {
    return saveCard({
      id: input.id,
      name,
      subject: input.subject,
      data: input.data,
    })
  }
  const existing = readAll().find(
    (c) => c.name === name && c.kind === input.data.kind
  )
  return saveCard({
    id: existing?.id,
    name,
    subject: input.subject,
    data: input.data,
  })
}

export function deleteSavedCard(id: string): void {
  writeAll(readAll().filter((c) => c.id !== id))
}

export function getSavedCard(id: string): SavedBlueprintCard | null {
  return readAll().find((c) => c.id === id) ?? null
}
