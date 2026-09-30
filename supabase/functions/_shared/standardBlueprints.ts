/**
 * Platform chase graphs. Inserted once (never overwritten) so staff edits stick.
 * Reply checks are intentionally absent — inbound reply reading is not in this MVP.
 * Days on each Wait card are the rules. First paperwork / payment waits still
 * honor a broker's paperwork_status_check_days / payment_status_inquiry_days.
 */

const BILLING = 'billing@credyx.net'

export type StandardBlueprint = {
  id: string
  name: string
  updatedAt: string
  priority: number
  nodes: Array<{
    id: string
    type: 'blueprint'
    position: { x: number; y: number }
    data: Record<string, unknown>
  }>
  edges: Array<{ id: string; source: string; target: string }>
}

function trigger(
  id: string,
  subject: 'invoices' | 'batches' | 'brokers',
  entry: 'filter' | 'event',
  statuses: string[]
): StandardBlueprint['nodes'][number] {
  const label =
    subject === 'batches'
      ? 'Batches that match'
      : subject === 'brokers'
        ? 'Brokers that match'
        : 'Invoices that match'
  return {
    id,
    type: 'blueprint',
    position: { x: 20, y: 160 },
    data: {
      kind: 'trigger',
      label,
      triggerSubject: subject,
      triggerEntry: entry,
      triggerFilters: {
        invoices: {
          openOnly: true,
          statuses,
          minDaysPastDue: '',
        },
        brokers: { activeOnly: true, minDaysNoPayment: '' },
        batches: { submittedOnly: true },
      },
    },
  }
}

function when(
  id: string,
  x: number,
  checkId: string,
  label: string,
  line: string
): StandardBlueprint['nodes'][number] {
  return {
    id,
    type: 'blueprint',
    position: { x, y: 160 },
    data: {
      kind: 'if',
      label,
      checkId,
      whenMatch: 'yes',
      fieldKey: line,
    },
  }
}

function wait(
  id: string,
  x: number,
  waitUntilId: string,
  days: string,
  label: string,
  line: string
): StandardBlueprint['nodes'][number] {
  return {
    id,
    type: 'blueprint',
    position: { x, y: 160 },
    data: {
      kind: 'wait',
      label,
      waitUntilId,
      days,
      fieldKey: line,
    },
  }
}

function emailAction(
  id: string,
  x: number,
  actionId: string,
  label: string,
  line: string,
  templateId: string,
  fromEmail = BILLING
): StandardBlueprint['nodes'][number] {
  return {
    id,
    type: 'blueprint',
    position: { x, y: 160 },
    data: {
      kind: 'action',
      label,
      actionId,
      actionIds: [actionId],
      status: line,
      actionConfigs: {
        [actionId]: {
          message: '',
          channel: 'email',
          templateId,
            fromEmail,
            fromEmails: [fromEmail],
        },
      },
    },
  }
}

function noteAction(
  id: string,
  x: number,
  actionId: string,
  label: string,
  message: string
): StandardBlueprint['nodes'][number] {
  return {
    id,
    type: 'blueprint',
    position: { x, y: 160 },
    data: {
      kind: 'action',
      label,
      actionId,
      actionIds: [actionId],
      status: message,
      actionConfigs: {
        [actionId]: { message, channel: actionId === 'notify_carrier' ? 'both' : 'app', templateId: actionId === 'notify_carrier' ? 'carrier_claim_or_hold_notice' : '' },
      },
    },
  }
}

function done(id: string, x: number): StandardBlueprint['nodes'][number] {
  return {
    id,
    type: 'blueprint',
    position: { x, y: 160 },
    data: { kind: 'stop', label: 'Done' },
  }
}

function chain(ids: string[]): StandardBlueprint['edges'] {
  const edges: StandardBlueprint['edges'] = []
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({ id: `e${i + 1}`, source: ids[i], target: ids[i + 1] })
  }
  return edges
}

/** After PPW: wait broker confirm days → status ask → wait → follow-up → needs attention. */
export const STANDARD_PAPERWORK_CHASE: StandardBlueprint = {
  id: 'bp-standard-paperwork-chase',
  name: 'Standard paperwork chase',
  updatedAt: '2026-09-27T00:00:00.000Z',
  priority: 60,
  nodes: [
    trigger('n-start', 'invoices', 'filter', ['approved', 'review']),
    when('n-when-ppw', 240, 'ppw_sent', 'Paperwork sent', 'PPW packet was sent to the broker'),
    wait('n-wait-first', 460, 'after_ppw', '7', 'After PPW', 'Until the broker confirm window after PPW'),
    emailAction(
      'n-ask',
      680,
      'email_followup',
      'Paperwork status',
      'Email the broker about paperwork status',
      'broker_paperwork_status_inquiry'
    ),
    wait('n-wait-second', 900, 'pause_days', '3', 'Before follow-up', 'Wait 3 days from this step'),
    emailAction(
      'n-followup',
      1120,
      'email_followup',
      'Paperwork follow-up',
      'Send a paperwork follow-up to the broker',
      'broker_paperwork_status_followup'
    ),
    wait('n-wait-attn', 1340, 'pause_days', '5', 'Before attention', 'Wait 5 days from this step'),
    noteAction(
      'n-urgent',
      1560,
      'mark_urgent',
      'Needs attention',
      'Needs attention: no paperwork confirmation after the follow-up.'
    ),
    done('n-done', 1780),
  ],
  edges: chain([
    'n-start',
    'n-when-ppw',
    'n-wait-first',
    'n-ask',
    'n-wait-second',
    'n-followup',
    'n-wait-attn',
    'n-urgent',
    'n-done',
  ]),
}

/** After paperwork is logged good: wait until due + inquiry days → payment ask → follow-up. */
export const STANDARD_PAYMENT_CHASE: StandardBlueprint = {
  id: 'bp-standard-payment-chase',
  name: 'Standard payment chase',
  updatedAt: '2026-09-27T00:00:00.000Z',
  priority: 55,
  nodes: [
    trigger('n-start', 'invoices', 'filter', ['approved', 'review']),
    when('n-when-good', 240, 'paperwork_good', 'Paperwork good', 'Paperwork status is logged good'),
    wait(
      'n-wait-due',
      460,
      'payment_clock',
      '15',
      'Payment inquiry clock',
      'Until the broker net due date (or net days from now if there is no due date)'
    ),
    emailAction(
      'n-ask',
      680,
      'email_payment_status',
      'Payment status',
      'Email the broker about payment status',
      'broker_payment_status_inquiry'
    ),
    wait('n-wait-second', 900, 'pause_days', '3', 'Before follow-up', 'Wait 3 days from this step'),
    emailAction(
      'n-followup',
      1120,
      'email_followup',
      'Payment follow-up',
      'Send a payment follow-up to the broker',
      'broker_payment_status_followup'
    ),
    wait('n-wait-attn', 1340, 'pause_days', '5', 'Before attention', 'Wait 5 days from this step'),
    noteAction(
      'n-urgent',
      1560,
      'mark_urgent',
      'Needs attention',
      'Needs attention: payment still open after the follow-up.'
    ),
    done('n-done', 1780),
  ],
  edges: chain([
    'n-start',
    'n-when-good',
    'n-wait-due',
    'n-ask',
    'n-wait-second',
    'n-followup',
    'n-wait-attn',
    'n-urgent',
    'n-done',
  ]),
}

/** Carrier notice when an invoice is on hold. One run per hold episode. */
export const STANDARD_HOLD_NOTICE: StandardBlueprint = {
  id: 'bp-standard-hold-notice',
  name: 'Standard hold notice',
  updatedAt: '2026-09-27T00:00:00.000Z',
  priority: 90,
  nodes: [
    trigger('n-start', 'invoices', 'event', ['hold']),
    when('n-when-hold', 240, 'on_hold', 'On hold', 'Invoice is on hold'),
    noteAction(
      'n-notify',
      460,
      'notify_carrier',
      'Notify carrier',
      'Invoice is on hold. Credyx will follow up and keep you updated.'
    ),
    done('n-done', 680),
  ],
  edges: chain(['n-start', 'n-when-hold', 'n-notify', 'n-done']),
}

/** Carrier batch-processed email. Server sends once; Process in the portal does not double-send. */
export const STANDARD_BATCH_NOTICE: StandardBlueprint = {
  id: 'bp-batch-processed-notice-v1',
  name: 'Batch processed notice',
  updatedAt: '2026-09-27T00:00:00.000Z',
  priority: 70,
  nodes: [
    trigger('n-start', 'batches', 'event', []),
    when('n-when-processed', 260, 'batch_processed', 'Batch processed', 'This batch was just processed'),
    {
      id: 'n-email-carrier',
      type: 'blueprint',
      position: { x: 500, y: 160 },
      data: {
        kind: 'action',
        label: 'Email carrier',
        actionId: 'email_carrier_batch_processed',
        actionIds: ['email_carrier_batch_processed'],
        status: 'Email the carrier that this batch was processed',
        actionConfigs: {
          email_carrier_batch_processed: {
            message: '',
            channel: 'email',
            templateId: 'carrier_batch_processed',
            fromEmail: 'ops@credyx.net',
            fromEmails: ['ops@credyx.net'],
          },
        },
      },
    },
    done('n-done', 740),
  ],
  edges: chain(['n-start', 'n-when-processed', 'n-email-carrier', 'n-done']),
}

/**
 * Broker paperwork packet at Process. Attachments are sent from the portal
 * Then-do (the server cron does not rebuild the packet).
 */
export const STANDARD_BROKER_PACKET: StandardBlueprint = {
  id: 'bp-standard-broker-packet',
  name: 'Standard paperwork packet',
  updatedAt: '2026-09-27T00:00:00.000Z',
  priority: 75,
  nodes: [
    trigger('n-start', 'invoices', 'event', ['approved', 'review']),
    when('n-when-processed', 260, 'invoice_processed', 'Invoice processed', 'This invoice was just processed'),
    emailAction(
      'n-packet',
      500,
      'email_broker_packet',
      'Send packet to broker',
      'Send invoice docs / PPW packet to the broker',
      'broker_packet',
      'system@credyx.net'
    ),
    done('n-done', 740),
  ],
  edges: chain(['n-start', 'n-when-processed', 'n-packet', 'n-done']),
}

/** Carrier notice when Credyx opens a carrier × broker account dispute. */
export const STANDARD_DISPUTE_NOTICE: StandardBlueprint = {
  id: 'bp-standard-dispute-notice',
  name: 'Standard account dispute',
  updatedAt: '2026-09-27T00:00:00.000Z',
  priority: 80,
  nodes: [
    trigger('n-start', 'brokers', 'event', []),
    when('n-when-dispute', 260, 'dispute_opened', 'Dispute opened', 'A carrier × broker dispute was opened'),
    emailAction(
      'n-email-carrier',
      500,
      'email_carrier_dispute',
      'Email carrier',
      'Tell the carrier a dispute was opened with this broker',
      'carrier_dispute_opened'
    ),
    done('n-done', 740),
  ],
  edges: chain(['n-start', 'n-when-dispute', 'n-email-carrier', 'n-done']),
}

/** Internal ops alert for intake, verification, and doc-split issues. */
export const STANDARD_OPS_ALERT: StandardBlueprint = {
  id: 'bp-standard-ops-alert',
  name: 'Standard ops alert',
  updatedAt: '2026-09-27T00:00:00.000Z',
  priority: 40,
  nodes: [
    trigger('n-start', 'batches', 'event', []),
    when('n-when-issue', 260, 'batch_processed', 'Batch issue', 'Credyx should review this batch'),
    {
      id: 'n-ops',
      type: 'blueprint',
      position: { x: 500, y: 160 },
      data: {
        kind: 'action',
        label: 'Email ops',
        actionId: 'email_ops_alert',
        actionIds: ['email_ops_alert'],
        status: 'Email Credyx ops about an intake or verification issue',
        actionConfigs: {
          email_ops_alert: {
            message: '',
            channel: 'email',
            templateId: 'credyx_batch_error',
            fromEmail: 'ops@credyx.net',
            fromEmails: ['ops@credyx.net'],
          },
        },
      },
    },
    done('n-done', 740),
  ],
  edges: chain(['n-start', 'n-when-issue', 'n-ops', 'n-done']),
}

function replyAction(
  id: string,
  x: number,
  actionId: string,
  label: string,
  line: string,
  message = ''
): StandardBlueprint['nodes'][number] {
  return {
    id,
    type: 'blueprint',
    position: { x, y: 160 },
    data: {
      kind: 'action',
      label,
      actionId,
      actionIds: [actionId],
      status: line,
      actionConfigs: {
        [actionId]: { message, channel: 'app', templateId: '' },
      },
    },
  }
}

/** Internal note posted when a broker confirms paperwork, before payment chase starts. */
export const BROKER_CONFIRMED_NOTE = 'Broker confirmed paperwork. Payment chase started.'

/** Broker said good to go, will pay, or sent a date. */
export const STANDARD_BROKER_CONFIRMED: StandardBlueprint = {
  id: 'bp-standard-broker-confirmed',
  name: 'Broker confirmed',
  updatedAt: '2026-09-29T00:00:00.000Z',
  priority: 85,
  nodes: [
    trigger('n-start', 'invoices', 'event', ['approved', 'review']),
    when('n-when', 260, 'broker_confirmed', 'Broker confirmed', 'Broker confirmed this invoice'),
    replyAction('n-apply', 500, 'apply_broker_reply', 'Log confirmed', 'Log the broker confirmation on the invoice'),
    noteAction('n-note', 740, 'add_note', 'Confirmed note', BROKER_CONFIRMED_NOTE),
    done('n-done', 980),
  ],
  edges: chain(['n-start', 'n-when', 'n-apply', 'n-note', 'n-done']),
}

/** Broker said not received, missing pages, missing lumper, or otherwise rejected. */
export const STANDARD_BROKER_REJECTED: StandardBlueprint = {
  id: 'bp-standard-broker-rejected',
  name: 'Broker rejected',
  updatedAt: '2026-09-27T00:00:00.000Z',
  priority: 85,
  nodes: [
    trigger('n-start', 'invoices', 'event', ['approved', 'review', 'hold']),
    when('n-when', 260, 'broker_rejected', 'Broker rejected', 'Broker rejected this invoice'),
    replyAction('n-apply', 500, 'apply_broker_reply', 'Log rejected', 'Log the broker rejection and hold the invoice'),
    done('n-done', 740),
  ],
  edges: chain(['n-start', 'n-when', 'n-apply', 'n-done']),
}

/** Reply could not be read. Edit this graph to decide what happens. */
export const STANDARD_BROKER_UNKNOWN: StandardBlueprint = {
  id: 'bp-standard-broker-unknown',
  name: 'Broker reply unknown',
  updatedAt: '2026-09-27T00:00:00.000Z',
  priority: 85,
  nodes: [
    trigger('n-start', 'invoices', 'event', ['approved', 'review', 'hold']),
    when('n-when', 260, 'broker_unknown', 'Reply unknown', 'Credyx could not read this broker reply'),
    replyAction(
      'n-task',
      500,
      'create_task',
      'Needs a look',
      'Staff task for a reply Credyx could not read',
      'Broker reply could not be read. Check it in the inbox.'
    ),
    done('n-done', 740),
  ],
  edges: chain(['n-start', 'n-when', 'n-task', 'n-done']),
}

/**
 * Broker reply to the rate check (advances / deductions).
 * The inbox reader runs this graph and sets the invoice OK or Hold.
 */
export const STANDARD_RATE_VERIFICATION: StandardBlueprint = {
  id: 'bp-standard-rate-verification',
  name: 'Rate verification',
  updatedAt: '2026-09-30T00:00:00.000Z',
  priority: 90,
  nodes: [
    trigger('n-start', 'invoices', 'event', ['pending', 'review', 'approved', 'hold']),
    when(
      'n-when',
      260,
      'rate_verification_reply',
      'Rate check reply',
      'Broker replied to the rate verification email'
    ),
    replyAction(
      'n-apply',
      500,
      'apply_rate_verification',
      'Apply rate check',
      'Post the reply and mark the invoice OK or Hold'
    ),
    done('n-done', 740),
  ],
  edges: chain(['n-start', 'n-when', 'n-apply', 'n-done']),
}

export const STANDARD_CHASE_BLUEPRINTS: StandardBlueprint[] = [
  STANDARD_PAPERWORK_CHASE,
  STANDARD_PAYMENT_CHASE,
  STANDARD_HOLD_NOTICE,
  STANDARD_BATCH_NOTICE,
  STANDARD_BROKER_PACKET,
  STANDARD_OPS_ALERT,
  STANDARD_DISPUTE_NOTICE,
  STANDARD_BROKER_CONFIRMED,
  STANDARD_BROKER_REJECTED,
  STANDARD_BROKER_UNKNOWN,
  STANDARD_RATE_VERIFICATION,
]
