import { useCallback, useState } from 'react'
import { Upload, FileText, CheckCircle, Loader2 } from 'lucide-react'
import { addBatch, generateBatchNumber } from '../../data/mockBatches'
import { notifyAdminDocHandoff } from '../../services/adminNotificationService'
import { useClientTheme } from '../../theme/ThemeContext'

interface ManagedDocHandoffViewProps {
  clientId: string
  clientName: string
  onSubmitted?: () => void
}

/** Simplified upload for managed-tier clients — Credyx ops processes files. */
export default function ManagedDocHandoffView({
  clientId,
  clientName,
  onSubmitted,
}: ManagedDocHandoffViewProps) {
  const c = useClientTheme()
  const [files, setFiles] = useState<File[]>([])
  const [notes, setNotes] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const next = Array.from(incoming).filter((f) => f.size > 0)
    if (next.length === 0) return
    setFiles((prev) => [...prev, ...next])
  }, [])

  const handleSubmit = async () => {
    if (files.length === 0 || isSubmitting) return
    setIsSubmitting(true)
    try {
      const batchNumber = generateBatchNumber()
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
    } catch {
      /* ignore */
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="p-8 text-center max-w-lg mx-auto">
        <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: c.success }} />
        <h3 className="text-lg font-bold mb-2" style={{ color: c.primary }}>
          Documents sent to Credyx
        </h3>
        <p className="text-sm" style={{ color: c.secondary }}>
          Your team will process these files and update your batches shortly.
        </p>
      </div>
    )
  }

  return (
    <div className="p-5 max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-bold" style={{ color: c.primary }}>
          Send documents to Credyx
        </h2>
        <p className="text-sm mt-1" style={{ color: c.secondary }}>
          Upload your load paperwork and our team will create batches and invoices for you.
        </p>
      </div>

      <div
        className={`managed-handoff-dropzone ${isDragging ? 'managed-handoff-dropzone--active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          addFiles(e.dataTransfer.files)
        }}
      >
        <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: c.mutedLight }} />
        <p className="text-sm font-medium" style={{ color: c.primary }}>
          Drag files here or{' '}
          <label className="cursor-pointer underline" style={{ color: c.info }}>
            browse
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
        </p>
        <p className="text-xs mt-1" style={{ color: c.mutedLight }}>
          PDF, images, or scans — PODs, BOLs, rate cons
        </p>
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border"
              style={{ borderColor: c.border, color: c.secondary }}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1">{file.name}</span>
              <button
                type="button"
                className="text-xs"
                style={{ color: c.error }}
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: c.secondary }}>
          Notes for your team (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full text-sm px-3 py-2 rounded-lg border resize-none"
          style={{ borderColor: c.border, color: c.primary }}
          placeholder="Broker names, load numbers, or special instructions…"
        />
      </div>

      <button
        type="button"
        disabled={files.length === 0 || isSubmitting}
        onClick={handleSubmit}
        className="dashboard-btn-primary w-full justify-center disabled:opacity-50"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>Send to Credyx</>
        )}
      </button>
    </div>
  )
}
