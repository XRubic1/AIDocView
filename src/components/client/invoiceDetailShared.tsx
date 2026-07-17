import { Invoice, InvoiceNote } from '../../types/invoice'
import { formatDateTime } from '../../utils/format'
import {
  getOpenDisputes,
  getDisputeReasonLabel,
  getInvoiceDisputeRowBadge,
} from '../../services/clientInvoiceActions'
import { enrichInvoice, getOverdueSeverityLabel, AR_POLICY } from '../../utils/invoiceAging'
import {
  getClientInvoiceStatusParts,
  type InvoiceBalanceState,
} from '../../utils/paymentVariance'
import { useClientTheme } from '../../theme/ThemeContext'
import { clientVisibleNotes } from '../../utils/clientInvoiceView'

export const NOTE_TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  client_note: 'Client Note',
  hold_reason: 'On Hold',
  approval: 'Approved',
  rejection: 'Rejected',
  dispute: 'Dispute',
  status_update: 'Status',
}

/** Sorted notes for the timeline. Pass `includeInternal` for Credyx admin views. */
export function getInvoiceNoteEntries(
  invoice: Invoice,
  options?: { includeInternal?: boolean }
): InvoiceNote[] {
  const raw = options?.includeInternal
    ? [...(invoice.notes_history ?? [])]
    : clientVisibleNotes(invoice.notes_history)
  if (raw.length) {
    return raw.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  const fallback: InvoiceNote[] = []
  if (invoice.hold_reason) {
    fallback.push({
      id: 'hold-fallback',
      note: invoice.hold_reason,
      created_by: invoice.reviewed_by || 'Credyx',
      created_at: invoice.reviewed_at || invoice.updated_at || invoice.created_at,
      type: 'hold_reason',
    })
  }
  if (invoice.notes) {
    fallback.push({
      id: 'note-fallback',
      note: invoice.notes,
      created_by: invoice.reviewed_by || 'Credyx',
      created_at: invoice.created_at,
      type: 'note',
    })
  }
  return fallback
}

export function getInvoiceStatusBadge(status: string, options?: { compact?: boolean }) {
  const classMap: Record<string, string> = {
    pending: 'status-pill status-pill--pending',
    // Open A/R — blue, distinct from Paid (green)
    approved: 'status-pill status-pill--pending',
    hold: 'status-pill status-pill--hold',
    paid: 'status-pill status-pill--approved',
    rejected: 'status-pill status-pill--overdue',
    overdue: 'status-pill status-pill--overdue',
    force_closed: 'status-pill status-pill--overdue',
    written_off: 'status-pill status-pill--hold',
  }
  const labels: Record<string, string> = {
    pending: 'Pending',
    approved: 'Open',
    hold: 'On Hold',
    paid: 'Paid',
    rejected: 'Rejected',
    overdue: 'Overdue',
    force_closed: 'Force Closed',
    written_off: 'Written Off',
  }
  const base = classMap[status] || 'status-pill status-pill--pending'
  return (
    <span className={options?.compact ? `${base} status-pill--compact` : base}>
      {labels[status] || status}
    </span>
  )
}

/** Short paid / Overpaid / Awaiting Credyx companion pill. */
export function getInvoiceVarianceBadge(
  variance: 'short_paid' | 'overpaid' | 'awaiting_credyx' | null | undefined,
  options?: { compact?: boolean }
) {
  if (!variance) return null
  const className =
    variance === 'short_paid'
      ? 'status-pill status-pill--overdue'
      : variance === 'awaiting_credyx'
        ? 'status-pill status-pill--hold'
        : 'status-pill status-pill--approved'
  const label =
    variance === 'short_paid'
      ? 'Short paid'
      : variance === 'awaiting_credyx'
        ? 'Awaiting Credyx'
        : 'Overpaid'
  return (
    <span className={options?.compact ? `${className} status-pill--compact` : className}>
      {label}
    </span>
  )
}

/**
 * Primary + variance status for client invoice lists/detail.
 * Pass balance so Open/Paid reflects confirmed received (e.g. overpay → Paid + Overpaid).
 */
export function getInvoiceRowStatusBadge(
  invoice: Invoice & { displayStatus?: string },
  options?: {
    compact?: boolean
    balance?: InvoiceBalanceState
    pendingClientPosted?: number
    confirmedReceived?: number
  }
) {
  if (!options?.balance) {
    return getInvoiceStatusBadge(invoice.displayStatus || invoice.status, options)
  }
  const { status, variance } = getClientInvoiceStatusParts(invoice, options.balance, {
    pendingClientPosted: options.pendingClientPosted,
    confirmedReceived: options.confirmedReceived,
    invoiceAmount: invoice.amount,
  })
  return (
    <>
      {getInvoiceStatusBadge(status, options)}
      {getInvoiceVarianceBadge(variance, options)}
    </>
  )
}

const DISPUTE_BADGE_CLASS: Record<string, string> = {
  open: 'status-pill--overdue',
  reviewing: 'status-pill--hold',
  responded: 'status-pill--approved',
}

/** One dispute pill for invoice list / table rows. */
export function InvoiceDisputeBadges({ invoice }: { invoice: Invoice }) {
  const badge = getInvoiceDisputeRowBadge(invoice)
  if (!badge) return null

  return (
    <span
      className={`status-pill status-pill--compact ${DISPUTE_BADGE_CLASS[badge.variant] || 'status-pill--pending'}`}
      title={badge.label}
    >
      {badge.label}
    </span>
  )
}

export type InvoiceNoticeType = 'hold' | 'force_close' | 'overdue' | 'dispute'

export function getInvoiceNotice(
  invoice: Invoice,
  enriched: ReturnType<typeof enrichInvoice>,
  openDisputeCount: number,
  hasForceClose: boolean
): { type: InvoiceNoticeType; message: string } | null {
  if (invoice.status === 'hold') {
    return {
      type: 'hold',
      message: invoice.hold_reason
        ? `On hold — ${invoice.hold_reason}`
        : 'This invoice is currently on hold.',
    }
  }
  if (hasForceClose && enriched.isForceCloseEligible) {
    return {
      type: 'force_close',
      message: `${enriched.daysOutstanding} days past expected pay — eligible for force close (${AR_POLICY.forceCloseDays}+ days).`,
    }
  }
  if (enriched.isOverdue && enriched.overdueSeverity !== 'none') {
    return {
      type: 'overdue',
      message:
        enriched.overdueSeverity === 'force_close'
          ? `${enriched.daysOutstanding} days past expected pay.`
          : getOverdueSeverityLabel(enriched.overdueSeverity),
    }
  }
  if (openDisputeCount > 0) {
    return {
      type: 'dispute',
      message: `${openDisputeCount} open dispute${openDisputeCount !== 1 ? 's' : ''} — Credyx is reviewing.`,
    }
  }
  return null
}

interface InvoiceNotesTimelineProps {
  noteEntries: InvoiceNote[]
  openDisputes: ReturnType<typeof getOpenDisputes>
}

/** Legacy timeline markup used by overlay notes modal. */
export function InvoiceNotesTimeline({ noteEntries, openDisputes }: InvoiceNotesTimelineProps) {
  const c = useClientTheme()
  return (
    <>
      {openDisputes.length > 0 && (
        <div className="invoice-detail-disputes">
          {openDisputes.map((dispute) => (
            <div key={dispute.id} className="invoice-detail-dispute-entry">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold" style={{ color: '#991b1b' }}>
                  {getDisputeReasonLabel(dispute.reason)}
                </span>
                <span className="text-[11px]" style={{ color: c.secondary }}>
                  {formatDateTime(dispute.created_at)}
                </span>
              </div>
              <p className="invoice-detail-note-text">{dispute.description}</p>
              {dispute.response?.trim() && (
                <div className="invoice-detail-dispute-response">
                  <span className="invoice-detail-dispute-response-label">Credyx response</span>
                  <p className="invoice-detail-note-text">{dispute.response}</p>
                  {(dispute.responded_at || dispute.responded_by) && (
                    <p className="invoice-detail-note-meta">
                      {dispute.responded_at ? formatDateTime(dispute.responded_at) : ''}
                      {dispute.responded_by ? ` · ${dispute.responded_by}` : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {noteEntries.length === 0 ? (
        <p className="invoice-detail-empty">No notes on this invoice yet</p>
      ) : (
        <div className="invoice-detail-timeline">
          {noteEntries.map((entry) => {
            const typeKey = entry.type || 'note'
            return (
              <div
                key={entry.id}
                className={`invoice-detail-timeline-item invoice-detail-timeline-item--${typeKey}`}
              >
                <div className="invoice-detail-timeline-content">
                  <div className="invoice-detail-timeline-head">
                    <span className="invoice-detail-timeline-type">
                      {NOTE_TYPE_LABELS[typeKey] || 'Note'}
                    </span>
                    <span className="invoice-detail-timeline-time">
                      {formatDateTime(entry.created_at)}
                    </span>
                  </div>
                  <p className="invoice-detail-note-text">{entry.note}</p>
                  {entry.created_by && (
                    <p className="invoice-detail-note-meta">{entry.created_by}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export { InvoiceNoteCompose } from './InvoiceNoteCompose'
