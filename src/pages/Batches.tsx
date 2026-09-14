import { useState, useMemo } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import AdminCreateBatchPanel from '../components/batches/AdminCreateBatchPanel'
import ReadyToPostTab from '../components/batches/ReadyToPostTab'
import VerificationTab from '../components/batches/VerificationTab'
import AiBatchTab from '../components/batches/AiBatchTab'
import AllBatchesTab from '../components/batches/AllBatchesTab'
import BatchPacketReworkWorkspace from '../components/batches/BatchPacketReworkWorkspace'
import BatchAiVerificationWorkspace from '../components/batches/BatchAiVerificationWorkspace'
import { getAllBatches, updateBatchStatus } from '../data/mockBatches'
import { useClientTheme } from '../theme/ThemeContext'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import {
  ADMIN_BATCH_CHIP_FILTERS,
  adminBatchFilterLabel,
  batchPassesDateRange,
  batchPassesDisplayFlags,
  countAdminBatchFilters,
  createAdminBatchDisplayFlags,
  toLocalDateKey,
  type AdminBatchDisplayFlags,
  type AdminBatchChipFilter,
  type AdminBatchWorkflowStage,
} from '../utils/adminBatchQueue'

export default function Batches() {
  const c = useClientTheme()
  const tenantRevision = useTenantDataRevision()
  const today = toLocalDateKey()
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [workflowStage, setWorkflowStage] = useState<AdminBatchWorkflowStage | null>(null)
  const [packetReworkBatchId, setPacketReworkBatchId] = useState<string | null>(null)
  const [aiVerifyBatchId, setAiVerifyBatchId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showCreateBatch, setShowCreateBatch] = useState(false)
  const [resumeDraftBatchId, setResumeDraftBatchId] = useState<string | null>(null)
  const [displayFlags, setDisplayFlags] = useState<AdminBatchDisplayFlags>(() =>
    createAdminBatchDisplayFlags(true)
  )
  // Default to today's work queue; user can widen the range.
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)

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

  const openPacketRework = (batchId: string) => {
    setSelectedBatchId(null)
    setWorkflowStage(null)
    setShowCreateBatch(false)
    setResumeDraftBatchId(null)
    setAiVerifyBatchId(null)
    setPacketReworkBatchId(batchId)
  }

  const openAiVerification = (batchId: string) => {
    setSelectedBatchId(null)
    setWorkflowStage(null)
    setShowCreateBatch(false)
    setResumeDraftBatchId(null)
    setPacketReworkBatchId(null)
    setAiVerifyBatchId(batchId)
  }

  const openBatch = (batchId: string, stage?: AdminBatchWorkflowStage) => {
    const nextStage = stage ?? 'ready_to_post'
    if (nextStage === 'verification' || nextStage === 'ai') {
      openAiVerification(batchId)
      return
    }
    setPacketReworkBatchId(null)
    setAiVerifyBatchId(null)
    setSelectedBatchId(batchId)
    setWorkflowStage(nextStage)
  }

  const openDraftBatch = (batchId: string) => {
    setSelectedBatchId(null)
    setWorkflowStage(null)
    setPacketReworkBatchId(null)
    setAiVerifyBatchId(null)
    setResumeDraftBatchId(batchId)
    setShowCreateBatch(true)
  }

  const closeBatch = () => {
    setSelectedBatchId(null)
    setWorkflowStage(null)
    setAiVerifyBatchId(null)
  }

  const handleBatchCreated = (batchId: string) => {
    setRefreshKey((prev) => prev + 1)
    setShowCreateBatch(false)
    setResumeDraftBatchId(null)
    setTodayRange()
    openPacketRework(batchId)
  }

  const handleCreateCancel = () => {
    setShowCreateBatch(false)
    setResumeDraftBatchId(null)
    setRefreshKey((k) => k + 1)
  }

  const handleMoveToVerification = (batchId: string) => {
    updateBatchStatus(batchId, 'verification')
    setRefreshKey((prev) => prev + 1)
    openAiVerification(batchId)
  }

  const handleBatchSelect = (batchId: string, stage?: AdminBatchWorkflowStage) => {
    const batch = getAllBatches().find((b) => b.id === batchId)
    if (batch?.status === 'draft') {
      openDraftBatch(batchId)
      return
    }
    openBatch(batchId, stage)
  }

  const inDetailView = Boolean(selectedBatchId && workflowStage)
  const inPacketRework = Boolean(packetReworkBatchId)
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
            onProcessed={() => setRefreshKey((k) => k + 1)}
          />
        ) : (
          <>
            {!inDetailView && (
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
                      closeBatch()
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
                  <CalendarDays
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: c.secondary }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={setTodayRange}
                    className={`batch-filter-pill batch-filter-pill--xs ${
                      isTodayOnly ? 'batch-filter-pill--active' : ''
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={clearDateRange}
                    className={`batch-filter-pill batch-filter-pill--xs ${
                      isAllDates ? 'batch-filter-pill--active' : ''
                    }`}
                  >
                    All dates
                  </button>
                  <span className="text-xs" style={{ color: c.mutedLight }} aria-hidden>
                    |
                  </span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="client-input"
                    style={dateInputStyle}
                    aria-label="Submitted from"
                  />
                  <span className="text-xs" style={{ color: c.mutedLight }}>
                    –
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
            )}

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {!inDetailView && (
                <AllBatchesTab
                  batches={filteredBatches}
                  onBatchSelect={handleBatchSelect}
                  onPacketRework={(batchId) => {
                    const batch = getAllBatches().find((b) => b.id === batchId)
                    if (batch?.status === 'draft') {
                      openDraftBatch(batchId)
                      return
                    }
                    openPacketRework(batchId)
                  }}
                />
              )}
              {inDetailView && workflowStage === 'ready_to_post' && (
                <ReadyToPostTab
                  batchId={selectedBatchId}
                  onBatchSelect={(batchId) => openBatch(batchId, 'ready_to_post')}
                  onMoveToVerification={handleMoveToVerification}
                  onBack={closeBatch}
                  onOpenPacketRework={openPacketRework}
                  onOpenAiVerification={openAiVerification}
                />
              )}
              {inDetailView && workflowStage === 'verification' && (
                <VerificationTab
                  batchId={selectedBatchId}
                  onBatchSelect={(batchId) => openBatch(batchId, 'verification')}
                  onBack={closeBatch}
                  onProcessed={() => setRefreshKey((k) => k + 1)}
                  onOpenPacketRework={openPacketRework}
                />
              )}
              {inDetailView && workflowStage === 'ai' && (
                <AiBatchTab
                  batchId={selectedBatchId}
                  onBatchSelect={(batchId) => openBatch(batchId, 'ai')}
                  onOpenReadyToPost={(batchId) => openBatch(batchId, 'ready_to_post')}
                  onOpenVerification={(batchId) => openBatch(batchId, 'verification')}
                  onMoveToVerification={handleMoveToVerification}
                  onBack={closeBatch}
                  refreshKey={refreshKey}
                  onRefresh={() => setRefreshKey((k) => k + 1)}
                  onOpenPacketRework={openPacketRework}
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
