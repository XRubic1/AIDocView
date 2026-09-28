/** Guided dropdown catalogs for blueprint steps (UI only — no engine). */

export type BlueprintSubject = 'brokers' | 'invoices' | 'batches'

export type BlueprintCatalogOption = {
  id: string
  /** Dropdown label — short, plain English */
  label: string
  needsDays: boolean
  /** Label above the days input */
  daysHint?: string
  defaultDays?: string
  defaultTitle: string
  /** Plain line on the card; `{days}` replaced when needsDays */
  cardTemplate: string
  /** Longer explanation shown under the dropdown */
  help?: string
}

export type BlueprintActionOption = {
  id: string
  label: string
  defaultTitle: string
  /** Plain line under the title on the card — one action only */
  cardLine: string
}

export const TRIGGER_SUBJECT_OPTIONS: {
  id: BlueprintSubject
  label: string
  title: string
}[] = [
  { id: 'brokers', label: 'Brokers', title: 'Brokers that match' },
  { id: 'invoices', label: 'Invoices', title: 'Invoices that match' },
  { id: 'batches', label: 'Batches', title: 'Batches that match' },
]

/** Clock gates — one Wait until card per pause. */
export const BROKER_WAIT_UNTIL_OPTIONS: BlueprintCatalogOption[] = [
  {
    id: 'pause_days',
    label: 'Just wait X (simple timer)',
    needsDays: true,
    daysHint: 'How long to wait?',
    defaultDays: '3',
    defaultTitle: 'Simple wait',
    cardTemplate: 'Wait {days} days from this step',
    help: 'Not tied to payments. Wait this many days, hours, or minutes from this step, then go to the next card. Hours/minutes are best for testing.',
  },
  {
    id: 'no_payments_for',
    label: 'No confirmed payments for X days',
    needsDays: true,
    daysHint: 'How many days with no payment?',
    defaultDays: '30',
    defaultTitle: 'No payments yet',
    cardTemplate: 'Until {days} days with no confirmed payment',
    help: 'Looks at this broker’s payment history with you. Continues when that many days have passed without a confirmed payment.',
  },
  {
    id: 'avg_pay_late',
    label: 'Their average pay is X days late',
    needsDays: true,
    daysHint: 'How many days late on average?',
    defaultDays: '15',
    defaultTitle: 'Slow payor',
    cardTemplate: 'Until they usually pay {days} days late',
    help: 'Uses how late this broker typically pays vs due dates. Continues when that average late days hits the number you set.',
  },
]

export const INVOICE_WAIT_UNTIL_OPTIONS: BlueprintCatalogOption[] = [
  {
    id: 'net_plus_late',
    label: 'Broker Net terms + extra late days',
    needsDays: true,
    daysHint: 'Extra days after Net (e.g. 15)',
    defaultDays: '15',
    defaultTitle: 'Past Net + late',
    cardTemplate: 'Until Net terms + {days} late days',
    help: 'Net comes from the broker (e.g. Net 30). Continues when the invoice is that old PLUS the extra late days you type. Example: Net 30 + 15 = day 45 after the invoice date.',
  },
  {
    id: 'due_plus_late',
    label: 'Invoice due date + extra late days',
    needsDays: true,
    daysHint: 'Days after the due date',
    defaultDays: '15',
    defaultTitle: 'Past due date',
    cardTemplate: 'Until {days} days after the invoice due date',
    help: 'Due date is on the invoice (or invoice date + broker Net if none is set). Continues when that due date has passed by the number of days you type below. You do not pick the due date here — Credyx already has it on the invoice.',
  },
  {
    id: 'after_last_email',
    label: 'X days after our last email to this broker',
    needsDays: true,
    daysHint: 'Days after the last email',
    defaultDays: '5',
    defaultTitle: 'After last email',
    cardTemplate: 'Until {days} days after the last email',
    help: 'Starts counting from the last chase email Credyx sent on this invoice. Continues after that many days. Good for “wait a bit, then follow up.”',
  },
  {
    id: 'pause_days',
    label: 'Just wait X (simple timer)',
    needsDays: true,
    daysHint: 'How long to wait?',
    defaultDays: '3',
    defaultTitle: 'Simple wait',
    cardTemplate: 'Wait {days} days from this step',
    help: 'Not tied to due dates or Net. Wait days, hours, or minutes from this step. Hours/minutes are best for testing.',
  },
  {
    id: 'after_ppw',
    label: 'X days after paperwork was sent',
    needsDays: true,
    daysHint: 'Days after PPW (broker confirm window overrides this when set)',
    defaultDays: '7',
    defaultTitle: 'After PPW',
    cardTemplate: 'Until {days} days after PPW was sent',
    help: 'Counts from the paperwork packet send. If this broker has paperwork confirm days set, that number is used instead of the days on this card.',
  },
  {
    id: 'payment_clock',
    label: 'Due date + inquiry days',
    needsDays: true,
    daysHint: 'Days after the due date (broker inquiry days override this when set)',
    defaultDays: '15',
    defaultTitle: 'Payment inquiry clock',
    cardTemplate: 'Until {days} days after the due date, or from today if already due',
    help: 'If the due date is still ahead, wake is due date plus these days. If the due date has passed, wake is these days from now. A broker payment-inquiry day count replaces the days on this card.',
  },
]

/**
 * Event checks — When (not clocks).
 * Clocks live on Wait until cards.
 */
export const BROKER_EVENT_OPTIONS: BlueprintCatalogOption[] = [
  {
    id: 'broker_created',
    label: 'Broker was just created',
    needsDays: false,
    defaultTitle: 'New broker',
    cardTemplate: 'This broker was just added to Credyx',
    help: 'Fires once when someone adds a broker (catalog, Snapshot, or picker). Use for onboarding: note, urgent review, risk mark.',
  },
  {
    id: 'broker_replied',
    label: 'Broker replied',
    needsDays: false,
    defaultTitle: 'Broker replied',
    cardTemplate: 'The broker sent a reply',
  },
  {
    id: 'no_reply',
    label: 'No reply yet',
    needsDays: false,
    defaultTitle: 'No reply',
    cardTemplate: 'Still no reply from the broker',
  },
  {
    id: 'dispute_opened',
    label: 'Account dispute was opened',
    needsDays: false,
    defaultTitle: 'Dispute opened',
    cardTemplate: 'A carrier × broker dispute was opened',
    help: 'Fires when Credyx opens an account dispute with this broker. The Then-do emails the carrier.',
  },
  {
    id: 'broker_cancelled',
    label: 'Broker cancelled',
    needsDays: false,
    defaultTitle: 'Broker cancelled',
    cardTemplate: 'This broker was cancelled',
  },
  {
    id: 'payment_posted',
    label: 'A payment was posted',
    needsDays: false,
    defaultTitle: 'Payment posted',
    cardTemplate: 'A payment showed up',
  },
]

export const INVOICE_EVENT_OPTIONS: BlueprintCatalogOption[] = [
  {
    id: 'invoice_processed',
    label: 'Invoice was processed',
    needsDays: false,
    defaultTitle: 'Invoice processed',
    cardTemplate: 'This invoice was just processed (batch Process)',
    help: 'Fires when admin hits Process on the batch that contains this invoice (invoice becomes approved or hold). Use for per-invoice follow-up after Process.',
  },
  {
    id: 'broker_replied',
    label: 'Broker replied',
    needsDays: false,
    defaultTitle: 'Broker replied',
    cardTemplate: 'The broker sent a reply',
  },
  {
    id: 'no_reply',
    label: 'No reply yet',
    needsDays: false,
    defaultTitle: 'No reply',
    cardTemplate: 'Still no reply from the broker',
  },
  {
    id: 'payment_posted',
    label: 'Payment was posted',
    needsDays: false,
    defaultTitle: 'Paid',
    cardTemplate: 'Payment was posted on this invoice',
  },
  {
    id: 'on_hold',
    label: 'Invoice went on hold',
    needsDays: false,
    defaultTitle: 'On hold',
    cardTemplate: 'Invoice is on hold',
  },
  {
    id: 'ppw_sent',
    label: 'Paperwork packet was sent',
    needsDays: false,
    defaultTitle: 'Paperwork sent',
    cardTemplate: 'PPW packet was sent to the broker',
    help: 'True after Credyx has sent the paperwork packet. The run waits here until that send is on file.',
  },
  {
    id: 'paperwork_good',
    label: 'Paperwork status is good',
    needsDays: false,
    defaultTitle: 'Paperwork good',
    cardTemplate: 'Paperwork status is logged good',
    help: 'True when staff (or a confirmed broker reply, later) has logged paperwork as good. Payment chase waits here until then.',
  },
  {
    id: 'broker_confirmed',
    label: 'Broker confirmed',
    needsDays: false,
    defaultTitle: 'Broker confirmed',
    cardTemplate: 'Broker confirmed this invoice',
    help: 'Good to go, will pay, or a date. The reply reader sets this.',
  },
  {
    id: 'broker_rejected',
    label: 'Broker rejected',
    needsDays: false,
    defaultTitle: 'Broker rejected',
    cardTemplate: 'Broker rejected this invoice',
    help: 'Not received, missing pages, missing lumper, or another rejection.',
  },
  {
    id: 'broker_unknown',
    label: 'Reply could not be read',
    needsDays: false,
    defaultTitle: 'Reply unknown',
    cardTemplate: 'Credyx could not read this broker reply',
    help: 'The reply reader could not tell. Use this graph to decide what happens.',
  },
]

/** One action per card — never combine email + mark urgent in one pick. */
export const BROKER_ACTION_OPTIONS: BlueprintActionOption[] = [
  {
    id: 'mark_good',
    label: 'Mark as good',
    defaultTitle: 'Mark as good',
    cardLine: 'This broker looks fine',
  },
  {
    id: 'mark_review',
    label: 'Needs a human look',
    defaultTitle: 'Needs a look',
    cardLine: 'Someone should review this broker',
  },
  {
    id: 'mark_bad',
    label: 'Mark as bad',
    defaultTitle: 'Mark as bad',
    cardLine: 'This broker is a problem',
  },
  {
    id: 'add_note',
    label: 'Add a note',
    defaultTitle: 'Add note',
    cardLine: 'Write a note on this broker',
  },
  {
    id: 'urgent_review',
    label: 'Flag for urgent review',
    defaultTitle: 'Urgent review',
    cardLine: 'Needs urgent review',
  },
  {
    id: 'push_notify',
    label: 'Send a push notification',
    defaultTitle: 'Notify team',
    cardLine: 'Send a push notification',
  },
  {
    id: 'email_carrier_dispute',
    label: 'Email: dispute opened (carrier)',
    defaultTitle: 'Email carrier',
    cardLine: 'Tell the carrier a dispute was opened with this broker',
  },
]

/** Batch clocks — simple pause for now. */
export const BATCH_WAIT_UNTIL_OPTIONS: BlueprintCatalogOption[] = [
  {
    id: 'pause_days',
    label: 'Just wait X (simple timer)',
    needsDays: true,
    daysHint: 'How long to wait?',
    defaultDays: '1',
    defaultTitle: 'Simple wait',
    cardTemplate: 'Wait {days} days from this step',
    help: 'Fixed pause after Process. Days, hours, or minutes — hours/minutes help when testing.',
  },
]

export const BATCH_EVENT_OPTIONS: BlueprintCatalogOption[] = [
  {
    id: 'batch_processed',
    label: 'Batch was processed',
    needsDays: false,
    defaultTitle: 'Batch processed',
    cardTemplate: 'This batch was just processed / submitted',
    help: 'Fires when admin hits Process and the batch moves to submitted. Use Then-do for carrier “batch processed” email (skips Settings send when Live runner owns it).',
  },
]

export const BATCH_ACTION_OPTIONS: BlueprintActionOption[] = [
  {
    id: 'email_carrier_batch_processed',
    label: 'Email: batch processed (carrier)',
    defaultTitle: 'Email carrier',
    cardLine: 'Email the carrier that this batch was processed',
  },
  {
    id: 'add_note',
    label: 'Add a staff note (admin alert)',
    defaultTitle: 'Add note',
    cardLine: 'Log a note for Credyx ops on this batch',
  },
  {
    id: 'urgent_review',
    label: 'Flag for urgent review',
    defaultTitle: 'Urgent review',
    cardLine: 'Needs urgent Credyx review',
  },
  {
    id: 'push_notify',
    label: 'Send a push notification',
    defaultTitle: 'Notify team',
    cardLine: 'Send a push notification to the team',
  },
  {
    id: 'email_ops_alert',
    label: 'Email: ops alert',
    defaultTitle: 'Email ops',
    cardLine: 'Email Credyx ops about an intake or verification issue',
  },
]

export const INVOICE_ACTION_OPTIONS: BlueprintActionOption[] = [
  {
    id: 'email_broker_packet',
    label: 'Email: broker paperwork packet',
    defaultTitle: 'Send packet to broker',
    cardLine: 'Send invoice docs / PPW packet to the broker',
  },
  {
    id: 'email_payment_status',
    label: 'Email: payment status check',
    defaultTitle: 'Ask payment status',
    cardLine: 'Email the broker about payment status',
  },
  {
    id: 'email_followup',
    label: 'Email: follow-up',
    defaultTitle: 'Follow-up email',
    cardLine: 'Send a follow-up email to the broker',
  },
  {
    id: 'add_note',
    label: 'Add a note',
    defaultTitle: 'Add note',
    cardLine: 'Write a note on this invoice',
  },
  {
    id: 'mark_urgent',
    label: 'Mark invoice as urgent',
    defaultTitle: 'Mark urgent',
    cardLine: 'Mark this invoice as urgent',
  },
  {
    id: 'create_task',
    label: 'Create a staff task',
    defaultTitle: 'Create a task',
    cardLine: 'Add a task for the Credyx team',
  },
  {
    id: 'notify_carrier',
    label: 'Notify the carrier',
    defaultTitle: 'Notify carrier',
    cardLine: 'Tell the carrier what is going on',
  },
  {
    id: 'push_notify',
    label: 'Send a push notification',
    defaultTitle: 'Notify team',
    cardLine: 'Send a push notification',
  },
  {
    id: 'apply_broker_reply',
    label: 'Apply broker reply',
    defaultTitle: 'Apply reply',
    cardLine: 'Log confirmed or rejected from this broker reply',
  },
]

export function waitUntilForSubject(
  subject: BlueprintSubject | null
): BlueprintCatalogOption[] {
  if (subject === 'brokers') return BROKER_WAIT_UNTIL_OPTIONS
  if (subject === 'invoices') return INVOICE_WAIT_UNTIL_OPTIONS
  if (subject === 'batches') return BATCH_WAIT_UNTIL_OPTIONS
  return []
}

export function eventsForSubject(subject: BlueprintSubject | null): BlueprintCatalogOption[] {
  if (subject === 'brokers') return BROKER_EVENT_OPTIONS
  if (subject === 'invoices') return INVOICE_EVENT_OPTIONS
  if (subject === 'batches') return BATCH_EVENT_OPTIONS
  return []
}

export function actionsForSubject(subject: BlueprintSubject | null): BlueprintActionOption[] {
  if (subject === 'brokers') return BROKER_ACTION_OPTIONS
  if (subject === 'invoices') return INVOICE_ACTION_OPTIONS
  if (subject === 'batches') return BATCH_ACTION_OPTIONS
  return []
}

export function findWaitUntil(subject: BlueprintSubject | null, id: string | undefined) {
  if (!id) return null
  return waitUntilForSubject(subject).find((c) => c.id === id) ?? null
}

export function findEvent(subject: BlueprintSubject | null, id: string | undefined) {
  if (!id) return null
  return eventsForSubject(subject).find((c) => c.id === id) ?? null
}

export function findAction(subject: BlueprintSubject | null, actionId: string | undefined) {
  if (!actionId) return null
  return actionsForSubject(subject).find((a) => a.id === actionId) ?? null
}

export function formatCatalogCardLine(
  opt: BlueprintCatalogOption,
  days: string | undefined,
  waitUnit?: string
): string {
  const d = (days ?? opt.defaultDays ?? '').trim() || '…'
  if (opt.id === 'pause_days' && (waitUnit === 'hours' || waitUnit === 'minutes')) {
    const n = Number(d)
    const singular = waitUnit === 'hours' ? 'hour' : 'minute'
    const plural = waitUnit === 'hours' ? 'hours' : 'minutes'
    const unitWord = n === 1 ? singular : plural
    return `Wait ${d} ${unitWord} from this step`
  }
  return opt.cardTemplate.replace(/\{days\}/g, d)
}

/** Flat lookups for card subtitles (any subject). */
export function lookupWaitUntilById(id: string | undefined) {
  if (!id) return null
  return (
    BROKER_WAIT_UNTIL_OPTIONS.find((c) => c.id === id) ??
    INVOICE_WAIT_UNTIL_OPTIONS.find((c) => c.id === id) ??
    BATCH_WAIT_UNTIL_OPTIONS.find((c) => c.id === id) ??
    null
  )
}

export function lookupEventById(id: string | undefined) {
  if (!id) return null
  return (
    BROKER_EVENT_OPTIONS.find((c) => c.id === id) ??
    INVOICE_EVENT_OPTIONS.find((c) => c.id === id) ??
    BATCH_EVENT_OPTIONS.find((c) => c.id === id) ??
    null
  )
}

export function lookupActionById(id: string | undefined) {
  if (!id) return null
  return (
    BROKER_ACTION_OPTIONS.find((a) => a.id === id) ??
    INVOICE_ACTION_OPTIONS.find((a) => a.id === id) ??
    BATCH_ACTION_OPTIONS.find((a) => a.id === id) ??
    null
  )
}
