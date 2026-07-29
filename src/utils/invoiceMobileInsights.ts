import type { Invoice } from '../types/invoice'
import type { EnrichedInvoice } from './invoiceAging'
import { isOpenArInvoice } from './invoiceAging'
import { formatRelativeTime } from './format'
import { getOpenDisputes } from '../services/clientInvoiceActions'
import { isClientVisibleHold, clientVisibleNotesForInvoice } from './clientInvoiceView'
import { deriveHoldExplanation } from './assistantHoldExplanation'

export type InvoiceInsightTone = 'default' | 'alert' | 'success' | 'info'
export type InvoiceInsightIcon =
  | 'clock'
  | 'mail'
  | 'dollar'
  | 'alert'
  | 'check'
  | 'activity'
  | 'hold'
  | 'file'

export type InvoiceInsightAction = 'activity' | 'docs' | 'confirm_payment' | 'none'

export interface InvoiceMobileInsight {
  id: string
  title: string
  subtitle: string
  tone: InvoiceInsightTone
  icon: InvoiceInsightIcon
  /** Optional count badge (e.g. unread activity). */
  badge?: number
  action: InvoiceInsightAction
}

export interface InvoiceMobileInsightsInput {
  invoice: Invoice
  enriched: EnrichedInvoice
  /** Confirmed pay date when settled. */
  payDate?: string | null
  /** Days left to confirm an awaiting-receipt payment. */
  receiptDaysLeft?: number | null
  hasAwaitingReceipt?: boolean
  activityCount?: number
  documentCount?: number
}

/** Medium date for insight subtitles (e.g. May 15, 2024). */
function formatMediumDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export type CarrierActionRequiredCta = 'upload' | 'activity'

export interface CarrierInvoiceActionRequired {
  /** Short headline (e.g. Missing documents). */
  title: string
  /** Credyx hold note / what the carrier must do. */
  note: string
  cta: CarrierActionRequiredCta
  ctaLabel: string
}

const MISSING_DOCS_HOLD_RE =
  /pod|bol|doc|paper|missing|proof|rate.?con|lumper|scale|upload|incomplete/i

/**
 * Prefer the full On Hold activity note (what carriers see in Activity),
 * then the short hold_reason field, then derived fallback.
 */
function getOnHoldNoteText(invoice: Invoice): string {
  const holdNotes = clientVisibleNotesForInvoice(invoice)
    .filter((n) => n.type === 'hold_reason' && n.note?.trim())
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  const fromHistory = holdNotes[0]?.note?.trim()
  if (fromHistory) return fromHistory

  const fromField = invoice.hold_reason?.trim()
  if (fromField) return fromField

  const hold = deriveHoldExplanation(invoice, 'client')
  return (
    hold.missingNoticeText?.trim() ||
    hold.reason?.trim() ||
    'Credyx needs more information before this invoice can move forward.'
  )
}

/**
 * Carrier-facing Action Required for invoice details when Credyx has the invoice on hold.
 * Subtitle always comes from the On Hold note so the carrier sees exactly what Credyx asked for.
 */
export function getCarrierInvoiceActionRequired(
  invoice: Invoice
): CarrierInvoiceActionRequired | null {
  if (!isClientVisibleHold(invoice)) return null

  const note = getOnHoldNoteText(invoice)
  const needsDocs = MISSING_DOCS_HOLD_RE.test(note)

  return {
    title: 'Action required',
    note,
    cta: needsDocs ? 'upload' : 'activity',
    ctaLabel: needsDocs ? 'Upload documents' : 'View activity',
  }
}

/**
 * Builds tappable insight rows for the mobile invoice overview.
 * Only includes cards that apply to the current invoice state.
 */
export function getInvoiceMobileInsights(
  input: InvoiceMobileInsightsInput
): InvoiceMobileInsight[] {
  const {
    invoice,
    enriched,
    payDate,
    receiptDaysLeft,
    hasAwaitingReceipt,
    activityCount = 0,
    documentCount = 0,
  } = input

  const insights: InvoiceMobileInsight[] = []
  const isOpen = isOpenArInvoice(invoice)
  const openDisputes = getOpenDisputes(invoice)
  // Hold is surfaced as the Action Required banner — skip duplicate insight row.
  const skipHoldInsight = Boolean(getCarrierInvoiceActionRequired(invoice))

  if (invoice.status === 'hold' && !skipHoldInsight) {
    insights.push({
      id: 'hold',
      title: 'Invoice on hold',
      subtitle: invoice.hold_reason?.trim() || 'Waiting on paperwork or broker clarification',
      tone: 'alert',
      icon: 'hold',
      action: 'activity',
    })
  }

  if (isOpen && enriched.isOverdue) {
    const days = Math.max(1, enriched.daysOutstanding)
    insights.push({
      id: 'overdue',
      title: 'Payment is overdue',
      subtitle: `${days} day${days === 1 ? '' : 's'} past due`,
      tone: 'alert',
      icon: 'clock',
      action: 'none',
    })
  }

  if (hasAwaitingReceipt) {
    insights.push({
      id: 'awaiting-receipt',
      title: 'Confirm payment receipt',
      subtitle:
        receiptDaysLeft != null
          ? `${receiptDaysLeft} day${receiptDaysLeft === 1 ? '' : 's'} until auto-confirm payment`
          : 'Credyx posted a payment — confirm when funds arrive',
      tone: 'info',
      icon: 'dollar',
      action: 'confirm_payment',
    })
  }

  if (isOpen && invoice.status !== 'paid') {
    const lastContact = invoice.last_broker_contact
    const needsAttention = Boolean(invoice.collections_needs_attention)

    if (needsAttention || (lastContact && !invoice.collection_status)) {
      insights.push({
        id: 'broker-response',
        title: needsAttention ? 'No response from broker' : 'Broker follow-up',
        subtitle: lastContact
          ? `Last contact ${formatRelativeTime(lastContact)}`
          : invoice.broker_contacted
            ? 'Follow-up in progress'
            : 'Credyx will follow up with the broker',
        tone: needsAttention ? 'alert' : 'default',
        icon: 'mail',
        badge: needsAttention ? 1 : undefined,
        action: 'activity',
      })
    } else if (lastContact) {
      insights.push({
        id: 'broker-contact',
        title: 'Broker contacted',
        subtitle: `Last contact ${formatRelativeTime(lastContact)}`,
        tone: 'default',
        icon: 'mail',
        action: 'activity',
      })
    } else if (invoice.broker_contacted) {
      insights.push({
        id: 'broker-contacted',
        title: 'Broker follow-up started',
        subtitle: 'Credyx is chasing payment with the broker',
        tone: 'default',
        icon: 'mail',
        action: 'activity',
      })
    }
  }

  if (invoice.status === 'paid') {
    insights.push({
      id: 'payment-received',
      title: 'Payment received',
      subtitle: payDate
        ? `Confirmed ${formatMediumDate(payDate)}`
        : 'Paid in full',
      tone: 'success',
      icon: 'check',
      action: 'none',
    })
  } else if (isOpen && !hasAwaitingReceipt) {
    const expected = invoice.expected_payment_date || invoice.due_date
    insights.push({
      id: 'payment-expected',
      title: enriched.isOverdue ? 'Payment not received' : 'Expected payment',
      subtitle: expected
        ? `Expected: ${formatMediumDate(expected)}`
        : 'Expected date pending',
      tone: enriched.isOverdue ? 'alert' : 'default',
      icon: 'dollar',
      action: 'none',
    })
  }

  if (openDisputes.length > 0) {
    insights.push({
      id: 'dispute',
      title: openDisputes.length === 1 ? 'Open dispute' : `${openDisputes.length} open disputes`,
      subtitle: openDisputes[0]?.description?.trim() || 'Under review with Credyx',
      tone: 'alert',
      icon: 'alert',
      badge: openDisputes.length,
      action: 'activity',
    })
  }

  if (documentCount > 0) {
    insights.push({
      id: 'docs',
      title: 'Documents on file',
      subtitle: `${documentCount} file${documentCount === 1 ? '' : 's'} attached`,
      tone: 'default',
      icon: 'file',
      action: 'docs',
    })
  }

  insights.push({
    id: 'activity',
    title: 'Activity & notes',
    subtitle:
      activityCount > 0
        ? `${activityCount} update${activityCount === 1 ? '' : 's'}`
        : 'View timeline and notes',
    tone: 'default',
    icon: 'activity',
    badge: activityCount > 0 ? activityCount : undefined,
    action: 'activity',
  })

  return insights
}

/** Uppercase status label for the mobile hero pill. */
export function getMobileInvoiceStatusLabel(
  enriched: EnrichedInvoice,
  invoice: Invoice
): string {
  const raw = (enriched.displayStatus || invoice.status || '').replace(/_/g, ' ')
  if (raw === 'approved') return 'OPEN'
  if (raw === 'write off pending') return 'WRITE-OFF'
  if (raw === 'force closed') return 'CLOSED'
  if (raw === 'written off') return 'WRITTEN OFF'
  if (raw === 'hold') return 'ON HOLD'
  return raw.toUpperCase()
}

/** Display amount for the hero card. */
export function getMobileInvoiceHeroAmount(invoice: Invoice): number {
  if (invoice.status === 'paid' && invoice.paid_amount != null) {
    return invoice.paid_amount
  }
  return invoice.amount
}

export function formatMobileInvoiceDate(dateString: string): string {
  return formatMediumDate(dateString)
}
