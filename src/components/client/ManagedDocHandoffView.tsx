import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import { Upload, FileText, CheckCircle, Loader2, AlertCircle, Trash2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { addBatch, generateBatchNumber } from '../../data/mockBatches'
import { HANDOFF_PLACEHOLDER_INVOICE_ID, setBatchFiles } from '../../data/batchFileStore'
import { isSupabaseConfigured } from '../../lib/supabase'
import { notifyAdminDocHandoff } from '../../services/adminNotificationService'
import { uploadBatchInvoiceDocuments } from '../../services/supabase/tenantPersist'
import { getClientById } from '../../services/clientRegistry'
import { useToast } from '../ui/ToastProvider'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  assertClientSetupComplete,
  ClientSetupIncompleteError,
  getSetupChecklist,
  isClientSetupComplete,
} from '../../utils/clientSetupDocuments'

interface ManagedDocHandoffViewProps {
  clientId: string
  clientName: string
  onSubmitted?: () => void
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Simplified upload for managed-tier clients — Credyx ops processes files. */
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
  const [submitted, setSubmitted] = useState(false)
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
    // Required so the browser shows a “copy” drop cursor.
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
    try {
      assertClientSetupComplete(clientId, client)

      const batchNumber = generateBatchNumber(clientId)
      const submittedAt = new Date().toISOString()
      const batch = addBatch({
        batch_number: batchNumber,
        client_name: clientName,
        client_id: clientId,
        total_invoices: 0,
        total_amount: 0,
        status: 'ready_to_post',
        submitted_at: submittedAt,
        upload_mode: 'handoff',
      })

      const fileMap = new Map<string, File>()
      files.forEach((file, index) => {
        const docId = `handoff-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`
        fileMap.set(docId, file)
      })
      setBatchFiles(batch.id, fileMap)

      if (isSupabaseConfigured()) {
        await uploadBatchInvoiceDocuments(
          clientId,
          batch.id,
          HANDOFF_PLACEHOLDER_INVOICE_ID,
          fileMap
        )
      }

      notifyAdminDocHandoff({
        clientId,
        clientName,
        batchId: batch.id,
        batchNumber: batch.batch_number,
        fileCount: files.length,
        fileNames: files.map((f) => f.name),
        notes: notes.trim() || undefined,
      })

      setSubmitted(true)
      onSubmitted?.()
    } catch (err) {
      const message =
        err instanceof ClientSetupIncompleteError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not send documents to Credyx'
      showToast(message, 'error')
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
            Documents sent
          </h3>
          <p className="managed-handoff__success-copy" style={{ color: c.secondary }}>
            Credyx will process these files and update your batches shortly.
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
          <Link to="/client/documents" className="dashboard-btn-primary inline-flex">
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
                  Drag paperwork onto this area, or
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
            </div>

            <div className="managed-handoff__notes">
              <label className="managed-handoff__notes-label" htmlFor="managed-handoff-notes">
                Notes (optional)
              </label>
              <textarea
                id="managed-handoff-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="managed-handoff__notes-input client-input"
                placeholder="Broker names, load numbers, or special instructions…"
              />
            </div>

            <div className="managed-handoff__footer">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit}
                className="dashboard-btn-primary managed-handoff__submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Send {files.length} to Credyx
                  </>
                )}
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
