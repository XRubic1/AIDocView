import { useMemo, useState } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, Bell } from 'lucide-react'
import type {
  AssistantCalendarEvent,
  AssistantCreatableEventType,
} from '../../../types/assistant'
import type { Invoice } from '../../../types/invoice'
import type { SharedCalendarEvent } from '../../../data/sharedCalendarEvents'
import AssistantAgenda from './AssistantAgenda'
import AssistantEventCard from './AssistantEventCard'
import '../../../styles/assistantAgenda.css'
import AssistantAddEventModal from './AssistantAddEventModal'

interface AssistantCalendarProps {
  events: AssistantCalendarEvent[]
  invoices?: Invoice[]
  clientId: string
  clientName: string
  clientEmail?: string
  onAddEvent: (event: SharedCalendarEvent) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Dots per day cell; the selected day's cards sit below the grid. */
const MAX_CHIPS = 2

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function parseDateKey(key: string): Date {
  const [y, m, day] = key.split('-').map(Number)
  return new Date(y, m - 1, day)
}

function chipLabel(evt: AssistantCalendarEvent): string {
  if (evt.type === 'meeting' || evt.type === 'reminder') return evt.title
  if (evt.type === 'paperwork_check') return 'Docs needed'
  if (evt.type === 'expected_payment') return 'Payment due'
  if (evt.type === 'payment_posted') return 'Paid'
  if (evt.type === 'payment_status_check') return 'Check-in'
  return evt.title
}

type GridCell = {
  dateKey: string
  dayNum: number
  inMonth: boolean
  isToday: boolean
  events: AssistantCalendarEvent[]
}

/** Build a 6×7 month grid starting on Sunday. */
function buildMonthGrid(
  month: Date,
  eventsByDay: Map<string, AssistantCalendarEvent[]>
): GridCell[] {
  const todayKey = toDateKey(new Date())
  const first = startOfMonth(month)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())

  const cells: GridCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const dateKey = toDateKey(d)
    cells.push({
      dateKey,
      dayNum: d.getDate(),
      inMonth: d.getMonth() === month.getMonth(),
      isToday: dateKey === todayKey,
      events: eventsByDay.get(dateKey) ?? [],
    })
  }
  return cells
}

/**
 * Month-grid calendar with a persistent right rail.
 * Grid size never changes based on how many events a day has.
 */
export default function AssistantCalendar({
  events,
  invoices = [],
  clientId,
  clientName,
  clientEmail,
  onAddEvent,
}: AssistantCalendarProps) {
  const [view, setView] = useState<'agenda' | 'calendar'>('calendar')
  const [cursorMonth, setCursorMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()))
  const [addOpen, setAddOpen] = useState(false)
  const [addType, setAddType] = useState<AssistantCreatableEventType>('reminder')

  const openAdd = (type: AssistantCreatableEventType) => {
    setAddType(type)
    setAddOpen(true)
  }

  const filtered = events

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AssistantCalendarEvent[]>()
    for (const e of filtered) {
      const list = map.get(e.dueDate) ?? []
      list.push(e)
      map.set(e.dueDate, list)
    }
    return map
  }, [filtered])

  const cells = useMemo(
    () => buildMonthGrid(cursorMonth, eventsByDay),
    [cursorMonth, eventsByDay]
  )

  const dayEvents = eventsByDay.get(selectedDate) ?? []

  const monthLabel = cursorMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const selectedDayLabel = parseDateKey(selectedDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  const goToday = () => {
    const now = new Date()
    const key = toDateKey(now)
    setCursorMonth(startOfMonth(now))
    setSelectedDate(key)
  }

  const selectDay = (dateKey: string) => {
    setSelectedDate(dateKey)
  }

  const handleSave = (event: SharedCalendarEvent) => {
    onAddEvent(event)
    setSelectedDate(event.dueDate)
    setCursorMonth(startOfMonth(parseDateKey(event.dueDate)))
    setView('calendar')
  }

  return (
    <div className="assistant-cal">
      <div className="assistant-cal__toolbar">
        <div className="assistant-cal__nav">
          <div
            className="assistant-cal__month-group"
            style={{ justifyContent: 'space-between', width: '100%' }}
          >
            <div className="assistant-cal__filters" role="tablist" aria-label="Calendar view">
              {(
                [
                  ['calendar', 'Calendar'],
                  ['agenda', 'Upcoming'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  className={`assistant-cal__filter${
                    view === id ? ' assistant-cal__filter--active' : ''
                  }`}
                  onClick={() => setView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="assistant-cal__today-btn"
                onClick={() => openAdd('reminder')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Bell className="w-3.5 h-3.5" strokeWidth={2.25} />
                Set reminder
              </button>
              <button
                type="button"
                className="assistant-cal__add-btn"
                onClick={() => openAdd('meeting')}
              >
                <CalendarPlus className="w-3.5 h-3.5" strokeWidth={2.25} />
                Schedule meeting
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {view === 'agenda' ? (
          <AssistantAgenda events={events} />
        ) : (
          <>
            <div className="assistant-cal__nav" style={{ padding: '12px 16px 0' }}>
              <div className="assistant-cal__month-group">
                <p className="assistant-cal__heading">{monthLabel}</p>
                <button
                  type="button"
                  className="assistant-cal__icon-btn"
                  onClick={() => setCursorMonth((m) => addMonths(m, -1))}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="assistant-cal__icon-btn"
                  onClick={() => setCursorMonth((m) => addMonths(m, 1))}
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button type="button" className="assistant-cal__today-btn" onClick={goToday}>
                  Today
                </button>
              </div>
            </div>

            <div className="assistant-cal__main" style={{ padding: '12px 16px' }}>
              <div className="assistant-cal__grid" role="grid" aria-label={monthLabel}>
                {WEEKDAYS.map((d) => (
                  <div key={d} className="assistant-cal__weekday" role="columnheader">
                    {d}
                  </div>
                ))}

                {cells.map((cell) => {
                  const isSelected = selectedDate === cell.dateKey
                  return (
                    <div
                      key={cell.dateKey}
                      role="gridcell"
                      tabIndex={0}
                      aria-selected={isSelected}
                      aria-label={`${cell.dateKey}, ${cell.events.length} event${
                        cell.events.length === 1 ? '' : 's'
                      }`}
                      className={[
                        'assistant-cal__cell',
                        !cell.inMonth ? 'assistant-cal__cell--outside' : '',
                        cell.isToday ? 'assistant-cal__cell--today' : '',
                        isSelected ? 'assistant-cal__cell--selected' : '',
                        cell.events.length > 0 ? 'assistant-cal__cell--has-events' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => selectDay(cell.dateKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          selectDay(cell.dateKey)
                        }
                      }}
                    >
                      <span className="assistant-cal__cell-num">{cell.dayNum}</span>
                      <span className="assistant-cal__cell-events">
                        {cell.events.slice(0, MAX_CHIPS).map((evt) => (
                          <span
                            key={evt.id}
                            className={`assistant-cal__pill assistant-cal__pill--${evt.type}${
                              evt.status !== 'pending' ? ' assistant-cal__pill--muted' : ''
                            }`}
                            title={`${evt.title} · #${evt.invoiceNumber} · ${evt.brokerName}`}
                          >
                            <span className="assistant-cal__pill-kind">{chipLabel(evt)}</span>
                          </span>
                        ))}
                        {cell.events.length > MAX_CHIPS ? (
                          <span className="assistant-cal__more">
                            +{cell.events.length - MAX_CHIPS} more
                          </span>
                        ) : null}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="ast-dayview">
              <h2 className="ast-dayview__title">{selectedDayLabel}</h2>
              {dayEvents.length === 0 ? (
                <p className="ast-card__sub">Nothing scheduled this day.</p>
              ) : (
                <div className="ast-section__list">
                  {dayEvents.map((evt) => (
                    <AssistantEventCard key={evt.id} event={evt} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <AssistantAddEventModal
        open={addOpen}
        defaultDate={selectedDate}
        initialType={addType}
        invoices={invoices}
        clientId={clientId}
        clientName={clientName}
        clientEmail={clientEmail}
        createdBy="client"
        onClose={() => setAddOpen(false)}
        onSaved={handleSave}
      />
    </div>
  )
}
