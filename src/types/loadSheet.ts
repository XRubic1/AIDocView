/** One mapped column from an uploaded Excel load sheet header row. */
export interface ExcelDetectedColumn {
  field: string
  label: string
  required: boolean
  detected: boolean
  /** Actual header text from the sheet, when detected from a column. */
  headerName?: string
  note?: string
}

/** One row from an uploaded Excel load sheet (Section 4). */
export interface LoadSheetRow {
  rowIndex: number
  invoiceNumber?: string
  loadNumber?: string
  broker?: string
  /** Motor carrier / trucking company from the load sheet. */
  carrier?: string
  amount?: number
  invoiceDate?: string
}

export interface ParsedLoadSheet {
  fileName: string
  sheetName: string
  headers: string[]
  rows: LoadSheetRow[]
  parsedAt: string
  /** Which expected fields were mapped from headers / file name. */
  detectedColumns: ExcelDetectedColumn[]
}

export type ExcelFieldMatchStatus = 'MATCH' | 'MISMATCH' | 'WARNING' | 'SKIPPED'

export interface ExcelFieldMatch {
  field: string
  label: string
  status: ExcelFieldMatchStatus
  excelValue?: string
  documentValue?: string
  message: string
}

/** Compare Excel row against extracted document data. */
export interface ExcelMatchResult {
  row: LoadSheetRow
  fields: ExcelFieldMatch[]
  overall: 'MATCH' | 'MISMATCH' | 'PARTIAL'
  matchedAt: string
}
