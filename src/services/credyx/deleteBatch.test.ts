import { describe, expect, it, vi, beforeEach } from 'vitest'
import { canDeleteBatch, deleteUnsubmittedBatch } from './deleteBatch'

vi.mock('../../data/mockBatches', () => ({
  getBatchById: vi.fn(),
  deleteBatch: vi.fn(),
}))

vi.mock('../../data/mockInvoices', () => ({
  getInvoicesByBatchId: vi.fn(() => []),
  deleteInvoice: vi.fn(),
}))

vi.mock('../../data/batchFileStore', () => ({
  removeBatchFiles: vi.fn(),
}))

vi.mock('../../data/clientDemoData', () => ({
  clearClientTenantCache: vi.fn(),
}))

vi.mock('../clientBatchDraftService', () => ({
  clearClientDraftBatch: vi.fn(async () => undefined),
}))

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  getSupabase: () => null,
}))

vi.mock('../supabase/tenantDataLiveSync', () => ({
  notifyTenantDataUpdated: vi.fn(),
}))

import { getBatchById, deleteBatch } from '../../data/mockBatches'
import { clearClientDraftBatch } from '../clientBatchDraftService'

describe('deleteBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks submitted and processing batches', () => {
    expect(canDeleteBatch('draft')).toBe(true)
    expect(canDeleteBatch('ready_to_post')).toBe(true)
    expect(canDeleteBatch('verification')).toBe(true)
    expect(canDeleteBatch('submitted')).toBe(false)
    expect(canDeleteBatch('processing')).toBe(false)
  })

  it('refuses to delete a submitted batch', async () => {
    vi.mocked(getBatchById).mockReturnValue({
      id: 'b1',
      batch_number: '2026-1-ABC',
      client_id: 'c1',
      client_name: 'Carrier',
      total_invoices: 1,
      total_amount: 100,
      minutes_since_submitted: 0,
      status: 'submitted',
      submitted_at: '2026-09-15T00:00:00Z',
    })

    await expect(deleteUnsubmittedBatch('b1')).rejects.toThrow(/already submitted/i)
    expect(clearClientDraftBatch).not.toHaveBeenCalled()
    expect(deleteBatch).not.toHaveBeenCalled()
  })

  it('deletes a draft via clearClientDraftBatch', async () => {
    vi.mocked(getBatchById).mockReturnValue({
      id: 'b2',
      batch_number: '2026-2-ABC',
      client_id: 'c1',
      client_name: 'Carrier',
      total_invoices: 0,
      total_amount: 0,
      minutes_since_submitted: 0,
      status: 'draft',
      submitted_at: '2026-09-15T00:00:00Z',
    })

    await deleteUnsubmittedBatch('b2')
    expect(clearClientDraftBatch).toHaveBeenCalledWith('b2')
  })
})
