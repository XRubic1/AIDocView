/** Guided dropdown catalogs for blueprint steps (UI only — no engine). */

export type BlueprintSubject = 'brokers' | 'invoices'

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
]

/** Clock gates — one Wait until card per pause. */
export const BROKER_WAIT_UNTIL_OPTIONS: BlueprintCatalogOption[] = [
  {
    id: 'pause_days',
    label: 'Just wait X days (simple timer)',
    needsDays: true,
    daysHint: 'How many days to wait?',
    defaultDays: '3',
    defaultTitle: 'Simple wait',
    cardTemplate: 'Wait {days} days from this step',
    help: 'Not tied to payments. From this step, wait this many calendar days, then go to the next card. Use between emails or tasks.',
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
    label: 'Just wait X days (simple timer)',
    needsDays: true,
    daysHint: 'How many days to wait?',
    defaultDays: '3',
    defaultTitle: 'Simple wait',
    cardTemplate: 'Wait {days} days from this step',
    help: 'Not tied to due dates or Net. From this step, wait this many calendar days, then continue. Use for a fixed pause between steps.',
  },
]

/**
 * Event checks — When (not clocks).
 * Clocks live on Wait until cards.
 */
export const BROKER_EVENT_OPTIONS: BlueprintCatalogOption[] = [
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
]

export const INVOICE_ACTION_OPTIONS: BlueprintActionOption[] = [
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
]

export function waitUntilForSubject(
  subject: BlueprintSubject | null
): BlueprintCatalogOption[] {
  if (subject === 'brokers') return BROKER_WAIT_UNTIL_OPTIONS
  if (subject === 'invoices') return INVOICE_WAIT_UNTIL_OPTIONS
  return []
}

export function eventsForSubject(subject: BlueprintSubject | null): BlueprintCatalogOption[] {
  if (subject === 'brokers') return BROKER_EVENT_OPTIONS
  if (subject === 'invoices') return INVOICE_EVENT_OPTIONS
  return []
}

export function actionsForSubject(subject: BlueprintSubject | null): BlueprintActionOption[] {
  if (subject === 'brokers') return BROKER_ACTION_OPTIONS
  if (subject === 'invoices') return INVOICE_ACTION_OPTIONS
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
  days: string | undefined
): string {
  const d = (days ?? opt.defaultDays ?? '').trim() || '…'
  return opt.cardTemplate.replace(/\{days\}/g, d)
}

/** Flat lookups for card subtitles (any subject). */
export function lookupWaitUntilById(id: string | undefined) {
  if (!id) return null
  return (
    BROKER_WAIT_UNTIL_OPTIONS.find((c) => c.id === id) ??
    INVOICE_WAIT_UNTIL_OPTIONS.find((c) => c.id === id) ??
    null
  )
}

export function lookupEventById(id: string | undefined) {
  if (!id) return null
  return (
    BROKER_EVENT_OPTIONS.find((c) => c.id === id) ??
    INVOICE_EVENT_OPTIONS.find((c) => c.id === id) ??
    null
  )
}

export function lookupActionById(id: string | undefined) {
  if (!id) return null
  return (
    BROKER_ACTION_OPTIONS.find((a) => a.id === id) ??
    INVOICE_ACTION_OPTIONS.find((a) => a.id === id) ??
    null
  )
}
