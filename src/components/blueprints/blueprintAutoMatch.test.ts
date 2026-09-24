import { describe, expect, it } from 'vitest'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import { blueprintPriority } from '../../types/blueprintGraph'
import type { Invoice } from '../../types/invoice'
import { scoreBlueprintForEvent } from './blueprintAutoMatch'
import { defaultTriggerFilters } from './blueprintTriggerFilters'

function makeInvoice(status: Invoice['status'] = 'hold'): Invoice {
  return {
    id: 'inv-1',
    invoice_number: '004',
    client_id: 'c1',
    client_name: 'Carrier',
    broker_id: 'b1',
    broker_name: 'Broker',
    amount: 100,
    status,
    invoice_date: '2026-09-22',
    created_at: '2026-09-22T00:00:00.000Z',
    documents_count: 0,
  } as Invoice
}

function holdBlueprint(): SavedBlueprint {
  return {
    id: 'bp-hold',
    name: 'Invoice Hold',
    updatedAt: '2026-09-23T00:00:00.000Z',
    nodes: [
      {
        id: 'n-start',
        type: 'blueprint',
        position: { x: 0, y: 0 },
        data: {
          kind: 'trigger',
          label: 'Start',
          triggerSubject: 'invoices',
          triggerEntry: 'event',
          triggerFilters: {
            ...defaultTriggerFilters(),
            invoices: {
              openOnly: true,
              statuses: ['pending'],
              minDaysPastDue: '',
            },
          },
        },
      },
      {
        id: 'n-when',
        type: 'blueprint',
        position: { x: 0, y: 0 },
        data: {
          kind: 'if',
          label: 'On hold',
          checkId: 'on_hold',
        },
      },
    ],
    edges: [{ id: 'e1', source: 'n-start', target: 'n-when' }],
  }
}

function agingChaseBlueprint(): SavedBlueprint {
  return {
    id: 'bp-chase',
    name: 'Invoice payment chase (draft)',
    updatedAt: '2026-09-20T00:00:00.000Z',
    nodes: [
      {
        id: 'n-start',
        type: 'blueprint',
        position: { x: 0, y: 0 },
        data: {
          kind: 'trigger',
          label: 'Start',
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
      },
    ],
    edges: [],
  }
}

describe('blueprintAutoMatch', () => {
  it('matches hold event to When·On hold even if Start statuses are pending-only', () => {
    const m = scoreBlueprintForEvent(holdBlueprint(), 'hold', makeInvoice('hold'))
    expect(m).not.toBeNull()
    expect(m!.score).toBeGreaterThan(0)
  })

  it('matches hold_cleared to When with Match when · False', () => {
    const bp = holdBlueprint()
    const when = bp.nodes.find((n) => n.data.kind === 'if')!
    when.data.whenMatch = 'no'
    const m = scoreBlueprintForEvent(bp, 'hold_cleared', makeInvoice('approved'))
    expect(m).not.toBeNull()
    expect(m!.reason).toMatch(/Removed/)
  })

  it('matches place-hold to Removed-from-hold graph so it can park', () => {
    const bp = holdBlueprint()
    const when = bp.nodes.find((n) => n.data.kind === 'if')!
    when.data.whenMatch = 'no'
    const m = scoreBlueprintForEvent(bp, 'hold', makeInvoice('hold'))
    expect(m).not.toBeNull()
    expect(m!.reason).toMatch(/park/i)
  })

  it('does not match hold_cleared to on-hold (true) When', () => {
    const m = scoreBlueprintForEvent(holdBlueprint(), 'hold_cleared', makeInvoice('approved'))
    expect(m).toBeNull()
  })

  it('does not match aging payment chase on hold event', () => {
    const m = scoreBlueprintForEvent(agingChaseBlueprint(), 'hold', makeInvoice('hold'))
    expect(m).toBeNull()
  })

  it('prefers hold When graph over aging chase on hold event', () => {
    const hold = scoreBlueprintForEvent(holdBlueprint(), 'hold', makeInvoice('hold'))!
    expect(hold.score).toBeGreaterThan(0)
    expect(scoreBlueprintForEvent(agingChaseBlueprint(), 'hold', makeInvoice('hold'))).toBeNull()
  })

  it('does not match hold-only graph to ppw', () => {
    const holdOnly: SavedBlueprint = {
      ...holdBlueprint(),
      id: 'bp-hold-only',
      nodes: [
        {
          id: 'n-start',
          type: 'blueprint',
          position: { x: 0, y: 0 },
          data: {
            kind: 'trigger',
            label: 'Start',
            triggerSubject: 'invoices',
            triggerEntry: 'filter',
            triggerFilters: {
              ...defaultTriggerFilters(),
              invoices: {
                openOnly: true,
                statuses: ['hold'],
                minDaysPastDue: '',
              },
            },
          },
        },
      ],
      edges: [],
    }
    expect(scoreBlueprintForEvent(holdOnly, 'ppw', makeInvoice('approved'))).toBeNull()
  })

  it('exposes priority for ordering (higher wins)', () => {
    const low = { ...holdBlueprint(), priority: 1 }
    const high = { ...holdBlueprint(), id: 'bp-hi', priority: 80 }
    expect(blueprintPriority(high)).toBeGreaterThan(blueprintPriority(low))
    expect(scoreBlueprintForEvent(low, 'hold', makeInvoice('hold'))).not.toBeNull()
    expect(scoreBlueprintForEvent(high, 'hold', makeInvoice('hold'))).not.toBeNull()
  })

  it('scores sync event for open invoices matching Start filters', () => {
    const chase = agingChaseBlueprint()
    chase.nodes[0].data.triggerFilters!.invoices.minDaysPastDue = ''
    const m = scoreBlueprintForEvent(chase, 'sync', makeInvoice('approved'))
    expect(m).not.toBeNull()
    expect(m!.score).toBeGreaterThan(0)
  })

  it('matches payment_posted to When · Payment posted graphs', () => {
    const bp: SavedBlueprint = {
      id: 'bp-pay',
      name: 'Payment note',
      updatedAt: '2026-09-24T00:00:00.000Z',
      nodes: [
        {
          id: 'n-start',
          type: 'blueprint',
          position: { x: 0, y: 0 },
          data: {
            kind: 'trigger',
            label: 'Start',
            triggerSubject: 'invoices',
            triggerEntry: 'event',
            triggerFilters: defaultTriggerFilters(),
          },
        },
        {
          id: 'n-when',
          type: 'blueprint',
          position: { x: 0, y: 0 },
          data: {
            kind: 'if',
            label: 'Paid',
            checkId: 'payment_posted',
            whenMatch: 'yes',
          },
        },
      ],
      edges: [{ id: 'e1', source: 'n-start', target: 'n-when' }],
    }
    const m = scoreBlueprintForEvent(bp, 'payment_posted', makeInvoice('approved'))
    expect(m).not.toBeNull()
    expect(m!.reason).toMatch(/Payment posted/i)
  })
})
