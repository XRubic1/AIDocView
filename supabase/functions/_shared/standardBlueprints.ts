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
  subject: 'invoices' | 'batches',
  entry: 'filter' | 'event',
  statuses: string[]
): StandardBlueprint['nodes'][number] {
  return {
    id,
    type: 'blueprint',
    position: { x: 20, y: 160 },
    data: {
      kind: 'trigger',
      label: subject === 'batches' ? 'Batches that match' : 'Invoices that match',
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
  templateId: string
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
          fromEmail: BILLING,
          fromEmails: [BILLING],
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
      'Until due date plus inquiry days (or inquiry days from now if already due)'
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

/** Carrier “batch processed” email. Server sends once; Process in the portal does not double-send. */
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

export const STANDARD_CHASE_BLUEPRINTS: StandardBlueprint[] = [
  STANDARD_PAPERWORK_CHASE,
  STANDARD_PAYMENT_CHASE,
  STANDARD_HOLD_NOTICE,
  STANDARD_BATCH_NOTICE,
]
