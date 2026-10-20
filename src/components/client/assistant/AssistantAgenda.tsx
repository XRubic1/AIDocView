import { useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { AssistantCalendarEvent } from '../../../types/assistant'
import AssistantEventCard, { isNeedsYou } from './AssistantEventCard'
import '../../../styles/assistantAgenda.css'

const UPCOMING_DAYS = 30

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function plusDaysKey(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function Section({
  title,
  hint,
  count,
  events,
  tone,
}: {
  title: string
  hint?: string
  count: number
  events: AssistantCalendarEvent[]
  tone?: 'action'
}) {
  if (events.length === 0) return null
  return (
    <section className="ast-section">
      <header className="ast-section__head">
        <h2 className={`ast-section__title${tone ? ` is-${tone}` : ''}`}>{title}</h2>
        <span className="ast-section__count tabular-nums">{count}</span>
        {hint ? <p className="ast-section__hint">{hint}</p> : null}
      </header>
      <div className="ast-section__list">
        {events.map((evt) => (
          <AssistantEventCard key={evt.id} event={evt} />
        ))}
      </div>
    </section>
  )
}

/** Plain to-do style list: what needs you, what is coming up, what is done. */
export default function AssistantAgenda({ events }: { events: AssistantCalendarEvent[] }) {
  const [showDone, setShowDone] = useState(false)

  const { needsYou, upcoming, done } = useMemo(() => {
    const today = todayKey()
    const horizon = plusDaysKey(UPCOMING_DAYS)
    const byDate = (a: AssistantCalendarEvent, b: AssistantCalendarEvent) =>
      a.dueDate.localeCompare(b.dueDate)

    const needs: AssistantCalendarEvent[] = []
    const soon: AssistantCalendarEvent[] = []
    const finished: AssistantCalendarEvent[] = []
    for (const evt of events) {
      if (evt.status === 'obsolete') continue
      if (evt.status !== 'pending') {
        finished.push(evt)
      } else if (isNeedsYou(evt)) {
        needs.push(evt)
      } else if (evt.dueDate <= horizon) {
        soon.push(evt)
      }
    }
    return {
      needsYou: needs.sort(byDate),
      upcoming: soon.sort(byDate),
      done: finished.sort((a, b) => b.dueDate.localeCompare(a.dueDate)).slice(0, 20),
      today,
    }
  }, [events])

  const nothing = needsYou.length === 0 && upcoming.length === 0

  return (
    <div className="ast-agenda">
      {nothing ? (
        <div className="ast-empty">
          <CheckCircle2 size={28} strokeWidth={1.75} aria-hidden />
          <p className="ast-empty__title">You’re all caught up</p>
          <p className="ast-empty__sub">Nothing needs your attention right now.</p>
        </div>
      ) : null}

      <Section
        title="Needs your attention"
        hint="Things only you can do"
        count={needsYou.length}
        events={needsYou}
        tone="action"
      />
      <Section
        title="Coming up"
        hint="Credyx is handling these — just so you know"
        count={upcoming.length}
        events={upcoming}
      />

      {done.length > 0 ? (
        <section className="ast-section">
          <button
            type="button"
            className="ast-link"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
          >
            {showDone ? 'Hide' : 'Show'} completed ({done.length})
          </button>
          {showDone ? (
            <div className="ast-section__list">
              {done.map((evt) => (
                <AssistantEventCard key={evt.id} event={evt} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
