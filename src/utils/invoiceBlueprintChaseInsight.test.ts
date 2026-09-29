import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedBlueprint } from '../types/blueprintGraph'
import { saveBlueprint, deleteSavedBlueprint } from '../components/blueprints/blueprintStore'
import { startInvoiceRun, listBlueprintRuns, upsertBlueprintRun } from '../components/blueprints/blueprintRuns'
import {
  getInvoiceBlueprintChaseInsight,
  getInvoiceBlueprintChaseTrack,
} from './invoiceBlueprintChaseInsight'

const BP_ID = 'bp-test-chase-card'
const INV_ID = 'inv-chase-card'

function installLocalStorage() {
  const store = new Map<string, string>()
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v))
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (i: number) => [...store.keys()][i] ?? null,
  }
  vi.stubGlobal('localStorage', ls)
  vi.stubGlobal('window', {
    localStorage: ls,
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })
}

function blueprint(): SavedBlueprint {
  return {
    id: BP_ID,
    name: 'Standard paperwork chase',
    updatedAt: '2026-09-28T00:00:00.000Z',
    nodes: [
      {
        id: 'n-start',
        type: 'blueprint',
        position: { x: 0, y: 0 },
        data: { kind: 'trigger', label: 'Start', triggerSubject: 'invoices' },
      },
      {
        id: 'n-when',
        type: 'blueprint',
        position: { x: 200, y: 0 },
        data: { kind: 'if', label: 'Paperwork sent', checkId: 'ppw_sent', whenMatch: 'yes' },
      },
      {
        id: 'n-wait',
        type: 'blueprint',
        position: { x: 400, y: 0 },
        data: { kind: 'wait', label: 'After PPW', waitUntilId: 'pause_days', days: '7' },
      },
      {
        id: 'n-ask',
        type: 'blueprint',
        position: { x: 600, y: 0 },
        data: {
          kind: 'action',
          label: 'Paperwork status',
          actionId: 'email_followup',
          actionIds: ['email_followup'],
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'n-start', target: 'n-when' },
      { id: 'e2', source: 'n-when', target: 'n-wait' },
      { id: 'e3', source: 'n-wait', target: 'n-ask' },
    ],
  }
}

describe('getInvoiceBlueprintChaseInsight', () => {
  beforeEach(() => {
    installLocalStorage()
    deleteSavedBlueprint(BP_ID)
    for (const run of listBlueprintRuns()) {
      if (run.subjectId === INV_ID) {
        upsertBlueprintRun({ ...run, status: 'stopped', waitUntil: null })
      }
    }
    saveBlueprint(blueprint())
  })

  it('says which chase sends, in how many days, unless the broker replies', () => {
    const now = new Date(2026, 8, 29, 12, 0, 0)
    const waitUntil = new Date(2026, 9, 2, 9, 0, 0).toISOString()
    startInvoiceRun({
      invoiceId: INV_ID,
      invoiceNumber: 'CHASE-CARD-001',
      clientLabel: 'Test Carrier',
      blueprintId: BP_ID,
      blueprintName: 'Standard paperwork chase',
      currentNodeId: 'n-wait',
      currentStep: 'Wait until · After PPW',
      status: 'waiting',
      waitUntil,
    })

    const card = getInvoiceBlueprintChaseInsight(
      { id: INV_ID, invoice_number: 'CHASE-CARD-001' },
      now
    )
    expect(card?.title).toBe('Next status')
    expect(card?.subtitle).toBe(
      'Paperwork status · Runs Fri, Oct 2 at 9:00 AM unless the broker replies'
    )
    expect(card?.icon).toBe('mail')

    const track = getInvoiceBlueprintChaseTrack(
      { id: INV_ID, invoice_number: 'CHASE-CARD-001' },
      now
    )
    expect(track?.steps.map((step) => step.number)).toEqual([1, 2, 3])
    expect(track?.steps.map((step) => step.state)).toEqual(['done', 'current', 'upcoming'])
    expect(track?.steps[1]?.detail).toBe(
      'Paperwork status. Runs Fri, Oct 2 at 9:00 AM unless the broker replies'
    )
    expect(track?.steps[0]?.label).toBe('Paperwork sent')
    expect(track?.steps[2]?.label).toBe('Paperwork status')
  })

  it('includes the clock time when the chase sends today', () => {
    const now = new Date(2026, 8, 29, 8, 15, 0)
    const waitUntil = new Date(2026, 8, 29, 9, 0, 0).toISOString()
    startInvoiceRun({
      invoiceId: INV_ID,
      invoiceNumber: 'CHASE-CARD-001',
      clientLabel: 'Test Carrier',
      blueprintId: BP_ID,
      blueprintName: 'Standard paperwork chase',
      currentNodeId: 'n-wait',
      currentStep: 'Wait until · After PPW',
      status: 'waiting',
      waitUntil,
    })

    const card = getInvoiceBlueprintChaseInsight(
      { id: INV_ID, invoice_number: 'CHASE-CARD-001' },
      now
    )
    expect(card?.subtitle).toBe(
      'Paperwork status · Runs today at 9:00 AM unless the broker replies'
    )
  })

  it('keeps the clock time when the wait is already due', () => {
    const now = new Date(2026, 8, 29, 16, 15, 0)
    const waitUntil = new Date(2026, 8, 29, 9, 0, 0).toISOString()
    startInvoiceRun({
      invoiceId: INV_ID,
      invoiceNumber: 'CHASE-CARD-001',
      clientLabel: 'Test Carrier',
      blueprintId: BP_ID,
      blueprintName: 'Standard paperwork chase',
      currentNodeId: 'n-wait',
      currentStep: 'Wait until · After PPW',
      status: 'waiting',
      waitUntil,
    })

    const card = getInvoiceBlueprintChaseInsight(
      { id: INV_ID, invoice_number: 'CHASE-CARD-001' },
      now
    )
    expect(card?.subtitle).toBe(
      'Paperwork status · Scheduled today at 9:00 AM. Sends on the next blueprint check unless the broker replies'
    )
  })

  it('describes a parked When without inventing a day count', () => {
    startInvoiceRun({
      invoiceId: INV_ID,
      invoiceNumber: 'CHASE-CARD-001',
      clientLabel: 'Test Carrier',
      blueprintId: BP_ID,
      blueprintName: 'Standard paperwork chase',
      currentNodeId: 'n-when',
      currentStep: 'Waiting · Paperwork sent',
      status: 'waiting',
      waitUntil: null,
    })

    const card = getInvoiceBlueprintChaseInsight({
      id: INV_ID,
      invoice_number: 'CHASE-CARD-001',
    })
    expect(card?.title).toBe('Next status')
    expect(card?.subtitle).toBe(
      'Paperwork status · Waiting until the packet is sent to the broker'
    )
  })

  it('stays hidden when no blueprint is running', () => {
    expect(
      getInvoiceBlueprintChaseInsight({ id: 'inv-none', invoice_number: 'NONE-1' })
    ).toBeNull()
  })
})
