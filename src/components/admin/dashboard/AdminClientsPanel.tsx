import { useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Search, Users } from 'lucide-react'
import { formatCurrency, formatRelativeTime } from '../../../utils/format'
import {
  sortAdminClientRows,
  type AdminClientRow,
  type AdminClientSort,
  type ClientHealth,
} from '../../../utils/adminClientOverview'

const SORT_TABS: Array<{ id: AdminClientSort; label: string }> = [
  { id: 'attention', label: 'Needs attention' },
  { id: 'open_ar', label: 'Largest A/R' },
  { id: 'overdue', label: 'Most overdue' },
  { id: 'name', label: 'A–Z' },
]

export const HEALTH_LABEL: Record<ClientHealth, string> = {
  at_risk: 'At risk',
  watch: 'Watch',
  healthy: 'Healthy',
  idle: 'No activity',
}

function initials(name: string): string {
  const parts = name.replace(/[^a-z0-9 ]/gi, ' ').trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function overdueColor(pct: number): string {
  if (pct >= 40) return 'var(--adb-danger)'
  if (pct >= 15) return 'var(--adb-warning)'
  return 'var(--adb-success)'
}

interface AdminClientsPanelProps {
  rows: AdminClientRow[]
  onOpenClient: (clientId: string) => void
  onViewAll: () => void
}

export function AdminClientsPanel({ rows, onOpenClient, onViewAll }: AdminClientsPanelProps) {
  const [sort, setSort] = useState<AdminClientSort>('attention')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows
    return sortAdminClientRows(filtered, sort)
  }, [rows, sort, query])

  const atRisk = rows.filter((r) => r.health === 'at_risk').length

  return (
    <section className="adb-card adb-clients" aria-label="Clients">
      <header className="adb-card__head">
        <h2 className="adb-card__title">
          <Users size={16} aria-hidden />
          Clients
          <span className="adb-card__count">{rows.length}</span>
          {atRisk > 0 ? (
            <span className="adb-card__count adb-card__count--danger">{atRisk} at risk</span>
          ) : null}
        </h2>
        <button type="button" className="adb-card__link" onClick={onViewAll}>
          Manage clients <ArrowRight size={13} aria-hidden />
        </button>
      </header>

      <div className="adb-clients__toolbar">
        <div className="adb-tabs" role="tablist" aria-label="Sort clients">
          {SORT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={sort === tab.id}
              className={`adb-tab${sort === tab.id ? ' is-active' : ''}`}
              onClick={() => setSort(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label className="adb-search">
          <Search aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients"
            aria-label="Search clients"
          />
        </label>
      </div>

      <div className="adb-table-wrap">
        {visible.length === 0 ? (
          <div className="adb-empty">
            <CheckCircle2 aria-hidden />
            <strong>{rows.length === 0 ? 'No clients yet' : 'No matching clients'}</strong>
            <span>{rows.length === 0 ? 'Create a client to start tracking A/R.' : 'Try a different search.'}</span>
          </div>
        ) : (
          <table className="adb-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Health</th>
                <th className="num">Open A/R</th>
                <th className="num">31+ days</th>
                <th className="num adb-col-hide-sm">Collected 30d</th>
                <th className="adb-col-hide-sm">Open work</th>
                <th className="adb-col-hide-md">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.clientId}
                  className="adb-row"
                  tabIndex={0}
                  onClick={() => onOpenClient(row.clientId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpenClient(row.clientId)
                    }
                  }}
                >
                  <td>
                    <div className="adb-client">
                      <span className="adb-avatar" aria-hidden>
                        {initials(row.name)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="adb-client__name" title={row.name}>
                          {row.name}
                        </div>
                        <div className="adb-client__meta">
                          <span className={`adb-tag${row.tier === 'managed' ? ' adb-tag--blue' : ''}`}>
                            {row.tier === 'managed' ? 'Managed' : 'Self-service'}
                          </span>
                          {row.status !== 'active' ? (
                            <span className="adb-tag adb-tag--warn">{row.status}</span>
                          ) : null}
                          {row.subscription === 'past_due' ? (
                            <span className="adb-tag adb-tag--danger">Past due</span>
                          ) : null}
                          {row.setupGaps.length > 0 ? (
                            <span className="adb-tag adb-tag--warn" title="Profile setup incomplete">
                              Setup {row.setupGaps.length}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`adb-health adb-health--${row.health}`}>{HEALTH_LABEL[row.health]}</span>
                  </td>
                  <td className="num">
                    {row.openAr > 0 ? (
                      <>
                        <div style={{ fontWeight: 650 }}>{formatCurrency(row.openAr)}</div>
                        <div className="adb-client__meta" style={{ justifyContent: 'flex-end' }}>
                          {row.openInvoices} invoice{row.openInvoices === 1 ? '' : 's'}
                        </div>
                      </>
                    ) : (
                      <span className="adb-muted">—</span>
                    )}
                  </td>
                  <td className="num">
                    {row.overdueAr > 0 ? (
                      <>
                        <div style={{ fontWeight: 600, color: overdueColor(row.overduePct) }}>
                          {formatCurrency(row.overdueAr)}
                        </div>
                        <div className="adb-mini-bar" title={`${row.overduePct}% of open A/R`}>
                          <span
                            style={{
                              width: `${Math.max(4, row.overduePct)}%`,
                              background: overdueColor(row.overduePct),
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <span className="adb-muted">—</span>
                    )}
                  </td>
                  <td className="num adb-col-hide-sm">
                    {row.collected30d > 0 ? formatCurrency(row.collected30d) : <span className="adb-muted">—</span>}
                  </td>
                  <td className="adb-col-hide-sm">
                    {row.workOpen > 0 ? (
                      <div className="adb-work">
                        {row.disputes > 0 ? (
                          <span className="adb-tag adb-tag--danger">{row.disputes} dispute{row.disputes === 1 ? '' : 's'}</span>
                        ) : null}
                        {row.holds > 0 ? <span className="adb-tag adb-tag--warn">{row.holds} on hold</span> : null}
                        <span className="adb-tag adb-tag--blue" title={row.nextWork}>
                          {row.workOpen} open
                        </span>
                      </div>
                    ) : (
                      <span className="adb-tag adb-tag--success">Clear</span>
                    )}
                  </td>
                  <td className="adb-col-hide-md" style={{ color: 'var(--adb-muted)', whiteSpace: 'nowrap' }}>
                    {row.lastActivityAt ? formatRelativeTime(row.lastActivityAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
