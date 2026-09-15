import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import { Upload, FileText, CheckCircle, Loader2, AlertCircle, Trash2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getClientById } from '../../services/clientRegistry'
import { useToast } from '../ui/ToastProvider'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  ClientSetupIncompleteError,
  getSetupChecklist,
  isClientSetupComplete,
} from '../../utils/clientSetupDocuments'
import {
  submitManagedDocHandoff,
  type ManagedHandoffProgress,
} from '../../services/credyx/submitManagedDocHandoff'
import { isAIReviewEnabled } from '../../config/aiReview'
import { rememberBatchFileCount } from '../../utils/batchProcessingEta'

interface ManagedDocHandoffViewProps {
  clientId: string
  clientName: string
  onSubmitted?: (result: {
    batchId: string
    invoiceCount: number
    fileCount: number
    etaLabel: string
  }) => void
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Simplified upload for managed-tier clients — AI drafts invoices in the background. */
export default function ManagedDocHandoffView({
  clientId,
  clientName,
  onSubmitted,
}: ManagedDocHandoffViewProps) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const [files, setFiles] = useState<File[]>([])
  const [notes, setNotes] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [progress, setProgress] = useState<ManagedHandoffProgress | null>(null)
  const [submitted, setSubmitted] = useState<{
    batchNumber: string
    fileCount: number
    etaLabel: string
    docsOnly: boolean
  } | null>(null)
  const dragDepthRef = useRef(0)

  const client = useMemo(() => getClientById(clientId), [clientId])
  const setupComplete = useMemo(
    () => isClientSetupComplete(clientId, client),
    [clientId, client]
  )
  const checklist = useMemo(
    () => getSetupChecklist(clientId, client),
    [clientId, client]
  )
  const aiEnabled = isAIReviewEnabled()

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const next = Array.from(incoming).filter((f) => f.size > 0)
    if (next.length === 0) return
    setFiles((prev) => [...prev, ...next])
  }, [])

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const clearFiles = () => setFiles([])

  const endDrag = () => {
    dragDepthRef.current = 0
    setIsDragging(false)
  }

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current += 1
    setIsDragging(true)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    endDrag()
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }

  const handleSubmit = async () => {
    if (files.length === 0 || isSubmitting) return
    setIsSubmitting(true)
    setProgress({ phase: 'uploading', message: 'Saving your documents…' })
    try {
      const result = await submitManagedDocHandoff({
        clientId,
        clientName,
        files,
        notes,
        onProgress: setProgress,
      })

      rememberBatchFileCount(result.batchId, result.fileCount)
      setSubmitted({
        batchNumber: result.batchNumber,
        fileCount: result.fileCount,
        etaLabel: result.etaLabel,
        docsOnly: result.docsOnly,
      })
      onSubmitted?.({
        batchId: result.batchId,
        invoiceCount: 0,
        fileCount: result.fileCount,
        etaLabel: result.etaLabel,
      })
    } catch (err) {
      const message =
        err instanceof ClientSetupIncompleteError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not send documents to Credyx'
      showToast(message, 'error')
      setProgress(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="managed-handoff managed-handoff--success" data-onboard-target="submitPanel">
        <div className="managed-handoff__success">
          <CheckCircle className="w-10 h-10 mb-3" style={{ color: c.success }} aria-hidden />
          <h3 className="managed-handoff__success-title" style={{ color: c.primary }}>
            Thank you for submitting
          </h3>
          <p className="managed-handoff__success-copy" style={{ color: c.secondary }}>
            {submitted.docsOnly
              ? 'Credyx received your paperwork and will create the invoices. You’ll be notified when they’re ready to review.'
              : 'Invoices will be created automatically from your paperwork. You’ll be notified once they’re ready to review.'}
          </p>
          <p className="managed-handoff__success-copy mt-3" style={{ color: c.primary }}>
            This usually takes {submitted.etaLabel}
            {submitted.fileCount > 0
              ? ` for ${submitted.fileCount} file${submitted.fileCount === 1 ? '' : 's'}`
              : ''}
            .
          </p>
          <p className="text-xs mt-4" style={{ color: c.muted }}>
            Batch {submitted.batchNumber} · Track progress anytime under Batches
          </p>
        </div>
      </div>
    )
  }

  if (isSubmitting && progress) {
    return (
      <div className="managed-handoff managed-handoff--success" data-onboard-target="submitPanel">
        <div className="managed-handoff__success">
          <Loader2
            className="w-10 h-10 mb-3 animate-spin"
            style={{ color: c.info }}
            aria-hidden
          />
          <h3 className="managed-handoff__success-title" style={{ color: c.primary }}>
            Sending documents
          </h3>
          <p className="managed-handoff__success-copy" style={{ color: c.secondary }}>
            {progress.message}
          </p>
        </div>
      </div>
    )
  }

  if (!setupComplete) {
    return (
      <div className="managed-handoff managed-handoff--gate" data-onboard-target="submitPanel">
        <div
          className="managed-handoff__gate"
          style={{ borderColor: `${c.warning}66`, backgroundColor: c.stat.amber }}
        >
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: c.warning }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: c.primary }}>
                Complete Document Vault setup first
              </p>
              <p className="text-xs mt-1" style={{ color: c.secondary }}>
                Credyx must approve your required setup documents before you can send invoices.
              </p>
            </div>
          </div>
          <ul className="space-y-1.5 mb-4">
            {checklist.map((item) => (
              <li
                key={item.key}
                className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded"
                style={{ backgroundColor: c.card, border: `1px solid ${c.border}` }}
              >
                <span style={{ color: c.primary }}>{item.label}</span>
                <span className="font-medium capitalize" style={{ color: c.secondary }}>
                  {item.status}
                </span>
              </li>
            ))}
          </ul>
          <Link to="/client/documents" className="dashboard-btn-primary inline-flex text-sm">
            Open Document Vault
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="managed-handoff" data-onboard-target="submitPanel">
      <div className={`managed-handoff__body${files.length > 0 ? ' managed-handoff__body--with-side' : ''}`}>
        <div
          className={`managed-handoff__drop-panel${isDragging ? ' managed-handoff__drop-panel--dragging' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div
            className={`managed-handoff-dropzone${isDragging ? ' managed-handoff-dropzone--active' : ''}`}
            data-onboard-target="submitDropzone"
            aria-dropeffect={isDragging ? 'copy' : undefined}
          >
            {isDragging ? (
              <div className="managed-handoff-dropzone__content managed-handoff-dropzone__content--drop" role="status">
                <div className="managed-handoff-dropzone__icon managed-handoff-dropzone__icon--drop" aria-hidden>
                  <Upload className="w-7 h-7" />
                </div>
                <p className="managed-handoff-dropzone__title">Drop paperwork here</p>
                <p className="managed-handoff-dropzone__text">
                  Release to add your files to this upload
                </p>
              </div>
            ) : (
              <div className="managed-handoff-dropzone__content">
                <div className="managed-handoff-dropzone__icon" aria-hidden>
                  <Upload className="w-6 h-6" />
                </div>
                <p className="managed-handoff-dropzone__title">Drop files here</p>
                <p className="managed-handoff-dropzone__text">
                  {aiEnabled
                    ? 'We create invoices automatically from your paperwork. You’ll be notified when they’re ready to review.'
                    : 'Drag paperwork onto this area, or'}
                </p>
                <label className="managed-handoff-dropzone__browse">
                  Browse files
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
                <div className="managed-handoff-dropzone__tags" aria-hidden>
                  <span>POD</span>
                  <span>BOL</span>
                  <span>Rate con</span>
                  <span>PDF / images</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {files.length > 0 && (
          <aside className="managed-handoff__side" aria-label="Selected files">
            <div className="managed-handoff__files">
              <div className="managed-handoff__files-head">
                <span>Selected</span>
                <div className="managed-handoff__files-head-actions">
                  <span className="managed-handoff__files-count">{files.length}</span>
                  <button
                    type="button"
                    className="managed-handoff__files-clear"
                    onClick={clearFiles}
                    title="Clear all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <ul className="managed-handoff__file-list">
                {files.map((file, i) => (
                  <li key={`${file.name}-${file.size}-${i}`} className="managed-handoff__file-item">
                    <span className="managed-handoff__file-icon" aria-hidden>
                      <FileText className="w-3.5 h-3.5" style={{ color: c.info }} />
                    </span>
                    <div className="managed-handoff__file-meta">
                      <span className="managed-handoff__file-name">{file.name}</span>
                      <span className="managed-handoff__file-size">{formatFileSize(file.size)}</span>
                    </div>
                    <button
                      type="button"
                      className="managed-handoff__file-remove"
                      onClick={() => removeFile(i)}
                      aria-label={`Remove ${file.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>

              <label className="managed-handoff__notes">
                <span>Notes for Credyx (optional)</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Anything we should know about these loads?"
                />
              </label>

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
                className="dashboard-btn-primary managed-handoff__submit"
              >
                Send paperwork
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
