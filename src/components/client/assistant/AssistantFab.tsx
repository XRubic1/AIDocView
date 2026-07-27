import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { getMockDueTodayCount } from '../../../data/mockAssistantData'
import { getMockAdminDueTodayCount } from '../../../data/mockAdminAssistantData'
import { getClientInvoices, getClientPayments } from '../../../data/clientDemoData'
import { mockInvoices } from '../../../data/mockInvoices'
import { mockBrokers } from '../../../data/mockBrokers'
import { useClientSession } from '../../../hooks/useClientSession'
import { useTenantDataRevision } from '../../../hooks/useTenantDataRevision'
import { useDraggableFab } from '../../../hooks/useDraggableFab'
import { useAssistantFabPlacement } from '../../../hooks/useAssistantFabPlacement'
import {
  subscribeAssistantOpen,
  subscribeAssistantUndock,
} from '../../../utils/assistantFabPlacement'
import AssistantBuddyFace from './AssistantBuddyFace'
import AssistantChatDrawer from './AssistantChatDrawer'
import AssistantNudgeBubble from './AssistantNudgeBubble'
import { useAssistantPageNudge } from '../../../hooks/useAssistantPageNudge'

interface AssistantFabProps {
  mode?: 'client' | 'admin'
}

const FAB_SIZE_ADMIN = 44
const FAB_SIZE_BUDDY = 88

/**
 * Floating Assistant buddy — drag to move, drop on trash to dock into the top nav.
 * Always owns the chat drawer (header buddy opens it via event when docked).
 */
export default function AssistantFab({ mode = 'client' }: AssistantFabProps) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [starterPrompt, setStarterPrompt] = useState<string | undefined>()
  const trashRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const { clientId, clientName } = useClientSession()
  const tenantRevision = useTenantDataRevision()
  const { isDocked, setPlacement } = useAssistantFabPlacement(mode)
  const isClient = mode === 'client'
  const fabSize = isClient ? FAB_SIZE_BUDDY : FAB_SIZE_ADMIN

  const {
    fabRef,
    style: fabStyle,
    position,
    isDragging,
    overTrash,
    shouldOpenOnClick,
    placeAt,
    dragHandlers,
  } = useDraggableFab({
    storageKey: `credyx-assistant-fab-${mode}`,
    defaultRight: 16,
    defaultBottom: 96,
    size: fabSize,
    enabled: !isDocked,
    trashRef,
    onDock: () => setPlacement('dock'),
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

  const showFloat = !isDocked && !onAssistantPage

  const { nudge, dismiss } = useAssistantPageNudge({
    pathname: location.pathname,
    mode,
    enabled: showFloat && !open && !isDragging,
  })

  const openChat = (prompt?: string) => {
    setStarterPrompt(prompt)
    setOpen(true)
    dismiss()
  }

  // Header buddy (and anything else) can open the drawer while docked.
  useEffect(() => {
    return subscribeAssistantOpen((prompt) => openChat(prompt))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable openChat via dismiss/setState
  }, [])

  // Dragging the header buddy down re-floats at the drop point.
  useEffect(() => {
    return subscribeAssistantUndock((pos) => {
      if (pos) {
        try {
          sessionStorage.setItem(
            `credyx-assistant-fab-${mode}`,
            JSON.stringify(pos)
          )
        } catch {
          // private mode
        }
      }
      setPlacement('float')
      if (pos) {
        // After float FAB remounts, reinforce the drop position.
        requestAnimationFrame(() => placeAt(pos.left, pos.top))
      }
    })
  }, [mode, placeAt, setPlacement])

  if (onAssistantPage) return null

  const label =
    dueCount > 0
      ? `Hey — open Assistant, ${dueCount} need you today`
      : isClient
        ? 'Hey — ask me anything about your company'
        : 'Open Credyx Assistant'

  return (
    <>
      {showFloat && !open && nudge && position && !isDragging && (
        <AssistantNudgeBubble
          help={nudge}
          fabPosition={position}
          fabSize={fabSize}
          onOpen={openChat}
          onDismiss={dismiss}
        />
      )}

      {showFloat && isDragging && (
        <div
          ref={trashRef}
          className={`assistant-fab-trash${overTrash ? ' assistant-fab-trash--hot' : ''}`}
          role="status"
          aria-live="polite"
        >
          <Trash2 className="w-5 h-5" aria-hidden />
          <span>{overTrash ? 'Release to dock in top bar' : 'Drag here to dock'}</span>
        </div>
      )}

      {showFloat && !open && (
        <button
          ref={fabRef}
          type="button"
          className={`assistant-fab${isClient ? ' assistant-fab--buddy' : ''}${
            isDragging ? ' assistant-fab--dragging' : ''
          }${overTrash ? ' assistant-fab--over-trash' : ''}`}
          style={fabStyle}
          title="Drag to move · drop on trash to dock · click to open"
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
