import { useState, useMemo, useEffect, useCallback } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import AdminCreateBatchPanel from '../components/batches/AdminCreateBatchPanel'
import AllBatchesTab from '../components/batches/AllBatchesTab'
import BatchPacketReworkWorkspace from '../components/batches/BatchPacketReworkWorkspace'
import BatchDocSplitterWorkspace from '../components/batches/BatchDocSplitterWorkspace'
import BatchAiVerificationWorkspace from '../components/batches/BatchAiVerificationWorkspace'
import { getAllBatches } from '../data/mockBatches'
import { useClientTheme } from '../theme/ThemeContext'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useOwnedResourceLockHeartbeat } from '../hooks/useOwnedResourceLockHeartbeat'
import { drainPendingBatchProcessingJobs } from '../services/credyx/batchProcessingJobs'
import {
  forceReleaseLock,
  isSuperAdminUser,
  resolveStaffLockDisplayName,
  tryAcquireLock,
} from '../services/resourceLockService'
import {
  ADMIN_BATCH_CHIP_FILTERS,
  adminBatchFilterLabel,
  batchPassesDateRange,
  batchPassesDisplayFlags,
  canOpenDocSplitter,
  canOpenPacketRework,
  countAdminBatchFilters,
  createAdminBatchDisplayFlags,
  toLocalDateKey,
  type AdminBatchDisplayFlags,
  type AdminBatchChipFilter,
  type AdminBatchWorkflowStage,
} from '../utils/adminBatchQueue'
import { batchNeedsDocSplit } from '../utils/batchDocSplit'
import { useToast } from '../components/ui/ToastProvider'
import { useAuth } from '../context/AuthContext'

/**
 * Admin Batches — list + workspaces:
 * Doc Splitter (combined PDFs) → Packet Rework → AI Verification.
 */
export default function Batches() {
  const c = useClientTheme()
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const tenantRevision = useTenantDataRevision()
  const today = toLocalDateKey()
  const [packetReworkBatchId, setPacketReworkBatchId] = useState<string | null>(null)
  const [docSplitterBatchId, setDocSplitterBatchId] = useState<string | null>(null)
  const [aiVerifyBatchId, setAiVerifyBatchId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showCreateBatch, setShowCreateBatch] = useState(false)
  const [resumeDraftBatchId, setResumeDraftBatchId] = useState<string | null>(null)
  const [displayFlags, setDisplayFlags] = useState<AdminBatchDisplayFlags>(() =>
    createAdminBatchDisplayFlags(true)
  )
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)

  const openWorkspaceBatchId =
    docSplitterBatchId || packetReworkBatchId || aiVerifyBatchId || null

  useOwnedResourceLockHeartbeat('batch', openWorkspaceBatchId, resolved.user)

  // If a super admin kicks this session, close the workspace.
  useEffect(() => {
    if (!openWorkspaceBatchId || !resolved.user?.id) return
    const batch = getAllBatches().find((b) => b.id === openWorkspaceBatchId)
    if (!batch?.in_use) return
    if (batch.in_use_by_user_id && batch.in_use_by_user_id !== resolved.user.id) {
      setDocSplitterBatchId(null)
      setPacketReworkBatchId(null)
      setAiVerifyBatchId(null)
      showToast(
        `You were removed from this batch — now in use by ${batch.in_use_by || 'another user'}`,
        'info'
      )
    }
  }, [openWorkspaceBatchId, resolved.user?.id, tenantRevision, showToast])

  const acquireBatchOrNotify = useCallback(
    (batchId: string): boolean => {
      const user = resolved.user
      const userId = user?.id
      if (!userId) {
        showToast('Sign in required to open a batch workspace.', 'error')
        return false
      }
      const actor = {
        userId,
        displayName: resolveStaffLockDisplayName(user),
      }
      let result = tryAcquireLock('batch', batchId, actor)
      if (result.ok) return true

      if (isSuperAdminUser(user)) {
        const kick = window.confirm(
          `In use by ${result.holderName}.\n\nKick them out and open this batch?`
        )
        if (kick) {
          const forced = forceReleaseLock('batch', batchId, user)
          if (forced.ok) {
            result = tryAcquireLock('batch', batchId, actor)
            if (result.ok) return true
          }
        }
        return false
      }

      showToast(`In use by ${result.holderName}`, 'info')
      return false
    },
    [resolved.user, showToast]
  )

  // Drain queued DocSort / AI jobs + stuck-creation timeout when Batches is open.
  useEffect(() => {
    let cancelled = false
    const run = () => {
      void drainPendingBatchProcessingJobs(3)
        .then((n) => {
          if (!cancelled && n > 0) setRefreshKey((k) => k + 1)
        })
        .catch(() => {
          /* non-blocking */
        })
      void import('../services/credyx/sweepStuckAiBatches')
        .then(({ sweepStuckAiBatchCreations }) => sweepStuckAiBatchCreations())
        .then((moved) => {
          if (!cancelled && moved.length > 0) {
            setRefreshKey((k) => k + 1)
            showToast(
              moved.length === 1
                ? 'AI batch timed out — moved to Packet Rework. Ops emailed.'
                : `${moved.length} AI batches timed out — moved to Packet Rework. Ops emailed.`,
              'info'
            )
          }
        })
        .catch(() => {
          /* non-blocking */
        })
    }
    run()
    const id = window.setInterval(run, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [tenantRevision, showToast])

  const allBatches = useMemo(() => getAllBatches(), [refreshKey, tenantRevision])

  const dateScopedBatches = useMemo(
    () => allBatches.filter((batch) => batchPassesDateRange(batch, dateFrom, dateTo)),
    [allBatches, dateFrom, dateTo]
  )

  const filterCounts = useMemo(
    () => countAdminBatchFilters(dateScopedBatches),
    [dateScopedBatches]
  )

  const filteredBatches = useMemo(
    () => dateScopedBatches.filter((batch) => batchPassesDisplayFlags(batch, displayFlags)),
    [dateScopedBatches, displayFlags]
  )

  const isTodayOnly = dateFrom === today && dateTo === today
  const isAllDates = !dateFrom && !dateTo

  const setTodayRange = () => {
    const next = toLocalDateKey()
    setDateFrom(next)
    setDateTo(next)
  }

  const clearDateRange = () => {
    setDateFrom('')
    setDateTo('')
  }

  const toggleDisplayFlag = (key: AdminBatchChipFilter) => {
    setDisplayFlags((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const openDocSplitter = (batchId: string) => {
    if (!acquireBatchOrNotify(batchId)) return
    setShowCreateBatch(false)
    setResumeDraftBatchId(null)
    setAiVerifyBatchId(null)
    setPacketReworkBatchId(null)
    setDocSplitterBatchId(batchId)
  }

  const openPacketRework = (batchId: string) => {
    const batch = getAllBatches().find((b) => b.id === batchId)
    if (batch && batchNeedsDocSplit(batch)) {
      showToast('Split combined PDFs in Doc Splitter before Packet Rework.', 'info')
      openDocSplitter(batchId)
      return
    }
    if (batch && !canOpenPacketRework(batch)) {
      showToast(
        'Packet rework unlocks when AI is not still creating, or after Manual creation / rework.',
        'info'
      )
      // Still creating — show AI Verification (live progress / empty state).
      openAiVerification(batchId)
      return
    }
    if (!acquireBatchOrNotify(batchId)) return
    setShowCreateBatch(false)
    setResumeDraftBatchId(null)
    setAiVerifyBatchId(null)
    setDocSplitterBatchId(null)
    setPacketReworkBatchId(batchId)
  }

  const openAiVerification = (batchId: string) => {
    if (!acquireBatchOrNotify(batchId)) return
    setShowCreateBatch(false)
    setResumeDraftBatchId(null)
    setPacketReworkBatchId(null)
    setDocSplitterBatchId(null)
    setAiVerifyBatchId(batchId)
  }

  const openDraftBatch = (batchId: string) => {
    setPacketReworkBatchId(null)
    setDocSplitterBatchId(null)
    setAiVerifyBatchId(null)
    setResumeDraftBatchId(batchId)
    setShowCreateBatch(true)
  }

  const handleBatchCreated = (batchId: string) => {
    setRefreshKey((prev) => prev + 1)
    setShowCreateBatch(false)
    setResumeDraftBatchId(null)
    setTodayRange()
    const batch = getAllBatches().find((b) => b.id === batchId)
    if (batch && batchNeedsDocSplit(batch)) {
      openDocSplitter(batchId)
      return
    }
    if (batch && canOpenPacketRework(batch)) {
      openPacketRework(batchId)
      return
    }
    openAiVerification(batchId)
  }

  const handleCreateCancel = () => {
    setShowCreateBatch(false)
    setResumeDraftBatchId(null)
    setRefreshKey((k) => k + 1)
  }

  /** Open the right workspace for a batch (Doc Splitter / Packet Rework / AI Verification). */
  const handleBatchSelect = (batchId: string, stage?: AdminBatchWorkflowStage) => {
    const batch = getAllBatches().find((b) => b.id === batchId)
    if (batch?.status === 'draft') {
      openDraftBatch(batchId)
      return
    }

    if (
      stage === 'doc_split' ||
      batch?.status === 'needs_split' ||
      (batch && batchNeedsDocSplit(batch) && stage !== 'verification')
    ) {
      openDocSplitter(batchId)
      return
    }

    // Explicit Packet Rework request (modal / list).
    if (stage === 'ai' && batch?.status === 'rework') {
      openPacketRework(batchId)
      return
    }

    // Rework / failed sort → Packet Rework (unassigned docs).
    if (
      stage !== 'verification' &&
      (batch?.status === 'rework' || batch?.sort_status === 'failed')
    ) {
      openPacketRework(batchId)
      return
    }

    // Everything else (including verification / ready_to_post / creating) → AI Verification.
    openAiVerification(batchId)
  }

  const inPacketRework = Boolean(packetReworkBatchId)
  const inDocSplitter = Boolean(docSplitterBatchId)
  const inAiVerify = Boolean(aiVerifyBatchId)

  const dateInputStyle = {
    backgroundColor: c.card,
    height: 30,
    paddingTop: 4,
    paddingBottom: 4,
    fontSize: 12,
    maxWidth: 148,
  } as const

  return (
    <>
      <div className="admin-batches-page overflow-hidden flex flex-col min-h-0 h-full">
        {showCreateBatch ? (
          <div className="dashboard-card flex-1 min-h-0 overflow-hidden flex flex-col rounded-none border-0 shadow-none">
            <AdminCreateBatchPanel
              onComplete={handleBatchCreated}
              onCancel={handleCreateCancel}
              resumeDraftBatchId={resumeDraftBatchId}
            />
          </div>
        ) : inDocSplitter && docSplitterBatchId ? (
          <BatchDocSplitterWorkspace
            key={docSplitterBatchId}
            batchId={docSplitterBatchId}
            onClose={() => {
              setDocSplitterBatchId(null)
              setRefreshKey((k) => k + 1)
            }}
            onContinueToPacketRework={(id) => {
              setDocSplitterBatchId(null)
              openPacketRework(id)
            }}
          />
        ) : inPacketRework && packetReworkBatchId ? (
          <BatchPacketReworkWorkspace
            key={packetReworkBatchId}
            batchId={packetReworkBatchId}
            onClose={() => setPacketReworkBatchId(null)}
            onSaved={() => setRefreshKey((k) => k + 1)}
            onContinueToAiVerification={openAiVerification}
          />
        ) : inAiVerify && aiVerifyBatchId ? (
          <BatchAiVerificationWorkspace
            key={aiVerifyBatchId}
            batchId={aiVerifyBatchId}
            onClose={() => {
              setAiVerifyBatchId(null)
              setRefreshKey((k) => k + 1)
            }}
            onOpenPackets={openPacketRework}
            onOpenDocSplitter={openDocSplitter}
            onProcessed={() => setRefreshKey((k) => k + 1)}
          />
        ) : (
          <>
            <div
              className="client-page-toolbar shrink-0 px-4 py-2 border-b space-y-2"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Batch types to display"
                >
                  {ADMIN_BATCH_CHIP_FILTERS.map((key) => {
                    const showing = displayFlags[key]
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleDisplayFlag(key)}
                        aria-pressed={showing}
                        title={
                          showing
                            ? `Showing ${adminBatchFilterLabel(key)} — click to hide`
                            : `Hidden ${adminBatchFilterLabel(key)} — click to show`
                        }
                        className={`page-tab !py-1 !px-2 !text-xs ${
                          showing ? 'page-tab--active' : 'opacity-50'
                        }`}
                      >
                        {adminBatchFilterLabel(key)}
                        <span className="tabular-nums"> ({filterCounts[key]})</span>
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPacketReworkBatchId(null)
                    setDocSplitterBatchId(null)
                    setAiVerifyBatchId(null)
                    setResumeDraftBatchId(null)
                    setShowCreateBatch(true)
                  }}
                  className="dashboard-btn-primary shrink-0 self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create batch
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5 shrink-0" style={{ color: c.secondary }} />
                <span className="text-xs font-medium" style={{ color: c.secondary }}>
                  Submitted
                </span>
                <button
                  type="button"
                  onClick={setTodayRange}
                  className={`page-tab !py-1 !px-2 !text-xs ${
                    isTodayOnly ? 'page-tab--active' : ''
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={clearDateRange}
                  className={`page-tab !py-1 !px-2 !text-xs ${
                    isAllDates ? 'page-tab--active' : ''
                  }`}
                >
                  All dates
                </button>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="client-input"
                  style={dateInputStyle}
                  aria-label="Submitted from"
                />
                <span className="text-xs" style={{ color: c.muted }}>
                  to
                </span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="client-input"
                  style={dateInputStyle}
                  aria-label="Submitted to"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <AllBatchesTab
                batches={filteredBatches}
                onBatchSelect={handleBatchSelect}
                onBatchesChanged={() => setRefreshKey((k) => k + 1)}
                onPacketRework={(batchId) => {
                  const batch = getAllBatches().find((b) => b.id === batchId)
                  if (batch?.status === 'draft') {
                    openDraftBatch(batchId)
                    return
                  }
                  if (batch && canOpenDocSplitter(batch)) {
                    openDocSplitter(batchId)
                    return
                  }
                  openPacketRework(batchId)
                }}
                onDocSplitter={openDocSplitter}
              />
            </div>
          </>
        )}
      </div>
    </>
  )
}
