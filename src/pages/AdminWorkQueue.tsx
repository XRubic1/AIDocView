/**
 * Full admin Client Work Queue — expandable client rows, invoice-grouped issues,
 * in-page invoice detail on the right (no navigation away).
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Briefcase, ChevronDown, ChevronRight, Filter, Search, X } from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import { useToast } from '../components/ui/ToastProvider'
import { getAllBatches } from '../data/mockBatches'
import { getInvoiceById, mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { useAuth } from '../context/AuthContext'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { getAdminUserDisplayName } from '../config/adminNav'
import {
  addAdminInvoiceNote,
  removeAdminInvoiceNote,
} from '../services/adminInvoiceNoteActions'
import { useClientTheme } from '../theme/ThemeContext'
import type { PendingBatch } from '../types/admin'
import type { Invoice } from '../types/invoice'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'
import { compareByClientName } from '../utils/compareByClientName'
import {
  buildClientWorkSummaries,
  clientWorkIssueLabel,
  filterClientWorkSummaries,
  groupClientWorkItemsByInvoice,
  type ClientWorkCategoryFilter,
  type ClientWorkInvoiceGroup,
  type ClientWorkSeverity,
  type ClientWorkSummary,
} from '../utils/clientWorkQueue'
import '../styles/adminWorkQueue.css'

type SortField =
  | 'clientName'
  | 'totalOpen'
  | 'disputes'
  | 'payments'
  | 'holds'
  | 'callbacks'
  | 'batches'
  | 'severity'

const CATEGORY_FILTERS: Array<{ id: ClientWorkCategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'disputes', label: 'Disputes' },
  { id: 'payments', label: 'Payments' },
  { id: 'holds', label: 'Holds' },
  { id: 'callbacks', label: 'Callbacks' },
  { id: 'batches', label: 'Batches' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'chase', label: 'Chase' },
]

const SEVERITY_FILTERS: Array<{ id: 'all' | ClientWorkSeverity; label: string }> = [
  { id: 'all', label: 'Any severity' },
  { id: 'critical', label: 'Critical' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
]

const SEVERITY_RANK: Record<ClientWorkSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function severityClass(severity: ClientWorkSeverity): string {
  return `admin-work-queue__sev admin-work-queue__sev--${severity}`
}

export default function AdminWorkQueue() {
  const t = useClientTheme()
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const adminName = getAdminUserDisplayName(resolved.user?.email ?? null)
  const [searchParams, setSearchParams] = useSearchParams()
  const tenantRevision = useTenantDataRevision()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ClientWorkCategoryFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<'all' | ClientWorkSeverity>('all')
  const [sortField, setSortField] = useState<SortField>('severity')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [pageSize, setPageSize] = useState(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(searchParams.get('client'))
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey((k) => k + 1)

  const dataRevision = tenantRevision + refreshKey

  const invoices = useMemo(() => [...mockInvoices], [dataRevision])
  const payments = useMemo(() => [...mockPayments], [dataRevision])
  const batches = useMemo(
    () =>
      getAllBatches().filter(
        (batch): batch is PendingBatch =>
          batch.status === 'ready_to_post' ||
          batch.status === 'verification' ||
          batch.status === 'approval'
      ),
    [dataRevision]
  )

  const summaries = useMemo(
    () => buildClientWorkSummaries({ invoices, batches }),
    [invoices, batches]
  )

  const filtered = useMemo(() => {
    let rows = filterClientWorkSummaries(summaries, { category, search })
    if (severityFilter !== 'all') {
      rows = rows.filter((row) => row.severity === severityFilter)
    }
    return rows
  }, [summaries, category, search, severityFilter])

  const sorted = useMemo(() => {
    const rows = [...filtered]
    rows.sort((a, b) => {
      if (sortField === 'clientName') {
        return compareByClientName(a.clientName, b.clientName, sortDir)
      }
      if (sortField === 'severity') {
        const cmp = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
        return sortDir === 'asc' ? cmp : -cmp
      }
      const left = a[sortField] as number
      const right = b[sortField] as number
      const cmp = left - right
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [filtered, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const selectedInvoice = useMemo(() => {
    if (!selectedInvoiceId) return null
    return getInvoiceById(selectedInvoiceId) ?? invoices.find((inv) => inv.id === selectedInvoiceId) ?? null
  }, [selectedInvoiceId, invoices])

  /** Invoices from the expanded client's open work — for detail panel navigation. */
  const navigationInvoices = useMemo(() => {
    const client = expandedId ? summaries.find((s) => s.clientId === expandedId) : null
    if (!client) return selectedInvoice ? [selectedInvoice] : []
    const ids = [
      ...new Set(
        client.items.map((item) => item.invoiceId).filter((id): id is string => Boolean(id))
      ),
    ]
    return ids
      .map((id) => getInvoiceById(id) ?? invoices.find((inv) => inv.id === id))
      .filter((inv): inv is Invoice => Boolean(inv))
  }, [expandedId, summaries, invoices, selectedInvoice])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, category, severityFilter, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  // Deep-link: ?client= expands that row
  useEffect(() => {
    const clientId = searchParams.get('client')
    if (!clientId) return
    setExpandedId(clientId)
    const idx = sorted.findIndex((row) => row.clientId === clientId)
    if (idx >= 0) {
      setCurrentPage(Math.floor(idx / pageSize) + 1)
    }
  }, [searchParams, sorted, pageSize])

  const onSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDir(field === 'clientName' || field === 'severity' ? 'asc' : 'desc')
  }

  const toggleClient = (row: ClientWorkSummary) => {
    const next = expandedId === row.clientId ? null : row.clientId
    setExpandedId(next)
    if (!next) setSelectedInvoiceId(null)
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next) params.set('client', next)
        else params.delete('client')
        return params
      },
      { replace: true }
    )
  }

  const openInvoice = useCallback((invoiceId: string | undefined) => {
    if (!invoiceId) return
    setSelectedInvoiceId(invoiceId)
  }, [])

  const closeInvoice = useCallback(() => {
    setSelectedInvoiceId(null)
  }, [])

  const detailOpen = Boolean(selectedInvoice)

  return (
    <AdminLayout userName="Admin User" userRole="Administrator" flushMain>
      <div
        className={`admin-work-queue${detailOpen ? ' admin-work-queue--detail-open' : ''}`}
        style={{ color: t.primary }}
      >
        <div className="admin-work-queue__main">
          <div
            className="admin-work-queue__top"
            style={{ borderColor: t.border, backgroundColor: t.card }}
          >
            <div className="admin-work-queue__heading">
              <div className="admin-work-queue__title-row">
                <Briefcase className="admin-work-queue__title-icon" style={{ color: t.info }} />
                <div>
                  <h1 style={{ color: t.primary }}>Client Work Queue</h1>
                  <p style={{ color: t.secondary }}>
                    {summaries.length} clients with open work · expand a client, then open an invoice
                  </p>
                </div>
              </div>
            </div>

            <div className="admin-work-queue__filters">
              <div className="admin-work-queue__search">
                <Search className="admin-work-queue__search-icon" style={{ color: t.secondary }} />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search client, invoice, or item…"
                  className="client-input pl-8"
                  aria-label="Search work queue"
                />
              </div>
              <div className="admin-work-queue__filter-row">
                <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: t.secondary }} />
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
                  className="client-input"
                  aria-label="Filter by severity"
                >
                  {SEVERITY_FILTERS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-work-queue__chips">
                {CATEGORY_FILTERS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={`page-tab ${category === chip.id ? 'page-tab--active' : ''}`}
                    onClick={() => setCategory(chip.id)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="admin-work-queue__workspace">
            <div
              className="admin-work-queue__table-wrap"
              style={{ borderColor: t.border, backgroundColor: t.card }}
            >
              <div className="overflow-x-auto admin-work-queue__table-scroll">
                <table className="dashboard-table dashboard-table--compact w-full">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }} />
                      <ClientSortableHeader
                        field="clientName"
                        label="Client"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                      />
                      <ClientSortableHeader
                        field="severity"
                        label="Severity"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                      />
                      <ClientSortableHeader
                        field="totalOpen"
                        label="Open"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                        align="center"
                        className="text-center"
                      />
                      <ClientSortableHeader
                        field="disputes"
                        label="Disputes"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                        align="center"
                        className="text-center"
                      />
                      <ClientSortableHeader
                        field="payments"
                        label="Payments"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                        align="center"
                        className="text-center"
                      />
                      <ClientSortableHeader
                        field="holds"
                        label="Holds"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                        align="center"
                        className="text-center"
                      />
                      <ClientSortableHeader
                        field="callbacks"
                        label="Callbacks"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                        align="center"
                        className="text-center"
                      />
                      <ClientSortableHeader
                        field="batches"
                        label="Batches"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={onSort}
                        align="center"
                        className="text-center"
                      />
                      <th>Next</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-10" style={{ color: t.secondary }}>
                          No clients match this filter
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row) => {
                        const open = expandedId === row.clientId
                        const groups = open ? groupClientWorkItemsByInvoice(row.items) : []
                        return (
                          <Fragment key={row.clientId}>
                            <tr
                              className={`cursor-pointer ${open ? 'admin-work-queue__row--active' : ''}`}
                              onClick={() => toggleClient(row)}
                            >
                              <td>
                                {open ? (
                                  <ChevronDown className="w-4 h-4" style={{ color: t.secondary }} />
                                ) : (
                                  <ChevronRight className="w-4 h-4" style={{ color: t.muted }} />
                                )}
                              </td>
                              <td className="font-medium">{row.clientName}</td>
                              <td>
                                <span className={severityClass(row.severity)}>{row.severity}</span>
                              </td>
                              <td className="text-center font-semibold tabular-nums">
                                {row.totalOpen}
                              </td>
                              <td className="text-center tabular-nums">{row.disputes || '—'}</td>
                              <td className="text-center tabular-nums">{row.payments || '—'}</td>
                              <td className="text-center tabular-nums">{row.holds || '—'}</td>
                              <td className="text-center tabular-nums">{row.callbacks || '—'}</td>
                              <td className="text-center tabular-nums">{row.batches || '—'}</td>
                              <td className="text-sm" style={{ color: t.secondary }}>
                                {row.nextDueLabel}
                              </td>
                            </tr>
                            {open ? (
                              <tr className="admin-work-queue__expand-row">
                                <td colSpan={10}>
                                  <div className="admin-work-queue__expand">
                                    <div className="admin-work-queue__actions">
                                      <Link
                                        to={row.links.invoices}
                                        className="dashboard-btn-secondary !text-xs"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        All invoices
                                      </Link>
                                      <Link
                                        to={row.links.paymentPosting}
                                        className="dashboard-btn-secondary !text-xs"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        Payment posting
                                      </Link>
                                      <Link
                                        to={row.links.collections}
                                        className="dashboard-btn-secondary !text-xs"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        Collections
                                      </Link>
                                      <Link
                                        to={row.links.calendar}
                                        className="dashboard-btn-secondary !text-xs"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        Calendar
                                      </Link>
                                    </div>

                                    {groups.length === 0 ? (
                                      <p className="text-sm" style={{ color: t.secondary }}>
                                        No open items
                                      </p>
                                    ) : (
                                      <ul className="admin-work-queue__groups">
                                        {groups.map((group) => (
                                          <InvoiceGroupCard
                                            key={group.key}
                                            group={group}
                                            selectedInvoiceId={selectedInvoiceId}
                                            onOpenInvoice={openInvoice}
                                          />
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div
                className="admin-work-queue__footer"
                style={{ borderColor: t.border, color: t.secondary }}
              >
                <span>
                  Showing {pageRows.length ? (currentPage - 1) * pageSize + 1 : 0}–
                  {Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs">
                    Rows
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="client-input"
                      style={{ width: 64, height: 30, fontSize: 12 }}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="dashboard-btn-secondary !h-7 !px-2 !text-xs"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span className="text-xs">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="dashboard-btn-secondary !h-7 !px-2 !text-xs"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {detailOpen && selectedInvoice ? (
          <aside
            className="admin-work-queue__invoice-panel"
            style={{ borderColor: t.border, backgroundColor: t.card }}
          >
            <div
              className="admin-work-queue__invoice-panel-bar"
              style={{ borderColor: t.border }}
            >
              <div className="min-w-0">
                <div className="admin-work-queue__invoice-panel-title truncate">
                  {selectedInvoice.invoice_number}
                </div>
                <div className="text-xs truncate" style={{ color: t.secondary }}>
                  {selectedInvoice.client_name} · {selectedInvoice.broker_name}
                </div>
              </div>
              <button
                type="button"
                className="dashboard-btn-secondary !h-8 !px-2 !text-xs inline-flex items-center gap-1"
                onClick={closeInvoice}
                aria-label="Close invoice"
              >
                <X className="w-3.5 h-3.5" />
                Close
              </button>
            </div>
            <div className="admin-work-queue__invoice-panel-body">
              <InvoiceDetailPanel
                variant="sidebar"
                invoice={selectedInvoice}
                clientName={selectedInvoice.client_name}
                noteAuthorName={adminName}
                navigationInvoices={navigationInvoices}
                onClose={closeInvoice}
                onNavigateInvoice={(invoice) => openInvoice(invoice.id)}
                onInvoiceUpdated={bump}
                onAddNote={(invoiceId, note, options) => {
                  addAdminInvoiceNote(invoiceId, note, adminName, {
                    visibility: options?.visibility ?? 'client',
                  })
                  bump()
                }}
                onRemoveNote={(invoiceId, noteId) => {
                  const updated = removeAdminInvoiceNote(invoiceId, noteId)
                  if (!updated) {
                    showToast('Only Credyx notes can be removed', 'error')
                    return false
                  }
                  bump()
                  return true
                }}
                payments={payments.filter((p) => p.invoice_id === selectedInvoice.id)}
                enableClientActions={false}
                enableNotes
                portalMode="admin"
              />
            </div>
          </aside>
        ) : null}
      </div>
    </AdminLayout>
  )
}

/** Invoice (or batch) card inside an expanded client row. */
function InvoiceGroupCard({
  group,
  selectedInvoiceId,
  onOpenInvoice,
}: {
  group: ClientWorkInvoiceGroup
  selectedInvoiceId: string | null
  onOpenInvoice: (invoiceId: string | undefined) => void
}) {
  const t = useClientTheme()
  const canOpenInvoice = Boolean(group.invoiceId)
  const active = group.invoiceId != null && group.invoiceId === selectedInvoiceId

  return (
    <li>
      <div
        className={`admin-work-queue__group ${active ? 'admin-work-queue__group--active' : ''} ${
          canOpenInvoice ? 'admin-work-queue__group--clickable' : ''
        }`}
        role={canOpenInvoice ? 'button' : undefined}
        tabIndex={canOpenInvoice ? 0 : undefined}
        onClick={() => {
          if (canOpenInvoice) onOpenInvoice(group.invoiceId)
        }}
        onKeyDown={(e) => {
          if (!canOpenInvoice) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpenInvoice(group.invoiceId)
          }
        }}
      >
        <div className="admin-work-queue__group-head">
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{group.title}</div>
            <div className="text-xs" style={{ color: t.secondary }}>
              {group.issues.length} issue{group.issues.length === 1 ? '' : 's'}
              {canOpenInvoice ? ' · click to open' : ''}
            </div>
          </div>
          <span className={severityClass(group.severity)}>{group.severity}</span>
        </div>
        <ul className="admin-work-queue__issue-list">
          {group.issues.map((issue) => (
            <li key={issue.id} className="admin-work-queue__issue">
              <span className="admin-work-queue__issue-kind">
                {clientWorkIssueLabel(issue.kind)}
              </span>
              <span className="admin-work-queue__issue-detail" style={{ color: t.secondary }}>
                {issue.detail}
              </span>
            </li>
          ))}
        </ul>
        {!canOpenInvoice && group.batchId ? (
          <Link
            to={`/batches?batch=${encodeURIComponent(group.batchId)}`}
            className="text-xs underline mt-2 inline-block"
            style={{ color: t.info }}
            onClick={(e) => e.stopPropagation()}
          >
            Open batch
          </Link>
        ) : null}
      </div>
    </li>
  )
}
