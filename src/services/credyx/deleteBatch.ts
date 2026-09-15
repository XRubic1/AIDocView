import { clearClientDraftBatch } from '../clientBatchDraftService'
import { clearClientTenantCache } from '../../data/clientDemoData'
import { removeBatchFiles } from '../../data/batchFileStore'
import {
  deleteBatch,
  getBatchById,
  type Batch,
} from '../../data/mockBatches'
import { deleteInvoice, getInvoicesByBatchId } from '../../data/mockInvoices'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase'
import { notifyTenantDataUpdated } from '../supabase/tenantDataLiveSync'
import { getAdminCapabilities } from '../../utils/adminCapabilities'

const LOCKED_STATUSES = new Set<Batch['status']>(['submitted', 'processing'])

/** True when the batch has not been processed into A/R yet. */
export function canDeleteBatch(status?: Batch['status'] | string | null): boolean {
  if (!status) return false
  return !LOCKED_STATUSES.has(status as Batch['status'])
}

/** Remove storage objects for every invoice document in the batch. */
async function removeBatchDocumentStorage(batchId: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return

  const paths = getInvoicesByBatchId(batchId).flatMap((inv) =>
    Object.values(inv.document_storage_paths ?? {})
  )
  if (paths.length === 0) return

  const { error } = await supabase.storage.from('batch-documents').remove(paths)
  if (error) {
    console.warn('[deleteBatch] storage cleanup failed', error.message)
  }
}

/** Ensure the signed-in user is admin / super_admin before deleting. */
async function assertAdminCanDeleteBatches(): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const { data } = await supabase.auth.getUser()
  const caps = getAdminCapabilities(data.user)
  if (!caps.canDeleteBatches) {
    throw new Error('Only admins can delete batches')
  }
}

/**
 * Delete a batch that has not been submitted/processed yet.
 * Drafts clear IndexedDB + the batch row; intake batches also remove invoices and files.
 * Restricted to admin / super_admin staff roles.
 */
export async function deleteUnsubmittedBatch(batchId: string): Promise<void> {
  await assertAdminCanDeleteBatches()

  const batch = getBatchById(batchId)
  if (!batch) throw new Error('Batch not found')
  if (!canDeleteBatch(batch.status)) {
    throw new Error(
      `Batch ${batch.batch_number} is already submitted and cannot be deleted.`
    )
  }

  const clientId = batch.client_id

  if (batch.status === 'draft') {
    await clearClientDraftBatch(batchId)
    clearClientTenantCache(clientId)
    notifyTenantDataUpdated(['batches'], clientId)
    return
  }

  await removeBatchDocumentStorage(batchId)

  for (const inv of getInvoicesByBatchId(batchId)) {
    deleteInvoice(inv.id)
  }

  removeBatchFiles(batchId)
  await clearClientDraftBatch(batchId)
  // clearClientDraftBatch already deletes the batch row; if it was already gone, ensure store is clear.
  if (getBatchById(batchId)) deleteBatch(batchId)

  clearClientTenantCache(clientId)
  notifyTenantDataUpdated(['batches', 'invoices'], clientId)
}
