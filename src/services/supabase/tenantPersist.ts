import { HANDOFF_PLACEHOLDER_INVOICE_ID } from '../../data/batchFileStore'
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
  row: object,
  onConflict = 'id'
): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.from(table).upsert(row as Record<string, unknown>, { onConflict })
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
  const { error } = await supabase.from('invoices').upsert(row, { onConflict: 'id' })
  if (error) {
    console.error('[tenantPersist] invoices upsert failed:', error.message)
    throw new Error(error.message)
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

export interface HandoffStorageDocument {
  docId: string
  storagePath: string
  fileName: string
}

/** List documents uploaded via managed handoff before invoices exist. */
export async function listHandoffBatchDocuments(
  clientId: string,
  batchId: string
): Promise<HandoffStorageDocument[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const prefix = `${clientId}/${batchId}/${HANDOFF_PLACEHOLDER_INVOICE_ID}`
  const { data: docFolders, error } = await supabase.storage.from('batch-documents').list(prefix)
  if (error || !docFolders?.length) return []

  const folders = docFolders.filter(
    (folder) => folder.name && folder.name !== '.emptyFolderPlaceholder'
  )

  // Parallel folder probes — sequential listing was making Packets open feel stuck.
  const listed = await Promise.all(
    folders.map(async (folder) => {
      const docId = folder.name
      const { data: files } = await supabase.storage
        .from('batch-documents')
        .list(`${prefix}/${docId}`)
      const fileName = files?.find((f) => f.name && f.name !== '.emptyFolderPlaceholder')?.name
      if (!fileName) return null
      return {
        docId,
        storagePath: `${prefix}/${docId}/${fileName}`,
        fileName,
      } satisfies HandoffStorageDocument
    })
  )

  return listed.filter((item): item is HandoffStorageDocument => item != null)
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

/** Persist batch and invalidate tenant cache (includes draft shells; files stay in IndexedDB). */
export async function persistBatch(batch: Batch): Promise<void> {
  if (!isSupabaseConfigured()) return
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

export async function deleteInvoiceFromDb(invoiceId: string, clientId?: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  await remove('invoices', invoiceId)
  if (clientId) invalidateTenant(clientId)
}

export async function persistBroker(broker: Broker): Promise<void> {
  if (!isSupabaseConfigured()) return
  await upsert('brokers', brokerToRow(broker))
}

/** Reassign invoices and payments off a duplicate broker (caller deletes the row after). */
export async function persistBrokerMerge(args: {
  sourceId: string
  sourceName: string
  keepId: string
  keepName: string
  invoiceIds: string[]
}): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  const now = new Date().toISOString()
  const { error: invoiceError } = await supabase
    .from('invoices')
    .update({
      broker_id: args.keepId,
      broker_name: args.keepName,
      updated_at: now,
    })
    .eq('broker_id', args.sourceId)
  if (invoiceError) throw new Error(invoiceError.message)

  if (args.invoiceIds.length > 0) {
    const { error: paymentByInvoiceError } = await supabase
      .from('payments')
      .update({ broker_name: args.keepName })
      .in('invoice_id', args.invoiceIds)
    if (paymentByInvoiceError) throw new Error(paymentByInvoiceError.message)
  }

  const { error: paymentByNameError } = await supabase
    .from('payments')
    .update({ broker_name: args.keepName })
    .eq('broker_name', args.sourceName)
  if (paymentByNameError) throw new Error(paymentByNameError.message)

  const optionalTables: { table: string; column?: string }[] = [
    { table: 'broker_risk_profiles' },
    { table: 'broker_risk_alerts' },
    { table: 'broker_external_snapshots' },
    { table: 'broker_snapshot_changes' },
    { table: 'email_threads' },
    { table: 'email_review_items' },
  ]
  for (const { table } of optionalTables) {
    const { error } = await supabase
      .from(table)
      .update({ broker_id: args.keepId })
      .eq('broker_id', args.sourceId)
    if (error) {
      console.warn(`[tenantPersist] ${table} broker merge skipped:`, error.message)
    }
  }
}

/** Delete a broker catalog row after invoices have been moved off it. */
export async function deleteBrokerFromDb(brokerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  await remove('brokers', brokerId)
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
