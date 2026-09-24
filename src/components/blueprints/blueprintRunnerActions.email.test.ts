/**
 * Then-do email actions — payment status / follow-up / notify carrier.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/collectionsChase', () => ({
  sendBrokerPaymentStatusInquiry: vi.fn(async () => ({ ok: true })),
  sendBrokerPaymentStatusFollowup: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../../services/emailService', () => ({
  sendTransactionalEmail: vi.fn(async () => ({ ok: true, id: 'msg-1' })),
}))

vi.mock('../../config/emailLifecycle', () => ({
  isEmailLifecycleRuleEnabled: vi.fn(() => true),
}))

import {
  sendBrokerPaymentStatusFollowup,
  sendBrokerPaymentStatusInquiry,
} from '../../utils/collectionsChase'
import { sendTransactionalEmail } from '../../services/emailService'
import { executeBlueprintThenDo } from './blueprintRunnerActions'
import { hydrateInvoices, clearInvoices } from '../../data/mockInvoices'
import { hydrateBrokers } from '../../data/mockBrokers'
import type { Invoice } from '../../types/invoice'
import type { Broker } from '../../types/broker'

const INV_ID = 'inv-email-then-do'
const BROKER_ID = 'broker-email-then-do'

function sampleInvoice(): Invoice {
  return {
    id: INV_ID,
    invoice_number: 'INV-100',
    load_number: 'LD-1',
    amount: 1500,
    status: 'approved',
    client_id: 'client-1',
    client_name: 'Test Carrier',
    broker_id: BROKER_ID,
    broker_name: 'Test Broker',
    batch_id: 'batch-1',
    invoice_date: '2026-01-01',
    due_date: '2026-01-31',
  } as Invoice
}

function sampleBroker(): Broker {
  return {
    id: BROKER_ID,
    name: 'Test Broker',
    email: 'ap@testbroker.com',
    emails: [{ email: 'ap@testbroker.com', category: 'accounting' }],
  } as Broker
}

describe('executeBlueprintThenDo emails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearInvoices()
    hydrateInvoices([sampleInvoice()])
    hydrateBrokers([sampleBroker()])
  })

  it('sends payment status inquiry via collections helper', async () => {
    const result = await executeBlueprintThenDo({
      invoiceId: INV_ID,
      actionId: 'email_payment_status',
      blueprintName: 'Test chase',
    })
    expect(result.ok).toBe(true)
    expect(result.detail).toMatch(/emailed broker/i)
    expect(sendBrokerPaymentStatusInquiry).toHaveBeenCalled()
  })

  it('sends follow-up via collections helper', async () => {
    const result = await executeBlueprintThenDo({
      invoiceId: INV_ID,
      actionId: 'email_followup',
      blueprintName: 'Test chase',
    })
    expect(result.ok).toBe(true)
    expect(sendBrokerPaymentStatusFollowup).toHaveBeenCalled()
  })

  it('fails payment email when broker has no email', async () => {
    hydrateBrokers([
      {
        ...sampleBroker(),
        email: '',
        emails: [],
      } as Broker,
    ])
    vi.mocked(sendBrokerPaymentStatusInquiry).mockResolvedValueOnce({
      ok: false,
      error: 'No broker email on file',
    })
    const result = await executeBlueprintThenDo({
      invoiceId: INV_ID,
      actionId: 'email_payment_status',
      blueprintName: 'Test chase',
    })
    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/No broker email|email failed/i)
  })

  it('sends custom template when templateId is set', async () => {
    const result = await executeBlueprintThenDo({
      invoiceId: INV_ID,
      actionId: 'email_payment_status',
      blueprintName: 'Test chase',
      config: {
        message: 'Please confirm',
        channel: 'email',
        templateId: 'broker_payment_status_inquiry',
      },
    })
    expect(result.ok).toBe(true)
    expect(sendTransactionalEmail).toHaveBeenCalled()
    expect(sendBrokerPaymentStatusInquiry).not.toHaveBeenCalled()
  })
})
