import { describe, expect, it } from 'vitest'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import {
  collectInvoiceBlueprintActions,
  parseActionRecipientEmails,
} from './invoiceBlueprintActions'

function bp(
  id: string,
  name: string,
  subject: 'invoices' | 'batches',
  actions: Array<{ actionId: string; label: string; templateId?: string; line: string }>
): SavedBlueprint {
  return {
    id,
    name,
    updatedAt: '2026-09-27T00:00:00.000Z',
    edges: [],
    nodes: [
      {
        id: 'n-start',
        type: 'blueprint',
        position: { x: 0, y: 0 },
        data: { kind: 'trigger', label: 'Start', triggerSubject: subject },
      },
      ...actions.map((action, i) => ({
        id: `n-${i}`,
        type: 'blueprint' as const,
        position: { x: 0, y: 0 },
        data: {
          kind: 'action' as const,
          label: action.label,
          actionId: action.actionId,
          actionIds: [action.actionId],
          status: action.line,
          actionConfigs: {
            [action.actionId]: {
              message: '',
              channel: 'email' as const,
              templateId: action.templateId,
            },
          },
        },
      })),
    ],
  }
}

describe('parseActionRecipientEmails', () => {
  it('keeps valid addresses and reports the rest', () => {
    expect(parseActionRecipientEmails(' ap@broker.com, AP@broker.com; not-an-email\nops@credyx.net ')).toEqual({
      emails: ['ap@broker.com', 'ops@credyx.net'],
      invalid: ['not-an-email'],
    })
  })
})

describe('collectInvoiceBlueprintActions', () => {
  it('keeps distinct Then-do cards and skips batch graphs', () => {
    const actions = collectInvoiceBlueprintActions([
      bp('packet', 'Standard paperwork packet', 'invoices', [
        {
          actionId: 'email_broker_packet',
          label: 'Send packet to broker',
          templateId: 'broker_packet',
          line: 'Send invoice docs / PPW packet to the broker',
        },
      ]),
      bp('pw', 'Standard paperwork chase', 'invoices', [
        {
          actionId: 'email_followup',
          label: 'Paperwork status',
          templateId: 'broker_paperwork_status_inquiry',
          line: 'Email the broker about paperwork status',
        },
        {
          actionId: 'email_followup',
          label: 'Paperwork follow-up',
          templateId: 'broker_paperwork_status_followup',
          line: 'Send a paperwork follow-up to the broker',
        },
      ]),
      bp('batch', 'Batch processed notice', 'batches', [
        {
          actionId: 'email_broker_packet',
          label: 'Should not show',
          templateId: 'broker_packet',
          line: 'Batch graphs are not invoice actions',
        },
      ]),
      bp('dup', 'Older paperwork chase', 'invoices', [
        {
          actionId: 'email_followup',
          label: 'Paperwork status',
          templateId: 'broker_paperwork_status_inquiry',
          line: 'duplicate',
        },
      ]),
    ])

    expect(actions.map((a) => a.label)).toEqual([
      'Send packet to broker',
      'Paperwork status',
      'Paperwork follow-up',
    ])
    expect(actions[0]?.config?.templateId).toBe('broker_packet')
    expect(actions[1]?.blueprintName).toBe('Standard paperwork chase')
  })
})
