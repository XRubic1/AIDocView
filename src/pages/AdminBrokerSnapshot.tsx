import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, RefreshCw, Shield, X } from 'lucide-react'
import {
  applyBrokerSnapshotChange,
  dismissBrokerSnapshotChange,
  listPendingBrokerSnapshotChanges,
  type BrokerSnapshotChangeRow,
} from '../services/brokerSnapshotReviewService'

/** Group pending changes by snapshot / MC for the review board. */
function groupBySnapshot(rows: BrokerSnapshotChangeRow[]) {
  const map = new Map<string, BrokerSnapshotChangeRow[]>()
  for (const row of rows) {
    const key = row.snapshot_id
    const list = map.get(key) ?? []
    list.push(row)
    map.set(key, list)
  }
  return [...map.entries()].map(([snapshotId, changes]) => ({
    snapshotId,
    changes,
    mc: changes[0]?.mc_number ?? '—',
    name: changes[0]?.snapshot?.legal_name ?? changes[0]?.new_value ?? 'Unknown',
    needsAdd: changes.some((c) => c.field_key === 'broker_record'),
    fetchedAt: changes[0]?.snapshot?.fetched_at,
    nextReviewAt: changes[0]?.snapshot?.next_review_at,
  }))
}

/**
 * Credyx admin queue: apply or dismiss BrokerSnapshot field changes one-by-one.
 */
export default function AdminBrokerSnapshot() {
  const [rows, setRows] = useState<BrokerSnapshotChangeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listPendingBrokerSnapshotChanges()
      setRows(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load changes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const groups = useMemo(() => groupBySnapshot(rows), [rows])

  const onApply = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      await applyBrokerSnapshotChange(id)
      await reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Apply failed')
    } finally {
      setBusyId(null)
    }
  }

  const onDismiss = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      await dismissBrokerSnapshotChange(id)
      await reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dismiss failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operations</p>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-sky-600" />
            Broker Snapshot review
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Carrier MC lookups refresh BrokerSnapshot every 30 days (5 days if insurance is weak).
            Apply each field change individually into the Credyx broker directory.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading pending changes…</p>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-900">No pending Snapshot changes</p>
          <p className="text-xs text-slate-500 mt-1">
            When carriers look up MCs and Snapshot differs from Credyx, changes appear here.
          </p>
          <Link to="/brokers" className="text-sm text-sky-600 underline mt-3 inline-block">
            Open broker directory
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section
              key={group.snapshotId}
              className="rounded-xl border border-slate-200 bg-white overflow-hidden"
            >
              <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2 justify-between bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{group.name}</p>
                  <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                    {[
                      group.mc,
                      group.needsAdd ? 'Not in Credyx yet' : null,
                      group.fetchedAt
                        ? `Fetched ${new Date(group.fetchedAt).toLocaleString()}`
                        : null,
                      group.nextReviewAt
                        ? `Next refresh ${new Date(group.nextReviewAt).toLocaleDateString()}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded bg-amber-100 text-amber-800">
                  {group.changes.length} change{group.changes.length === 1 ? '' : 's'}
                </span>
              </header>

              <ul className="divide-y divide-slate-100">
                {group.changes.map((change) => (
                  <li
                    key={change.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {change.field_label}
                      </p>
                      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-[10px] uppercase text-slate-400">Credyx now</p>
                          <p className="text-slate-700 break-words">
                            {change.old_value?.trim() || (
                              <span className="text-slate-400 italic">Empty</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-slate-400">Snapshot</p>
                          <p className="font-medium text-slate-900 break-words">
                            {change.new_value?.trim() || (
                              <span className="text-slate-400 italic">Empty</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === change.id}
                        onClick={() => void onApply(change.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {change.field_key === 'broker_record' ? 'Add broker' : 'Update'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === change.id}
                        onClick={() => void onDismiss(change.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        Dismiss
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
