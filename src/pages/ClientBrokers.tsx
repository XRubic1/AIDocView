import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Building2,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  CircleDot,
  Shield,
} from 'lucide-react'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import ClientListTd from '../components/client/ClientListTd'
import BrokerPayRatingBadge from '../components/client/BrokerPayRatingBadge'
import BrokerRiskLevelChip from '../components/client/BrokerRiskLevelChip'
import BrokerDetailPanel from '../components/client/BrokerDetailPanel'
import { useClientSession } from '../hooks/useClientSession'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useClientTheme } from '../theme/ThemeContext'
import { getClientInvoices, getClientPayments } from '../data/clientDemoData'
import type { Payment } from '../types/payment'
import type { Invoice } from '../types/invoice'
import type { BrokerPayRating } from '../types/clientBroker'
import { formatCurrency } from '../utils/format'
import {
  buildClientBrokerDirectory,
  findBrokerByMc,
  lookupBrokerByMc,
  normalizeMcQuery,
} from '../utils/clientBrokers'
import { normalizeBrokerNameKey } from '../utils/brokerRiskPolicy'
import McLookupModal from '../components/client/McLookupModal'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'

type BrokerSortField =
  | 'broker_name'
  | 'mc_number'
  | 'rating'
  | 'risk_level'
  | 'payment_terms'
  | 'avg_days_to_pay'
  | 'open_invoices'
  | 'open_ar'
  | 'collection_rate'

const RATING_ORDER: Record<BrokerPayRating, number> = { red: 0, yellow: 1, green: 2 }
const RISK_ORDER: Record<string, number> = { high: 0, medium: 1, unrated: 2, low: 3 }

function buildClientInvoices(clientId: string, clientName: string): Invoice[] {
  return getClientInvoices(clientId, clientName)
}

function buildClientPayments(clientId: string, clientName: string): Payment[] {
  return getClientPayments(clientId, clientName)
}

export default function ClientBrokers() {
  const c = useClientTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { clientId, clientName } = useClientSession()
  const tenantRevision = useTenantDataRevision()
  const [notesRefreshKey, setNotesRefreshKey] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [ratingFilter, setRatingFilter] = useState<BrokerPayRating | 'all'>('all')
  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<BrokerSortField>('rating')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [mcLookupOpen, setMcLookupOpen] = useState(false)
  const [mcLookupInitial, setMcLookupInitial] = useState('')

  /** Open Aging A/R filtered to this broker. */
  const goToAgingForBroker = useCallback(
    (brokerName: string) => {
      navigate(`/client/collections?broker=${encodeURIComponent(brokerName)}`)
    },
    [navigate]
  )

  const invoices = useMemo(
    () => buildClientInvoices(clientId, clientName),
    [clientId, clientName]
  )
  const payments = useMemo(() => buildClientPayments(clientId, clientName), [clientId, clientName])

  const directory = useMemo(
    () => buildClientBrokerDirectory(clientId, invoices, payments),
    [clientId, invoices, payments, notesRefreshKey, tenantRevision]
  )

  const mcQuery = normalizeMcQuery(searchTerm)
  const mcLookup = useMemo(() => {
    if (!mcQuery || mcQuery.length < 4) return null
    return lookupBrokerByMc(clientId, searchTerm, invoices, payments)
  }, [clientId, searchTerm, mcQuery, invoices, payments, notesRefreshKey])

  const catalogBroker = useMemo(() => {
    if (!mcQuery || mcQuery.length < 4) return undefined
    return findBrokerByMc(searchTerm)
  }, [searchTerm, mcQuery, tenantRevision])

  const mcNotFound = mcQuery.length >= 4 && !catalogBroker
  const suggestAuthorityLookup =
    Boolean(mcQuery) &&
    mcQuery.replace(/\D/g, '').length >= 4 &&
    (mcNotFound ||
      (mcLookup != null && (mcLookup.is_new || !mcLookup.has_worked_with_client)) ||
      (catalogBroker != null && mcLookup == null))

  const openMcLookup = useCallback(
    (prefill?: string) => {
      const fromArg = prefill?.trim()
      const fromSearch = mcQuery.replace(/\D/g, '').length >= 4 ? mcQuery : ''
      setMcLookupInitial(fromArg || fromSearch)
      setMcLookupOpen(true)
    },
    [mcQuery]
  )

  const ratingCounts = useMemo(() => {
    const counts = { green: 0, yellow: 0, red: 0 }
    for (const b of directory) counts[b.rating] += 1
    return counts
  }, [directory])

  const filteredBrokers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return directory.filter((b) => {
      const matchesRating = ratingFilter === 'all' || b.rating === ratingFilter
      if (!term) return matchesRating
      const matchesSearch =
        b.broker_name.toLowerCase().includes(term) ||
        (b.mc_number?.toLowerCase().includes(term) ?? false) ||
        normalizeMcQuery(term) === b.mc_number?.toUpperCase()
      return matchesRating && matchesSearch
    })
  }, [directory, searchTerm, ratingFilter])

  const sortedBrokers = useMemo(() => {
    const sorted = [...filteredBrokers]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'broker_name':
          cmp = a.broker_name.localeCompare(b.broker_name)
          break
        case 'mc_number':
          cmp = (a.mc_number ?? '').localeCompare(b.mc_number ?? '')
          break
        case 'rating':
          cmp = RATING_ORDER[a.rating] - RATING_ORDER[b.rating]
          break
        case 'risk_level':
          cmp =
            (RISK_ORDER[a.risk?.risk_level ?? 'unrated'] ?? 9) -
            (RISK_ORDER[b.risk?.risk_level ?? 'unrated'] ?? 9)
          break
        case 'avg_days_to_pay':
          cmp = (a.score?.avg_days_to_pay ?? 999) - (b.score?.avg_days_to_pay ?? 999)
          break
        case 'payment_terms':
          cmp = (a.payment_terms_days ?? 9999) - (b.payment_terms_days ?? 9999)
          break
        case 'open_invoices':
          cmp = (a.score?.open_invoices ?? 0) - (b.score?.open_invoices ?? 0)
          break
        case 'open_ar':
          cmp = (a.score?.open_ar ?? 0) - (b.score?.open_ar ?? 0)
          break
        case 'collection_rate':
          cmp = (a.score?.collection_rate ?? 0) - (b.score?.collection_rate ?? 0)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredBrokers, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedBrokers.length / pageSize))
  const pageStart = sortedBrokers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, sortedBrokers.length)
  const paginatedBrokers = sortedBrokers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  const selectedBroker = directory.find((b) => b.broker_id === selectedBrokerId) ?? null

  /** Deep-link from invoice details: /client/brokers?broker=<id or name> */
  useEffect(() => {
    const raw = searchParams.get('broker')?.trim()
    if (!raw || directory.length === 0) return
    const nameKey = normalizeBrokerNameKey(raw)
    const match = directory.find(
      (b) =>
        b.broker_id === raw ||
        b.broker_name === raw ||
        normalizeBrokerNameKey(b.broker_name) === nameKey
    )
    if (match) setSelectedBrokerId(match.broker_id)
  }, [searchParams, directory])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, ratingFilter, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const handleSort = useCallback((field: BrokerSortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir(field === 'broker_name' || field === 'mc_number' ? 'asc' : 'desc')
      return field
    })
  }, [])

  const handleNotesChange = useCallback(() => {
    setNotesRefreshKey((k) => k + 1)
  }, [])

  const inputCompactStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  return (
    <>
      <div className="client-brokers-page overflow-hidden flex flex-col min-h-0">
        <section
          className="client-stat-strip grid grid-cols-2 lg:grid-cols-4 border-b shrink-0"
          style={{ borderColor: c.border }}
        >
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b sm:border-b-0"
            style={{ backgroundColor: c.stat.slate, borderColor: c.border }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: c.secondary }} />
              <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                Brokers tracked
              </span>
            </div>
            <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
              {directory.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRatingFilter(ratingFilter === 'green' ? 'all' : 'green')}
            className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b lg:border-b-0 text-left transition-opacity hover:opacity-90"
            style={{
              backgroundColor: ratingFilter === 'green' ? '#D1FAE5' : c.stat.green,
              borderColor: c.border,
            }}
          >
            <span className="text-xs font-medium" style={{ color: c.success }}>
              Reliable payers
            </span>
            <span className="text-lg font-bold tabular-nums" style={{ color: c.success }}>
              {ratingCounts.green}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRatingFilter(ratingFilter === 'yellow' ? 'all' : 'yellow')}
            className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b sm:border-b-0 text-left transition-opacity hover:opacity-90"
            style={{
              backgroundColor: ratingFilter === 'yellow' ? '#FEF3C7' : c.stat.amber,
              borderColor: c.border,
            }}
          >
            <span className="text-xs font-medium" style={{ color: c.warning }}>
              Watch list
            </span>
            <span className="text-lg font-bold tabular-nums" style={{ color: c.warning }}>
              {ratingCounts.yellow}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRatingFilter(ratingFilter === 'red' ? 'all' : 'red')}
            className="flex items-center justify-between gap-2 px-4 py-2.5 text-left transition-opacity hover:opacity-90"
            style={{
              backgroundColor: ratingFilter === 'red' ? c.stat.redActive : c.stat.red,
              borderColor: c.border,
            }}
          >
            <span className="text-xs font-medium" style={{ color: c.error }}>
              Slow / risk
            </span>
            <span className="text-lg font-bold tabular-nums" style={{ color: c.error }}>
              {ratingCounts.red}
            </span>
          </button>
        </section>

        <div
          className="client-page-toolbar px-4 py-2 border-b shrink-0"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="flex-1 relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: c.secondary }}
              />
              <input
                type="text"
                placeholder="Search by broker name or MC number…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="client-input w-full pl-8"
                style={inputCompactStyle}
              />
            </div>
            <button
              type="button"
              onClick={() => openMcLookup()}
              className="dashboard-btn-secondary text-xs py-1.5 px-3 shrink-0 inline-flex items-center justify-center gap-1.5"
            >
              <Shield className="w-3.5 h-3.5" />
              MC Lookup
            </button>
            {ratingFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setRatingFilter('all')}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg border shrink-0"
                style={{ borderColor: c.border, color: c.secondary }}
              >
                Clear rating filter
              </button>
            )}
          </div>

          {mcLookup && (
            <div
              className="broker-mc-lookup mt-2 p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center gap-3"
              style={{ borderColor: c.border, backgroundColor: c.stat.blue }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.info }}>
                  MC lookup — {mcLookup.mc_number}
                </p>
                <p className="text-sm font-bold mt-0.5" style={{ color: c.primary }}>
                  {mcLookup.broker_name}
                </p>
                <p className="text-xs mt-1" style={{ color: c.secondary }}>
                  {mcLookup.has_worked_with_client
                    ? 'You have payment history with this broker.'
                    : 'In Credyx network — no loads with you yet.'}
                  {mcLookup.payment_terms_days != null &&
                    ` Net ${mcLookup.payment_terms_days} terms.`}
                </p>
              </div>
              <BrokerPayRatingBadge rating={mcLookup.rating} />
              {(mcLookup.is_new || !mcLookup.has_worked_with_client) && mcLookup.mc_number && (
                <button
                  type="button"
                  onClick={() => openMcLookup(mcLookup.mc_number ?? undefined)}
                  className="dashboard-btn-secondary text-xs py-1.5 px-3 shrink-0 inline-flex items-center gap-1"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Authority
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedBrokerId(mcLookup.broker_id)}
                className="dashboard-btn-primary text-xs py-1.5 px-3 shrink-0"
              >
                View profile
              </button>
            </div>
          )}

          {suggestAuthorityLookup && !mcLookup && (
            <div
              className="broker-mc-lookup mt-2 p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center gap-3"
              style={{
                borderColor: c.border,
                backgroundColor: mcNotFound ? c.stat.amber : c.stat.blue,
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: c.primary }}>
                  {mcNotFound
                    ? `MC ${mcQuery} not found in Credyx network`
                    : `MC ${normalizeMcQuery(catalogBroker?.mc_number ?? mcQuery)} — limited Credyx history`}
                </p>
                <p className="text-xs mt-1" style={{ color: c.secondary }}>
                  Open MC Lookup for full authority, fleet, and insurance details from BrokerSnapshot.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  openMcLookup(catalogBroker?.mc_number ?? mcQuery)
                }
                className="dashboard-btn-primary text-xs py-1.5 px-3 shrink-0 inline-flex items-center gap-1.5"
              >
                <Shield className="w-3.5 h-3.5" />
                MC Lookup
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col flex-1 min-w-0 min-h-0">
            <div className="client-table-scroll flex-1 min-h-0 overflow-auto">
              <table className="dashboard-table dashboard-table--compact w-full">
                <thead>
                  <tr>
                    <ClientSortableHeader
                      field="broker_name"
                      label="Broker"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="mc_number"
                      label="MC #"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="hidden md:table-cell"
                    />
                    <ClientSortableHeader
                      field="rating"
                      label="Pay rating"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="risk_level"
                      label="Broker risk"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ClientSortableHeader
                      field="payment_terms"
                      label="Net"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right hidden sm:table-cell"
                      align="right"
                    />
                    <ClientSortableHeader
                      field="avg_days_to_pay"
                      label="Avg pay (you)"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right hidden sm:table-cell"
                      align="right"
                    />
                    <ClientSortableHeader
                      field="open_invoices"
                      label="Open invoices"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right"
                      align="right"
                    />
                    <ClientSortableHeader
                      field="open_ar"
                      label="Your open A/R"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right"
                      align="right"
                    />
                    <ClientSortableHeader
                      field="collection_rate"
                      label="Paid (you)"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-right hidden lg:table-cell"
                      align="right"
                    />
                    <th className="text-center w-16">Notes</th>
                    <th className="text-center w-14">View</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBrokers.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center py-10 text-sm" style={{ color: c.secondary }}>
                        {directory.length === 0
                          ? 'No brokers with invoices yet'
                          : 'No brokers match your search'}
                      </td>
                    </tr>
                  ) : (
                    paginatedBrokers.map((broker) => (
                      <tr
                        key={broker.broker_id}
                        className={`cursor-pointer ${selectedBrokerId === broker.broker_id ? 'batch-highlight-row' : ''}`}
                        onClick={() => goToAgingForBroker(broker.broker_name)}
                        title="Open Aging A/R for this broker"
                      >
                        <ClientListTd variant="primary" className="font-semibold">
                          <span className="inline-flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="truncate">{broker.broker_name}</span>
                            {broker.is_new && (
                              <span
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                                style={{ backgroundColor: c.stat.slate, color: c.mutedLight }}
                              >
                                NEW
                              </span>
                            )}
                          </span>
                        </ClientListTd>
                        <ClientListTd variant="desktop" label="MC#" style={{ color: c.secondary }}>
                          {broker.mc_number ?? '—'}
                        </ClientListTd>
                        <ClientListTd variant="status">
                          <BrokerPayRatingBadge rating={broker.rating} size="sm" />
                        </ClientListTd>
                        <ClientListTd variant="status">
                          {broker.risk ? (
                            <BrokerRiskLevelChip level={broker.risk.risk_level} size="sm" />
                          ) : (
                            <span style={{ color: c.mutedLight }}>—</span>
                          )}
                        </ClientListTd>
                        <ClientListTd
                          variant="desktop"
                          label="Net"
                          className="text-right tabular-nums"
                          style={{ color: c.secondary }}
                        >
                          {broker.payment_terms_days != null && broker.payment_terms_days > 0
                            ? `Net ${broker.payment_terms_days}`
                            : '—'}
                        </ClientListTd>
                        <ClientListTd
                          variant="desktop"
                          label="Avg pay (you)"
                          className="text-right tabular-nums"
                          style={{ color: c.secondary }}
                        >
                          {broker.score?.avg_days_invoice_to_pay != null
                            ? `${broker.score.avg_days_invoice_to_pay}d`
                            : broker.score?.avg_days_to_pay != null
                              ? `${broker.score.avg_days_to_pay}d`
                              : '—'}
                        </ClientListTd>
                        <ClientListTd
                          variant="amount"
                          className="text-right tabular-nums font-medium"
                          style={{ color: c.primary }}
                        >
                          {broker.score?.open_invoices ?? 0}
                        </ClientListTd>
                        <ClientListTd variant="amount" className="text-right font-medium tabular-nums">
                          {broker.score ? formatCurrency(broker.score.open_ar) : '—'}
                        </ClientListTd>
                        <ClientListTd
                          variant="desktop"
                          label="Paid (you)"
                          className="text-right tabular-nums"
                          style={{ color: c.secondary }}
                        >
                          {broker.score && broker.score.invoiced_in_range > 0
                            ? `${broker.score.collection_rate.toFixed(0)}%`
                            : '—'}
                        </ClientListTd>
                        <ClientListTd variant="actions" className="text-center">
                          {broker.notes.length > 0 ? (
                            <span
                              className="inline-flex items-center gap-0.5 text-xs font-medium"
                              style={{ color: c.warning }}
                            >
                              <CircleDot className="w-3 h-3" />
                              {broker.notes.length}
                            </span>
                          ) : (
                            <span style={{ color: c.mutedLight }}>—</span>
                          )}
                        </ClientListTd>
                        <ClientListTd variant="actions" className="text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedBrokerId(broker.broker_id)
                            }}
                            className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
                            style={{ color: c.info }}
                            title="View broker profile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </ClientListTd>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div
              className="client-page-footer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-t shrink-0"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <p className="text-xs font-medium" style={{ color: c.secondary }}>
                Showing {pageStart}–{pageEnd} of {sortedBrokers.length}
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
          </div>

          {selectedBroker && (
            <BrokerDetailPanel
              broker={selectedBroker}
              clientId={clientId}
              onClose={() => setSelectedBrokerId(null)}
              onNotesChange={handleNotesChange}
            />
          )}
        </div>
      </div>

      <McLookupModal
        open={mcLookupOpen}
        initialMc={mcLookupInitial}
        onClose={() => setMcLookupOpen(false)}
      />
    </>
  )
}
