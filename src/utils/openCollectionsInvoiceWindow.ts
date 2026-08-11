/**
 * Open invoice detail in a real OS popup (separate browser window).
 * Reuses one named window so the collections list stays on the left.
 */

export const COLLECTIONS_WORKSPACE_WINDOW = 'credyx-collections-workspace'
export const COLLECTIONS_WORKSPACE_LIST_KEY = 'credyx-collections-workspace-ids'

/** Persist the visible collections queue so the popup can show the same list. */
export function storeCollectionsWorkspaceList(invoiceIds: string[]): void {
  try {
    localStorage.setItem(COLLECTIONS_WORKSPACE_LIST_KEY, JSON.stringify(invoiceIds))
  } catch {
    /* quota / private mode */
  }
}

export function readCollectionsWorkspaceList(): string[] {
  try {
    const raw = localStorage.getItem(COLLECTIONS_WORKSPACE_LIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

/**
 * Open (or focus) the collections workspace: invoice list on the left, documents on the right.
 * Pass `listInvoiceIds` from the Collections table so the popup matches that queue.
 */
export function openCollectionsInvoiceWindow(
  invoiceId: string,
  listInvoiceIds?: string[]
): Window | null {
  if (listInvoiceIds?.length) {
    storeCollectionsWorkspaceList(listInvoiceIds)
  }

  const url = `/collections/invoice/${encodeURIComponent(invoiceId)}`
  const width = 1440
  const height = 920
  const left = Math.round(window.screenX + Math.max(0, (window.outerWidth - width) / 2))
  const top = Math.round(window.screenY + Math.max(0, (window.outerHeight - height) / 2))
  const features = [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',')

  const popup = window.open(url, COLLECTIONS_WORKSPACE_WINDOW, features)
  popup?.focus()
  return popup
}
