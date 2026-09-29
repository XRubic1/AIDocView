import { describe, expect, it } from 'vitest'
import {
  declutterActivityEntries,
  type ActivityNoteListEntry,
} from './InvoiceActivityNoteList'

describe('declutterActivityEntries', () => {
  const shortPayContext: ActivityNoteListEntry[] = [
    {
      id: 'note-action',
      title: 'Action needed',
      detail: 'Confirm this partial payment or dispute if the amount is wrong.',
      timestamp: '2026-07-28',
      tone: 'warning',
    },
    {
      id: 'status-remit',
      title: 'Status',
      detail: 'Broker remitted $2550.00 of $3000.00 ($450.00 still due). Confirm what you received.',
      timestamp: '2026-07-28',
      tone: 'success',
    },
    {
      id: 'payment-1',
      title: 'Payment Posted',
      detail: '$2,550.00 · ACH · Ref ACH-PARTIAL-2305',
      meta: 'Demo seed — partial payment awaiting confirmation',
      timestamp: '2026-07-28',
      tone: 'info',
    },
    {
      id: 'status-ppw',
      title: 'Status',
      detail: 'PPW emailed to ap@tql.example (invoice, BOL, POD, rate con).',
      timestamp: '2026-06-26',
      tone: 'info',
    },
    {
      id: 'send-1',
      title: 'Document sent',
      detail: 'ap@tql.example · delivered',
      kind: 'send',
      meta: 'Files: 4 attached',
      timestamp: '2026-06-26',
      tone: 'success',
    },
    {
      id: 'approved',
      title: 'Approved',
      detail: 'Paperwork verified — invoice approved for broker submission.',
      timestamp: '2026-06-25',
      tone: 'success',
    },
  ]

  it('collapses short-pay echoes and PPW duplicate into a quieter feed', () => {
    const out = declutterActivityEntries(shortPayContext)
    const titles = out.map((e) => e.title)

    expect(titles).not.toContain('Action needed')
    expect(titles).not.toContain('Status')
    expect(titles).toContain('Partial payment')
    expect(titles).toContain('Sent to broker')
    expect(titles).toContain('Approved')

    const pay = out.find((e) => e.title === 'Partial payment')
    expect(pay?.detail).toMatch(/\$2,550/)
    expect(pay?.detail).toMatch(/still due/i)
    expect(pay?.meta).toBeUndefined()

    const send = out.find((e) => e.title === 'Sent to broker')
    expect(send?.detail).toBe('ap@tql.example · Delivered')
    expect(send?.meta).toBe('4 files')
  })

  it('labels a failed packet send as failed', () => {
    const out = declutterActivityEntries([
      {
        id: 'send-fail',
        title: 'Document sent',
        detail: 'No broker email on file.',
        kind: 'send_failed',
        timestamp: '2026-09-29',
        tone: 'error',
      },
    ])
    expect(out[0]?.title).toBe('Failed to send')
    expect(out[0]?.detail).toMatch(/no broker email/i)
  })
})
