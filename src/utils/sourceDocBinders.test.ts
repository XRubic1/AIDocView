import { describe, expect, it } from 'vitest'
import {
  partitionSourceBinders,
  planSourceBinders,
  sourceBinderFileName,
  stemHasSourceBinder,
} from '../../supabase/functions/_shared/sourceDocBinders'

describe('planSourceBinders', () => {
  it('collapses one upload into invoice, RC, and BOL buckets in page order', () => {
    const plans = planSourceBinders([
      { fileName: '9861-p4.pdf', kind: 'rate_confirmation', docId: 'p4' },
      { fileName: '9861-p1.pdf', kind: 'invoice', docId: 'p1' },
      { fileName: '9861-p5.pdf', kind: 'bill_of_lading', docId: 'p5' },
      { fileName: '9861-p2.pdf', kind: 'rate_confirmation', docId: 'p2' },
      { fileName: '9861-p3.pdf', kind: 'rate_confirmation', docId: 'p3' },
      { fileName: 'solo.pdf', kind: 'rate_confirmation', docId: 'solo' },
    ])

    expect(plans).toHaveLength(1)
    expect(plans[0].stem).toBe('9861')
    expect(plans[0].buckets.map((bucket) => bucket.fileName)).toEqual([
      '9861.RC.Binder.pdf',
      '9861.BOL.Binder.pdf',
      '9861.Invoice.pdf',
    ])
    expect(plans[0].buckets[0].pages.map((page) => page.docId)).toEqual(['p2', 'p3', 'p4'])
  })

  it('leaves a single page upload unmatched so it can still be paired', () => {
    expect(
      planSourceBinders([{ fileName: '10023-p1.pdf', kind: 'invoice', docId: 'only' }])
    ).toEqual([])
  })
})

describe('partitionSourceBinders', () => {
  it('builds one packet per upload and keeps the invoice unassigned', () => {
    const { packets, unassigned, loose } = partitionSourceBinders([
      { fileName: '9861.RC.Binder.pdf', kind: 'rate_confirmation', docId: 'rc' },
      { fileName: '9861.BOL.Binder.pdf', kind: 'bill_of_lading', docId: 'bol' },
      { fileName: '9861.Invoice.pdf', kind: 'invoice', docId: 'inv' },
      { fileName: '9861.Lumper.pdf', kind: 'lumper', docId: 'lump' },
      { fileName: 'loose-rc.pdf', kind: 'rate_confirmation', docId: 'loose' },
      { fileName: '9993.Invoice.pdf', kind: 'invoice', docId: 'inv-only' },
    ])

    expect(packets).toHaveLength(1)
    expect(packets[0].stem).toBe('9861')
    expect(packets[0].rateCons.map((fp) => fp.docId)).toEqual(['rc'])
    expect(packets[0].bols.map((fp) => fp.docId)).toEqual(['bol'])
    expect(packets[0].support.map((fp) => fp.docId)).toEqual(['lump'])
    expect(packets[0].invoices.map((fp) => fp.docId)).toEqual(['inv'])
    expect(unassigned.map((fp) => fp.docId)).toEqual(['inv-only'])
    expect(loose.map((fp) => fp.docId)).toEqual(['loose'])
    expect(sourceBinderFileName('9772', 'rate_confirmation')).toBe('9772.RC.Binder.pdf')
    expect(stemHasSourceBinder(['9772.Invoice.pdf'], '9772.pdf')).toBe(true)
    expect(stemHasSourceBinder(['9772.Invoice.pdf'], '9793.pdf')).toBe(false)
  })
})
