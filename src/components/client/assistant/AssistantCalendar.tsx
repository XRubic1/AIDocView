import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type {
  AssistantCalendarEvent,
  AssistantCalendarFilter,
} from '../../../types/assistant'
import type { Invoice } from '../../../types/invoice'
import type { SharedCalendarEvent } from '../../../data/sharedCalendarEvents'
import { filterMockCalendarEvents } from '../../../data/mockAssistantData'
import AssistantEventDetail from './AssistantEventDetail'
import AssistantAddEventModal from './AssistantAddEventModal'
import CalendarDayEventList from '../../calendar/CalendarDayEventList'

interface AssistantCalendarProps {
  events: AssistantCalendarEvent[]
  invoices?: Invoice[]
  clientId: string
  clientName: string
  clientEmail?: string
  onAddEvent: (event: SharedCalendarEvent) => void
}

const FILTERS: { id: AssistantCalendarFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'my_tasks', label: 'My tasks' },
  { id: 'expected', label: 'Expected $' },
  { id: 'needs_me', label: 'Needs me' },
]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Keep cells scannable — overflow goes to the right rail. */
const MAX_PILLS = 3

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

function typeShortLabel(evt: AssistantCalendarEvent): string {
  if (evt.type === 'expected_payment' && /^will pay$/i.test(evt.title)) {
    return 'Will Pay'
  }
  if (/broker follow-up/i.test(evt.title)) return 'Follow-up'
  if (/paperwork check/i.test(evt.title)) return 'PPW check'
  switch (evt.type) {
    case 'paperwork_check':
      return 'Docs'
    case 'payment_status_check':
      return 'Check'
    case 'reminder':
      return 'Remind'
    case 'expected_payment':
      return 'Expected'
    case 'payment_posted':
      return 'Posted'
    case 'meeting':
      return 'Meet'
    case 'escalate':
      return 'Escalate'
    case 'call':
      return 'Call'
    default:
      return 'Task'
  }
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
  const [filter, setFilter] = useState<AssistantCalendarFilter>('all')
  const [cursorMonth, setCursorMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const filtered = useMemo(
    () => filterMockCalendarEvents(events, filter),
    [events, filter]
  )

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

  // Keep selection valid when filter/status changes.
  const effectiveSelectedId = useMemo(() => {
    if (selectedId && dayEvents.some((e) => e.id === selectedId)) return selectedId
    return dayEvents[0]?.id ?? null
  }, [selectedId, dayEvents])

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
    setSelectedId((eventsByDay.get(key) ?? [])[0]?.id ?? null)
  }

  const selectDay = (dateKey: string) => {
    setSelectedDate(dateKey)
    setSelectedId((eventsByDay.get(dateKey) ?? [])[0]?.id ?? null)
  }

  const handleSave = (event: SharedCalendarEvent) => {
    onAddEvent(event)
    setSelectedDate(event.dueDate)
    setCursorMonth(startOfMonth(parseDateKey(event.dueDate)))
    setSelectedId(event.id)
    setFilter('all')
  }

  return (
    <div className="assistant-cal">
      <div className="assistant-cal__toolbar">
        <div className="assistant-cal__nav">
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
            <button
              type="button"
              className="assistant-cal__add-btn"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.25} />
              Add
            </button>
          </div>

          <div className="assistant-cal__filter-bar">
            <div className="assistant-cal__filters" role="tablist" aria-label="Calendar filters">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  className={`assistant-cal__filter${
                    filter === f.id ? ' assistant-cal__filter--active' : ''
                  }`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="assistant-cal__legend" aria-hidden>
              <span>
                <i className="assistant-cal__dot assistant-cal__dot--paperwork_check" />
                Docs
              </span>
              <span>
                <i className="assistant-cal__dot assistant-cal__dot--expected_payment" />
                Expected / Will Pay
              </span>
              <span>
                <i className="assistant-cal__dot assistant-cal__dot--payment_posted" />
                Posted
              </span>
              <span>
                <i className="assistant-cal__dot assistant-cal__dot--meeting" />
                Meet
              </span>
              <span>
                <i className="assistant-cal__dot assistant-cal__dot--reminder" />
                Remind
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="assistant-cal__body">
        <div className="assistant-cal__main">
          <div className="assistant-cal__grid" role="grid" aria-label={monthLabel}>
            {WEEKDAYS.map((d) => (
              <div key={d} className="assistant-cal__weekday" role="columnheader">
                {d}
              </div>
            ))}

            {cells.map((cell) => {
              const overflow = Math.max(0, cell.events.length - MAX_PILLS)
              const visible = cell.events.slice(0, MAX_PILLS)
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
                  {cell.events.length > 0 && (
                    <span className="assistant-cal__cell-count" aria-hidden>
                      {cell.events.length}
                    </span>
                  )}
                  <span className="assistant-cal__cell-events">
                    {visible.map((evt) => (
                      <button
                        key={evt.id}
                        type="button"
                        className={`assistant-cal__pill assistant-cal__pill--${evt.type}${
                          evt.status !== 'pending' ? ' assistant-cal__pill--muted' : ''
                        }`}
                        title={`${evt.title} · #${evt.invoiceNumber} · ${evt.brokerName}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedDate(cell.dateKey)
                          setSelectedId(evt.id)
                        }}
                      >
                        <span className="assistant-cal__pill-kind">
                          {typeShortLabel(evt)}
                        </span>
                      </button>
                    ))}
                    {overflow > 0 && (
                      <span className="assistant-cal__more">+{overflow} more</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <AssistantEventDetail
          dayLabel={selectedDayLabel}
          dayEvents={dayEvents}
          selectedId={effectiveSelectedId}
          onAddEvent={() => setAddOpen(true)}
          invoices={invoices}
        />
        <CalendarDayEventList
          dayLabel={selectedDayLabel}
          events={dayEvents}
          selectedId={effectiveSelectedId}
          onSelect={setSelectedId}
          subtitle={(evt) =>
            `#${evt.invoiceNumber} · ${evt.brokerName}${
              evt.amountLabel ? ` · ${evt.amountLabel}` : ''
            }`
          }
        />
      </div>

      <AssistantAddEventModal
        open={addOpen}
        defaultDate={selectedDate}
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
