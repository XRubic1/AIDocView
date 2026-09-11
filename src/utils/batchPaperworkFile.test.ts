import { describe, expect, it } from 'vitest'
import { isBatchPaperworkFile, paperworkFileStem } from './batchPaperworkFile'

describe('batchPaperworkFile', () => {
  it('accepts pdf, jpg, and png by type or extension', () => {
    expect(isBatchPaperworkFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBe(true)
    expect(isBatchPaperworkFile(new File(['x'], 'b.jpg', { type: 'image/jpeg' }))).toBe(true)
    expect(isBatchPaperworkFile(new File(['x'], 'c.PNG', { type: '' }))).toBe(true)
    expect(isBatchPaperworkFile(new File(['x'], 'd.docx', { type: '' }))).toBe(false)
  })

  it('strips paperwork extensions for load matching', () => {
    expect(paperworkFileStem('15882-2.jpg')).toBe('15882-2')
    expect(paperworkFileStem('15882-3.JPEG')).toBe('15882-3')
  })
})
