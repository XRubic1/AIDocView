import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Search } from 'lucide-react'
import ClientListTd from '../client/ClientListTd'
import ClientSortableHeader from '../client/ClientSortableHeader'
import EmptyState from '../ui/EmptyState'
import { mockInvoices } from '../../data/mockInvoices'
import { useTenantDataRevision } from '../../hooks/useTenantDataRevision'
import { useClientTheme } from '../../theme/ThemeContext'
import { formatCurrency } from '../../utils/format'
import {
  BROKER_AGING_BUCKETS,
  buildCarrierAgingRows,
  type BrokerAgingBucketKey,
  type BrokerAgingRow,
  type CarrierAgingRow,
} from '../../utils/brokerAgingSummary'
import { openBrokerAgingWindow, openCarrierAgingWindow } from '../../utils/openBrokerAgingWindow'
import { getInitialListPageSize, PAGE_SIZE_OPTIONS, type SortDir } from '../../utils/clientListPage'

type SortField = 'carrier_name' | 'total' | 'percent' | 'avg_age' | 'invoice_count' | BrokerAgingBucketKey

const COL_COUNT = 1 + BROKER_AGING_BUCKETS.length + 4

function moneyCell(amount: number): string {
  if (amount === 0) return '—'
  return formatCurrency(amount)
}

function compareAging(
  a: { clientName?: string; brokerName?: string; total: number; percentOfTotal: number; avgAgeDays: number; invoiceCount: number; amounts: Record<BrokerAgingBucketKey, number> },
  b: typeof a,
  sortField: SortField,
  nameKey: 'clientName' | 'brokerName'
): number {
  if (sortField === 'carrier_name') {
    return (a[nameKey] || '').localeCompare(b[nameKey] || '', undefined, { sensitivity: 'base' })
  }
  if (sortField === 'total') return a.total - b.total
  if (sortField === 'percent') return a.percentOfTotal - b.percentOfTotal
  if (sortField === 'avg_age') return a.avgAgeDays - b.avgAgeDays
  if (sortField === 'invoice_count') return a.invoiceCount - b.invoiceCount
  return a.amounts[sortField] - b.amounts[sortField]
}

/** Admin Aging A/R — carriers as parents, brokers as expandable children. */
export default function AgingInvoicesTab() {
  const c = useClientTheme()
  const tenantRevision = useTenantDataRevision()
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<SortField>('total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [pageSize, setPageSize] = useState(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const rows = useMemo(() => {
    void tenantRevision
    return buildCarrierAgingRows(mockInvoices)
  }, [tenantRevision])

  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0)
  const grandCount = rows.reduce((sum, row) => sum + row.invoiceCount, 0)

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      if (row.clientName.toLowerCase().includes(q)) return true
      return row.brokers.some((broker) => broker.brokerName.toLowerCase().includes(q))
    })
  }, [rows, searchTerm])

  const sorted = useMemo(() => {
    const next = [...filtered]
    next.sort((a, b) => {
      const cmp = compareAging(a, b, sortField, 'clientName')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return next
  }, [filtered, sortField, sortDir])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, pageSize, sortField, sortDir])

  useEffect(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return
    setExpandedIds((prev) => {
      const next = new Set(prev)
      for (const row of filtered) {
        if (row.brokers.some((broker) => broker.brokerName.toLowerCase().includes(q))) {
          next.add(row.clientId)
        }
      }
      return next
    })
  }, [searchTerm, filtered])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const onSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDir(field === 'carrier_name' ? 'asc' : 'desc')
  }

  const toggleCarrier = (clientId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  const openCarrierWindow = (row: CarrierAgingRow, event: MouseEvent) => {
    event.stopPropagation()
    const popup = openCarrierAgingWindow(row.clientId, row.clientName)
    if (!popup) window.alert('Allow pop-ups to open the carrier aging window.')
  }

  const openBroker = (carrier: CarrierAgingRow, broker: BrokerAgingRow, event: MouseEvent) => {
    event.stopPropagation()
    const popup = openBrokerAgingWindow(broker.brokerId, broker.brokerName, carrier.clientId, carrier.clientName)
    if (!popup) window.alert('Allow pop-ups to open the broker invoice window.')
  }

  const bucketTotals = BROKER_AGING_BUCKETS.reduce(
    (acc, bucket) => {
      acc[bucket.key] = rows.reduce((sum, row) => sum + row.amounts[bucket.key], 0)
      return acc
    },
    {} as Record<BrokerAgingBucketKey, number>
  )

  const renderAmountCells = (
    amounts: Record<BrokerAgingBucketKey, number>,
    total: number,
    percent: number,
    avgAge: number,
    invoiceCount: number,
    mutedZero = true
  ) => (
    <>
      {BROKER_AGING_BUCKETS.map((bucket) => (
        <ClientListTd
          key={bucket.key}
          variant="amount"
          className="tabular-nums"
          style={{ color: amounts[bucket.key] || !mutedZero ? c.primary : c.muted }}
        >
          {moneyCell(amounts[bucket.key])}
        </ClientListTd>
      ))}
      <ClientListTd variant="amount" className="tabular-nums font-semibold">
        {formatCurrency(total)}
      </ClientListTd>
      <ClientListTd variant="amount" className="tabular-nums">
        {percent.toFixed(1)}%
      </ClientListTd>
      <ClientListTd variant="amount" className="tabular-nums">
        {avgAge}d
      </ClientListTd>
      <ClientListTd variant="amount" className="tabular-nums">
        {invoiceCount}
      </ClientListTd>
    </>
  )

  return (
    <div className="admin-aging-page overflow-hidden flex flex-col min-h-0 h-full">
      <div
        className="client-page-toolbar px-4 py-2.5 border-b shrink-0 flex flex-wrap items-center justify-between gap-2"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <div className="min-w-0">
          <h1 className="text-sm font-semibold" style={{ color: c.primary }}>
            Summary aging — by carrier
          </h1>
          <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
            Click a carrier to see broker concentration. Open a broker for invoices.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: c.secondary }}>
              Open A/R
            </p>
            <p className="text-sm font-semibold tabular-nums" style={{ color: c.primary }}>
              {formatCurrency(grandTotal)}
            </p>
          </div>
          <div className="relative min-w-[200px]">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: c.muted }}
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Find carrier or broker…"
              className="client-input w-full pl-8 pr-3 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6">
          <EmptyState title="No open A/R" hint="Approved and on-hold invoices will appear here by carrier." />
        </div>
      ) : (
        <div className="client-table-scroll flex-1 min-h-0 overflow-y-auto">
          <table className="dashboard-table dashboard-table--compact">
            <thead>
              <tr>
                <ClientSortableHeader
                  field="carrier_name"
                  label="Carrier"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                {BROKER_AGING_BUCKETS.map((bucket) => (
                  <ClientSortableHeader
                    key={bucket.key}
                    field={bucket.key}
                    label={bucket.label}
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={onSort}
                    align="right"
                  />
                ))}
                <ClientSortableHeader
                  field="total"
                  label="Total"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
                <ClientSortableHeader
                  field="percent"
                  label="% tot"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
                <ClientSortableHeader
                  field="avg_age"
                  label="Avg age"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
                <ClientSortableHeader
                  field="invoice_count"
                  label="Inv"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const expanded = expandedIds.has(row.clientId)
                const childBrokers = [...row.brokers].sort((a, b) => {
                  const cmp = compareAging(a, b, sortField, 'brokerName')
                  return sortDir === 'asc' ? cmp : -cmp
                })
                return (
                  <AgingCarrierBlock
                    key={row.clientId}
                    row={row}
                    expanded={expanded}
                    brokers={childBrokers}
                    onToggle={() => toggleCarrier(row.clientId)}
                    onOpenCarrierWindow={(event) => openCarrierWindow(row, event)}
                    onOpenBroker={(broker, event) => openBroker(row, broker, event)}
                    renderAmounts={renderAmountCells}
                    secondaryColor={c.secondary}
                    cardColor={c.card}
                  />
                )
              })}
              <tr>
                <ClientListTd variant="primary">
                  <span className="font-semibold" style={{ color: c.primary }}>
                    Total
                  </span>
                </ClientListTd>
                {renderAmountCells(bucketTotals, grandTotal, 100, 0, grandCount, false)}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {sorted.length > 0 ? (
        <div
          className="shrink-0 px-4 py-2 border-t flex flex-wrap items-center justify-between gap-2"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <p className="text-xs" style={{ color: c.secondary }}>
            {sorted.length} carrier{sorted.length === 1 ? '' : 's'} · page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <select
              className="client-input py-1 text-xs"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              aria-label="Rows per page"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
            <button
              type="button"
              className="dashboard-btn-secondary dashboard-btn-compact"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="dashboard-btn-secondary dashboard-btn-compact"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

type AgingCarrierBlockProps = {
  row: CarrierAgingRow
  expanded: boolean
  brokers: BrokerAgingRow[]
  onToggle: () => void
  onOpenCarrierWindow: (event: MouseEvent) => void
  onOpenBroker: (broker: BrokerAgingRow, event: MouseEvent) => void
  renderAmounts: (
    amounts: Record<BrokerAgingBucketKey, number>,
    total: number,
    percent: number,
    avgAge: number,
    invoiceCount: number
  ) => ReactNode
  secondaryColor: string
  cardColor: string
}

/** Carrier parent row plus optional broker children. */
function AgingCarrierBlock({
  row,
  expanded,
  brokers,
  onToggle,
  onOpenCarrierWindow,
  onOpenBroker,
  renderAmounts,
  secondaryColor,
  cardColor,
}: AgingCarrierBlockProps) {
  return (
    <>
      <tr className="dashboard-table-row--clickable cursor-pointer" onClick={onToggle}>
        <ClientListTd variant="primary">
          <div className="flex items-center gap-1.5 min-w-0">
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: secondaryColor }} />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: secondaryColor }} />
            )}
            <span className="font-medium truncate">{row.clientName}</span>
            <span className="text-[11px] shrink-0" style={{ color: secondaryColor }}>
              {row.brokers.length} broker{row.brokers.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="ml-auto p-1 rounded hover:bg-slate-100 shrink-0"
              title="Open broker aging in a new window"
              onClick={onOpenCarrierWindow}
            >
              <ExternalLink className="w-3.5 h-3.5" style={{ color: secondaryColor }} />
            </button>
          </div>
        </ClientListTd>
        {renderAmounts(row.amounts, row.total, row.percentOfTotal, row.avgAgeDays, row.invoiceCount)}
      </tr>
      {expanded ? (
        <>
          <tr>
            <td
              colSpan={COL_COUNT}
              className="!py-1 !px-3 text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: secondaryColor, backgroundColor: cardColor }}
            >
              Brokers for {row.clientName} · % is share of this carrier
            </td>
          </tr>
          {brokers.map((broker) => (
            <tr
              key={broker.brokerId}
              className="dashboard-table-row--clickable cursor-pointer"
              style={{ backgroundColor: cardColor }}
              onClick={(event) => onOpenBroker(broker, event)}
            >
              <ClientListTd variant="primary">
                <div className="flex items-center gap-1.5 pl-6 min-w-0">
                  <span className="truncate">{broker.brokerName}</span>
                </div>
              </ClientListTd>
              {renderAmounts(
                broker.amounts,
                broker.total,
                broker.percentOfTotal,
                broker.avgAgeDays,
                broker.invoiceCount
              )}
            </tr>
          ))}
        </>
      ) : null}
    </>
  )
}
