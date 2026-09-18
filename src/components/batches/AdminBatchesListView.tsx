import {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Boxes, ChevronLeft, ChevronRight, FileEdit, RotateCcw, Search, Trash2 } from 'lucide-react'
import { canDeleteBatch } from '../../services/credyx/deleteBatch'
import { batchIsStuckCreating } from '../../services/batchReworkService'
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

export interface AdminBatchListItem {
  id: string
  batch_number: string
  client_name: string
  /** Carrier id. */
  client_id?: string
  total_invoices: number
  /** Paperwork docs on this batch (uploaded / attached — not generated invoice PDFs). */
  documents_count?: number
  total_amount: number
  submitted_at: string
  status: string
  upload_mode?: string
  sort_status?: string
  in_use?: boolean
  in_use_by?: string
  reviewed_at?: string | null
  reviewed_by?: string
  /** AI review progress, e.g. "4 of 6 docs reviewed" */
  ai_review_label?: string | null
  ai_review_completed?: number
  ai_review_total?: number
  /** Packet rework is unlocked only after intake / AI settle. */
  packet_rework_ready?: boolean
  /** Combined PDFs need Credyx Doc Splitter before Packets. */
  needs_doc_split?: boolean
}

type BatchContextMenuState = {
  x: number
  y: number
  batch: AdminBatchListItem
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

interface AdminBatchesListViewProps {
  batches: AdminBatchListItem[]
  variant: AdminBatchListVariant
  onSelectBatch: (batchId: string) => void
  emptyTitle: string
  emptyHint?: string
  actionLabel?: string
  onAction?: (batch: AdminBatchListItem, e: React.MouseEvent) => void
  onViewClick?: (batch: AdminBatchListItem, e: React.MouseEvent) => void
  /** Opens the updated invoice + document preview workspace for this batch. */
  onPreviewClick?: (batch: AdminBatchListItem, e: React.MouseEvent) => void
  onReturnToApproval?: (batch: AdminBatchListItem, e: React.MouseEvent) => void
  canReturnToApproval?: (status: string) => boolean
  /** Delete draft / intake batches — blocked once submitted/processed. */
  onDeleteBatch?: (batch: AdminBatchListItem, e: React.MouseEvent) => void
  /**
   * Stop AI “Creating…” and open manual invoice creation (handoff docs still available).
   * Shown in the row context menu when the batch is stuck creating/sorting.
   */
  onManualCreation?: (batch: AdminBatchListItem, e: React.MouseEvent) => void
}

function getReadyToPostProgress(batchId: string): number {
  const batchInvoices = mockInvoices.filter((inv) => inv.batch_id === batchId)
  const paperworkComplete = batchInvoices.filter((inv) => inv.documents_count && inv.documents_count > 0).length
  const brokersAssigned = batchInvoices.filter((inv) => !!inv.broker_id).length
  const total = batchInvoices.length
  if (total === 0) return 0
  return Math.round(((paperworkComplete + brokersAssigned) / (total * 2)) * 100)
}

/** Count paperwork docs on one batch (invoice attachments + unmatched uploads). */
export function countBatchDocuments(
  batchId: string,
  unmatchedDocIds?: string[] | null
): number {
  const ids = new Set<string>()
  for (const inv of mockInvoices) {
    if (inv.batch_id !== batchId) continue
    for (const id of inv.document_doc_ids ?? []) {
      if (id && !id.startsWith('invoice-pdf-')) ids.add(id)
    }
    for (const id of Object.keys(inv.document_storage_paths ?? {})) {
      if (id && !id.startsWith('invoice-pdf-')) ids.add(id)
    }
  }
  for (const id of unmatchedDocIds ?? []) {
    if (id && !id.startsWith('invoice-pdf-')) ids.add(id)
  }
  if (ids.size > 0) return ids.size

  const fromCounts = mockInvoices
    .filter((inv) => inv.batch_id === batchId)
    .reduce((sum, inv) => sum + (inv.documents_count ?? 0), 0)
  return fromCounts + (unmatchedDocIds?.length ?? 0)
}

/** Build batch_id → document count for a list of batches. */
export function buildBatchDocumentCountMap(
  batches: Array<{ id: string; unmatched_doc_ids?: string[] | null }>
): Map<string, number> {
  const map = new Map<string, number>()
  for (const batch of batches) {
    map.set(batch.id, countBatchDocuments(batch.id, batch.unmatched_doc_ids))
  }
  return map
}

/** @deprecated Prefer buildBatchDocumentCountMap — kept for any stray callers. */
export function countClientInvoices(clientId: string | null | undefined): number {
  if (!clientId) return 0
  return mockInvoices.filter((inv) => inv.client_id === clientId).length
}

/** @deprecated Prefer buildBatchDocumentCountMap. */
export function buildClientInvoiceCountMap(
  clientIds?: Iterable<string>
): Map<string, number> {
  const counts = new Map<string, number>()
  const filter = clientIds ? new Set(clientIds) : null
  for (const inv of mockInvoices) {
    if (!inv.client_id) continue
    if (filter && !filter.has(inv.client_id)) continue
    counts.set(inv.client_id, (counts.get(inv.client_id) ?? 0) + 1)
  }
  return counts
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
  onPreviewClick,
  onReturnToApproval,
  canReturnToApproval,
  onDeleteBatch,
  onManualCreation,
}: AdminBatchesListViewProps) {
  const c = useClientTheme()
  const [searchTerm, setSearchTerm] = useState('')
  const [pageSize, setPageSize] = useState<number>(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<BatchSortField>(
    variant === 'all' ? 'submitted_at' : 'client_name'
  )
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [contextMenu, setContextMenu] = useState<BatchContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  /** Right-click a row for manual creation / delete. */
  const openBatchContextMenu = useCallback(
    (event: ReactMouseEvent, batch: AdminBatchListItem) => {
      const canManual = Boolean(onManualCreation && batchIsStuckCreating(batch))
      const canDelete = Boolean(onDeleteBatch)
      if (!canManual && !canDelete) return
      event.preventDefault()
      event.stopPropagation()
      setContextMenu({ x: event.clientX, y: event.clientY, batch })
    },
    [onDeleteBatch, onManualCreation]
  )

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return
    const el = contextMenuRef.current
    const pad = 8
    const rect = el.getBoundingClientRect()
    let x = contextMenu.x
    let y = contextMenu.y
    if (x + rect.width > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - rect.width - pad)
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    if (x !== contextMenu.x || y !== contextMenu.y) {
      setContextMenu((prev) => (prev ? { ...prev, x, y } : prev))
    }
  }, [contextMenu])

  useEffect(() => {
    if (!contextMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }
    const onPointer = (e: PointerEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return
      closeContextMenu()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [contextMenu, closeContextMenu])

  // Status chips live on the Batches page; this list only applies search.
  const filteredBatches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return batches.filter((batch) => {
      return (
        !q ||
        batch.batch_number.toLowerCase().includes(q) ||
        batch.client_name.toLowerCase().includes(q)
      )
    })
  }, [batches, searchTerm])

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
  }, [searchTerm, pageSize, sortField, sortDir, batches])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const totalAmount = useMemo(
    () => batches.reduce((sum, b) => sum + b.total_amount, 0),
    [batches]
  )

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
      const showAiProgress =
        Boolean(batch.ai_review_label) &&
        (batch.status === 'creating' ||
          batch.sort_status === 'sorting' ||
          (batch.ai_review_total != null && batch.ai_review_total > 0))

      return (
        <>
          <ClientListTd variant="status">
            <div className="flex flex-col items-start gap-1">
              {getAdminBatchStatusBadge(batch.status)}
              {showAiProgress && batch.ai_review_label ? (
                <span className="text-xs tabular-nums" style={{ color: c.secondary }}>
                  {batch.ai_review_label}
                </span>
              ) : null}
              {!showAiProgress && batch.status === 'creating' ? (
                <span className="text-xs" style={{ color: c.secondary }}>
                  Creating invoices…
                </span>
              ) : null}
            </div>
          </ClientListTd>
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
            {showAiProgress && batch.ai_review_total != null && batch.ai_review_total > 0 ? (
              <span className="tabular-nums">
                {batch.ai_review_completed ?? 0} / {batch.ai_review_total}
              </span>
            ) : batch.reviewed_at ? (
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
        className="client-page-toolbar px-4 py-2 border-b flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 shrink-0"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <div className="relative w-full sm:w-auto sm:min-w-[280px] sm:max-w-sm">
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
                    label="Batch inv"
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
                    onContextMenu={(e) => openBatchContextMenu(e, batch)}
                  >
                    <ClientListTd variant="primary" className="font-semibold">
                      <span className="block">{batch.client_name}</span>
                      {batch.documents_count != null ? (
                        <span
                          className="block text-xs font-normal tabular-nums mt-0.5"
                          style={{ color: c.secondary }}
                          title="Documents uploaded on this batch"
                        >
                          {batch.documents_count} doc{batch.documents_count === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </ClientListTd>
                    <ClientListTd variant="desktop" label="Batch#" style={{ color: c.secondary }}>
                      <span className="inline-flex items-center gap-1.5">
                        {batch.batch_number}
                        {batch.upload_mode === 'handoff' && (
                          <span className="status-pill status-pill--pending-batch">Handoff</span>
                        )}
                      </span>
                    </ClientListTd>
                    <ClientListTd
                      variant="desktop"
                      label="Batch inv"
                      className="text-right tabular-nums"
                      title="Invoices in this batch"
                    >
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
                            title="Return batch to AI Verification"
                          >
                            <RotateCcw className="w-3 h-3" />
                            AI Verify
                          </button>
                        )}
                        {onPreviewClick && (
                          <button
                            type="button"
                            onClick={(e) => onPreviewClick(batch, e)}
                            className={`dashboard-btn-secondary !h-7 !px-2.5 !text-xs${
                              batch.packet_rework_ready === false && !batch.needs_doc_split
                                ? ' opacity-50'
                                : ''
                            }`}
                            title={
                              batch.needs_doc_split
                                ? 'Open Doc Splitter — combined PDFs need review'
                                : batch.packet_rework_ready === false
                                  ? 'Packet rework unlocks when invoices are ready'
                                  : 'Open Packets rework workspace'
                            }
                          >
                            {batch.needs_doc_split ? 'Doc Split' : 'Packets'}
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
                        {onDeleteBatch && canDeleteBatch(batch.status) && (
                          <button
                            type="button"
                            onClick={(e) => onDeleteBatch(batch, e)}
                            className="dashboard-btn-secondary !h-7 !px-2 !text-xs inline-flex items-center gap-1"
                            title="Delete batch"
                            aria-label={`Delete batch ${batch.batch_number}`}
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        )}
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

      {contextMenu &&
        createPortal(
          <div
            ref={contextMenuRef}
            className="client-ai-doc-menu admin-batch-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <p className="client-ai-doc-menu__label">
              {contextMenu.batch.batch_number}
            </p>
            {onManualCreation && batchIsStuckCreating(contextMenu.batch) ? (
              <button
                type="button"
                role="menuitem"
                className="client-ai-doc-menu__item"
                onClick={(e) => {
                  const batch = contextMenu.batch
                  closeContextMenu()
                  onManualCreation(batch, e)
                }}
              >
                <FileEdit className="w-3.5 h-3.5 shrink-0" aria-hidden />
                Manual creation
              </button>
            ) : null}
            {onDeleteBatch ? (
              canDeleteBatch(contextMenu.batch.status) ? (
                <button
                  type="button"
                  role="menuitem"
                  className="client-ai-doc-menu__item client-ai-doc-menu__item--danger"
                  onClick={(e) => {
                    const batch = contextMenu.batch
                    closeContextMenu()
                    onDeleteBatch(batch, e)
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  Delete batch
                </button>
              ) : (
                <p className="client-ai-doc-menu__empty" role="menuitem" aria-disabled="true">
                  Submitted batches can’t be deleted
                </p>
              )
            ) : null}
          </div>,
          document.body
        )}
    </div>
  )
}
