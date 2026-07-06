import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import type { Invoice } from '../../types/invoice'
import type { Payment } from '../../types/payment'
import type { Batch } from '../../data/mockBatches'
import type { Broker } from '../../types/broker'
import type { Notification } from '../../types/notification'
import type { AuditLog } from '../../types/audit'
import type { ClientDocument } from '../../types/clientDocument'
import { clearClientTenantCache } from '../../data/clientDemoData'
import { getInvoiceById } from '../../data/mockInvoices'
import {
  batchToRow,
  invoiceToRow,
  paymentToRow,
} from './tenantMappers'
import { brokerToRow } from './brokerMappers'
import {
  auditLogToRow,
  clientDocumentToRow,
  notificationToRow,
} from './platformMappers'

function invalidateTenant(clientId?: string): void {
  if (clientId) clearClientTenantCache(clientId)
}

async function upsert(
  table: string,
  row: Record<string, unknown>,
  onConflict = 'id'
): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.from(table).upsert(row, { onConflict })
  if (error) {
    console.error(`[tenantPersist] ${table} upsert failed:`, error.message)
    throw new Error(error.message)
  }
}

async function remove(table: string, id: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) {
    console.error(`[tenantPersist] ${table} delete failed:`, error.message)
    throw new Error(error.message)
  }
}

/** Persist invoice and invalidate tenant cache. */
export async function persistInvoice(invoice: Invoice): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  const row = invoiceToRow(invoice)
  const { data: existing, error: fetchError } = await supabase
    .from('invoices')
    .select('id')
    .eq('id', invoice.id)
    .maybeSingle()

  if (fetchError) {
    console.error('[tenantPersist] invoices lookup failed:', fetchError.message)
    throw new Error(fetchError.message)
  }

  if (existing) {
    const { error } = await supabase.from('invoices').update(row).eq('id', invoice.id)
    if (error) {
      console.error('[tenantPersist] invoices update failed:', error.message)
      throw new Error(error.message)
    }
  } else {
    const { error } = await supabase.from('invoices').insert(row)
    if (error) {
      console.error('[tenantPersist] invoices insert failed:', error.message)
      throw new Error(error.message)
    }
  }

  invalidateTenant(invoice.client_id)
}

/** Upload batch invoice paperwork; returns storage paths keyed by doc id. */
export async function uploadBatchInvoiceDocuments(
  clientId: string,
  batchId: string,
  invoiceId: string,
  filesByDocId: Map<string, File>
): Promise<Record<string, string>> {
  const supabase = getSupabase()
  if (!supabase) return {}

  const paths: Record<string, string> = {}
  for (const [docId, file] of filesByDocId.entries()) {
    const path = `${clientId}/${batchId}/${invoiceId}/${docId}/${file.name}`
    const { error } = await supabase.storage.from('batch-documents').upload(path, file, {
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    })
    if (error) throw new Error(error.message)
    paths[docId] = path
  }
  return paths
}

/** Download a batch document from storage. */
export async function downloadBatchDocument(
  storagePath: string,
  fileName: string,
  mimeType: string
): Promise<File | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase.storage.from('batch-documents').download(storagePath)
  if (error || !data) return null
  return new File([data], fileName, { type: mimeType })
}

/** Upload new files and persist invoice document metadata. */
export async function saveInvoiceDocuments(
  invoice: Invoice,
  filesByDocId: Map<string, File>,
  documentDocIds: string[],
  documentsCount: number
): Promise<Invoice> {
  const inv = getInvoiceById(invoice.id)
  if (!inv) throw new Error('Invoice not found')

  let storagePaths = { ...(inv.document_storage_paths ?? {}) }

  if (isSupabaseConfigured() && inv.batch_id && filesByDocId.size > 0) {
    const uploaded = await uploadBatchInvoiceDocuments(
      inv.client_id,
      inv.batch_id,
      inv.id,
      filesByDocId
    )
    storagePaths = { ...storagePaths, ...uploaded }
  }

  const updated: Invoice = {
    ...inv,
    document_doc_ids: documentDocIds,
    documents_count: documentsCount,
    document_storage_paths:
      Object.keys(storagePaths).length > 0 ? storagePaths : undefined,
  }

  Object.assign(inv, updated)
  await persistInvoice(updated)
  return updated
}

/** Update document list metadata (reorder/delete) and optionally remove storage objects. */
export async function updateInvoiceDocumentMetadata(
  invoice: Invoice,
  documentDocIds: string[],
  documentsCount: number,
  removeDocIds: string[] = []
): Promise<Invoice> {
  const inv = getInvoiceById(invoice.id)
  if (!inv) throw new Error('Invoice not found')

  const storagePaths = { ...(inv.document_storage_paths ?? {}) }
  const pathsToRemove: string[] = []

  for (const docId of removeDocIds) {
    const path = storagePaths[docId]
    if (path) pathsToRemove.push(path)
    delete storagePaths[docId]
  }

  if (isSupabaseConfigured() && pathsToRemove.length > 0) {
    const supabase = getSupabase()
    if (supabase) {
      const { error } = await supabase.storage.from('batch-documents').remove(pathsToRemove)
      if (error) console.error('[tenantPersist] document delete failed:', error.message)
    }
  }

  const updated: Invoice = {
    ...inv,
    document_doc_ids: documentDocIds,
    documents_count: documentsCount,
    document_storage_paths:
      Object.keys(storagePaths).length > 0 ? storagePaths : undefined,
  }

  Object.assign(inv, updated)
  await persistInvoice(updated)
  return updated
}

/** Persist batch and invalidate tenant cache (drafts stay local until submit). */
export async function persistBatch(batch: Batch): Promise<void> {
  if (!isSupabaseConfigured()) return
  if (batch.status === 'draft') return
  await upsert('batches', batchToRow(batch))
  invalidateTenant(batch.client_id)
}

/** Persist payment; resolves client_id from invoice when omitted. */
export async function persistPayment(payment: Payment, clientId?: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  const resolvedClientId = clientId ?? getInvoiceById(payment.invoice_id)?.client_id
  if (!resolvedClientId) {
    console.warn('[tenantPersist] payment missing client_id', payment.id)
    return
  }
  await upsert('payments', paymentToRow(payment, resolvedClientId))
  invalidateTenant(resolvedClientId)
}

export async function deleteBatchFromDb(batchId: string, clientId?: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  await remove('batches', batchId)
  if (clientId) invalidateTenant(clientId)
}

export async function persistBroker(broker: Broker): Promise<void> {
  if (!isSupabaseConfigured()) return
  await upsert('brokers', brokerToRow(broker))
}

export async function persistNotification(
  notification: Notification,
  clientId: string
): Promise<void> {
  if (!isSupabaseConfigured()) return
  await upsert('notifications', notificationToRow(notification, clientId))
  invalidateTenant(clientId)
}

export async function persistAuditLog(log: AuditLog): Promise<void> {
  if (!isSupabaseConfigured()) return
  await upsert('audit_logs', auditLogToRow(log))
}

export async function persistClientDocument(
  doc: ClientDocument,
  storagePath?: string | null
): Promise<void> {
  if (!isSupabaseConfigured()) return
  await upsert('client_documents', clientDocumentToRow(doc, storagePath))
  invalidateTenant(doc.client_id)
}

export async function deleteClientDocumentFromDb(
  documentId: string,
  clientId: string
): Promise<void> {
  if (!isSupabaseConfigured()) return
  await remove('client_documents', documentId)
  invalidateTenant(clientId)
}

/** Upload file to client-documents bucket; returns storage path. */
export async function uploadClientDocumentFile(
  clientId: string,
  documentId: string,
  file: File
): Promise<string> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase not configured')

  const path = `${clientId}/${documentId}/${file.name}`
  const { error } = await supabase.storage.from('client-documents').upload(path, file, {
    upsert: true,
    contentType: file.type || 'application/octet-stream',
  })
  if (error) throw new Error(error.message)
  return path
}

/** Download file from storage into a File blob. */
export async function downloadClientDocumentFile(
  storagePath: string,
  fileName: string,
  mimeType: string
): Promise<File | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase.storage.from('client-documents').download(storagePath)
  if (error || !data) return null
  return new File([data], fileName, { type: mimeType })
}
