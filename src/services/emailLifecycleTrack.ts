/**
 * Paperwork-track start helpers — kept separate from emailLifecycleService
 * so paperworkSender can call them without a circular import.
 */
import { getInvoiceById, updateInvoiceAsync } from '../data/mockInvoices'
import { upsertEmailReview } from '../data/emailInboxStore'
import type { InvoiceEmailLifecycle } from '../types/emailLifecycle'
import type { Invoice } from '../types/invoice'

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Start the paperwork-status clock after PPW is actually delivered. */
export async function startPaperworkTrack(invoiceId: string, deliveredAt = new Date().toISOString()): Promise<void> {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice) return
  const lifecycle: InvoiceEmailLifecycle = {
    ...(invoice.email_lifecycle ?? { paperwork_status: 'unknown' }),
    paperwork_status: invoice.email_lifecycle?.paperwork_status ?? 'unknown',
    paperwork: {
      ...(invoice.email_lifecycle?.paperwork ?? {}),
      startedAt: invoice.email_lifecycle?.paperwork?.startedAt ?? deliveredAt,
    },
  }
  await updateInvoiceAsync(invoiceId, { email_lifecycle: lifecycle })
}

/** Broker does not accept packet email — staff must deliver another way. */
export function queuePacketDeliveryTask(invoice: Invoice): void {
  upsertEmailReview({
    id: newId('review'),
    created_at: new Date().toISOString(),
    status: 'pending_review',
    invoice_id: invoice.id,
    broker_id: invoice.broker_id,
    client_id: invoice.client_id,
    classification: 'unclear',
    proposed_actions: ['staff_call'],
    summary: `PACKET_DELIVERY: ${invoice.broker_name} does not accept packet email. Deliver paperwork another way, then confirm.`,
    body_text: '',
    invoice_number: invoice.invoice_number,
    load_number: invoice.load_number,
  })
}
