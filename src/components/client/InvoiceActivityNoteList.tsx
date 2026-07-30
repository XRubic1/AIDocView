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
}

interface InvoiceActivityNoteListProps {
  entries: ActivityNoteListEntry[]
  /** Full timeline — used to drop duplicates that live in other filter tabs. */
  contextEntries?: ActivityNoteListEntry[]
  emptyMessage: string
  emptyColor?: string
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

    // Document sent: quieter detail
    if (e.kind === 'send' || /^document sent/i.test(e.title)) {
      title = 'Sent to broker'
      if (detail) {
        // "ap@tql.example · delivered" → "Delivered"
        if (/delivered/i.test(detail)) detail = 'Delivered'
        else if (/failed/i.test(detail)) detail = 'Failed'
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

/**
 * Quiet flat feed — title + date, one body line. No source pills or card chrome.
 */
export function InvoiceActivityNoteList({
  entries,
  contextEntries,
  emptyMessage,
  emptyColor,
}: InvoiceActivityNoteListProps) {
  const rows = declutterActivityEntries(entries, contextEntries ?? entries)

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
        return (
          <li
            key={entry.id}
            className={`payment-confirmation-panel__note-row payment-confirmation-panel__note-row--${tone}`}
          >
            <div className="payment-confirmation-panel__note-row-head">
              <span className="payment-confirmation-panel__note-row-title">
                {entry.title}
                {entry.internal ? (
                  <span
                    className="payment-confirmation-panel__note-internal"
                    title="Visible to Credyx only"
                  >
                    Internal
                  </span>
                ) : null}
              </span>
              <time
                className="payment-confirmation-panel__note-row-date tabular-nums"
                dateTime={entry.timestamp}
              >
                {formatDate(entry.timestamp)}
              </time>
            </div>
            {entry.detail ? (
              <p className="payment-confirmation-panel__note-row-detail">{entry.detail}</p>
            ) : null}
            {entry.meta ? (
              <p className="payment-confirmation-panel__note-row-meta">{entry.meta}</p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
