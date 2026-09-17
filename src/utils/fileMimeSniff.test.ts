import { describe, expect, it } from 'vitest'
import {
  headerLooksLikeImage,
  headerLooksLikePdf,
  mimeFromFileName,
  sniffBlobMime,
} from './fileMimeSniff'

describe('fileMimeSniff', () => {
  it('detects PDF magic bytes', () => {
    const header = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    expect(headerLooksLikePdf(header)).toBe(true)
    expect(headerLooksLikeImage(header)).toBe(false)
  })

  it('detects JPEG magic bytes', () => {
    const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    expect(headerLooksLikeImage(header)).toBe(true)
    expect(headerLooksLikePdf(header)).toBe(false)
  })

  it('prefers PDF magic over a misleading .jpg name', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    const blob = new Blob([bytes])
    const mime = await sniffBlobMime(blob, 'scan.jpg', 'image/jpeg')
    expect(mime).toBe('application/pdf')
  })

  it('falls back to extension when bytes are unknown', async () => {
    const blob = new Blob([new Uint8Array([0x00, 0x01, 0x02])])
    expect(await sniffBlobMime(blob, 'doc.pdf')).toBe('application/pdf')
    expect(mimeFromFileName('photo.PNG')).toBe('image/png')
  })
})
