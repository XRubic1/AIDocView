import { describe, expect, it } from 'vitest'
import { remapBolAuditSignatureLocalizations } from './bolSignatureVerification'
import { remapRegionToPacketPage } from './fieldRegionMapping'

describe('remapRegionToPacketPage', () => {
  it('maps relative page 1 to first packet page in the audit batch', () => {
    const remapped = remapRegionToPacketPage(
      { pageNumber: 1, x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
      [3, 4],
      3
    )
    expect(remapped?.pageNumber).toBe(3)
  })

  it('keeps packet page numbers that already match the upload', () => {
    const remapped = remapRegionToPacketPage(
      { pageNumber: 4, x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
      [3, 4],
      3
    )
    expect(remapped?.pageNumber).toBe(4)
  })
})

describe('remapBolAuditSignatureLocalizations', () => {
  it('remaps receiver signature box from audit page 1 to packet page 3', () => {
    const audit = remapBolAuditSignatureLocalizations(
      {
        destination_match: 'PASS',
        legibility: 'PASS',
        page_count: 'PASS',
        signatures: {
          carrier: 'MISSING',
          shipper: 'MISSING',
          receiver: 'PRESENT',
          receiver_date: 'MISSING',
          receiver_authenticity: 'NONE',
          shipper_authenticity: 'NONE',
          carrier_authenticity: 'NONE',
          receiver_localization: {
            page: 1,
            x: 0.6,
            y: 0.8,
            w: 0.2,
            h: 0.05,
            description: 'ink signature',
          },
        },
        overall: 'NEEDS_REVIEW',
        flags: [],
      },
      [{ pageNumber: 3 }]
    )

    expect(audit.signatures.receiver_localization?.page).toBe(3)
  })
})
