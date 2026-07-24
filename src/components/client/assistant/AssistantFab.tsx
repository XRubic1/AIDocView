import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getMockDueTodayCount } from '../../../data/mockAssistantData'
import { getMockAdminDueTodayCount } from '../../../data/mockAdminAssistantData'
import { getClientInvoices, getClientPayments } from '../../../data/clientDemoData'
import { mockInvoices } from '../../../data/mockInvoices'
import { mockBrokers } from '../../../data/mockBrokers'
import { useClientSession } from '../../../hooks/useClientSession'
import { useTenantDataRevision } from '../../../hooks/useTenantDataRevision'
import { useDraggableFab } from '../../../hooks/useDraggableFab'
import AssistantBuddyFace from './AssistantBuddyFace'
import AssistantChatDrawer from './AssistantChatDrawer'
import AssistantNudgeBubble from './AssistantNudgeBubble'
import { useAssistantPageNudge } from '../../../hooks/useAssistantPageNudge'

interface AssistantFabProps {
  mode?: 'client' | 'admin'
}

/** Compact bubble footprint used for clamp + nudge offset. */
const FAB_SIZE_ADMIN = 44
/** Buddy pill is wider (“Hey” label) — use for edge clamp. */
const FAB_SIZE_BUDDY = 88

/**
 * Global floating Assistant bubble — smaller, higher by default, and draggable
 * so it doesn’t block page controls. Hidden on the full Assistant page.
 */
export default function AssistantFab({ mode = 'client' }: AssistantFabProps) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [starterPrompt, setStarterPrompt] = useState<string | undefined>()
  const location = useLocation()
  const { clientId, clientName } = useClientSession()
  const tenantRevision = useTenantDataRevision()
  const isClient = mode === 'client'
  const fabSize = isClient ? FAB_SIZE_BUDDY : FAB_SIZE_ADMIN

  const {
    fabRef,
    style: fabStyle,
    position,
    isDragging,
    shouldOpenOnClick,
    dragHandlers,
  } = useDraggableFab({
    storageKey: `credyx-assistant-fab-${mode}`,
    defaultRight: 16,
    defaultBottom: 72,
    size: fabSize,
  })

  const dueCount = useMemo(() => {
    if (mode === 'admin') return getMockAdminDueTodayCount(mockInvoices, mockBrokers)
    if (!clientId) return 0
    return getMockDueTodayCount(
      getClientInvoices(clientId, clientName),
      getClientPayments(clientId, clientName)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision bumps when tenant data changes
  }, [mode, clientId, clientName, tenantRevision])

  const onAssistantPage =
    mode === 'admin'
      ? location.pathname.startsWith('/admin/assistant')
      : location.pathname.startsWith('/client/assistant')

  const { nudge, dismiss } = useAssistantPageNudge({
    pathname: location.pathname,
    mode,
    enabled: !open && !onAssistantPage,
  })

  /** Open the chat, optionally asking a starter question straight away. */
  const openChat = (prompt?: string) => {
    setStarterPrompt(prompt)
    setOpen(true)
    dismiss()
  }

  if (onAssistantPage) return null

  const label =
    dueCount > 0
      ? `Hey — open Assistant, ${dueCount} need you today`
      : isClient
        ? 'Hey — ask me anything about your company'
        : 'Open Credyx Assistant'

  return (
    <>
      {!open && nudge && position && (
        <AssistantNudgeBubble
          help={nudge}
          fabPosition={position}
          fabSize={fabSize}
          onOpen={openChat}
          onDismiss={dismiss}
        />
      )}
      {!open && (
        <button
          ref={fabRef}
          type="button"
          className={`assistant-fab${isClient ? ' assistant-fab--buddy' : ''}${
            isDragging ? ' assistant-fab--dragging' : ''
          }`}
          style={fabStyle}
          title="Drag to move · click to open"
          aria-label={label}
          onClick={() => {
            if (shouldOpenOnClick()) openChat()
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          {...dragHandlers}
        >
          <AssistantBuddyFace
            size={isClient ? 28 : 24}
            className="assistant-fab__face"
            mood={hovered || dueCount > 0 || isDragging ? 'happy' : 'idle'}
            animated={!isDragging}
          />
          {isClient && <span className="assistant-fab__hey">Hey</span>}
          {dueCount > 0 && (
            <span className="assistant-fab__badge" aria-hidden>
              {dueCount > 9 ? '9+' : dueCount}
            </span>
          )}
        </button>
      )}
      <AssistantChatDrawer
        open={open}
        onClose={() => {
          setOpen(false)
          setStarterPrompt(undefined)
        }}
        mode={mode}
        initialPrompt={starterPrompt}
      />
    </>
  )
}
