import { describe, expect, it } from 'vitest'
import {
  cropContentSupportsPresentSignature,
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

  it('returns UNCLEAR when crop verification fails on a PRESENT pass', () => {
    expect(
      reconcileReceiverSignatureConsensus([
        { receiver: 'PRESENT', cropVerified: true },
        { receiver: 'PRESENT', cropVerified: false },
      ])
    ).toBe('UNCLEAR')
  })
})

describe('parseSignatureCropContent', () => {
  it('detects empty and printed text as non-signature', () => {
    expect(parseSignatureCropContent({ content: 'printed_text' })).toBe('printed_text')
    expect(cropContentSupportsPresentSignature('printed_text')).toBe(false)
    expect(cropContentSupportsPresentSignature('handwritten_signature')).toBe(true)
  })
})
