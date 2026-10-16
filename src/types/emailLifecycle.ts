/**
 * Email lifecycle types: tracks, inbox review, threads.
 */

export type PaperworkStatus = 'unknown' | 'good' | 'issue'

export type EmailLifecycleTrack = 'paperwork' | 'payment'

export type InboundClassification =
  | 'paperwork_ok'
  | 'payment_ok'
  | 'negative'
  | 'missing_docs'
  | 'claim'
  | 'unclear'
  | 'non_response_paperwork'
  | 'non_response_payment'
  /** Sales outreach copy or a carrier lead's reply (filed by email-inbound). */
  | 'sales'

export type ProposedAction =
  | 'add_note'
  | 'log_paperwork_good'
  | 'log_payment_ok'
  | 'hold_invoice'
  | 'notify_carrier'
  | 'staff_call'

export interface EmailTrackState {
  startedAt?: string
  firstAskedAt?: string
  secondAskedAt?: string
  lastInboundAt?: string
  lastAskChannel?: 'email' | 'phone'
  actionNeededAt?: string
  needsAttentionAt?: string
}

export interface InvoiceEmailLifecycle {
  paperwork_status: PaperworkStatus
  paperwork?: EmailTrackState
  payment?: EmailTrackState
  /**
   * When true, email-lifecycle payment chase is owned by a Live blueprint
   * (Then-do payment / follow-up emails). Cron + Run chase skip payment track.
   */
  blueprint_owns_chase?: boolean
  /**
   * When true, paperwork-status chase after PPW is owned by a Live blueprint
   * (Wait + follow-up Then-do). Cron + Run chase skip paperwork track.
   */
  blueprint_owns_paperwork?: boolean
  /** Latest broker reply reading: confirmed, rejected, or unknown. */
  last_reply_status?: 'confirmed' | 'rejected' | 'unknown'
}

export interface EmailThread {
  id: string
  invoice_id: string
  broker_id: string
  client_id: string
  subject: string
  created_at: string
  updated_at: string
}

export interface EmailMessage {
  id: string
  thread_id: string
  direction: 'inbound' | 'outbound'
  from_address: string
  to_address: string
  subject: string
  body_text: string
  sent_at: string
  template_id?: string
}

export interface EmailReviewItem {
  id: string
  created_at: string
  status: 'pending_review' | 'confirmed' | 'dismissed'
  thread_id?: string | null
  invoice_id: string | null
  broker_id: string | null
  client_id: string | null
  classification: InboundClassification
  proposed_actions: ProposedAction[]
  summary: string
  body_text: string
  from_address?: string
  to_address?: string
  subject?: string
  load_number?: string
  invoice_number?: string
  confirmed_at?: string
  confirmed_by?: string
  /** Simple reply reading. Derived from classification when older rows omit it. */
  reply_status?: 'confirmed' | 'rejected' | 'unknown'
  /** What Credyx had sent: paperwork status, payment status, or something else. */
  outbound_kind?: 'paperwork' | 'payment' | 'other'
}

export interface EmailTrackClockDefaults {
  firstAskDays: number
  actionNeededAfterFirst: boolean
  actionNeededAfterFirstDays: number
  secondFollowupDays: number
  needsAttentionAfterSecondDays: number
}

export interface BrokerEmailAccept {
  packet: boolean
  paperworkStatus: boolean
  paymentStatus: boolean
}

/** Carrier-facing next step for a load thread. */
export function nextActionLabel(lifecycle: InvoiceEmailLifecycle | undefined): string {
  if (!lifecycle) return 'Waiting on paperwork'
  if (lifecycle.paperwork?.needsAttentionAt || lifecycle.payment?.needsAttentionAt) {
    return 'Needs Credyx attention'
  }
  if (lifecycle.paperwork_status === 'issue') return 'Paperwork issue'
  if (lifecycle.paperwork_status !== 'good') {
    if (lifecycle.paperwork?.actionNeededAt) return 'Waiting on broker — paperwork'
    return 'Waiting on broker — paperwork'
  }
  if (lifecycle.payment?.actionNeededAt) return 'Waiting on broker — payment'
  if (lifecycle.payment?.firstAskedAt) return 'Paperwork good — payment status asked'
  return 'Paperwork good — payment next'
}
