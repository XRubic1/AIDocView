import { useCallback, useEffect, useMemo, useState } from 'react'
import AssistantChatThread from '../components/client/assistant/AssistantChatThread'
import AssistantCalendar from '../components/client/assistant/AssistantCalendar'
import AssistantBriefing from '../components/client/assistant/AssistantBriefing'
import { buildAssistantBriefing } from '../utils/assistantBriefing'
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
type ChatPaneTab = 'today' | 'chat'

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
  const [payments, setPayments] = useState<Payment[]>([])
  const [paneTab, setPaneTab] = useState<ChatPaneTab>('today')
  const [chatPrompt, setChatPrompt] = useState<string | undefined>(undefined)
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
      setPayments([])
      return
    }
    const nextInvoices = getClientInvoices(clientId, clientName)
    const nextPayments = getClientPayments(clientId, clientName)
    setInvoices(nextInvoices)
    setPayments(nextPayments)
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

  const briefing = useMemo(() => buildAssistantBriefing(invoices, payments), [invoices, payments])

  const askAssistant = (prompt: string) => {
    setChatPrompt(prompt)
    setPaneTab('chat')
    setMobileTab('chat')
  }

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
        <div className="assistant-page__chat-head" style={{ display: 'flex', gap: 8 }}>
          <div className="assistant-cal__filters" role="tablist" aria-label="Assistant view">
            {(
              [
                ['today', 'Today'],
                ['chat', 'Ask'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={paneTab === id}
                className={`assistant-cal__filter${
                  paneTab === id ? ' assistant-cal__filter--active' : ''
                }`}
                onClick={() => setPaneTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {paneTab === 'today' ? (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <AssistantBriefing briefing={briefing} onAsk={askAssistant} />
          </div>
        ) : null}
        <div
          style={{
            display: paneTab === 'chat' ? 'flex' : 'none',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          }}
        >
          <AssistantChatThread initialPrompt={chatPrompt} />
        </div>
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
