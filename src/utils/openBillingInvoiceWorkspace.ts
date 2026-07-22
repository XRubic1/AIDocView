/** Named browser window for the Credyx client billing invoice workspace. */
export const BILLING_INVOICE_WORKSPACE_WINDOW = 'credyx-billing-invoice-workspace'

/**
 * Open (or focus) a separate window with full billing invoice details,
 * payment history, and discount tools.
 */
export function openBillingInvoiceWorkspace(
  clientId: string,
  period: string
): Window | null {
  const params = new URLSearchParams({
    client: clientId,
    period,
  })
  const url = `/billing/workspace?${params.toString()}`

  // Sized to fit the invoice review layout without vertical scrolling on typical laptop screens.
  const features = [
    'width=1120',
    'height=760',
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',')

  const win = window.open(url, BILLING_INVOICE_WORKSPACE_WINDOW, features)
  if (!win) return null
  try {
    win.focus()
  } catch {
    /* ignore focus errors from cross-origin / blocked popups */
  }
  return win
}
