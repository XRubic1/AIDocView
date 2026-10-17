import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/invoice'
import type { Notification } from '../types/notification'
import { buildClientActivity } from './clientActivity'

const invoice = {
  id: 'inv-1',
  invoice_number: 'INV-1001',
  client_id: 'client-a',
  client_name: 'Acme Freight',
} as Invoice

function notif(partial: Partial<Notification>): Notification {
  return {
    id: 'n1',
    type: 'system_alert',
    title: 'Client note on invoice',
    message: 'msg',
    timestamp: '2026-10-17T10:00:00Z',
    read: false,
    ...partial,
  }
}

describe('buildClientActivity', () => {
  it('turns an unread upload into a high-priority item on the invoice', () => {
    const [act] = buildClientActivity(
      [
        notif({
          type: 'document_uploaded',
          title: 'PPW uploaded — review documents',
          invoice_id: 'inv-1',
          metadata: { file_names: ['bol.pdf'] },
        }),
      ],
      [invoice]
    )
    expect(act).toMatchObject({
      kind: 'upload',
      severity: 'high',
      clientId: 'client-a',
      invoiceNumber: 'INV-1001',
      detail: 'bol.pdf',
    })
  })

  it('matches payment notifications by invoice number', () => {
    const [act] = buildClientActivity(
      [notif({ title: 'Payment posted', invoice_number: 'INV-1001' })],
      [invoice]
    )
    expect(act?.invoiceId).toBe('inv-1')
    expect(act?.kind).toBe('payment')
  })

  it('skips read, admin-only and unresolvable notifications', () => {
    expect(
      buildClientActivity(
        [
          notif({ read: true, invoice_id: 'inv-1' }),
          notif({ id: 'n2', title: 'Batch submitted', invoice_id: 'inv-1' }),
          notif({ id: 'n3', invoice_id: 'missing' }),
        ],
        [invoice]
      )
    ).toEqual([])
  })

  it('shows the note text with its author', () => {
    const [act] = buildClientActivity(
      [notif({ invoice_id: 'inv-1', metadata: { note_text: 'Broker paid', author_name: 'Sam' } })],
      [invoice]
    )
    expect(act?.detail).toBe('Sam: Broker paid')
  })
})
