import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Mail, Plus, Video } from 'lucide-react'
import type { Client } from '../../types/client'
import type { Invoice } from '../../types/invoice'
import type { SharedCalendarEvent } from '../../data/sharedCalendarEvents'
import {
  getAllSharedCalendarEvents,
  subscribeSharedCalendarEvents,
} from '../../data/sharedCalendarEvents'
import { getMockAdminChaseAsSharedEvents } from '../../data/mockAdminAssistantData'
import { mockInvoices } from '../../data/mockInvoices'
import { mockBrokers } from '../../data/mockBrokers'
import { useTenantDataRevision } from '../../hooks/useTenantDataRevision'
import { getAllClients } from '../../services/clientRegistry'
import { getClientInvoices } from '../../data/clientDemoData'
import AssistantAddEventModal from '../client/assistant/AssistantAddEventModal'
import { markAssistantEventCompleted } from '../../utils/assistantTaskStore'
import { openAdminInvoiceWorkspace } from '../../utils/openAdminInvoiceWorkspace'
import { applyAssistantCompletions } from '../../utils/assistantTaskStore'
import { sendStaffCalendarDigest } from '../../services/staffCalendarDigestService'
import {
  buildCalendarInvoiceFacts,
  findCalendarInvoice,
} from '../../utils/calendarInvoiceDetails'
import CalendarInvoiceFactsPanel from '../calendar/CalendarInvoiceFacts'
import CalendarDayEventList from '../calendar/CalendarDayEventList'

type AdminCalFilter = 'all' | 'chase' | 'meeting' | 'docs' | 'expected' | 'reminder'

const FILTERS: { id: AdminCalFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'chase', label: 'My tasks' },
  { id: 'meeting', label: 'Meetings' },
  { id: 'docs', label: 'Docs' },
  { id: 'expected', label: 'Expected $' },
  { id: 'reminder', label: 'Reminders' },
]

interface AdminSharedCalendarProps {
  /** Include Credyx payment-check / chase tasks from the Assistant. */
  includeChaseTasks?: boolean
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
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

function typeShortLabel(evt: SharedCalendarEvent): string {
  if (/broker follow-up/i.test(evt.title)) return 'Follow-up'
  if (/paperwork check/i.test(evt.title)) return 'PPW check'
  switch (evt.type) {
    case 'paperwork_check':
      return 'Docs'
    case 'reminder':
      return 'Remind'
    case 'expected_payment':
      return 'Expected'
    case 'payment_posted':
      return 'Posted'
    case 'meeting':
      return 'Meet'
    case 'payment_status_check':
      return 'Check'
    case 'escalate':
      return 'Escalate'
    case 'call':
      return 'Call'
    default:
      return 'Task'
  }
}

function typeLabel(type: SharedCalendarEvent['type']): string {
  switch (type) {
    case 'paperwork_check':
      return 'Missing docs'
    case 'expected_payment':
      return 'Expected pay'
    case 'payment_posted':
      return 'Payment posted'
    case 'meeting':
      return 'Meeting'
    case 'reminder':
      return 'Reminder'
    case 'payment_status_check':
      return 'Payment check'
    case 'escalate':
      return 'Escalate'
    case 'call':
      return 'Call'
    default:
      return type
  }
}

function isChaseType(type: SharedCalendarEvent['type']): boolean {
  return (
    type === 'payment_status_check' ||
    type === 'call' ||
    type === 'escalate'
  )
}

function isStaffTaskEvent(e: SharedCalendarEvent): boolean {
  if (isChaseType(e.type)) return true
  return (
    e.id.startsWith('live-callback-') ||
    e.id.startsWith('live-willpay-') ||
    e.id.startsWith('live-wpmissed-') ||
    e.id.startsWith('live-due-') ||
    e.id.startsWith('live-hold-') ||
    e.id.startsWith('live-noppw-') ||
    e.id.startsWith('live-payconfirm-') ||
    e.id.startsWith('live-aging-') ||
    e.id.startsWith('live-chase-') ||
    (e.type === 'reminder' &&
      (e.id.startsWith('admin-evt-') || e.id.startsWith('live-')))
  )
}

function filterEvents(
  events: SharedCalendarEvent[],
  filter: AdminCalFilter,
  clientId: string
): SharedCalendarEvent[] {
  let list = events
  if (clientId) list = list.filter((e) => e.clientId === clientId)
  if (filter === 'chase') {
    return list.filter(isStaffTaskEvent)
  }
  if (filter === 'meeting') return list.filter((e) => e.type === 'meeting')
  if (filter === 'docs') return list.filter((e) => e.type === 'paperwork_check')
  if (filter === 'expected') {
    return list.filter(
      (e) => e.type === 'expected_payment' || e.type === 'payment_posted'
    )
  }
  if (filter === 'reminder') return list.filter((e) => e.type === 'reminder')
  return list
}

type GridCell = {
  dateKey: string
  dayNum: number
  inMonth: boolean
  isToday: boolean
  events: SharedCalendarEvent[]
}

function buildMonthGrid(
  month: Date,
  eventsByDay: Map<string, SharedCalendarEvent[]>
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
 * Admin month calendar for shared client events + optional Credyx chase tasks.
 */
export default function AdminSharedCalendar({
  includeChaseTasks = true,
}: AdminSharedCalendarProps) {
  const tenantRevision = useTenantDataRevision()
  const [searchParams, setSearchParams] = useSearchParams()

  const loadEvents = (): SharedCalendarEvent[] => {
    const shared = getAllSharedCalendarEvents()
    if (!includeChaseTasks) return shared
    const chase = applyAssistantCompletions(
      getMockAdminChaseAsSharedEvents(mockInvoices, mockBrokers)
    )
    const sharedIds = new Set(shared.map((e) => e.id))
    return [...chase.filter((e) => !sharedIds.has(e.id)), ...shared]
  }

  const [events, setEvents] = useState<SharedCalendarEvent[]>(() => loadEvents())
  const [clients, setClients] = useState<Client[]>(() => getAllClients())
  const [clientFilter, setClientFilter] = useState(() => searchParams.get('client') || '')
  const [filter, setFilter] = useState<AdminCalFilter>('all')
  const [cursorMonth, setCursorMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addClientId, setAddClientId] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [digestBusy, setDigestBusy] = useState(false)
  const [digestMessage, setDigestMessage] = useState<string | null>(null)

  useEffect(() => {
    const fromUrl = searchParams.get('client') || ''
    setClientFilter(fromUrl)
  }, [searchParams])

  const updateClientFilter = (nextClient: string) => {
    setClientFilter(nextClient)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (nextClient) next.set('client', nextClient)
        else next.delete('client')
        return next
      },
      { replace: true }
    )
  }

  const refresh = () => {
    setEvents(loadEvents())
    setClients(getAllClients())
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload chase when tenant A/R changes
  }, [tenantRevision, includeChaseTasks])

  useEffect(() => {
    refresh()
    return subscribeSharedCalendarEvents(() => refresh())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeChaseTasks])

  useEffect(() => {
    const onDone = () => refresh()
    window.addEventListener('credyx-assistant-task-completed', onDone)
    window.addEventListener('focus', onDone)
    return () => {
      window.removeEventListener('credyx-assistant-task-completed', onDone)
      window.removeEventListener('focus', onDone)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeChaseTasks])


  const filtered = useMemo(
    () => filterEvents(events, filter, clientFilter),
    [events, filter, clientFilter]
  )

  const eventsByDay = useMemo(() => {
    const map = new Map<string, SharedCalendarEvent[]>()
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
  const effectiveSelectedId = useMemo(() => {
    if (selectedId && dayEvents.some((e) => e.id === selectedId)) return selectedId
    return dayEvents[0]?.id ?? null
  }, [selectedId, dayEvents])

  const selectedEvent =
    dayEvents.find((e) => e.id === effectiveSelectedId) ?? null

  const selectedInvoice = useMemo(() => {
    if (!selectedEvent) return undefined
    return findCalendarInvoice(mockInvoices, {
      invoiceId: selectedEvent.invoiceId,
      invoiceNumber: selectedEvent.invoiceNumber,
      clientId: selectedEvent.clientId,
    })
  }, [selectedEvent, tenantRevision])

  const selectedInvoiceFacts = useMemo(
    () =>
      selectedInvoice
        ? buildCalendarInvoiceFacts(selectedInvoice, { includeInternal: true })
        : null,
    [selectedInvoice]
  )

  const monthLabel = cursorMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const selectedDayLabel = parseDateKey(selectedDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  const addClient =
    clients.find((c) => c.id === addClientId) ??
    clients.find((c) => c.id === clientFilter) ??
    null

  useEffect(() => {
    if (!addClient) {
      setInvoices([])
      return
    }
    setInvoices(getClientInvoices(addClient.id, addClient.name))
  }, [addClient])

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

  const openAdd = () => {
    if (clients.length === 0) return
    if (clientFilter) {
      setAddClientId(clientFilter)
      setAddOpen(true)
      return
    }
    // Prompt for client when viewing all carriers.
    setAddClientId('')
    setAddOpen(true)
  }

  /** Email today's calendar tasks to the ops alert address. */
  const emailTodaysTasks = async () => {
    if (digestBusy) return
    setDigestBusy(true)
    setDigestMessage(null)
    try {
      const result = await sendStaffCalendarDigest({
        invoices: mockInvoices,
        brokers: mockBrokers,
        force: true,
      })
      if (result.skipped) {
        setDigestMessage(result.reason ?? 'Already sent today')
      } else if (!result.ok) {
        setDigestMessage(result.reason ?? result.email?.error ?? 'Send failed')
      } else {
        setDigestMessage(
          result.taskCount === 0
            ? 'Digest sent — nothing due today'
            : `Digest sent — ${result.taskCount} task(s)`
        )
      }
    } catch (err) {
      setDigestMessage(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setDigestBusy(false)
    }
  }

  return (
    <div className="assistant-cal admin-shared-cal">
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
            <select
              className="client-input admin-shared-cal__client-select"
              value={clientFilter}
              onChange={(e) => updateClientFilter(e.target.value)}
              aria-label="Filter by client"
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="assistant-cal__add-btn"
              onClick={openAdd}
              disabled={clients.length === 0}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.25} />
              Add
            </button>
            <button
              type="button"
              className="assistant-cal__today-btn"
              onClick={() => void emailTodaysTasks()}
              disabled={digestBusy}
              title="Email today's calendar tasks to the ops team"
            >
              <Mail className="w-3.5 h-3.5 inline-block mr-1" strokeWidth={2.25} />
              {digestBusy ? 'Sending…' : "Email today's tasks"}
            </button>
            {digestMessage ? (
              <span className="text-xs text-slate-500 max-w-[14rem] truncate" title={digestMessage}>
                {digestMessage}
              </span>
            ) : null}
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
                <i className="assistant-cal__dot assistant-cal__dot--payment_status_check" />
                Check
              </span>
              <span>
                <i className="assistant-cal__dot assistant-cal__dot--meeting" />
                Meet
              </span>
              <span>
                <i className="assistant-cal__dot assistant-cal__dot--paperwork_check" />
                Docs
              </span>
              <span>
                <i className="assistant-cal__dot assistant-cal__dot--expected_payment" />
                Expected
              </span>
              <span>
                <i className="assistant-cal__dot assistant-cal__dot--escalate" />
                Escalate
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
                        title={`${evt.title} · ${evt.clientName}`}
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

        <aside className="assistant-event-detail" aria-label="Invoice details">
          <header className="assistant-event-detail__header">
            <h2 className="assistant-event-detail__title">
              {selectedEvent
                ? selectedEvent.invoiceNumber !== '—'
                  ? `Invoice #${selectedEvent.invoiceNumber}`
                  : selectedEvent.title
                : 'Details'}
            </h2>
          </header>

          <div className="assistant-event-detail__scroll">
          <div className="assistant-event-detail__body">
            {!selectedEvent ? (
              <p className="assistant-event-detail__empty">
                {dayEvents.length > 0
                  ? 'Select an invoice from the list.'
                  : 'Click a day, or Add an event for a client.'}
              </p>
            ) : (
              <>
                <div className="assistant-event-detail__identity">
                  <p className="assistant-event-detail__eyebrow">
                    {typeLabel(selectedEvent.type)}
                  </p>
                  <h3 className="assistant-event-detail__event-title">
                    {selectedEvent.title}
                  </h3>
                  <p className="assistant-event-detail__identity-sub">
                    {selectedEvent.clientName}
                    {selectedEvent.invoiceNumber !== '—'
                      ? ` · #${selectedEvent.invoiceNumber}`
                      : ''}
                  </p>
                </div>
                <dl className="assistant-event-detail__grid">
                  <div>
                    <dt>When</dt>
                    <dd>{selectedEvent.dueLabel}</dd>
                  </div>
                  <div>
                    <dt>Owner</dt>
                    <dd>
                      {selectedEvent.createdBy === 'admin' ? 'Credyx' : 'Client'}
                    </dd>
                  </div>
                  {selectedEvent.amountLabel && (
                    <div>
                      <dt>Amount</dt>
                      <dd className="tabular-nums">{selectedEvent.amountLabel}</dd>
                    </div>
                  )}
                </dl>
                <p className="assistant-event-detail__detail">{selectedEvent.detail}</p>
                {selectedInvoiceFacts ? (
                  <CalendarInvoiceFactsPanel facts={selectedInvoiceFacts} />
                ) : null}
                {selectedEvent.meetingUrl && (
                  <a
                    className="assistant-event-detail__meet-link"
                    href={selectedEvent.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Video className="w-3.5 h-3.5 inline mr-1" />
                    Join meeting
                  </a>
                )}
              </>
            )}
          </div>

          <footer className="assistant-event-detail__footer">
            {selectedEvent?.meetingUrl && (
              <a
                className="dashboard-btn-primary"
                href={selectedEvent.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
              >
                Join
              </a>
            )}
            {selectedEvent && selectedEvent.invoiceId && selectedEvent.invoiceId !== '—' && (
              <button
                type="button"
                className={
                  selectedEvent.meetingUrl
                    ? 'dashboard-btn-secondary'
                    : 'dashboard-btn-primary'
                }
                onClick={() => openAdminInvoiceWorkspace(selectedEvent.invoiceId)}
              >
                Open invoice
              </button>
            )}
            {selectedEvent &&
              selectedEvent.status === 'pending' &&
              (isChaseType(selectedEvent.type) ||
                selectedEvent.id.startsWith('admin-evt-')) && (
                <button
                  type="button"
                  className="dashboard-btn-secondary"
                  onClick={() => {
                    markAssistantEventCompleted(selectedEvent.id)
                    window.dispatchEvent(
                      new CustomEvent('credyx-assistant-task-completed', {
                        detail: selectedEvent.id,
                      })
                    )
                    refresh()
                  }}
                >
                  Done
                </button>
              )}
            <button
              type="button"
              className="dashboard-btn-secondary"
              onClick={openAdd}
              disabled={clients.length === 0}
            >
              Add event
            </button>
          </footer>
          </div>
        </aside>
        <CalendarDayEventList
          dayLabel={selectedDayLabel}
          events={dayEvents}
          selectedId={effectiveSelectedId}
          onSelect={setSelectedId}
          subtitle={(evt) =>
            `${evt.clientName}${
              evt.invoiceNumber !== '—' ? ` · #${evt.invoiceNumber}` : ''
            }`
          }
        />
      </div>

      {/* Client picker when adding without a filter */}
      {addOpen && !addClient && (
        <div
          className="invoice-dispute-modal-overlay assistant-add-event-modal-overlay"
          role="presentation"
          onClick={() => setAddOpen(false)}
        >
          <div
            className="invoice-dispute-modal assistant-add-event-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Pick a client"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: 'min(60vh, 420px)' }}
          >
            <div className="invoice-dispute-modal-header">
              <h3 className="text-base font-semibold">Pick a client</h3>
            </div>
            <div className="invoice-dispute-modal-body space-y-2 overflow-y-auto">
              {clients.length === 0 ? (
                <p className="text-sm text-slate-500">No clients found.</p>
              ) : (
                clients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm"
                    onClick={() => setAddClientId(c.id)}
                  >
                    {c.name}
                    {c.email ? (
                      <span className="block text-xs text-slate-400">{c.email}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {addClient && (
        <AssistantAddEventModal
          open={addOpen && Boolean(addClient)}
          defaultDate={selectedDate}
          invoices={invoices}
          clientId={addClient.id}
          clientName={addClient.name}
          clientEmail={addClient.email}
          createdBy="admin"
          onClose={() => setAddOpen(false)}
          onSaved={(event) => {
            setEvents((prev) => {
              const next = prev.filter((e) => e.id !== event.id)
              return [...next, event].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
            })
            setSelectedDate(event.dueDate)
            setCursorMonth(startOfMonth(parseDateKey(event.dueDate)))
            setSelectedId(event.id)
            setFilter('all')
          }}
        />
      )}
    </div>
  )
}
