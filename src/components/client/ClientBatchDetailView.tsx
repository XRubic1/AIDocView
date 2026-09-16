import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, FileText, Loader2 } from 'lucide-react'
import { Invoice } from '../../types/invoice'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import { toClientVisibleInvoiceStatus } from '../../utils/clientInvoiceView'
import { ClientBatchListItem, getBatchStatusBadge } from './ClientBatchesListView'
import ClientSortableHeader from './ClientSortableHeader'
import ClientListTd from './ClientListTd'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../../utils/clientListPage'
import type { ClientBatchAiProgress } from '../../utils/clientBatchAiProgress'

interface ClientBatchDetailViewProps {
  batch: ClientBatchListItem
  invoices: Invoice[]
  onBack: () => void
  onViewInvoice: (invoice: Invoice) => void
  aiProgress?: ClientBatchAiProgress | null
}

type InvoiceSortField =
  | 'invoice_number'
  | 'load_number'
  | 'broker_name'
  | 'amount'
  | 'invoice_date'
  | 'status'

/** Client-facing status for invoices inside a batch review. */
function getBatchInvoiceStatusBadge(invoice: Invoice) {
  const visibleStatus = toClientVisibleInvoiceStatus(invoice)
  const classMap: Record<string, string> = {
    approved: 'status-pill status-pill--open',
    paid: 'status-pill status-pill--approved',
    rejected: 'status-pill status-pill--overdue',
    force_closed: 'status-pill status-pill--overdue',
    written_off: 'status-pill status-pill--closed',
    hold: 'status-pill status-pill--hold',
    overdue: 'status-pill status-pill--overdue',
    pending: 'status-pill status-pill--pending',
  }
  const labels: Record<string, string> = {
    pending: 'Pending',
    approved: 'Open',
    paid: 'Paid',
    rejected: 'Denied',
    force_closed: 'Force Closed',
    written_off: 'Written Off',
    hold: 'On Hold',
  }
  return (
    <span className={`inline-flex items-center ${classMap[visibleStatus] || 'status-pill status-pill--pending'}`}>
      {labels[visibleStatus] || 'Pending'}
    </span>
  )
}

/** Full-width batch detail — compact stats + scrollable invoice table. */
export default function ClientBatchDetailView({
  batch,
  invoices,
  onBack,
  onViewInvoice,
  aiProgress,
}: ClientBatchDetailViewProps) {
  const c = useClientTheme()
  const [pageSize, setPageSize] = useState<number>(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<InvoiceSortField>('invoice_number')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  /** Keep a short “Paperwork checked” confirmation after processing finishes. */
  const [showDoneBanner, setShowDoneBanner] = useState(false)

  useEffect(() => {
    if (aiProgress?.phase === 'done') {
      setShowDoneBanner(true)
      const timer = window.setTimeout(() => setShowDoneBanner(false), 6000)
      return () => window.clearTimeout(timer)
    }
    if (aiProgress?.phase === 'processing' || aiProgress?.phase === 'failed') {
      setShowDoneBanner(false)
    }
    return undefined
  }, [aiProgress?.phase, batch.id])

  const showAiBanner =
    aiProgress?.show &&
    (aiProgress.phase === 'processing' ||
      aiProgress.phase === 'failed' ||
      (aiProgress.phase === 'done' && showDoneBanner))

  const sortedInvoices = useMemo(() => {
    const sorted = [...invoices]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'invoice_number':
          cmp = a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true })
          break
        case 'load_number':
          cmp = (a.load_number ?? '').localeCompare(b.load_number ?? '', undefined, { numeric: true })
          break
        case 'broker_name':
          cmp = a.broker_name.localeCompare(b.broker_name)
          break
        case 'amount':
          cmp = a.amount - b.amount
          break
        case 'invoice_date':
          cmp = new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime()
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [invoices, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / pageSize))

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedInvoices.slice(start, start + pageSize)
  }, [sortedInvoices, currentPage, pageSize])

  const pageStart = sortedInvoices.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, sortedInvoices.length)

  const handleSort = useCallback(
    (field: InvoiceSortField) => {
      if (sortField === field) {
        setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        setSortDir(field === 'amount' || field === 'invoice_date' ? 'desc' : 'asc')
      }
    },
    [sortField]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [pageSize, sortField, sortDir, invoices.length])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  return (
    <div className="client-batch-detail overflow-hidden flex flex-col min-h-0" data-onboard-target="batchDetail">
      <div className="client-batch-detail__toolbar shrink-0">
        <button type="button" onClick={onBack} className="client-batch-detail__back">
          <ChevronLeft className="w-4 h-4" />
          All batches
        </button>
      </div>

      {showAiBanner && aiProgress && (
        <div
          className={`client-batch-ai-progress shrink-0${
            aiProgress.phase === 'failed' ? ' client-batch-ai-progress--failed' : ''
          }${aiProgress.phase === 'done' ? ' client-batch-ai-progress--done' : ''}`}
          role="status"
          aria-live="polite"
        >
          <div className="client-batch-ai-progress__row">
            {aiProgress.phase === 'processing' ? (
              <Loader2 className="client-batch-ai-progress__spinner w-4 h-4 shrink-0" />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="client-batch-ai-progress__label">{aiProgress.label}</p>
              {aiProgress.detail ? (
                <p className="client-batch-ai-progress__detail">{aiProgress.detail}</p>
              ) : null}
              {aiProgress.phase === 'processing' && aiProgress.etaLabel ? (
                <p className="client-batch-ai-progress__detail">
                  Estimated time left: {aiProgress.etaLabel}
                </p>
              ) : null}
            </div>
            {aiProgress.total > 0 ? (
              <span className="client-batch-ai-progress__pct tabular-nums">
                {aiProgress.percent}%
              </span>
            ) : null}
          </div>
          {aiProgress.total > 0 && aiProgress.phase === 'processing' ? (
            <div className="client-batch-ai-progress__track">
              <div
                className="client-batch-ai-progress__bar"
                style={{ width: `${aiProgress.percent}%` }}
              />
            </div>
          ) : null}
        </div>
      )}

      <section
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-b shrink-0"
        style={{ borderColor: c.border }}
      >
        <div
          className="flex flex-col justify-center gap-0.5 px-4 py-2.5 sm:border-r border-b sm:border-b-0"
          style={{ backgroundColor: c.stat.blue, borderColor: c.border }}
          data-onboard-target="batchCardNumber"
        >
          <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
            Batch#
          </span>
          <span className="text-sm font-bold truncate" style={{ color: c.primary }}>
            {batch.batch_number}
          </span>
        </div>
        <div
          className="flex flex-col justify-center gap-0.5 px-4 py-2.5 lg:border-r border-b sm:border-b-0"
          style={{ backgroundColor: c.stat.slate, borderColor: c.border }}
          data-onboard-target="batchCardStatus"
        >
          <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
            Status
          </span>
          <div className="mt-0.5">{getBatchStatusBadge(batch.status)}</div>
        </div>
        <div
          className="flex flex-col justify-center gap-0.5 px-4 py-2.5 sm:border-r border-b lg:border-b-0"
          style={{ backgroundColor: c.stat.blue, borderColor: c.border }}
          data-onboard-target="batchCardInvoices"
        >
          <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
            Invoices
          </span>
          <span className="text-lg font-bold tabular-nums" style={{ color: c.primary }}>
            {batch.total_invoices}
          </span>
        </div>
        <div
          className="flex flex-col justify-center gap-0.5 px-4 py-2.5 lg:border-r border-b lg:border-b-0"
          style={{ backgroundColor: c.stat.green, borderColor: c.border }}
          data-onboard-target="batchCardAmount"
        >
          <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
            Amount
          </span>
          <span className="text-lg font-bold tabular-nums" style={{ color: c.primary }}>
            {formatCurrency(batch.total_amount)}
          </span>
        </div>
        <div
          className="flex flex-col justify-center gap-0.5 px-4 py-2.5 sm:border-r border-b sm:border-b-0"
          style={{ backgroundColor: c.stat.amber, borderColor: c.border }}
          data-onboard-target="batchCardSubmitted"
        >
          <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
            Submitted
          </span>
          <span className="text-sm font-semibold" style={{ color: c.primary }}>
            {formatDate(batch.submitted_at)}
          </span>
        </div>
        <div
          className="flex flex-col justify-center gap-0.5 px-4 py-2.5"
          style={{ backgroundColor: c.stat.slate }}
          data-onboard-target="batchCardOutcome"
        >
          <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
            Outcome
          </span>
          <span className="text-sm font-semibold" style={{ color: c.primary }}>
            {batch.approved_count != null ? (
              <>
                <span style={{ color: c.success }}>{batch.approved_count} approved</span>
                {(batch.rejected_count ?? 0) > 0 && (
                  <span style={{ color: c.error }}> · {batch.rejected_count} rejected</span>
                )}
              </>
            ) : (
              <span style={{ color: c.mutedLight }}>—</span>
            )}
          </span>
        </div>
      </section>

      <div
        className="client-batch-detail__section flex flex-col min-h-0 flex-1"
        data-onboard-target="batchInvoiceList"
      >
        <div
          className="client-batch-detail__section-header shrink-0"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <span className="client-batch-detail__section-title">Invoices</span>
          <span className="client-batch-detail__section-count">{invoices.length} total</span>
        </div>

        {sortedInvoices.length === 0 ? (
          <div className="flex-1 flex items-center justify-center client-batch-detail__empty">
            <div className="text-center">
              <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: c.mutedLight }} />
              <p className="text-sm font-medium" style={{ color: c.primary }}>
                No invoices in this batch
              </p>
              <p className="text-xs mt-1" style={{ color: c.secondary }}>
                Invoices will appear here once added to the batch
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="client-table-scroll client-table-scroll--mobile-stack flex-1 min-h-0 overflow-y-auto overflow-x-auto">
              <table className="dashboard-table dashboard-table--compact">
                <thead>
                  <tr>
                    <ClientSortableHeader
                      field="invoice_number"
                      label="Invoice#"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="load_number"
                      label="Load#"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="broker_name"
                      label="Broker"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="amount"
                      label="Amount"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right"
                      align="right"
                    />
                    <ClientSortableHeader
                      field="invoice_date"
                      label="Invoice Date"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="status"
                      label="Status"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="text-center"> </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInvoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="cursor-pointer"
                      onClick={() => onViewInvoice(invoice)}
                    >
                      <ClientListTd variant="primary" className="font-semibold">
                        {invoice.invoice_number}
                      </ClientListTd>
                      <ClientListTd variant="desktop" label="Load#" style={{ color: c.secondary }}>
                        {invoice.load_number || '—'}
                      </ClientListTd>
                      <ClientListTd variant="meta" className="truncate" style={{ color: c.secondary }}>
                        {invoice.broker_name}
                      </ClientListTd>
                      <ClientListTd variant="amount" className="text-right font-medium tabular-nums">
                        {formatCurrency(invoice.amount)}
                      </ClientListTd>
                      <ClientListTd variant="desktop" label="Invoice Date" style={{ color: c.secondary }}>
                        {invoice.invoice_date ? formatDate(invoice.invoice_date) : '—'}
                      </ClientListTd>
                      <ClientListTd variant="status">{getBatchInvoiceStatusBadge(invoice)}</ClientListTd>
                      <ClientListTd variant="actions" className="text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onViewInvoice(invoice)
                          }}
                          className="client-batch-detail__row-action"
                          title="View invoice"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
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
                Showing {pageStart}–{pageEnd} of {sortedInvoices.length}
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
    </div>
  )
}
