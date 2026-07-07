import { mockInvoices, getInvoiceById, updateInvoiceAsync } from '../data/mockInvoices'
import type { Invoice, InvoiceNote } from '../types/invoice'
import { logAuditEvent } from '../utils/auditLogger'
import { syncBatchFees } from './batchFeeSync'
import { getDaysOutstanding } from '../utils/invoiceAging'

/** Invoices awaiting Credyx write-off approval. */
export function listPendingWriteOffs(): Invoice[] {
  return mockInvoices.filter((inv) => inv.status === 'write_off_pending')
}

export async function approveWriteOff(
  invoiceId: string,
  adminName: string,
  internalNote?: string
): Promise<Invoice | undefined> {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || invoice.status !== 'write_off_pending' || !invoice.write_off_request) return undefined

  const now = new Date().toISOString()
  const notes: InvoiceNote[] = [...(invoice.notes_history || [])]

  if (internalNote?.trim()) {
    notes.push({
      id: `note-wo-approve-${Date.now()}`,
      note: internalNote.trim(),
      created_by: adminName,
      created_at: now,
      type: 'note',
      visibility: 'internal',
    })
  }

  const updated = await updateInvoiceAsync(invoiceId, {
    status: 'written_off',
    paid_amount: invoice.write_off_request.received_amount,
    days_since_expected: 0,
    notes_history: notes,
    write_off_request: {
      ...invoice.write_off_request,
      resolved_at: now,
      resolved_by: adminName,
      resolution: 'approved',
      internal_note: internalNote?.trim() || invoice.write_off_request.internal_note,
    },
    updated_at: now,
  })

  if (updated?.batch_id) {
    syncBatchFees(updated.batch_id)
  }

  if (updated) {
    logAuditEvent(
      'invoice_closed',
      'invoice',
      updated.id,
      updated.invoice_number,
      `${adminName} approved write-off on ${updated.invoice_number}`,
      'admin-portal',
      adminName,
      'Admin',
      undefined,
      { close_type: 'written_off', approved_by: adminName }
    )
  }

  return updated
}

export async function denyWriteOff(
  invoiceId: string,
  adminName: string,
  opts: { internalNote: string; clientNote?: string }
): Promise<Invoice | undefined> {
  const invoice = getInvoiceById(invoiceId)
  if (!invoice || invoice.status !== 'write_off_pending' || !invoice.write_off_request) return undefined
  if (!opts.internalNote.trim()) return undefined

  const now = new Date().toISOString()
  const notes: InvoiceNote[] = [...(invoice.notes_history || [])]

  notes.push({
    id: `note-wo-deny-int-${Date.now()}`,
    note: opts.internalNote.trim(),
    created_by: adminName,
    created_at: now,
    type: 'note',
    visibility: 'internal',
  })

  if (opts.clientNote?.trim()) {
    notes.push({
      id: `note-wo-deny-client-${Date.now()}`,
      note: opts.clientNote.trim(),
      created_by: adminName,
      created_at: now,
      type: 'client_note',
      visibility: 'client',
    })
  }

  const received = invoice.write_off_request.received_amount
  const restoredStatus = { ...invoice, status: 'approved' as const, paid_amount: received }

  const updated = await updateInvoiceAsync(invoiceId, {
    status: 'approved',
    paid_amount: received,
    days_since_expected: getDaysOutstanding(restoredStatus),
    notes_history: notes,
    write_off_request: {
      ...invoice.write_off_request,
      resolved_at: now,
      resolved_by: adminName,
      resolution: 'denied',
      internal_note: opts.internalNote.trim(),
    },
    updated_at: now,
  })

  if (updated) {
    logAuditEvent(
      'invoice_closed',
      'invoice',
      updated.id,
      updated.invoice_number,
      `${adminName} denied write-off on ${updated.invoice_number}`,
      'admin-portal',
      adminName,
      'Admin',
      undefined,
      { close_type: 'write_off_denied', shortfall: invoice.write_off_request.shortfall }
    )
  }

  return updated
}
