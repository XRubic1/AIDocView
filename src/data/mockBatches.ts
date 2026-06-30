import { PendingBatch } from '../types/admin'
import type { Invoice } from '../types/invoice'
import { addInvoice, getInvoicesByBatchId } from './mockInvoices'
import { DEMO_WORLD } from './unifiedDemo'

export interface Batch extends PendingBatch {
  reviewed_at?: string
  reviewed_by?: string
  approved_count?: number
  rejected_count?: number
}

// In-memory storage for batches (in a real app, this would be a database)
let batchesData: Batch[] = [...DEMO_WORLD.batches]

// Shared batches data source for all batch tabs
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
    (b) => b.client_id === clientId && b.status === 'draft' && b.upload_mode === uploadMode
  )
}

export const createDraftBatch = (
  clientId: string,
  clientName: string,
  uploadMode: 'ai' | 'manual'
): Batch => {
  return addBatch({
    batch_number: generateBatchNumber(),
    client_name: clientName,
    client_id: clientId,
    total_invoices: 0,
    total_amount: 0,
    status: 'draft',
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
  return batch
}

export const deleteBatch = (batchId: string): void => {
  batchesData = batchesData.filter((b) => b.id !== batchId)
}

export const updateBatchTotals = (batchId: string): void => {
  const batch = batchesData.find((b) => b.id === batchId)
  if (!batch) return
  const invoices = getInvoicesByBatchId(batchId)
  batch.total_invoices = invoices.length
  batch.total_amount = invoices.reduce((sum, inv) => sum + inv.amount, 0)
}

// Function to update batch status
export const updateBatchStatus = (batchId: string, newStatus: Batch['status']): void => {
  const batch = batchesData.find((b) => b.id === batchId)
  if (batch) {
    batch.status = newStatus
  }
}

// Function to add a new batch
export const addBatch = (batchData: Omit<Batch, 'id' | 'minutes_since_submitted'>): Batch => {
  const submittedDate = new Date(batchData.submitted_at)
  const now = new Date()
  const minutesSinceSubmitted = Math.floor((now.getTime() - submittedDate.getTime()) / (1000 * 60))

  const newBatch: Batch = {
    ...batchData,
    id: `batch-${Date.now()}`,
    minutes_since_submitted: minutesSinceSubmitted,
    in_use: false,
  }

  batchesData.unshift(newBatch) // Add to the beginning for easier viewing
  return newBatch
}

/** Attach invoices to a batch and refresh totals. */
export const addInvoicesForBatch = (
  batchId: string,
  batchNumber: string,
  invoices: Omit<Invoice, 'id' | 'created_at' | 'batch_id' | 'batch_number'>[]
): Invoice[] => {
  const created = invoices.map((inv) =>
    addInvoice({
      ...inv,
      batch_id: batchId,
      batch_number: batchNumber,
    })
  )
  updateBatchTotals(batchId)
  return created
}

export const generateBatchNumber = (): string => {
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  const day = String(new Date().getDate()).padStart(2, '0')
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')
  return `BATCH-${year}-${month}${day}-${random}`
}
