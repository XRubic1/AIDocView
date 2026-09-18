/**
 * Credyx Doc Splitter — review and unpack combined PDFs (RC + BOL + invoice)
 * before Packet Rework. Auto-unpack is disabled because it mis-created invoices.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileStack, Loader2, Scissors } from 'lucide-react'
import { getBatchById, updateBatch } from '../../data/mockBatches'
import { setBatchFiles } from '../../data/batchFileStore'
import type { BatchIntakeDraft } from '../../types/credyxBatch'
import { useClientTheme } from '../../theme/ThemeContext'
import { useToast } from '../ui/ToastProvider'
import { hydrateIntakeDraftFromBatch } from '../../utils/buildIntakeDraftFromBatch'
import {
  clearBatchNeedsDocSplit,
  draftHasCombinedDocuments,
  listCombinedDraftDocIds,
} from '../../utils/batchDocSplit'
import {
  canUnpackDraftDocument,
  locateDraftDocument,
  unpackDraftDocument,
} from '../../utils/aiDraftDocOps'
import { buildUnpackPageGroups } from '../../products/docSort/services/docSortUnpack'
import { buildDocSortSnapshot } from '../../products/docSort/utils/docSortSnapshot'
import { notifyTenantDataUpdated } from '../../services/supabase/tenantDataLiveSync'
import {
  ensureStoredBatchFile,
  prefetchStoredBatchFiles,
} from '../../utils/resolveHandoffDocuments'

interface BatchDocSplitterWorkspaceProps {
  batchId: string
  onClose: () => void
  /** After all combined PDFs are split, open Packet Rework. */
  onContinueToPacketRework: (batchId: string) => void
}

function findFingerprintLabel(draft: BatchIntakeDraft, docId: string): string {
  const located = locateDraftDocument(draft, docId)
  return located?.fingerprint.fileName || docId
}

function attachFetchedFile(
  prev: BatchIntakeDraft | null,
  docId: string,
  file: File
): BatchIntakeDraft | null {
  if (!prev || prev.fileById.has(docId)) return prev
  const nextFiles = new Map(prev.fileById)
  nextFiles.set(docId, file)
  return { ...prev, fileById: nextFiles }
}

/** Admin workspace: split combined paperwork PDFs before building packets. */
export default function BatchDocSplitterWorkspace({
  batchId,
  onClose,
  onContinueToPacketRework,
}: BatchDocSplitterWorkspaceProps) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const batch = getBatchById(batchId)
  const [draft, setDraft] = useState<BatchIntakeDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [busyDocId, setBusyDocId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadDraft = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await hydrateIntakeDraftFromBatch(batchId)
      if (!next) {
        setError('Could not load batch documents for Doc Splitter.')
        setDraft(null)
        return
      }
      setDraft(next)
      const combined = listCombinedDraftDocIds(next)
      setSelectedDocId(combined[0] ?? null)
    } catch (err) {
      console.warn('[BatchDocSplitterWorkspace] hydrate failed', err)
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [batchId])

  useEffect(() => {
    void loadDraft()
  }, [loadDraft])

  const storagePathsKey = draft?.storagePathsByDocId
    ? Object.keys(draft.storagePathsByDocId).sort().join('\0')
    : ''

  useEffect(() => {
    const paths = draft?.storagePathsByDocId
    if (!paths || Object.keys(paths).length === 0) return
    let cancelled = false
    void prefetchStoredBatchFiles(batchId, paths, {
      concurrency: 4,
      shouldContinue: () => !cancelled,
      onFile: (docId, file) => {
        if (cancelled) return
        setDraft((prev) => attachFetchedFile(prev, docId, file))
      },
    })
    return () => {
      cancelled = true
    }
  }, [batchId, storagePathsKey])

  const combinedIds = useMemo(
    () => (draft ? listCombinedDraftDocIds(draft) : []),
    [draft]
  )

  const selectedGroups = useMemo(() => {
    if (!draft || !selectedDocId) return []
    const located = locateDraftDocument(draft, selectedDocId)
    return buildUnpackPageGroups(located?.fingerprint.extract)
  }, [draft, selectedDocId])

  const persistDraftFiles = (next: BatchIntakeDraft) => {
    setBatchFiles(batchId, next.fileById)
    const unmatchedIds = [
      ...next.unmatched.rateCons,
      ...next.unmatched.bols,
      ...next.unmatched.other,
    ].map((fp) => fp.docId)
    const stillNeeds = draftHasCombinedDocuments(next)
    updateBatch(batchId, {
      unmatched_doc_ids: unmatchedIds,
      doc_sort_snapshot: buildDocSortSnapshot(next.sortResult, next.invoices),
      needs_doc_split: stillNeeds,
      sort_status: stillNeeds ? 'needs_split' : 'failed',
    })
    notifyTenantDataUpdated(['batches'], batch?.client_id)
  }

  const ensureFileForDoc = async (docId: string, current: BatchIntakeDraft) => {
    if (current.fileById.has(docId)) return current
    const storagePath = current.storagePathsByDocId?.[docId]
    if (!storagePath) return current
    const fileName = findFingerprintLabel(current, docId)
    const file = await ensureStoredBatchFile(batchId, docId, storagePath, fileName)
    if (!file) return current
    const fileById = new Map(current.fileById)
    fileById.set(docId, file)
    const next = { ...current, fileById }
    setDraft(next)
    return next
  }

  const handleUnpack = async (docId: string) => {
    if (!draft) return
    setBusyDocId(docId)
    try {
      const withFile = await ensureFileForDoc(docId, draft)
      if (!canUnpackDraftDocument(withFile, docId)) {
        showToast('This PDF cannot be split (missing page types).', 'info')
        return
      }
      const result = await unpackDraftDocument(withFile, docId)
      setDraft(result.draft)
      persistDraftFiles(result.draft)
      if (result.status === 'rescued_unassigned') {
        showToast(result.message || 'Could not split — file kept in Unassigned.', 'info')
      } else {
        showToast('PDF split into separate RC / BOL / Invoice files.', 'success')
      }
      const remaining = listCombinedDraftDocIds(result.draft)
      setSelectedDocId(remaining[0] ?? null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Split failed', 'error')
    } finally {
      setBusyDocId(null)
    }
  }

  const handleContinue = () => {
    if (draft && draftHasCombinedDocuments(draft)) {
      showToast('Split every combined PDF before continuing to Packet Rework.', 'info')
      return
    }
    if (draft) persistDraftFiles(draft)
    clearBatchNeedsDocSplit(batchId)
    onContinueToPacketRework(batchId)
  }

  if (!batch) {
    return (
      <div className="p-6">
        <p style={{ color: c.secondary }}>Batch not found.</p>
        <button type="button" className="dashboard-btn-secondary mt-3" onClick={onClose}>
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-0 h-full overflow-hidden">
      <header
        className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: c.border }}
      >
        <button
          type="button"
          onClick={onClose}
          className="client-header-icon-btn p-1.5 rounded-lg"
          style={{ color: c.muted }}
          aria-label="Back to batches"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide" style={{ color: c.muted }}>
            Doc Splitter
          </p>
          <h1 className="text-base font-semibold truncate" style={{ color: c.primary }}>
            {batch.batch_number}
            <span className="font-normal" style={{ color: c.secondary }}>
              {' '}
              · {batch.client_name}
            </span>
          </h1>
          <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
            Combined PDFs (invoice + RC + BOL) must be split before Packet Rework so invoice #s
            and documents assign correctly.
          </p>
        </div>
        <button
          type="button"
          className="dashboard-btn-primary shrink-0"
          disabled={combinedIds.length > 0}
          title={
            combinedIds.length > 0
              ? 'Split all combined PDFs first'
              : 'Continue to Packet Rework'
          }
          onClick={handleContinue}
        >
          Continue to Packet Rework
        </button>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-2" style={{ color: c.secondary }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading documents…
        </div>
      ) : error ? (
        <div className="p-6">
          <p style={{ color: '#b91c1c' }}>{error}</p>
          <button type="button" className="dashboard-btn-secondary mt-3" onClick={() => void loadDraft()}>
            Retry
          </button>
        </div>
      ) : combinedIds.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <FileStack className="w-10 h-10" style={{ color: c.success }} aria-hidden />
          <p className="font-medium" style={{ color: c.primary }}>
            No combined PDFs left
          </p>
          <p className="text-sm max-w-md" style={{ color: c.secondary }}>
            All multi-kind files are split. Continue to Packet Rework to assign documents into
            invoices.
          </p>
          <button type="button" className="dashboard-btn-primary mt-2" onClick={handleContinue}>
            Continue to Packet Rework
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[280px_1fr] overflow-hidden">
          <aside
            className="border-r overflow-y-auto min-h-0 p-3 space-y-2"
            style={{ borderColor: c.border }}
          >
            <p className="text-xs font-medium px-1" style={{ color: c.secondary }}>
              Combined files ({combinedIds.length})
            </p>
            {combinedIds.map((docId) => {
              const active = docId === selectedDocId
              const name = draft ? findFingerprintLabel(draft, docId) : docId
              return (
                <button
                  key={docId}
                  type="button"
                  onClick={() => setSelectedDocId(docId)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors"
                  style={{
                    borderColor: active ? c.accent : c.border,
                    backgroundColor: active ? c.card : c.card,
                    color: c.primary,
                    boxShadow: active ? `inset 0 0 0 1px ${c.accent}` : undefined,
                  }}
                >
                  <span className="block truncate font-medium">{name}</span>
                  <span className="text-xs" style={{ color: c.muted }}>
                    Needs split
                  </span>
                </button>
              )
            })}
          </aside>

          <section className="min-h-0 overflow-y-auto p-4 space-y-4">
            {selectedDocId && draft ? (
              <>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: c.primary }}>
                    {findFingerprintLabel(draft, selectedDocId)}
                  </h2>
                  <p className="text-xs mt-1" style={{ color: c.secondary }}>
                    Detected page groups — split creates one PDF per type.
                  </p>
                </div>
                <ul className="space-y-2">
                  {selectedGroups.map((g) => (
                    <li
                      key={g.kind}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: c.border, backgroundColor: c.card }}
                    >
                      <span style={{ color: c.primary }}>{g.label}</span>
                      <span className="tabular-nums text-xs" style={{ color: c.muted }}>
                        {g.pageNumbers.length} page{g.pageNumbers.length === 1 ? '' : 's'} (
                        {g.pageNumbers.join(', ')})
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="dashboard-btn-primary inline-flex items-center gap-2"
                  disabled={busyDocId === selectedDocId}
                  onClick={() => void handleUnpack(selectedDocId)}
                >
                  {busyDocId === selectedDocId ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Scissors className="w-4 h-4" />
                  )}
                  Split into separate PDFs
                </button>
              </>
            ) : (
              <p style={{ color: c.secondary }}>Select a combined PDF to review.</p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
