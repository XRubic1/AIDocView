import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import AssistantChatThread from '../components/client/assistant/AssistantChatThread'
import AdminSharedCalendar from '../components/admin/AdminSharedCalendar'
import { useResizableLeadingPane } from '../hooks/useResizableLeadingPane'

type MobileTab = 'chat' | 'calendar'

/**
 * Credyx staff Assistant — chat + shared calendar with chase tasks.
 */
export default function AdminAssistant() {
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

  return (
    <AdminLayout flushMain>
      <div
        ref={workspaceRef}
        className={`assistant-page admin-calendar-page${
          isResizing ? ' assistant-page--resizing' : ''
        }`}
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
            <p className="assistant-page__chat-label">Credyx Assistant</p>
          </div>
          <AssistantChatThread mode="admin" />
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
          <AdminSharedCalendar includeChaseTasks />
        </div>
      </div>
    </AdminLayout>
  )
}
