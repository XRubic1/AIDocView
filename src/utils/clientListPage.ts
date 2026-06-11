export const LIST_PAGE_SIZE_KEY = 'credyx-list-page-size'
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

export type SortDir = 'asc' | 'desc'

/** Reads the user's default list page size from settings (localStorage). */
export function getInitialListPageSize(): number {
  try {
    const stored = localStorage.getItem(LIST_PAGE_SIZE_KEY)
    if (stored) {
      const size = Number(stored)
      if (PAGE_SIZE_OPTIONS.includes(size as (typeof PAGE_SIZE_OPTIONS)[number])) {
        return size
      }
    }
  } catch {
    /* ignore localStorage errors */
  }
  return 25
}
