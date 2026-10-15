import * as XLSX from 'xlsx'
import { parseMotusQuery } from './motusInsurance'

export type MotusSheetEntry = {
  /** Value sent to the MOTUS lookup. */
  query: string
  /** Company name from the sheet, when a name column is present. */
  label: string
}

const DOT_HEADERS = ['dot', 'usdot', 'us dot', 'dot number', 'dot #', 'dot#', 'usdot number', 'usdot #']
const NAME_HEADERS = ['company', 'company name', 'client', 'client name', 'name', 'legal name', 'carrier', 'legal business name']

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function cellText(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

function findHeader(headers: string[], aliases: string[]): number {
  const keys = headers.map(headerKey)
  for (const alias of aliases) {
    const index = keys.indexOf(alias)
    if (index >= 0) return index
  }
  return keys.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias)))
}

/** Read DOT or MC numbers from the first worksheet of an Excel or CSV file. */
export function parseMotusDotSheet(buffer: ArrayBuffer): MotusSheetEntry[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('The file has no worksheets.')

  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
  })
  const rows = matrix
    .map((row) => (Array.isArray(row) ? row.map(cellText) : []))
    .filter((row) => row.some(Boolean))
  if (!rows.length) throw new Error('The file has no DOT numbers.')

  const headers = rows[0]
  const dotColumn = findHeader(headers, DOT_HEADERS)
  const hasHeader = dotColumn >= 0
  const dataRows = hasHeader ? rows.slice(1) : rows
  const numberColumn = hasHeader ? dotColumn : 0
  const nameColumn = hasHeader ? findHeader(headers, NAME_HEADERS) : -1

  const entries: MotusSheetEntry[] = []
  const seen = new Set<string>()
  for (const row of dataRows) {
    const raw = row[numberColumn] || row.find((cell) => parseMotusQuery(cell)) || ''
    const parsed = parseMotusQuery(raw)
    if (!parsed) continue
    const query = parsed.kind === 'dot' ? parsed.dot : `${parsed.prefix}${parsed.number}`
    if (seen.has(query)) continue
    seen.add(query)
    const label = nameColumn >= 0 ? row[nameColumn] : ''
    entries.push({ query, label })
  }

  if (!entries.length) throw new Error('No DOT or MC numbers were found. Use a DOT column, or one number per row.')
  if (entries.length > 400) {
    throw new Error(`This file has ${entries.length} numbers. Import up to 400 at a time.`)
  }
  return entries
}
