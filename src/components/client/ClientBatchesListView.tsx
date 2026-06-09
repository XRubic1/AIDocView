import { useMemo, useState } from 'react'
import {
  Boxes,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'

export interface ClientBatchListItem {
  id: string
  batch_number: string
  total_invoices: number
  total_amount: number
  submitted_at: string
  status: string
  reviewed_at: string | null
  upload_mode?: string
  approved_count?: number
  rejected_count?: number
}

interface ClientBatchesListViewProps {
  batches: ClientBatchListItem[]
  highlightedBatchId: string | null
  onSelectBatch: (batchId: string) => void
  onCreateBatch: () => void
  onDeleteDraft?: (batchId: string) => void
}

type StatusFilter = 'all' | 'pending' | 'review' | 'processed'

const STATUS_FILTER_MATCH: Record<StatusFilter, (status: string) => boolean> = {
  all: () => true,
  pending: (s) => ['draft', 'ready_to_post', 'documents_uploaded'].includes(s),
  review: (s) => ['verification', 'approval'].includes(s),
  processed: (s) => ['submitted', 'processing'].includes(s),
}

function getBatchStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'status-pill--pending-batch' },
    ready_to_post: { label: 'Queued', className: 'status-pill--pending-batch' },
    documents_uploaded: { label: 'Docs received', className: 'status-pill--pending-batch' },
    verification: { label: 'Verifying', className: 'status-pill--review' },
    approval: { label: 'In approval', className: 'status-pill--review' },
    submitted: { label: 'Posted', className: 'status-pill--submitted' },
    processing: { label: 'Processing', className: 'status-pill--approved' },
  }
  const config = map[status] ?? { label: status.replace(/_/g, ' '), className: 'status-pill--pending-batch' }
  return <span className={`status-pill ${config.className}`}>{config.label}</span>
}

/** Polished batch list for the client portal View Batches tab. */
export default function ClientBatchesListView({
  batches,
  highlightedBatchId,
  onSelectBatch,
  onCreateBatch,
  onDeleteDraft,
}: ClientBatchesListViewProps) {
  const c = useClientTheme()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

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
    <div className="client-batches-page overflow-hidden">
      <section
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b"
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
        className="px-4 py-2.5 border-b flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2"
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
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto lg:min-w-[320px]">
          <div className="relative flex-1">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: c.secondary }}
            />
            <input
              type="text"
              placeholder="Search batch number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="client-input pl-8"
              style={inputStyle}
            />
          </div>
          <button type="button" onClick={onCreateBatch} className="dashboard-btn-primary shrink-0">
            <Plus className="w-3.5 h-3.5" />
            New batch
          </button>
        </div>
      </div>

      {filteredBatches.length === 0 ? (
        <div className="text-center py-12 px-4">
          <Boxes className="w-10 h-10 mx-auto mb-3" style={{ color: c.mutedLight }} />
          <p className="text-base font-medium mb-1" style={{ color: c.primary }}>
            No batches found
          </p>
          <p className="text-sm mb-4" style={{ color: c.secondary }}>
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Submit your first batch to get started'}
          </p>
          {!searchTerm && statusFilter === 'all' && (
            <button type="button" onClick={onCreateBatch} className="dashboard-btn-primary">
              <Plus className="w-3.5 h-3.5" />
              Create batch
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="dashboard-table dashboard-table--compact">
            <thead>
              <tr>
                <th>Batch#</th>
                <th>Submitted</th>
                <th className="text-right">Invoices</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th>Reviewed</th>
                <th className="text-center">Outcome</th>
                {onDeleteDraft && <th className="text-center w-16"> </th>}
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map((batch) => {
                const isHighlighted = highlightedBatchId === batch.id
                const isProcessed = STATUS_FILTER_MATCH.processed(batch.status)
                const isDraft = batch.status === 'draft'
                return (
                  <tr
                    key={batch.id}
                    className={`cursor-pointer transition-colors ${isHighlighted ? 'batch-highlight-row' : ''}`}
                    onClick={() => onSelectBatch(batch.id)}
                  >
                    <td className="font-semibold">{batch.batch_number}</td>
                    <td style={{ color: c.secondary }}>{formatDate(batch.submitted_at)}</td>
                    <td className="text-right tabular-nums">{batch.total_invoices}</td>
                    <td className="text-right font-medium tabular-nums">
                      {formatCurrency(batch.total_amount)}
                    </td>
                    <td>{getBatchStatusBadge(batch.status)}</td>
                    <td style={{ color: c.secondary }}>
                      {batch.reviewed_at ? formatDate(batch.reviewed_at) : '—'}
                    </td>
                    <td className="text-center">
                      {isProcessed && batch.approved_count != null ? (
                        <span className="text-xs font-medium" style={{ color: c.success }}>
                          {batch.approved_count} approved
                          {(batch.rejected_count ?? 0) > 0 && (
                            <span style={{ color: c.error }}> · {batch.rejected_count} rejected</span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: c.mutedLight }}>—</span>
                      )}
                    </td>
                    {onDeleteDraft && (
                      <td className="text-center">
                        {isDraft ? (
                          <button
                            type="button"
                            className="client-batches-list__delete-draft"
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
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export { getBatchStatusBadge }
