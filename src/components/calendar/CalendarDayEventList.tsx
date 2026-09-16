/**
 * Rightmost calendar panel — invoices/events for the selected day.
 */
import type { AssistantCalendarEvent } from '../../types/assistant'

interface CalendarDayEventListProps {
  dayLabel: string | null
  events: AssistantCalendarEvent[]
  selectedId: string | null
  onSelect: (eventId: string) => void
  /** Second line under the event title (carrier, broker, invoice #). */
  subtitle: (event: AssistantCalendarEvent) => string
}

/** Full-height day agenda list, pinned to the right of the calendar. */
export default function CalendarDayEventList({
  dayLabel,
  events,
  selectedId,
  onSelect,
  subtitle,
}: CalendarDayEventListProps) {
  return (
    <aside className="assistant-event-list" aria-label="Invoices this day">
      <header className="assistant-event-list__header">
        <h2 className="assistant-event-list__title">{dayLabel ?? 'Pick a day'}</h2>
        <p className="assistant-event-list__sub">
          {events.length} invoice{events.length === 1 ? '' : 's'}
        </p>
      </header>

      <div className="assistant-event-list__items" role="list">
        {events.length === 0 ? (
          <p className="assistant-event-detail__empty">No invoices this day.</p>
        ) : (
          events.map((evt) => (
            <button
              key={evt.id}
              type="button"
              role="listitem"
              className={`assistant-cal__row${
                selectedId === evt.id ? ' assistant-cal__row--active' : ''
              }${evt.status !== 'pending' ? ' assistant-cal__row--muted' : ''}`}
              onClick={() => onSelect(evt.id)}
            >
              <span
                className={`assistant-cal__dot assistant-cal__dot--${evt.type}`}
                aria-hidden
              />
              <span className="assistant-cal__row-main">
                <span className="assistant-cal__row-title">{evt.title}</span>
                <span className="assistant-cal__row-sub">{subtitle(evt)}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
