/**
 * Left rail on the Build tab — every saved blueprint, grouped by who it runs on,
 * with what starts next and how many records are on it right now.
 */
import { useMemo, useState } from 'react'
import { ArrowRight, Plus, Search } from 'lucide-react'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import { blueprintPriority } from '../../types/blueprintGraph'
import type { BlueprintSubject } from './blueprintCatalog'
import type { BlueprintHandoffMap } from './blueprintHandoffMap'
import { nextBlueprintAfter } from './blueprintHandoffMap'
import type { BlueprintRunRow } from './blueprintRuns'

const GROUPS: { id: BlueprintSubject; label: string }[] = [
  { id: 'invoices', label: 'Invoices' },
  { id: 'brokers', label: 'Brokers' },
  { id: 'batches', label: 'Batches' },
]

function subjectOf(bp: SavedBlueprint): BlueprintSubject {
  const start = bp.nodes.find((n) => n.data.kind === 'trigger')
  const s = start?.data.triggerSubject
  return s === 'brokers' || s === 'batches' ? s : 'invoices'
}

interface BlueprintListSidebarProps {
  blueprints: SavedBlueprint[]
  activeId: string
  dirty: boolean
  handoffMap: BlueprintHandoffMap
  runs: BlueprintRunRow[]
  onSelect: (id: string) => void
  onNew: () => void
}

export default function BlueprintListSidebar({
  blueprints,
  activeId,
  dirty,
  handoffMap,
  runs,
  onSelect,
  onNew,
}: BlueprintListSidebarProps) {
  const [query, setQuery] = useState('')

  const liveCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const run of runs) {
      if (run.status !== 'waiting' && run.status !== 'active' && run.status !== 'paused') continue
      counts.set(run.blueprintId, (counts.get(run.blueprintId) ?? 0) + 1)
    }
    return counts
  }, [runs])

  const nameById = useMemo(
    () => new Map(blueprints.map((b) => [b.id, b.name])),
    [blueprints]
  )

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visible = q
      ? blueprints.filter((b) => b.name.toLowerCase().includes(q))
      : blueprints
    return GROUPS.map((g) => ({
      ...g,
      items: visible
        .filter((b) => subjectOf(b) === g.id)
        .sort(
          (a, b) =>
            blueprintPriority(b) - blueprintPriority(a) || a.name.localeCompare(b.name)
        ),
    })).filter((g) => g.items.length > 0)
  }, [blueprints, query])

  const activeSaved = blueprints.some((b) => b.id === activeId)

  return (
    <nav className="bp-list" aria-label="Blueprints">
      <div className="bp-list__top">
        <button type="button" className="admin-blueprints__btn bp-list__new" onClick={onNew}>
          <Plus size={14} aria-hidden />
          New blueprint
        </button>
        <label className="bp-list__search">
          <Search size={14} aria-hidden />
          <span className="sr-only">Find a blueprint</span>
          <input
            id="bp-list-search"
            type="search"
            value={query}
            placeholder="Find a blueprint"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="bp-list__scroll">
        {!activeSaved ? (
          <div className="bp-list__group">
            <div className="bp-list__group-title">Not saved yet</div>
            <button type="button" className="bp-list__item bp-list__item--on" aria-current="true">
              <span className="bp-list__name">New blueprint</span>
              <span className="bp-list__meta">Save to add it to the list</span>
            </button>
          </div>
        ) : null}

        {grouped.map((group) => (
          <div key={group.id} className="bp-list__group">
            <div className="bp-list__group-title">{group.label}</div>
            {group.items.map((bp) => {
              const on = bp.id === activeId
              const next = nextBlueprintAfter(bp.id, handoffMap)
              const nextName = next ? nameById.get(next) : null
              const live = liveCount.get(bp.id) ?? 0
              return (
                <button
                  key={bp.id}
                  type="button"
                  className={`bp-list__item${on ? ' bp-list__item--on' : ''}`}
                  aria-current={on ? 'true' : undefined}
                  onClick={() => onSelect(bp.id)}
                >
                  <span className="bp-list__row">
                    <span className="bp-list__name">
                      {bp.name}
                      {on && dirty ? (
                        <span className="bp-list__dirty" title="Unsaved changes" aria-label="Unsaved changes" />
                      ) : null}
                    </span>
                    {live > 0 ? (
                      <span className="bp-list__live" title={`${live} running now`}>
                        {live}
                      </span>
                    ) : null}
                  </span>
                  {nextName ? (
                    <span className="bp-list__meta">
                      <ArrowRight size={11} aria-hidden />
                      then {nextName}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        ))}

        {grouped.length === 0 && query ? (
          <p className="bp-list__empty">No blueprint matches “{query}”.</p>
        ) : null}
      </div>
    </nav>
  )
}
