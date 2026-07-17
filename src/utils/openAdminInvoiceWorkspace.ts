/** Named browser window for the Credyx invoice detail + document workspace. */
export const ADMIN_INVOICE_WORKSPACE_WINDOW = 'credyx-invoice-workspace'

/**
 * Open (or focus) a separate window with invoice detail on the left and
 * documents on the right. Pass an invoice id to deep-link into that invoice.
 */
export function openAdminInvoiceWorkspace(invoiceId?: string | null): Window | null {
  const params = new URLSearchParams()
  if (invoiceId) params.set('invoice', invoiceId)
  const qs = params.toString()
  const url = `/invoices/workspace${qs ? `?${qs}` : ''}`

  const features = [
    'width=1440',
    'height=920',
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',')

  const win = window.open(url, ADMIN_INVOICE_WORKSPACE_WINDOW, features)
  if (!win) return null
  try {
    win.focus()
  } catch {
    /* ignore focus errors from cross-origin / blocked popups */
  }
  return win
}
