import { ExcelDetectedColumn } from '../../../types/loadSheet'
import { countExcelDetection } from '../../../utils/excelColumnDetection'

interface ExcelFieldDetectionListProps {
  columns: ExcelDetectedColumn[]
  /** Single-line chips for the upload rail. */
  minimal?: boolean
  compact?: boolean
}

/** Excel column detection — minimal chips in rail; detailed list only when needed. */
export default function ExcelFieldDetectionList({ columns, minimal, compact }: ExcelFieldDetectionListProps) {
  if (columns.length === 0) return null

  const stats = countExcelDetection(columns)

  if (minimal) {
    const shortLabel: Record<string, string> = {
      loadNumber: 'Load',
      amount: '$',
      broker: 'Brk',
      invoiceNumber: 'Inv',
      invoiceDate: 'Date',
      carrier: 'Carr',
      carrier_file_name: 'File',
    }
    return (
      <div className="engine-excel-detect-minimal" title={`${stats.detected}/${stats.total} fields`}>
        {columns.map((col) => (
          <span
            key={col.field}
            className={`engine-excel-chip ${col.detected ? 'ok' : col.required ? 'miss' : 'opt'}`}
          >
            {shortLabel[col.field] ?? col.label.slice(0, 4)}
            {col.detected ? '✓' : col.required ? '✗' : ''}
          </span>
        ))}
      </div>
    )
  }

  if (compact) {
    return (
      <p className="engine-excel-detect-line">
        {stats.requiredDetected}/{stats.required} required
        {stats.allRequiredDetected ? ' · OK' : ' · missing fields'}
      </p>
    )
  }

  return (
    <ul className="space-y-1">
      {columns.map((col) => (
        <li key={col.field} className="text-[10px] text-[#6b6960]">
          {col.detected ? '✓' : '·'} {col.label}
        </li>
      ))}
    </ul>
  )
}
