import { ChevronLeft, Eye, FileText } from 'lucide-react'
import { Invoice } from '../../types/invoice'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'
import { ClientBatchListItem, getBatchStatusBadge } from './ClientBatchesListView'

interface ClientBatchDetailViewProps {
  batch: ClientBatchListItem
  invoices: Invoice[]
  onBack: () => void
  onViewInvoice: (invoice: Invoice) => void
}

/** Client-facing status for invoices inside a batch review. */
function getBatchInvoiceStatusBadge(status: string) {
  const classMap: Record<string, string> = {
    pending: 'status-pill status-pill--pending',
    approved: 'status-pill status-pill--approved',
    paid: 'status-pill status-pill--approved',
    rejected: 'status-pill status-pill--overdue',
    force_closed: 'status-pill status-pill--overdue',
    hold: 'status-pill status-pill--hold',
  }
  const labels: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    paid: 'Approved',
    rejected: 'Denied',
    force_closed: 'Denied',
    hold: 'On Hold',
  }
  return (
    <span className={classMap[status] || 'status-pill status-pill--pending'}>
      {labels[status] || 'Pending'}
    </span>
  )
}

/** Full-width batch detail — overview + invoice table. */
export default function ClientBatchDetailView({
  batch,
  invoices,
  onBack,
  onViewInvoice,
}: ClientBatchDetailViewProps) {
  const c = useClientTheme()
  return (
    <div className="client-batch-detail">
      <div className="client-batch-detail__toolbar">
        <button type="button" onClick={onBack} className="client-batch-detail__back">
          <ChevronLeft className="w-4 h-4" />
          All batches
        </button>
      </div>

      <div className="client-batch-detail__overview">
        <div className="client-batch-detail__overview-main">
          <div className="client-batch-detail__hero">
            <span className="invoice-detail-field-label">Batch</span>
            <div className="client-batch-detail__hero-title">{batch.batch_number}</div>
            <div className="client-batch-detail__hero-meta">
              {getBatchStatusBadge(batch.status)}
            </div>
          </div>

          <div className="client-batch-detail__stat-grid">
            <div className="client-batch-detail__stat">
              <span className="invoice-detail-field-label">Invoices</span>
              <span className="client-batch-detail__stat-value tabular-nums">{batch.total_invoices}</span>
            </div>
            <div className="client-batch-detail__stat">
              <span className="invoice-detail-field-label">Amount</span>
              <span className="client-batch-detail__stat-value tabular-nums">
                {formatCurrency(batch.total_amount)}
              </span>
            </div>
            <div className="client-batch-detail__stat">
              <span className="invoice-detail-field-label">Submitted</span>
              <span className="client-batch-detail__stat-value">{formatDate(batch.submitted_at)}</span>
            </div>
            <div className="client-batch-detail__stat">
              <span className="invoice-detail-field-label">Reviewed</span>
              <span className="client-batch-detail__stat-value">
                {batch.reviewed_at ? formatDate(batch.reviewed_at) : '—'}
              </span>
            </div>
            {batch.approved_count != null && (
              <div className="client-batch-detail__stat client-batch-detail__stat--outcome">
                <span className="invoice-detail-field-label">Outcome</span>
                <span className="client-batch-detail__stat-value client-batch-detail__stat-value--success">
                  {batch.approved_count} approved
                  {(batch.rejected_count ?? 0) > 0 && (
                    <span className="client-batch-detail__stat-rejected">
                      {' '}
                      · {batch.rejected_count} rejected
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="client-batch-detail__section">
        <div className="client-batch-detail__section-header">
          <h2 className="client-batch-detail__section-title">Invoices</h2>
          <span className="client-batch-detail__section-count">{invoices.length} total</span>
        </div>

        {invoices.length === 0 ? (
          <div className="client-batch-detail__empty">
            <FileText className="w-10 h-10 mb-3" style={{ color: c.mutedLight }} />
            <p className="text-sm font-medium" style={{ color: c.primary }}>
              No invoices in this batch
            </p>
            <p className="text-xs mt-1" style={{ color: c.secondary }}>
              Invoices will appear here once added to the batch
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="dashboard-table dashboard-table--compact">
              <thead>
                <tr>
                  <th>Invoice#</th>
                  <th>Load#</th>
                  <th>Broker</th>
                  <th className="text-right">Amount</th>
                  <th>Invoice Date</th>
                  <th>Status</th>
                  <th className="text-center"> </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => onViewInvoice(invoice)}
                  >
                    <td className="font-semibold">{invoice.invoice_number}</td>
                    <td style={{ color: c.secondary }}>{invoice.load_number || '—'}</td>
                    <td style={{ color: c.secondary }}>{invoice.broker_name}</td>
                    <td className="text-right font-medium tabular-nums">
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td style={{ color: c.secondary }}>
                      {invoice.invoice_date ? formatDate(invoice.invoice_date) : '—'}
                    </td>
                    <td>{getBatchInvoiceStatusBadge(invoice.status)}</td>
                    <td className="text-center">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
