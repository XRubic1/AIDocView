import { describe, expect, it } from 'vitest'
import { isUsablePdfText, layoutPdfTextItems } from './pdfPageText'

describe('pdf page text', () => {
  it('treats a digital rate con page as usable text', () => {
    const text = 'Load 2717967 Broker MegaCorp Logistics Carrier Alibi Logistics Rate $3,200 Dallas MN'
    expect(isUsablePdfText(text)).toBe(true)
  })

  it('treats a scanned page with no text layer as not usable', () => {
    expect(isUsablePdfText('')).toBe(false)
    expect(isUsablePdfText('Page 1')).toBe(false)
  })

  it('orders text items from top to bottom and left to right', () => {
    const text = layoutPdfTextItems([
      { str: 'Dallas', transform: [1, 0, 0, 1, 10, 100] },
      { str: 'Load', transform: [1, 0, 0, 1, 10, 400] },
      { str: '2717967', transform: [1, 0, 0, 1, 80, 400] },
      { str: 'TX', transform: [1, 0, 0, 1, 70, 100] },
    ])
    expect(text.split('\n')[0]).toBe('Load 2717967')
    expect(text.split('\n')[1]).toBe('Dallas TX')
  })
})
