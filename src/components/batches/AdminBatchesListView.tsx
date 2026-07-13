import { useMemo, useState, useEffect, useCallback, type ReactNode } from 'react'
import { Ban, Boxes, ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/format'
import { mockInvoices } from '../../data/mockInvoices'
import { useClientTheme } from '../../theme/ThemeContext'
import ClientSortableHeader from '../client/ClientSortableHeader'
import ClientListTd from '../client/ClientListTd'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../../utils/clientListPage'
import { getAdminBatchStatusBadge } from './adminBatchStatus'
import { canVoidAdminBatch } from '../../services/adminBatchActions'

export interface AdminBatchListItem {
  id: string
  batch_number: string
  client_name: string
  total_invoices: number
  total_amount: number
  submitted_at: string
  status: string
  upload_mode?: string
  in_use?: boolean
  in_use_by?: string
  reviewed_at?: string | null
  reviewed_by?: string
}

export type AdminBatchListVariant = 'ready_to_post' | 'verification' | 'approval' | 'all'

type BatchSortField =
  | 'client_name'
  | 'batch_number'
  | 'total_invoices'
  | 'total_amount'
  | 'submitted_at'
  | 'status'
  | 'reviewed_at'

type StatusFilter =
  | 'all'
  | 'ready_to_post'
  | 'verification'
  | 'approval'
  | 'submitted'
  | 'processing'
  | 'approved'
  | 'documents_uploaded'
  | 'voided'

interface AdminBatchesListViewProps {
  batches: AdminBatchListItem[]
  variant: AdminBatchListVariant
  onSelectBatch: (batchId: string) => void
  emptyTitle: string
  emptyHint?: string
  actionLabel?: string
  onAction?: (batch: AdminBatchListItem, e: React.MouseEvent) => void
  onViewClick?: (batch: AdminBatchListItem, e: React.MouseEvent) => void
  onReturnToApproval?: (batch: AdminBatchListItem, e: React.MouseEvent) => void
  canReturnToApproval?: (status: string) => boolean
  onVoidBatch?: (batch: AdminBatchListItem, e: React.MouseEvent) => void
}

function getReadyToPostProgress(batchId: string): number {
  const batchInvoices = mockInvoices.filter((inv) => inv.batch_id === batchId)
  const paperworkComplete = batchInvoices.filter((inv) => inv.documents_count && inv.documents_count > 0).length
  const brokersAssigned = batchInvoices.filter((inv) => !!inv.broker_id).length
  const total = batchInvoices.length
  if (total === 0) return 0
  return Math.round(((paperworkComplete + brokersAssigned) / (total * 2)) * 100)
}

function getVerifiedCount(batchId: string): { verified: number; total: number } {
  const batchInvoices = mockInvoices.filter((inv) => inv.batch_id === batchId)
  const verified = batchInvoices.filter((inv) => inv.status === 'approved' || inv.status === 'hold').length
  return { verified, total: batchInvoices.length }
}

function isApprovalReady(batchId: string): boolean {
  const batchInvoices = mockInvoices.filter((inv) => inv.batch_id === batchId)
  return batchInvoices.length > 0 && batchInvoices.every((inv) => inv.status === 'approved')
}

/** Admin batch list — sortable columns, pagination, pinned footer (client portal pattern). */
export default function AdminBatchesListView({
  batches,
  variant,
  onSelectBatch,
  emptyTitle,
  emptyHint,
  actionLabel = 'Open',
  onAction,
  onViewClick,
  onReturnToApproval,
  canReturnToApproval,
  onVoidBatch,
}: AdminBatchesListViewProps) {
  const c = useClientTheme()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [pageSize, setPageSize] = useState<number>(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<BatchSortField>(
    variant === 'all' ? 'submitted_at' : 'client_name'
  )
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const filteredBatches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return batches.filter((batch) => {
      const matchesSearch =
        !q ||
        batch.batch_number.toLowerCase().includes(q) ||
        batch.client_name.toLowerCase().includes(q)
      const matchesStatus = variant !== 'all' || statusFilter === 'all' || batch.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [batches, searchTerm, statusFilter, variant])

  const sortedBatches = useMemo(() => {
    const sorted = [...filteredBatches]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'client_name':
          cmp = a.client_name.localeCompare(b.client_name)
          break
        case 'batch_number':
          cmp = a.batch_number.localeCompare(b.batch_number, undefined, { numeric: true })
          break
        case 'total_invoices':
          cmp = a.total_invoices - b.total_invoices
          break
        case 'total_amount':
          cmp = a.total_amount - b.total_amount
          break
        case 'submitted_at':
          cmp = new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
        case 'reviewed_at':
          cmp =
            (a.reviewed_at ? new Date(a.reviewed_at).getTime() : 0) -
            (b.reviewed_at ? new Date(b.reviewed_at).getTime() : 0)
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
          field === 'total_invoices' ||
          field === 'total_amount' ||
          field === 'submitted_at' ||
          field === 'reviewed_at'
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

  const totalAmount = useMemo(
    () => batches.reduce((sum, b) => sum + b.total_amount, 0),
    [batches]
  )

  const statusFilters: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'ready_to_post', label: 'Ready' },
    { id: 'verification', label: 'Verification' },
    { id: 'approval', label: 'Approval' },
    { id: 'submitted', label: 'Submitted' },
    { id: 'processing', label: 'Processing' },
    { id: 'approved', label: 'Approved' },
    { id: 'voided', label: 'Voided' },
  ]

  const inputStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  const renderExtraCell = (batch: AdminBatchListItem): ReactNode => {
    if (variant === 'ready_to_post') {
      const progress = getReadyToPostProgress(batch.id)
      return (
        <ClientListTd variant="desktop" label="Progress" className="text-center">
          <div className="inline-flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full" style={{ backgroundColor: c.border }}>
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: `${progress}%`,
                  backgroundColor: progress === 100 ? c.success : c.warning,
                }}
              />
            </div>
            <span className="text-xs tabular-nums" style={{ color: c.secondary }}>
              {progress}%
            </span>
          </div>
        </ClientListTd>
      )
    }
    if (variant === 'verification') {
      const { verified, total } = getVerifiedCount(batch.id)
      return (
        <ClientListTd variant="desktop" label="Verified" className="text-center tabular-nums" style={{ color: c.secondary }}>
          {verified} / {total}
        </ClientListTd>
      )
    }
    if (variant === 'approval') {
      const ready = isApprovalReady(batch.id)
      return (
        <ClientListTd variant="status" label="Ready">
          <span className={`status-pill ${ready ? 'status-pill--approved' : 'status-pill--pending'}`}>
            {ready ? 'Ready' : 'Pending'}
          </span>
        </ClientListTd>
      )
    }
    if (variant === 'all') {
      return (
        <>
          <ClientListTd variant="status">{getAdminBatchStatusBadge(batch.status)}</ClientListTd>
          <ClientListTd variant="desktop" label="In use" style={{ color: c.secondary }}>
            {batch.in_use ? (
              <span>
                <span className="status-pill status-pill--review">In use</span>
                {batch.in_use_by && (
                  <span className="block text-xs mt-0.5 truncate">{batch.in_use_by}</span>
                )}
              </span>
            ) : (
              'Available'
            )}
          </ClientListTd>
          <ClientListTd variant="desktop" label="Reviewed" style={{ color: c.secondary }}>
            {batch.reviewed_at ? (
              <span>
                <span className="block">{formatDate(batch.reviewed_at)}</span>
                {batch.reviewed_by && (
                  <span className="block text-xs truncate">{batch.reviewed_by}</span>
                )}
              </span>
            ) : (
              '—'
            )}
          </ClientListTd>
        </>
      )
    }
    return null
  }

  const extraHeaderLabel =
    variant === 'ready_to_post'
      ? 'Progress'
      : variant === 'verification'
        ? 'Verified'
        : variant === 'approval'
          ? 'Ready'
          : null

  return (
    <div className="admin-batches-list overflow-hidden flex flex-col min-h-0 flex-1">
      <section
        className="client-stat-strip grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-b shrink-0"
        style={{ borderColor: c.border }}
      >
        <div
          className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b sm:border-b-0"
          style={{ backgroundColor: c.stat.blue, borderColor: c.border }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Boxes className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
            <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
              In queue
            </span>
          </div>
          <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
            {batches.length}
          </span>
        </div>
        <div
          className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b lg:border-b-0"
          style={{ backgroundColor: c.stat.slate, borderColor: c.border }}
        >
          <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
            Invoices
          </span>
          <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
            {batches.reduce((sum, b) => sum + b.total_invoices, 0)}
          </span>
        </div>
        <div
          className="flex items-center justify-between gap-2 px-4 py-2.5"
          style={{ backgroundColor: c.stat.green }}
        >
          <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
            Total amount
          </span>
          <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
            {formatCurrency(totalAmount)}
          </span>
        </div>
      </section>

      <div
        className="client-page-toolbar px-4 py-2 border-b flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 shrink-0"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        {variant === 'all' ? (
          <div className="flex flex-wrap gap-1.5">
            {statusFilters.map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setStatusFilter(btn.id)}
                className={`batch-filter-pill ${statusFilter === btn.id ? 'batch-filter-pill--active' : ''}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}
        <div className="relative w-full lg:w-auto lg:min-w-[280px] lg:max-w-sm">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: c.secondary }}
          />
          <input
            type="text"
            placeholder="Search batch or client..."
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
              {emptyTitle}
            </p>
            {emptyHint && (
              <p className="text-sm" style={{ color: c.secondary }}>
                {emptyHint}
              </p>
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
                    field="client_name"
                    label="Client"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <ClientSortableHeader
                    field="batch_number"
                    label="Batch#"
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
                    field="submitted_at"
                    label="Submitted"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  {variant === 'all' && (
                    <ClientSortableHeader
                      field="status"
                      label="Status"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  )}
                  {extraHeaderLabel && (
                    <th className="text-center">{extraHeaderLabel}</th>
                  )}
                  {variant === 'all' && (
                    <>
                      <th>In use</th>
                      <ClientSortableHeader
                        field="reviewed_at"
                        label="Reviewed"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </>
                  )}
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedBatches.map((batch) => (
                  <tr
                    key={batch.id}
                    className="cursor-pointer transition-colors"
                    onClick={() => onSelectBatch(batch.id)}
                  >
                    <ClientListTd variant="primary" className="font-semibold">
                      {batch.client_name}
                    </ClientListTd>
                    <ClientListTd variant="desktop" label="Batch#" style={{ color: c.secondary }}>
                      <span className="inline-flex items-center gap-1.5">
                        {batch.batch_number}
                        {batch.upload_mode === 'handoff' && (
                          <span className="status-pill status-pill--pending-batch">Handoff</span>
                        )}
                      </span>
                    </ClientListTd>
                    <ClientListTd variant="desktop" label="Invoices" className="text-right tabular-nums">
                      {batch.total_invoices}
                    </ClientListTd>
                    <ClientListTd variant="amount" className="text-right font-medium tabular-nums">
                      {formatCurrency(batch.total_amount)}
                    </ClientListTd>
                    <ClientListTd variant="desktop" label="Submitted" style={{ color: c.secondary }}>
                      {formatDate(batch.submitted_at)}
                    </ClientListTd>
                    {variant !== 'all' && extraHeaderLabel && renderExtraCell(batch)}
                    {variant === 'all' && renderExtraCell(batch)}
                    <ClientListTd variant="actions" className="text-center">
                      <div
                        className="inline-flex items-center justify-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {variant === 'all' && canReturnToApproval?.(batch.status) && onReturnToApproval && (
                          <button
                            type="button"
                            onClick={(e) => onReturnToApproval(batch, e)}
                            className="dashboard-btn-secondary !h-7 !px-2 !text-xs inline-flex items-center gap-1"
                            title="Return batch to Approval stage"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Approval
                          </button>
                        )}
                        {onVoidBatch && canVoidAdminBatch(batch.status) && (
                          <button
                            type="button"
                            onClick={(e) => onVoidBatch(batch, e)}
                            className="dashboard-btn-secondary !h-7 !px-2 !text-xs inline-flex items-center gap-1"
                            style={{ color: c.error }}
                            title="Void batch"
                          >
                            <Ban className="w-3 h-3" />
                            Void
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            if (variant === 'all' && onViewClick) {
                              onViewClick(batch, e)
                            } else if (onAction) {
                              onAction(batch, e)
                            } else {
                              onSelectBatch(batch.id)
                            }
                          }}
                          className="dashboard-btn-primary !h-7 !px-2.5 !text-xs"
                        >
                          {actionLabel}
                        </button>
                      </div>
                    </ClientListTd>
                  </tr>
                ))}
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
