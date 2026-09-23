/**
 * All saved blueprints as a list — name, priority, updated — open or edit priority.
 */
import { useCallback, useMemo, useState } from 'react'
import { GitBranch, Pencil, Trash2 } from 'lucide-react'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import { blueprintPriority } from '../../types/blueprintGraph'
import {
  deleteSavedBlueprint,
  listSavedBlueprints,
  saveBlueprint,
} from './blueprintStore'
import { useToast } from '../ui/ToastProvider'

function formatUpdated(iso: string): string {
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

function sortByPriority(list: SavedBlueprint[]): SavedBlueprint[] {
  return [...list].sort((a, b) => {
    const p = blueprintPriority(b) - blueprintPriority(a)
    if (p !== 0) return p
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

type BlueprintLibraryPanelProps = {
  onOpen: (id: string) => void
}

export default function BlueprintLibraryPanel({ onOpen }: BlueprintLibraryPanelProps) {
  const { showToast } = useToast()
  const [rows, setRows] = useState(() => sortByPriority(listSavedBlueprints()))

  const refresh = useCallback(() => {
    setRows(sortByPriority(listSavedBlueprints()))
  }, [])

  const handlePriorityChange = (id: string, raw: string) => {
    const n = Number(raw)
    const priority = Number.isFinite(n)
      ? Math.max(0, Math.min(999, Math.round(n)))
      : 0
    const bp = listSavedBlueprints().find((b) => b.id === id)
    if (!bp) return
    saveBlueprint({ ...bp, priority })
    refresh()
  }

  const handleDelete = (bp: SavedBlueprint) => {
    if (!window.confirm(`Delete “${bp.name}”? This cannot be undone.`)) return
    deleteSavedBlueprint(bp.id)
    refresh()
    showToast(`Deleted “${bp.name}”.`, 'success')
  }

  const count = useMemo(() => rows.length, [rows])

  return (
    <div className="bp-library">
      <div className="bp-library__intro">
        <div>
          <h2 className="bp-library__title">
            <GitBranch size={18} aria-hidden />
            All blueprints
          </h2>
          <p className="bp-library__sub">
            Sorted by priority (highest first). Higher priority wins when several match the same
            event. Change priority here or in the Editor.
          </p>
        </div>
        <span className="bp-library__count">{count} saved</span>
      </div>

      {rows.length === 0 ? (
        <p className="bp-library__empty">No blueprints yet — create one in the Editor.</p>
      ) : (
        <div className="bp-library__table-wrap">
          <table className="bp-library__table">
            <thead>
              <tr>
                <th scope="col">Priority</th>
                <th scope="col">Name</th>
                <th scope="col">Updated</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((bp) => (
                <tr key={bp.id}>
                  <td className="bp-library__prio-cell">
                    <input
                      type="number"
                      className="bp-library__prio-input"
                      min={0}
                      max={999}
                      step={1}
                      value={blueprintPriority(bp)}
                      aria-label={`Priority for ${bp.name}`}
                      onChange={(e) => handlePriorityChange(bp.id, e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="bp-library__name-btn"
                      onClick={() => onOpen(bp.id)}
                    >
                      {bp.name}
                    </button>
                  </td>
                  <td className="bp-library__muted">{formatUpdated(bp.updatedAt)}</td>
                  <td className="bp-library__actions">
                    <button
                      type="button"
                      className="admin-blueprints__btn"
                      onClick={() => onOpen(bp.id)}
                      title="Open in editor"
                    >
                      <Pencil size={14} aria-hidden />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="admin-blueprints__btn admin-blueprints__btn--danger"
                      onClick={() => handleDelete(bp)}
                      title="Delete blueprint"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
