import { Search } from 'lucide-react'
import type { AdminCollectionsRow } from '../../utils/adminCollections'
import { chaseStatusLabel, chaseStatusPillClass } from '../../utils/adminCollections'
import { formatCurrency } from '../../utils/format'
import { useClientTheme } from '../../theme/ThemeContext'

type CollectionsWorkspaceInvoiceListProps = {
  rows: AdminCollectionsRow[]
  selectedId: string | undefined
  search: string
  onSearchChange: (value: string) => void
  onSelect: (invoiceId: string) => void
}

/** Compact collections queue — same invoices as the page that opened this window. */
export default function CollectionsWorkspaceInvoiceList({
  rows,
  selectedId,
  search,
  onSearchChange,
  onSelect,
}: CollectionsWorkspaceInvoiceListProps) {
  const c = useClientTheme()

  return (
    <aside className="flex flex-col min-h-0 h-full" style={{ backgroundColor: c.card }}>
      <div className="shrink-0 px-3 py-2.5 border-b" style={{ borderColor: c.border }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: c.secondary }}>
          Collections queue
        </p>
        <label className="relative block">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: c.mutedLight }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search invoices…"
            className="client-input w-full !pl-8 !py-1.5 !text-sm"
            style={{ backgroundColor: c.surface, color: c.primary }}
          />
        </label>
      </div>

      <div className="invoice-list-scroll">
        {rows.length === 0 ? (
          <p className="p-4 text-sm" style={{ color: c.secondary }}>
            No invoices in this list.
          </p>
        ) : (
          rows.map((row) => {
            const inv = row.invoice
            const isActive = inv.id === selectedId
            return (
              <button
                key={inv.id}
                type="button"
                onClick={() => onSelect(inv.id)}
                className={`invoice-list-item ${isActive ? 'invoice-list-item--active' : ''} ${
                  row.isUrgent || row.isOverdue ? 'invoice-list-item--overdue' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5 min-w-0">
                  <span className="text-sm font-semibold truncate" style={{ color: c.primary }}>
                    {inv.invoice_number}
                  </span>
                  <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: c.primary }}>
                    {formatCurrency(row.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                  <span className="truncate" style={{ color: c.secondary }}>
                    {inv.client_name}
                    {inv.broker_name ? ` · ${inv.broker_name}` : ''}
                  </span>
                  <span className="shrink-0 tabular-nums" style={{ color: c.secondary }}>
                    {row.ageDays}d
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {row.chaseStatus !== 'not_due' ? (
                    <span className={chaseStatusPillClass(row.chaseStatus)}>
                      {chaseStatusLabel(row.chaseStatus)}
                    </span>
                  ) : null}
                  {row.isUrgent ? <span className="status-pill status-pill--overdue">Urgent</span> : null}
                  {row.collectionStatus === 'W/P' ? (
                    <span className="status-pill status-pill--approved">Will Pay</span>
                  ) : null}
                  {row.collectionStatus === 'C/B' ? (
                    <span className="status-pill status-pill--pending">Call back</span>
                  ) : null}
                </div>
              </button>
            )
          })
        )}
      </div>

      <div className="invoice-list-footer text-[11px]" style={{ color: c.secondary }}>
        {rows.length} invoice{rows.length === 1 ? '' : 's'}
      </div>
    </aside>
  )
}
