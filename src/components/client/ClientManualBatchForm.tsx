import { FileText, Plus, Trash2, Upload, Receipt } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'

export interface ManualBatchInvoiceFormData {
  invoice_number: string
  load_number: string
  broker_name: string
  broker_address: string
  amount: string
  invoice_date: string
  notes: string
  documents?: { id: string; name: string; size: number }[]
}

interface BrokerSuggestion {
  id: string
  name: string
}

interface ClientManualBatchFormProps {
  formData: ManualBatchInvoiceFormData
  onFormChange: (field: keyof ManualBatchInvoiceFormData, value: string) => void
  brokerSuggestions: BrokerSuggestion[]
  showBrokerSuggestions: boolean
  onBrokerFocus: () => void
  onBrokerBlur: () => void
  onBrokerSelect: (broker: BrokerSuggestion) => void
  onAddInvoice: () => void
  invoices: ManualBatchInvoiceFormData[]
  onViewDocuments: (invoice: ManualBatchInvoiceFormData) => void
  onUploadDocuments: (invoice: ManualBatchInvoiceFormData, index: number) => void
  onRemoveInvoice: (index: number) => void
  onClearAll: () => void
  onSubmit: () => void
  draftBatchNumber?: string
  /** Hard-block message when invoice # is already used. */
  invoiceNumberError?: string | null
  /** Soft warning when load # was already submitted by this carrier. */
  loadNumberWarning?: string | null
}

/** Manual batch entry — form + live invoice list with sticky submit bar. */
export default function ClientManualBatchForm({
  formData,
  onFormChange,
  brokerSuggestions,
  showBrokerSuggestions,
  onBrokerFocus,
  onBrokerBlur,
  onBrokerSelect,
  onAddInvoice,
  invoices,
  onViewDocuments,
  onUploadDocuments,
  onRemoveInvoice,
  onClearAll,
  onSubmit,
  draftBatchNumber,
  invoiceNumberError,
  loadNumberWarning,
}: ClientManualBatchFormProps) {
  const c = useClientTheme()
  const batchTotal = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0)
  const docCount = invoices.reduce((sum, inv) => sum + (inv.documents?.length ?? 0), 0)

  return (
    <div
      className={`client-manual-batch${invoices.length > 0 ? ' client-manual-batch--has-footer' : ''}`}
    >
      <div className="client-manual-batch__overview">
        <div className="client-manual-batch__overview-main">
          <span className="client-manual-batch__overview-title">New manual batch</span>
          <span className="status-pill status-pill--compact status-pill--pending-batch">Draft</span>
          <span className="client-manual-batch__overview-meta">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} · {formatCurrency(batchTotal)} ·{' '}
            {docCount} doc{docCount !== 1 ? 's' : ''} · Auto batch #
          </span>
        </div>
      </div>

      <div className="client-manual-batch__body">
        <aside className="client-manual-batch__form-panel">
          <div className="client-manual-batch__form-grid">
            <div className="client-manual-batch__field">
              <label className="client-label">Invoice number</label>
              <input
                type="text"
                value={formData.invoice_number}
                onChange={(e) => onFormChange('invoice_number', e.target.value)}
                placeholder="INV-2025-001"
                className={`client-input${invoiceNumberError ? ' client-input--error' : ''}`}
                aria-invalid={Boolean(invoiceNumberError)}
              />
              {invoiceNumberError ? (
                <p className="client-field-error" role="alert">
                  {invoiceNumberError}
                </p>
              ) : (
                <p className="client-label-hint">Auto-generated, editable — must be unique for your account</p>
              )}
            </div>

            <div className="client-manual-batch__field">
              <label className="client-label">Load number</label>
              <input
                type="text"
                value={formData.load_number}
                onChange={(e) => onFormChange('load_number', e.target.value)}
                placeholder="LD12345"
                className={`client-input${loadNumberWarning ? ' client-input--warn' : ''}`}
              />
              {loadNumberWarning && (
                <p className="client-field-warn" role="status">
                  {loadNumberWarning}
                </p>
              )}
            </div>

            <div className="client-manual-batch__field client-manual-batch__field--full relative">
              <label className="client-label">
                Broker <span className="client-manual-batch__required">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.broker_name}
                onChange={(e) => onFormChange('broker_name', e.target.value)}
                onFocus={onBrokerFocus}
                onBlur={onBrokerBlur}
                placeholder="Search broker name…"
                className="client-input"
              />
              {showBrokerSuggestions && brokerSuggestions.length > 0 && (
                <div className="client-manual-batch__suggestions">
                  {brokerSuggestions.map((broker) => (
                    <button
                      key={broker.id}
                      type="button"
                      onClick={() => onBrokerSelect(broker)}
                      className="client-manual-batch__suggestion-item"
                    >
                      {broker.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="client-manual-batch__field client-manual-batch__field--full">
              <label className="client-label">
                Broker address <span className="client-manual-batch__required">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.broker_address}
                onChange={(e) => onFormChange('broker_address', e.target.value)}
                placeholder="Street, city, state ZIP"
                className="client-input"
              />
            </div>

            <div className="client-manual-batch__field">
              <label className="client-label">
                Amount <span className="client-manual-batch__required">*</span>
              </label>
              <input
                type="number"
                required
                step="0.01"
                min="0.01"
                value={formData.amount}
                onChange={(e) => onFormChange('amount', e.target.value)}
                placeholder="5000.00"
                className="client-input"
              />
            </div>

            <div className="client-manual-batch__field">
              <label className="client-label">Invoice date</label>
              <input
                type="date"
                value={formData.invoice_date}
                onChange={(e) => onFormChange('invoice_date', e.target.value)}
                className="client-input"
              />
            </div>

            <div className="client-manual-batch__field client-manual-batch__field--full">
              <label className="client-label">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => onFormChange('notes', e.target.value)}
                placeholder="Optional notes for this invoice…"
                rows={2}
                className="client-input client-manual-batch__textarea"
              />
            </div>
          </div>

          <button type="button" onClick={onAddInvoice} className="dashboard-btn-primary client-manual-batch__add-btn">
            <Plus className="w-4 h-4" />
            Add invoice
          </button>
        </aside>

        <section className="client-manual-batch__list-panel">
          <div className="client-manual-batch__list-header">
            <h3 className="client-manual-batch__list-title">Batch invoices</h3>
            <span className="client-manual-batch__list-count">
              {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}
            </span>
          </div>

          {invoices.length === 0 ? (
            <div className="client-manual-batch__empty">
              <Receipt className="w-10 h-10 mb-3" style={{ color: c.mutedLight }} />
              <p className="text-sm font-medium" style={{ color: c.primary }}>
                No invoices yet
              </p>
              <p className="text-xs mt-1 max-w-xs text-center" style={{ color: c.secondary }}>
                Fill in the form on the left and add your first invoice. You can attach documents
                after each add.
              </p>
            </div>
          ) : (
            <div className="client-manual-batch__table-wrap">
              <table className="dashboard-table dashboard-table--compact">
                <thead>
                  <tr>
                    <th>Invoice#</th>
                    <th>Load#</th>
                    <th>Broker</th>
                    <th className="text-right">Amount</th>
                    <th>Date</th>
                    <th className="text-center">Docs</th>
                    <th className="text-center"> </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice, index) => (
                    <tr key={`${invoice.invoice_number}-${index}`}>
                      <td className="font-semibold">{invoice.invoice_number}</td>
                      <td style={{ color: c.secondary }}>{invoice.load_number || '—'}</td>
                      <td className="client-manual-batch__broker-cell">{invoice.broker_name}</td>
                      <td className="text-right font-medium tabular-nums">
                        {formatCurrency(parseFloat(invoice.amount || '0'))}
                      </td>
                      <td style={{ color: c.secondary }}>
                        {invoice.invoice_date ? formatDate(invoice.invoice_date) : '—'}
                      </td>
                      <td className="text-center">
                        {invoice.documents && invoice.documents.length > 0 ? (
                          <div className="client-manual-batch__doc-actions">
                            <button
                              type="button"
                              onClick={() => onViewDocuments(invoice)}
                              className="client-manual-batch__doc-badge"
                              title="View documents"
                            >
                              <FileText className="w-3 h-3" />
                              {invoice.documents.length}
                            </button>
                            <button
                              type="button"
                              onClick={() => onUploadDocuments(invoice, index)}
                              className="client-manual-batch__doc-edit"
                              title="Add or edit documents"
                            >
                              <Upload className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onUploadDocuments(invoice, index)}
                            className="client-manual-batch__doc-upload"
                          >
                            <Upload className="w-3 h-3" />
                            Upload
                          </button>
                        )}
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => onRemoveInvoice(index)}
                          className="client-batch-detail__row-action"
                          title="Remove invoice"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {invoices.length > 0 && (
        <div className="client-manual-batch__footer">
          <div className="client-manual-batch__footer-summary">
            <span className="client-manual-batch__footer-label">Ready to submit</span>
            <span className="client-manual-batch__footer-value">
              {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} · {formatCurrency(batchTotal)}
            </span>
            {draftBatchNumber && (
              <span className="client-manual-batch__draft-saved">
                Draft saved · {draftBatchNumber}
              </span>
            )}
          </div>
          <div className="client-manual-batch__footer-actions">
            <button type="button" onClick={onClearAll} className="dashboard-btn-secondary">
              Clear all
            </button>
            <button type="button" onClick={onSubmit} className="dashboard-btn-primary">
              Submit batch
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
