import { FormEvent, useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { AssistantCreatableEventType } from '../../../types/assistant'
import type { Invoice } from '../../../types/invoice'
import type { SharedCalendarEvent } from '../../../data/sharedCalendarEvents'
import { useClientTheme } from '../../../theme/ThemeContext'
import { formatCurrency } from '../../../utils/format'
import { createSharedCalendarEvent } from '../../../services/calendarEventService'

interface AssistantAddEventModalProps {
  open: boolean
  /** Pre-fill date (selected calendar day). */
  defaultDate: string
  invoices: Invoice[]
  clientId: string
  clientName: string
  /** Used for notice emails. */
  clientEmail?: string
  createdBy: 'admin' | 'client'
  /** Pre-select the event type (e.g. from a Schedule meeting / Set reminder button). */
  initialType?: AssistantCreatableEventType
  onClose: () => void
  onSaved: (event: SharedCalendarEvent) => void
}

const TYPE_OPTIONS: { id: AssistantCreatableEventType; label: string }[] = [
  { id: 'meeting', label: 'Meeting' },
  { id: 'reminder', label: 'Reminder' },
  { id: 'paperwork_check', label: 'Missing docs' },
  { id: 'expected_payment', label: 'Expected payment' },
  { id: 'payment_posted', label: 'Payment posted' },
]

function formatDueLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return dateKey
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function defaultTitle(type: AssistantCreatableEventType): string {
  switch (type) {
    case 'meeting':
      return 'Meeting'
    case 'paperwork_check':
      return 'Upload missing docs'
    case 'expected_payment':
      return 'Expected payment'
    case 'payment_posted':
      return 'Payment posted'
    case 'reminder':
      return 'Reminder'
    default:
      return 'Event'
  }
}

function defaultDetail(type: AssistantCreatableEventType): string {
  switch (type) {
    case 'meeting':
      return 'Scheduled meeting between Credyx and the carrier.'
    case 'paperwork_check':
      return 'Documents are missing for this invoice. Upload to clear the hold.'
    case 'expected_payment':
      return 'Expected to be paid around this date.'
    case 'payment_posted':
      return 'Payment was posted for this invoice.'
    case 'reminder':
      return 'Reminder.'
    default:
      return ''
  }
}

/**
 * Modal to add a shared calendar event (client or admin).
 * Optionally emails both parties with a custom message / meeting link.
 */
export default function AssistantAddEventModal({
  open,
  defaultDate,
  invoices,
  clientId,
  clientName,
  clientEmail,
  createdBy,
  initialType: initialTypeProp,
  onClose,
  onSaved,
}: AssistantAddEventModalProps) {
  const c = useClientTheme()
  const titleId = useId()
  const openInvoices = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          inv.status !== 'paid' &&
          inv.status !== 'written_off' &&
          inv.status !== 'force_closed'
      ),
    [invoices]
  )
  const invoicePool = openInvoices.length > 0 ? openInvoices : invoices

  const initialType: AssistantCreatableEventType =
    initialTypeProp ?? (createdBy === 'admin' ? 'meeting' : 'reminder')

  const [type, setType] = useState<AssistantCreatableEventType>(initialType)
  const [dueDate, setDueDate] = useState(defaultDate)
  const [title, setTitle] = useState(defaultTitle(initialType))
  const [detail, setDetail] = useState(defaultDetail(initialType))
  const [invoiceRef, setInvoiceRef] = useState('')
  const [brokerName, setBrokerName] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [sendEmail, setSendEmail] = useState(createdBy === 'admin' || initialType === 'meeting')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailStatus, setEmailStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const nextType = initialTypeProp ?? (createdBy === 'admin' ? 'meeting' : 'reminder')
    setType(nextType)
    setDueDate(defaultDate)
    setTitle(defaultTitle(nextType))
    setDetail(defaultDetail(nextType))
    setInvoiceRef('')
    setBrokerName('')
    setMeetingUrl('')
    setEmailMessage('')
    setSendEmail(createdBy === 'admin' || nextType === 'meeting')
    setBusy(false)
    setError(null)
    setEmailStatus(null)
  }, [open, defaultDate, createdBy, initialTypeProp])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, busy])

  if (!open) return null

  const selectedInvoice = invoicePool.find((inv) => inv.id === invoiceRef)
  const showMeetingFields = type === 'meeting' || Boolean(meetingUrl) || createdBy === 'admin'

  const onTypeChange = (next: AssistantCreatableEventType) => {
    setType(next)
    setTitle((prev) => {
      const wasDefault = TYPE_OPTIONS.some((opt) => defaultTitle(opt.id) === prev)
      return wasDefault ? defaultTitle(next) : prev
    })
    setDetail((prev) => {
      const wasDefault = TYPE_OPTIONS.some((opt) => defaultDetail(opt.id) === prev)
      return wasDefault ? defaultDetail(next) : prev
    })
  }

  const onInvoiceChange = (id: string) => {
    setInvoiceRef(id)
    const inv = invoicePool.find((i) => i.id === id)
    if (inv) setBrokerName(inv.broker_name)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Add a short title for this event.')
      return
    }
    if (!dueDate) {
      setError('Pick a date.')
      return
    }
    if (!clientId) {
      setError('Missing client.')
      return
    }

    const inv = selectedInvoice
    const invoiceNumber = inv?.invoice_number ?? (invoiceRef ? invoiceRef : '—')
    const invoiceId = inv?.id ?? (invoiceRef || `custom-${Date.now()}`)
    const broker = brokerName.trim() || inv?.broker_name || '—'
    const owner: SharedCalendarEvent['owner'] =
      type === 'expected_payment' || type === 'payment_posted'
        ? 'system'
        : createdBy === 'admin'
          ? 'credyx_staff'
          : 'user'

    setBusy(true)
    setError(null)
    setEmailStatus(null)

    try {
      const result = await createSharedCalendarEvent({
        clientId,
        clientName,
        clientEmail,
        createdBy,
        sendEmail,
        type,
        title: trimmedTitle,
        invoiceNumber: String(invoiceNumber),
        invoiceId,
        brokerName: broker,
        dueDate,
        dueLabel: formatDueLabel(dueDate),
        owner,
        status: 'pending',
        detail: detail.trim() || defaultDetail(type),
        amountLabel: inv ? formatCurrency(inv.amount) : undefined,
        meetingUrl: meetingUrl.trim() || undefined,
        emailMessage: emailMessage.trim() || undefined,
      })

      if (sendEmail) {
        const parts: string[] = []
        if (result.email.client?.ok) parts.push('client emailed')
        else if (result.email.client?.error) parts.push(`client: ${result.email.client.error}`)
        if (result.email.admin?.ok) parts.push('admin emailed')
        else if (result.email.admin?.error) parts.push(`admin: ${result.email.admin.error}`)
        setEmailStatus(parts.join(' · ') || 'Email attempted')
      }

      onSaved(result.event)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save event')
    } finally {
      setBusy(false)
    }
  }

  const portalTarget =
    typeof document !== 'undefined'
      ? document.querySelector('.client-portal') ?? document.body
      : null

  if (!portalTarget) return null

  return createPortal(
    <div
      className="invoice-dispute-modal-overlay assistant-add-event-modal-overlay"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <div
        className="invoice-dispute-modal assistant-add-event-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="invoice-dispute-modal-header">
          <h3 id={titleId} className="text-base font-semibold" style={{ color: c.primary }}>
            {createdBy === 'admin'
              ? 'Add event for client'
              : type === 'meeting'
                ? 'Schedule a meeting'
                : type === 'reminder'
                  ? 'Set a reminder'
                  : 'Add calendar event'}
          </h3>
          <button
            type="button"
            className="p-1.5 rounded-lg client-header-icon-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
            style={{ color: c.muted }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form className="assistant-add-event-modal__form" onSubmit={(e) => void submit(e)}>
          <div className="invoice-dispute-modal-body space-y-3">
            {createdBy === 'admin' && (
              <p className="text-xs" style={{ color: c.secondary }}>
                Visible to <strong>{clientName}</strong> in their Assistant calendar.
                {clientEmail ? ` Notices go to ${clientEmail} and Credyx ops.` : ' Add a client email on file to notify them.'}
              </p>
            )}

            <div>
              <label className="assistant-add-event-modal__label" htmlFor="asst-evt-type">
                Type
              </label>
              <select
                id="asst-evt-type"
                className="client-input w-full"
                value={type}
                onChange={(e) => onTypeChange(e.target.value as AssistantCreatableEventType)}
              >
                {TYPE_OPTIONS.filter(
                  (opt) => createdBy === 'admin' || opt.id === 'meeting' || opt.id === 'reminder'
                ).map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="assistant-add-event-modal__label" htmlFor="asst-evt-date">
                Date
              </label>
              <input
                id="asst-evt-date"
                type="date"
                className="client-input w-full"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="assistant-add-event-modal__label" htmlFor="asst-evt-title">
                Title
              </label>
              <input
                id="asst-evt-title"
                type="text"
                className="client-input w-full"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What should appear on the calendar?"
                maxLength={80}
                required
              />
            </div>

            {showMeetingFields && (
              <div>
                <label className="assistant-add-event-modal__label" htmlFor="asst-evt-meet">
                  Meeting link
                </label>
                <input
                  id="asst-evt-meet"
                  type="url"
                  className="client-input w-full"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://meet.google.com/… or Zoom link"
                />
              </div>
            )}

            <div>
              <label className="assistant-add-event-modal__label" htmlFor="asst-evt-invoice">
                Invoice <span className="font-normal">(optional)</span>
              </label>
              <select
                id="asst-evt-invoice"
                className="client-input w-full"
                value={invoiceRef}
                onChange={(e) => onInvoiceChange(e.target.value)}
              >
                <option value="">No invoice</option>
                {invoicePool.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    #{inv.invoice_number} · {inv.broker_name} · {formatCurrency(inv.amount)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="assistant-add-event-modal__label" htmlFor="asst-evt-broker">
                Broker
              </label>
              <input
                id="asst-evt-broker"
                type="text"
                className="client-input w-full"
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                placeholder="Broker name"
                maxLength={80}
              />
            </div>

            <div>
              <label className="assistant-add-event-modal__label" htmlFor="asst-evt-detail">
                Notes
              </label>
              <textarea
                id="asst-evt-detail"
                className="client-input w-full"
                rows={2}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Shown on the calendar"
                maxLength={400}
              />
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: c.primary }}>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              <span>
                Email client and Credyx with this event
                <span className="block text-xs mt-0.5" style={{ color: c.secondary }}>
                  Include a custom message or meeting link below.
                </span>
              </span>
            </label>

            {sendEmail && (
              <div>
                <label className="assistant-add-event-modal__label" htmlFor="asst-evt-email-msg">
                  Email message
                </label>
                <textarea
                  id="asst-evt-email-msg"
                  className="client-input w-full"
                  rows={3}
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  placeholder="Reminder text, agenda, or anything you want both parties to see…"
                  maxLength={800}
                />
              </div>
            )}

            {error && (
              <p className="text-sm" style={{ color: c.error }} role="alert">
                {error}
              </p>
            )}
            {emailStatus && (
              <p className="text-xs" style={{ color: c.secondary }}>
                {emailStatus}
              </p>
            )}
          </div>

          <div className="invoice-dispute-modal-footer">
            <button
              type="button"
              className="dashboard-btn-secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="dashboard-btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Add event'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    portalTarget
  )
}
