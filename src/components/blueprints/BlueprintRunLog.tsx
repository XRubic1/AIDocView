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
  info: { label: 'Start', Icon: Info },
  wait: { label: 'Wait', Icon: Clock },
  branch: { label: 'When', Icon: GitBranch },
  action: { label: 'Do', Icon: Zap },
  warn: { label: 'Gap', Icon: AlertTriangle },
  done: { label: 'End', Icon: CheckCircle2 },
}

function isMetaEntry(entry: DryRunLogEntry): boolean {
  return (
    entry.level === 'done' &&
    (entry.title === 'End of preview' || entry.title === 'Finished')
  )
}

function isStoryStep(entry: DryRunLogEntry): boolean {
  if (isMetaEntry(entry)) return false
  if (entry.level === 'info' && entry.title.startsWith('Path from')) return true
  return entry.level !== 'info' || !entry.title.startsWith('Simulation')
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

  const story = log.filter(isStoryStep)
  const actionCount = story.filter((e) => e.level === 'action').length
  const waitCount = story.filter((e) => e.level === 'wait').length

  const panel = (
    <div className="bp-run" role="dialog" aria-modal="true" aria-label="What would happen">
      <div className="bp-run__head">
        <div className="bp-run__heading">
          <Flag className="bp-run__heading-icon" aria-hidden />
          <div>
            <h2 className="bp-run__title">What would happen</h2>
            <p className="bp-run__sub">
              Timeline preview — no emails or status changes
              {story.length > 0
                ? ` · ${story.length} step${story.length === 1 ? '' : 's'}${
                    waitCount ? ` · ${waitCount} wait` : ''
                  }${
                    actionCount
                      ? ` · ${actionCount} action${actionCount === 1 ? '' : 's'}`
                      : ''
                  }`
                : ' · press Simulate'}
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
            Simulate again
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
          <div className="bp-run__scenario-label">Pretend these events</div>
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
          <p className="bp-run__scenario-hint">
            Changes update the timeline — flip Yes/No to see the other branch.
          </p>
        </div>
      ) : null}

      <div className="bp-run__timeline-wrap">
        {story.length > 0 ? (
          <div className="bp-run__col-heads" aria-hidden>
            <span className="bp-run__col-when">When</span>
            <span className="bp-run__col-what">What happens</span>
          </div>
        ) : null}
        <ol className="bp-run__log">
          {log.length === 0 ? (
            <li className="bp-run__empty">
              <Play size={18} aria-hidden />
              <span>
                Press <strong>Simulate</strong> to see when each step would run and what it would
                do.
              </span>
            </li>
          ) : (
            story.map((entry, index) => {
              const meta = LEVEL_META[entry.level]
              const Icon = meta.Icon
              const isLast = index === story.length - 1

              return (
                <li
                  key={`${entry.step}-${entry.title}-${entry.whenLabel}`}
                  className={`bp-run__entry bp-run__entry--${entry.level}${isLast ? ' bp-run__entry--last' : ''}`}
                >
                  <div className="bp-run__rail" aria-hidden>
                    <span className={`bp-run__dot bp-run__dot--${entry.level}`}>
                      <Icon size={13} strokeWidth={2.4} />
                    </span>
                    {!isLast ? <span className="bp-run__line" /> : null}
                  </div>
                  <div className="bp-run__when">
                    <span className="bp-run__when-label">{entry.whenLabel || '—'}</span>
                    <span className={`bp-run__badge bp-run__badge--${entry.level}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="bp-run__body">
                    <div className="bp-run__entry-title">{entry.title}</div>
                    {entry.detail ? (
                      <div className="bp-run__entry-detail">{entry.detail}</div>
                    ) : null}
                  </div>
                </li>
              )
            })
          )}
        </ol>
        {story.length > 0 ? (
          <p className="bp-run__footer-note">
            Preview only — nothing was emailed or saved.
          </p>
        ) : null}
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
