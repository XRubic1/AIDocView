import { beforeEach, describe, expect, it } from 'vitest'
import type { BlueprintFlowNode } from '../../types/blueprintGraph'
import type { Invoice } from '../../types/invoice'
import type { Broker } from '../../types/broker'
import { hydrateBrokers } from '../../data/mockBrokers'
import { clearInvoices, hydrateInvoices } from '../../data/mockInvoices'
import { clearPayments, hydratePayments } from '../../data/mockPayments'
import {
  atLocalNine,
  resolveBlueprintWaitUntil,
} from './blueprintWaitUntil'

function waitNode(
  waitUntilId: string,
  days: string
): BlueprintFlowNode {
  return {
    id: 'n-wait',
    type: 'blueprint',
    position: { x: 0, y: 0 },
    data: {
      kind: 'wait',
      label: 'Wait',
      waitUntilId,
      days,
    },
  }
}

function baseInvoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoice_number: 'INV-1',
    client_id: 'c1',
    client_name: 'Carrier',
    broker_id: 'br-1',
    broker_name: 'Broker Co',
    amount: 1000,
    invoice_date: '2026-01-01',
    due_date: '2026-01-31',
    expected_payment_date: '2026-01-31',
    status: 'approved',
    created_at: '2026-01-01T12:00:00.000Z',
    ...over,
  }
}

function baseBroker(over: Partial<Broker> = {}): Broker {
  return {
    id: 'br-1',
    name: 'Broker Co',
    payment_terms_days: 30,
    ...over,
  }
}

function ymdLocal(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

describe('resolveBlueprintWaitUntil', () => {
  beforeEach(() => {
    hydrateBrokers([baseBroker()])
    clearInvoices()
    clearPayments()
  })

  it('pause_days wakes ≈ now + D @ 09:00', () => {
    const now = new Date(2026, 2, 10, 14, 30, 0) // Mar 10 local
    const result = resolveBlueprintWaitUntil(
      { kind: 'invoice', invoice: baseInvoice() },
      waitNode('pause_days', '5'),
      now
    )
    expect(ymdLocal(result.waitUntil)).toBe('2026-03-15')
    expect(new Date(result.waitUntil).getHours()).toBe(9)
    expect(result.detail).toMatch(/5 days from this step/i)
  })

  it('pause_days with minutes wakes ≈ now + N minutes', () => {
    const now = new Date(2026, 2, 10, 14, 30, 0)
    const node = waitNode('pause_days', '10')
    node.data.waitUnit = 'minutes'
    const result = resolveBlueprintWaitUntil(
      { kind: 'invoice', invoice: baseInvoice() },
      node,
      now
    )
    const delta = new Date(result.waitUntil).getTime() - now.getTime()
    expect(delta).toBeGreaterThanOrEqual(10 * 60_000 - 1000)
    expect(delta).toBeLessThanOrEqual(10 * 60_000 + 1000)
    expect(result.detail).toMatch(/10 minutes/i)
  })

  it('net_plus_late = invoice_date + Net + D', () => {
    const now = new Date(2026, 0, 1, 8, 0, 0) // before wake so no clamp
    const invoice = baseInvoice({ invoice_date: '2026-01-01' })
    const result = resolveBlueprintWaitUntil(
      { kind: 'invoice', invoice },
      waitNode('net_plus_late', '15'),
      now
    )
    // Net 30 + 15 late = 45 → 2026-02-15 @ 09:00
    expect(atLocalNine('2026-02-15')).toBe(result.waitUntil)
    expect(result.detail).toMatch(/Net 30 \+ 15/i)
  })

  it('due_plus_late = effective due + D', () => {
    const now = new Date(2026, 0, 1, 8, 0, 0)
    const invoice = baseInvoice({
      invoice_date: '2026-01-01',
      due_date: '2026-01-31',
      expected_payment_date: '2026-01-31',
    })
    const result = resolveBlueprintWaitUntil(
      { kind: 'invoice', invoice },
      waitNode('due_plus_late', '10'),
      now
    )
    // Due 2026-01-31 + 10 = 2026-02-10
    expect(atLocalNine('2026-02-10')).toBe(result.waitUntil)
    expect(result.detail).toMatch(/10 days after due/i)
  })

  it('after_last_email uses chase stamp + D', () => {
    const now = new Date(2026, 0, 11, 8, 0, 0) // before chase+5 so no clamp
    const chaseAt = '2026-01-10T15:00:00.000Z'
    const invoice = baseInvoice({
      email_lifecycle: {
        paperwork_status: 'good',
        payment: { firstAskedAt: chaseAt },
      },
    })
    const result = resolveBlueprintWaitUntil(
      { kind: 'invoice', invoice },
      waitNode('after_last_email', '5'),
      now
    )
    const expected = new Date(chaseAt)
    expected.setDate(expected.getDate() + 5)
    expected.setHours(9, 0, 0, 0)
    expect(result.waitUntil).toBe(expected.toISOString())
    expect(result.detail).toMatch(/after last chase/i)
  })

  it('after_last_email without chase falls back to pause_days', () => {
    const now = new Date(2026, 2, 10, 14, 30, 0)
    const result = resolveBlueprintWaitUntil(
      { kind: 'invoice', invoice: baseInvoice() },
      waitNode('after_last_email', '5'),
      now
    )
    expect(ymdLocal(result.waitUntil)).toBe('2026-03-15')
    expect(result.detail).toMatch(/No chase email yet/i)
  })

  it('broker avg_pay_late above threshold wakes immediately', () => {
    const now = new Date(2026, 2, 10, 12, 0, 0)
    const invoice = baseInvoice({
      id: 'inv-pay',
      invoice_date: '2025-12-01',
      due_date: '2025-12-31',
    })
    hydrateInvoices([invoice])
    // Avg pay ~45d vs Net 30 → ~15d late
    hydratePayments([
      {
        id: 'p1',
        invoice_id: 'inv-pay',
        invoice_number: 'INV-1',
        broker_name: 'Broker Co',
        amount: 1000,
        payment_date: '2026-01-15',
        received_date: '2026-01-15',
        payment_method: 'ach',
        status: 'confirmed',
      },
    ])
    const result = resolveBlueprintWaitUntil(
      { kind: 'broker', broker: baseBroker({ payment_terms_days: 30 }) },
      waitNode('avg_pay_late', '15'),
      now
    )
    expect(result.waitUntil).toBe(now.toISOString())
    expect(result.detail).toMatch(/continue now/i)
  })

  it('broker avg_pay_late below threshold soft-polls +1 day', () => {
    const now = new Date(2026, 2, 10, 12, 0, 0)
    const invoice = baseInvoice({
      id: 'inv-pay2',
      invoice_date: '2026-01-01',
      due_date: '2026-01-31',
    })
    hydrateInvoices([invoice])
    // Paid day 32 → ~2d late vs Net 30; need ≥ 15 → poll tomorrow
    hydratePayments([
      {
        id: 'p2',
        invoice_id: 'inv-pay2',
        invoice_number: 'INV-1',
        broker_name: 'Broker Co',
        amount: 1000,
        payment_date: '2026-02-02',
        received_date: '2026-02-02',
        payment_method: 'ach',
        status: 'confirmed',
      },
    ])
    const result = resolveBlueprintWaitUntil(
      { kind: 'broker', broker: baseBroker({ payment_terms_days: 30 }) },
      waitNode('avg_pay_late', '15'),
      now
    )
    expect(ymdLocal(result.waitUntil)).toBe('2026-03-11')
    expect(result.detail).toMatch(/check again tomorrow/i)
  })

  it('batch uses pause_days only', () => {
    const now = new Date(2026, 2, 10, 14, 30, 0)
    const result = resolveBlueprintWaitUntil(
      { kind: 'batch' },
      waitNode('pause_days', '2'),
      now
    )
    expect(ymdLocal(result.waitUntil)).toBe('2026-03-12')
  })
})
