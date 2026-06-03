import { ExcelDetectedColumn } from '../types/loadSheet'
import { carrierNameFromExcelFileName } from './brokerCarrierExcelMatch'

type ColumnField = 'invoiceNumber' | 'loadNumber' | 'broker' | 'carrier' | 'amount' | 'invoiceDate'

const COLUMN_FIELD_META: Record<
  ColumnField,
  { label: string; required: boolean }
> = {
  loadNumber: { label: 'Load #', required: true },
  amount: { label: 'Amount', required: true },
  broker: { label: 'Broker (Debtor column)', required: true },
  invoiceNumber: { label: 'Invoice #', required: false },
  invoiceDate: { label: 'Invoice date', required: false },
  carrier: { label: 'Carrier column', required: false },
}

/** Build user-facing list of which Excel fields were detected at upload. */
export function buildExcelDetectedColumns(
  headerRow: string[],
  columnMap: Record<ColumnField, number>,
  fileName: string
): ExcelDetectedColumn[] {
  const columns: ExcelDetectedColumn[] = []

  ;(Object.keys(COLUMN_FIELD_META) as ColumnField[]).forEach((field) => {
    const index = columnMap[field]
    const meta = COLUMN_FIELD_META[field]
    columns.push({
      field,
      label: meta.label,
      required: meta.required,
      detected: index >= 0,
      headerName: index >= 0 ? headerRow[index] : undefined,
    })
  })

  const fileCarrier = carrierNameFromExcelFileName(fileName)
  columns.push({
    field: 'carrier_file_name',
    label: 'Carrier (Excel file name)',
    required: true,
    detected: Boolean(fileCarrier),
    headerName: fileCarrier,
    note: 'Used as the carrier account for verification.',
  })

  return columns
}

export function countExcelDetection(columns: ExcelDetectedColumn[]): {
  detected: number
  total: number
  required: number
  requiredDetected: number
  allRequiredDetected: boolean
  allDetected: boolean
} {
  const required = columns.filter((col) => col.required)
  const requiredDetected = required.filter((col) => col.detected)
  const detected = columns.filter((col) => col.detected)
  return {
    detected: detected.length,
    total: columns.length,
    required: required.length,
    requiredDetected: requiredDetected.length,
    allRequiredDetected: requiredDetected.length === required.length,
    allDetected: detected.length === columns.length,
  }
}

export function summarizeExcelDetection(columns: ExcelDetectedColumn[]): string {
  const stats = countExcelDetection(columns)
  if (stats.allRequiredDetected) {
    return `All ${stats.required} required Excel fields detected (${stats.detected}/${stats.total} total).`
  }
  const missing = columns.filter((col) => col.required && !col.detected).map((col) => col.label)
  return `Missing required Excel fields: ${missing.join(', ')}.`
}
