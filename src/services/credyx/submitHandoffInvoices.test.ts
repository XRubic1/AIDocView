import { beforeEach, describe, expect, it } from 'vitest'
import { hydrateBatches, getBatchById } from '../../data/mockBatches'
import { hydrateInvoices, getInvoicesByBatchId, mockInvoices } from '../../data/mockInvoices'
import { submitHandoffInvoices } from './submitHandoffInvoices'
import type { Batch } from '../../data/mockBatches'

function stubBatch(partial: Partial<Batch> & Pick<Batch, 'id' | 'batch_number' | 'client_id'>): Batch {
  return {
    client_name: 'Test Carrier',
    total_invoices: 0,
    total_amount: 0,
    status: 'ready_to_post',
    submitted_at: '2026-01-01T00:00:00Z',
    minutes_since_submitted: 0,
    upload_mode: 'handoff',
    sort_status: 'ready',
    ...partial,
  }
}

describe('submitHandoffInvoices', () => {
  beforeEach(() => {
    hydrateInvoices([])
    hydrateBatches([
      stubBatch({
        id: 'batch-1',
        batch_number: '2026-001-TST',
        client_id: 'client-a',
        client_name: 'Alpha Carrier',
      }),
    ])
  })

  it('creates invoices on an existing handoff batch', async () => {
    const result = await submitHandoffInvoices({
      batchId: 'batch-1',
      clientId: 'client-a',
      clientName: 'Alpha Carrier',
      invoices: [
        {
          invoice_number: '2412',
          load_number: 'LD-1',
          broker_name: 'TQL',
          amount: '1500',
          invoice_date: '2026-01-15',
          document_doc_ids: ['doc-1'],
        },
      ],
    })

    expect(result.invoices).toHaveLength(1)
    expect(result.invoices[0].invoice_number).toBe('2412')
    expect(getInvoicesByBatchId('batch-1')).toHaveLength(1)
    expect(getBatchById('batch-1')?.total_invoices).toBe(1)
  })

  it('does not create a second invoice when the number is already used', async () => {
    await submitHandoffInvoices({
      batchId: 'batch-1',
      clientId: 'client-a',
      clientName: 'Alpha Carrier',
      invoices: [
        {
          invoice_number: '2412',
          load_number: 'LD-1',
          broker_name: 'TQL',
          amount: '1500',
          invoice_date: '2026-01-15',
          document_doc_ids: ['doc-1'],
        },
      ],
    })

    await expect(
      submitHandoffInvoices({
        batchId: 'batch-1',
        clientId: 'client-a',
        clientName: 'Alpha Carrier',
        invoices: [
          {
            invoice_number: '2412',
            load_number: 'LD-2',
            broker_name: 'TQL',
            amount: '1500',
            invoice_date: '2026-01-16',
            document_doc_ids: ['doc-2'],
          },
        ],
      })
    ).rejects.toThrow(/already used/)

    expect(mockInvoices.filter((inv) => inv.invoice_number === '2412')).toHaveLength(1)
    expect(getInvoicesByBatchId('batch-1')).toHaveLength(1)
  })

  it('preserves existing batch invoice totals when adding more', async () => {
    await submitHandoffInvoices({
      batchId: 'batch-1',
      clientId: 'client-a',
      clientName: 'Alpha Carrier',
      invoices: [
        {
          invoice_number: '2412',
          load_number: 'LD-1',
          broker_name: 'TQL',
          amount: '1500',
          invoice_date: '2026-01-15',
          document_doc_ids: ['doc-1'],
        },
      ],
    })

    await submitHandoffInvoices({
      batchId: 'batch-1',
      clientId: 'client-a',
      clientName: 'Alpha Carrier',
      invoices: [
        {
          invoice_number: '2413',
          load_number: 'LD-2',
          broker_name: 'TQL',
          amount: '500',
          invoice_date: '2026-01-16',
          document_doc_ids: ['doc-2'],
        },
      ],
    })

    const batch = getBatchById('batch-1')
    expect(getInvoicesByBatchId('batch-1')).toHaveLength(2)
    expect(batch?.total_invoices).toBe(2)
    expect(batch?.total_amount).toBe(2000)
  })
})
