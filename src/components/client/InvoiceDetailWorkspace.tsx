import { useMemo, useState } from 'react'
import { Invoice } from '../../types/invoice'
import { formatCurrency } from '../../utils/format'
import type { ClientMarkPaidOptions } from '../../services/clientInvoiceActions'
import { Search, Filter, X } from 'lucide-react'
import type { Payment } from '../../types/payment'
import { enrichInvoice, getDaysOutstandingColor, isOpenArInvoice } from '../../utils/invoiceAging'
import {
  getInvoiceBalanceState,
  getInvoiceReceivedAmount,
} from '../../utils/paymentVariance'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  mapClientVisibleInvoices,
  toClientVisibleInvoice,
  toClientVisibleStatus,
} from '../../utils/clientInvoiceView'
import InvoiceDetailPanel from './InvoiceDetailPanel'
import {
  getInvoiceRowStatusBadge,
  InvoiceDisputeBadges,
} from './invoiceDetailShared'
import { invoiceHasDisputedPayment } from '../../utils/paymentStatus'
import { isReceiptDisputeHold } from '../../services/paymentReceiptConfirmationService'
import { invoiceHasOpenDisputedStatus } from '../../utils/clientInvoiceDisputeStatus'

export {
  NOTE_TYPE_LABELS,
  getInvoiceNoteEntries,
  getInvoiceNotice,
  InvoiceNotesTimeline,
  InvoiceNoteCompose,
  getInvoiceStatusBadge,
  getInvoiceRowStatusBadge,
  InvoiceDisputeBadges,
} from './invoiceDetailShared'

function inputCompactStyle(card: string) {
  return {
    backgroundColor: card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const
}

export interface InvoiceDetailWorkspaceProps {
  isOpen: boolean
  onClose: () => void
  invoices: Invoice[]
  selectedInvoice: Invoice | null
  onSelectInvoice: (invoice: Invoice) => void
  onViewDocuments?: (invoice: Invoice) => void
  highlightedInvoiceId?: string | null
  title?: string
  clientName: string
  onInvoiceUpdated?: () => void
  onAddNote?: (invoiceId: string, note: string) => void | Promise<void>
  onOpenDispute?: (invoiceId: string, reason: string, description: string) => void | Promise<void>
  onMarkAsPaid?: (invoiceId: string, options: ClientMarkPaidOptions) => void | Promise<void>
  onCloseAsUncollectable?: (invoiceId: string, note: string) => void | Promise<void>
  onAcceptOverpayment?: (invoiceId: string, note: string) => void | Promise<void>
  payments?: Payment[]
  enableClientActions?: boolean
  /** Sync search/filter with parent (e.g. invoices page). Omit for local-only filtering. */
  searchTerm?: string
  onSearchChange?: (value: string) => void
  statusFilter?: string
  onStatusFilterChange?: (value: string) => void
  showStatusFilter?: boolean
}

/** Full-screen overlay workspace (Batches / Short Payments) — embeds InvoiceDetailPanel. */
export default function InvoiceDetailWorkspace({
  isOpen,
  onClose,
  invoices,
  selectedInvoice,
  onSelectInvoice,
  onViewDocuments,
  highlightedInvoiceId,
  title = 'Invoice Details',
  clientName,
  onInvoiceUpdated,
  onAddNote,
  onOpenDispute,
  onMarkAsPaid,
  onCloseAsUncollectable,
  onAcceptOverpayment,
  payments = [],
  enableClientActions = true,
  searchTerm: externalSearchTerm,
  onSearchChange: externalOnSearchChange,
  statusFilter: externalStatusFilter,
  onStatusFilterChange: externalOnStatusFilterChange,
  showStatusFilter = true,
}: InvoiceDetailWorkspaceProps) {
  const c = useClientTheme()
  const [mobileListMode, setMobileListMode] = useState(false)
  const [localSearchTerm, setLocalSearchTerm] = useState('')
  const [localStatusFilter, setLocalStatusFilter] = useState('all')

  const searchTerm = externalSearchTerm ?? localSearchTerm
  const onSearchChange = externalOnSearchChange ?? setLocalSearchTerm
  const statusFilter = externalStatusFilter ?? localStatusFilter
  const onStatusFilterChange = externalOnStatusFilterChange ?? setLocalStatusFilter

  const visibleInvoices = useMemo(() => mapClientVisibleInvoices(invoices), [invoices])
  const visibleSelected = useMemo(() => {
    if (!selectedInvoice) return null
    return (
      visibleInvoices.find((inv) => inv.id === selectedInvoice.id) ??
      toClientVisibleInvoice(selectedInvoice)
    )
  }, [selectedInvoice, visibleInvoices])

  const filteredList = useMemo(() => {
    return visibleInvoices.filter((invoice) => {
      const enriched = enrichInvoice(invoice)
      const displayStatus = toClientVisibleStatus(invoice.status)
      const matchesSearch =
        invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.broker_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.load_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.batch_number?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus =
        !showStatusFilter ||
        statusFilter === 'all' ||
        (statusFilter === 'overdue' ? enriched.isOverdue : displayStatus === statusFilter)
      return matchesSearch && matchesStatus
    })
  }, [visibleInvoices, searchTerm, showStatusFilter, statusFilter])

  if (!isOpen || !visibleSelected) return null

  const handleClose = () => {
    setMobileListMode(false)
    onClose()
  }

  return (
    <div className="invoice-detail-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="invoice-detail-overlay-header">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
            style={{ color: c.secondary }}
            aria-label="Close invoice details"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-sm font-semibold truncate" style={{ color: c.primary }}>
            {title}
          </h2>
        </div>
        <span className="text-xs font-medium shrink-0" style={{ color: c.secondary }}>
          {filteredList.length} invoice{filteredList.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="invoice-workspace invoice-workspace--overlay">
        <div
          className={`invoice-workspace-body ${
            visibleSelected && !mobileListMode ? 'invoice-workspace-body--detail-open' : ''
          }`}
        >
          <aside className="invoice-list-panel">
            <div className="invoice-list-toolbar">
              <div className="relative mb-2">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                  style={{ color: c.secondary }}
                />
                <input
                  type="text"
                  placeholder="Search invoices..."
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="client-input pl-8 w-full"
                  style={inputCompactStyle(c.card)}
                />
              </div>
              {showStatusFilter && (
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: c.secondary }} />
                  <select
                    value={statusFilter}
                    onChange={(e) => onStatusFilterChange(e.target.value)}
                    className="client-input flex-1 min-w-0"
                    style={inputCompactStyle(c.card)}
                  >
                    <option value="all">All Status</option>
                    <option value="overdue">Overdue</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Open</option>
                    <option value="hold">On Hold</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              )}
            </div>

            <div className="invoice-list-scroll">
              {filteredList.length === 0 ? (
                <p className="invoice-detail-empty p-4">No invoices found</p>
              ) : (
                filteredList.map((invoice) => {
                  const enriched = enrichInvoice(invoice)
                  const isActive = visibleSelected.id === invoice.id
                  const isHighlighted = highlightedInvoiceId === invoice.id
                  const balance = getInvoiceBalanceState(
                    invoice.amount,
                    getInvoiceReceivedAmount(invoice, payments)
                  )
                  const paymentDisputed =
                    invoiceHasDisputedPayment(invoice.id, payments) ||
                    isReceiptDisputeHold(invoice)
                  return (
                    <button
                      key={invoice.id}
                      type="button"
                      onClick={() => {
                        onSelectInvoice(invoice)
                        setMobileListMode(false)
                      }}
                      className={`invoice-list-item ${isActive ? 'invoice-list-item--active' : ''} ${
                        isHighlighted ? 'invoice-list-item--highlight' : ''
                      } ${enriched.isForceCloseEligible ? 'invoice-list-item--force-close' : enriched.isOverdue ? 'invoice-list-item--overdue' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                        <span className="text-sm font-semibold truncate" style={{ color: c.primary }}>
                          {invoice.invoice_number}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 max-w-[58%] justify-end flex-wrap">
                          {getInvoiceRowStatusBadge(enriched, {
                            compact: true,
                            balance,
                            paymentDisputed,
                          })}
                          {!invoiceHasOpenDisputedStatus(invoice, { paymentDisputed }) && (
                            <InvoiceDisputeBadges invoice={invoice} />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate" style={{ color: c.secondary }}>
                          {invoice.broker_name}
                        </span>
                        <span className="font-semibold tabular-nums shrink-0" style={{ color: c.primary }}>
                          {formatCurrency(invoice.amount)}
                          {isOpenArInvoice(invoice) && enriched.daysOutstanding > 0 && (
                            <span
                              className="ml-1.5 font-medium"
                              style={{
                                color: enriched.isOverdue
                                  ? getDaysOutstandingColor(enriched.overdueSeverity)
                                  : c.secondary,
                              }}
                            >
                              · {enriched.daysOutstanding}d
                            </span>
                          )}
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          <section className="invoice-detail-panel">
            <InvoiceDetailPanel
              key={visibleSelected.id}
              variant="sidebar"
              invoice={visibleSelected}
              clientName={clientName}
              navigationInvoices={filteredList}
              onClose={() => {
                // Mobile overlay toggles list/detail; desktop closes the workspace.
                if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
                  setMobileListMode(true)
                } else {
                  handleClose()
                }
              }}
              onNavigateInvoice={(inv) => {
                onSelectInvoice(inv)
                setMobileListMode(false)
              }}
              onViewDocuments={
                onViewDocuments && selectedInvoice
                  ? () => onViewDocuments(selectedInvoice)
                  : undefined
              }
              onInvoiceUpdated={onInvoiceUpdated}
              onAddNote={onAddNote}
              onOpenDispute={onOpenDispute}
              onMarkAsPaid={onMarkAsPaid}
              onCloseAsUncollectable={onCloseAsUncollectable}
              onAcceptOverpayment={onAcceptOverpayment}
              payments={payments}
              enableClientActions={enableClientActions}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
