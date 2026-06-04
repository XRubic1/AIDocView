import { useCallback, useEffect, useState } from 'react'
import { isAIReviewEnabled } from '../../config/aiReview'
import {
  runBatchIntakePipeline,
  submitAiBatch,
} from '../../services/credyx/batchIntakePipeline'
import type { BatchIntakeDraft, CredyxInvoiceDraft } from '../../types/credyxBatch'
import type { DocSortProgress } from '../../products/docSort/types'
import BatchAiConfirmPanel from './BatchAiConfirmPanel'

interface BatchAiUploadFlowProps {
  clientId: string
  clientName: string
  /** Who confirmed invoices (defaults to client name). */
  confirmedBy?: string
  onComplete: (batchId: string) => void
  onCancel: () => void
  initialFiles?: File[]
}

type Step = 'upload' | 'processing' | 'confirm'

/** AI upload: PDFs → DocSort → confirm invoices → submit to Credyx mock store. */
export default function BatchAiUploadFlow({
  clientId,
  clientName,
  confirmedBy,
  onComplete,
  onCancel,
  initialFiles,
}: BatchAiUploadFlowProps) {
  const confirmedByName = confirmedBy ?? clientName
  const [step, setStep] = useState<Step>(initialFiles?.length ? 'processing' : 'upload')
  const [files, setFiles] = useState<File[]>(initialFiles ?? [])
  const [draft, setDraft] = useState<BatchIntakeDraft | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const runPipeline = useCallback(async (fileList: File[]) => {
    setStep('processing')
    setError(null)
    setProgress('Starting…')
    try {
      const result = await runBatchIntakePipeline(fileList, (p: DocSortProgress) => {
        setProgress(p.message ?? `${p.phase} ${p.completed}/${p.total}`)
      })
      setDraft(result)
      setStep('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed')
      setStep('upload')
    } finally {
      setProgress(null)
    }
  }, [])

  useEffect(() => {
    if (initialFiles?.length) {
      runPipeline(initialFiles)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when prefilled from dashboard
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list) return
    const pdfs = Array.from(list).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    )
    setFiles((prev) => [...prev, ...pdfs])
    e.target.value = ''
  }

  const handleProcess = () => {
    if (files.length === 0) {
      setError('Add at least one PDF.')
      return
    }
    runPipeline(files)
  }

  const updateDraft = (draftId: string, patch: Partial<CredyxInvoiceDraft>) => {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        invoices: prev.invoices.map((inv) =>
          inv.draftId === draftId ? { ...inv, ...patch } : inv
        ),
      }
    })
  }

  const confirmDraft = (draftId: string) => {
    updateDraft(draftId, { confirmed: true })
  }

  const handleSubmit = async () => {
    if (!draft) return
    setSubmitting(true)
    setError(null)
    try {
      const { batchId } = submitAiBatch({
        clientId,
        clientName,
        drafts: draft.invoices,
        sortResult: draft.sortResult,
        fileById: draft.fileById,
        confirmedBy: confirmedByName,
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
      <div className="p-4 border rounded text-sm" style={{ borderColor: '#819291' }}>
        Add <code>VITE_OPENAI_API_KEY</code> to your .env file to use AI upload.
        <button type="button" className="ml-4 underline" onClick={onCancel}>
          Back
        </button>
      </div>
    )
  }

  if (step === 'confirm' && draft) {
    return (
      <div className="flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-2 py-1 shrink-0">
          <h3 className="text-sm font-bold truncate" style={{ color: '#113543' }}>
            Review & confirm · {draft.batchNumber}
          </h3>
          <button type="button" className="text-xs underline shrink-0" style={{ color: '#819291' }} onClick={onCancel}>
            Cancel
          </button>
        </div>
        {error && (
          <p className="py-1 text-xs shrink-0" style={{ color: '#b91c1c' }}>
            {error}
          </p>
        )}
        <BatchAiConfirmPanel
          draft={draft}
          onUpdateDraft={updateDraft}
          onConfirmDraft={confirmDraft}
          onSubmitBatch={handleSubmit}
          submitting={submitting}
        />
      </div>
    )
  }

  if (step === 'processing') {
    return (
      <div className="p-8 text-center">
        <p className="font-medium" style={{ color: '#113543' }}>
          Sorting paperwork & creating invoices…
        </p>
        {progress && (
          <p className="text-sm mt-2" style={{ color: '#819291' }}>
            {progress}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: '#113543' }}>
          AI upload
        </h3>
        <button type="button" className="text-sm underline" style={{ color: '#819291' }} onClick={onCancel}>
          Back
        </button>
      </div>
      <p className="text-sm" style={{ color: '#819291' }}>
        Upload rate cons and BOLs. We will sort by load, extract rates, and draft invoices for your
        confirmation.
      </p>
      <label
        className="block border-2 border-dashed rounded p-8 text-center cursor-pointer"
        style={{ borderColor: '#C2A558' }}
      >
        <input type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={handleFileSelect} />
        <span style={{ color: '#113543' }}>Drop PDFs or click to browse</span>
      </label>
      {files.length > 0 && (
        <ul className="text-sm max-h-40 overflow-y-auto" style={{ color: '#113543' }}>
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>{f.name}</li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-sm" style={{ color: '#b91c1c' }}>
          {error}
        </p>
      )}
      <button
        type="button"
        className="px-6 py-2 rounded font-medium"
        style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
        disabled={files.length === 0}
        onClick={handleProcess}
      >
        Process paperwork
      </button>
    </div>
  )
}
