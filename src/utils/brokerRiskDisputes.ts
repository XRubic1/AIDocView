/**
 * Structured carrier↔broker disputes for Broker Risk review.
 * Pulls invoice disputes + payment-receipt disputes (not note keyword hints).
 */
import type { Invoice, InvoiceDispute } from '../types/invoice'
import type { Payment, PaymentReceiptDispute } from '../types/payment'
import { getDisputeReasonLabel } from '../services/clientInvoiceActions'
import { getPaymentReceiptDisputeLabel } from '../services/paymentReceiptConfirmationService'

export type BrokerDisputeKind = 'invoice' | 'payment_receipt'

export type BrokerDisputeRecord = {
  id: string
  kind: BrokerDisputeKind
  invoiceId: string
  invoiceNumber: string
  reason: string
  reasonLabel: string
  description: string
  status: InvoiceDispute['status'] | PaymentReceiptDispute['status']
  created_at: string
  created_by?: string
  /** Open or under review — still active for risk review. */
  isOpen: boolean
}

function isActiveStatus(status: string): boolean {
  return status === 'open' || status === 'under_review'
}

function fromInvoiceDispute(
  invoice: Invoice,
  dispute: InvoiceDispute
): BrokerDisputeRecord {
  return {
    id: dispute.id,
    kind: 'invoice',
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    reason: dispute.reason,
    reasonLabel: getDisputeReasonLabel(dispute.reason),
    description: dispute.description?.trim() || '',
    status: dispute.status,
    created_at: dispute.created_at,
    created_by: dispute.created_by,
    isOpen: isActiveStatus(dispute.status),
  }
}

function fromPaymentDispute(
  payment: Payment,
  dispute: PaymentReceiptDispute
): BrokerDisputeRecord {
  return {
    id: dispute.id,
    kind: 'payment_receipt',
    invoiceId: payment.invoice_id,
    invoiceNumber: payment.invoice_number,
    reason: dispute.reason,
    reasonLabel: getPaymentReceiptDisputeLabel(dispute.reason),
    description: dispute.description?.trim() || '',
    status: dispute.status,
    created_at: dispute.created_at,
    created_by: dispute.created_by,
    isOpen: isActiveStatus(dispute.status),
  }
}

/**
 * Collect all disputes for invoices (and their payments) with this broker.
 * Newest first.
 */
export function collectBrokerDisputes(
  invoices: Invoice[],
  payments: Payment[] = []
): BrokerDisputeRecord[] {
  const invoiceIds = new Set(invoices.map((i) => i.id))
  const rows: BrokerDisputeRecord[] = []

  for (const inv of invoices) {
    for (const d of inv.disputes ?? []) {
      rows.push(fromInvoiceDispute(inv, d))
    }
  }

  for (const payment of payments) {
    if (!invoiceIds.has(payment.invoice_id)) continue
    if (!payment.dispute) continue
    rows.push(fromPaymentDispute(payment, payment.dispute))
  }

  return rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

/** Active (open / under review) disputes only. */
export function getOpenBrokerDisputes(
  invoices: Invoice[],
  payments: Payment[] = []
): BrokerDisputeRecord[] {
  return collectBrokerDisputes(invoices, payments).filter((d) => d.isOpen)
}

/** Count how many times each reason appears (open disputes preferred for summary). */
export function summarizeBrokerDisputeReasons(
  disputes: BrokerDisputeRecord[]
): Array<{ reason: string; label: string; count: number; openCount: number }> {
  const map = new Map<
    string,
    { reason: string; label: string; count: number; openCount: number }
  >()
  for (const d of disputes) {
    const cur = map.get(d.reason) ?? {
      reason: d.reason,
      label: d.reasonLabel,
      count: 0,
      openCount: 0,
    }
    cur.count += 1
    if (d.isOpen) cur.openCount += 1
    map.set(d.reason, cur)
  }
  return [...map.values()].sort((a, b) => b.openCount - a.openCount || b.count - a.count)
}

/** One-line labels for evidence bullets / risk metrics. */
export function brokerDisputeEvidenceLines(
  disputes: BrokerDisputeRecord[],
  max = 3
): string[] {
  const open = disputes.filter((d) => d.isOpen)
  const source = open.length > 0 ? open : disputes
  if (source.length === 0) return []

  const byReason = summarizeBrokerDisputeReasons(source)
  const lines: string[] = []
  const openTotal = open.length
  if (openTotal > 0) {
    lines.push(
      `${openTotal} open dispute${openTotal === 1 ? '' : 's'} with this broker` +
        (byReason[0] ? ` (e.g. ${byReason[0].label})` : '')
    )
  }
  for (const row of byReason.slice(0, max)) {
    if (lines.length >= max) break
    const scope = row.openCount > 0 ? `${row.openCount} open` : `${row.count} total`
    lines.push(`${row.label}: ${scope}`)
  }
  return lines.slice(0, max)
}
