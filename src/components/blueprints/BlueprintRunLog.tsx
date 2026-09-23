import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flag,
  GitBranch,
  Info,
  Play,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { DryRunLogEntry, DryRunLogLevel, WhenEventOption } from './blueprintDryRun'

interface BlueprintRunLogProps {
  open: boolean
  events: WhenEventOption[]
  assumptions: Record<string, boolean>
  log: DryRunLogEntry[]
  onAssumptionChange: (checkId: string, value: boolean) => void
  onClose: () => void
  onClear: () => void
  onRunAgain: () => void
}

const LEVEL_META: Record<
  DryRunLogLevel,
  { label: string; Icon: LucideIcon }
> = {
  info: { label: 'Note', Icon: Info },
  wait: { label: 'Wait', Icon: Clock },
  branch: { label: 'When', Icon: GitBranch },
  action: { label: 'Do', Icon: Zap },
  warn: { label: 'Heads up', Icon: AlertTriangle },
  done: { label: 'Done', Icon: CheckCircle2 },
}

/** Drop noisy prefixes already shown by the badge. */
function cleanTitle(title: string, level: DryRunLogLevel): string {
  let t = title.trim()
  if (level === 'action') t = t.replace(/^Then do:\s*/i, '')
  if (level === 'wait') t = t.replace(/^Wait until:\s*/i, '')
  if (level === 'branch') {
    t = t.replace(/^When:\s*/i, '')
    t = t.replace(/^Skipped When:\s*/i, 'Skipped · ')
  }
  if (level === 'done') t = t.replace(/^Done:\s*/i, '')
  if (level === 'info') t = t.replace(/^Start:\s*/i, '')
  return t
}

function isQuiet(entry: DryRunLogEntry): boolean {
  return (
    entry.level === 'info' &&
    (entry.title.startsWith('Dry run') || entry.title.includes('Scenario'))
  )
}

export default function BlueprintRunLog({
  open,
  events,
  assumptions,
  log,
  onAssumptionChange,
  onClose,
  onClear,
  onRunAgain,
}: BlueprintRunLogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const storySteps = log.filter((e) => !isQuiet(e) || e.step === 1)
  const actionCount = log.filter((e) => e.level === 'action').length

  const panel = (
    <div className="bp-run" role="dialog" aria-modal="true" aria-label="What would happen">
      <div className="bp-run__head">
        <div className="bp-run__heading">
          <Flag className="bp-run__heading-icon" aria-hidden />
          <div>
            <h2 className="bp-run__title">What would happen</h2>
            <p className="bp-run__sub">
              Preview only
              {log.length > 0
                ? ` · ${storySteps.length} steps${actionCount ? ` · ${actionCount} action${actionCount === 1 ? '' : 's'}` : ''}`
                : ' · press Run to simulate'}
              {' · Esc to close'}
            </p>
          </div>
        </div>
        <div className="bp-run__head-actions">
          <button
            type="button"
            className="admin-blueprints__btn admin-blueprints__btn--run"
            onClick={onRunAgain}
          >
            <Play size={14} aria-hidden />
            Run again
          </button>
          <button type="button" className="admin-blueprints__btn" onClick={onClear}>
            Clear
          </button>
          <button
            type="button"
            className="admin-blueprints__btn bp-run__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>

      {events.length > 0 ? (
        <div className="bp-run__scenario">
          <div className="bp-run__scenario-label">Pretend this happened</div>
          <div className="bp-run__toggles">
            {events.map((ev) => {
              const yes = assumptions[ev.checkId] === true
              return (
                <div key={ev.checkId} className="bp-run__chip">
                  <span className="bp-run__chip-label">{ev.label}</span>
                  <div className="bp-run__seg" role="group" aria-label={ev.label}>
                    <button
                      type="button"
                      className={`bp-run__seg-btn${yes ? ' bp-run__seg-btn--on-yes' : ''}`}
                      onClick={() => onAssumptionChange(ev.checkId, true)}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className={`bp-run__seg-btn${!yes ? ' bp-run__seg-btn--on-no' : ''}`}
                      onClick={() => onAssumptionChange(ev.checkId, false)}
                    >
                      No
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="bp-run__scenario-hint">Change Yes/No, then Run again.</p>
        </div>
      ) : null}

      <ol className="bp-run__log">
        {log.length === 0 ? (
          <li className="bp-run__empty">
            <Play size={18} aria-hidden />
            <span>Press <strong>Run</strong> to walk through this blueprint.</span>
          </li>
        ) : (
          log.map((entry, index) => {
            const meta = LEVEL_META[entry.level]
            const Icon = meta.Icon
            const quiet =
              entry.level === 'info' &&
              (entry.title.startsWith('Dry run') || entry.title === 'Dry run finished')
            const isLast = index === log.length - 1

            return (
              <li
                key={`${entry.step}-${entry.title}`}
                className={`bp-run__entry bp-run__entry--${entry.level}${quiet ? ' bp-run__entry--quiet' : ''}${isLast ? ' bp-run__entry--last' : ''}`}
              >
                <div className="bp-run__rail" aria-hidden>
                  <span className={`bp-run__dot bp-run__dot--${entry.level}`}>
                    <Icon size={13} strokeWidth={2.4} />
                  </span>
                  {!isLast ? <span className="bp-run__line" /> : null}
                </div>
                <div className="bp-run__body">
                  <div className="bp-run__meta">
                    <span className={`bp-run__badge bp-run__badge--${entry.level}`}>
                      {meta.label}
                    </span>
                    <span className="bp-run__step-num">Step {entry.step}</span>
                  </div>
                  <div className="bp-run__entry-title">
                    {cleanTitle(entry.title, entry.level)}
                  </div>
                  {entry.detail ? (
                    <div className="bp-run__entry-detail">{entry.detail}</div>
                  ) : null}
                </div>
              </li>
            )
          })
        )}
      </ol>
    </div>
  )

  return createPortal(panel, document.body)
}
