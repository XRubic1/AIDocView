import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { FileText, Loader2, Sparkles, Trash2, Upload, CheckCircle2 } from 'lucide-react'
import { isAIReviewEnabled } from '../../config/aiReview'
import {
  runBatchIntakePipeline,
  submitAiBatch,
} from '../../services/credyx/batchIntakePipeline'
import type { BatchIntakeDraft, CredyxInvoiceDraft } from '../../types/credyxBatch'
import type { DocSortProgress } from '../../products/docSort/types'
import BatchAiConfirmPanel from './BatchAiConfirmPanel'
import {
  createManualCredyxDraft,
  matchBrokerByName,
  regenerateDraftInvoicePdf,
} from '../../integrations/docSortToCredyx'
import {
  assignUnmatchedDocument,
  createManualDocFingerprint,
  addDocToInvoice,
  deleteDraftDocument,
  moveDraftDocument,
  removeInvoiceFromDraft,
} from '../../utils/aiDraftDocOps'
import type { AiDraftStep } from '../../types/clientBatchDraft'

import { useClientTheme } from '../../theme/ThemeContext'
import {
  formatLoadNumberWarningsSummary,
  getBatchLoadNumberWarnings,
  getWithinBatchLoadWarnings,
  validateBatchInvoiceNumbers,
} from '../../utils/invoiceDuplicateChecks'
import { invoiceDraftBlocker } from '../../utils/invoiceDraftReady'
import {
  BATCH_PAPERWORK_ACCEPT,
  isBatchPaperworkFile,
} from '../../utils/batchPaperworkFile'

const INVOICE_PDF_FIELDS: (keyof CredyxInvoiceDraft)[] = [
  'amount',
  'invoice_number',
  'load_number',
  'broker_name',
  'invoice_date',
]

function patchUpdatesInvoicePdf(patch: Partial<CredyxInvoiceDraft>) {
  return INVOICE_PDF_FIELDS.some((field) => field in patch)
}

export interface RestoredAiDraftSession {
  step: AiDraftStep
  uploadFiles: File[]
  intake: BatchIntakeDraft | null
}

type Step = 'upload' | 'processing' | 'confirm'

interface BatchAiUploadFlowProps {
  clientId: string
  clientName: string
  confirmedBy?: string
  onComplete: (batchId: string) => void
  onCancel: () => void
  initialFiles?: File[]
  embedded?: boolean
  draftBatchId?: string
  draftBatchNumber?: string
  restoredDraft?: RestoredAiDraftSession | null
  draftReady?: boolean
  onPersistDraft?: (payload: {
    step: Step
    files: File[]
    intake: BatchIntakeDraft | null
  }) => void
  /** Credyx admin: also warn when other carriers reused a load number. */
  crossCarrierLoadWarnings?: boolean
  /** Admin create-batch skips vault onboarding gate. */
  skipSetupGate?: boolean
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Drop files' },
  { id: 'processing', label: 'Reading' },
  { id: 'confirm', label: 'Packets' },
]

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface AiUploadOverviewBarProps {
  title: string
  badge: { label: string; className: string }
  stepIndex: number
  meta?: string
}

function AiUploadOverviewBar({ title, badge, stepIndex, meta }: AiUploadOverviewBarProps) {
  return (
    <div className="client-ai-upload__overview">
      <div className="client-ai-upload__overview-main">
        <span className="client-ai-upload__overview-title">{title}</span>
        <span className={`status-pill status-pill--compact ${badge.className}`}>{badge.label}</span>
        {meta && <span className="client-ai-upload__overview-meta">{meta}</span>}
      </div>
      <div className="client-ai-upload__stepper">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`client-ai-upload__step${i < stepIndex ? ' client-ai-upload__step--done' : ''}${i === stepIndex ? ' client-ai-upload__step--active' : ''}`}
          >
            <span className="client-ai-upload__step-dot">
              {i < stepIndex ? '✓' : i + 1}
            </span>
            <span className="client-ai-upload__step-label">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** AI upload: PDFs → DocSort → confirm invoices → submit to Credyx mock store. */
export default function BatchAiUploadFlow({
  clientId,
  clientName,
  confirmedBy,
  onComplete,
  onCancel,
  initialFiles,
  embedded: _embedded = false,
  draftBatchId,
  draftBatchNumber,
  restoredDraft,
  draftReady = true,
  onPersistDraft,
  crossCarrierLoadWarnings = false,
  skipSetupGate = false,
}: BatchAiUploadFlowProps) {
  const c = useClientTheme()
  const confirmedByName = confirmedBy ?? clientName
  const hasRestored = Boolean(restoredDraft)
  const [step, setStep] = useState<Step>(restoredDraft?.step ?? 'upload')
  const [files, setFiles] = useState<File[]>(restoredDraft?.uploadFiles ?? initialFiles ?? [])
  const [draft, setDraft] = useState<BatchIntakeDraft | null>(restoredDraft?.intake ?? null)
  const restoredAppliedRef = useRef(hasRestored)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [addingInvoice, setAddingInvoice] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const regenTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const draftRef = useRef(draft)
  draftRef.current = draft

  const regenInvoicePdf = useCallback(
    async (draftId: string) => {
      const inv = draftRef.current?.invoices.find((i) => i.draftId === draftId)
      if (!inv) return
      try {
        const file = await regenerateDraftInvoicePdf(inv, clientName)
        setDraft((current) => {
          if (!current) return current
          return {
            ...current,
            invoices: current.invoices.map((i) =>
              i.draftId === draftId ? { ...i, invoice_pdf: file } : i
            ),
          }
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update invoice PDF')
      }
    },
    [clientName]
  )

  const scheduleInvoicePdfRegen = useCallback(
    (draftId: string) => {
      const existing = regenTimersRef.current[draftId]
      if (existing) clearTimeout(existing)
      regenTimersRef.current[draftId] = setTimeout(() => {
        void regenInvoicePdf(draftId)
      }, 400)
    },
    [regenInvoicePdf]
  )

  useEffect(() => {
    const timers = regenTimersRef.current
    return () => {
      Object.values(timers).forEach(clearTimeout)
    }
  }, [])

  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files])
  const stepIndex = STEPS.findIndex((s) => s.id === step)

  const runPipeline = useCallback(async (fileList: File[]) => {
    setStep('processing')
    setError(null)
    setProgress('Starting…')
    try {
      const result = await runBatchIntakePipeline(fileList, clientId, (p: DocSortProgress) => {
        setProgress(p.message ?? `${p.phase} ${p.completed}/${p.total}`)
      })
      setDraft({
        ...result,
        batchNumber: draftBatchNumber ?? result.batchNumber,
      })
      setStep('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed')
      setStep('upload')
    } finally {
      setProgress(null)
    }
  }, [draftBatchNumber, clientId])

  useEffect(() => {
    if (!restoredDraft || restoredAppliedRef.current) return
    setStep(restoredDraft.step)
    setFiles(restoredDraft.uploadFiles)
    setDraft(restoredDraft.intake)
    restoredAppliedRef.current = true
  }, [restoredDraft])

  useEffect(() => {
    if (!onPersistDraft || !draftReady || step === 'processing') return
    const timer = setTimeout(() => {
      onPersistDraft({ step, files, intake: draft })
    }, 900)
    return () => clearTimeout(timer)
  }, [step, files, draft, draftReady, onPersistDraft])

  const addPaperwork = (list: FileList | File[]) => {
    const incoming = Array.from(list)
    const accepted = incoming.filter(isBatchPaperworkFile)
    if (accepted.length === 0) {
      setError('Use PDF, JPG, or PNG files.')
      return
    }
    setFiles((prev) => [...prev, ...accepted])
    setError(
      accepted.length < incoming.length
        ? 'Some files were skipped. Use PDF, JPG, or PNG.'
        : null
    )
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list) return
    addPaperwork(list)
    e.target.value = ''
  }

  const handleDropzoneDragEnter = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDropzoneDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDropzoneDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragging(false)
  }

  const handleDropzoneDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) addPaperwork(e.dataTransfer.files)
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleProcess = () => {
    if (files.length === 0) {
      setError('Add at least one file.')
      return
    }
    void runPipeline(files)
  }

  const updateDraft = (draftId: string, patch: Partial<CredyxInvoiceDraft>) => {
    let nextPatch = patch
    // Prefer explicit broker_id from BrokerPicker; otherwise match-only (no auto-create).
    if ('broker_id' in patch || 'broker_name' in patch) {
      if (patch.broker_id) {
        nextPatch = {
          ...patch,
          broker_id: patch.broker_id,
          broker_name: patch.broker_name ?? '',
        }
      } else if (patch.broker_name !== undefined) {
        const broker = matchBrokerByName(patch.broker_name)
        nextPatch = {
          ...patch,
          broker_id: broker.broker_id,
          broker_name: broker.broker_name,
        }
      }
    }

    setDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        invoices: prev.invoices.map((inv) =>
          inv.draftId === draftId ? { ...inv, ...nextPatch } : inv
        ),
      }
    })
    if (patchUpdatesInvoicePdf(nextPatch)) {
      scheduleInvoicePdfRegen(draftId)
    }
  }

  const addManualDraft = async () => {
    if (!draftRef.current || addingInvoice) return
    setAddingInvoice(true)
    setError(null)
    try {
      const newDraft = await createManualCredyxDraft(draftRef.current.invoices, clientId, clientName)
      setDraft((prev) => {
        if (!prev) return prev
        return { ...prev, invoices: [...prev.invoices, newDraft] }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add invoice')
    } finally {
      setAddingInvoice(false)
    }
  }

  const removeDraft = (draftId: string) => {
    setDraft((prev) => (prev ? removeInvoiceFromDraft(prev, draftId) : prev))
  }

  const moveDocument = (
    fromDraftId: string,
    docId: string,
    toDraftId: string | null
  ) => {
    setDraft((prev) => (prev ? moveDraftDocument(prev, fromDraftId, docId, toDraftId) : prev))
  }

  const assignUnmatchedDoc = (docId: string, toDraftId: string) => {
    setDraft((prev) => (prev ? assignUnmatchedDocument(prev, docId, toDraftId) : prev))
  }

  const assignUnmatchedDocs = (docIds: string[], toDraftId: string) => {
    if (docIds.length === 0) return
    setDraft((prev) => {
      if (!prev) return prev
      return docIds.reduce(
        (next, docId) => assignUnmatchedDocument(next, docId, toDraftId),
        prev
      )
    })
  }

  const attachDraftDocuments = (draftId: string, files: File[]) => {
    if (files.length === 0) return
    setDraft((prev) => {
      if (!prev) return prev
      const nextFileById = new Map(prev.fileById)
      let invoices = prev.invoices

      files.forEach((file) => {
        const docId = `manual-doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        nextFileById.set(docId, file)
        const fingerprint = createManualDocFingerprint(docId, file)
        invoices = invoices.map((inv) =>
          inv.draftId === draftId ? addDocToInvoice(inv, fingerprint) : inv
        )
      })

      return { ...prev, fileById: nextFileById, invoices }
    })
  }

  const deleteDocument = (docId: string) => {
    setDraft((prev) => (prev ? deleteDraftDocument(prev, docId) : prev))
  }

  const handleSubmit = async () => {
    if (!draft) return

    const numberIssues = validateBatchInvoiceNumbers(
      clientId,
      draft.invoices.map((inv) => inv.invoice_number?.trim() || '')
    )
    if (numberIssues.length > 0) {
      setError(numberIssues[0].message)
      return
    }

    const unmatchedCount =
      draft.unmatched.rateCons.length +
      draft.unmatched.bols.length +
      draft.unmatched.other.length
    if (unmatchedCount > 0) {
      setError('Assign or delete every document before sending this batch to verification.')
      return
    }

    const firstBlocker = draft.invoices.map((inv) => invoiceDraftBlocker(inv)).find(Boolean)
    if (firstBlocker) {
      setError(firstBlocker)
      return
    }

    const loadWarnings = getBatchLoadNumberWarnings(
      clientId,
      draft.invoices.map((inv) => inv.load_number),
      { crossCarrier: crossCarrierLoadWarnings }
    )
    const withinBatchLoad = getWithinBatchLoadWarnings(
      draft.invoices.map((inv) => inv.load_number)
    )
    if (loadWarnings.length > 0 || withinBatchLoad.length > 0) {
      const mode = crossCarrierLoadWarnings ? 'admin' : 'client'
      const summary =
        loadWarnings.length > 0
          ? formatLoadNumberWarningsSummary(loadWarnings, mode)
          : `${withinBatchLoad.join('\n')}\n\nSubmit anyway?`
      if (!window.confirm(summary)) return
    }

    setSubmitting(true)
    setError(null)
    try {
      const { batchId } = await submitAiBatch({
        clientId,
        clientName,
        drafts: draft.invoices.map((inv) => ({ ...inv, confirmed: true })),
        sortResult: draft.sortResult,
        fileById: draft.fileById,
        confirmedBy: confirmedByName,
        existingBatchId: draftBatchId,
        skipSetupGate,
      })
      onComplete(batchId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAIReviewEnabled()) {
    return (
      <div className="client-ai-upload">
        <div className="client-ai-upload__empty">
          <Sparkles className="w-10 h-10 mb-3" style={{ color: c.mutedLight }} />
          <p className="text-sm font-medium" style={{ color: c.primary }}>
            AI upload requires configuration
          </p>
          <p className="text-xs mt-1 max-w-md" style={{ color: c.secondary }}>
            AI review requires the openai-proxy Edge Function (OPENAI_API_KEY
            secret). Switch to manual batch entry if AI is unavailable.
          </p>
          <button type="button" className="dashboard-btn-secondary mt-4" onClick={onCancel}>
            Choose another method
          </button>
        </div>
      </div>
    )
  }

  if (step === 'confirm' && draft) {
    return (
      <div className="client-ai-upload">
        <AiUploadOverviewBar
          title={draft.batchNumber}
          badge={{ label: 'Draft saved', className: 'status-pill--pending-batch' }}
          stepIndex={stepIndex}
          meta={`${draft.invoices.length} invoice${draft.invoices.length !== 1 ? 's' : ''}`}
        />
        {error && <p className="client-ai-upload__error-banner">{error}</p>}
        <BatchAiConfirmPanel
          draft={draft}
          clientId={clientId}
          crossCarrierLoadWarnings={crossCarrierLoadWarnings}
          brokerPickerMode={skipSetupGate ? 'admin' : 'carrier'}
          onUpdateDraft={updateDraft}
          onAddInvoice={addManualDraft}
          onRemoveDraft={removeDraft}
          onMoveDocument={moveDocument}
          onAssignUnmatchedDoc={assignUnmatchedDoc}
          onAssignUnmatchedDocs={assignUnmatchedDocs}
          onAttachDocuments={attachDraftDocuments}
          onDeleteDocument={deleteDocument}
          addingInvoice={addingInvoice}
          onSubmitBatch={handleSubmit}
          submitting={submitting}
        />
      </div>
    )
  }

  if (step === 'processing') {
    return (
      <div className="client-ai-upload">
        <AiUploadOverviewBar
          title="Processing paperwork"
          badge={{ label: 'Working', className: 'status-pill--pending-batch' }}
          stepIndex={stepIndex}
        />
        <div className="client-ai-upload__processing">
          <div className="client-ai-upload__processing-icon">
            <Loader2 className="client-ai-upload__spinner w-10 h-10" />
          </div>
          <p className="text-sm font-semibold mt-4" style={{ color: c.primary }}>
            Reading load #, broker, and rate…
          </p>
          <p className="text-xs mt-2" style={{ color: c.secondary }}>
            {progress || 'Creating invoice drafts from your PDFs'}
          </p>
          <ul className="client-ai-upload__reading-files">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>{file.name}</span>
              </li>
            ))}
          </ul>
          <div className="client-ai-upload__progress-track">
            <div className="client-ai-upload__progress-bar" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="client-ai-upload">
      <AiUploadOverviewBar
        title={draftBatchNumber ?? 'Upload paperwork'}
        badge={{ label: 'Draft saved', className: 'status-pill--pending-batch' }}
        stepIndex={stepIndex}
        meta={`${files.length} file${files.length !== 1 ? 's' : ''}${files.length ? ` · ${formatFileSize(totalBytes)}` : ''} · PDF / JPG / PNG`}
      />

      <div className="client-ai-upload__body">
        <div className="client-ai-upload__drop-panel">
          <label
            className={`client-ai-upload__dropzone${isDragging ? ' client-ai-upload__dropzone--active' : ''}`}
            onDragEnter={handleDropzoneDragEnter}
            onDragOver={handleDropzoneDragOver}
            onDragLeave={handleDropzoneDragLeave}
            onDrop={handleDropzoneDrop}
          >
            <input
              type="file"
              accept={BATCH_PAPERWORK_ACCEPT}
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="client-ai-upload__dropzone-icon">
              <Upload className="w-6 h-6" />
            </div>
            <span className="client-ai-upload__dropzone-title">
              {isDragging ? 'Drop files to add them' : 'Drop files, then process when ready'}
            </span>
            <span className="client-ai-upload__dropzone-desc">
              PDF, JPG, or PNG. Add every page you have, then click Process files.
            </span>
          </label>

          <ul className="client-ai-upload__tips">
            <li>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Add more files anytime before processing
            </li>
            <li>
              <CheckCircle2 className="w-3.5 h-3.5" />
              AI fills load #, broker, and rate from the pages
            </li>
            <li>
              <CheckCircle2 className="w-3.5 h-3.5" />
              You review drafts next to the paperwork
            </li>
            <li>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Submit when every invoice looks right
            </li>
          </ul>
        </div>

        <aside className="client-ai-upload__files-panel">
          <div className="client-ai-upload__files-header">
            <h3 className="client-ai-upload__files-title">Selected files</h3>
            <span className="client-ai-upload__files-count">{files.length}</span>
          </div>

          {files.length === 0 ? (
            <div className="client-ai-upload__files-empty">
              <FileText className="w-8 h-8 mb-2" style={{ color: c.mutedLight }} />
              <p className="text-xs" style={{ color: c.secondary }}>
                No files yet — add PDF, JPG, or PNG, then process
              </p>
            </div>
          ) : (
            <ul className="client-ai-upload__file-list">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="client-ai-upload__file-item">
                  <FileText className="w-4 h-4 shrink-0" style={{ color: c.secondary }} />
                  <div className="client-ai-upload__file-meta">
                    <span className="client-ai-upload__file-name">{file.name}</span>
                    <span className="client-ai-upload__file-size">{formatFileSize(file.size)}</span>
                  </div>
                  <button
                    type="button"
                    className="client-ai-upload__file-remove"
                    onClick={() => removeFile(index)}
                    title="Remove file"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="client-ai-upload__error">{error}</p>}

          <div className="client-ai-upload__files-footer">
            <button
              type="button"
              className="dashboard-btn-primary client-ai-upload__process-btn"
              disabled={files.length === 0}
              onClick={handleProcess}
            >
              <Sparkles className="w-4 h-4" />
              Process files
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
