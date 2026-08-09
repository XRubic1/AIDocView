import type { SortDir } from './clientListPage'

/** Locale-aware client name compare for table sorts. */
export function compareByClientName(
  aName: string | null | undefined,
  bName: string | null | undefined,
  dir: SortDir = 'asc'
): number {
  const left = (aName ?? '').trim()
  const right = (bName ?? '').trim()
  const cmp = left.localeCompare(right, undefined, { sensitivity: 'base' })
  return dir === 'asc' ? cmp : -cmp
}
