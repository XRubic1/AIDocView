import { describe, expect, it } from 'vitest'
import {
  attachmentPayloadChars,
  brokerPacketPartNoteHtml,
  brokerPacketPartSuffix,
  partitionAttachmentsBySize,
  type NamedAttachment,
} from './brokerPacketParts'
import type { EmailAttachment } from '../services/emailService'

function fakeAttachment(name: string, charSize: number): EmailAttachment {
  return {
    filename: name,
    content: 'x'.repeat(Math.max(0, charSize - name.length)),
    contentType: 'application/pdf',
  }
}

function named(name: string, charSize: number): NamedAttachment {
  return { name, attachment: fakeAttachment(name, charSize) }
}

describe('brokerPacketParts', () => {
  it('keeps a small set in one part', () => {
    const result = partitionAttachmentsBySize(
      [named('a.pdf', 1000), named('b.pdf', 2000)],
      10_000
    )
    expect('parts' in result).toBe(true)
    if ('parts' in result) {
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0].names).toEqual(['a.pdf', 'b.pdf'])
    }
  })

  it('splits into Part 1 / Part 2 when over budget', () => {
    const result = partitionAttachmentsBySize(
      [named('big1.pdf', 8_000), named('big2.pdf', 8_000), named('small.pdf', 500)],
      10_000
    )
    expect('parts' in result).toBe(true)
    if ('parts' in result) {
      // big2 + small still fit under 10k, so two parts total
      expect(result.parts).toHaveLength(2)
      expect(result.parts[0].names).toEqual(['big1.pdf'])
      expect(result.parts[1].names).toEqual(['big2.pdf', 'small.pdf'])
    }
  })

  it('packs multiple small files into the same part', () => {
    const result = partitionAttachmentsBySize(
      [named('a.pdf', 3_000), named('b.pdf', 3_000), named('c.pdf', 3_000)],
      10_000
    )
    expect('parts' in result).toBe(true)
    if ('parts' in result) {
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0].names).toEqual(['a.pdf', 'b.pdf', 'c.pdf'])
    }
  })

  it('errors when a single file exceeds the budget', () => {
    const result = partitionAttachmentsBySize([named('huge.pdf', 20_000)], 10_000)
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toMatch(/too large/i)
    }
  })

  it('builds part suffix and note only for multi-part', () => {
    expect(brokerPacketPartSuffix(1, 1)).toBe('')
    expect(brokerPacketPartSuffix(2, 3)).toBe(' (Part 2 of 3)')
    expect(brokerPacketPartNoteHtml(1, 1)).toBe('')
    expect(brokerPacketPartNoteHtml(1, 2)).toContain('Part 1 of 2')
  })

  it('measures payload chars including filename', () => {
    const a = fakeAttachment('doc.pdf', 100)
    expect(attachmentPayloadChars(a)).toBe(100)
  })
})
