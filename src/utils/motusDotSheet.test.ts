import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { parseMotusDotSheet } from './motusDotSheet'

function sheetBuffer(rows: unknown[][]): ArrayBuffer {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(book, sheet, 'DOTs')
  const out = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return out
}

describe('parseMotusDotSheet', () => {
  it('reads a DOT column and a company name', () => {
    const entries = parseMotusDotSheet(
      sheetBuffer([
        ['Company', 'USDOT'],
        ['Kanone LLC', '3788627'],
        ['Other Carrier', '1234567'],
        ['Kanone LLC', '3788627'],
      ])
    )
    expect(entries).toEqual([
      { query: '3788627', label: 'Kanone LLC' },
      { query: '1234567', label: 'Other Carrier' },
    ])
  })

  it('reads a list of DOT numbers with no header', () => {
    const entries = parseMotusDotSheet(sheetBuffer([['3788627'], ['1002003']]))
    expect(entries.map((entry) => entry.query)).toEqual(['3788627', '1002003'])
  })
})