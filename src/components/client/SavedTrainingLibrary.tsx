import { Download, Save, Trash2 } from 'lucide-react'
import { RATE_CON_FIELD_LABELS, RateConFieldKey } from '../../config/rateConRules'
import {
  deleteSavedTraining,
  downloadTrainingExport,
  getAllSavedTraining,
  SavedDocumentTraining,
} from '../../utils/aiTrainingStore'

interface SavedTrainingLibraryProps {
  refreshKey?: number
  onDeleted?: () => void
}

export default function SavedTrainingLibrary({ refreshKey = 0, onDeleted }: SavedTrainingLibraryProps) {
  const records = getAllSavedTraining()

  if (records.length === 0) return null

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}
      key={refreshKey}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: '#113543' }}>
            Saved AI training ({records.length})
          </h3>
          <p className="text-xs mt-0.5" style={{ color: '#819291' }}>
            Your corrections and hints are stored locally for future model improvement.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadTrainingExport}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border"
          style={{ borderColor: '#819291', color: '#113543' }}
        >
          <Download className="w-3.5 h-3.5" />
          Export JSON
        </button>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {records.map((record) => (
          <TrainingRecordRow
            key={record.id}
            record={record}
            onDelete={() => {
              deleteSavedTraining(record.id)
              onDeleted?.()
            }}
          />
        ))}
      </div>
    </div>
  )
}

function TrainingRecordRow({
  record,
  onDelete,
}: {
  record: SavedDocumentTraining
  onDelete: () => void
}) {
  return (
    <div
      className="rounded border p-2 text-xs"
      style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium" style={{ color: '#113543' }}>
            {record.fileName}
          </div>
          <div style={{ color: '#819291' }}>
            {record.fields.length} field(s) · updated{' '}
            {new Date(record.updatedAt).toLocaleString()}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded hover:bg-red-50"
          style={{ color: '#819291' }}
          title="Delete saved training"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="mt-2 space-y-1">
        {record.fields.slice(0, 4).map((field) => (
          <div key={`${record.id}-${field.fieldKey}`} style={{ color: '#113543' }}>
            <span className="font-medium">
              {RATE_CON_FIELD_LABELS[field.fieldKey as RateConFieldKey] ?? field.fieldKey}:
            </span>{' '}
            {String(field.correctedValue)}
            {field.userHint && <span style={{ color: '#819291' }}> · hint</span>}
            {field.region && <span style={{ color: '#819291' }}> · boxed region</span>}
          </div>
        ))}
        {record.fields.length > 4 && (
          <div style={{ color: '#819291' }}>+{record.fields.length - 4} more</div>
        )}
      </div>
    </div>
  )
}

export function SaveTrainingButton({
  onSave,
  isSaving,
  isSaved,
  disabled,
}: {
  onSave: () => void
  isSaving?: boolean
  isSaved?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={disabled || isSaving}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded disabled:opacity-50 transition-colors"
      style={{ backgroundColor: isSaved ? '#2E7D32' : '#113543' }}
    >
      <Save className="w-3.5 h-3.5" />
      {isSaving ? 'Saving...' : isSaved ? 'Training saved' : 'Save training'}
    </button>
  )
}
