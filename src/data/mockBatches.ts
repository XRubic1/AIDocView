import { PendingBatch } from '../types/admin'
import type { Invoice } from '../types/invoice'
import { addInvoice, getInvoicesByBatchId } from './mockInvoices'
import { deleteBatchFromDb, persistBatch } from '../services/supabase/tenantPersist'
import { notifyTenantDataUpdated } from '../services/supabase/tenantDataLiveSync'
import { ensureClientBatchCode } from '../services/clientRegistry'
import { buildBatchNumber, getMaxBatchSequence } from '../utils/clientBatchNumbers'
import { syncBatchFees } from '../services/batchFeeSync'

export interface Batch extends PendingBatch {
  reviewed_at?: string
  reviewed_by?: string
  approved_count?: number
  rejected_count?: number
}

let batchesData: Batch[] = []

/** Replace batch cache contents (used during hydration). */
export function hydrateBatches(items: Batch[]): void {
  batchesData = items
}

export function clearBatches(): void {
  batchesData = []
}

/** Merge a batch row from Supabase realtime (no persist). */
export function mergeBatch(batch: Batch): void {
  const idx = batchesData.findIndex((b) => b.id === batch.id)
  if (idx >= 0) {
    batchesData[idx] = { ...batchesData[idx], ...batch }
  } else {
    batchesData.unshift(batch)
  }
}

/** Remove a batch from the in-memory store (realtime DELETE). */
export function removeBatchFromStore(batchId: string): void {
  batchesData = batchesData.filter((b) => b.id !== batchId)
}

export const getAllBatches = (): Batch[] => {
  return batchesData
}

export const getBatchById = (batchId: string): Batch | undefined => {
  return batchesData.find((b) => b.id === batchId)
}

export const getClientDraftBatch = (
  clientId: string,
  uploadMode: 'ai' | 'manual'
): Batch | undefined => {
  return batchesData.find(
    (b) =>
      b.client_id === clientId &&
      (b.status === 'draft' || b.status === 'creating') &&
      b.upload_mode === uploadMode
  )
}

export const createDraftBatch = (
  clientId: string,
  clientName: string,
  uploadMode: 'ai' | 'manual',
  opts?: { status?: 'draft' | 'creating' }
): Batch => {
  return addBatch({
    batch_number: generateBatchNumber(clientId),
    client_name: clientName,
    client_id: clientId,
    total_invoices: 0,
    total_amount: 0,
    status: opts?.status ?? 'draft',
    submitted_at: new Date().toISOString(),
    upload_mode: uploadMode,
    sort_status: 'pending',
  })
}

export const updateBatch = (batchId: string, patch: Partial<Batch>): Batch | undefined => {
  const batch = batchesData.find((b) => b.id === batchId)
  if (!batch) return undefined
  Object.assign(batch, patch)
  if (patch.submitted_at) {
    const submittedDate = new Date(batch.submitted_at)
    const now = new Date()
    batch.minutes_since_submitted = Math.floor(
      (now.getTime() - submittedDate.getTime()) / (1000 * 60)
    )
  }
  void persistBatch(batch).catch(console.error)
  return batch
}

export const deleteBatch = (batchId: string): void => {
  const batch = batchesData.find((b) => b.id === batchId)
  batchesData = batchesData.filter((b) => b.id !== batchId)
  void deleteBatchFromDb(batchId, batch?.client_id).catch(console.error)
}

export const updateBatchTotals = (batchId: string): void => {
  const batch = batchesData.find((b) => b.id === batchId)
  if (!batch) return
  const invoices = getInvoicesByBatchId(batchId)
  batch.total_invoices = invoices.length
  batch.total_amount = invoices.reduce((sum, inv) => sum + inv.amount, 0)
  syncBatchFees(batchId)
}

// Function to update batch status
export const updateBatchStatus = (batchId: string, newStatus: Batch['status']): void => {
  const batch = batchesData.find((b) => b.id === batchId)
  if (batch) {
    batch.status = newStatus
    void persistBatch(batch).catch(console.error)
    // Client portal remaps invoice visibility from batch status — bump live UIs now.
    notifyTenantDataUpdated(['batches'], batch.client_id)
  }
}

// Function to add a new batch
export const addBatch = (batchData: Omit<Batch, 'id' | 'minutes_since_submitted'> & { id?: string }): Batch => {
  const submittedDate = new Date(batchData.submitted_at)
  const now = new Date()
  const minutesSinceSubmitted = Math.floor((now.getTime() - submittedDate.getTime()) / (1000 * 60))

  const newBatch: Batch = {
    ...batchData,
    id: batchData.id ?? `batch-${Date.now()}`,
    minutes_since_submitted: minutesSinceSubmitted,
    in_use: false,
  }

  batchesData.unshift(newBatch)
  void persistBatch(newBatch).catch(console.error)
  return newBatch
}

/** Attach invoices to a batch and refresh totals. */
export const addInvoicesForBatch = (
  batchId: string,
  batchNumber: string,
  invoices: Omit<Invoice, 'id' | 'created_at' | 'batch_id' | 'batch_number'>[]
): Invoice[] => {
  const created = invoices.map((inv) =>
    addInvoice(
      {
        ...inv,
        batch_id: batchId,
        batch_number: batchNumber,
      },
      { deferPersist: true }
    )
  )
  updateBatchTotals(batchId)
  // Phase 2: auto-match purchase blueprints (never block batch create)
  void import('../components/blueprints/blueprintRunner')
    .then(({ onInvoicePurchased }) => {
      for (const inv of created) {
        try {
          onInvoicePurchased(inv.id)
        } catch {
          /* per-invoice */
        }
      }
    })
    .catch(() => {
      /* runner optional */
    })
  return created
}

export const generateBatchNumber = (clientId: string): string => {
  const year = new Date().getFullYear()
  const clientCode = ensureClientBatchCode(clientId)
  const sequence = getMaxBatchSequence(getAllBatches(), clientId, clientCode) + 1
  return buildBatchNumber(year, sequence, clientCode)
}
