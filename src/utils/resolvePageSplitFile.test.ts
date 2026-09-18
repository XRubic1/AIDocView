import { describe, expect, it } from 'vitest'
import { isPageSplitFileName, parsePageSplitFileName } from './resolvePageSplitFile'

describe('parsePageSplitFileName', () => {
  it('parses stem and page from page-split names', () => {
    expect(parsePageSplitFileName('10023-p2.pdf')).toEqual({ stem: '10023', page: 2 })
    expect(parsePageSplitFileName('Rate Conf-p10.pdf')).toEqual({
      stem: 'Rate Conf',
      page: 10,
    })
  })

  it('rejects non page-split names', () => {
    expect(parsePageSplitFileName('10023.pdf')).toBeNull()
    expect(parsePageSplitFileName('handoff-abc')).toBeNull()
    expect(isPageSplitFileName('10058-p1.pdf')).toBe(true)
    expect(isPageSplitFileName('10058.pdf')).toBe(false)
  })
})
