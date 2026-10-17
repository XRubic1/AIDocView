/**
 * Full admin Client Work Queue — expandable client rows, invoice-grouped issues,
 * in-page invoice detail on the right (no navigation away).
 * Client activity (uploads, notes, payments) shows here until an admin marks it reviewed.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import InvoiceDetailPanel from '../components/client/InvoiceDetailPanel'
import { useToast } from '../components/ui/ToastProvider'
import { getAllBatches } from '../data/mockBatches'
import { getInvoiceById, mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { useAuth } from '../context/AuthContext'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useAdminNotifications } from '../hooks/useAdminNotifications'
import { getAdminUserDisplayName } from '../config/adminNav'
import {
  addAdminInvoiceNote,
  removeAdminInvoiceNote,
} from '../services/adminInvoiceNoteActions'
import { markAdminNotificationRead } from '../services/adminNotificationService'
import type { PendingBatch } from '../types/admin'
import type { Invoice } from '../types/invoice'
import { getInitialListPageSize, PAGE_SIZE_OPTIONS } from '../utils/clientListPage'
import { compareByClientName } from '../utils/compareByClientName'
import { formatRelativeTime } from '../utils/format'
import {
  buildClientWorkSummaries,
  clientWorkIssueLabel,
  filterClientWorkSummaries,
  groupClientWorkItemsByInvoice,
  type ClientWorkCategory,
  type ClientWorkCategoryFilter,
  type ClientWorkInvoiceGroup,
  type ClientWorkItem,
  type ClientWorkSeverity,
  type ClientWorkSummary,
} from '../utils/clientWorkQueue'
import '../styles/adminWorkQueue.css'

type SortMode = 'severity' | 'activity' | 'totalOpen' | 'clientName'

const CATEGORY_FILTERS: Array<{ id: ClientWorkCategory; label: string }> = [
  { id: 'activity', label: 'Client activity' },
  { id: 'disputes', label: 'Disputes' },
  { id: 'payments', label: 'Payments' },
  { id: 'holds', label: 'Holds' },
  { id: 'callbacks', label: 'Callbacks' },
  { id: 'batches', label: 'Batches' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'chase', label: 'Chase' },
]

/** Short noun for the per-client tag row ("2 holds"). */
const CATEGORY_NOUN: Record<ClientWorkCategory, [string, string]> = {
  activity: ['new from client', 'new from client'],
  disputes: ['dispute', 'disputes'],
  payments: ['payment', 'payments'],
  holds: ['hold', 'holds'],
  callbacks: ['callback', 'callbacks'],
  batches: ['batch', 'batches'],
  overdue: ['overdue', 'overdue'],
  chase: ['chase', 'chase'],
}

const SEVERITY_FILTERS: Array<{ id: 'all' | ClientWorkSeverity; label: string }> = [
  { id: 'all', label: 'Any severity' },
  { id: 'critical', label: 'Critical' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
]

const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  { id: 'severity', label: 'Priority' },
  { id: 'activity', label: 'Client activity' },
  { id: 'totalOpen', label: 'Most open' },
  { id: 'clientName', label: 'A–Z' },
]

const SEVERITY_RANK: Record<ClientWorkSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function initials(name: string): string {
  const parts = name.replace(/[^a-z0-9 ]/gi, ' ').trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function isActivity(item: ClientWorkItem): boolean {
  return item.kind === 'client_activity'
}

export default function AdminWorkQueue() {
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const adminName = getAdminUserDisplayName(resolved.user?.email ?? null)
  const [searchParams, setSearchParams] = useSearchParams()
  const tenantRevision = useTenantDataRevision()
  const notifications = useAdminNotifications()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ClientWorkCategoryFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<'all' | ClientWorkSeverity>('all')
  const [sortMode, setSortMode] = useState<SortMode>('severity')
  const [pageSize, setPageSize] = useState(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(searchParams.get('client'))
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    searchParams.get('invoice')
  )
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
    () => buildClientWorkSummaries({ invoices, batches, notifications }),
    [invoices, batches, notifications]
  )

  const categoryTotals = useMemo(() => {
    const totals = { all: 0 } as Record<ClientWorkCategoryFilter, number>
    for (const chip of CATEGORY_FILTERS) totals[chip.id] = 0
    for (const row of summaries) {
      totals.all += row.totalOpen
      for (const chip of CATEGORY_FILTERS) totals[chip.id] += row[chip.id]
    }
    return totals
  }, [summaries])

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
      if (sortMode === 'clientName') return compareByClientName(a.clientName, b.clientName, 'asc')
      if (sortMode === 'activity' && a.activity !== b.activity) return b.activity - a.activity
      if (sortMode === 'totalOpen' && a.totalOpen !== b.totalOpen) return b.totalOpen - a.totalOpen
      const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      if (sev !== 0) return sev
      if (a.activity !== b.activity) return b.activity - a.activity
      return b.totalOpen - a.totalOpen
    })
    return rows
  }, [filtered, sortMode])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const selectedInvoice = useMemo(() => {
    if (!selectedInvoiceId) return null
    return getInvoiceById(selectedInvoiceId) ?? invoices.find((inv) => inv.id === selectedInvoiceId) ?? null
  }, [selectedInvoiceId, invoices])

  /** Unread client activity on the open invoice — shown in the panel bar. */
  const selectedActivity = useMemo(() => {
    if (!selectedInvoice) return []
    const client = summaries.find((s) => s.clientId === selectedInvoice.client_id)
    return client?.items.filter((item) => isActivity(item) && item.invoiceId === selectedInvoice.id) ?? []
  }, [selectedInvoice, summaries])

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
  }, [search, category, severityFilter, pageSize, sortMode])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  // Deep-link: ?client= expands that row, ?invoice= opens the invoice
  useEffect(() => {
    const clientId = searchParams.get('client')
    const invoiceId = searchParams.get('invoice')
    if (invoiceId) setSelectedInvoiceId(invoiceId)
    if (!clientId) return
    setExpandedId(clientId)
    const idx = sorted.findIndex((row) => row.clientId === clientId)
    if (idx >= 0) {
      setCurrentPage(Math.floor(idx / pageSize) + 1)
    }
  }, [searchParams, sorted, pageSize])

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (value) params.set(key, value)
          else params.delete(key)
          return params
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const toggleClient = (row: ClientWorkSummary) => {
    const next = expandedId === row.clientId ? null : row.clientId
    setExpandedId(next)
    if (!next) {
      setSelectedInvoiceId(null)
      setParam('invoice', null)
    }
    setParam('client', next)
  }

  const openInvoice = useCallback(
    (invoiceId: string | undefined) => {
      if (!invoiceId) return
      setSelectedInvoiceId(invoiceId)
      setParam('invoice', invoiceId)
    },
    [setParam]
  )

  const closeInvoice = useCallback(() => {
    setSelectedInvoiceId(null)
    setParam('invoice', null)
  }, [setParam])

  const markReviewed = useCallback(
    (items: ClientWorkItem[]) => {
      const activity = items.filter(isActivity)
      if (!activity.length) return
      activity.forEach((item) => markAdminNotificationRead(item.id))
      showToast(
        activity.length === 1 ? 'Marked reviewed' : `${activity.length} updates marked reviewed`,
        'success'
      )
    },
    [showToast]
  )

  const detailOpen = Boolean(selectedInvoice)
  const clientCount = summaries.length
  const activityClients = summaries.filter((s) => s.activity > 0).length

  return (
    <div className={`wq admin-work-queue${detailOpen ? ' wq--detail-open' : ''}`}>
      <div className="wq__main">
        <header className="wq__head">
          <div className="wq__title-block">
            <p className="wq__eyebrow">Operations</p>
            <h1 className="wq__title">Client work queue</h1>
            <p className="wq__sub">
              {clientCount} client{clientCount === 1 ? '' : 's'} with open work
              {categoryTotals.activity > 0 ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="wq__sub-link"
                    onClick={() => setCategory('activity')}
                  >
                    {categoryTotals.activity} new client update
                    {categoryTotals.activity === 1 ? '' : 's'} from {activityClients}
                  </button>
                </>
              ) : null}
            </p>
          </div>

          <div className="wq__tools">
            <label className="wq__search">
              <Search aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search client or invoice"
                aria-label="Search work queue"
              />
            </label>
            <select
              className="wq__select"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
              aria-label="Filter by severity"
            >
              {SEVERITY_FILTERS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="wq__select"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              aria-label="Sort clients"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  Sort: {opt.label}
                </option>
              ))}
            </select>
          </div>
        </header>

        <nav className="wq__chips" aria-label="Filter by type">
          <button
            type="button"
            className={`wq-chip${category === 'all' ? ' wq-chip--active' : ''}`}
            onClick={() => setCategory('all')}
          >
            All <span className="wq-chip__n">{categoryTotals.all}</span>
          </button>
          {CATEGORY_FILTERS.map((chip) => {
            const n = categoryTotals[chip.id]
            const hot = chip.id === 'activity' && n > 0
            return (
              <button
                key={chip.id}
                type="button"
                className={`wq-chip${category === chip.id ? ' wq-chip--active' : ''}${
                  hot ? ' wq-chip--hot' : ''
                }${n === 0 ? ' wq-chip--empty' : ''}`}
                onClick={() => setCategory(chip.id)}
              >
                {hot ? <span className="wq-chip__dot" aria-hidden /> : null}
                {chip.label} <span className="wq-chip__n">{n}</span>
              </button>
            )
          })}
        </nav>

        <section className="wq-card" aria-label="Clients with open work">
          <ul className="wq-list">
            {pageRows.length === 0 ? (
              <li className="wq-empty">
                <Check aria-hidden />
                <strong>Nothing here</strong>
                <span>No clients match these filters.</span>
              </li>
            ) : (
              pageRows.map((row) => (
                <ClientRow
                  key={row.clientId}
                  row={row}
                  open={expandedId === row.clientId}
                  selectedInvoiceId={selectedInvoiceId}
                  onToggle={() => toggleClient(row)}
                  onOpenInvoice={openInvoice}
                  onMarkReviewed={markReviewed}
                />
              ))
            )}
          </ul>

          <footer className="wq-foot">
            <span>
              {pageRows.length ? (currentPage - 1) * pageSize + 1 : 0}–
              {Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
            </span>
            <div className="wq-foot__pager">
              <label>
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="wq__select wq__select--sm"
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
                className="wq-btn"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span>
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="wq-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </footer>
        </section>
      </div>

      {detailOpen && selectedInvoice ? (
        <aside className="wq-panel">
          <div className="wq-panel__bar">
            <div className="wq-panel__id">
              <strong>{selectedInvoice.invoice_number}</strong>
              <span>
                {selectedInvoice.client_name} · {selectedInvoice.broker_name}
              </span>
            </div>
            {selectedActivity.length > 0 ? (
              <button
                type="button"
                className="wq-btn wq-btn--primary"
                onClick={() => markReviewed(selectedActivity)}
              >
                <Check aria-hidden />
                Mark reviewed
              </button>
            ) : null}
            <button type="button" className="wq-btn" onClick={closeInvoice} aria-label="Close invoice">
              <X aria-hidden />
              <span className="wq-btn__label">Close</span>
            </button>
          </div>
          {selectedActivity.length > 0 ? (
            <ul className="wq-panel__activity">
              {selectedActivity.map((item) => (
                <li key={item.id}>
                  <span className="wq-dot" aria-hidden />
                  <span className="wq-panel__activity-copy">
                    <b>{item.label}</b> {item.detail}
                  </span>
                  <time>{formatRelativeTime(item.activityAt)}</time>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="wq-panel__body">
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
  )
}

/** One client: summary line, then its invoice groups when expanded. */
function ClientRow({
  row,
  open,
  selectedInvoiceId,
  onToggle,
  onOpenInvoice,
  onMarkReviewed,
}: {
  row: ClientWorkSummary
  open: boolean
  selectedInvoiceId: string | null
  onToggle: () => void
  onOpenInvoice: (invoiceId: string | undefined) => void
  onMarkReviewed: (items: ClientWorkItem[]) => void
}) {
  const groups = open ? groupClientWorkItemsByInvoice(row.items) : []
  const tags = CATEGORY_FILTERS.filter((c) => row[c.id] > 0).map((c) => {
    const n = row[c.id]
    const [one, many] = CATEGORY_NOUN[c.id]
    return { id: c.id, text: `${n} ${n === 1 ? one : many}` }
  })

  return (
    <li className={`wq-row${open ? ' wq-row--open' : ''}`}>
      <button type="button" className="wq-row__head" onClick={onToggle} aria-expanded={open}>
        <span className={`wq-avatar wq-avatar--${row.severity}`} aria-hidden>
          {initials(row.clientName)}
        </span>
        <span className="wq-row__main">
          <span className="wq-row__name">
            {row.clientName}
            {row.activity > 0 ? (
              <span className="wq-new" title="New client activity">
                {row.activity} new
              </span>
            ) : null}
          </span>
          <span className="wq-row__next" title={row.nextDueLabel}>
            {row.nextDueLabel}
          </span>
        </span>
        <span className="wq-row__tags">
          {tags.map((tag) => (
            <span key={tag.id} className={`wq-tag wq-tag--${tag.id}`}>
              {tag.text}
            </span>
          ))}
        </span>
        <span className="wq-row__meta">
          <span className={`wq-sev wq-sev--${row.severity}`}>{row.severity}</span>
          <span className="wq-row__count">
            <b>{row.totalOpen}</b> open
          </span>
        </span>
        <ChevronDown className="wq-row__chev" aria-hidden />
      </button>

      {open ? (
        <div className="wq-row__body">
          <div className="wq-links">
            <Link to={row.links.invoices}>Invoices</Link>
            <Link to={row.links.paymentPosting}>Payment posting</Link>
            <Link to={row.links.collections}>Collections</Link>
            <Link to={row.links.calendar}>Calendar</Link>
          </div>
          {groups.length === 0 ? (
            <p className="wq-muted">No open items</p>
          ) : (
            <ul className="wq-groups">
              {groups.map((group) => (
                <InvoiceGroupCard
                  key={group.key}
                  group={group}
                  selectedInvoiceId={selectedInvoiceId}
                  onOpenInvoice={onOpenInvoice}
                  onMarkReviewed={onMarkReviewed}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  )
}

/** Invoice (or batch) card inside an expanded client row. */
function InvoiceGroupCard({
  group,
  selectedInvoiceId,
  onOpenInvoice,
  onMarkReviewed,
}: {
  group: ClientWorkInvoiceGroup
  selectedInvoiceId: string | null
  onOpenInvoice: (invoiceId: string | undefined) => void
  onMarkReviewed: (items: ClientWorkItem[]) => void
}) {
  const canOpenInvoice = Boolean(group.invoiceId)
  const active = group.invoiceId != null && group.invoiceId === selectedInvoiceId
  const activity = group.issues.filter(isActivity)

  return (
    <li
      className={`wq-group${active ? ' wq-group--active' : ''}${
        canOpenInvoice ? ' wq-group--clickable' : ''
      }${activity.length ? ' wq-group--new' : ''}`}
      role={canOpenInvoice ? 'button' : undefined}
      tabIndex={canOpenInvoice ? 0 : undefined}
      onClick={() => {
        if (canOpenInvoice) onOpenInvoice(group.invoiceId)
      }}
      onKeyDown={(e) => {
        if (!canOpenInvoice || e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenInvoice(group.invoiceId)
        }
      }}
    >
      <div className="wq-group__head">
        <strong className="wq-group__title">{group.title}</strong>
        <span className={`wq-sev wq-sev--${group.severity}`}>{group.severity}</span>
      </div>
      <ul className="wq-issues">
        {group.issues.map((issue) => (
          <li key={issue.id} className={`wq-issue${isActivity(issue) ? ' wq-issue--new' : ''}`}>
            <span className="wq-issue__kind">
              {isActivity(issue) ? <span className="wq-dot" aria-hidden /> : null}
              {isActivity(issue) ? issue.label : clientWorkIssueLabel(issue.kind)}
              {isActivity(issue) ? (
                <time className="wq-issue__time">{formatRelativeTime(issue.activityAt)}</time>
              ) : null}
            </span>
            <span className="wq-issue__detail">{issue.detail}</span>
          </li>
        ))}
      </ul>
      <div className="wq-group__foot">
        {activity.length ? (
          <button
            type="button"
            className="wq-btn wq-btn--sm"
            onClick={(e) => {
              e.stopPropagation()
              onMarkReviewed(activity)
            }}
          >
            <Check aria-hidden />
            Mark reviewed
          </button>
        ) : null}
        {canOpenInvoice ? (
          <span className="wq-group__open">Open invoice →</span>
        ) : group.batchId ? (
          <Link
            to={`/batches?batch=${encodeURIComponent(group.batchId)}`}
            className="wq-group__open"
            onClick={(e) => e.stopPropagation()}
          >
            Open batch →
          </Link>
        ) : null}
      </div>
    </li>
  )
}
