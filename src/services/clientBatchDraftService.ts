import {
  createDraftBatch,
  deleteBatch,
  getClientDraftBatch,
  updateBatch,
  type Batch,
} from '../data/mockBatches'
import type { BatchIntakeDraft, CredyxInvoiceDraft } from '../types/credyxBatch'
import type {
  AiDraftSnapshot,
  AiDraftStep,
  ClientBatchDraftMode,
  ClientBatchDraftRecord,
  ManualDraftSnapshot,
  SerializedBatchIntakeDraft,
  StoredFileMeta,
} from '../types/clientBatchDraft'
import {
  deleteDraftRecord,
  draftFileKey,
  loadDraftFile,
  loadDraftRecord,
  saveDraftRecord,
} from './clientBatchDraftStore'

export type ManualDraftInvoiceInput = {
  invoice_number: string
  load_number: string
  broker_name: string
  broker_address: string
  amount: string
  invoice_date: string
  notes: string
  documents?: { id: string; name: string; file: File; size: number }[]
}

/** True when an AI draft has no uploaded files or processed intake content. */
export function isAiDraftEmpty(
  uploadFiles: File[],
  intake: BatchIntakeDraft | null
): boolean {
  if (uploadFiles.length > 0) return false
  if (!intake) return true
  const hasUnmatched =
    intake.unmatched.rateCons.length > 0 ||
    intake.unmatched.bols.length > 0 ||
    intake.unmatched.other.length > 0
  return intake.invoices.length === 0 && !hasUnmatched && intake.fileById.size === 0
}

/** True when a manual draft has no saved invoices. */
export function isManualDraftEmpty(invoices: ManualDraftInvoiceInput[]): boolean {
  return invoices.length === 0
}

async function purgeEmptyDraftRecord(batchId: string): Promise<void> {
  await deleteDraftRecord(batchId)
  deleteBatch(batchId)
}

function fileMeta(key: string, file: File): StoredFileMeta {
  return { key, name: file.name, type: file.type, size: file.size }
}

async function filesFromMeta(entries: StoredFileMeta[]): Promise<File[]> {
  const files: File[] = []
  for (const entry of entries) {
    const file = await loadDraftFile(entry.key)
    if (file) files.push(file)
  }
  return files
}

function serializeIntakeDraft(
  batchId: string,
  intake: BatchIntakeDraft
): SerializedBatchIntakeDraft {
  const fileByIdKeys: Record<string, string> = {}

  intake.fileById.forEach((_file, docId) => {
    const key = draftFileKey(batchId, `doc::${docId}`)
    fileByIdKeys[docId] = key
  })

  const invoices = intake.invoices.map((inv) => {
    const { invoice_pdf, ...rest } = inv
    const serialized = { ...rest } as SerializedBatchIntakeDraft['invoices'][number]
    if (invoice_pdf) {
      serialized.invoicePdfKey = draftFileKey(batchId, `invoice-pdf::${inv.groupId}`)
    }
    return serialized
  })

  return {
    batchNumber: intake.batchNumber,
    sortResult: intake.sortResult,
    invoices,
    unmatched: intake.unmatched,
    fileByIdKeys,
  }
}

async function deserializeIntakeDraft(
  _batchId: string,
  serialized: SerializedBatchIntakeDraft
): Promise<{ intake: BatchIntakeDraft; files: Map<string, File> }> {
  const fileMap = new Map<string, File>()

  for (const [docId, key] of Object.entries(serialized.fileByIdKeys)) {
    const file = await loadDraftFile(key)
    if (file) fileMap.set(docId, file)
  }

  const invoices: CredyxInvoiceDraft[] = []
  for (const inv of serialized.invoices) {
    const { invoicePdfKey, ...rest } = inv
    let invoice_pdf: File | undefined
    if (invoicePdfKey) {
      invoice_pdf = (await loadDraftFile(invoicePdfKey)) ?? undefined
    }
    invoices.push({ ...rest, invoice_pdf })
  }

  return {
    intake: {
      batchNumber: serialized.batchNumber,
      sortResult: serialized.sortResult,
      invoices,
      unmatched: serialized.unmatched,
      fileById: fileMap,
    },
    files: fileMap,
  }
}

/** Get or create the in-progress draft batch row for a client + mode. */
export function ensureClientDraftBatch(
  clientId: string,
  clientName: string,
  mode: ClientBatchDraftMode
): Batch {
  const existing = getClientDraftBatch(clientId, mode)
  if (existing) return existing
  return createDraftBatch(clientId, clientName, mode)
}

export async function saveAiDraftSnapshot(
  batchId: string,
  clientId: string,
  snapshot: AiDraftSnapshot,
  intake: BatchIntakeDraft | null,
  uploadFiles: File[]
): Promise<'saved' | 'cleared' | 'skipped'> {
  if (isAiDraftEmpty(uploadFiles, intake)) {
    await purgeEmptyDraftRecord(batchId)
    return 'cleared'
  }

  const files = new Map<string, File>()

  uploadFiles.forEach((file, index) => {
    const key = draftFileKey(batchId, `upload::${index}`)
    files.set(key, file)
  })

  if (intake) {
    intake.fileById.forEach((file, docId) => {
      files.set(draftFileKey(batchId, `doc::${docId}`), file)
    })
    intake.invoices.forEach((inv) => {
      if (inv.invoice_pdf) {
        files.set(draftFileKey(batchId, `invoice-pdf::${inv.groupId}`), inv.invoice_pdf)
      }
    })
  }

  const payload: ClientBatchDraftRecord = {
    batchId,
    clientId,
    mode: 'ai',
    updatedAt: new Date().toISOString(),
    ai: {
      step: snapshot.step,
      uploadFiles: uploadFiles.map((file, index) =>
        fileMeta(draftFileKey(batchId, `upload::${index}`), file)
      ),
      intake: intake ? serializeIntakeDraft(batchId, intake) : null,
    },
  }

  await saveDraftRecord(payload, files)

  const invoiceCount = intake?.invoices.length ?? 0
  const totalAmount = intake?.invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0) ?? 0
  updateBatch(batchId, {
    total_invoices: invoiceCount,
    total_amount: totalAmount,
    sort_status: snapshot.step === 'confirm' ? 'ready' : snapshot.step === 'processing' ? 'sorting' : 'pending',
  })
  return 'saved'
}

/** Persist AI draft when non-empty; create batch row on first save. */
export async function persistAiDraftIfNeeded(
  clientId: string,
  clientName: string,
  batchId: string | null,
  snapshot: Pick<AiDraftSnapshot, 'step'>,
  intake: BatchIntakeDraft | null,
  uploadFiles: File[]
): Promise<{ batchId: string | null; result: 'saved' | 'cleared' | 'skipped' }> {
  if (isAiDraftEmpty(uploadFiles, intake)) {
    if (batchId) {
      await purgeEmptyDraftRecord(batchId)
      return { batchId: null, result: 'cleared' }
    }
    return { batchId: null, result: 'skipped' }
  }

  const targetBatchId =
    batchId ?? ensureClientDraftBatch(clientId, clientName, 'ai').id
  await saveAiDraftSnapshot(
    targetBatchId,
    clientId,
    { step: snapshot.step as AiDraftStep, uploadFiles: [], intake: null },
    intake,
    uploadFiles
  )
  return { batchId: targetBatchId, result: 'saved' }
}

export async function loadAiDraftSnapshot(batchId: string): Promise<{
  snapshot: AiDraftSnapshot
  intake: BatchIntakeDraft | null
  uploadFiles: File[]
} | null> {
  const record = await loadDraftRecord(batchId)
  if (!record?.ai) return null

  const uploadFiles = await filesFromMeta(record.ai.uploadFiles)
  let intake: BatchIntakeDraft | null = null

  if (record.ai.intake) {
    const restored = await deserializeIntakeDraft(batchId, record.ai.intake)
    intake = restored.intake
  }

  return {
    snapshot: record.ai,
    intake,
    uploadFiles,
  }
}

export async function saveManualDraftWithFiles(
  batchId: string,
  clientId: string,
  invoiceFormData: ManualDraftSnapshot['invoiceFormData'],
  invoices: ManualDraftInvoiceInput[]
): Promise<'saved' | 'cleared'> {
  if (isManualDraftEmpty(invoices)) {
    await purgeEmptyDraftRecord(batchId)
    return 'cleared'
  }

  const files = new Map<string, File>()
  const storedInvoices: ManualDraftSnapshot['invoices'] = []

  invoices.forEach((inv, invIndex) => {
    const docMetas: StoredFileMeta[] = []
    inv.documents?.forEach((doc, docIndex) => {
      const key = draftFileKey(batchId, `manual::${invIndex}::${docIndex}`)
      files.set(key, doc.file)
      docMetas.push(fileMeta(key, doc.file))
    })
    storedInvoices.push({
      invoice_number: inv.invoice_number,
      load_number: inv.load_number,
      broker_name: inv.broker_name,
      broker_address: inv.broker_address,
      amount: inv.amount,
      invoice_date: inv.invoice_date,
      notes: inv.notes,
      documents: docMetas,
    })
  })

  await saveDraftRecord(
    {
      batchId,
      clientId,
      mode: 'manual',
      updatedAt: new Date().toISOString(),
      manual: { invoiceFormData, invoices: storedInvoices },
    },
    files
  )

  const totalAmount = invoices.reduce(
    (sum, inv) => sum + Number.parseFloat(inv.amount || '0'),
    0
  )
  updateBatch(batchId, {
    total_invoices: invoices.length,
    total_amount: totalAmount,
  })
  return 'saved'
}

/** Persist manual draft when non-empty; create batch row on first save. */
export async function persistManualDraftIfNeeded(
  clientId: string,
  clientName: string,
  batchId: string | null,
  invoiceFormData: ManualDraftSnapshot['invoiceFormData'],
  invoices: ManualDraftInvoiceInput[]
): Promise<{ batchId: string | null; result: 'saved' | 'cleared' | 'skipped' }> {
  if (isManualDraftEmpty(invoices)) {
    if (batchId) {
      await purgeEmptyDraftRecord(batchId)
      return { batchId: null, result: 'cleared' }
    }
    return { batchId: null, result: 'skipped' }
  }

  const targetBatchId =
    batchId ?? ensureClientDraftBatch(clientId, clientName, 'manual').id
  await saveManualDraftWithFiles(targetBatchId, clientId, invoiceFormData, invoices)
  return { batchId: targetBatchId, result: 'saved' }
}

export async function loadManualDraftSnapshot(batchId: string): Promise<{
  invoiceFormData: ManualDraftSnapshot['invoiceFormData']
  invoices: Array<{
    invoice_number: string
    load_number: string
    broker_name: string
    broker_address: string
    amount: string
    invoice_date: string
    notes: string
    documents: { id: string; name: string; file: File; size: number }[]
  }>
} | null> {
  const record = await loadDraftRecord(batchId)
  if (!record?.manual) return null

  const invoices = []
  for (let invIndex = 0; invIndex < record.manual.invoices.length; invIndex++) {
    const inv = record.manual.invoices[invIndex]
    const documents = []
    for (let docIndex = 0; docIndex < inv.documents.length; docIndex++) {
      const meta = inv.documents[docIndex]
      const file = await loadDraftFile(meta.key)
      if (file) {
        documents.push({
          id: `draft-doc-${invIndex}-${docIndex}`,
          name: meta.name,
          file,
          size: meta.size,
        })
      }
    }
    invoices.push({
      invoice_number: inv.invoice_number,
      load_number: inv.load_number,
      broker_name: inv.broker_name,
      broker_address: inv.broker_address,
      amount: inv.amount,
      invoice_date: inv.invoice_date,
      notes: inv.notes,
      documents,
    })
  }

  return {
    invoiceFormData: record.manual.invoiceFormData,
    invoices,
  }
}

export async function clearClientDraftBatch(batchId: string): Promise<void> {
  await purgeEmptyDraftRecord(batchId)
}

export async function clearClientDraftStorage(batchId: string): Promise<void> {
  await deleteDraftRecord(batchId)
}

export function syncDraftBatchTotals(
  batchId: string,
  invoiceCount: number,
  totalAmount: number
): void {
  updateBatch(batchId, { total_invoices: invoiceCount, total_amount: totalAmount })
}
