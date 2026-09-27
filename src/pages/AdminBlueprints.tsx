/**
 * Admin Blueprints — graph editor + Activity.
 * Chase runs on the server (blueprint-wake-cron), including when this tab is closed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GitBranch,
  Save,
  Trash2,
  FilePlus2,
  FolderOpen,
  Play,
  Bookmark,
  ListTodo,
  Pencil,
  LayoutList,
} from 'lucide-react'
import type { Edge } from '@xyflow/react'
import BlueprintActivityPanel from '../components/blueprints/BlueprintActivityPanel'
import BlueprintLibraryPanel from '../components/blueprints/BlueprintLibraryPanel'
import BlueprintCanvas from '../components/blueprints/BlueprintCanvas'
import BlueprintRunLog from '../components/blueprints/BlueprintRunLog'
import { BlueprintRevealMissingContext } from '../components/blueprints/blueprintSetupUi'
import BlueprintSavedCardsPanel from '../components/blueprints/BlueprintSavedCardsPanel'
import type { SavedBlueprintCard } from '../components/blueprints/blueprintCardLibrary'
import {
  deleteSavedBlueprint,
  getSavedBlueprint,
  listSavedBlueprints,
  newBlueprintId,
  saveBlueprint,
} from '../components/blueprints/blueprintStore'
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
  setBlueprintsRunnerEnabled,
} from '../config/blueprintsRuntime'
import { syncAllOpenInvoiceBlueprints } from '../components/blueprints/blueprintRunner'
import '../styles/adminBlueprints.css'

type BlueprintsPageTab = 'editor' | 'library' | 'activity'

function resolveInitial() {
  const list = listSavedBlueprints()
  const bp = list[0] ?? RISK_LADDER_DEMO_BLUEPRINT
  return bp
}

export default function AdminBlueprints() {
  const { showToast } = useToast()
  const initial = resolveInitial()

  const [savedList, setSavedList] = useState(() => listSavedBlueprints())
  const [activeId, setActiveId] = useState(initial.id)
  const [name, setName] = useState(initial.name)
  const [priority, setPriority] = useState(() =>
    Number.isFinite(Number(initial.priority)) ? Number(initial.priority) : 0
  )
  const [canvasSeed, setCanvasSeed] = useState<{
    nodes: BlueprintFlowNode[]
    edges: Edge[]
  }>(() => ({ nodes: initial.nodes, edges: initial.edges }))
  const [liveGraph, setLiveGraph] = useState<{
    nodes: BlueprintFlowNode[]
    edges: Edge[]
  }>(() => ({ nodes: initial.nodes, edges: initial.edges }))
  const [dirty, setDirty] = useState(false)
  const [runOpen, setRunOpen] = useState(false)
  const [runLog, setRunLog] = useState<DryRunLogEntry[]>([])
  const [revealMissingSetup, setRevealMissingSetup] = useState(false)
  const [savedCardsOpen, setSavedCardsOpen] = useState(false)
  const [pendingInsertCard, setPendingInsertCard] = useState<SavedBlueprintCard | null>(null)
  const [assumptions, setAssumptions] = useState<Record<string, boolean>>(() =>
    defaultWhenAssumptions(initial.nodes)
  )
  const [whenEvents, setWhenEvents] = useState(() => collectWhenEvents(initial.nodes))
  const [pageTab, setPageTab] = useState<BlueprintsPageTab>('editor')
  const [runnerOn, setRunnerOn] = useState(() => isBlueprintsRunnerEnabled())

  useEffect(() => {
    const sync = () => setRunnerOn(isBlueprintsRunnerEnabled())
    window.addEventListener(BLUEPRINTS_RUNNER_CHANGED_EVENT, sync)
    return () => window.removeEventListener(BLUEPRINTS_RUNNER_CHANGED_EVENT, sync)
  }, [])

  const graphRef = useRef<{ nodes: BlueprintFlowNode[]; edges: Edge[] }>({
    nodes: initial.nodes,
    edges: initial.edges,
  })
  const skipDirtyRef = useRef(true)

  const refreshList = useCallback(() => {
    setSavedList(listSavedBlueprints())
  }, [])

  const onGraphChange = useCallback((n: BlueprintFlowNode[], e: Edge[]) => {
    graphRef.current = { nodes: n, edges: e }
    setLiveGraph({ nodes: n, edges: e })
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false
      return
    }
    setDirty(true)
  }, [])

  const applyLoaded = useCallback(
    (
      id: string,
      nextName: string,
      nodes: BlueprintFlowNode[],
      edges: Edge[],
      nextPriority = 0
    ) => {
      skipDirtyRef.current = true
      graphRef.current = { nodes, edges }
      setActiveId(id)
      setName(nextName)
      setPriority(nextPriority)
      setCanvasSeed({ nodes, edges })
      setLiveGraph({ nodes, edges })
      setDirty(false)
      setWhenEvents(collectWhenEvents(nodes))
      setAssumptions(defaultWhenAssumptions(nodes))
      setRunLog([])
      setRevealMissingSetup(false)
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
      applyLoaded(
        bp.id,
        bp.name,
        bp.nodes,
        bp.edges,
        Number.isFinite(Number(bp.priority)) ? Number(bp.priority) : 0
      )
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
    setActiveId(saved.id)
    setName(saved.name)
    setPriority(
      Number.isFinite(Number(saved.priority)) ? Number(saved.priority) : 0
    )
    setDirty(false)
    refreshList()
    showToast(`Saved “${saved.name}”.`, 'success')
  }, [activeId, name, priority, refreshList, showToast])

  const handleNew = useCallback(() => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    const id = newBlueprintId()
    applyLoaded(id, 'Untitled blueprint', [], [], 0)
  }, [dirty, applyLoaded])

  const handleDelete = useCallback(() => {
    if (!activeId) return
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return
    deleteSavedBlueprint(activeId)
    refreshList()
    const next = listSavedBlueprints()[0]
    if (next) {
      applyLoaded(
        next.id,
        next.name,
        next.nodes,
        next.edges,
        Number.isFinite(Number(next.priority)) ? Number(next.priority) : 0
      )
    } else {
      applyLoaded(newBlueprintId(), 'Untitled blueprint', [], [], 0)
    }
    showToast('Blueprint deleted.', 'success')
  }, [activeId, name, refreshList, applyLoaded, showToast])

  const handleLoadSelect = useCallback(
    (id: string) => {
      if (!id || id === activeId) return
      if (dirty && !window.confirm('Discard unsaved changes?')) return
      loadBlueprint(id)
    },
    [activeId, dirty, loadBlueprint]
  )

  const handleSimulate = useCallback(() => {
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
    showToast('Simulation finished — see what would happen.', 'success')
  }, [showToast])

  const handleAssumptionChange = useCallback((checkId: string, value: boolean) => {
    setAssumptions((prev) => {
      const next = { ...prev, [checkId]: value }
      const { nodes, edges } = graphRef.current
      setWhenEvents(collectWhenEvents(nodes))
      setRunLog(runBlueprintDryRun(nodes, edges, next))
      return next
    })
  }, [])

  const handleSimulateAgain = useCallback(() => {
    const { nodes, edges } = graphRef.current
    const events = collectWhenEvents(nodes)
    setWhenEvents(events)
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

  return (
    <div className="admin-blueprints">
      <div className="admin-blueprints__top">
        <div className="admin-blueprints__heading">
          <GitBranch className="admin-blueprints__title-icon" aria-hidden />
          <div>
            <h1>Blueprints</h1>
            <p>
              {pageTab === 'editor'
                ? 'Chain small steps: Wait until → Then do → When. One action per card.'
                : pageTab === 'library'
                  ? 'All saved blueprints and their priority — higher wins when several match.'
                  : 'See which invoices and brokers are waiting, active, or finished on a blueprint.'}
            </p>
          </div>
        </div>
        {pageTab === 'editor' ? (
          <div className="admin-blueprints__toolbar">
            <label className="admin-blueprints__name">
              <span className="sr-only">Blueprint name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setDirty(true)
                }}
                placeholder="Blueprint name"
              />
            </label>
            <label
              className="admin-blueprints__priority"
              title="Higher priority wins when several blueprints match the same event"
            >
              <span>Priority</span>
              <input
                type="number"
                min={0}
                max={999}
                step={1}
                value={priority}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setPriority(Number.isFinite(n) ? Math.max(0, Math.min(999, Math.round(n))) : 0)
                  setDirty(true)
                }}
              />
            </label>
            <label className="admin-blueprints__load">
              <FolderOpen size={14} aria-hidden />
              <select
                value={savedList.some((b) => b.id === activeId) ? activeId : ''}
                onChange={(e) => handleLoadSelect(e.target.value)}
                aria-label="Load saved blueprint"
              >
                {!savedList.some((b) => b.id === activeId) ? (
                  <option value="">Unsaved…</option>
                ) : null}
                {savedList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {Number(b.priority) > 0 ? `P${b.priority} · ` : ''}
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="admin-blueprints__btn admin-blueprints__btn--run"
              onClick={handleSimulate}
              title="Walk the graph and show what would happen — no emails or status changes"
            >
              <Play size={14} aria-hidden />
              Simulate
            </button>
            <button
              type="button"
              className="admin-blueprints__btn"
              onClick={() => setSavedCardsOpen(true)}
            >
              <Bookmark size={14} aria-hidden />
              Saved cards
            </button>
            <button type="button" className="admin-blueprints__btn" onClick={handleNew}>
              <FilePlus2 size={14} aria-hidden />
              New
            </button>
            <button
              type="button"
              className="admin-blueprints__btn admin-blueprints__btn--primary"
              onClick={handleSave}
            >
              <Save size={14} aria-hidden />
              Save{dirty ? ' *' : ''}
            </button>
            <button
              type="button"
              className="admin-blueprints__btn admin-blueprints__btn--danger"
              onClick={handleDelete}
            >
              <Trash2 size={14} aria-hidden />
              Delete
            </button>
          </div>
        ) : (
          <div className="admin-blueprints__toolbar">
            <label className="admin-blueprints__runner-toggle">
              <input
                type="checkbox"
                checked={runnerOn}
                onChange={(e) => {
                  setBlueprintsRunnerEnabled(e.target.checked)
                  setRunnerOn(e.target.checked)
                  if (e.target.checked) {
                    void syncAllOpenInvoiceBlueprints('Live runner on').then(({ assigned }) => {
                      showToast(
                        assigned > 0
                          ? `Live runner on — ${assigned} open invoice(s) assigned.`
                          : 'Live runner on — Then-do can send broker/carrier emails (Settings toggles still apply).',
                        'success'
                      )
                    })
                  } else {
                    showToast('Live runner off — old chase only.', 'success')
                  }
                }}
              />
              <span>Live runner</span>
            </label>
          </div>
        )}
      </div>

      <div className="admin-blueprints__tabs" role="tablist" aria-label="Blueprints views">
        <button
          type="button"
          role="tab"
          aria-selected={pageTab === 'editor'}
          className={`admin-blueprints__tab${pageTab === 'editor' ? ' admin-blueprints__tab--on' : ''}`}
          onClick={() => setPageTab('editor')}
        >
          <Pencil size={14} aria-hidden />
          Editor
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pageTab === 'library'}
          className={`admin-blueprints__tab${pageTab === 'library' ? ' admin-blueprints__tab--on' : ''}`}
          onClick={() => setPageTab('library')}
        >
          <LayoutList size={14} aria-hidden />
          Library
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
        </button>
        {pageTab === 'editor' ? (
          <label className="admin-blueprints__runner-toggle admin-blueprints__runner-toggle--tab">
            <input
              type="checkbox"
              checked={runnerOn}
              onChange={(e) => {
                setBlueprintsRunnerEnabled(e.target.checked)
                setRunnerOn(e.target.checked)
                if (e.target.checked) {
                  void syncAllOpenInvoiceBlueprints('Live runner on').then(({ assigned }) => {
                    showToast(
                      assigned > 0
                        ? `Live runner on — ${assigned} open invoice(s) assigned.`
                        : 'Live runner on — Then-do can send broker/carrier emails (Settings toggles still apply).',
                      'success'
                    )
                  })
                } else {
                  showToast('Live runner off — old chase only.', 'success')
                }
              }}
            />
            <span>Live runner</span>
          </label>
        ) : null}
      </div>

      {pageTab === 'editor' ? (
        <div
          className={`admin-blueprints__banner${warnings.length > 0 ? ' admin-blueprints__banner--warn' : ''}`}
          role="status"
        >
          {warnings.length > 0 ? (
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
          ) : (
            'Then do cards can hold several tasks. Press Simulate to preview what would happen. Saved cards are in the toolbar.'
          )}
        </div>
      ) : null}

      <div className="admin-blueprints__body">
        {pageTab === 'editor' ? (
          <>
            <BlueprintRevealMissingContext.Provider value={revealMissingSetup}>
              <BlueprintCanvas
                key={activeId}
                graphKey={activeId}
                initialNodes={canvasSeed.nodes}
                initialEdges={canvasSeed.edges}
                onGraphChange={onGraphChange}
                pendingInsertCard={pendingInsertCard}
                onPendingInsertConsumed={() => setPendingInsertCard(null)}
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
              onRunAgain={handleSimulateAgain}
            />
            <BlueprintSavedCardsPanel
              open={savedCardsOpen}
              onClose={() => setSavedCardsOpen(false)}
              onInsert={(card) => setPendingInsertCard(card)}
            />
          </>
        ) : pageTab === 'library' ? (
          <BlueprintLibraryPanel
            onOpen={(id) => {
              if (dirty && !window.confirm('Discard unsaved changes?')) return
              loadBlueprint(id)
              setPageTab('editor')
            }}
          />
        ) : (
          <BlueprintActivityPanel />
        )}
      </div>
    </div>
  )
}
