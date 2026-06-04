import { FileSpreadsheet, X } from 'lucide-react'
import { LoadSheetRow, ParsedLoadSheet } from '../../../types/loadSheet'
import ExcelFieldDetectionList from './ExcelFieldDetectionList'
import { ff } from './factorFoxTheme'

export interface InvoiceExcelMatchChip {
  fileName: string
  loadNumber: string
  status: 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'NONE' | string
}

interface FactorFoxExcelPanelProps {
  loadSheet: ParsedLoadSheet | null
  selectedRow: LoadSheetRow | null
  onFileSelected: (file: File) => void
  onRowSelected: (row: LoadSheetRow) => void
  onClear: () => void
  error: string | null
  isParsing: boolean
  /** Per-PDF Excel row matches when multiple invoices are uploaded. */
  invoiceMatches?: InvoiceExcelMatchChip[]
}

function matchStatusClass(status: string): string {
  if (status === 'MATCH') return 'pass'
  if (status === 'MISMATCH') return 'fail'
  if (status === 'PARTIAL') return 'warn'
  return ''
}

export default function FactorFoxExcelPanel({
  loadSheet,
  selectedRow,
  onFileSelected,
  onRowSelected,
  onClear,
  error,
  isParsing,
  invoiceMatches = [],
}: FactorFoxExcelPanelProps) {
  const multiMatches = invoiceMatches.filter((item) => item.status !== 'NONE')

  return (
    <div className="engine-excel-section">
      <div className="engine-excel-label">
        <FileSpreadsheet className="w-3 h-3" strokeWidth={1.5} />
        Excel load sheet
        {loadSheet && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto p-0.5 engine-hover-surface"
            aria-label="Clear load sheet"
          >
            <X className="w-3.5 h-3.5" style={{ color: ff.textMuted }} />
          </button>
        )}
      </div>

      {!loadSheet ? (
        <label className="engine-upload-zone" style={{ margin: 0, padding: 14, flexDirection: 'row', gap: 10 }}>
          <span style={{ fontSize: 16, color: '#6b6960' }}>↑</span>
          <span className="engine-upload-sub" style={{ fontSize: 10 }}>
            {isParsing ? 'Reading…' : 'Upload .xlsx / .csv'}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={isParsing}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFileSelected(file)
              e.target.value = ''
            }}
          />
        </label>
      ) : (
        <div className="engine-excel-attached">
          <p className="engine-excel-file-line">
            {loadSheet.fileName} · {loadSheet.rows.length}r
          </p>
          <ExcelFieldDetectionList columns={loadSheet.detectedColumns} minimal />
          <select
            value={selectedRow?.rowIndex ?? ''}
            onChange={(e) => {
              const row = loadSheet.rows.find((item) => item.rowIndex === Number(e.target.value))
              if (row) onRowSelected(row)
            }}
            className="w-full text-xs px-2 py-2"
          >
            <option value="">Auto-match each invoice</option>
            {loadSheet.rows.map((row) => (
              <option key={row.rowIndex} value={row.rowIndex}>
                {row.loadNumber}
                {row.carrier ? ` · ${row.carrier}` : ''}
                {row.amount != null ? ` · $${row.amount}` : ''}
              </option>
            ))}
          </select>

          {multiMatches.length > 1 && (
            <ul className="engine-excel-invoice-matches" aria-label="Per-invoice Excel matches">
              {multiMatches.map((item) => (
                <li
                  key={item.fileName}
                  className={`engine-excel-invoice-chip ${matchStatusClass(item.status)}`}
                  title={item.fileName}
                >
                  <span className="engine-excel-invoice-file">
                    {item.fileName.replace(/\.pdf$/i, '')}
                  </span>
                  <span className="engine-excel-invoice-row">{item.loadNumber}</span>
                  <span className="engine-excel-invoice-status">{item.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p
          className="engine-rail-alert mt-2"
          style={{ backgroundColor: ff.redLight, color: ff.red, borderColor: ff.redBorder }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
