import { useCallback, useEffect, useState } from 'react'
import AssistantChatThread from '../components/client/assistant/AssistantChatThread'
import AssistantCalendar from '../components/client/assistant/AssistantCalendar'
import { getMockCalendarEvents } from '../data/mockAssistantData'
import { getClientInvoices, getClientPayments } from '../data/clientDemoData'
import type { AssistantCalendarEvent } from '../types/assistant'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import { useResizableLeadingPane } from '../hooks/useResizableLeadingPane'
import { useClientSession } from '../hooks/useClientSession'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { applyAssistantCompletions } from '../utils/assistantTaskStore'
import {
  getSharedCalendarEventsForClient,
  sharedEventToAssistantEvent,
  subscribeSharedCalendarEvents,
  type SharedCalendarEvent,
} from '../data/sharedCalendarEvents'

type MobileTab = 'chat' | 'calendar'

/** Merge live A/R-derived events with shared admin/client meetings. */
function buildCalendarEvents(
  clientId: string | undefined,
  invoices: Invoice[] = [],
  payments: Payment[] = []
): AssistantCalendarEvent[] {
  const live = getMockCalendarEvents(invoices, payments)
  if (!clientId) return live
  const shared = getSharedCalendarEventsForClient(clientId).map(sharedEventToAssistantEvent)
  const sharedIds = new Set(shared.map((e) => e.id))
  return applyAssistantCompletions([
    ...live.filter((e) => !sharedIds.has(e.id)),
    ...shared,
  ])
}

/**
 * Full Assistant page — chat + month calendar from live invoices/payments.
 * Desktop: drag the split handle to resize chat vs calendar.
 */
export default function ClientAssistant() {
  const { clientId, clientName, client } = useClientSession()
  const tenantRevision = useTenantDataRevision()
  const [events, setEvents] = useState<AssistantCalendarEvent[]>(() =>
    buildCalendarEvents(undefined)
  )
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')
  const [isNarrow, setIsNarrow] = useState(false)
  const { workspaceRef, paneWidth, isResizing, resizeHandleProps } =
    useResizableLeadingPane()

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const sync = () => setIsNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const refreshEvents = useCallback(() => {
    if (!clientId) {
      setEvents(buildCalendarEvents(undefined))
      setInvoices([])
      return
    }
    const nextInvoices = getClientInvoices(clientId, clientName)
    const nextPayments = getClientPayments(clientId, clientName)
    setInvoices(nextInvoices)
    setEvents(buildCalendarEvents(clientId, nextInvoices, nextPayments))
  }, [clientId, clientName])

  useEffect(() => {
    refreshEvents()
  }, [refreshEvents, tenantRevision])

  useEffect(() => {
    const onFocus = () => refreshEvents()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshEvents])

  useEffect(() => {
    if (!clientId) return
    return subscribeSharedCalendarEvents((changedClientId) => {
      if (changedClientId && changedClientId !== clientId) return
      refreshEvents()
    })
  }, [clientId, refreshEvents])

  const handleAddEvent = (_event: SharedCalendarEvent) => {
    refreshEvents()
  }

  return (
    <div
      ref={workspaceRef}
      className={`assistant-page${isResizing ? ' assistant-page--resizing' : ''}`}
    >
      <div className="assistant-page__mobile-tabs" role="tablist" aria-label="Assistant views">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'chat'}
          className={`assistant-page__mobile-tab${
            mobileTab === 'chat' ? ' assistant-page__mobile-tab--active' : ''
          }`}
          onClick={() => setMobileTab('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'calendar'}
          className={`assistant-page__mobile-tab${
            mobileTab === 'calendar' ? ' assistant-page__mobile-tab--active' : ''
          }`}
          onClick={() => setMobileTab('calendar')}
        >
          Calendar
        </button>
      </div>

      <div
        className={`assistant-page__pane assistant-page__pane--chat${
          mobileTab === 'chat' ? ' assistant-page__pane--mobile-show' : ''
        }`}
        style={
          !isNarrow
            ? { flex: `0 0 ${paneWidth}px`, width: paneWidth, maxWidth: 'none' }
            : undefined
        }
      >
        <div className="assistant-page__chat-head">
          <p className="assistant-page__chat-label">Hey — your trucking buddy</p>
        </div>
        <AssistantChatThread />
      </div>

      {!isNarrow && (
        <div
          className="assistant-page__resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat panel"
          aria-valuenow={Math.round(paneWidth)}
          aria-valuemin={280}
          aria-valuemax={640}
          tabIndex={0}
          {...resizeHandleProps}
        />
      )}

      <div
        className={`assistant-page__pane assistant-page__pane--cal${
          mobileTab === 'calendar' ? ' assistant-page__pane--mobile-show' : ''
        }`}
      >
        <AssistantCalendar
          events={events}
          invoices={invoices}
          clientId={clientId}
          clientName={clientName}
          clientEmail={client?.email}
          onAddEvent={handleAddEvent}
        />
      </div>
    </div>
  )
}
