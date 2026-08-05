import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  MessageSquare,
  PauseCircle,
  Send,
  Shield,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { formatDate, formatCurrency } from '../../utils/format'

export type ActivityNoteTone = 'neutral' | 'success' | 'warning' | 'error' | 'info'
export type ActivityNoteSource = 'carrier' | 'credyx'

export type ActivityNoteListEntry = {
  id: string
  title: string
  detail?: string
  timestamp: string
  source?: ActivityNoteSource
  meta?: string
  internal?: boolean
  tone?: ActivityNoteTone
  kind?: string
  /** When set with onRemoveNote, show a remove control (Credyx free-text notes). */
  removableNoteId?: string
}

interface InvoiceActivityNoteListProps {
  entries: ActivityNoteListEntry[]
  /** Full timeline — used to drop duplicates that live in other filter tabs. */
  contextEntries?: ActivityNoteListEntry[]
  emptyMessage: string
  emptyColor?: string
  /** Admin-only: remove a Credyx free-text note by its InvoiceNote id. */
  onRemoveNote?: (noteId: string) => void
}

/** Add thousands separators to bare $ amounts already embedded in prose. */
export function formatMoneyInText(text: string): string {
  return text.replace(
    /\$(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/g,
    (match, whole: string, dec?: string) => {
      const cleaned = whole.replace(/,/g, '')
      const n = Number(dec != null ? `${cleaned}.${dec}` : cleaned)
      if (!Number.isFinite(n)) return match
      return formatCurrency(n)
    }
  )
}

/** Drop demo-seed / file-list noise from secondary lines. */
function cleanMeta(meta?: string): string | undefined {
  if (!meta?.trim()) return undefined
  const t = meta.trim()
  if (/^demo seed/i.test(t)) return undefined
  // "Files: a.pdf, b.pdf…" or "Files: 4 attached" → "4 files"
  const named = t.match(/^Files:\s*(.+)$/i)
  if (named) {
    const rest = named[1].trim()
    const asCount = rest.match(/^(\d+)\s+attached$/i)
    if (asCount) {
      const n = Number(asCount[1])
      return `${n} file${n === 1 ? '' : 's'}`
    }
    const count = rest.split(',').map((s) => s.trim()).filter(Boolean).length
    return count > 0 ? `${count} file${count === 1 ? '' : 's'}` : undefined
  }
  return t
}

/**
 * Collapse duplicate / noisy timeline rows so All isn’t littered with the same story.
 * - Short-pay: keep Payment Posted, drop remittance Status + Action needed echoes
 * - Docs: keep Document sent, drop “PPW emailed…” Status
 * - Strip demo-seed meta; shorten file lists
 * @param entries rows to show
 * @param context full timeline (for knowing Payment Posted / Document sent exist)
 */
export function declutterActivityEntries<T extends ActivityNoteListEntry>(
  entries: T[],
  context: ActivityNoteListEntry[] = entries
): T[] {
  const hasPaymentPosted = context.some(
    (e) =>
      e.id.startsWith('payment-') ||
      /^payment posted$/i.test(e.title) ||
      /^short correction posted$/i.test(e.title)
  )
  const hasDocumentSent = context.some(
    (e) => e.kind === 'send' || e.kind === 'send_failed' || /^document sent/i.test(e.title)
  )

  const filtered = entries.filter((e) => {
    const detail = (e.detail || '').toLowerCase()
    const title = e.title.toLowerCase()

    // Same short-pay story already on Payment Posted
    if (hasPaymentPosted) {
      if (/broker remitted/.test(detail)) return false
      if (title === 'action needed' || /^action needed:/.test(detail)) return false
      if (/confirm this partial payment/.test(detail)) return false
    }

    // Document sent already covers broker email
    if (hasDocumentSent && (/^ppw emailed/.test(detail) || /ppw emailed to/.test(detail))) {
      return false
    }

    return true
  })

  return filtered.map((e) => {
    let title = e.title
    let detail = e.detail
    let meta = cleanMeta(e.meta)
    let tone = e.tone

    // Payment posted: lead with money; hide long refs / demo noise
    if (
      e.id.startsWith('payment-') ||
      /^payment posted$/i.test(e.title) ||
      /^short correction posted$/i.test(e.title)
    ) {
      // "$2,550.00 · ACH · Ref ACH-PARTIAL-2305" → "$2,550.00 · ACH"
      if (detail) {
        detail = detail.replace(/\s*·\s*Ref\s+\S+/i, '').trim()
      }
      // If a remittance status was collapsed, surface shortfall in the payment row
      const remittance = context.find((x) => /broker remitted/i.test(x.detail || ''))
      if (remittance?.detail) {
        const still = remittance.detail.match(/\(([^)]*still due)\)/i)
        if (still) {
          title = 'Partial payment'
          detail = [detail, still[1]].filter(Boolean).join(' · ')
          tone = 'warning'
        }
      }
    }

    // Document sent: keep recipient email, capitalize delivery status
    if (e.kind === 'send' || e.kind === 'send_failed' || /^document sent/i.test(e.title)) {
      title = 'Sent to broker'
      if (detail) {
        // "ap@tql.example · delivered" → "ap@tql.example · Delivered"
        const sep = detail.lastIndexOf(' · ')
        if (sep >= 0) {
          const email = detail.slice(0, sep).trim()
          const status = detail.slice(sep + 3).trim()
          const statusLabel =
            /^delivered$/i.test(status)
              ? 'Delivered'
              : /^failed$/i.test(status)
                ? 'Failed'
                : /^sent$/i.test(status)
                  ? 'Sent'
                  : status
          detail = email ? `${email} · ${statusLabel}` : statusLabel
        } else if (/^delivered$/i.test(detail)) {
          detail = 'Delivered'
        } else if (/^failed$/i.test(detail)) {
          detail = 'Failed'
        }
      }
    }

    // Approved / packet upload — keep short
    if (/^paperwork verified/i.test(detail || '')) {
      detail = 'Paperwork verified'
    }

    return {
      ...e,
      title,
      detail: detail ? formatMoneyInText(detail) : detail,
      meta: meta ? formatMoneyInText(meta) : undefined,
      tone,
    }
  })
}

/** Small icon for the timeline rail — keyed by kind / title. */
function ActivityRowIcon({
  entry,
}: {
  entry: ActivityNoteListEntry
}): ReactNode {
  const size = 12
  const stroke = 2.25
  const kind = (entry.kind || '').toLowerCase()
  const title = entry.title.toLowerCase()

  if (
    kind === 'payment' ||
    title.includes('payment') ||
    title.includes('short correction')
  ) {
    return <CircleDollarSign size={size} strokeWidth={stroke} aria-hidden />
  }
  if (kind === 'send' || kind === 'send_failed' || title.includes('sent to broker')) {
    return <Send size={size} strokeWidth={stroke} aria-hidden />
  }
  if (kind === 'approval' || title === 'approved') {
    return <CheckCircle2 size={size} strokeWidth={stroke} aria-hidden />
  }
  if (kind === 'hold_reason' || title.includes('hold')) {
    return <PauseCircle size={size} strokeWidth={stroke} aria-hidden />
  }
  if (kind === 'dispute' || kind === 'rejection' || title.includes('dispute')) {
    return <AlertTriangle size={size} strokeWidth={stroke} aria-hidden />
  }
  if (kind === 'status_update' || title === 'status') {
    return <Shield size={size} strokeWidth={stroke} aria-hidden />
  }
  if (kind === 'client_note' || kind === 'note' || title === 'note') {
    return <MessageSquare size={size} strokeWidth={stroke} aria-hidden />
  }
  return <FileText size={size} strokeWidth={stroke} aria-hidden />
}

/**
 * Clean activity timeline — rail + icon, title/date, one body line.
 * Removable Credyx notes require Confirm delete before calling onRemoveNote.
 */
export function InvoiceActivityNoteList({
  entries,
  contextEntries,
  emptyMessage,
  emptyColor,
  onRemoveNote,
}: InvoiceActivityNoteListProps) {
  const rows = declutterActivityEntries(entries, contextEntries ?? entries)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  if (rows.length === 0) {
    return (
      <p
        className="payment-confirmation-panel__notes-empty"
        style={emptyColor ? { color: emptyColor } : undefined}
      >
        {emptyMessage}
      </p>
    )
  }

  return (
    <ol className="payment-confirmation-panel__notes-list payment-confirmation-panel__notes-list--feed">
      {rows.map((entry) => {
        const tone = entry.tone || 'neutral'
        const canRemove = Boolean(onRemoveNote && entry.removableNoteId)
        const isPendingDelete =
          canRemove && pendingDeleteId === entry.removableNoteId
        return (
          <li
            key={entry.id}
            className={`payment-confirmation-panel__note-row payment-confirmation-panel__note-row--${tone}${
              isPendingDelete ? ' payment-confirmation-panel__note-row--pending-delete' : ''
            }`}
          >
            <span className="payment-confirmation-panel__note-row-rail" aria-hidden>
              <span className="payment-confirmation-panel__note-row-dot">
                <ActivityRowIcon entry={entry} />
              </span>
            </span>
            <div className="payment-confirmation-panel__note-row-content">
              <div className="payment-confirmation-panel__note-row-head">
                <span className="payment-confirmation-panel__note-row-title">
                  {entry.title}
                  {entry.source ? (
                    <span
                      className={`payment-confirmation-panel__note-row-source payment-confirmation-panel__note-row-source--${entry.source}`}
                    >
                      {entry.source === 'credyx' ? 'Credyx' : 'Carrier'}
                    </span>
                  ) : null}
                  {entry.internal ? (
                    <span
                      className="payment-confirmation-panel__note-internal"
                      title="Visible to Credyx only"
                    >
                      Internal
                    </span>
                  ) : null}
                </span>
                <span className="payment-confirmation-panel__note-row-aside">
                  <time
                    className="payment-confirmation-panel__note-row-date tabular-nums"
                    dateTime={entry.timestamp}
                  >
                    {formatDate(entry.timestamp)}
                  </time>
                  {canRemove && !isPendingDelete ? (
                    <button
                      type="button"
                      className="payment-confirmation-panel__note-row-remove"
                      title="Remove note"
                      aria-label="Remove Credyx note"
                      onClick={() => setPendingDeleteId(entry.removableNoteId!)}
                    >
                      <Trash2 size={12} strokeWidth={2.25} aria-hidden />
                    </button>
                  ) : null}
                </span>
              </div>
              {entry.detail ? (
                <p className="payment-confirmation-panel__note-row-detail">{entry.detail}</p>
              ) : null}
              {entry.meta ? (
                <p className="payment-confirmation-panel__note-row-meta">{entry.meta}</p>
              ) : null}
              {isPendingDelete ? (
                <div className="payment-confirmation-panel__note-row-delete-confirm">
                  <span className="payment-confirmation-panel__note-row-delete-label">
                    Delete this note?
                  </span>
                  <button
                    type="button"
                    className="payment-confirmation-panel__note-row-delete-yes"
                    onClick={() => {
                      const id = entry.removableNoteId!
                      setPendingDeleteId(null)
                      onRemoveNote?.(id)
                    }}
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    className="payment-confirmation-panel__note-row-delete-no"
                    onClick={() => setPendingDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
