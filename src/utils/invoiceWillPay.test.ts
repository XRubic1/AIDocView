import { describe, expect, it } from 'vitest'
import { getWillPayScheduledDate, invoiceHasWillPayStatus } from './invoiceWillPay'

describe('invoiceHasWillPayStatus', () => {
  it('shows Will Pay for open A/R with W/P collection status', () => {
    expect(
      invoiceHasWillPayStatus({ status: 'approved', collection_status: 'W/P' })
    ).toBe(true)
    expect(getWillPayScheduledDate({ collection_status: 'W/P', collection_date: '2026-09-20' })).toBe(
      '2026-09-20'
    )
  })

  it('reads Will Pay from a status note when collection_status is missing', () => {
    expect(
      invoiceHasWillPayStatus({
        status: 'approved',
        notes_history: [
          {
            id: 'n1',
            note: 'Status: Will Pay · 08/19/2026 — This will be paid',
            created_by: 'Admin',
            created_at: '2026-08-10T00:00:00Z',
            type: 'status_update',
          },
        ],
      })
    ).toBe(true)
    expect(
      getWillPayScheduledDate({
        notes_history: [
          {
            id: 'n1',
            note: 'Status: Will Pay · 08/19/2026 — This will be paid',
            created_by: 'Admin',
            created_at: '2026-08-10T00:00:00Z',
            type: 'status_update',
          },
        ],
      })
    ).toBe('2026-08-19')
  })

  it('does not treat paid invoices as Will Pay', () => {
    expect(invoiceHasWillPayStatus({ status: 'paid', collection_status: 'W/P' })).toBe(false)
  })
})
