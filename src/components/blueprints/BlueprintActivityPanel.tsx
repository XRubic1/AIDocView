import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  ListTodo,
  Package,
  PauseCircle,
  Play,
  RefreshCw,
  StopCircle,
  Zap,
} from 'lucide-react'
import {
  BLUEPRINT_RUNS_CHANGED_EVENT,
  BLUEPRINT_RUN_STATUS_LABELS,
  countRunsByStatus,
  filterBlueprintRuns,
  listBlueprintRuns,
  resetBlueprintRunsDemo,
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

export default function BlueprintActivityPanel() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<BlueprintRunRow[]>(() => listBlueprintRuns())
  const [statusFilter, setStatusFilter] = useState<BlueprintRunStatusFilter>('all')
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>('all')
  const [tickBusy, setTickBusy] = useState(false)

  useEffect(() => {
    const refresh = () => setRows(listBlueprintRuns())
    window.addEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, refresh)
  }, [])

  const counts = useMemo(() => countRunsByStatus(rows), [rows])
  const visible = useMemo(
    () => filterBlueprintRuns(rows, statusFilter, subjectFilter),
    [rows, statusFilter, subjectFilter]
  )

  const handleResetDemo = () => {
    setRows(resetBlueprintRunsDemo())
  }

  const handleTick = async () => {
    if (!isBlueprintsRunnerEnabled()) {
      showToast('Turn on Live runner first (Blueprints page).', 'error')
      return
    }
    setTickBusy(true)
    try {
      const { advanced } = await tickBlueprintRuns('Credyx Blueprint')
      setRows(listBlueprintRuns())
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
        <div>
          <h2 className="bp-activity__title">
            <ListTodo size={18} aria-hidden />
            Running activity
          </h2>
          <p className="bp-activity__sub">
            Invoices, brokers, and batches enrolled in a blueprint — waiting on a clock, mid-step, or
            finished.
            Live runner writes notes/status only; broker chase emails stay on Run chase.
          </p>
        </div>
        <div className="bp-activity__intro-actions">
          <button
            type="button"
            className="admin-blueprints__btn admin-blueprints__btn--run"
            onClick={handleTick}
            disabled={tickBusy}
          >
            <Play size={14} aria-hidden />
            Run blueprints
          </button>
          <button
            type="button"
            className="admin-blueprints__btn"
            onClick={handleResetDemo}
            title="Reload demo sample runs"
          >
            <RefreshCw size={14} aria-hidden />
            Reset demo
          </button>
        </div>
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
            No runs match these filters. When the engine enrolls an invoice, broker, or batch, it
            will show up here.
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
                        <div className="bp-activity__subject-name">{row.subjectLabel}</div>
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
