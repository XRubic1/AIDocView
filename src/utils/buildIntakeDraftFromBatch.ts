import { getBatchById } from '../data/mockBatches'
import { mergeInvoice, mockInvoices } from '../data/mockInvoices'
import { getBatchFiles, mergeBatchFiles } from '../data/batchFileStore'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import {
  invoiceRowToInvoice,
  type InvoiceRow,
} from '../services/supabase/tenantMappers'
import type { BatchIntakeDraft, CredyxInvoiceDraft } from '../types/credyxBatch'
import type { Invoice } from '../types/invoice'
import type { DocSortFingerprint, DocSortKind, DocSortResult } from '../products/docSort/types'
import { classifyPacketDoc } from './batchPacketDocs'
import { listHandoffDocumentMeta } from './resolveHandoffDocuments'
import { resolveInvoiceDocuments } from './resolveInvoiceDocuments'

function emptySortResult(totalDocuments: number): DocSortResult {
  return {
    sortedAt: new Date().toISOString(),
    groups: [],
    unmatchedRateCons: [],
    unmatchedBols: [],
    otherDocuments: [],
    totalDocuments,
  }
}

/** Best-effort DocSort kind from a stored file name. */
function kindFromFileName(fileName: string): DocSortKind {
  const category = classifyPacketDoc({ fileName })
  if (category === 'rate_confirmation') return 'rate_confirmation'
  if (category === 'bol') return 'bill_of_lading'
  return 'other'
}

function fingerprintFromFile(
  docId: string,
  file: File,
  context?: { loadNumber?: string; broker?: string }
): DocSortFingerprint {
  return {
    docId,
    fileName: file.name,
    kind: kindFromFileName(file.name),
    confidence: 0.5,
    loadNumbers: context?.loadNumber ? [context.loadNumber] : [],
    broker: context?.broker || undefined,
  }
}

function fingerprintStub(
  docId: string,
  fileName = docId,
  context?: { loadNumber?: string; broker?: string }
): DocSortFingerprint {
  return {
    docId,
    fileName,
    kind: kindFromFileName(fileName),
    confidence: 0.3,
    loadNumbers: context?.loadNumber ? [context.loadNumber] : [],
    broker: context?.broker || undefined,
  }
}

/** Document ids attached to an invoice, including storage-path fallbacks. */
function invoiceDocumentIds(invoice: Invoice, extraIds: string[] = []): string[] {
  const fromPaths = Object.keys(invoice.document_storage_paths ?? {}).filter(
    (id) => !id.startsWith('invoice-pdf-')
  )
  return [
    ...new Set([...(invoice.document_doc_ids ?? []), ...fromPaths, ...extraIds]),
  ].filter((id) => !id.startsWith('invoice-pdf-'))
}

/**
 * Map a persisted Credyx invoice into a packet draft for the Packets rework UI.
 */
export function invoiceToCredyxDraft(
  invoice: Invoice,
  fileById: Map<string, File>,
  extraDocIds: string[] = []
): CredyxInvoiceDraft {
  const groupId = invoice.doc_sort_group_id || invoice.id
  const docIds = invoiceDocumentIds(invoice, extraDocIds)
  const rateCons: DocSortFingerprint[] = []
  const bols: DocSortFingerprint[] = []
  const other: DocSortFingerprint[] = []
  const context = {
    loadNumber: invoice.load_number,
    broker: invoice.broker_name,
  }

  for (const docId of docIds) {
    const file = fileById.get(docId)
    const fp = file
      ? fingerprintFromFile(docId, file, context)
      : fingerprintStub(docId, docId, context)
    if (fp.kind === 'rate_confirmation') rateCons.push(fp)
    else if (fp.kind === 'bill_of_lading') bols.push(fp)
    else other.push(fp)
  }

  const invoicePdfKey = `invoice-pdf-${groupId}`
  const invoice_pdf = fileById.get(invoicePdfKey)

  return {
    draftId: invoice.id,
    groupId,
    invoice_number: invoice.invoice_number,
    load_number: invoice.load_number ?? '',
    broker_name: invoice.broker_name ?? '',
    broker_id: invoice.broker_id ?? '',
    amount: invoice.amount,
    invoice_date: invoice.invoice_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    carrier_name: invoice.client_name,
    rate_missing: !(invoice.amount > 0),
    confirmed: true,
    document_doc_ids: docIds,
    invoice_pdf,
    fingerprints: { rateCons, bols, other },
  }
}

function parseSortSnapshot(raw?: string): DocSortResult | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DocSortResult & { sortResult?: DocSortResult }
    if (parsed.sortResult?.groups) return parsed.sortResult
    if (Array.isArray(parsed.groups)) return parsed
  } catch {
    /* ignore bad snapshot */
  }
  return null
}

/**
 * Collect invoices for a batch from the in-memory store.
 * Matches by batch_id, or by batch_number + client when batch_id is missing/stale.
 */
export function collectLocalInvoicesForBatch(
  batchId: string,
  batchNumber: string,
  clientId: string
): Invoice[] {
  const byId = new Map<string, Invoice>()

  for (const inv of mockInvoices) {
    if (inv.batch_id === batchId) {
      byId.set(inv.id, inv)
      continue
    }
    if (
      inv.client_id === clientId &&
      inv.batch_number === batchNumber &&
      (!inv.batch_id || inv.batch_id === batchId)
    ) {
      byId.set(inv.id, inv)
    }
  }

  return [...byId.values()]
}

/** Load invoices from Supabase when the local store has none for this batch. */
async function fetchInvoicesForBatchFromDb(
  batchId: string,
  batchNumber: string,
  clientId: string
): Promise<Invoice[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = getSupabase()
  if (!supabase) return []

  try {
    const byIdRes = await supabase.from('invoices').select('*').eq('batch_id', batchId)
    if (byIdRes.error) {
      console.warn('[hydrateIntakeDraftFromBatch] invoice fetch failed', byIdRes.error.message)
      return []
    }

    let rows = (byIdRes.data as InvoiceRow[] | null) ?? []
    if (rows.length === 0) {
      const byNumberRes = await supabase
        .from('invoices')
        .select('*')
        .eq('batch_number', batchNumber)
        .eq('client_id', clientId)
      if (byNumberRes.error) {
        console.warn(
          '[hydrateIntakeDraftFromBatch] invoice fetch by number failed',
          byNumberRes.error.message
        )
        return []
      }
      rows = (byNumberRes.data as InvoiceRow[] | null) ?? []
    }

    const invoices = rows.map(invoiceRowToInvoice)
    for (const inv of invoices) {
      if (!inv.batch_id) inv.batch_id = batchId
      mergeInvoice(inv)
    }
    return invoices
  } catch (err) {
    console.warn('[hydrateIntakeDraftFromBatch] invoice fetch threw', err)
    return []
  }
}

async function resolveInvoicesForBatch(
  batchId: string,
  batchNumber: string,
  clientId: string
): Promise<Invoice[]> {
  const local = collectLocalInvoicesForBatch(batchId, batchNumber, clientId)
  if (local.length > 0) return local
  return fetchInvoicesForBatchFromDb(batchId, batchNumber, clientId)
}

/**
 * Hydrate Packets draft quickly — metadata + in-memory files only.
 * PDF bodies are fetched later via prefetch / on-demand (keeps open time to a few seconds).
 */
export async function hydrateIntakeDraftFromBatch(
  batchId: string
): Promise<BatchIntakeDraft | null> {
  const batch = getBatchById(batchId)
  if (!batch) return null

  const invoices = await resolveInvoicesForBatch(
    batchId,
    batch.batch_number,
    batch.client_id
  )
  const fileById = new Map(getBatchFiles(batchId))
  const fileNameById = new Map<string, string>()
  const storagePathsByDocId: Record<string, string> = {}
  const extraDocIdsByInvoice = new Map<string, string[]>()

  // Handoff list only (no PDF downloads).
  try {
    const listed = await listHandoffDocumentMeta(batchId, batch.client_id)
    for (const item of listed) {
      fileNameById.set(item.docId, item.fileName)
      storagePathsByDocId[item.docId] = item.storagePath
    }
  } catch (err) {
    console.warn('[hydrateIntakeDraftFromBatch] handoff list failed', err)
  }

  // Invoice doc ids + paths from rows; use memory files only (no storage download here).
  for (const inv of invoices) {
    const extraIds: string[] = []
    const paths = inv.document_storage_paths ?? {}
    for (const [docId, storagePath] of Object.entries(paths)) {
      storagePathsByDocId[docId] = storagePath
      if (!fileNameById.has(docId)) {
        fileNameById.set(docId, storagePath.split('/').pop() ?? docId)
      }
      if (!docId.startsWith('invoice-pdf-')) extraIds.push(docId)
    }
    for (const docId of inv.document_doc_ids ?? []) {
      if (!docId.startsWith('invoice-pdf-')) extraIds.push(docId)
    }

    try {
      for (const doc of resolveInvoiceDocuments(inv)) {
        fileNameById.set(doc.id, doc.name)
        if (!fileById.has(doc.id) && doc.file) fileById.set(doc.id, doc.file)
        if (doc.id && !doc.id.startsWith('invoice-pdf-')) extraIds.push(doc.id)
      }
    } catch {
      /* keep metadata */
    }

    if (extraIds.length > 0) {
      extraDocIdsByInvoice.set(inv.id, [...new Set(extraIds)])
    }
  }

  if (fileById.size > 0) {
    mergeBatchFiles(batchId, fileById)
  }

  const drafts = invoices.map((inv) =>
    invoiceToCredyxDraft(inv, fileById, extraDocIdsByInvoice.get(inv.id) ?? [])
  )
  const assignedIds = new Set(
    drafts.flatMap((d) => [
      ...d.document_doc_ids,
      ...(d.invoice_pdf ? [`invoice-pdf-${d.groupId}`] : []),
    ])
  )

  const unmatchedIds = [
    ...(batch.unmatched_doc_ids ?? []),
    ...[...fileNameById.keys()].filter(
      (id) => !assignedIds.has(id) && !id.startsWith('invoice-pdf-')
    ),
    ...[...fileById.keys()].filter(
      (id) => !assignedIds.has(id) && !id.startsWith('invoice-pdf-')
    ),
  ]
  const uniqueUnmatched = [...new Set(unmatchedIds)]

  const unmatchedRateCons: DocSortFingerprint[] = []
  const unmatchedBols: DocSortFingerprint[] = []
  const otherDocuments: DocSortFingerprint[] = []

  for (const docId of uniqueUnmatched) {
    const file = fileById.get(docId)
    const fileName = fileNameById.get(docId) ?? file?.name ?? docId
    const fp = file
      ? fingerprintFromFile(docId, file)
      : fingerprintStub(docId, fileName)
    if (fp.kind === 'rate_confirmation') unmatchedRateCons.push(fp)
    else if (fp.kind === 'bill_of_lading') unmatchedBols.push(fp)
    else otherDocuments.push(fp)
  }

  const sortResult =
    parseSortSnapshot(batch.doc_sort_snapshot) ??
    emptySortResult(Math.max(fileById.size, fileNameById.size, drafts.length))

  return {
    batchNumber: batch.batch_number,
    sortResult: {
      ...sortResult,
      unmatchedRateCons,
      unmatchedBols,
      otherDocuments,
      totalDocuments: Math.max(
        sortResult.totalDocuments,
        fileById.size,
        fileNameById.size
      ),
    },
    invoices: drafts,
    unmatched: {
      rateCons: unmatchedRateCons,
      bols: unmatchedBols,
      other: otherDocuments,
    },
    fileById,
    storagePathsByDocId,
  }
}
