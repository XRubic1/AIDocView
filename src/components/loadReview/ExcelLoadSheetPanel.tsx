import { FileSpreadsheet, Upload, X } from 'lucide-react'
import { useRef } from 'react'
import { LoadSheetRow, ParsedLoadSheet } from '../../types/loadSheet'

interface ExcelLoadSheetPanelProps {
  loadSheet: ParsedLoadSheet | null
  selectedRow: LoadSheetRow | null
  onFileSelected: (file: File) => void
  onRowSelected: (row: LoadSheetRow) => void
  onClear: () => void
  error: string | null
  isParsing: boolean
}

/** Upload and select a row from the Excel load sheet (Section 4). */
export default function ExcelLoadSheetPanel({
  loadSheet,
  selectedRow,
  onFileSelected,
  onRowSelected,
  onClear,
  error,
  isParsing,
}: ExcelLoadSheetPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#113543' }}>
            <FileSpreadsheet className="w-4 h-4" style={{ color: '#C2A558' }} />
            Excel Load Sheet
          </h3>
          <p className="text-xs mt-1" style={{ color: '#819291' }}>
            Columns: Load Number (required), Carrier, Broker, Amount, Invoice Number, Invoice Date
          </p>
        </div>
        {loadSheet && (
          <button
            type="button"
            onClick={onClear}
            className="p-1.5 rounded hover:bg-gray-100"
            title="Remove load sheet"
            style={{ color: '#819291' }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!loadSheet ? (
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:border-[#C2A558]"
          style={{ borderColor: '#819291' }}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: '#819291' }} />
          <p className="text-sm font-medium" style={{ color: '#113543' }}>
            {isParsing ? 'Reading spreadsheet...' : 'Upload .xlsx, .xls, or .csv'}
          </p>
          <input
            ref={inputRef}
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
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs" style={{ color: '#819291' }}>
            {loadSheet.fileName} · {loadSheet.rows.length} load
            {loadSheet.rows.length !== 1 ? 's' : ''} · sheet &quot;{loadSheet.sheetName}&quot;
          </div>
          <label className="text-xs font-medium block" style={{ color: '#113543' }}>
            Select load row to validate
          </label>
          <select
            value={selectedRow?.rowIndex ?? ''}
            onChange={(e) => {
              const row = loadSheet.rows.find((item) => item.rowIndex === Number(e.target.value))
              if (row) onRowSelected(row)
            }}
            className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2"
            style={{ borderColor: '#819291', color: '#113543' }}
          >
            <option value="">Choose a load...</option>
            {loadSheet.rows.map((row) => (
              <option key={row.rowIndex} value={row.rowIndex}>
                {row.loadNumber}
                {row.carrier ? ` · ${row.carrier}` : ''}
                {row.broker ? ` · ${row.broker}` : ''}
                {row.amount != null ? ` · $${row.amount.toFixed(2)}` : ''}
              </option>
            ))}
          </select>
          {selectedRow && (
            <div
              className="grid grid-cols-2 gap-2 text-xs rounded p-3"
              style={{ backgroundColor: '#f8f9fa', color: '#113543' }}
            >
              <div>
                <span style={{ color: '#819291' }}>Load #</span>
                <div className="font-medium">{selectedRow.loadNumber}</div>
              </div>
              <div>
                <span style={{ color: '#819291' }}>Carrier</span>
                <div className="font-medium">{selectedRow.carrier ?? '—'}</div>
              </div>
              <div>
                <span style={{ color: '#819291' }}>Broker</span>
                <div className="font-medium">{selectedRow.broker ?? '—'}</div>
              </div>
              <div>
                <span style={{ color: '#819291' }}>Amount</span>
                <div className="font-medium">
                  {selectedRow.amount != null ? `$${selectedRow.amount.toFixed(2)}` : '—'}
                </div>
              </div>
              <div>
                <span style={{ color: '#819291' }}>Invoice #</span>
                <div className="font-medium">{selectedRow.invoiceNumber ?? '—'}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs rounded p-2" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
          {error}
        </p>
      )}
    </div>
  )
}
