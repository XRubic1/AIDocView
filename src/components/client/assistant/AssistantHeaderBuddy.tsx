import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocation } from 'react-router-dom'
import AssistantBuddyFace from './AssistantBuddyFace'
import { useAssistantFabPlacement } from '../../../hooks/useAssistantFabPlacement'
import { useClientSession } from '../../../hooks/useClientSession'
import { useTenantDataRevision } from '../../../hooks/useTenantDataRevision'
import { getMockDueTodayCount } from '../../../data/mockAssistantData'
import { getMockAdminDueTodayCount } from '../../../data/mockAdminAssistantData'
import { getClientInvoices, getClientPayments } from '../../../data/clientDemoData'
import { mockInvoices } from '../../../data/mockInvoices'
import { mockBrokers } from '../../../data/mockBrokers'
import {
  requestAssistantOpen,
  requestAssistantUndock,
} from '../../../utils/assistantFabPlacement'

interface AssistantHeaderBuddyProps {
  mode?: 'client' | 'admin'
}

/**
 * Compact buddy in the top nav (next to theme toggle) when the floating bubble
 * has been dragged to the trash. Click opens chat; drag down out of the bar to float again.
 */
export default function AssistantHeaderBuddy({ mode = 'client' }: AssistantHeaderBuddyProps) {
  const { isDocked } = useAssistantFabPlacement(mode)
  const location = useLocation()
  const { clientId, clientName } = useClientSession()
  const tenantRevision = useTenantDataRevision()
  const [hovered, setHovered] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)

  const dueCount = useMemo(() => {
    if (mode === 'admin') return getMockAdminDueTodayCount(mockInvoices, mockBrokers)
    if (!clientId) return 0
    return getMockDueTodayCount(
      getClientInvoices(clientId, clientName),
      getClientPayments(clientId, clientName)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, clientId, clientName, tenantRevision])

  const onAssistantPage =
    mode === 'admin'
      ? location.pathname.startsWith('/admin/assistant')
      : location.pathname.startsWith('/client/assistant')

  if (!isDocked || onAssistantPage) return null

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
    suppressClickRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8) {
      drag.moved = true
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
    if (drag.moved && e.clientY > 56) {
      suppressClickRef.current = true
      const pos = { left: e.clientX - 22, top: e.clientY - 22 }
      try {
        sessionStorage.setItem(`credyx-assistant-fab-${mode}`, JSON.stringify(pos))
      } catch {
        // private mode
      }
      requestAssistantUndock(pos)
    }
  }

  return (
    <button
      type="button"
      className="assistant-header-buddy"
      title="Assistant — click to open · drag down to float again"
      aria-label={
        dueCount > 0
          ? `Open Assistant, ${dueCount} need you today`
          : 'Open Assistant'
      }
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          return
        }
        requestAssistantOpen()
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <AssistantBuddyFace
        size={32}
        className="assistant-header-buddy__face"
        mood={hovered || dueCount > 0 ? 'happy' : 'idle'}
        animated
      />
      {dueCount > 0 && (
        <span className="assistant-header-buddy__badge" aria-hidden>
          {dueCount > 9 ? '9+' : dueCount}
        </span>
      )}
    </button>
  )
}
