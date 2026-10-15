/**
 * Admin Blueprints — Build (list + graph editor) and Activity.
 * Chase runs on the server (blueprint-wake-cron), including when this tab is closed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GitBranch, ListTodo, MoreHorizontal, Pencil, Play, Rows3, Save, Trash2 } from 'lucide-react'
import type { Edge } from '@xyflow/react'
import BlueprintActivityPanel from '../components/blueprints/BlueprintActivityPanel'
import BlueprintStagesPanel from '../components/blueprints/BlueprintStagesPanel'
import BlueprintCanvas from '../components/blueprints/BlueprintCanvas'
import BlueprintListSidebar from '../components/blueprints/BlueprintListSidebar'
import BlueprintRunLog from '../components/blueprints/BlueprintRunLog'
import { BlueprintRevealMissingContext } from '../components/blueprints/blueprintSetupUi'
import {
  deleteSavedBlueprint,
  getSavedBlueprint,
  listSavedBlueprints,
  newBlueprintId,
  saveBlueprint,
} from '../components/blueprints/blueprintStore'
import {
  BLUEPRINT_HANDOFF_CHANGED_EVENT,
  getBlueprintHandoffMap,
} from '../components/blueprints/blueprintHandoffMap'
import {
  BLUEPRINT_RUNS_CHANGED_EVENT,
  listStoredBlueprintRuns,
} from '../components/blueprints/blueprintRuns'
import { RISK_LADDER_DEMO_BLUEPRINT } from '../components/blueprints/blueprintSeed'
import {
  collectWhenEvents,
  defaultWhenAssumptions,
  runBlueprintDryRun,
  type DryRunLogEntry,
} from '../components/blueprints/blueprintDryRun'
import { collectBlueprintWarnings } from '../components/blueprints/blueprintWarnings'
import type { BlueprintFlowNode } from '../types/blueprintGraph'
import { useToast } from '../components/ui/ToastProvider'
import {
  BLUEPRINTS_RUNNER_CHANGED_EVENT,
  isBlueprintsRunnerEnabled,
} from '../config/blueprintsRuntime'
import { saveBlueprintsRunnerEnabled } from '../services/platformSettingsService'
import { syncAllOpenInvoiceBlueprints } from '../components/blueprints/blueprintRunner'
import '../styles/adminBlueprints.css'

type BlueprintsPageTab = 'stages' | 'build' | 'activity'

function resolveInitial() {
  const list = listSavedBlueprints()
  const bp = list[0] ?? RISK_LADDER_DEMO_BLUEPRINT
  return bp
}

/** What the user changed (cards, wiring, positions) — ignores React Flow's measure/select noise. */
function graphSignature(nodes: BlueprintFlowNode[], edges: Edge[]): string {
  return JSON.stringify([
    nodes.map((n) => [n.id, Math.round(n.position.x), Math.round(n.position.y), n.data]),
    edges.map((e) => [e.source, e.target, e.sourceHandle ?? null, e.targetHandle ?? null]),
  ])
}

function safePriority(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

export default function AdminBlueprints() {
  const { showToast } = useToast()
  const initial = resolveInitial()

  const [savedList, setSavedList] = useState(() => listSavedBlueprints())
  const [activeId, setActiveId] = useState(initial.id)
  const [name, setName] = useState(initial.name)
  const [priority, setPriority] = useState(() => safePriority(initial.priority))
  const [canvasSeed, setCanvasSeed] = useState<{
    nodes: BlueprintFlowNode[]
    edges: Edge[]
  }>(() => ({ nodes: initial.nodes, edges: initial.edges }))
  const [liveGraph, setLiveGraph] = useState<{
    nodes: BlueprintFlowNode[]
    edges: Edge[]
  }>(() => ({ nodes: initial.nodes, edges: initial.edges }))
  const [graphDirty, setGraphDirty] = useState(false)
  const [metaDirty, setMetaDirty] = useState(false)
  const dirty = graphDirty || metaDirty
  const [runOpen, setRunOpen] = useState(false)
  const [runLog, setRunLog] = useState<DryRunLogEntry[]>([])
  const [revealMissingSetup, setRevealMissingSetup] = useState(false)
  const [assumptions, setAssumptions] = useState<Record<string, boolean>>(() =>
    defaultWhenAssumptions(initial.nodes)
  )
  const [whenEvents, setWhenEvents] = useState(() => collectWhenEvents(initial.nodes))
  const [pageTab, setPageTab] = useState<BlueprintsPageTab>('stages')
  const [runnerOn, setRunnerOn] = useState(() => isBlueprintsRunnerEnabled())
  const [runnerSaving, setRunnerSaving] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [handoffMap, setHandoffMap] = useState(() => getBlueprintHandoffMap())
  const [runs, setRuns] = useState(() => listStoredBlueprintRuns())
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const syncRunner = () => setRunnerOn(isBlueprintsRunnerEnabled())
    const syncHandoff = () => setHandoffMap(getBlueprintHandoffMap())
    const syncRuns = () => setRuns(listStoredBlueprintRuns())
    window.addEventListener(BLUEPRINTS_RUNNER_CHANGED_EVENT, syncRunner)
    window.addEventListener(BLUEPRINT_HANDOFF_CHANGED_EVENT, syncHandoff)
    window.addEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, syncRuns)
    return () => {
      window.removeEventListener(BLUEPRINTS_RUNNER_CHANGED_EVENT, syncRunner)
      window.removeEventListener(BLUEPRINT_HANDOFF_CHANGED_EVENT, syncHandoff)
      window.removeEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, syncRuns)
    }
  }, [])

  useEffect(() => {
    if (!moreOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  const handleRunnerToggle = useCallback(
    async (checked: boolean) => {
      if (runnerSaving) return
      setRunnerOn(checked)
      setRunnerSaving(true)
      try {
        await saveBlueprintsRunnerEnabled(checked)
        if (checked) {
          const { assigned } = await syncAllOpenInvoiceBlueprints('Live runner on')
          showToast(
            assigned > 0
              ? `Automation on. ${assigned} open invoice(s) assigned to a blueprint.`
              : 'Automation on. Blueprints can now send emails and add notes.',
            'success'
          )
        } else {
          showToast('Automation off for every admin.', 'success')
        }
      } catch (err) {
        setRunnerOn(isBlueprintsRunnerEnabled())
        showToast(
          err instanceof Error ? err.message : 'Could not save the automation setting.',
          'error'
        )
      } finally {
        setRunnerSaving(false)
      }
    },
    [runnerSaving, showToast]
  )

  const graphRef = useRef<{ nodes: BlueprintFlowNode[]; edges: Edge[] }>({
    nodes: initial.nodes,
    edges: initial.edges,
  })
  const savedSigRef = useRef(graphSignature(initial.nodes, initial.edges))

  const refreshList = useCallback(() => {
    setSavedList(listSavedBlueprints())
  }, [])

  const onGraphChange = useCallback((n: BlueprintFlowNode[], e: Edge[]) => {
    graphRef.current = { nodes: n, edges: e }
    setLiveGraph({ nodes: n, edges: e })
    setGraphDirty(graphSignature(n, e) !== savedSigRef.current)
  }, [])

  const applyLoaded = useCallback(
    (
      id: string,
      nextName: string,
      nodes: BlueprintFlowNode[],
      edges: Edge[],
      nextPriority = 0
    ) => {
      savedSigRef.current = graphSignature(nodes, edges)
      graphRef.current = { nodes, edges }
      setActiveId(id)
      setName(nextName)
      setPriority(nextPriority)
      setCanvasSeed({ nodes, edges })
      setLiveGraph({ nodes, edges })
      setGraphDirty(false)
      setMetaDirty(false)
      setWhenEvents(collectWhenEvents(nodes))
      setAssumptions(defaultWhenAssumptions(nodes))
      setRunLog([])
      setRunOpen(false)
      setRevealMissingSetup(false)
      setMoreOpen(false)
    },
    []
  )

  const loadBlueprint = useCallback(
    (id: string) => {
      const bp = getSavedBlueprint(id)
      if (!bp) {
        showToast('Blueprint not found.', 'error')
        return
      }
      applyLoaded(bp.id, bp.name, bp.nodes, bp.edges, safePriority(bp.priority))
    },
    [showToast, applyLoaded]
  )

  const handleSave = useCallback(() => {
    const trimmed = name.trim() || 'Untitled blueprint'
    const { nodes, edges } = graphRef.current
    const saved = saveBlueprint({
      id: activeId || newBlueprintId(),
      name: trimmed,
      priority: Number.isFinite(priority) ? priority : 0,
      updatedAt: new Date().toISOString(),
      nodes,
      edges,
    })
    savedSigRef.current = graphSignature(nodes, edges)
    setActiveId(saved.id)
    setName(saved.name)
    setPriority(safePriority(saved.priority))
    setGraphDirty(false)
    setMetaDirty(false)
    refreshList()
    showToast(`Saved “${saved.name}”.`, 'success')
  }, [activeId, name, priority, refreshList, showToast])

  const handleNew = useCallback(() => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    applyLoaded(newBlueprintId(), 'Untitled blueprint', [], [], 0)
  }, [dirty, applyLoaded])

  const handleDelete = useCallback(() => {
    setMoreOpen(false)
    if (!activeId) return
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return
    deleteSavedBlueprint(activeId)
    refreshList()
    const next = listSavedBlueprints()[0]
    if (next) {
      applyLoaded(next.id, next.name, next.nodes, next.edges, safePriority(next.priority))
    } else {
      applyLoaded(newBlueprintId(), 'Untitled blueprint', [], [], 0)
    }
    showToast('Blueprint deleted.', 'success')
  }, [activeId, name, refreshList, applyLoaded, showToast])

  const handleSelect = useCallback(
    (id: string) => {
      if (!id || id === activeId) return
      if (dirty && !window.confirm('Discard unsaved changes?')) return
      loadBlueprint(id)
    },
    [activeId, dirty, loadBlueprint]
  )

  const handleTestRun = useCallback(() => {
    const { nodes, edges } = graphRef.current
    const events = collectWhenEvents(nodes)
    setWhenEvents(events)
    setAssumptions((prev) => {
      const next = { ...defaultWhenAssumptions(nodes), ...prev }
      for (const ev of events) {
        if (next[ev.checkId] === undefined) next[ev.checkId] = false
      }
      setRunLog(runBlueprintDryRun(nodes, edges, next))
      return next
    })
    setRunOpen(true)
    setRevealMissingSetup(true)
  }, [])

  const handleAssumptionChange = useCallback((checkId: string, value: boolean) => {
    setAssumptions((prev) => {
      const next = { ...prev, [checkId]: value }
      const { nodes, edges } = graphRef.current
      setWhenEvents(collectWhenEvents(nodes))
      setRunLog(runBlueprintDryRun(nodes, edges, next))
      return next
    })
  }, [])

  const handleTestRunAgain = useCallback(() => {
    const { nodes, edges } = graphRef.current
    setWhenEvents(collectWhenEvents(nodes))
    setRevealMissingSetup(true)
    setRunLog(runBlueprintDryRun(nodes, edges, assumptions))
  }, [assumptions])

  const warnings = useMemo(
    () =>
      collectBlueprintWarnings(
        liveGraph.nodes,
        liveGraph.edges,
        revealMissingSetup
      ),
    [liveGraph, revealMissingSetup]
  )

  const liveRunCount = useMemo(
    () =>
      runs.filter(
        (r) => r.status === 'waiting' || r.status === 'active' || r.status === 'paused'
      ).length,
    [runs]
  )

  return (
    <div className="admin-blueprints">
      <div className="admin-blueprints__top">
        <div className="admin-blueprints__heading">
          <GitBranch className="admin-blueprints__title-icon" aria-hidden />
          <div>
            <h1>Blueprints</h1>
            <p>Automatic follow-up for invoices, brokers, and batches.</p>
          </div>
        </div>
        <label
          className={`admin-blueprints__runner${runnerOn ? ' admin-blueprints__runner--on' : ''}`}
          title="Server-wide. When off, blueprints don't send emails, add notes, or move steps."
        >
          <input
            id="bp-automation-toggle"
            type="checkbox"
            role="switch"
            checked={runnerOn}
            disabled={runnerSaving}
            onChange={(e) => {
              void handleRunnerToggle(e.target.checked)
            }}
          />
          <span className="admin-blueprints__runner-track" aria-hidden>
            <span className="admin-blueprints__runner-thumb" />
          </span>
          <span className="admin-blueprints__runner-text">
            Automation {runnerOn ? 'on' : 'off'}
          </span>
        </label>
      </div>

      <div className="admin-blueprints__tabs" role="tablist" aria-label="Blueprints views">
        <button
          type="button"
          role="tab"
          aria-selected={pageTab === 'stages'}
          className={`admin-blueprints__tab${pageTab === 'stages' ? ' admin-blueprints__tab--on' : ''}`}
          onClick={() => setPageTab('stages')}
        >
          <Rows3 size={14} aria-hidden />
          Stages
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pageTab === 'build'}
          className={`admin-blueprints__tab${pageTab === 'build' ? ' admin-blueprints__tab--on' : ''}`}
          onClick={() => setPageTab('build')}
        >
          <Pencil size={14} aria-hidden />
          Build
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pageTab === 'activity'}
          className={`admin-blueprints__tab${pageTab === 'activity' ? ' admin-blueprints__tab--on' : ''}`}
          onClick={() => setPageTab('activity')}
        >
          <ListTodo size={14} aria-hidden />
          Activity
          {liveRunCount > 0 ? (
            <span className="admin-blueprints__tab-count">{liveRunCount}</span>
          ) : null}
        </button>
      </div>

      <div className="admin-blueprints__body">
        {pageTab === 'build' ? (
          <div className="admin-blueprints__build">
            <BlueprintListSidebar
              blueprints={savedList}
              activeId={activeId}
              dirty={dirty}
              handoffMap={handoffMap}
              runs={runs}
              onSelect={handleSelect}
              onNew={handleNew}
            />
            <div className="admin-blueprints__editor">
              <div className="admin-blueprints__toolbar">
                <label className="admin-blueprints__name">
                  <span className="sr-only">Blueprint name</span>
                  <input
                    id="bp-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setMetaDirty(true)
                    }}
                    placeholder="Blueprint name"
                  />
                </label>
                {dirty ? <span className="admin-blueprints__dirty">Unsaved changes</span> : null}
                <div className="admin-blueprints__toolbar-actions">
                  <button
                    type="button"
                    className="admin-blueprints__btn"
                    onClick={handleTestRun}
                    title="Walk through the steps and show what would happen. Sends nothing."
                  >
                    <Play size={14} aria-hidden />
                    Test run
                  </button>
                  <button
                    type="button"
                    className="admin-blueprints__btn admin-blueprints__btn--primary"
                    onClick={handleSave}
                    disabled={!dirty}
                  >
                    <Save size={14} aria-hidden />
                    Save
                  </button>
                  <div className="admin-blueprints__more" ref={moreRef}>
                    <button
                      type="button"
                      className="admin-blueprints__btn admin-blueprints__btn--icon"
                      aria-label="More options"
                      aria-expanded={moreOpen}
                      onClick={() => setMoreOpen((v) => !v)}
                    >
                      <MoreHorizontal size={16} aria-hidden />
                    </button>
                    {moreOpen ? (
                      <div className="admin-blueprints__more-menu" role="menu">
                        <label className="admin-blueprints__more-field">
                          <span>Priority</span>
                          <input
                            id="bp-priority"
                            type="number"
                            min={0}
                            max={999}
                            step={1}
                            value={priority}
                            onChange={(e) => {
                              const n = Number(e.target.value)
                              setPriority(
                                Number.isFinite(n) ? Math.max(0, Math.min(999, Math.round(n))) : 0
                              )
                              setMetaDirty(true)
                            }}
                          />
                          <small>
                            When more than one blueprint fits the same invoice, the higher number
                            wins.
                          </small>
                        </label>
                        <button
                          type="button"
                          role="menuitem"
                          className="admin-blueprints__more-item admin-blueprints__more-item--danger"
                          onClick={handleDelete}
                        >
                          <Trash2 size={14} aria-hidden />
                          Delete blueprint
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {warnings.length > 0 ? (
                <div className="admin-blueprints__banner admin-blueprints__banner--warn" role="status">
                  <div className="admin-blueprints__banner-warn">
                    <span className="admin-blueprints__banner-mark" aria-hidden>
                      !
                    </span>
                    <div className="admin-blueprints__banner-msgs">
                      {warnings.map((w) => (
                        <p key={w}>{w}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <BlueprintRevealMissingContext.Provider value={revealMissingSetup}>
                <BlueprintCanvas
                  key={activeId}
                  graphKey={activeId}
                  initialNodes={canvasSeed.nodes}
                  initialEdges={canvasSeed.edges}
                  onGraphChange={onGraphChange}
                />
              </BlueprintRevealMissingContext.Provider>
              <BlueprintRunLog
                open={runOpen}
                events={whenEvents}
                assumptions={assumptions}
                log={runLog}
                onAssumptionChange={handleAssumptionChange}
                onClose={() => setRunOpen(false)}
                onClear={() => setRunLog([])}
                onRunAgain={handleTestRunAgain}
              />
            </div>
          </div>
        ) : pageTab === 'stages' ? (
          <BlueprintStagesPanel />
        ) : (
          <BlueprintActivityPanel />
        )}
      </div>
    </div>
  )
}
