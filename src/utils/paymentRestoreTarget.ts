/**
 * Browser session memory for which payment / invoice detail panel was open.
 * Survives tab switches (Payments ↔ Batches ↔ Invoices) until the user closes the panel.
 */

const PAYMENT_ID_KEY = 'credyx:openPaymentId'
const PAYMENT_INVOICE_ID_KEY = 'credyx:openPaymentInvoiceId'
const INVOICE_ID_KEY = 'credyx:openInvoiceId'

/** Legacy keys from the return-banner restore flow — still read for compatibility. */
const LEGACY_PAYMENT_ID_KEY = 'credyx:restorePaymentId'
const LEGACY_INVOICE_ID_KEY = 'credyx:restoreInvoiceId'

export type PaymentRestoreTarget = {
  paymentId: string
  invoiceId?: string
}

/** Persist which payment detail to reopen after navigating away. */
export function stashPaymentRestoreTarget(target: PaymentRestoreTarget): void {
  try {
    sessionStorage.setItem(PAYMENT_ID_KEY, target.paymentId)
    sessionStorage.setItem(LEGACY_PAYMENT_ID_KEY, target.paymentId)
    if (target.invoiceId) {
      sessionStorage.setItem(PAYMENT_INVOICE_ID_KEY, target.invoiceId)
      sessionStorage.setItem(LEGACY_INVOICE_ID_KEY, target.invoiceId)
    } else {
      sessionStorage.removeItem(PAYMENT_INVOICE_ID_KEY)
      sessionStorage.removeItem(LEGACY_INVOICE_ID_KEY)
    }
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/** Read a stashed payment restore target without clearing it. */
export function peekPaymentRestoreTarget(): PaymentRestoreTarget | null {
  try {
    const paymentId =
      sessionStorage.getItem(PAYMENT_ID_KEY) || sessionStorage.getItem(LEGACY_PAYMENT_ID_KEY)
    if (!paymentId) return null
    return {
      paymentId,
      invoiceId:
        sessionStorage.getItem(PAYMENT_INVOICE_ID_KEY) ||
        sessionStorage.getItem(LEGACY_INVOICE_ID_KEY) ||
        undefined,
    }
  } catch {
    return null
  }
}

/** Clear stashed payment after the panel is explicitly closed. */
export function clearPaymentRestoreTarget(): void {
  try {
    sessionStorage.removeItem(PAYMENT_ID_KEY)
    sessionStorage.removeItem(PAYMENT_INVOICE_ID_KEY)
    sessionStorage.removeItem(LEGACY_PAYMENT_ID_KEY)
    sessionStorage.removeItem(LEGACY_INVOICE_ID_KEY)
  } catch {
    // Ignore.
  }
}

/** Persist which invoice detail to reopen after navigating away. */
export function stashInvoiceRestoreTarget(invoiceId: string): void {
  try {
    sessionStorage.setItem(INVOICE_ID_KEY, invoiceId)
  } catch {
    // Ignore.
  }
}

/** Read a stashed invoice id without clearing it. */
export function peekInvoiceRestoreTarget(): string | null {
  try {
    return sessionStorage.getItem(INVOICE_ID_KEY)
  } catch {
    return null
  }
}

/** Clear stashed invoice after the panel is explicitly closed. */
export function clearInvoiceRestoreTarget(): void {
  try {
    sessionStorage.removeItem(INVOICE_ID_KEY)
  } catch {
    // Ignore.
  }
}
