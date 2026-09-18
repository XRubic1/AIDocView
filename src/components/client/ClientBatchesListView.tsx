import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import ClientSortableHeader from './ClientSortableHeader'
import ClientListTd from './ClientListTd'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../../utils/clientListPage'
import { isTourBatchId } from '../../utils/onboardingTourInvoice'
import type { ClientBatchAiProgress } from '../../utils/clientBatchAiProgress'

export interface ClientBatchListItem {
  id: string
  batch_number: string
  total_invoices: number
  total_amount: number
  submitted_at: string
  status: string
  reviewed_at: string | null
  upload_mode?: string
  sort_status?: string
  approved_count?: number
  rejected_count?: number
}

interface ClientBatchesListViewProps {
  batches: ClientBatchListItem[]
  highlightedBatchId: string | null
  onSelectBatch: (batchId: string) => void
  onCreateBatch?: () => void
  onDeleteDraft?: (batchId: string) => void
  /** AI PPW processing progress keyed by batch id */
  aiProgressByBatchId?: Record<string, ClientBatchAiProgress>
}

type StatusFilter = 'all' | 'pending' | 'review' | 'processed'

type BatchSortField =
  | 'batch_number'
  | 'submitted_at'
  | 'total_invoices'
  | 'total_amount'
  | 'status'
  | 'reviewed_at'
  | 'outcome'

const STATUS_FILTER_MATCH: Record<StatusFilter, (status: string) => boolean> = {
  all: () => true,
  pending: (s) =>
    ['draft', 'creating', 'needs_split', 'ready_to_post', 'rework', 'documents_uploaded'].includes(s),
  review: (s) => ['verification', 'approval'].includes(s),
  processed: (s) => ['submitted', 'processing'].includes(s),
}

function getBatchStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'status-pill--pending-batch' },
    creating: { label: 'Creating', className: 'status-pill--review' },
    needs_split: { label: 'Doc Split', className: 'status-pill--review' },
    ready_to_post: { label: 'Queued', className: 'status-pill--pending-batch' },
    rework: { label: 'Rework', className: 'status-pill--review' },
    documents_uploaded: { label: 'Docs received', className: 'status-pill--pending-batch' },
    verification: { label: 'Verifying', className: 'status-pill--review' },
    approval: { label: 'In review', className: 'status-pill--review' },
    submitted: { label: 'Posted', className: 'status-pill--submitted' },
    processing: { label: 'Processing', className: 'status-pill--approved' },
  }
  const config = map[status] ?? { label: status.replace(/_/g, ' '), className: 'status-pill--pending-batch' }
  return <span className={`inline-flex items-center status-pill ${config.className}`}>{config.label}</span>
}

/** Compact AI paperwork status — replaces workflow badge while processing. */
function getAiProgressBadge(progress?: ClientBatchAiProgress | null) {
  if (!progress?.show) return null
  if (progress.phase === 'processing') {
    return (
      <span className="inline-flex items-center gap-1 status-pill status-pill--review">
        Processing…
        {progress.etaShortLabel ? (
          <span className="opacity-80 font-normal">{progress.etaShortLabel}</span>
        ) : null}
      </span>
    )
  }
  // Legacy/internal rework phase — carriers still see Processing, never Rework.
  if (progress.phase === 'rework') {
    return (
      <span className="inline-flex items-center status-pill status-pill--review">
        Processing…
      </span>
    )
  }
  if (progress.phase === 'done') {
    return (
      <span className="inline-flex items-center status-pill status-pill--approved">
        Ready to review
      </span>
    )
  }
  return null
}

function renderBatchStatus(
  status: string,
  progress?: ClientBatchAiProgress | null
) {
  // While AI is creating/checking or Credyx is reworking, show Processing — not Rework.
  const aiBadge = getAiProgressBadge(progress)
  if (aiBadge && (progress?.phase === 'processing' || progress?.phase === 'rework')) {
    return aiBadge
  }
  // Hide raw rework status from carriers even without AI progress snapshot.
  if (status === 'rework' || status === 'creating' || status === 'needs_split') {
    return (
      <span className="inline-flex items-center status-pill status-pill--review">
        Processing…
      </span>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {getBatchStatusBadge(status)}
      {aiBadge}
    </div>
  )
}

/** Polished batch list for the client portal View Batches tab. */
export default function ClientBatchesListView({
  batches,
  highlightedBatchId,
  onSelectBatch,
  onCreateBatch,
  onDeleteDraft,
  aiProgressByBatchId,
}: ClientBatchesListViewProps) {
  const c = useClientTheme()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [pageSize, setPageSize] = useState<number>(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<BatchSortField>('submitted_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const stats = useMemo(() => {
    const pending = batches.filter((b) => STATUS_FILTER_MATCH.pending(b.status)).length
    const inReview = batches.filter((b) => STATUS_FILTER_MATCH.review(b.status)).length
    const processed = batches.filter((b) => STATUS_FILTER_MATCH.processed(b.status)).length
    const totalAmount = batches.reduce((sum, b) => sum + b.total_amount, 0)
    return { pending, inReview, processed, totalAmount }
  }, [batches])

  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      const matchesFilter = STATUS_FILTER_MATCH[statusFilter](batch.status)
      const q = searchTerm.trim().toLowerCase()
      const matchesSearch =
        !q ||
        batch.batch_number.toLowerCase().includes(q) ||
        batch.status.toLowerCase().includes(q)
      return matchesFilter && matchesSearch
    })
  }, [batches, searchTerm, statusFilter])

  const sortedBatches = useMemo(() => {
    const sorted = [...filteredBatches]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'batch_number':
          cmp = a.batch_number.localeCompare(b.batch_number, undefined, { numeric: true })
          break
        case 'submitted_at':
          cmp = new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
          break
        case 'total_invoices':
          cmp = a.total_invoices - b.total_invoices
          break
        case 'total_amount':
          cmp = a.total_amount - b.total_amount
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
        case 'reviewed_at':
          cmp =
            (a.reviewed_at ? new Date(a.reviewed_at).getTime() : 0) -
            (b.reviewed_at ? new Date(b.reviewed_at).getTime() : 0)
          break
        case 'outcome':
          cmp = (a.approved_count ?? -1) - (b.approved_count ?? -1)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredBatches, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedBatches.length / pageSize))

  const paginatedBatches = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedBatches.slice(start, start + pageSize)
  }, [sortedBatches, currentPage, pageSize])

  const pageStart = sortedBatches.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, sortedBatches.length)

  const handleSort = useCallback(
    (field: BatchSortField) => {
      if (sortField === field) {
        setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        const defaultDesc =
          field === 'submitted_at' ||
          field === 'total_invoices' ||
          field === 'total_amount' ||
          field === 'reviewed_at' ||
          field === 'outcome'
        setSortDir(defaultDesc ? 'desc' : 'asc')
      }
    },
    [sortField]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, pageSize, sortField, sortDir])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (!highlightedBatchId) return
    const highlightIndex = sortedBatches.findIndex((batch) => batch.id === highlightedBatchId)
    if (highlightIndex >= 0) {
      setCurrentPage(Math.floor(highlightIndex / pageSize) + 1)
    }
  }, [highlightedBatchId, sortedBatches, pageSize])

  const inputStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  const filterButtons: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: batches.length },
    { id: 'pending', label: 'Pending', count: stats.pending },
    { id: 'review', label: 'In review', count: stats.inReview },
    { id: 'processed', label: 'Processed', count: stats.processed },
  ]

  return (
    <div className="client-batches-page overflow-hidden flex flex-col min-h-0" data-onboard-target="batchList">
      <section
        className="client-stat-strip grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b shrink-0"
        style={{ borderColor: c.border }}
      >
        <div
          className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b sm:border-b-0"
          style={{ backgroundColor: c.stat.blue, borderColor: c.border }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Boxes className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
            <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
              Total Batches
            </span>
          </div>
          <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
            {batches.length}
          </span>
        </div>
        <div
          className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b lg:border-b-0"
          style={{ backgroundColor: c.stat.amber, borderColor: c.border }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} />
            <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
              Awaiting review
            </span>
          </div>
          <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
            {stats.pending + stats.inReview}
          </span>
        </div>
        <div
          className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b sm:border-b-0"
          style={{ backgroundColor: c.stat.green, borderColor: c.border }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: c.success }} />
            <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
              Processed
            </span>
          </div>
          <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
            {stats.processed}
          </span>
        </div>
        <div
          className="flex items-center justify-between gap-2 px-4 py-2.5"
          style={{ backgroundColor: c.stat.slate }}
        >
          <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
            Total submitted
          </span>
          <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
            {formatCurrency(stats.totalAmount)}
          </span>
        </div>
      </section>

      <div
        className="client-page-toolbar px-4 py-2 border-b flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 shrink-0"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <div className="flex flex-wrap gap-1.5">
          {filterButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setStatusFilter(btn.id)}
              className={`batch-filter-pill ${statusFilter === btn.id ? 'batch-filter-pill--active' : ''}`}
            >
              {btn.label}
              <span className="batch-filter-pill__count">{btn.count}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-auto lg:min-w-[280px] lg:max-w-sm">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: c.secondary }}
          />
          <input
            type="text"
            placeholder="Search batch number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="client-input pl-8 w-full"
            style={inputStyle}
          />
        </div>
      </div>

      {sortedBatches.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center py-12 px-4">
          <div>
            <Boxes className="w-10 h-10 mx-auto mb-3" style={{ color: c.mutedLight }} />
            <p className="text-base font-medium mb-1" style={{ color: c.primary }}>
              No batches found
            </p>
            <p className="text-sm mb-4" style={{ color: c.secondary }}>
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Submit your first batch to get started'}
            </p>
            {!searchTerm && statusFilter === 'all' && onCreateBatch && (
              <button type="button" onClick={onCreateBatch} className="dashboard-btn-primary">
                <Plus className="w-3.5 h-3.5" />
                Create batch
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="client-table-scroll client-table-scroll--mobile-stack flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            <table className="dashboard-table dashboard-table--compact">
              <thead>
                <tr>
                  <ClientSortableHeader
                    field="batch_number"
                    label="Batch#"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <ClientSortableHeader
                    field="submitted_at"
                    label="Submitted"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <ClientSortableHeader
                    field="total_invoices"
                    label="Invoices"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="text-right"
                    align="right"
                  />
                  <ClientSortableHeader
                    field="total_amount"
                    label="Amount"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="text-right"
                    align="right"
                  />
                  <ClientSortableHeader
                    field="status"
                    label="Status"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <ClientSortableHeader
                    field="reviewed_at"
                    label="Reviewed"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <ClientSortableHeader
                    field="outcome"
                    label="Outcome"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="text-center"
                    align="center"
                  />
                  {onDeleteDraft && <th className="text-center w-16"> </th>}
                </tr>
              </thead>
              <tbody>
                {paginatedBatches.map((batch) => {
                  const isHighlighted = highlightedBatchId === batch.id
                  const isProcessed = STATUS_FILTER_MATCH.processed(batch.status)
                  const isDraft = batch.status === 'draft'
                  return (
                    <tr
                      key={batch.id}
                      className={`cursor-pointer transition-colors ${isHighlighted ? 'batch-highlight-row' : ''}`}
                      data-onboard-target={isTourBatchId(batch.id) ? 'tourBatchRow' : undefined}
                      onClick={() => onSelectBatch(batch.id)}
                    >
                      <ClientListTd variant="primary" className="font-semibold">
                        {batch.batch_number}
                      </ClientListTd>
                      <ClientListTd variant="desktop" label="Submitted" style={{ color: c.secondary }}>
                        {formatDate(batch.submitted_at)}
                      </ClientListTd>
                      <ClientListTd variant="desktop" label="Invoices" className="text-right tabular-nums">
                        {batch.total_invoices}
                      </ClientListTd>
                      <ClientListTd variant="amount" className="text-right font-medium tabular-nums">
                        {formatCurrency(batch.total_amount)}
                      </ClientListTd>
                      <ClientListTd variant="status">
                        {renderBatchStatus(batch.status, aiProgressByBatchId?.[batch.id])}
                      </ClientListTd>
                      <ClientListTd
                        variant="meta"
                        className="truncate client-list-td--mobile-only"
                        style={{ color: c.secondary }}
                      >
                        {batch.total_invoices} inv
                      </ClientListTd>
                      <ClientListTd variant="desktop" label="Reviewed" style={{ color: c.secondary }}>
                        {batch.reviewed_at ? formatDate(batch.reviewed_at) : '—'}
                      </ClientListTd>
                      <ClientListTd variant="desktop" label="Outcome" className="text-center">
                        {isProcessed && batch.approved_count != null ? (
                          <span className="inline-flex items-center text-xs font-medium" style={{ color: c.success }}>
                            {batch.approved_count} approved
                            {(batch.rejected_count ?? 0) > 0 && (
                              <span style={{ color: c.error }}> · {batch.rejected_count} rejected</span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: c.mutedLight }}>—</span>
                        )}
                      </ClientListTd>
                      {onDeleteDraft && (
                        <ClientListTd variant="actions" className="text-center">
                          {isDraft ? (
                            <button
                              type="button"
                              className="client-batches-list__delete-draft inline-flex items-center justify-center"
                              title="Delete draft"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteDraft(batch.id)
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span style={{ color: c.mutedLight }}> </span>
                          )}
                        </ClientListTd>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div
            className="client-page-footer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-t shrink-0"
            style={{ borderColor: c.border, backgroundColor: c.card }}
          >
            <p className="text-xs font-medium" style={{ color: c.secondary }}>
              Showing {pageStart}–{pageEnd} of {sortedBatches.length}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: c.secondary }}>
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="client-input"
                  style={{
                    backgroundColor: c.card,
                    height: 30,
                    paddingTop: 4,
                    paddingBottom: 4,
                    fontSize: 12,
                    width: 64,
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="table-page-btn"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium px-2 tabular-nums" style={{ color: c.primary }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="table-page-btn"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export { getBatchStatusBadge }
