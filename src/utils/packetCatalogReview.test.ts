import { describe, expect, it } from 'vitest'
import { packetReviewsFromCatalog } from './packetCatalogReview'

describe('packetReviewsFromCatalog', () => {
  it('keeps the rate con extract when the BOL binder was not field-read', () => {
    const reviews = packetReviewsFromCatalog(
      ['rc-1', 'bol-1'],
      new Map([
        [
          'rc-1',
          {
            docId: 'rc-1',
            fileName: '9772.RC.Binder.pdf',
            kind: 'rate_confirmation',
            confidence: 0.9,
            loadNumbers: ['12477660EVL'],
            broker: 'EVANS TRANSPORTATION SERVICES',
            extract: {
              documentType: 'rate_confirmation',
              hasSignature: false,
              confidence: 0.9,
              fieldsFound: ['loadNumber'],
              loadNumber: '12477660EVL',
              rate: 3000,
              rateConParse: {
                load_number: '12477660EVL',
                broker_name: 'EVANS TRANSPORTATION SERVICES',
                rate_total: 3000,
              },
            },
          },
        ],
        [
          'bol-1',
          {
            docId: 'bol-1',
            fileName: '9772.BOL.Binder.pdf',
            kind: 'bill_of_lading',
            confidence: 0.9,
            loadNumbers: [],
          },
        ],
      ])
    )

    expect(reviews).toHaveLength(2)
    expect(reviews?.[0].extraction.rateConParse?.load_number).toBe('12477660EVL')
    expect(reviews?.[1].extraction.documentType).toBe('bill_of_lading')
    expect(reviews?.[1].extraction.bolAudit).toBeUndefined()
  })

  it('does not review a packet that has no rate con extract', () => {
    const reviews = packetReviewsFromCatalog(
      ['bol-1'],
      new Map([
        [
          'bol-1',
          {
            docId: 'bol-1',
            fileName: '9772.BOL.Binder.pdf',
            kind: 'bill_of_lading',
            confidence: 0.9,
            loadNumbers: [],
          },
        ],
      ])
    )
    expect(reviews).toBeNull()
  })
})
