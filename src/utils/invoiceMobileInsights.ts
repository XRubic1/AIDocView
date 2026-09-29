import type { Invoice } from '../types/invoice'
import type { EnrichedInvoice } from './invoiceAging'
import type { BrokerRiskLevel } from '../types/brokerRisk'
import { isOpenArInvoice } from './invoiceAging'
import { formatCurrency, formatRelativeTime } from './format'
import { getOpenDisputes } from '../services/clientInvoiceActions'
import { invoiceHasPendingHoldPaperworkReview } from './holdPaperworkReview'
import { isClientVisibleHold, clientVisibleNotesForInvoice } from './clientInvoiceView'
import { deriveHoldExplanation } from './assistantHoldExplanation'
import { AMOUNT_EPSILON } from './paymentVariance'
import { invoiceListPriorityStatusLabel } from './invoiceListPriority'
import { getInvoiceDisputeOverviewNote } from './clientInvoiceDisputeStatus'
import { getCallBackOverviewNote, getWillPayOverviewNote } from './invoiceStatusHeadline'
import { resolveLastBrokerContact } from './adminCollections'
import { getInvoiceBlueprintChaseInsight } from './invoiceBlueprintChaseInsight'

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
  | 'short_pay'
  | 'over_pay'
  | 'shield'

export type InvoiceInsightAction = 'activity' | 'docs' | 'confirm_payment' | 'broker_risk' | 'none'

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
  /**
   * Shortfall vs invoice total including pending confirmation
   * (e.g. $450 when $2,550 is posted against a $3,000 invoice).
   */
  shortfallAmount?: number | null
  /** Carrier-facing reason for the short pay (payment notes / short_pay_reason). */
  shortPayReason?: string | null
  /**
   * Overage vs invoice total including pending confirmation
   * (e.g. $200 when $3,200 is posted against a $3,000 invoice).
   */
  overageAmount?: number | null
  /**
   * Amount of an awaiting-receipt short correction (payment_kind short).
   * When set, confirm UI shows as Short paid with the carrier-facing note.
   */
  awaitingShortAmount?: number | null
  /** Payment-receipt dispute description when invoice.disputes is empty. */
  paymentDisputeDescription?: string | null
  /** Carrier disputed a Credyx-posted remittance. */
  paymentDisputed?: boolean
  /** Carrier-visible Credyx Broker Risk — overview row only for medium/high. */
  brokerRiskLevel?: BrokerRiskLevel | null
  /** Admin invoice overview: live blueprint wait / next chase. */
  includeBlueprintChase?: boolean
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
  // Carrier already uploaded — wait for Credyx accept/reject instead of asking again.
  if (invoiceHasPendingHoldPaperworkReview(invoice)) return null

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
    shortfallAmount = null,
    shortPayReason = null,
    overageAmount = null,
    awaitingShortAmount = null,
    paymentDisputeDescription = null,
    paymentDisputed = false,
    brokerRiskLevel = null,
    includeBlueprintChase = false,
  } = input

  const insights: InvoiceMobileInsight[] = []
  const isOpen = isOpenArInvoice(invoice)
  const openDisputes = getOpenDisputes(invoice)
  // Hold is surfaced as the Action Required banner — skip duplicate insight row.
  const skipHoldInsight = Boolean(getCarrierInvoiceActionRequired(invoice))
  const shortfall =
    shortfallAmount != null && shortfallAmount >= AMOUNT_EPSILON ? shortfallAmount : 0
  const overage =
    overageAmount != null && overageAmount >= AMOUNT_EPSILON ? overageAmount : 0
  const awaitingShort =
    awaitingShortAmount != null && awaitingShortAmount >= AMOUNT_EPSILON
      ? awaitingShortAmount
      : 0
  const shortReason =
    shortPayReason?.trim() ||
    (shortfall > 0 || awaitingShort > 0
      ? 'Broker paid less than the invoice total'
      : '')
  const overReason =
    overage > 0 ? 'Broker paid more than the invoice total' : ''

  // Latest status note wins the top of the overview. An older open dispute
  // stays visible underneath (e.g. Will Pay posted after a carrier dispute).
  const willPayNote = getWillPayOverviewNote(invoice)
  if (willPayNote) {
    insights.push({
      id: 'will-pay',
      title: willPayNote.title,
      subtitle: willPayNote.note,
      tone: 'success',
      icon: 'dollar',
      action: 'activity',
    })
  }

  const callBackNote = getCallBackOverviewNote(invoice)
  if (callBackNote) {
    insights.push({
      id: 'call-back',
      title: callBackNote.title,
      subtitle: callBackNote.note,
      tone: 'info',
      icon: 'clock',
      action: 'activity',
    })
  }

  const disputeNote = getInvoiceDisputeOverviewNote(invoice, paymentDisputeDescription, {
    paymentDisputed,
  })
  if (disputeNote) {
    insights.push({
      id: 'dispute',
      title: disputeNote.title,
      subtitle: disputeNote.note,
      tone: 'alert',
      icon: 'alert',
      badge: openDisputes.length > 1 ? openDisputes.length : undefined,
      action: 'activity',
    })
  }

  if (brokerRiskLevel === 'high' || brokerRiskLevel === 'medium') {
    insights.push({
      id: 'broker-risk',
      title: brokerRiskLevel === 'high' ? 'High risk broker' : 'Medium risk broker',
      subtitle: `View ${invoice.broker_name} on the Brokers tab`,
      tone: 'alert',
      icon: 'shield',
      action: 'broker_risk',
    })
  }

  if (invoice.status === 'force_closed') {
    insights.push({
      id: 'force-closed',
      title: 'Invoice force closed',
      subtitle:
        'Credyx closed this after collections outreach — the broker did not remit. Removed from open A/R.',
      tone: 'alert',
      icon: 'alert',
      action: 'activity',
    })
  }

  if (invoice.status === 'written_off') {
    insights.push({
      id: 'written-off',
      title: 'Invoice written off',
      subtitle: 'This balance was written off and is no longer open A/R.',
      tone: 'alert',
      icon: 'alert',
      action: 'activity',
    })
  }

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

  if (hasAwaitingReceipt && awaitingShort > 0) {
    // Short correction on a paid/open invoice — show Short paid card with Credyx note.
    const daysHint =
      receiptDaysLeft != null
        ? ` · ${receiptDaysLeft} day${receiptDaysLeft === 1 ? '' : 's'} until auto-confirm`
        : ''
    insights.push({
      id: 'short-paid-awaiting',
      title: `Short paid · ${formatCurrency(awaitingShort)}`,
      subtitle: shortReason.includes('until auto-confirm')
        ? shortReason
        : `${shortReason}${daysHint}`,
      tone: 'alert',
      icon: 'short_pay',
      action: 'confirm_payment',
    })
  } else if (hasAwaitingReceipt) {
    insights.push({
      id: 'awaiting-receipt',
      title: 'Confirm payment receipt',
      subtitle:
        shortfall > 0
          ? `Short paid ${formatCurrency(shortfall)}${
              receiptDaysLeft != null
                ? ` · ${receiptDaysLeft} day${receiptDaysLeft === 1 ? '' : 's'} until auto-confirm`
                : ''
            }`
          : overage > 0
            ? `Overpayment ${formatCurrency(overage)}${
                receiptDaysLeft != null
                  ? ` · ${receiptDaysLeft} day${receiptDaysLeft === 1 ? '' : 's'} until auto-confirm`
                  : ''
              }`
            : receiptDaysLeft != null
              ? `${receiptDaysLeft} day${receiptDaysLeft === 1 ? '' : 's'} until auto-confirm payment`
              : 'Credyx posted a payment — confirm when funds arrive',
      tone: 'info',
      icon: 'dollar',
      action: 'confirm_payment',
    })
  }

  // Short paid only when remittance was applied and still left a gap — never for
  // unpaid open invoices (shortfall === face amount with $0 received).
  // Skip when awaiting short card already covers the correction.
  const isUnpaidOpenShortfall =
    shortfall >= invoice.amount - AMOUNT_EPSILON
  if (
    shortfall > 0 &&
    !isUnpaidOpenShortfall &&
    !hasAwaitingReceipt &&
    awaitingShort <= 0
  ) {
    insights.push({
      id: 'short-paid',
      title: `Short paid · ${formatCurrency(shortfall)}`,
      subtitle: shortReason,
      tone: 'alert',
      icon: 'short_pay',
      action: 'activity',
    })
  }

  // Overpayment when remittance exceeds face (confirmed or pending already counted).
  if (overage > 0 && !hasAwaitingReceipt) {
    insights.push({
      id: 'overpaid',
      title: `Overpayment · ${formatCurrency(overage)}`,
      subtitle: overReason,
      tone: 'success',
      icon: 'over_pay',
      action: 'activity',
    })
  }

  if (isOpen && invoice.status !== 'paid') {
    const lastContact = resolveLastBrokerContact(invoice)
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

  if (includeBlueprintChase) {
    const chase = getInvoiceBlueprintChaseInsight(invoice)
    if (chase) insights.push(chase)
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
  invoice: Invoice,
  options?: { awaitingReceipt?: boolean }
): string {
  return invoiceListPriorityStatusLabel({
    awaitingReceipt: options?.awaitingReceipt,
    status: invoice.status,
    displayStatus: enriched.displayStatus,
    isOverdue: enriched.isOverdue,
  })
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
