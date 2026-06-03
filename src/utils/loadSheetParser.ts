import * as XLSX from 'xlsx'
import { LoadSheetRow, ParsedLoadSheet } from '../types/loadSheet'
import { buildExcelDetectedColumns } from './excelColumnDetection'

const COLUMN_ALIASES: Record<keyof Omit<LoadSheetRow, 'rowIndex'>, string[]> = {
  invoiceNumber: [
    'invoice number',
    'invoice #',
    'invoice#',
    'inv #',
    'inv#',
    'invoice no',
    'inv number',
    'invoice',
  ],
  loadNumber: ['load number', 'load #', 'load#', 'load no', 'load', 'pro', 'pro number', 'pro#'],
  /** Factoring sheets often label the broker as "Debtor". */
  broker: ['debtor', 'broker', 'broker name', 'customer', 'customer name'],
  carrier: [
    'carrier',
    'carrier name',
    'motor carrier',
    'motor carrier name',
    'trucking company',
    'truck company',
    'mc name',
  ],
  amount: ['amount', 'total', 'rate', 'invoice amount', 'total amount', 'pay'],
  invoiceDate: ['invoice date', 'date', 'inv date', 'billing date'],
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Partial header match — avoids matching "DebtorNo" when looking for "Debtor". */
function headerMatchesAlias(header: string, alias: string): boolean {
  if (header === alias) return true
  if (alias === 'debtor') {
    return header === 'debtor' || header === 'debtor name'
  }
  if (alias === 'debtorno' || alias === 'debtor no' || alias === 'debtor #') {
    return false
  }
  if (header.includes('debtorno') && alias === 'debtor') return false
  return header.includes(alias) || alias.includes(header)
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader)
  for (const alias of aliases) {
    const exact = normalized.indexOf(alias)
    if (exact >= 0) return exact
  }
  for (let index = 0; index < normalized.length; index += 1) {
    const header = normalized[index]
    if (aliases.some((alias) => headerMatchesAlias(header, alias))) {
      return index
    }
  }
  return -1
}

function cellToString(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim() || undefined
}

function cellToAmount(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  const cleaned = String(value).replace(/[$,\s]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isNaN(parsed) ? undefined : parsed
}

/** Parse first worksheet from an Excel or CSV file into load sheet rows. */
export async function parseLoadSheetFile(file: File): Promise<ParsedLoadSheet> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('Excel file has no worksheets.')
  }

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as (string | number | null)[][]

  if (matrix.length < 2) {
    throw new Error('Load sheet must have a header row and at least one data row.')
  }

  const headerRow = matrix[0].map((cell) => cellToString(cell) ?? '')
  const columnMap = {
    invoiceNumber: findColumnIndex(headerRow, COLUMN_ALIASES.invoiceNumber),
    loadNumber: findColumnIndex(headerRow, COLUMN_ALIASES.loadNumber),
    broker: findColumnIndex(headerRow, COLUMN_ALIASES.broker),
    carrier: findColumnIndex(headerRow, COLUMN_ALIASES.carrier),
    amount: findColumnIndex(headerRow, COLUMN_ALIASES.amount),
    invoiceDate: findColumnIndex(headerRow, COLUMN_ALIASES.invoiceDate),
  }

  if (columnMap.loadNumber < 0) {
    throw new Error(
      'Could not find a Load Number column. Expected headers like "Load Number", "Load #", or "PRO".'
    )
  }

  const rows: LoadSheetRow[] = []
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex]
    if (!row || row.every((cell) => cell == null || cellToString(cell) === undefined)) {
      continue
    }

    const loadNumber =
      columnMap.loadNumber >= 0 ? cellToString(row[columnMap.loadNumber]) : undefined
    if (!loadNumber) continue

    rows.push({
      rowIndex,
      loadNumber,
      invoiceNumber:
        columnMap.invoiceNumber >= 0 ? cellToString(row[columnMap.invoiceNumber]) : undefined,
      broker: columnMap.broker >= 0 ? cellToString(row[columnMap.broker]) : undefined,
      carrier: columnMap.carrier >= 0 ? cellToString(row[columnMap.carrier]) : undefined,
      amount: columnMap.amount >= 0 ? cellToAmount(row[columnMap.amount]) : undefined,
      invoiceDate:
        columnMap.invoiceDate >= 0 ? cellToString(row[columnMap.invoiceDate]) : undefined,
    })
  }

  if (rows.length === 0) {
    throw new Error('No data rows found in the load sheet.')
  }

  return {
    fileName: file.name,
    sheetName,
    headers: headerRow,
    rows,
    parsedAt: new Date().toISOString(),
    detectedColumns: buildExcelDetectedColumns(headerRow, columnMap, file.name),
  }
}

export function isLoadSheetFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    file.type.includes('spreadsheet') ||
    file.type === 'text/csv' ||
    file.type === 'application/vnd.ms-excel'
  )
}
