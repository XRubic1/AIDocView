import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw, Search } from 'lucide-react'
import Spinner from '../components/ui/Spinner'
import { useToast } from '../components/ui/ToastProvider'
import {
  fetchPublicMcChecksForVisitor,
  fetchPublicMcVisitorsAdmin,
  type PublicMcCheckAdminRow,
  type PublicMcVisitorAdminRow,
} from '../services/publicMcVisitorService'
import { formatDate } from '../utils/format'

function formatWhen(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return formatDate(value)
  } catch {
    return value
  }
}

/** Admin: public /MC visitors and the broker checks they ran. */
export default function AdminPublicMcChecks() {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [visitors, setVisitors] = useState<PublicMcVisitorAdminRow[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [checksByVisitor, setChecksByVisitor] = useState<Record<string, PublicMcCheckAdminRow[]>>(
    {}
  )
  const [loadingChecksId, setLoadingChecksId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchPublicMcVisitorsAdmin()
      setVisitors(rows)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load MC visitors', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleVisitor(visitorId: string) {
    if (expandedId === visitorId) {
      setExpandedId(null)
      return
    }
    setExpandedId(visitorId)
    if (checksByVisitor[visitorId]) return

    setLoadingChecksId(visitorId)
    try {
      const checks = await fetchPublicMcChecksForVisitor(visitorId)
      setChecksByVisitor((current) => ({ ...current, [visitorId]: checks }))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load MC checks', 'error')
    } finally {
      setLoadingChecksId(null)
    }
  }

  const filtered = visitors.filter((row) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      row.mc_digits.includes(q.replace(/\D/g, '')) ||
      row.mc_number.toLowerCase().includes(q) ||
      (row.company_name ?? '').toLowerCase().includes(q)
    )
  })

  const totalChecks = visitors.reduce((sum, row) => sum + row.check_count, 0)

  return (
    <div className="client-shell-scroll h-full min-h-0 overflow-y-auto p-5">
      <div className="space-y-5 p-1 md:p-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">MC Checks</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Carriers who unlocked the public /MC site and the broker lookups they ran
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/motus-test"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              MOTUS insurance test
            </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryStat label="Carriers" value={String(visitors.length)} />
          <SummaryStat label="Broker checks" value={String(totalChecks)} />
          <SummaryStat
            label="Avg checks / carrier"
            value={
              visitors.length === 0 ? '0' : (totalChecks / visitors.length).toFixed(1)
            }
          />
        </div>

        <div className="relative max-w-md">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search MC or company"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {loading && visitors.length === 0 ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              No public MC visitors yet
            </p>
            <p className="mt-1 text-sm text-slate-500">
              When a carrier enters their MC on /MC, they will show up here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="dashboard-table dashboard-table--compact w-full">
              <thead>
                <tr>
                  <th className="w-10" />
                  <th>Carrier</th>
                  <th>MC</th>
                  <th>First check</th>
                  <th>Last unlock</th>
                  <th className="text-right">Unlocks</th>
                  <th className="text-right">MC checks</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const open = expandedId === row.id
                  const checks = checksByVisitor[row.id] ?? []
                  return (
                    <Fragment key={row.id}>
                      <tr className="align-middle">
                        <td>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            onClick={() => void toggleVisitor(row.id)}
                            aria-expanded={open}
                            aria-label={open ? 'Hide MC checks' : 'Show MC checks'}
                          >
                            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="font-medium text-slate-900 dark:text-slate-100">
                          {row.company_name || '—'}
                        </td>
                        <td className="tabular-nums">{row.mc_number || `MC-${row.mc_digits}`}</td>
                        <td>{formatWhen(row.first_seen_at)}</td>
                        <td>{formatWhen(row.last_seen_at)}</td>
                        <td className="text-right tabular-nums">{row.unlock_count}</td>
                        <td className="text-right tabular-nums">{row.check_count}</td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={7} className="bg-slate-50 px-4 py-3 dark:bg-slate-950/50">
                            {loadingChecksId === row.id ? (
                              <div className="flex justify-center py-4">
                                <Spinner />
                              </div>
                            ) : checks.length === 0 ? (
                              <p className="text-sm text-slate-500">
                                No broker MC checks yet for this carrier.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                <table className="dashboard-table dashboard-table--compact w-full">
                                  <thead>
                                    <tr>
                                      <th>When</th>
                                      <th>Type</th>
                                      <th>Looked up</th>
                                      <th>Company</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {checks.map((check) => (
                                      <tr key={check.id}>
                                        <td>{formatWhen(check.created_at)}</td>
                                        <td>{check.search_kind}</td>
                                        <td className="tabular-nums">
                                          {check.searched_label ||
                                            `${check.search_kind}-${check.searched_digits}`}
                                        </td>
                                        <td>{check.company_name || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {value}
      </p>
    </div>
  )
}
