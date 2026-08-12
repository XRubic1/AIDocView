import { useRef, useState, type DragEvent } from 'react'
import { Upload, X, FileText, Loader } from 'lucide-react'
import { useClientTheme } from '../../theme/ThemeContext'
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport'

interface InvoiceDocumentUploadModalProps {
  isOpen: boolean
  invoiceNumber: string
  onClose: () => void
  onUpload: (files: File[]) => Promise<void>
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
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
  const c = useClientTheme()
  const isMobile = useIsMobileViewport()
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
      setError('Add a file first.')
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
      setError('Upload failed. Try again.')
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

  const openPicker = () => fileInputRef.current?.click()

  return (
    <div
      className="invoice-dispute-modal-overlay invoice-doc-upload-overlay"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className={`invoice-dispute-modal invoice-doc-upload-modal${
          isMobile ? ' invoice-doc-upload-modal--mobile' : ''
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="invoice-doc-upload-title"
      >
        <div className="invoice-dispute-modal-header invoice-doc-upload-modal__header">
          <div className="min-w-0">
            <p className="invoice-doc-upload-modal__eyebrow">Upload documents</p>
            <h3
              id="invoice-doc-upload-title"
              className="invoice-doc-upload-modal__title"
              style={{ color: c.primary }}
            >
              #{invoiceNumber}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="invoice-doc-upload-modal__close"
            style={{ color: c.secondary }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="invoice-dispute-modal-body invoice-doc-upload-modal__body">
          <div
            className={`invoice-doc-upload-dropzone${
              isDragging ? ' invoice-doc-upload-dropzone--active' : ''
            }${isMobile ? ' invoice-doc-upload-dropzone--mobile' : ''}`}
            onClick={isMobile ? openPicker : undefined}
            onDragEnter={(e) => {
              if (isMobile) return
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragOver={(e) => {
              if (isMobile) return
              e.preventDefault()
            }}
            onDragLeave={(e) => {
              if (isMobile) return
              e.preventDefault()
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              setIsDragging(false)
            }}
            onDrop={isMobile ? undefined : handleDrop}
            role={isMobile ? 'button' : undefined}
            tabIndex={isMobile ? 0 : undefined}
            onKeyDown={
              isMobile
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openPicker()
                    }
                  }
                : undefined
            }
          >
            <div className="invoice-doc-upload-dropzone__icon-wrap" aria-hidden>
              <Upload
                className="invoice-doc-upload-dropzone__icon"
                style={{ color: isDragging ? c.accent : c.info }}
              />
            </div>
            <p className="invoice-doc-upload-dropzone__label" style={{ color: c.primary }}>
              {isMobile
                ? 'Tap to add files'
                : isDragging
                  ? 'Drop to add'
                  : 'Drop files here'}
            </p>
            {!isMobile ? (
              <button
                type="button"
                onClick={openPicker}
                disabled={isUploading}
                className="dashboard-btn-secondary dashboard-btn-compact"
              >
                Select files
              </button>
            ) : null}
            <p className="invoice-doc-upload-dropzone__formats" style={{ color: c.secondary }}>
              PDF, JPG, PNG, DOC
            </p>
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

          {pendingFiles.length > 0 ? (
            <ul className="invoice-doc-upload-list">
              {pendingFiles.map((file, index) => (
                <li key={`${file.name}-${file.size}-${index}`} className="invoice-doc-upload-item">
                  <div className="invoice-doc-upload-item__main">
                    <span className="invoice-doc-upload-item__icon" aria-hidden>
                      <FileText className="w-3.5 h-3.5" style={{ color: c.info }} />
                    </span>
                    <div className="min-w-0">
                      <p className="invoice-doc-upload-item__name" style={{ color: c.primary }}>
                        {file.name}
                      </p>
                      <p className="invoice-doc-upload-item__size" style={{ color: c.secondary }}>
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    disabled={isUploading}
                    className="invoice-doc-upload-item__remove"
                    style={{ color: c.secondary }}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {error ? (
            <p className="invoice-doc-upload-error" style={{ color: c.error }}>
              {error}
            </p>
          ) : null}
        </div>

        <div className="invoice-dispute-modal-footer invoice-doc-upload-modal__footer">
          {!isMobile ? (
            <button
              type="button"
              onClick={handleClose}
              disabled={isUploading}
              className="dashboard-btn-secondary"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pendingFiles.length === 0 || isUploading}
            className="dashboard-btn-primary invoice-doc-upload-modal__submit"
          >
            {isUploading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload{pendingFiles.length > 0 ? ` ${pendingFiles.length}` : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
