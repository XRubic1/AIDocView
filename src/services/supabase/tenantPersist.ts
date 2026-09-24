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
import {
  ensureUniqueClientInvoiceNumber,
  formatClientInvoiceNumber,
  isSystemStyleInvoiceNumber,
  parseInvoiceNumberSequence,
} from '../../utils/clientInvoiceNumbers'

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

function isInvoiceNumberUniqueViolation(message: string): boolean {
  return /invoices_client_number_uidx|duplicate key.*invoice_number/i.test(message)
}

/**
 * Next free system number among peer DB rows only (ignores this invoice's own row / memory).
 */
function nextNumberAmongPeers(preferred: string, peerNumbers: string[]): string {
  const preferredTrim = preferred.trim()
  const peerTaken = (candidate: string) => {
    const c = candidate.trim().toLowerCase()
    if (!c) return false
    if (peerNumbers.some((n) => n.trim().toLowerCase() === c)) return true
    if (!isSystemStyleInvoiceNumber(candidate)) return false
    const seq = parseInvoiceNumberSequence(candidate)
    if (seq == null) return false
    return peerNumbers.some((n) => {
      if (!isSystemStyleInvoiceNumber(n)) return false
      return parseInvoiceNumberSequence(n) === seq
    })
  }

  if (preferredTrim && !peerTaken(preferredTrim)) return preferredTrim

  let max = 0
  for (const num of peerNumbers) {
    if (!isSystemStyleInvoiceNumber(num)) continue
    const seq = parseInvoiceNumberSequence(num)
    if (seq != null && seq > max) max = seq
  }
  let seq = max
  for (let i = 0; i < 10_000; i++) {
    seq += 1
    const candidate = formatClientInvoiceNumber(seq)
    if (!peerTaken(candidate)) return candidate
  }
  return formatClientInvoiceNumber(Date.now() % 1_000_000)
}

/**
 * Pick a free invoice number for this client, excluding this invoice's id
 * so an existing row does not treat its own number as taken.
 */
async function remapInvoiceNumberAvoidingPeers(invoice: Invoice): Promise<string> {
  const supabase = getSupabase()
  if (!supabase) {
    return ensureUniqueClientInvoiceNumber(invoice.client_id, invoice.invoice_number)
  }

  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('client_id', invoice.client_id)
      .limit(5000)

    if (error) {
      console.warn('[persistInvoice] peer number load failed', error.message)
      return ensureUniqueClientInvoiceNumber(invoice.client_id, invoice.invoice_number)
    }

    const peerNumbers = (data ?? [])
      .filter((row) => String((row as { id?: string }).id) !== invoice.id)
      .map((row) => String((row as { invoice_number?: string }).invoice_number ?? '').trim())
      .filter(Boolean)

    return nextNumberAmongPeers(invoice.invoice_number, peerNumbers)
  } catch (err) {
    console.warn('[persistInvoice] remap failed', err)
    return ensureUniqueClientInvoiceNumber(invoice.client_id, invoice.invoice_number)
  }
}

/** Persist invoice and invalidate tenant cache. */
export async function persistInvoice(invoice: Invoice): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  const attemptUpsert = async (row: ReturnType<typeof invoiceToRow>) =>
    supabase.from('invoices').upsert(row, { onConflict: 'id' })

  let row = invoiceToRow(invoice)
  let { error } = await attemptUpsert(row)

  // Another row already owns this (client_id, invoice_number) — bump and retry once.
  if (error && isInvoiceNumberUniqueViolation(error.message)) {
    const remapped = await remapInvoiceNumberAvoidingPeers(invoice)
    invoice.invoice_number = remapped
    const mem = getInvoiceById(invoice.id)
    if (mem) mem.invoice_number = remapped
    row = invoiceToRow(invoice)
    ;({ error } = await attemptUpsert(row))
  }

  if (error) {
    console.error('[tenantPersist] invoices upsert failed:', error.message)
    throw new Error(error.message)
  }

  invalidateTenant(invoice.client_id)
}

/** Upload batch invoice paperwork; returns storage paths keyed by doc id. */
export type BatchDocumentUploadProgress = {
  /** File currently uploading (1-based). */
  current: number
  total: number
  fileName: string
}

export async function uploadBatchInvoiceDocuments(
  clientId: string,
  batchId: string,
  invoiceId: string,
  filesByDocId: Map<string, File>,
  onFileProgress?: (info: BatchDocumentUploadProgress) => void
): Promise<Record<string, string>> {
  const supabase = getSupabase()
  if (!supabase) return {}

  const entries = Array.from(filesByDocId.entries())
  const total = entries.length
  const paths: Record<string, string> = {}

  for (let i = 0; i < entries.length; i += 1) {
    const [docId, file] = entries[i]
    onFileProgress?.({
      current: i + 1,
      total,
      fileName: file.name,
    })
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
  /** Invoice folder id when the file was stored under an invoice (AI upload). */
  invoiceId?: string
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

const SKIP_STORAGE_NAMES = new Set(['.emptyFolderPlaceholder'])

/**
 * List every stored batch document (AI invoice folders + managed handoff).
 * Paths look like `{clientId}/{batchId}/{invoiceId}/{docId}/{fileName}`.
 */
export async function listStoredBatchDocuments(
  clientId: string,
  batchId: string
): Promise<HandoffStorageDocument[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const root = `${clientId}/${batchId}`
  const { data: invoiceFolders, error } = await supabase.storage.from('batch-documents').list(root)
  if (error || !invoiceFolders?.length) return []

  const folders = invoiceFolders.filter(
    (folder) => folder.name && !SKIP_STORAGE_NAMES.has(folder.name)
  )

  const nested = await Promise.all(
    folders.map(async (invoiceFolder) => {
      const invoicePrefix = `${root}/${invoiceFolder.name}`
      const { data: docFolders } = await supabase.storage.from('batch-documents').list(invoicePrefix)
      const docEntries = (docFolders ?? []).filter(
        (folder) => folder.name && !SKIP_STORAGE_NAMES.has(folder.name)
      )

      const files = await Promise.all(
        docEntries.map(async (entry) => {
          const docPrefix = `${invoicePrefix}/${entry.name}`
          const { data: inner } = await supabase.storage.from('batch-documents').list(docPrefix)
          const fileName = inner?.find((f) => f.name && !SKIP_STORAGE_NAMES.has(f.name))?.name
          if (fileName) {
            return {
              docId: entry.name,
              storagePath: `${docPrefix}/${fileName}`,
              fileName,
              invoiceId: invoiceFolder.name,
            } satisfies HandoffStorageDocument
          }
          if (/\.(pdf|jpe?g|png)$/i.test(entry.name)) {
            return {
              docId: entry.name.replace(/\.[^.]+$/, ''),
              storagePath: docPrefix,
              fileName: entry.name,
              invoiceId: invoiceFolder.name,
            } satisfies HandoffStorageDocument
          }
          return null
        })
      )

      return files.filter((item) => item != null) as HandoffStorageDocument[]
    })
  )

  return nested.flat()
}

/** Download a batch document from storage (MIME sniffed from bytes). */
export async function downloadBatchDocument(
  storagePath: string,
  fileName: string,
  mimeType: string
): Promise<File | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase.storage.from('batch-documents').download(storagePath)
  if (error || !data) return null

  const { fileWithSniffedMime } = await import('../../utils/fileMimeSniff')
  return fileWithSniffedMime(data, fileName, mimeType)
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

/** Persist an inbox thread (invoice × broker conversation). */
export async function persistEmailThread(thread: {
  id: string
  invoice_id: string
  broker_id: string
  client_id: string
  subject: string
  created_at: string
  updated_at: string
}): Promise<void> {
  if (!isSupabaseConfigured()) return
  await upsert('email_threads', thread)
}

/** Persist one inbound/outbound email message. */
export async function persistEmailMessage(message: {
  id: string
  thread_id: string
  direction: 'inbound' | 'outbound'
  from_address: string
  to_address: string
  subject: string
  body_text: string
  sent_at: string
  template_id?: string
  message_id?: string
}): Promise<void> {
  if (!isSupabaseConfigured()) return
  await upsert('email_messages', {
    id: message.id,
    thread_id: message.thread_id,
    direction: message.direction,
    from_address: message.from_address,
    to_address: message.to_address,
    subject: message.subject,
    body_text: message.body_text,
    sent_at: message.sent_at,
    template_id: message.template_id ?? null,
    message_id: message.message_id ?? null,
  })
}

/** Persist staff review queue row (inbound classify / confirm). */
export async function persistEmailReview(review: {
  id: string
  created_at: string
  status: 'pending_review' | 'confirmed' | 'dismissed'
  thread_id?: string | null
  invoice_id: string | null
  broker_id: string | null
  client_id: string | null
  classification: string
  proposed_actions: string[]
  summary: string
  body_text?: string
  from_address?: string
  to_address?: string
  subject?: string
  load_number?: string | null
  invoice_number?: string | null
  confirmed_at?: string | null
  confirmed_by?: string | null
}): Promise<void> {
  if (!isSupabaseConfigured()) return
  await upsert('email_review_items', {
    id: review.id,
    created_at: review.created_at,
    status: review.status,
    thread_id: review.thread_id ?? null,
    invoice_id: review.invoice_id,
    broker_id: review.broker_id,
    client_id: review.client_id,
    classification: review.classification,
    proposed_actions: review.proposed_actions,
    summary: review.summary,
    body_text: review.body_text ?? '',
    from_address: review.from_address ?? '',
    to_address: review.to_address ?? '',
    subject: review.subject ?? '',
    load_number: review.load_number ?? null,
    invoice_number: review.invoice_number ?? null,
    confirmed_at: review.confirmed_at ?? null,
    confirmed_by: review.confirmed_by ?? null,
  })
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
  const { fileWithSniffedMime } = await import('../../utils/fileMimeSniff')
  return fileWithSniffedMime(data, fileName, mimeType)
}
