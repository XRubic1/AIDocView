import { useNavigate } from 'react-router-dom'
import type { AssistantCalendarEvent } from '../../../types/assistant'
import { useClientSession } from '../../../hooks/useClientSession'
import {
  clientInvoiceDetailPath,
  clientInvoiceUploadPath,
  resolveClientInvoice,
} from '../../../utils/openClientInvoice'
import { stashAssistantPendingUpload } from '../../../utils/assistantTaskStore'

interface AssistantEventDetailProps {
  /** Selected day label, e.g. "Wed, Jul 24". */
  dayLabel: string | null
  dayEvents: AssistantCalendarEvent[]
  selectedId: string | null
  onSelectEvent: (eventId: string) => void
  /** Open the add-event modal for the selected day. */
  onAddEvent?: () => void
}

function typeLabel(type: AssistantCalendarEvent['type']): string {
  switch (type) {
    case 'paperwork_check':
      return 'Missing docs'
    case 'payment_status_check':
      return 'Payment check'
    case 'reminder':
      return 'Reminder'
    case 'expected_payment':
      return 'Expected pay'
    case 'payment_posted':
      return 'Payment posted'
    case 'meeting':
      return 'Meeting'
    case 'escalate':
      return 'Escalate'
    case 'call':
      return 'Call'
    default:
      return type
  }
}

/**
 * Persistent right rail — day agenda + selected event.
 * Always open; never closes or resizes the month grid.
 */
export default function AssistantEventDetail({
  dayLabel,
  dayEvents,
  selectedId,
  onSelectEvent,
  onAddEvent,
}: AssistantEventDetailProps) {
  const navigate = useNavigate()
  const { clientId, clientName } = useClientSession()
  const event = dayEvents.find((e) => e.id === selectedId) ?? null
  const isMissingDocs =
    event?.type === 'paperwork_check' && event.status === 'pending'

  const resolveInvoiceId = (): string | null => {
    if (!event) return null
    const match = resolveClientInvoice(clientId, clientName, {
      invoiceId: event.invoiceId,
      invoiceNumber: event.invoiceNumber,
    })
    if (match?.id) return match.id
    const fallback = event.invoiceId || event.invoiceNumber
    return fallback || null
  }

  const openInvoice = () => {
    const id = resolveInvoiceId()
    if (!id) return
    navigate(clientInvoiceDetailPath(id))
  }

  /** Carrier Upload CTA — opens invoice upload modal; completes after docs land. */
  const openUpload = () => {
    if (!event) return
    const id = resolveInvoiceId()
    if (!id) return
    stashAssistantPendingUpload({ eventId: event.id, invoiceId: id })
    navigate(clientInvoiceUploadPath(id))
  }

  return (
    <aside className="assistant-event-detail" aria-label="Day details">
      <header className="assistant-event-detail__header">
        <h2 className="assistant-event-detail__title">
          {dayLabel ?? 'Pick a day'}
        </h2>
        <p className="assistant-event-detail__sub">
          {dayEvents.length} item{dayEvents.length === 1 ? '' : 's'}
        </p>
      </header>

      <div className="assistant-event-detail__day-list" role="list">
        {dayEvents.length === 0 ? (
          <p className="assistant-event-detail__empty">No events this day.</p>
        ) : (
          dayEvents.map((evt) => (
            <button
              key={evt.id}
              type="button"
              role="listitem"
              className={`assistant-cal__row${
                selectedId === evt.id ? ' assistant-cal__row--active' : ''
              }${evt.status !== 'pending' ? ' assistant-cal__row--muted' : ''}`}
              onClick={() => onSelectEvent(evt.id)}
            >
              <span
                className={`assistant-cal__dot assistant-cal__dot--${evt.type}`}
                aria-hidden
              />
              <span className="assistant-cal__row-main">
                <span className="assistant-cal__row-title">{evt.title}</span>
                <span className="assistant-cal__row-sub">
                  #{evt.invoiceNumber} · {evt.brokerName}
                  {evt.amountLabel ? ` · ${evt.amountLabel}` : ''}
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      <div className="assistant-event-detail__body">
        {!event ? (
          <p className="assistant-event-detail__empty">
            {dayEvents.length > 0
              ? 'Select an item above for details.'
              : 'Click a day on the calendar.'}
          </p>
        ) : (
          <>
            <div className="assistant-event-detail__identity">
              <p className="assistant-event-detail__eyebrow">{typeLabel(event.type)}</p>
              <h3 className="assistant-event-detail__event-title">{event.title}</h3>
              <p className="assistant-event-detail__identity-sub">
                Invoice #{event.invoiceNumber} · {event.brokerName}
              </p>
            </div>
            <dl className="assistant-event-detail__grid">
              <div>
                <dt>When</dt>
                <dd>{event.dueLabel}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd style={{ textTransform: 'capitalize' }}>{event.status}</dd>
              </div>
              {event.amountLabel && (
                <div>
                  <dt>Amount</dt>
                  <dd className="tabular-nums">{event.amountLabel}</dd>
                </div>
              )}
              <div>
                <dt>Owner</dt>
                <dd>
                  {event.owner === 'user'
                    ? 'You'
                    : event.owner === 'credyx_staff'
                      ? 'Credyx'
                      : 'System'}
                </dd>
              </div>
            </dl>
            <p className="assistant-event-detail__detail">{event.detail}</p>
            {event.meetingUrl && (
              <a
                className="assistant-event-detail__meet-link"
                href={event.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Join meeting
              </a>
            )}
          </>
        )}
      </div>

      <footer className="assistant-event-detail__footer">
        {isMissingDocs && (
          <button
            type="button"
            className="dashboard-btn-primary"
            onClick={openUpload}
          >
            Upload
          </button>
        )}
        {event?.meetingUrl && (
          <a
            className="dashboard-btn-primary"
            href={event.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
          >
            Join
          </a>
        )}
        {onAddEvent && (
          <button
            type="button"
            className={
              isMissingDocs || event?.meetingUrl
                ? 'dashboard-btn-secondary'
                : 'dashboard-btn-primary'
            }
            onClick={onAddEvent}
          >
            Add event
          </button>
        )}
        {event && (
          <button
            type="button"
            className="dashboard-btn-secondary"
            onClick={openInvoice}
          >
            Invoice
          </button>
        )}
      </footer>
    </aside>
  )
}
