import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import BatchAiConfirmPanel from '../client/BatchAiConfirmPanel'
import { getBatchById, updateBatch, addInvoicesForBatch, updateBatchTotals } from '../../data/mockBatches'
import { getInvoiceById, updateInvoice } from '../../data/mockInvoices'
import { mergeBatchFiles, setBatchFiles } from '../../data/batchFileStore'
import {
  createManualCredyxDraft,
  draftToInvoiceFields,
  isManualCredyxDraft,
  matchBrokerByName,
  regenerateDraftInvoicePdf,
} from '../../integrations/docSortToCredyx'
import type { BatchIntakeDraft, CredyxInvoiceDraft } from '../../types/credyxBatch'
import { useClientTheme } from '../../theme/ThemeContext'
import { useTenantDataRevision } from '../../hooks/useTenantDataRevision'
import { useToast } from '../ui/ToastProvider'
import { hydrateIntakeDraftFromBatch } from '../../utils/buildIntakeDraftFromBatch'
import { buildDocSortSnapshot } from '../../products/docSort/utils/docSortSnapshot'
import { emailDomainFromFingerprints } from '../../products/docSort/utils/formatRate'
import {
  addDocToInvoice,
  assignUnmatchedDocument,
  createManualDocFingerprint,
  deleteDraftDocument,
  moveDraftDocument,
  placeDraftDocument,
  pruneUnmatchedAgainstAssigned,
  withPrunedUnmatched,
  removeInvoiceFromDraft,
} from '../../utils/aiDraftDocOps'
import { notifyTenantDataUpdated } from '../../services/supabase/tenantDataLiveSync'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  persistInvoice,
  uploadBatchInvoiceDocuments,
} from '../../services/supabase/tenantPersist'
import {
  ensureStoredBatchFile,
  prefetchStoredBatchFiles,
} from '../../utils/resolveHandoffDocuments'
import { isAIReviewEnabled } from '../../config/aiReview'
import { rerunInvoiceAiReview } from '../../services/credyx/batchAiReviewService'
import type {
  AiReviewLiveCheck,
  AiReviewLiveExtract,
  BatchAiReviewProgress,
} from '../../services/credyx/batchAiReviewService'
import {
  ensureUniqueClientInvoiceNumber,
  formatClientInvoiceNumber,
  getMaxInvoiceSequence,
  loadClientInvoiceNumbers,
} from '../../utils/clientInvoiceNumbers'
import { isInvoiceNumberTakenExcluding } from '../../utils/invoiceDuplicateChecks'

interface BatchPacketReworkWorkspaceProps {
  batchId: string
  onClose: () => void
  onSaved?: () => void
  /** After packet save, continue to AI verification. */
  onContinueToAiVerification?: (batchId: string) => void
}

/** Merge a downloaded file into the draft (including generated invoice PDFs). */
function attachFetchedFile(
  prev: BatchIntakeDraft | null,
  docId: string,
  file: File
): BatchIntakeDraft | null {
  if (!prev || prev.fileById.has(docId)) return prev
  const nextFiles = new Map(prev.fileById)
  nextFiles.set(docId, file)
  const invoices = docId.startsWith('invoice-pdf-')
    ? prev.invoices.map((inv) => {
        const matches =
          docId === `invoice-pdf-${inv.groupId}` || docId === `invoice-pdf-${inv.draftId}`
        return matches && !inv.invoice_pdf ? { ...inv, invoice_pdf: file } : inv
      })
    : prev.invoices
  return { ...prev, fileById: nextFiles, invoices }
}

/**
 * Packets rework window — same BatchAiConfirmPanel used after AI upload,
 * hydrated from an existing Credyx batch so admins can reassign docs / edit packets.
 */
export default function BatchPacketReworkWorkspace({
  batchId,
  onClose,
  onSaved,
  onContinueToAiVerification,
}: BatchPacketReworkWorkspaceProps) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const tenantRevision = useTenantDataRevision()
  const batch = getBatchById(batchId)
  const [draft, setDraft] = useState<BatchIntakeDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [addingInvoice, setAddingInvoice] = useState(false)
  const [rerunningAiCheck, setRerunningAiCheck] = useState(false)
  const [aiLiveProgress, setAiLiveProgress] = useState<{
    draftId: string
    extract: AiReviewLiveExtract | null
    checks: AiReviewLiveCheck[] | null
    phase: BatchAiReviewProgress['phase']
  } | null>(null)
  /** Skip automatic re-hydrate after the admin edits packets locally. */
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  const draftRef = useRef(draft)
  draftRef.current = draft
  const regenTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const scheduleInvoicePdfRegen = useCallback(
    (draftId: string) => {
      const existing = regenTimersRef.current[draftId]
      if (existing) clearTimeout(existing)
      regenTimersRef.current[draftId] = setTimeout(() => {
        void (async () => {
          const inv = draftRef.current?.invoices.find((i) => i.draftId === draftId)
          if (!inv || !batch) return
          try {
            const file = await regenerateDraftInvoicePdf(inv, batch.client_name)
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
            console.warn('[BatchPacketReworkWorkspace] invoice PDF regen failed', err)
          }
        })()
      }, 350)
    },
    [batch]
  )

  useEffect(() => {
    return () => {
      Object.values(regenTimersRef.current).forEach(clearTimeout)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const draftIsEmpty =
      !draft ||
      (draft.invoices.length === 0 &&
        draft.fileById.size === 0 &&
        Object.keys(draft.storagePathsByDocId ?? {}).length === 0)

    // Avoid wiping in-progress edits; still retry when the first load came back empty.
    if (dirty && !draftIsEmpty) return

    if (!dirty) {
      setLoading(true)
      setError(null)
    }

    void hydrateIntakeDraftFromBatch(batchId)
      .then((next) => {
        if (cancelled) return
        if (!next) {
          if (!draft) {
            setError('Could not load this batch for packet rework.')
            setDraft(null)
          }
          return
        }
        // Keep local edits when a late tenant sync fires with less data.
        if (dirtyRef.current && draft && draft.invoices.length > next.invoices.length) return
        setDraft({
          ...next,
          unmatched: pruneUnmatchedAgainstAssigned(next.unmatched, next.invoices),
        })
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        if (!draft) {
          setError(err instanceof Error ? err.message : 'Failed to load batch packets')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Re-run when tenant data arrives after an empty first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, tenantRevision])

  // Prefetch PDF bodies in the background after the workspace is already interactive.
  const storagePathsKey = draft?.storagePathsByDocId
    ? Object.keys(draft.storagePathsByDocId).sort().join('\0')
    : ''
  useEffect(() => {
    const paths = draft?.storagePathsByDocId
    if (!paths || Object.keys(paths).length === 0) return
    let cancelled = false
    void prefetchStoredBatchFiles(batchId, paths, {
      concurrency: 4,
      shouldContinue: () => !cancelled && !dirtyRef.current,
      onFile: (docId, file) => {
        if (cancelled || dirtyRef.current) return
        setDraft((prev) => attachFetchedFile(prev, docId, file))
      },
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, storagePathsKey])

  const ensureDocumentFile = useCallback(
    async (docId: string) => {
      if (!draft) return
      if (draft.fileById.has(docId)) return
      const storagePath = draft.storagePathsByDocId?.[docId]
      if (!storagePath) return
      try {
        const fileName =
          draft.invoices
            .flatMap((inv) => [
              ...inv.fingerprints.rateCons,
              ...inv.fingerprints.bols,
              ...(inv.fingerprints.other ?? []),
            ])
            .find((fp) => fp.docId === docId)?.fileName ||
          draft.unmatched.rateCons
            .concat(draft.unmatched.bols, draft.unmatched.other)
            .find((fp) => fp.docId === docId)?.fileName
        const file = await ensureStoredBatchFile(
          batchId,
          docId,
          storagePath,
          fileName
        )
        if (!file) return
        setDraft((prev) => attachFetchedFile(prev, docId, file))
      } catch (err) {
        console.warn('[BatchPacketReworkWorkspace] ensureDocumentFile failed', docId, err)
      }
    },
    [batchId, draft]
  )

  /** Right-click invoice → re-run AI verification for that packet only. */
  const handleRerunAiCheck = useCallback(
    async (draftId: string, invoiceNumber: string) => {
      if (!isAIReviewEnabled()) {
        showToast('Configure the openai-proxy Edge Function to enable AI review.', 'error')
        return
      }
      if (rerunningAiCheck) {
        showToast('Wait for the current AI check to finish.', 'info')
        return
      }
      const invoice = getInvoiceById(draftId)
      if (!invoice) {
        showToast('Save this packet first, then re-run the AI check.', 'info')
        return
      }
      setRerunningAiCheck(true)
      setAiLiveProgress({
        draftId,
        extract: {},
        checks: null,
        phase: 'starting',
      })
      try {
        const current = draftRef.current
        if (current && current.fileById.size > 0) {
          mergeBatchFiles(batchId, current.fileById)
        }
        await rerunInvoiceAiReview(
          batchId,
          draftId,
          (p) => {
            setAiLiveProgress({
              draftId,
              extract: p.liveExtract ?? {},
              checks: p.liveChecks ?? null,
              phase: p.phase,
            })
            // Fill packet fields as extract values arrive (carrier stays on-file).
            if (p.liveExtract) {
              const patch: Partial<CredyxInvoiceDraft> = {}
              if (p.liveExtract.loadNumber) patch.load_number = p.liveExtract.loadNumber
              if (p.liveExtract.brokerName) patch.broker_name = p.liveExtract.brokerName
              if (p.liveExtract.amount != null && Number.isFinite(p.liveExtract.amount)) {
                patch.amount = p.liveExtract.amount
                patch.rate_missing = false
              }
              if (Object.keys(patch).length > 0) {
                setDraft((prev) => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    invoices: prev.invoices.map((inv) =>
                      inv.draftId === draftId
                        ? {
                            ...inv,
                            ...patch,
                            carrier_name: batch?.client_name ?? inv.carrier_name,
                          }
                        : inv
                    ),
                  }
                })
              }
            }
          },
          { allowVision: true }
        )
        scheduleInvoicePdfRegen(draftId)
        showToast(`AI check re-run for #${invoiceNumber}`, 'success')
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'AI re-check failed', 'error')
      } finally {
        setRerunningAiCheck(false)
        setAiLiveProgress(null)
      }
    },
    [batchId, showToast, rerunningAiCheck, batch?.client_name, scheduleInvoicePdfRegen]
  )

  const updateDraft = useCallback((draftId: string, patch: Partial<CredyxInvoiceDraft>) => {
    setDirty(true)
    let nextPatch = patch
    if ('broker_id' in patch || 'broker_name' in patch) {
      if (patch.broker_id) {
        nextPatch = {
          ...patch,
          broker_id: patch.broker_id,
          broker_name: patch.broker_name ?? '',
        }
      } else if (patch.broker_name !== undefined) {
        const inv = draftRef.current?.invoices.find((i) => i.draftId === draftId)
        const domain = emailDomainFromFingerprints([
          ...(inv?.fingerprints.rateCons ?? []),
          ...(inv?.fingerprints.bols ?? []),
          ...(inv?.fingerprints.other ?? []),
        ])
        const broker = matchBrokerByName(patch.broker_name, domain)
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
          inv.draftId === draftId ? { ...inv, ...nextPatch, carrier_name: batch?.client_name ?? inv.carrier_name } : inv
        ),
      }
    })
    if (
      'amount' in nextPatch ||
      'invoice_number' in nextPatch ||
      'load_number' in nextPatch ||
      'broker_name' in nextPatch ||
      'invoice_date' in nextPatch
    ) {
      scheduleInvoicePdfRegen(draftId)
    }
  }, [batch?.client_name, scheduleInvoicePdfRegen])

  const addManualDraft = async () => {
    if (!draft || addingInvoice || !batch) return
    setAddingInvoice(true)
    setDirty(true)
    try {
      const newDraft = await createManualCredyxDraft(
        draft.invoices,
        batch.client_id,
        batch.client_name
      )
      setDraft((prev) => {
        if (!prev) return prev
        return { ...prev, invoices: [...prev.invoices, newDraft] }
      })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add invoice', 'error')
    } finally {
      setAddingInvoice(false)
    }
  }

  const removeDraft = (draftId: string) => {
    setDirty(true)
    setDraft((prev) => (prev ? removeInvoiceFromDraft(prev, draftId) : prev))
  }

  const moveDocument = (fromDraftId: string, docId: string, toDraftId: string | null) => {
    setDirty(true)
    setDraft((prev) => (prev ? moveDraftDocument(prev, fromDraftId, docId, toDraftId) : prev))
  }

  const placeDocument = (
    docId: string,
    toDraftId: string | null,
    kind: 'rate_confirmation' | 'bill_of_lading' | 'other' | 'preserve'
  ) => {
    setDirty(true)
    setDraft((prev) => (prev ? placeDraftDocument(prev, docId, toDraftId, kind) : prev))
  }

  const assignUnmatchedDoc = (docId: string, toDraftId: string) => {
    setDirty(true)
    setDraft((prev) => (prev ? assignUnmatchedDocument(prev, docId, toDraftId) : prev))
  }

  const assignUnmatchedDocs = (docIds: string[], toDraftId: string) => {
    if (docIds.length === 0) return
    setDirty(true)
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
    setDirty(true)
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
      return withPrunedUnmatched({ ...prev, fileById: nextFileById, invoices })
    })
  }

  const deleteDocument = (docId: string) => {
    setDirty(true)
    setDraft((prev) => (prev ? deleteDraftDocument(prev, docId) : prev))
  }

  const persistDraft = async () => {
    if (!draft || !batch) return
    setSaving(true)
    try {
      setBatchFiles(batchId, draft.fileById)
      mergeBatchFiles(batchId, draft.fileById)

      const newDrafts = draft.invoices.filter(
        (inv) => isManualCredyxDraft(inv) && !getInvoiceById(inv.draftId)
      )
      const existingDrafts = draft.invoices.filter(
        (inv) => !(isManualCredyxDraft(inv) && !getInvoiceById(inv.draftId))
      )

      // Resolve numbers against live DB so saves never hit invoices_client_number_uidx.
      const existingNumbers = await loadClientInvoiceNumbers(batch.client_id)
      const reserved: string[] = [...existingNumbers]
      const uniqueForDraft = (preferred: string, excludeInvoiceId?: string) => {
        const exclude = excludeInvoiceId ? [excludeInvoiceId] : []
        const selfNum = excludeInvoiceId
          ? getInvoiceById(excludeInvoiceId)?.invoice_number?.trim()
          : undefined
        // Don't treat this invoice's current number as taken while validating a keep/edit.
        const reservedForCheck = selfNum
          ? reserved.filter((n) => n.trim().toLowerCase() !== selfNum.toLowerCase())
          : reserved
        const preferredTrim = preferred.trim()
        if (
          preferredTrim &&
          !isInvoiceNumberTakenExcluding(
            batch.client_id,
            preferredTrim,
            reservedForCheck,
            exclude
          )
        ) {
          reserved.push(preferredTrim)
          return preferredTrim
        }
        let seq = getMaxInvoiceSequence(batch.client_id, reservedForCheck)
        for (let i = 0; i < 10_000; i++) {
          seq += 1
          const candidate = formatClientInvoiceNumber(seq)
          if (
            !isInvoiceNumberTakenExcluding(
              batch.client_id,
              candidate,
              reservedForCheck,
              exclude
            )
          ) {
            reserved.push(candidate)
            return candidate
          }
        }
        return ensureUniqueClientInvoiceNumber(
          batch.client_id,
          preferredTrim || '001',
          reservedForCheck
        )
      }

      // Create brand-new packets added in rework (previously skipped on save).
      if (newDrafts.length > 0) {
        const fields = newDrafts.map((inv) => {
          const invoice_number = uniqueForDraft(inv.invoice_number?.trim() || '')
          return draftToInvoiceFields(
            { ...inv, invoice_number },
            batch.client_id,
            batch.client_name
          )
        })
        const created = addInvoicesForBatch(batchId, batch.batch_number, fields)

        for (let i = 0; i < created.length; i++) {
          const invoice = created[i]
          const source = newDrafts[i]
          const docFiles = new Map<string, File>()
          for (const docId of source.document_doc_ids) {
            const file = draft.fileById.get(docId)
            if (file) docFiles.set(docId, file)
          }
          if (source.invoice_pdf) {
            docFiles.set(`invoice-pdf-${source.groupId}`, source.invoice_pdf)
          }

          let storagePaths = invoice.document_storage_paths
          if (isSupabaseConfigured() && docFiles.size > 0) {
            storagePaths = await uploadBatchInvoiceDocuments(
              batch.client_id,
              batchId,
              invoice.id,
              docFiles
            )
            updateInvoice(invoice.id, { document_storage_paths: storagePaths }, { deferPersist: true })
          }

          if (isSupabaseConfigured()) {
            const latest = getInvoiceById(invoice.id) ?? invoice
            await persistInvoice(latest)
          }
        }
      }

      for (const inv of existingDrafts) {
        const invoice_number = uniqueForDraft(inv.invoice_number?.trim() || '', inv.draftId)
        const updated = updateInvoice(
          inv.draftId,
          {
            invoice_number,
            load_number: inv.load_number,
            broker_id: inv.broker_id,
            broker_name: inv.broker_name,
            amount: inv.amount,
            invoice_date: inv.invoice_date,
            client_name: batch.client_name,
            document_doc_ids: inv.document_doc_ids,
            documents_count: inv.document_doc_ids.length + (inv.invoice_pdf ? 1 : 0),
            doc_sort_group_id: inv.groupId,
          },
          { deferPersist: true }
        )
        if (updated && isSupabaseConfigured()) {
          await persistInvoice(updated)
        }
      }

      const unmatched = pruneUnmatchedAgainstAssigned(draft.unmatched, draft.invoices)
      const unmatchedIds = [
        ...unmatched.rateCons,
        ...unmatched.bols,
        ...unmatched.other,
      ].map((fp) => fp.docId)

      updateBatchTotals(batchId)
      updateBatch(batchId, {
        unmatched_doc_ids: unmatchedIds,
        doc_sort_snapshot: buildDocSortSnapshot(
          {
            ...draft.sortResult,
            unmatchedRateCons: unmatched.rateCons,
            unmatchedBols: unmatched.bols,
            otherDocuments: unmatched.other,
          },
          draft.invoices
        ),
      })

      notifyTenantDataUpdated(['batches', 'invoices'], batch.client_id)
      showToast('Packet changes saved', 'success')
      onSaved?.()

      // Finalize AI checks from DocSort JSON when present (no second vision scan).
      try {
        const { enqueueBatchProcessing } = await import('../../services/credyx/batchProcessingJobs')
        void enqueueBatchProcessing({
          batchId,
          clientId: batch.client_id,
          kind: 'verify_only',
        })
      } catch (err) {
        console.warn('[BatchPacketReworkWorkspace] enqueue verify failed', err)
      }

      if (onContinueToAiVerification) onContinueToAiVerification(batchId)
      else onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save packet changes', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: c.secondary }} />
        <p className="text-sm" style={{ color: c.secondary }}>
          Loading packet workspace…
        </p>
      </div>
    )
  }

  if (error || !draft || !batch) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm font-medium" style={{ color: c.primary }}>
          {error || 'Batch not found'}
        </p>
        <button type="button" className="dashboard-btn-secondary" onClick={onClose}>
          <ArrowLeft className="w-4 h-4" />
          Back to batches
        </button>
      </div>
    )
  }

  return (
    <div className="batch-packet-workspace flex-1 min-h-0 overflow-hidden flex flex-col">
      <div
        className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: c.secondary }}>
            Packet rework
          </p>
          <p className="text-sm font-semibold truncate" style={{ color: c.primary }}>
            {draft.batchNumber} · {batch.client_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onContinueToAiVerification && (
            <button
              type="button"
              className="dashboard-btn-primary !h-8"
              onClick={() => onContinueToAiVerification(batchId)}
            >
              AI verification
            </button>
          )}
          <button type="button" className="dashboard-btn-secondary !h-8" onClick={onClose}>
            <ArrowLeft className="w-3.5 h-3.5" />
            Close
          </button>
        </div>
      </div>
      {batch.total_invoices > 0 && draft.invoices.length === 0 && (
        <div
          className="shrink-0 px-4 py-2 text-xs border-b"
          style={{
            borderColor: c.border,
            backgroundColor: c.stat?.amber ?? '#FFF8E7',
            color: c.primary,
          }}
        >
          This batch lists {batch.total_invoices} invoice
          {batch.total_invoices === 1 ? '' : 's'}, but none are in the database (they were likely
          lost on save). Paperwork is under the Docs tab — use + Add to recreate packets and assign
          documents.
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden client-ai-upload">
        <BatchAiConfirmPanel
          draft={draft}
          clientId={batch.client_id}
          carrierName={batch.client_name}
          brokerPickerMode="admin"
          mode="rework"
          submitLabel="Save packet changes"
          submittingLabel="Saving…"
          onUpdateDraft={updateDraft}
          onAddInvoice={addManualDraft}
          onRemoveDraft={removeDraft}
          onMoveDocument={moveDocument}
          onPlaceDocument={placeDocument}
          onAssignUnmatchedDoc={assignUnmatchedDoc}
          onAssignUnmatchedDocs={assignUnmatchedDocs}
          onAttachDocuments={attachDraftDocuments}
          onDeleteDocument={deleteDocument}
          onEnsureDocument={ensureDocumentFile}
          addingInvoice={addingInvoice}
          onSubmitBatch={() => void persistDraft()}
          submitting={saving}
          onCancel={onClose}
          onRerunAiCheck={handleRerunAiCheck}
          rerunningAiCheck={rerunningAiCheck}
          aiLiveProgress={aiLiveProgress}
        />
      </div>
    </div>
  )
}
