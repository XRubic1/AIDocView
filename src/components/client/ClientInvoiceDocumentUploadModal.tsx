import { useState, type DragEvent } from 'react'
import { FileText, Loader2, Trash2, Upload, X } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'

export interface UploadModalDocument {
  id: string
  name: string
  size: number
}

interface ClientInvoiceDocumentUploadModalProps {
  invoiceNumber: string
  brokerName: string
  amount: string
  loadNumber?: string
  documents: UploadModalDocument[]
  isEditingExistingInvoice: boolean
  saving?: boolean
  onClose: () => void
  onComplete: () => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onFileDrop: (files: FileList) => void | Promise<void>
  onRemoveDocument: (docId: string) => void
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Compact invoice document upload — no AI review, fits without modal scroll. */
export default function ClientInvoiceDocumentUploadModal({
  invoiceNumber,
  brokerName,
  amount,
  loadNumber,
  documents,
  isEditingExistingInvoice,
  saving = false,
  onClose,
  onComplete,
  onFileSelect,
  onFileDrop,
  onRemoveDocument,
}: ClientInvoiceDocumentUploadModalProps) {
  const c = useClientTheme()
  const [isDragging, setIsDragging] = useState(false)

  const completeLabel =
    documents.length > 0
      ? isEditingExistingInvoice
        ? 'Save documents'
        : 'Save & continue'
      : isEditingExistingInvoice
        ? 'Close'
        : 'Continue without docs'

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!saving) setIsDragging(true)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear when leaving the dropzone itself (not child nodes).
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragging(false)
  }

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (saving || e.dataTransfer.files.length === 0) return
    await onFileDrop(e.dataTransfer.files)
  }

  return (
    <div className="fixed inset-0 client-modal-overlay flex items-center justify-center z-50 p-4">
      <div className="client-doc-upload-modal" role="dialog" aria-labelledby="doc-upload-title">
        <div className="client-doc-upload-modal__header">
          <div className="client-doc-upload-modal__header-main">
            <p className="client-doc-upload-modal__eyebrow">Documents</p>
            <h3 id="doc-upload-title" className="client-doc-upload-modal__title">
              {invoiceNumber}
            </h3>
            <div className="client-doc-upload-modal__meta">
              <span className="client-doc-upload-modal__meta-item">{brokerName}</span>
              <span className="client-doc-upload-modal__meta-sep">·</span>
              <span className="client-doc-upload-modal__meta-item tabular-nums">
                {formatCurrency(parseFloat(amount || '0'))}
              </span>
              {loadNumber && (
                <>
                  <span className="client-doc-upload-modal__meta-sep">·</span>
                  <span className="client-doc-upload-modal__meta-item">Load {loadNumber}</span>
                </>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="client-doc-upload-modal__close" aria-label="Close" disabled={saving}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="client-doc-upload-modal__body">
          <div
            className={`client-doc-upload-modal__dropzone${isDragging ? ' client-doc-upload-modal__dropzone--active' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="client-doc-upload-modal__dropzone-icon" aria-hidden>
              <Upload className="w-5 h-5" style={{ color: isDragging ? c.accent : c.info }} />
            </div>
            <p className="client-doc-upload-modal__dropzone-title">
              {isDragging ? 'Drop to attach' : 'Drop files here'}
            </p>
            <p className="client-doc-upload-modal__dropzone-text">
              or{' '}
              <label htmlFor="client-doc-upload-input" className="client-doc-upload-modal__browse">
                browse
              </label>
            </p>
            <input
              id="client-doc-upload-input"
              type="file"
              multiple
              className="hidden"
              onChange={onFileSelect}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              disabled={saving}
            />
            <span className="client-doc-upload-modal__formats">PDF, JPG, PNG, DOC · max 25MB</span>
          </div>

          <div className="client-doc-upload-modal__files">
            <div className="client-doc-upload-modal__files-head">
              <span>Attached</span>
              <span className="client-doc-upload-modal__files-count">{documents.length}</span>
            </div>
            {documents.length === 0 ? (
              <p className="client-doc-upload-modal__files-empty">No documents yet</p>
            ) : (
              <ul className="client-doc-upload-modal__file-list">
                {documents.map((doc) => (
                  <li key={doc.id} className="client-doc-upload-modal__file-item">
                    <span className="client-doc-upload-modal__file-icon" aria-hidden>
                      <FileText className="w-3.5 h-3.5" style={{ color: c.info }} />
                    </span>
                    <span className="client-doc-upload-modal__file-name">{doc.name}</span>
                    <span className="client-doc-upload-modal__file-size">{formatFileSize(doc.size)}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveDocument(doc.id)}
                      className="client-doc-upload-modal__file-remove"
                      title="Remove"
                      disabled={saving}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="client-doc-upload-modal__footer">
          <button type="button" onClick={onClose} className="dashboard-btn-secondary" disabled={saving}>
            {isEditingExistingInvoice ? 'Cancel' : 'Skip'}
          </button>
          <button type="button" onClick={onComplete} className="dashboard-btn-primary" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              completeLabel
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
