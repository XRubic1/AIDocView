import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitBranch,
  Maximize2,
  Minimize2,
  PauseCircle,
  PlayCircle,
  StopCircle,
  Zap,
} from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import { getSavedBlueprint, listSavedBlueprints } from './blueprintStore'
import {
  BLUEPRINT_RUN_STATUS_LABELS,
  BLUEPRINT_RUNS_CHANGED_EVENT,
  clearInvoiceBlueprintHistory,
  getPrimaryRunForInvoice,
  listInvoiceBlueprintHistory,
  startInvoiceRun,
  type BlueprintRunHistoryKind,
  type BlueprintRunRow,
  type BlueprintRunStatus,
} from './blueprintRuns'
import {
  assignInvoiceBlueprint,
  clearInvoiceBlueprintAssignment,
  getInvoiceBlueprintAssignment,
} from './invoiceBlueprintAssignment'
import {
  findFirstWaitNodeId,
  getUpcomingStepsForInvoiceRun,
  type UpcomingStepKind,
} from './blueprintUpcomingSteps'
import { formatCatalogCardLine, lookupWaitUntilById } from './blueprintCatalog'
import {
  enrollInvoiceIfNeeded,
  rerunInvoiceBlueprint,
} from './blueprintRunner'
import {
  isBlueprintsRunnerEnabled,
} from '../../config/blueprintsRuntime'
import InvoiceBlueprintDebug from './InvoiceBlueprintDebug'
import BlueprintRunDashboard from './BlueprintRunDashboard'
import '../../styles/blueprintRunDashboard.css'
import '../../styles/invoiceBlueprintTab.css'
import '../../styles/documentViewer.css'

type HealthKind = 'ok' | 'attention' | 'idle' | 'none'

function formatWhen(iso: string | null | undefined): string {
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

function healthFromRun(run: BlueprintRunRow | null, hasAssignment: boolean): {
  kind: HealthKind
  label: string
  detail: string
} {
  if (!run && !hasAssignment) {
    return {
      kind: 'none',
      label: 'Not assigned',
      detail: 'Pick a blueprint below so this invoice can enroll when the runner is live.',
    }
  }
  if (!run && hasAssignment) {
    return {
      kind: 'idle',
      label: 'Assigned · not running',
      detail: 'Blueprint is set, but there is no active enrollment yet.',
    }
  }
  if (!run) {
    return { kind: 'none', label: 'Not assigned', detail: '' }
  }
  switch (run.status) {
    case 'waiting':
      if (/no broker email/i.test(run.currentStep)) {
        return {
          kind: 'attention',
          label: 'Needs a broker email',
          detail:
            'The packet did not send. Add an accounting or paperwork email on the broker. This step tries again in one hour.',
        }
      }
      if (/no carrier email/i.test(run.currentStep)) {
        return {
          kind: 'attention',
          label: 'Needs a carrier email',
          detail: 'The carrier notice did not send. Add an email on the carrier. This step tries again in one hour.',
        }
      }
      return {
        kind: 'ok',
        label: 'On track',
        detail: run.waitUntil
          ? `Waiting until ${formatWhen(run.waitUntil)}.`
          : 'Waiting on a clock.',
      }
    case 'active':
      return {
        kind: 'ok',
        label: 'In progress',
        detail: 'A Then-do step is current — runner would act on the next tick.',
      }
    case 'paused':
      return {
        kind: 'attention',
        label: 'Needs attention',
        detail: 'Run is paused (claim, stop-chase, or missing packet).',
      }
    case 'completed':
      return {
        kind: 'ok',
        label: 'Completed',
        detail: 'This enrollment finished successfully.',
      }
    case 'stopped':
      return {
        kind: 'ok',
        label: 'Stopped',
        detail: 'Run ended early (for example paid or force-closed).',
      }
  }
}

function StatusGlyph({ status }: { status: BlueprintRunStatus }) {
  const props = { size: 15, 'aria-hidden': true as const }
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

function stepKindLabel(kind: UpcomingStepKind): string {
  switch (kind) {
    case 'wait':
      return 'Wait'
    case 'when':
      return 'When'
    case 'action':
      return 'Then do'
    case 'done':
      return 'Done'
    case 'start':
      return 'Start'
    default:
      return 'Step'
  }
}

function historyKindLabel(kind: BlueprintRunHistoryKind): string {
  switch (kind) {
    case 'enrolled':
      return 'Start'
    case 'wait':
      return 'Wait'
    case 'when':
      return 'When'
    case 'action':
      return 'Do'
    case 'advance':
      return 'Next'
    case 'paused':
      return 'Paused'
    case 'completed':
      return 'Done'
    case 'stopped':
      return 'Stopped'
    default:
      return 'Note'
  }
}

type BlueprintTab = 'overview' | 'steps' | 'debug' | 'history'

const TABS: Array<{ id: BlueprintTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'steps', label: 'Next steps' },
  { id: 'debug', label: 'Debug' },
  { id: 'history', label: 'History' },
]

interface InvoiceBlueprintPanelProps {
  invoice: Invoice
}

export default function InvoiceBlueprintPanel({ invoice }: InvoiceBlueprintPanelProps) {
  const blueprints = useMemo(() => listSavedBlueprints(), [])
  const [assignment, setAssignment] = useState(() =>
    getInvoiceBlueprintAssignment(invoice.id)
  )
  const [run, setRun] = useState(() => getPrimaryRunForInvoice(invoice))
  const [history, setHistory] = useState(() => listInvoiceBlueprintHistory(invoice))
  const [rerunBusy, setRerunBusy] = useState(false)
  const [rerunMsg, setRerunMsg] = useState<string | null>(null)
  const [rerunConfirm, setRerunConfirm] = useState(false)
  const [tab, setTab] = useState<BlueprintTab>('overview')
  const [full, setFull] = useState(false)
  const [showMore, setShowMore] = useState(false)

  useEffect(() => {
    const refresh = () => {
      setAssignment(getInvoiceBlueprintAssignment(invoice.id))
      setRun(getPrimaryRunForInvoice(invoice))
      setHistory(listInvoiceBlueprintHistory(invoice))
    }
    refresh()
    window.addEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, refresh)
  }, [invoice.id, invoice])

  const liveRun =
    run &&
    (run.status === 'waiting' || run.status === 'active' || run.status === 'paused')
      ? run
      : null

  // Never treat a finished hold (or any) run as the current assignment
  const effectiveBlueprintId = assignment?.blueprintId ?? liveRun?.blueprintId ?? ''
  const effectiveBlueprintName =
    assignment?.blueprintName ?? liveRun?.blueprintName ?? ''

  const health = healthFromRun(run, Boolean(assignment || liveRun))
  const runnerOn = isBlueprintsRunnerEnabled()

  const upcoming = useMemo(() => {
    if (!liveRun) return []
    return getUpcomingStepsForInvoiceRun({
      blueprintId: effectiveBlueprintId || liveRun.blueprintId,
      currentNodeId: liveRun.currentNodeId,
      currentStep: liveRun.currentStep,
    })
  }, [liveRun, effectiveBlueprintId])

  // Esc leaves full screen; lock page scroll while it is open.
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [full])

  const handleAssign = (blueprintId: string) => {
    if (!blueprintId) {
      clearInvoiceBlueprintAssignment(invoice.id)
      setAssignment(null)
      return
    }
    const bp = blueprints.find((b) => b.id === blueprintId)
    const name = bp?.name ?? 'Untitled blueprint'
    setAssignment(assignInvoiceBlueprint(invoice.id, blueprintId, name))
  }

  const handleRerun = async () => {
    if (rerunBusy) return
    setRerunConfirm(false)
    setRerunBusy(true)
    setRerunMsg(null)
    try {
      const log = await rerunInvoiceBlueprint(invoice.id)
      setRerunMsg(log.ok ? `Rerun started. ${log.detail}` : `Could not rerun: ${log.detail}`)
    } catch (err) {
      setRerunMsg(err instanceof Error ? err.message : 'Could not rerun this blueprint.')
    } finally {
      setRerunBusy(false)
      setAssignment(getInvoiceBlueprintAssignment(invoice.id))
      setRun(getPrimaryRunForInvoice(invoice))
      setHistory(listInvoiceBlueprintHistory(invoice))
    }
  }

  const handleStartEnrollment = () => {
    const bpId = effectiveBlueprintId || blueprints[0]?.id
    const bpName =
      effectiveBlueprintName || blueprints[0]?.name || 'Untitled blueprint'
    if (!bpId) return
    if (!assignment) {
      setAssignment(assignInvoiceBlueprint(invoice.id, bpId, bpName))
    }
    if (runnerOn) {
      void enrollInvoiceIfNeeded(invoice, 'manual start').then(() => {
        setRun(getPrimaryRunForInvoice(invoice))
      })
      return
    }
    const saved = getSavedBlueprint(bpId)
    const waitNodeId = saved
      ? findFirstWaitNodeId(saved.nodes, saved.edges)
      : undefined
    const waitNode = waitNodeId
      ? saved?.nodes.find((n) => n.id === waitNodeId)
      : undefined
    const wait = waitNode
      ? lookupWaitUntilById(waitNode.data.waitUntilId)
      : undefined
    const stepLine = waitNode
      ? wait
        ? formatCatalogCardLine(wait, waitNode.data.days, waitNode.data.waitUnit)
        : waitNode.data.fieldKey || 'Wait until…'
      : undefined
    const waitDays = Number(waitNode?.data.days) || 5
    setRun(
      startInvoiceRun({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        clientLabel: invoice.client_name,
        blueprintId: bpId,
        blueprintName: bpName,
        waitDays,
        currentNodeId: waitNodeId ?? undefined,
        currentStep: stepLine ? `Wait until · ${stepLine}` : undefined,
      })
    )
  }

  const overviewBlock = (
    <>
      <div className={`inv-bp__health inv-bp__health--${health.kind}`}>
        <div className="inv-bp__health-icon" aria-hidden>
          {health.kind === 'attention' ? (
            <AlertTriangle size={18} />
          ) : health.kind === 'ok' ? (
            <CheckCircle2 size={18} />
          ) : health.kind === 'idle' ? (
            <PlayCircle size={18} />
          ) : (
            <GitBranch size={18} />
          )}
        </div>
        <div>
          <div className="inv-bp__health-label">{health.label}</div>
          <p className="inv-bp__health-detail">{health.detail}</p>
        </div>
      </div>

      <section className="inv-bp__card">
        <div className="inv-bp__card-head">
          <GitBranch size={15} aria-hidden />
          Assigned blueprint
        </div>
        <label className="inv-bp__field">
          <span className="sr-only">Blueprint</span>
          <select
            value={effectiveBlueprintId}
            onChange={(e) => handleAssign(e.target.value)}
            aria-label="Assigned blueprint"
          >
            <option value="">None — not assigned</option>
            {blueprints.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {assignment ? (
          <p className="inv-bp__meta">Assigned {formatWhen(assignment.assignedAt)}</p>
        ) : liveRun ? (
          <p className="inv-bp__meta">Inferred from live run (assign to lock it in).</p>
        ) : (
          <p className="inv-bp__meta">
            Assign a blueprint, or turn Live runner on — every open invoice is assigned in
            realtime (status changes, hydrate, hold/PPW). Live runner is {runnerOn ? 'on' : 'off'}.
          </p>
        )}
        <Link to="/admin/blueprints" className="inv-bp__link">
          Open Blueprints editor →
        </Link>
      </section>

      <section className="inv-bp__card">
        <div className="inv-bp__card-head">
          {liveRun ? 'Current enrollment' : run ? 'Last enrollment' : 'Current enrollment'}
        </div>
        {run ? (
          <div className="inv-bp__run">
            <div className="inv-bp__run-row">
              <span className="inv-bp__muted">Status</span>
              <span className={`inv-bp__pill inv-bp__pill--${run.status}`}>
                <StatusGlyph status={run.status} />
                {BLUEPRINT_RUN_STATUS_LABELS[run.status]}
              </span>
            </div>
            <div className="inv-bp__run-row">
              <span className="inv-bp__muted">Blueprint</span>
              <span className="inv-bp__value">{run.blueprintName}</span>
            </div>
            {!liveRun && (run.status === 'completed' || run.status === 'stopped') ? (
              <p className="inv-bp__meta" style={{ marginTop: 8 }}>
                Finished run — not the current assignment while this invoice is open.
              </p>
            ) : null}
            <div className="inv-bp__run-row">
              <span className="inv-bp__muted">Current step</span>
              <span className="inv-bp__value">{run.currentStep}</span>
            </div>
            <div className="inv-bp__run-row">
              <span className="inv-bp__muted">Wake / next</span>
              <span className="inv-bp__value">
                {run.status === 'waiting' ? formatWhen(run.waitUntil) : '—'}
              </span>
            </div>
            <div className="inv-bp__run-row">
              <span className="inv-bp__muted">Started</span>
              <span className="inv-bp__value">{formatWhen(run.startedAt)}</span>
            </div>
            <div className="inv-bp__run-row">
              <span className="inv-bp__muted">Updated</span>
              <span className="inv-bp__value">{formatWhen(run.updatedAt)}</span>
            </div>
            {runnerOn ? (
              <div className="inv-bp__run-row" style={{ marginTop: 10 }}>
                {rerunBusy ? (
                  <button type="button" className="inv-bp__btn" disabled>
                    <span className="dv-spinner" aria-hidden style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} />
                    Rerunning…
                  </button>
                ) : rerunConfirm ? (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="inv-bp__btn" onClick={() => void handleRerun()}>
                      Yes, rerun from the start
                    </button>
                    <button type="button" className="inv-bp__btn" onClick={() => setRerunConfirm(false)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="inv-bp__btn"
                    onClick={() => {
                      setRerunMsg(null)
                      setRerunConfirm(true)
                    }}
                  >
                    Rerun blueprint
                  </button>
                )}
              </div>
            ) : null}
            {rerunConfirm && !rerunBusy ? (
              <p className="inv-bp__meta" style={{ marginTop: 6 }}>
                This stops the current run and starts a new one. Steps that send emails may send again.
              </p>
            ) : null}
            {rerunMsg ? (
              <p className="inv-bp__meta" style={{ marginTop: 6 }}>
                {rerunMsg}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="inv-bp__empty">
            <p>No run on this invoice yet.</p>
            <button
              type="button"
              className="inv-bp__btn"
              onClick={handleStartEnrollment}
              disabled={blueprints.length === 0 && !effectiveBlueprintId}
            >
              Start enrollment
            </button>
            <p className="inv-bp__meta">
              Creates a Waiting run from the assigned graph. With Live runner on, invoices
              auto-assign on status changes, hydrate, hold, and PPW; Then-do writes notes/status only.
            </p>
          </div>
        )}
      </section>

    </>
  )
  const stepsBlock = (
    <>
      {run && run.status !== 'completed' && run.status !== 'stopped' ? (
        <section className="inv-bp__card">
          <div className="inv-bp__card-head">
            After wake — what happens next
          </div>
          {upcoming.length === 0 ? (
            <p className="inv-bp__meta" style={{ marginTop: 0 }}>
              No next cards found on this blueprint. Open the editor and connect steps after the
              Wait.
            </p>
          ) : (
            <ol className="inv-bp__upcoming">
              {upcoming.map((step, i) => (
                <li key={`${step.nodeId}-${i}`} className="inv-bp__upcoming-item">
                  <div className="inv-bp__upcoming-rail" aria-hidden>
                    <span className={`inv-bp__upcoming-dot inv-bp__upcoming-dot--${step.kind}`}>
                      {i + 1}
                    </span>
                    {i < upcoming.length - 1 ? (
                      <span className="inv-bp__upcoming-line" />
                    ) : null}
                  </div>
                  <div className="inv-bp__upcoming-body">
                    <div className="inv-bp__upcoming-meta">
                      <span className={`inv-bp__upcoming-kind inv-bp__upcoming-kind--${step.kind}`}>
                        {stepKindLabel(step.kind)}
                      </span>
                      {step.branchHint ? (
                        <span className="inv-bp__upcoming-branch">{step.branchHint}</span>
                      ) : null}
                    </div>
                    <div className="inv-bp__upcoming-title">{step.title}</div>
                    {step.detail ? (
                      <div className="inv-bp__upcoming-detail">{step.detail}</div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

    </>
  )
  const debugBlock = (
    <>
      <InvoiceBlueprintDebug invoice={invoice} />

    </>
  )
  const historyBlock = (
    <>
      <section className="inv-bp__card">
        <div className="inv-bp__card-head inv-bp__card-head--row">
          <span>Run history</span>
          {history.length > 0 ? (
            <button
              type="button"
              className="inv-bp__link-btn"
              onClick={() => {
                if (!window.confirm('Clear run history for this invoice?')) return
                clearInvoiceBlueprintHistory(invoice)
                setHistory(listInvoiceBlueprintHistory(invoice))
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        <p className="inv-bp__meta" style={{ marginTop: 0, marginBottom: '0.35rem' }}>
          Oldest → newest · what actually ran on this invoice
        </p>
        {history.length === 0 ? (
          <p className="inv-bp__meta" style={{ marginTop: 0 }}>
            Nothing has run on this invoice yet. When Live runner advances Wait / When / Then-do,
            each step will show up here.
          </p>
        ) : (
          <ol className="inv-bp__history">
            {history.map((ev) => (
              <li key={ev.id} className={`inv-bp__history-item inv-bp__history-item--${ev.kind}`}>
                <div className="inv-bp__history-when">
                  <time dateTime={ev.at}>{formatWhen(ev.at)}</time>
                  <span
                    className={`inv-bp__history-kind inv-bp__history-kind--${ev.kind}`}
                  >
                    {historyKindLabel(ev.kind)}
                  </span>
                </div>
                <div className="inv-bp__history-body">
                  <div className="inv-bp__history-title">{ev.title}</div>
                  {ev.detail ? (
                    <div className="inv-bp__history-detail">{ev.detail}</div>
                  ) : null}
                  <div className="inv-bp__history-bp">{ev.blueprintName}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

    </>
  )

  const content = (
    <div className={`inv-bp${full ? ' inv-bp--full' : ''}`}>
      <header className="inv-bp__bar">
        <div className="inv-bp__bar-title">
          <GitBranch size={16} aria-hidden />
          <span>Blueprint · Invoice #{invoice.invoice_number}</span>
        </div>
        <button
          type="button"
          className="inv-bp__icon-btn"
          onClick={() => setFull((v) => !v)}
          aria-label={full ? 'Exit full screen' : 'Open full screen'}
          title={full ? 'Exit full screen (Esc)' : 'Full screen'}
        >
          {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          <span>{full ? 'Exit full screen' : 'Full screen'}</span>
        </button>
      </header>

      <BlueprintRunDashboard invoice={invoice} />

      <button
        type="button"
        className="inv-bp__more"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
      >
        {showMore ? 'Hide details' : 'More details (setup, debug, history)'}
      </button>

      {!showMore || full ? null : (
        <nav className="inv-bp__tabs" role="tablist" aria-label="Blueprint sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`inv-bp__tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {!showMore ? null : full ? (
        <div className="inv-bp__cols">
          <div className="inv-bp__col">
            {overviewBlock}
            {stepsBlock}
          </div>
          <div className="inv-bp__col">
            {debugBlock}
            {historyBlock}
          </div>
        </div>
      ) : (
        <>
          {tab === 'overview' ? overviewBlock : null}
          {tab === 'steps' ? stepsBlock : null}
          {tab === 'debug' ? debugBlock : null}
          {tab === 'history' ? historyBlock : null}
        </>
      )}
    </div>
  )

  if (full) {
    const target =
      typeof document !== 'undefined'
        ? (document.querySelector('.client-portal') ?? document.body)
        : null
    if (!target) return content
    return createPortal(<div className="inv-bp-overlay">{content}</div>, target)
  }
  return content
}
