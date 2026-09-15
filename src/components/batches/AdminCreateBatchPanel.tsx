import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { getAllClients, getClientById } from '../../services/clientRegistry'
import { getBatchById, updateBatch } from '../../data/mockBatches'
import BatchAiUploadFlow from '../client/BatchAiUploadFlow'
import ManualBatchBuilder from './ManualBatchBuilder'
import type { BatchIntakeDraft } from '../../types/credyxBatch'
import {
  clearClientDraftStorage,
  loadAiDraftSnapshot,
  persistAiDraftIfNeeded,
} from '../../services/clientBatchDraftService'
import { notifyTenantDataUpdated } from '../../services/supabase/tenantDataLiveSync'

type CreateStep = 'client' | 'choose' | 'ai' | 'manual'

interface AdminCreateBatchPanelProps {
  onComplete: (batchId: string) => void
  onCancel: () => void
  /** Display name for AI confirm / audit trail */
  adminName?: string
  /** Resume an existing draft batch (from the batches list). */
  resumeDraftBatchId?: string | null
}

type RestoredAiDraft = {
  step: 'upload' | 'processing' | 'confirm'
  uploadFiles: File[]
  intake: BatchIntakeDraft | null
}

/**
 * Admin batch creation: pick client, then AI or manual upload (same pipeline as client).
 * AI drafts persist to IndexedDB + draft batch row (Supabase) like the client portal.
 */
export default function AdminCreateBatchPanel({
  onComplete,
  onCancel,
  adminName = 'Admin User',
  resumeDraftBatchId = null,
}: AdminCreateBatchPanelProps) {
  const [step, setStep] = useState<CreateStep>('client')
  const [clientId, setClientId] = useState('')
  const [draftBatchId, setDraftBatchId] = useState<string | null>(null)
  const [draftReady, setDraftReady] = useState(false)
  const [restoredDraft, setRestoredDraft] = useState<RestoredAiDraft | null>(null)
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [bootError, setBootError] = useState<string | null>(null)
  const draftBatchIdRef = useRef<string | null>(null)
  const resumeAppliedRef = useRef(false)
  draftBatchIdRef.current = draftBatchId

  const selectedClient = getClientById(clientId)
  const draftBatch = draftBatchId ? getBatchById(draftBatchId) : undefined

  const resetToClient = () => {
    setStep('client')
    setClientId('')
    setDraftBatchId(null)
    draftBatchIdRef.current = null
    setDraftReady(false)
    setRestoredDraft(null)
    setDraftSaveState('idle')
    setBootError(null)
    resumeAppliedRef.current = false
  }

  const handleComplete = (batchId: string) => {
    void clearClientDraftStorage(batchId)
    onComplete(batchId)
    resetToClient()
  }

  const beginAiForClient = useCallback(async (nextClientId: string, preferredDraftId?: string | null) => {
    const client = getClientById(nextClientId)
    if (!client) {
      setBootError('Client not found.')
      return
    }

    setBootError(null)
    setDraftReady(false)
    setRestoredDraft(null)
    setClientId(nextClientId)
    setStep('ai')

    try {
      const preferred = preferredDraftId ? getBatchById(preferredDraftId) : undefined
      const existing =
        preferred?.client_id === nextClientId &&
        (preferred.status === 'draft' || preferred.status === 'creating')
          ? preferred
          : undefined

      if (existing) {
        if (existing.status === 'draft') {
          updateBatch(existing.id, { status: 'creating' })
        }
        const loaded = await loadAiDraftSnapshot(existing.id)
        if (loaded) {
          setDraftBatchId(existing.id)
          draftBatchIdRef.current = existing.id
          setRestoredDraft({
            step: loaded.snapshot.step === 'processing' ? 'upload' : loaded.snapshot.step,
            uploadFiles: loaded.uploadFiles,
            intake: loaded.intake,
          })
          setDraftSaveState('saved')
        } else {
          setDraftBatchId(existing.id)
          draftBatchIdRef.current = existing.id
        }
      } else {
        setDraftBatchId(null)
        draftBatchIdRef.current = null
      }
    } catch (err) {
      console.error('[AdminCreateBatchPanel] restore draft failed', err)
      setBootError(err instanceof Error ? err.message : 'Could not restore draft')
    } finally {
      setDraftReady(true)
    }
  }, [])

  // Resume from batches list when a draft id is provided.
  useEffect(() => {
    if (!resumeDraftBatchId || resumeAppliedRef.current) return
    const batch = getBatchById(resumeDraftBatchId)
    if (!batch || (batch.status !== 'draft' && batch.status !== 'creating')) return
    resumeAppliedRef.current = true
    void beginAiForClient(batch.client_id, resumeDraftBatchId)
  }, [resumeDraftBatchId, beginAiForClient])

  const handlePersistAiDraft = useCallback(
    async (payload: {
      step: 'upload' | 'processing' | 'confirm'
      files: File[]
      intake: BatchIntakeDraft | null
    }) => {
      if (!selectedClient) return
      setDraftSaveState('saving')
      try {
        const { batchId, result } = await persistAiDraftIfNeeded(
          selectedClient.id,
          selectedClient.name,
          draftBatchIdRef.current,
          { step: payload.step },
          payload.intake,
          payload.files,
          { batchStatus: 'creating' }
        )
        if (batchId && batchId !== draftBatchIdRef.current) {
          setDraftBatchId(batchId)
          draftBatchIdRef.current = batchId
        }
        if (result === 'cleared') {
          setDraftBatchId(null)
          draftBatchIdRef.current = null
          setDraftSaveState('idle')
          notifyTenantDataUpdated(['batches'], selectedClient.id)
          return
        }
        if (result === 'saved') {
          setDraftSaveState('saved')
          notifyTenantDataUpdated(['batches'], selectedClient.id)
          return
        }
        setDraftSaveState('idle')
      } catch (err) {
        console.error('[AdminCreateBatchPanel] draft persist failed', err)
        setDraftSaveState('error')
        throw err
      }
    },
    [selectedClient]
  )

  if (step === 'client') {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold" style={{ color: '#113543' }}>
              Create batch
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#819291' }}>
              Select client, then AI or manual upload
            </p>
          </div>
          <button
            type="button"
            className="text-sm underline"
            style={{ color: '#819291' }}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
            Client <span style={{ color: '#C2A558' }}>*</span>
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full max-w-md px-3 py-2 text-sm border rounded"
            style={{ borderColor: '#819291', color: '#113543' }}
          >
            <option value="">Choose a client…</option>
            {getAllClients().map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={!clientId}
          className="flex items-center space-x-2 px-6 py-2 text-sm font-medium rounded transition-colors"
          style={{
            backgroundColor: clientId ? '#113543' : '#cccccc',
            color: '#FFFFFF',
            cursor: clientId ? 'pointer' : 'not-allowed',
          }}
          onClick={() => setStep('choose')}
        >
          <Plus className="w-4 h-4" />
          <span>Continue</span>
        </button>
      </div>
    )
  }

  if (!selectedClient) {
    resetToClient()
    return null
  }

  if (step === 'choose') {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold" style={{ color: '#113543' }}>
              {selectedClient.name}
            </h2>
            <button
              type="button"
              className="text-sm underline mt-1"
              style={{ color: '#819291' }}
              onClick={() => setStep('client')}
            >
              Change client
            </button>
          </div>
          <button type="button" className="text-sm underline" style={{ color: '#819291' }} onClick={onCancel}>
            Cancel
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
          <button
            type="button"
            className="p-4 border-2 rounded text-left transition-shadow hover:shadow-md"
            style={{ borderColor: '#819291' }}
            onClick={() => void beginAiForClient(selectedClient.id)}
          >
            <h3 className="text-sm font-bold mb-1" style={{ color: '#113543' }}>
              AI upload
            </h3>
            <p className="text-xs" style={{ color: '#819291' }}>
              Drop paperwork — drafts auto-save while you work
            </p>
          </button>
          <button
            type="button"
            className="p-4 border-2 rounded text-left transition-shadow hover:shadow-md"
            style={{ borderColor: '#819291' }}
            onClick={() => setStep('manual')}
          >
            <h3 className="text-sm font-bold mb-1" style={{ color: '#113543' }}>
              Manual batch
            </h3>
            <p className="text-xs" style={{ color: '#819291' }}>
              Enter invoices and attach PDFs
            </p>
          </button>
        </div>
      </div>
    )
  }

  if (step === 'ai') {
    return (
      <div
        className="flex-1 min-h-0 h-full overflow-hidden flex flex-col border-t"
        style={{ borderColor: '#819291' }}
      >
        <div
          className="flex items-center justify-between gap-2 px-4 py-2 shrink-0 text-xs border-b"
          style={{ borderColor: '#e2e8f0' }}
        >
          <p style={{ color: '#819291' }}>
            Client: <strong style={{ color: '#113543' }}>{selectedClient.name}</strong>
            {draftBatch?.batch_number ? (
              <span>
                {' '}
                · {draftBatch.batch_number}
              </span>
            ) : null}
            {draftSaveState === 'saving' ? (
              <span className="ml-2" style={{ color: '#819291' }}>
                Saving draft…
              </span>
            ) : draftSaveState === 'saved' ? (
              <span className="ml-2" style={{ color: '#1684FE' }}>
                Draft saved
              </span>
            ) : draftSaveState === 'error' ? (
              <span className="ml-2" style={{ color: '#dc2626' }}>
                Draft save failed
              </span>
            ) : null}
          </p>
          <button
            type="button"
            className="underline"
            style={{ color: '#819291' }}
            onClick={() => setStep('choose')}
          >
            Back
          </button>
        </div>
        {bootError && (
          <p className="px-4 py-2 text-xs" style={{ color: '#dc2626' }}>
            {bootError}
          </p>
        )}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {draftReady ? (
            <BatchAiUploadFlow
              // Stable key — do not remount when draftBatchId is assigned after first save
              // (that wiped uploaded files and then purged the draft as "empty").
              key={`ai-upload-${selectedClient.id}`}
              clientId={selectedClient.id}
              clientName={selectedClient.name}
              confirmedBy={adminName}
              crossCarrierLoadWarnings
              skipSetupGate
              draftBatchId={draftBatchId ?? undefined}
              draftBatchNumber={draftBatch?.batch_number}
              restoredDraft={restoredDraft}
              draftReady={draftReady}
              onPersistDraft={handlePersistAiDraft}
              onCancel={() => setStep('choose')}
              onComplete={handleComplete}
            />
          ) : (
            <p className="px-4 py-6 text-sm" style={{ color: '#819291' }}>
              Loading draft…
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 border-t" style={{ borderColor: '#819291' }}>
      <ManualBatchBuilder
        clientId={selectedClient.id}
        clientName={selectedClient.name}
        onBack={() => setStep('choose')}
        onSuccess={handleComplete}
      />
    </div>
  )
}
