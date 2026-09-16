/**
 * Next scheduled broker follow-up for an open collections invoice.
 * Used by the collections queue and staff/carrier calendars.
 */
import type { AssistantCalendarEvent } from '../types/assistant'
import type { Broker } from '../types/broker'
import type { Invoice } from '../types/invoice'
import {
  addCalendarDays,
  COLLECTIONS_POLICY,
  daysFromYmd,
  toYmd,
} from './collectionsPolicy'
import {
  getCollectionsTrackStage,
  resolvePaperworkCheckDays,
  resolvePaymentInquiryDays,
} from './collectionsTrack'
import { getEffectiveInvoiceDueDate } from './invoiceAging'
import { formatCurrency } from './format'
import { getPpwSentAt } from './ppwSent'

export type BrokerFollowupKind =
  | 'send_ppw'
  | 'paperwork_check'
  | 'payment_inquiry'
  | 'payment_followup'
  | 'payment_due'
  | 'callback'
  | 'will_pay'

export type NextBrokerFollowup = {
  /** Scheduled calendar day (YYYY-MM-DD). May be in the past when already due. */
  date: string
  kind: BrokerFollowupKind
  /** Short queue label, e.g. "Paperwork check". */
  label: string
  /** True when the scheduled day is today or earlier. */
  due: boolean
}

const CLOSED: ReadonlySet<Invoice['status']> = new Set([
  'paid',
  'pending',
  'hold',
  'rejected',
  'force_closed',
  'written_off',
  'write_off_pending',
  'review',
])

function isDueOn(date: string, asOf: Date): boolean {
  const days = daysFromYmd(date, asOf)
  return days != null && days >= 0
}

function followupAfterInquiry(
  invoice: Invoice,
  fallback: NextBrokerFollowup,
  asOf: Date
): NextBrokerFollowup {
  const lastInquiry = invoice.collections_last_inquiry_at
  if (!lastInquiry) return fallback
  const next = addCalendarDays(lastInquiry, COLLECTIONS_POLICY.followupAfterDays)
  if (!next) return fallback
  return {
    date: next,
    kind: 'payment_followup',
    label: 'Payment chase follow-up',
    due: isDueOn(next, asOf),
  }
}

/**
 * Next time Credyx follows up with the broker on this invoice.
 * Returns null for closed / not-yet-collections invoices.
 */
export function getNextBrokerFollowup(input: {
  invoice: Invoice
  broker?: Pick<Broker, 'paperwork_status_check_days' | 'payment_status_inquiry_days'> | null
  asOf?: Date
}): NextBrokerFollowup | null {
  const { invoice, broker } = input
  if (CLOSED.has(invoice.status)) return null

  const asOf = input.asOf ?? new Date()
  const today = toYmd(asOf)

  if (invoice.collection_status === 'C/B' && invoice.collection_date) {
    const date = invoice.collection_date.slice(0, 10)
    return { date, kind: 'callback', label: 'Call back', due: isDueOn(date, asOf) }
  }

  if (invoice.collection_status === 'W/P' && invoice.collection_date) {
    const wp = invoice.collection_date.slice(0, 10)
    const daysPast = daysFromYmd(wp, asOf) ?? -1
    if (daysPast >= COLLECTIONS_POLICY.willPayMissedDays) {
      const miss = addCalendarDays(wp, COLLECTIONS_POLICY.willPayMissedDays) ?? today
      return {
        date: miss,
        kind: 'payment_followup',
        label: 'Broker follow-up',
        due: isDueOn(miss, asOf),
      }
    }
    return { date: wp, kind: 'will_pay', label: 'Will Pay', due: isDueOn(wp, asOf) }
  }

  const stage = getCollectionsTrackStage({ invoice, broker, asOf })
  const ppwAt = getPpwSentAt(invoice)
  const dueDate = getEffectiveInvoiceDueDate(invoice)

  if (stage === 'no_ppw' || !ppwAt) {
    return { date: today, kind: 'send_ppw', label: 'Send paperwork', due: true }
  }

  if (stage === 'ppw_waiting') {
    const date = addCalendarDays(ppwAt, resolvePaperworkCheckDays(broker)) ?? today
    return {
      date,
      kind: 'paperwork_check',
      label: 'PPW chase email',
      due: isDueOn(date, asOf),
    }
  }

  if (stage === 'ppw_check') {
    const scheduled = addCalendarDays(ppwAt, resolvePaperworkCheckDays(broker)) ?? today
    return followupAfterInquiry(
      invoice,
      {
        date: scheduled,
        kind: 'paperwork_check',
        label: 'PPW chase email',
        due: isDueOn(scheduled, asOf),
      },
      asOf
    )
  }

  if (stage === 'payment_waiting') {
    if (dueDate) {
      return {
        date: dueDate.slice(0, 10),
        kind: 'payment_due',
        label: 'Payment chase email',
        due: isDueOn(dueDate, asOf),
      }
    }
    const date = addCalendarDays(ppwAt, resolvePaymentInquiryDays(broker)) ?? today
    return {
      date,
      kind: 'payment_inquiry',
      label: 'Payment chase email',
      due: isDueOn(date, asOf),
    }
  }

  const fallbackDate = dueDate?.slice(0, 10) || today
  return followupAfterInquiry(
    invoice,
    {
      date: fallbackDate,
      kind: 'payment_inquiry',
      label: 'Payment chase email',
      due: isDueOn(fallbackDate, asOf),
    },
    asOf
  )
}

/** Kinds already represented by dedicated calendar events (due / Will Pay / Call Back / Send PPW). */
const CALENDAR_DEDUP_KINDS: ReadonlySet<BrokerFollowupKind> = new Set([
  'send_ppw',
  'callback',
  'will_pay',
  'payment_due',
])

function formatShortDate(dateKey: string): string {
  const [y, m, day] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, day, 12, 0, 0, 0).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Calendar event for a scheduled broker follow-up.
 * Past-due dates land on today so overdue work stays visible.
 */
export function toBrokerFollowupCalendarEvent(opts: {
  invoice: Invoice
  followup: NextBrokerFollowup
  asOf?: Date
  audience: 'admin' | 'client'
}): AssistantCalendarEvent | null {
  const { invoice, followup, audience } = opts
  if (CALENDAR_DEDUP_KINDS.has(followup.kind)) return null

  const asOf = opts.asOf ?? new Date()
  const today = toYmd(asOf)
  const dueDate = followup.date < today ? today : followup.date
  const brokerLabel = invoice.broker_name
  const isClient = audience === 'client'

  const type: AssistantCalendarEvent['type'] =
    followup.kind === 'paperwork_check'
      ? isClient
        ? 'reminder'
        : 'paperwork_check'
      : followup.kind === 'payment_followup'
        ? 'reminder'
        : isClient
          ? 'reminder'
          : 'payment_status_check'

  const title =
    followup.kind === 'paperwork_check'
      ? 'PPW chase email'
      : followup.kind === 'payment_followup'
        ? 'Payment chase follow-up'
        : 'Payment chase email'

  const detail =
    followup.kind === 'paperwork_check'
      ? `Scheduled paperwork-status email to ${brokerLabel} for invoice #${invoice.invoice_number}. Sends when chase runs (Inbox “Run chase” or the email-lifecycle-chase cron).`
      : followup.kind === 'payment_followup'
        ? `Scheduled payment follow-up email to ${brokerLabel} for invoice #${invoice.invoice_number}.`
        : `Scheduled payment-status email to ${brokerLabel} for invoice #${invoice.invoice_number}. Sends when chase runs after paperwork is marked good.`

  return {
    id: `live-broker-followup-${invoice.id}`,
    type,
    title,
    invoiceNumber: invoice.invoice_number,
    invoiceId: invoice.id,
    brokerName: isClient ? brokerLabel : `${brokerLabel} · ${invoice.client_name}`,
    dueDate,
    dueLabel: formatShortDate(dueDate),
    owner: isClient ? 'system' : 'credyx_staff',
    status: 'pending',
    detail,
    amountLabel: formatCurrency(invoice.amount),
  }
}
