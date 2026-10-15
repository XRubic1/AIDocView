import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Invoice } from '../types/invoice'

vi.mock('../data/mockBatches', () => ({
  getBatchById: vi.fn(),
  updateBatch: vi.fn(),
  updateBatchTotals: vi.fn(),
}))

vi.mock('../data/mockInvoices', () => ({
  getInvoicesByBatchId: vi.fn(() => []),
  deleteInvoice: vi.fn(),
}))

vi.mock('../data/batchFileStore', () => ({ getBatchFiles: vi.fn(() => new Map()) }))
vi.mock('../config/aiPolicy', () => ({ isAutoInvoiceCreationEnabled: () => true }))
vi.mock('./supabase/tenantDataLiveSync', () => ({ notifyTenantDataUpdated: vi.fn() }))
vi.mock('./credyx/batchProcessingJobs', () => ({
  enqueueBatchProcessing: vi.fn(async () => ({ jobId: null })),
  fetchBatchProcessingJob: vi.fn(async () => null),
}))
vi.mock('./credyx/batchLifecycleEmails', () => ({ emailCredyxIntakeError: vi.fn() }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: () => false, getSupabase: () => null }))
vi.mock('../utils/resolveHandoffDocuments', () => ({ listHandoffDocumentMeta: vi.fn(async () => []) }))

import { getBatchById } from '../data/mockBatches'
import { deleteInvoice, getInvoicesByBatchId } from '../data/mockInvoices'
import { clearBatchInvoicesForRecreate, retryBatchPacketCreation } from './batchReworkService'

function inv(partial: Partial<Invoice> & Pick<Invoice, 'id' | 'status'>): Invoice {
  return {
    invoice_number: partial.id.toUpperCase(),
    client_id: 'c1',
    client_name: 'Carrier',
    broker_id: 'b1',
    broker_name: 'Broker',
    amount: 1000,
    invoice_date: '2026-10-01',
    created_at: '2026-10-01T00:00:00Z',
    batch_id: 'b1',
    ...partial,
  } as Invoice
}

describe('clearBatchInvoicesForRecreate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes AI-owned draft packets', () => {
    vi.mocked(getInvoicesByBatchId).mockReturnValue([
      inv({ id: 'a', status: 'pending' }),
      inv({ id: 'b', status: 'review' }),
    ])
    expect(clearBatchInvoicesForRecreate('b1')).toBe(true)
    expect(deleteInvoice).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['approved', inv({ id: 'a', status: 'approved' })],
    ['held', inv({ id: 'a', status: 'hold' })],
    ['paid', inv({ id: 'a', status: 'paid' })],
    ['partly paid', inv({ id: 'a', status: 'pending', paid_amount: 250 })],
    [
      'sent to broker',
      inv({
        id: 'a',
        status: 'pending',
        document_send_history: [{ status: 'sent' }] as Invoice['document_send_history'],
      }),
    ],
  ])('keeps every packet when one is %s', (_label, blocking) => {
    vi.mocked(getInvoicesByBatchId).mockReturnValue([inv({ id: 'z', status: 'pending' }), blocking])
    expect(clearBatchInvoicesForRecreate('b1')).toBe(false)
    expect(deleteInvoice).not.toHaveBeenCalled()
  })

  it('manual retry refuses and names the blocking invoices', async () => {
    vi.mocked(getBatchById).mockReturnValue({ id: 'b1', client_id: 'c1' } as never)
    vi.mocked(getInvoicesByBatchId).mockReturnValue([inv({ id: 'inv-7', status: 'approved' })])
    await expect(retryBatchPacketCreation('b1')).rejects.toThrow(/INV-7/)
    expect(deleteInvoice).not.toHaveBeenCalled()
  })
})
