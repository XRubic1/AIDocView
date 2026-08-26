/** Assistant chat + calendar types (mock-first UI). */

export type AssistantRiskLevel = 'low' | 'medium' | 'high' | 'unrated'
export type AssistantConfidence = 'low' | 'medium' | 'high'

/**
 * Calendar event kinds.
 * Carrier portal surfaces: paperwork_check, expected_payment, payment_posted.
 * Credyx-only chase work (payment_status_check, reminder, escalate, call) stays
 * in the type union for future staff calendars but is not seeded for carriers.
 */
export type AssistantCalendarEventType =
  | 'paperwork_check'
  | 'payment_status_check'
  | 'reminder'
  | 'expected_payment'
  | 'payment_posted'
  | 'meeting'
  | 'escalate'
  | 'call'

/** Carrier-facing calendar types (excludes Credyx chase tasks). */
export const CARRIER_CALENDAR_EVENT_TYPES: readonly AssistantCalendarEventType[] = [
  'paperwork_check',
  'expected_payment',
  'payment_posted',
  'reminder',
  'meeting',
] as const

/** Event types a carrier or admin can create from the calendar UI. */
export type AssistantCreatableEventType =
  | 'paperwork_check'
  | 'expected_payment'
  | 'payment_posted'
  | 'reminder'
  | 'meeting'

export type AssistantEventStatus = 'pending' | 'done' | 'snoozed' | 'obsolete'

export type AssistantCalendarFilter = 'all' | 'my_tasks' | 'expected' | 'needs_me'

export type AssistantMessageKind =
  | 'plain'
  | 'action'
  | 'risk'
  | 'expected_payment'
  | 'email_draft'
  | 'note_draft'
  | 'dispute_draft'
  | 'payment_status'
  | 'ar_summary'
  | 'quiet'
  | 'followup_picker'
  | 'app_action'

export type AssistantActionStatus = 'pending' | 'done' | 'snoozed'

/** Clickable follow-up after an assistant reply. */
export type AssistantFollowUpAction = 'prompt' | 'email_scope' | 'note_scope' | 'app_nav'

export type AssistantFollowUp = {
  id: string
  label: string
  /** Sent as the next user message when action is prompt (default). */
  prompt?: string
  action?: AssistantFollowUpAction
  /** Catalog action id when action is app_nav. */
  appActionId?: string
}

/** Option in the email-scope picker (one invoice, all holds, or a broker). */
export type AssistantEmailScopeOption = {
  id: string
  label: string
  prompt: string
}

/** In-app destination the buddy can open (from catalog). */
export type AssistantAppAction = {
  id: string
  label: string
  description?: string
  path: string
  invoiceId?: string
  invoiceNumber?: string
}


/** Primary CTA on an action card. */
export type AssistantActionKind =
  | 'upload_docs'
  | 'check_payment'
  | 'review_invoice'
  | 'generic'

/** Credyx staff chase types shown on the admin calendar. */
export const ADMIN_CHASE_EVENT_TYPES: readonly AssistantCalendarEventType[] = [
  'payment_status_check',
  'reminder',
  'escalate',
  'call',
] as const

/** Task shown inside an action card. */
export type AssistantActionItem = {
  id: string
  title: string
  invoiceNumber: string
  invoiceId: string
  brokerName: string
  dueLabel: string
  status: AssistantActionStatus
  /** Defaults to generic (Complete / Snooze). */
  kind?: AssistantActionKind
  /** Optional face amount for compact list rows. */
  amountLabel?: string
  /** Hold reason / what’s missing — shown under the invoice line. */
  detail?: string
}

/** Cached-style broker risk payload for risk cards. */
export type AssistantRiskPayload = {
  brokerName: string
  mcNumber: string
  riskLevel: AssistantRiskLevel
  confidence: AssistantConfidence
  analyzedAtLabel: string
  invoiceCount: number
  notesRecencyLabel: string
  bullets: string[]
  recommendation: string
  ageCaveat?: string
}

/** Expected payment chip/card. */
export type AssistantExpectedPayment = {
  invoiceNumber: string
  invoiceId: string
  brokerName: string
  dateLabel: string
  confidence: AssistantConfidence
  source: 'confirmed' | 'forecast'
}

/** Who the draft email is addressed to. */
export type AssistantEmailAudience = 'broker' | 'credyx' | 'client' | 'other'

/** AI-generated email draft for review before sending from the user's mail client. */
export type AssistantEmailDraft = {
  audience: AssistantEmailAudience
  /** Resolved recipient email when known. */
  to: string
  /** Display name for the recipient. */
  toName: string
  subject: string
  body: string
  invoiceNumber?: string
  invoiceId?: string
  brokerName?: string
}

/** Visibility for notes posted from the Assistant (admin only toggles internal). */
export type AssistantNoteVisibility = 'client' | 'internal'

/** AI-generated invoice note draft — user confirms before posting. */
export type AssistantNoteDraft = {
  body: string
  invoiceNumber: string
  invoiceId: string
  brokerName?: string
  /** Admin: client-visible vs Credyx-only. Client portal always posts as client-visible. */
  visibility: AssistantNoteVisibility
}

/** Dispute reason keys — mirrors DISPUTE_REASON_OPTIONS in clientInvoiceActions. */
export type AssistantDisputeReason =
  | 'amount_discrepancy'
  | 'missing_documents'
  | 'broker_rejection'
  | 'payment_delay'
  | 'claim_dispute'
  | 'other'

/** AI-drafted invoice dispute — user reviews and confirms before it opens. */
export type AssistantDisputeDraft = {
  invoiceId: string
  invoiceNumber: string
  brokerName?: string
  reason: AssistantDisputeReason
  description: string
  /**
   * True when the carrier already uploaded after Credyx’s missing-docs notice.
   * UI shows a clear “you uploaded” banner so the dispute isn’t confused with
   * “please upload again.”
   */
  youUploaded?: boolean
  /** Short summary of the latest upload note, e.g. “Uploaded 1 document: R (1).png”. */
  uploadSummary?: string
  /** ISO timestamp of that upload, when known. */
  uploadAt?: string
}

/** Structured payment truth card (same math as Payments UI). */
export type AssistantPaymentStatusCard = {
  invoiceId: string
  invoiceNumber: string
  brokerName: string
  headline: string
  headlineLabel: string
  summary: string
  faceAmountLabel: string
  confirmedReceivedLabel: string
  /** Credyx-posted amount awaiting carrier receipt confirm. */
  postedAwaitingConfirmLabel?: string
  /** Still due after treating awaiting remittance as applied. */
  remainingAfterPendingLabel?: string
  /** Short/partial remittance awaiting confirmation. */
  isPartialRemittance?: boolean
  balanceDueLabel: string
  balanceTone: 'open' | 'short' | 'over' | 'zero'
  displayStatus: string
  variance: 'short_paid' | 'overpaid' | 'awaiting_credyx' | null
  invoiceStatus: string
  why?: {
    source: string
    paymentStatusLabel?: string
    reason?: string
    reversalType?: string
    date?: string
  }
  payments: Array<{
    id: string
    amountLabel: string
    statusLabel: string
    date: string
    reason?: string
  }>
}

/** Portfolio A/R overview card (growth + projection + charts — not an invoice list). */
export type AssistantArSummaryCard = {
  headline: string
  summary: string
  openArLabel: string
  openInvoiceCount: number
  onHoldLabel: string
  onHoldCount: number
  overdueLabel: string
  overdueCount: number
  dsoDays: number | null
  invoicedGrowthPct: number | null
  invoicedThisMonthLabel: string
  collectedGrowthPct: number | null
  collectedThisMonthLabel: string
  project7Label: string
  project30Label: string
  cashFlow: Array<{
    month: string
    monthKey: string
    invoiced: number
    collected: number
    invoice_count: number
    payment_count: number
  }>
  aging: {
    '1_15': number
    '16_30': number
    '31_45': number
    '46_60': number
    '61_90': number
    over_91: number
    total: number
  }
}

export type AssistantMessage = {
  id: string
  role: 'user' | 'assistant'
  kind: AssistantMessageKind
  createdAt: string
  /** Plain text for user bubbles and plain/quiet assistant replies. */
  text?: string
  actions?: AssistantActionItem[]
  risk?: AssistantRiskPayload
  expectedPayment?: AssistantExpectedPayment
  emailDraft?: AssistantEmailDraft
  noteDraft?: AssistantNoteDraft
  disputeDraft?: AssistantDisputeDraft
  paymentStatus?: AssistantPaymentStatusCard
  arSummary?: AssistantArSummaryCard
  /** Selectable next questions under this reply. */
  followUps?: AssistantFollowUp[]
  /** Scope choices after “Draft an email…” / “Add a note…”. */
  emailScopeOptions?: AssistantEmailScopeOption[]
  /** In-app navigation / workflow buttons. */
  appActions?: AssistantAppAction[]
}

export type AssistantCalendarEvent = {
  id: string
  type: AssistantCalendarEventType
  title: string
  invoiceNumber: string
  invoiceId: string
  brokerName: string
  /** ISO date YYYY-MM-DD */
  dueDate: string
  dueLabel: string
  owner: 'user' | 'system' | 'credyx_staff'
  status: AssistantEventStatus
  detail: string
  amountLabel?: string
  /** Optional join link (meetings). */
  meetingUrl?: string
}
