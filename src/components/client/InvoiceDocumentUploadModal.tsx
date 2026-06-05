import { useRef, useState, type DragEvent } from 'react'
import { Upload, X, FileText, Loader } from 'lucide-react'
import { clientTheme as c } from '../../theme/clientTheme'

interface InvoiceDocumentUploadModalProps {
  isOpen: boolean
  invoiceNumber: string
  onClose: () => void
  onUpload: (files: File[]) => Promise<void>
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`
}

/** Modal for uploading additional documents from invoice detail. */
export default function InvoiceDocumentUploadModal({
  isOpen,
  invoiceNumber,
  onClose,
  onUpload,
}: InvoiceDocumentUploadModalProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const addFiles = (files: FileList | File[]) => {
    const next = Array.from(files)
    if (next.length === 0) return
    setPendingFiles((prev) => [...prev, ...next])
    setError(null)
  }

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const handleSubmit = async () => {
    if (pendingFiles.length === 0) {
      setError('Add at least one file.')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      await onUpload(pendingFiles)
      setPendingFiles([])
      onClose()
    } catch (uploadError) {
      console.error('Invoice document upload failed:', uploadError)
      setError('Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    if (isUploading) return
    setPendingFiles([])
    setError(null)
    onClose()
  }

  return (
    <div
      className="invoice-dispute-modal-overlay"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="invoice-dispute-modal invoice-doc-upload-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="invoice-doc-upload-title"
      >
        <div className="invoice-dispute-modal-header">
          <div>
            <h3 id="invoice-doc-upload-title" className="text-base font-semibold" style={{ color: c.primary }}>
              Upload documents
            </h3>
            <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
              {invoiceNumber} · POD, BOL, rate con, or other supporting files
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
            style={{ color: c.secondary }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="invoice-dispute-modal-body">
          <div
            className={`invoice-doc-upload-dropzone ${isDragging ? 'invoice-doc-upload-dropzone--active' : ''}`}
            onDragEnter={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              e.preventDefault()
              setIsDragging(false)
            }}
            onDrop={handleDrop}
          >
            <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: isDragging ? c.accent : c.muted }} />
            <p className="text-sm font-medium" style={{ color: c.primary }}>
              Drag files here or browse
            </p>
            <p className="text-xs mt-1 mb-3" style={{ color: c.secondary }}>
              PDF, JPG, PNG, DOC
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="dashboard-btn-secondary dashboard-btn-compact"
            >
              Select files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          {pendingFiles.length > 0 && (
            <div className="invoice-doc-upload-list">
              {pendingFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="invoice-doc-upload-item">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 shrink-0" style={{ color: c.accent }} />
                    <div className="min-w-0">
                      <p className="text-sm truncate" style={{ color: c.primary }}>
                        {file.name}
                      </p>
                      <p className="text-xs" style={{ color: c.secondary }}>
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    disabled={isUploading}
                    className="p-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-50"
                    style={{ color: c.secondary }}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="text-xs mt-3" style={{ color: c.error }}>
              {error}
            </p>
          )}

          <p className="text-xs mt-3" style={{ color: c.secondary }}>
            Credyx will be notified to review your upload.
          </p>
        </div>

        <div className="invoice-dispute-modal-footer">
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="dashboard-btn-secondary"
            style={{ height: 36, fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pendingFiles.length === 0 || isUploading}
            className="dashboard-btn-primary"
            style={{ height: 36, fontSize: 13 }}
          >
            {isUploading ? (
              <>
                <Loader className="w-3.5 h-3.5 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                Upload {pendingFiles.length > 0 ? `(${pendingFiles.length})` : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
