import { describe, expect, it } from 'vitest'
import {
  buildCropVerifyRegionCandidates,
  cropContentSupportsPresentSignature,
  localizationSupportsPresentSignature,
  parseSignatureCropContent,
  reconcileReceiverSignatureConsensus,
} from './bolSignatureVerification'

describe('reconcileReceiverSignatureConsensus', () => {
  it('returns PRESENT only when all passes agree with verified crops', () => {
    expect(
      reconcileReceiverSignatureConsensus([
        { receiver: 'PRESENT', cropVerified: true },
        { receiver: 'PRESENT', cropVerified: true },
      ])
    ).toBe('PRESENT')
  })

  it('returns PRESENT when localization is trusted despite crop disagree', () => {
    expect(
      reconcileReceiverSignatureConsensus([
        { receiver: 'PRESENT', cropVerified: false, localizationTrusted: true },
        { receiver: 'PRESENT', cropVerified: false, localizationTrusted: true },
      ])
    ).toBe('PRESENT')
  })

  it('returns MISSING when all passes are missing', () => {
    expect(
      reconcileReceiverSignatureConsensus([
        { receiver: 'MISSING', cropVerified: true },
        { receiver: 'MISSING', cropVerified: true },
      ])
    ).toBe('MISSING')
  })

  it('returns UNCLEAR on disagreement', () => {
    expect(
      reconcileReceiverSignatureConsensus([
        { receiver: 'PRESENT', cropVerified: true },
        { receiver: 'MISSING', cropVerified: true },
      ])
    ).toBe('UNCLEAR')
  })

  it('returns UNCLEAR when crop verification fails without localization trust', () => {
    expect(
      reconcileReceiverSignatureConsensus([
        { receiver: 'PRESENT', cropVerified: true },
        { receiver: 'PRESENT', cropVerified: false },
      ])
    ).toBe('UNCLEAR')
  })
})

describe('localizationSupportsPresentSignature', () => {
  it('trusts ink_signature mark_kind and descriptive text', () => {
    expect(
      localizationSupportsPresentSignature({
        page: 1,
        x: 0.1,
        y: 0.8,
        w: 0.2,
        h: 0.05,
        description: 'ink signature and date in lower left consignee box',
        mark_kind: 'ink_signature',
      })
    ).toBe(true)
  })

  it('rejects empty or printed descriptions', () => {
    expect(
      localizationSupportsPresentSignature({
        page: 1,
        x: 0.1,
        y: 0.8,
        w: 0.2,
        h: 0.05,
        description: 'printed text only, no signature',
        mark_kind: 'printed_text',
      })
    ).toBe(false)
  })
})

describe('buildCropVerifyRegionCandidates', () => {
  it('returns multiple distinct crop regions including downward expansion', () => {
    const base = { pageNumber: 2, x: 0.2, y: 0.75, width: 0.25, height: 0.04 }
    const regions = buildCropVerifyRegionCandidates(base)
    expect(regions.length).toBeGreaterThan(1)
    expect(regions.some((region) => region.height > base.height)).toBe(true)
  })
})

describe('parseSignatureCropContent', () => {
  it('detects empty and printed text as non-signature', () => {
    expect(parseSignatureCropContent({ content: 'printed_text' })).toBe('printed_text')
    expect(cropContentSupportsPresentSignature('printed_text')).toBe(false)
    expect(cropContentSupportsPresentSignature('handwritten_signature')).toBe(true)
  })
})
