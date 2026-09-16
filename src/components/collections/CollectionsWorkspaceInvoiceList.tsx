import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, Mail, Search } from 'lucide-react'
import type { AdminCollectionsRow } from '../../utils/adminCollections'
import {
  brokerRiskPillClass,
  brokerRiskPillLabel,
  chaseStatusLabel,
  chaseStatusPillClass,
  reviewReasonPillClass,
  reviewReasonPillLabel,
} from '../../utils/adminCollections'
import { formatCurrency, formatDate } from '../../utils/format'
import { sendManualBrokerChaseEmail } from '../../services/emailLifecycleService'
import { useToast } from '../ui/ToastProvider'
import { useClientTheme } from '../../theme/ThemeContext'
import { compareByClientName } from '../../utils/compareByClientName'

type CollectionsWorkspaceInvoiceListProps = {
  rows: AdminCollectionsRow[]
  selectedId: string | undefined
  search: string
  onSearchChange: (value: string) => void
  onSelect: (invoiceId: string) => void
}

type ContextMenuState = {
  x: number
  y: number
  row: AdminCollectionsRow
}

type ClientGroup = {
  clientId: string
  clientName: string
  rows: AdminCollectionsRow[]
  amount: number
}

/** Compact collections queue — carriers as parents, invoices nested underneath. */
export default function CollectionsWorkspaceInvoiceList({
  rows,
  selectedId,
  search,
  onSearchChange,
  onSelect,
}: CollectionsWorkspaceInvoiceListProps) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [chaseBusy, setChaseBusy] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const contextMenuRef = useRef<HTMLDivElement | null>(null)

  const groups = useMemo(() => {
    const byClient = new Map<string, ClientGroup>()
    for (const row of rows) {
      const clientId = row.invoice.client_id || row.invoice.client_name
      let group = byClient.get(clientId)
      if (!group) {
        group = {
          clientId,
          clientName: row.invoice.client_name,
          rows: [],
          amount: 0,
        }
        byClient.set(clientId, group)
      }
      group.rows.push(row)
      group.amount += row.amount
    }
    return [...byClient.values()].sort((a, b) =>
      compareByClientName(a.clientName, b.clientName, 'asc')
    )
  }, [rows])

  useEffect(() => {
    setExpandedIds(new Set(groups.map((g) => g.clientId)))
  }, [groups])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const openRowContextMenu = useCallback((event: ReactMouseEvent, row: AdminCollectionsRow) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, row })
  }, [])

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return
    const el = contextMenuRef.current
    const pad = 8
    const rect = el.getBoundingClientRect()
    let x = contextMenu.x
    let y = contextMenu.y
    if (x + rect.width > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - rect.width - pad)
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    if (x !== contextMenu.x || y !== contextMenu.y) {
      setContextMenu((prev) => (prev ? { ...prev, x, y } : prev))
    }
  }, [contextMenu])

  useEffect(() => {
    if (!contextMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }
    const onPointer = (e: PointerEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return
      closeContextMenu()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [contextMenu, closeContextMenu])

  const sendChaseFromMenu = useCallback(
    async (track: 'paperwork' | 'payment', step: 'first' | 'second') => {
      const row = contextMenu?.row
      closeContextMenu()
      if (!row) return
      if (!row.broker) {
        showToast('Broker not found on this invoice', 'error')
        return
      }
      setChaseBusy(true)
      try {
        const result = await sendManualBrokerChaseEmail(row.invoice, row.broker, { track, step })
        if (result.ok) {
          const label =
            track === 'paperwork'
              ? step === 'first'
                ? 'PPW chase email sent'
                : 'PPW chase follow-up sent'
              : step === 'first'
                ? 'Payment chase email sent'
                : 'Payment chase follow-up sent'
          showToast(result.error ? `${label} — ${result.error}` : label, result.error ? 'info' : 'success')
        } else {
          showToast(result.error ?? 'Send failed', 'error')
        }
      } finally {
        setChaseBusy(false)
      }
    },
    [closeContextMenu, contextMenu?.row, showToast]
  )

  const toggleGroup = (clientId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  return (
    <aside className="flex flex-col min-h-0 h-full" style={{ backgroundColor: c.card }}>
      <div className="shrink-0 px-3 py-2.5 border-b" style={{ borderColor: c.border }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: c.secondary }}>
          Collections queue
        </p>
        <label className="relative block">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: c.mutedLight }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search invoices…"
            className="client-input w-full !pl-8 !py-1.5 !text-sm"
            style={{ backgroundColor: c.surface, color: c.primary }}
          />
        </label>
      </div>

      <div className="invoice-list-scroll">
        {groups.length === 0 ? (
          <p className="p-4 text-sm" style={{ color: c.secondary }}>
            No invoices in this list.
          </p>
        ) : (
          groups.map((group) => {
            const open = expandedIds.has(group.clientId)
            return (
              <div key={group.clientId}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 border-b flex items-center gap-1.5 min-w-0"
                  style={{ borderColor: c.border, backgroundColor: c.surface }}
                  onClick={() => toggleGroup(group.clientId)}
                >
                  {open ? (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: c.secondary }} />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: c.secondary }} />
                  )}
                  <span className="text-sm font-semibold truncate flex-1" style={{ color: c.primary }}>
                    {group.clientName}
                  </span>
                  <span className="text-[11px] tabular-nums shrink-0" style={{ color: c.secondary }}>
                    {group.rows.length}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: c.primary }}>
                    {formatCurrency(group.amount)}
                  </span>
                </button>
                {open
                  ? group.rows.map((row) => {
                      const inv = row.invoice
                      const isActive = inv.id === selectedId
                      return (
                        <button
                          key={inv.id}
                          type="button"
                          onClick={() => onSelect(inv.id)}
                          onContextMenu={(e) => openRowContextMenu(e, row)}
                          className={`invoice-list-item !pl-6 ${isActive ? 'invoice-list-item--active' : ''} ${
                            row.isUrgent || row.isOverdue ? 'invoice-list-item--overdue' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-0.5 min-w-0">
                            <span className="text-sm font-semibold truncate" style={{ color: c.primary }}>
                              {inv.invoice_number}
                            </span>
                            <span
                              className="text-sm font-semibold tabular-nums shrink-0"
                              style={{ color: c.primary }}
                            >
                              {formatCurrency(row.amount)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                            <span className="truncate" style={{ color: c.secondary }}>
                              {inv.broker_name || '—'}
                            </span>
                            <span className="shrink-0 tabular-nums" style={{ color: c.secondary }}>
                              {row.ageDays}d
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 mt-1 text-[11px]" style={{ color: c.secondary }}>
                            {row.nextFollowup ? (
                              <span>
                                Chase {row.nextFollowup.due ? 'due' : '·'}{' '}
                                <span className="tabular-nums font-medium" style={{ color: c.primary }}>
                                  {formatDate(row.nextFollowup.date)}
                                </span>
                                {' · '}
                                {row.nextFollowup.label}
                              </span>
                            ) : null}
                            {row.lastFollowup ? (
                              <span>
                                Last · {row.lastFollowup.label}{' '}
                                <span className="tabular-nums">{formatDate(row.lastFollowup.at)}</span>
                              </span>
                            ) : (
                              <span>Last follow-up · Never</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {brokerRiskPillClass(row.brokerRiskLevel) ? (
                              <span className={brokerRiskPillClass(row.brokerRiskLevel)!}>
                                {brokerRiskPillLabel(row.brokerRiskLevel)}
                              </span>
                            ) : null}
                            {row.isUrgent || row.isUrgentCollection ? (
                              <span className="status-pill status-pill--urgent-collection">Urgent</span>
                            ) : null}
                            {row.urgentReasons.slice(0, 2).map((reason) => (
                              <span key={reason} className={reviewReasonPillClass(reason)}>
                                {reviewReasonPillLabel(reason, row.brokerRiskLevel)}
                              </span>
                            ))}
                            {row.chaseStatus !== 'not_due' ? (
                              <span className={chaseStatusPillClass(row.chaseStatus)}>
                                {chaseStatusLabel(row.chaseStatus)}
                              </span>
                            ) : null}
                            {row.collectionStatus === 'W/P' ? (
                              <span className="status-pill status-pill--approved">Will Pay</span>
                            ) : null}
                            {row.collectionStatus === 'C/B' ? (
                              <span className="status-pill status-pill--pending">Call back</span>
                            ) : null}
                          </div>
                        </button>
                      )
                    })
                  : null}
              </div>
            )
          })
        )}
      </div>

      <div className="invoice-list-footer text-[11px]" style={{ color: c.secondary }}>
        {groups.length} client{groups.length === 1 ? '' : 's'} · {rows.length} invoice
        {rows.length === 1 ? '' : 's'}
      </div>

      {contextMenu &&
        createPortal(
          <div
            ref={contextMenuRef}
            className="client-ai-doc-menu admin-batch-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <p className="client-ai-doc-menu__label">
              {contextMenu.row.invoice.invoice_number}
              {contextMenu.row.invoice.broker_name
                ? ` · ${contextMenu.row.invoice.broker_name}`
                : ''}
            </p>
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              disabled={chaseBusy}
              onClick={() => void sendChaseFromMenu('paperwork', 'first')}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Send PPW chase email
            </button>
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              disabled={chaseBusy}
              onClick={() => void sendChaseFromMenu('paperwork', 'second')}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Send PPW chase follow-up
            </button>
            <div className="client-ai-doc-menu__sep" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              disabled={chaseBusy}
              onClick={() => void sendChaseFromMenu('payment', 'first')}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Send payment chase email
            </button>
            <button
              type="button"
              role="menuitem"
              className="client-ai-doc-menu__item"
              disabled={chaseBusy}
              onClick={() => void sendChaseFromMenu('payment', 'second')}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Send payment chase follow-up
            </button>
          </div>,
          document.body
        )}
    </aside>
  )
}
