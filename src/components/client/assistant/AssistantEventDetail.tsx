import { useNavigate } from 'react-router-dom'
import type { AssistantCalendarEvent } from '../../../types/assistant'
import type { Invoice } from '../../../types/invoice'
import { useClientSession } from '../../../hooks/useClientSession'
import {
  clientInvoiceDetailPath,
  clientInvoiceUploadPath,
  resolveClientInvoice,
} from '../../../utils/openClientInvoice'
import { stashAssistantPendingUpload } from '../../../utils/assistantTaskStore'
import {
  buildCalendarInvoiceFacts,
  findCalendarInvoice,
} from '../../../utils/calendarInvoiceDetails'
import CalendarInvoiceFactsPanel from '../../calendar/CalendarInvoiceFacts'

interface AssistantEventDetailProps {
  /** Selected day label, e.g. "Wed, Jul 24". */
  dayLabel: string | null
  dayEvents: AssistantCalendarEvent[]
  selectedId: string | null
  /** Open the add-event modal for the selected day. */
  onAddEvent?: () => void
  invoices?: Invoice[]
}

function typeLabel(event: AssistantCalendarEvent): string {
  if (event.type === 'expected_payment' && /^will pay$/i.test(event.title)) {
    return 'Will Pay'
  }
  switch (event.type) {
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
      return event.type
  }
}

/**
 * Persistent detail rail — selected event + invoice facts.
 * The day’s invoice list lives in a separate rightmost panel.
 */
export default function AssistantEventDetail({
  dayLabel,
  dayEvents,
  selectedId,
  onAddEvent,
  invoices = [],
}: AssistantEventDetailProps) {
  const navigate = useNavigate()
  const { clientId, clientName } = useClientSession()
  const event = dayEvents.find((e) => e.id === selectedId) ?? null
  const isMissingDocs =
    event?.type === 'paperwork_check' && event.status === 'pending'

  const invoice =
    event &&
    (findCalendarInvoice(invoices, {
      invoiceId: event.invoiceId,
      invoiceNumber: event.invoiceNumber,
      clientId,
    }) ||
      resolveClientInvoice(clientId, clientName, {
        invoiceId: event.invoiceId,
        invoiceNumber: event.invoiceNumber,
      }))
  const invoiceFacts = invoice
    ? buildCalendarInvoiceFacts(invoice, { includeInternal: false })
    : null

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
    <aside className="assistant-event-detail" aria-label="Invoice details">
      <header className="assistant-event-detail__header">
        <h2 className="assistant-event-detail__title">
          {event
            ? event.invoiceNumber && event.invoiceNumber !== '—'
              ? `Invoice #${event.invoiceNumber}`
              : event.title
            : dayLabel ?? 'Details'}
        </h2>
      </header>

      <div className="assistant-event-detail__scroll">
      <div className="assistant-event-detail__body">
        {!event ? (
          <p className="assistant-event-detail__empty">
            {dayEvents.length > 0
              ? 'Select an invoice from the list.'
              : 'Click a day on the calendar.'}
          </p>
        ) : (
          <>
            <div className="assistant-event-detail__identity">
              <p className="assistant-event-detail__eyebrow">{typeLabel(event)}</p>
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
            {invoiceFacts ? <CalendarInvoiceFactsPanel facts={invoiceFacts} /> : null}
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
      </div>
    </aside>
  )
}
