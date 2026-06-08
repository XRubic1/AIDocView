import { FileText, Loader2, Trash2, Upload, X } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { clientTheme as c } from '../../theme/clientTheme'

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
  const completeLabel =
    documents.length > 0
      ? isEditingExistingInvoice
        ? 'Save documents'
        : 'Save & continue'
      : isEditingExistingInvoice
        ? 'Close'
        : 'Continue without docs'

  return (
    <div className="fixed inset-0 client-modal-overlay flex items-center justify-center z-50 p-4">
      <div className="client-doc-upload-modal" role="dialog" aria-labelledby="doc-upload-title">
        <div className="client-doc-upload-modal__header">
          <div className="client-doc-upload-modal__header-main">
            <h3 id="doc-upload-title" className="client-doc-upload-modal__title">
              Upload documents
            </h3>
            <div className="client-doc-upload-modal__meta">
              <span className="client-doc-upload-modal__meta-item">
                <strong>{invoiceNumber}</strong>
              </span>
              <span className="client-doc-upload-modal__meta-sep">·</span>
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
            className="client-doc-upload-modal__dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault()
              if (e.dataTransfer.files.length > 0) {
                await onFileDrop(e.dataTransfer.files)
              }
            }}
          >
            <Upload className="w-5 h-5" style={{ color: c.info }} />
            <span className="client-doc-upload-modal__dropzone-text">Drop files or</span>
            <label htmlFor="client-doc-upload-input" className="client-doc-upload-modal__browse">
              browse
            </label>
            <input
              id="client-doc-upload-input"
              type="file"
              multiple
              className="hidden"
              onChange={onFileSelect}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
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
                    <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: c.secondary }} />
                    <span className="client-doc-upload-modal__file-name">{doc.name}</span>
                    <span className="client-doc-upload-modal__file-size">{formatFileSize(doc.size)}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveDocument(doc.id)}
                      className="client-doc-upload-modal__file-remove"
                      title="Remove"
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
