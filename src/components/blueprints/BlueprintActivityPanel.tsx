import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Package,
  PauseCircle,
  Play,
  Search,
  StopCircle,
  Zap,
} from 'lucide-react'
import {
  BLUEPRINT_RUNS_CHANGED_EVENT,
  BLUEPRINT_RUN_STATUS_LABELS,
  countRunsByStatus,
  filterBlueprintRuns,
  listStoredBlueprintRuns,
  type BlueprintRunRow,
  type BlueprintRunStatus,
  type BlueprintRunStatusFilter,
  type BlueprintRunSubject,
} from './blueprintRuns'
import { tickBlueprintRuns } from './blueprintRunner'
import {
  isBlueprintsRunnerEnabled,
} from '../../config/blueprintsRuntime'
import { useToast } from '../ui/ToastProvider'

type SubjectFilter = 'all' | BlueprintRunSubject

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function StatusIcon({ status }: { status: BlueprintRunStatus }) {
  const props = { size: 14, 'aria-hidden': true as const }
  switch (status) {
    case 'waiting':
      return <Clock {...props} />
    case 'active':
      return <Zap {...props} />
    case 'paused':
      return <PauseCircle {...props} />
    case 'completed':
      return <CheckCircle2 {...props} />
    case 'stopped':
      return <StopCircle {...props} />
  }
}

const STATUS_TABS: { id: BlueprintRunStatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'completed', label: 'Completed' },
  { id: 'stopped', label: 'Stopped' },
]

/** Real enrollments only — demo sample rows carry no subject id. */
function loadRows(): BlueprintRunRow[] {
  return listStoredBlueprintRuns()
    .filter((r) => Boolean(r.subjectId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function matchesQuery(row: BlueprintRunRow, q: string): boolean {
  if (!q) return true
  return [row.subjectLabel, row.clientLabel, row.blueprintName, row.currentStep]
    .some((v) => v?.toLowerCase().includes(q))
}

export default function BlueprintActivityPanel() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<BlueprintRunRow[]>(loadRows)
  const [statusFilter, setStatusFilter] = useState<BlueprintRunStatusFilter>('all')
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>('all')
  const [query, setQuery] = useState('')
  const [tickBusy, setTickBusy] = useState(false)

  useEffect(() => {
    const refresh = () => setRows(loadRows())
    window.addEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, refresh)
  }, [])

  const counts = useMemo(() => countRunsByStatus(rows), [rows])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return filterBlueprintRuns(rows, statusFilter, subjectFilter).filter((r) =>
      matchesQuery(r, q)
    )
  }, [rows, statusFilter, subjectFilter, query])

  const handleTick = async () => {
    if (!isBlueprintsRunnerEnabled()) {
      showToast('Turn automation on first (top right).', 'error')
      return
    }
    setTickBusy(true)
    try {
      const { advanced } = await tickBlueprintRuns('Credyx Blueprint')
      setRows(loadRows())
      showToast(
        advanced > 0
          ? `Advanced ${advanced} waiting run${advanced === 1 ? '' : 's'}.`
          : 'No waiting runs were due.',
        'success'
      )
    } finally {
      setTickBusy(false)
    }
  }

  return (
    <div className="bp-activity">
      <div className="bp-activity__intro">
        <label className="bp-activity__search">
          <Search size={14} aria-hidden />
          <span className="sr-only">Search activity</span>
          <input
            id="bp-activity-search"
            type="search"
            value={query}
            placeholder="Search invoice, client, blueprint, or step"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="admin-blueprints__btn"
          onClick={handleTick}
          disabled={tickBusy}
          title="Move every run whose wait is over to its next step now, instead of waiting for the schedule."
        >
          <Play size={14} aria-hidden />
          {tickBusy ? 'Running…' : 'Run due steps now'}
        </button>
      </div>

      <div className="bp-activity__filters">
        <div className="bp-activity__status-tabs" role="tablist" aria-label="Run status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.id}
              className={`bp-activity__status-tab${statusFilter === tab.id ? ' bp-activity__status-tab--on' : ''}`}
              onClick={() => setStatusFilter(tab.id)}
            >
              {tab.label}
              <span className="bp-activity__count">{counts[tab.id]}</span>
            </button>
          ))}
        </div>
        <div className="bp-activity__subject" role="group" aria-label="Subject">
          {(
            [
              { id: 'all', label: 'All subjects' },
              { id: 'invoice', label: 'Invoices' },
              { id: 'broker', label: 'Brokers' },
              { id: 'batch', label: 'Batches' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`bp-activity__subject-btn${subjectFilter === opt.id ? ' bp-activity__subject-btn--on' : ''}`}
              onClick={() => setSubjectFilter(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bp-activity__table-wrap">
        {visible.length === 0 ? (
          <div className="bp-activity__empty">
            {rows.length === 0
              ? 'Nothing is running yet. When an invoice, broker, or batch starts a blueprint, it shows up here.'
              : 'Nothing matches these filters.'}
          </div>
        ) : (
          <table className="bp-activity__table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Blueprint</th>
                <th>Status</th>
                <th>Current step</th>
                <th>Wake / next</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="bp-activity__subject-cell">
                      <span className="bp-activity__subject-icon" aria-hidden>
                        {row.subject === 'invoice' ? (
                          <FileText size={14} />
                        ) : row.subject === 'batch' ? (
                          <Package size={14} />
                        ) : (
                          <Building2 size={14} />
                        )}
                      </span>
                      <div>
                        {row.subject === 'invoice' && row.subjectId ? (
                          <Link
                            className="bp-activity__subject-name bp-activity__subject-link"
                            to={`/invoices?invoice=${encodeURIComponent(row.subjectId)}`}
                          >
                            {row.subjectLabel}
                          </Link>
                        ) : (
                          <div className="bp-activity__subject-name">{row.subjectLabel}</div>
                        )}
                        <div className="bp-activity__subject-meta">
                          {row.subject === 'invoice'
                            ? 'Invoice'
                            : row.subject === 'batch'
                              ? 'Batch'
                              : 'Broker'}
                          {row.clientLabel ? ` · ${row.clientLabel}` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="bp-activity__bp-name">{row.blueprintName}</span>
                  </td>
                  <td>
                    <span className={`bp-activity__pill bp-activity__pill--${row.status}`}>
                      <StatusIcon status={row.status} />
                      {BLUEPRINT_RUN_STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td>
                    <span className="bp-activity__step">{row.currentStep}</span>
                  </td>
                  <td>
                    {row.status === 'waiting' && row.waitUntil ? (
                      <span className="bp-activity__wake">{formatWhen(row.waitUntil)}</span>
                    ) : (
                      <span className="bp-activity__muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className="bp-activity__muted">{formatWhen(row.updatedAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
