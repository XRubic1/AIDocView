import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { getOpenDisputes } from '../services/clientInvoiceActions'

export type AdminInvoiceAttentionReason = 'receipt_dispute' | 'invoice_dispute'

export type AdminInvoiceAttention = {
  needsAttention: boolean
  /** Short label for list row badge */
  label: string
  reason: AdminInvoiceAttentionReason | null
}

/**
 * Credyx Invoice Search — invoices that need admin action:
 * - Client disputed a Credyx-posted payment (receipt not confirmed / rejected)
 * - Open or under-review invoice disputes awaiting Credyx response
 */
export function getAdminInvoiceAttention(
  invoice: Invoice,
  payments: Payment[]
): AdminInvoiceAttention {
  const invoicePayments = payments.filter((p) => p.invoice_id === invoice.id)

  // Client disputed / rejected receipt of a Credyx-posted payment.
  const disputedPayment = invoicePayments.find((p) => p.status === 'disputed')
  if (disputedPayment) {
    return {
      needsAttention: true,
      label: 'Payment disputed',
      reason: 'receipt_dispute',
    }
  }

  const openInvoiceDisputes = getOpenDisputes(invoice)
  if (openInvoiceDisputes.length > 0) {
    return {
      needsAttention: true,
      label:
        openInvoiceDisputes.length > 1
          ? `${openInvoiceDisputes.length} disputes`
          : 'Dispute open',
      reason: 'invoice_dispute',
    }
  }

  return { needsAttention: false, label: '', reason: null }
}
