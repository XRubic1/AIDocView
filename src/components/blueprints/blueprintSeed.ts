import type { SavedBlueprint } from '../../types/blueprintGraph'
import { defaultTriggerFilters } from './blueprintTriggerFilters'

/**
 * Demo chase timeline (UI only):
 * Invoices that match → Wait until Net+late → Email status
 * → When replied → Add note → Done
 * → When no reply → Wait more → Follow-up email → Mark urgent → Done
 */
export const RISK_LADDER_DEMO_BLUEPRINT: SavedBlueprint = {
  id: 'bp-demo-invoice-chase-v7',
  name: 'Invoice payment chase (draft)',
  updatedAt: '2026-09-23T00:00:00.000Z',
  priority: 0,
  nodes: [
    {
      id: 'n-start',
      type: 'blueprint',
      position: { x: 20, y: 200 },
      data: {
        kind: 'trigger',
        label: 'Invoices that match',
        triggerSubject: 'invoices',
        triggerEntry: 'filter',
        triggerFilters: {
          ...defaultTriggerFilters(),
          invoices: {
            openOnly: true,
            statuses: ['pending', 'review', 'approved', 'hold'],
            minDaysPastDue: '15',
          },
        },
      },
    },    {
      id: 'n-wait-net',
      type: 'blueprint',
      position: { x: 240, y: 200 },
      data: {
        kind: 'wait',
        label: 'Past Net + late',
        waitUntilId: 'net_plus_late',
        days: '15',
        fieldKey: 'Until Net terms + 15 late days',
      },
    },
    {
      id: 'n-email-status',
      type: 'blueprint',
      position: { x: 480, y: 200 },
      data: {
        kind: 'action',
        label: 'Ask payment status',
        actionId: 'email_payment_status',
        status: 'Email the broker about payment status',
      },
    },
    {
      id: 'n-when-reply',
      type: 'blueprint',
      position: { x: 720, y: 80 },
      data: {
        kind: 'if',
        label: 'Broker replied',
        checkId: 'broker_replied',
        fieldKey: 'The broker sent a reply',
      },
    },
    {
      id: 'n-add-note',
      type: 'blueprint',
      position: { x: 960, y: 80 },
      data: {
        kind: 'action',
        label: 'Add note',
        actionId: 'add_note',
        status: 'Write a note on this invoice',
      },
    },
    {
      id: 'n-done-reply',
      type: 'blueprint',
      position: { x: 1200, y: 80 },
      data: {
        kind: 'stop',
        label: 'All done',
      },
    },
    {
      id: 'n-when-no-reply',
      type: 'blueprint',
      position: { x: 720, y: 320 },
      data: {
        kind: 'if',
        label: 'No reply',
        checkId: 'no_reply',
        fieldKey: 'Still no reply from the broker',
      },
    },
    {
      id: 'n-wait-more',
      type: 'blueprint',
      position: { x: 960, y: 320 },
      data: {
        kind: 'wait',
        label: 'After last email',
        waitUntilId: 'after_last_email',
        days: '5',
        fieldKey: 'Until 5 days after the last email',
      },
    },
    {
      id: 'n-email-followup',
      type: 'blueprint',
      position: { x: 1200, y: 280 },
      data: {
        kind: 'action',
        label: 'Follow-up email',
        actionId: 'email_followup',
        status: 'Send a follow-up email to the broker',
      },
    },
    {
      id: 'n-mark-urgent',
      type: 'blueprint',
      position: { x: 1200, y: 400 },
      data: {
        kind: 'action',
        label: 'Mark urgent',
        actionId: 'mark_urgent',
        status: 'Mark this invoice as urgent',
      },
    },
    {
      id: 'n-done-urgent',
      type: 'blueprint',
      position: { x: 1440, y: 340 },
      data: {
        kind: 'stop',
        label: 'All done',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'n-start', target: 'n-wait-net' },
    { id: 'e2', source: 'n-wait-net', target: 'n-email-status' },
    { id: 'e3', source: 'n-email-status', target: 'n-when-reply', label: 'next' },
    { id: 'e4', source: 'n-when-reply', target: 'n-add-note', label: 'yes' },
    { id: 'e5', source: 'n-add-note', target: 'n-done-reply' },
    { id: 'e6', source: 'n-email-status', target: 'n-when-no-reply', label: 'next' },
    { id: 'e7', source: 'n-when-no-reply', target: 'n-wait-more', label: 'yes' },
    { id: 'e8', source: 'n-wait-more', target: 'n-email-followup' },
    { id: 'e9', source: 'n-email-followup', target: 'n-mark-urgent' },
    { id: 'e10', source: 'n-mark-urgent', target: 'n-done-urgent' },
  ],
}

export const LEGACY_DEMO_BLUEPRINT_IDS = [
  'bp-demo-risk-ladder',
  'bp-demo-risk-ladder-v2',
  'bp-demo-risk-ladder-v3',
  'bp-demo-invoice-chase-v4',
  'bp-demo-invoice-chase-v5',
  'bp-demo-invoice-chase-v6',
] as const
