import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  DollarSign,
  FileWarning,
  Phone,
  Search,
  type LucideIcon,
} from 'lucide-react'
import type { AssistantCalendarEvent } from '../../../types/assistant'
import { useClientSession } from '../../../hooks/useClientSession'
import {
  clientInvoiceDetailPath,
  clientInvoiceUploadPath,
  resolveClientInvoice,
} from '../../../utils/openClientInvoice'
import { stashAssistantPendingUpload } from '../../../utils/assistantTaskStore'
import '../../../styles/assistantAgenda.css'

const ICONS: Record<AssistantCalendarEvent['type'], LucideIcon> = {
  paperwork_check: FileWarning,
  payment_status_check: Search,
  reminder: Bell,
  expected_payment: DollarSign,
  payment_posted: DollarSign,
  meeting: CalendarDays,
  escalate: AlertTriangle,
  call: Phone,
}

/** Plain-language headline for a calendar event. */
export function plainEventTitle(evt: AssistantCalendarEvent): string {
  if (evt.type === 'paperwork_check') {
    return evt.status === 'pending' ? 'Upload missing documents' : 'Documents checked'
  }
  if (evt.type === 'payment_status_check') return 'Payment check-in'
  if (evt.type === 'expected_payment') return 'Payment expected'
  if (evt.type === 'payment_posted') return 'Payment received'
  return evt.title
}

export function isNeedsYou(evt: AssistantCalendarEvent): boolean {
  return (
    evt.status === 'pending' &&
    (evt.type === 'paperwork_check' ||
      evt.type === 'meeting' ||
      (evt.type === 'reminder' && (evt.owner === 'user' || evt.owner === 'credyx_staff')))
  )
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "Today", "Tomorrow", "In 3 days", "2 days ago", or a short date. */
export function relativeDueLabel(dueDate: string): { text: string; overdue: boolean } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((parseKey(dueDate).getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return { text: 'Today', overdue: false }
  if (diff === 1) return { text: 'Tomorrow', overdue: false }
  if (diff > 1 && diff <= 7) return { text: `In ${diff} days`, overdue: false }
  if (diff < 0 && diff >= -14) {
    return { text: `${-diff} day${diff === -1 ? '' : 's'} ago`, overdue: true }
  }
  return {
    text: parseKey(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    overdue: diff < 0,
  }
}

/** One simple event: what it is, which invoice, and the one thing to do next. */
export default function AssistantEventCard({ event }: { event: AssistantCalendarEvent }) {
  const navigate = useNavigate()
  const { clientId, clientName } = useClientSession()
  const Icon = ICONS[event.type] ?? CalendarDays
  const pending = event.status === 'pending'
  const needsYou = isNeedsYou(event)
  const due = relativeDueLabel(event.dueDate)
  const hasInvoice = Boolean(event.invoiceNumber && event.invoiceNumber !== '—')

  const resolveId = (): string | null => {
    const match = resolveClientInvoice(clientId, clientName, {
      invoiceId: event.invoiceId,
      invoiceNumber: event.invoiceNumber,
    })
    return match?.id || event.invoiceId || event.invoiceNumber || null
  }

  const openInvoice = () => {
    const id = resolveId()
    if (id) navigate(clientInvoiceDetailPath(id))
  }

  const openUpload = () => {
    const id = resolveId()
    if (!id) return
    stashAssistantPendingUpload({ eventId: event.id, invoiceId: id })
    navigate(clientInvoiceUploadPath(id))
  }

  const subParts = [
    hasInvoice ? `Invoice #${event.invoiceNumber}` : null,
    event.brokerName && event.brokerName !== '—' ? event.brokerName : null,
    event.amountLabel || null,
  ].filter(Boolean)

  return (
    <article className={`ast-card${needsYou ? ' is-action' : ''}${pending ? '' : ' is-done'}`}>
      <span className={`ast-card__icon ast-card__icon--${event.type}`} aria-hidden>
        <Icon size={16} strokeWidth={2.25} />
      </span>
      <div className="ast-card__main">
        <div className="ast-card__head">
          <h3 className="ast-card__title">{plainEventTitle(event)}</h3>
          <span className={`ast-card__due${due.overdue && pending ? ' is-overdue' : ''}`}>
            {pending ? due.text : 'Done'}
          </span>
        </div>
        {subParts.length > 0 ? <p className="ast-card__sub">{subParts.join(' · ')}</p> : null}
        {event.detail ? <p className="ast-card__detail">{event.detail}</p> : null}
        {pending && (needsYou || hasInvoice || event.meetingUrl) ? (
          <div className="ast-card__actions">
            {event.type === 'paperwork_check' ? (
              <button type="button" className="ast-btn ast-btn--primary" onClick={openUpload}>
                Upload documents
              </button>
            ) : null}
            {event.meetingUrl ? (
              <a
                className="ast-btn ast-btn--primary"
                href={event.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Join meeting
              </a>
            ) : null}
            {hasInvoice ? (
              <button type="button" className="ast-btn" onClick={openInvoice}>
                View invoice
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}
