import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Plus, Video } from 'lucide-react'
import type { Client } from '../../types/client'
import type { Invoice } from '../../types/invoice'
import type { SharedCalendarEvent } from '../../data/sharedCalendarEvents'
import {
  getSharedCalendarEventsForClient,
  subscribeSharedCalendarEvents,
} from '../../data/sharedCalendarEvents'
import { getClientInvoices } from '../../data/clientDemoData'
import AssistantAddEventModal from '../client/assistant/AssistantAddEventModal'

interface ClientCalendarPanelProps {
  client: Client
}

function typeLabel(type: SharedCalendarEvent['type']): string {
  switch (type) {
    case 'meeting':
      return 'Meeting'
    case 'paperwork_check':
      return 'Missing docs'
    case 'expected_payment':
      return 'Expected pay'
    case 'payment_posted':
      return 'Payment posted'
    case 'reminder':
      return 'Reminder'
    default:
      return type
  }
}

/**
 * Admin Clients tab — shared calendar for one carrier.
 * Events appear in the client Assistant calendar too.
 */
export default function ClientCalendarPanel({ client }: ClientCalendarPanelProps) {
  const [events, setEvents] = useState<SharedCalendarEvent[]>(() =>
    getSharedCalendarEventsForClient(client.id)
  )
  const [addOpen, setAddOpen] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])

  const todayKey = useMemo(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }, [])

  useEffect(() => {
    setEvents(getSharedCalendarEventsForClient(client.id))
    setInvoices(getClientInvoices(client.id, client.name))
  }, [client.id, client.name])

  useEffect(() => {
    return subscribeSharedCalendarEvents((clientId) => {
      if (clientId && clientId !== client.id) return
      setEvents(getSharedCalendarEventsForClient(client.id))
    })
  }, [client.id])

  const upcoming = useMemo(
    () => [...events].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [events]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Shared calendar</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Meetings and reminders visible to {client.name} in their Assistant calendar.
            Optional email goes to the client and Credyx ops.
          </p>
        </div>
        <button
          type="button"
          className="dashboard-btn-primary inline-flex items-center gap-1.5 text-xs h-8 px-3"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Add event
        </button>
      </div>

      {upcoming.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
          <CalendarPlus className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-600">No shared events yet.</p>
          <p className="text-xs text-slate-400 mt-1">
            Add a meeting or reminder — both sides will see it.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
          {upcoming.map((evt) => (
            <li key={evt.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
              <div className="min-w-[88px] shrink-0">
                <p className="text-xs font-semibold text-slate-900">{evt.dueLabel}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {evt.createdBy === 'admin' ? 'Credyx' : 'Client'}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {typeLabel(evt.type)}
                  </span>
                  <p className="text-sm font-semibold text-slate-900 truncate">{evt.title}</p>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{evt.detail}</p>
                {(evt.invoiceNumber && evt.invoiceNumber !== '—') || evt.brokerName !== '—' ? (
                  <p className="text-[11px] text-slate-400 mt-1">
                    {evt.invoiceNumber !== '—' ? `#${evt.invoiceNumber}` : ''}
                    {evt.brokerName !== '—' ? ` · ${evt.brokerName}` : ''}
                  </p>
                ) : null}
                {evt.meetingUrl && (
                  <a
                    href={evt.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 mt-1.5 hover:underline"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Join meeting
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AssistantAddEventModal
        open={addOpen}
        defaultDate={todayKey}
        invoices={invoices}
        clientId={client.id}
        clientName={client.name}
        clientEmail={client.email}
        createdBy="admin"
        onClose={() => setAddOpen(false)}
        onSaved={(event) => {
          setEvents((prev) => {
            const next = prev.filter((e) => e.id !== event.id)
            return [...next, event].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
          })
        }}
      />
    </div>
  )
}
