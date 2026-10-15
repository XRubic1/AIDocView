/**
 * Stages on: paperwork chase → hold pauses it → hold removed resumes it at the same step
 * (or moves to the payment chase when paperwork was confirmed during the hold).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import type { Invoice } from '../../types/invoice'
import { clearInvoices, hydrateInvoices } from '../../data/mockInvoices'
import { setBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { defaultTriggerFilters } from './blueprintTriggerFilters'
import { saveBlueprint } from './blueprintStore'
import { listBlueprintRuns } from './blueprintRuns'
import { applyStageConfig } from './blueprintStagesConfig'
import { onInvoiceHeld, onInvoiceHoldCleared, syncInvoiceBlueprints } from './blueprintRunner'

const INV_ID = 'inv-stage-test'

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

/** Start → Wait N days → Done. */
function waitBlueprint(id: string, name: string, days: string): SavedBlueprint {
  return {
    id,
    name,
    updatedAt: '2026-10-01T00:00:00.000Z',
    nodes: [
      {
        id: `${id}-start`,
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
        id: `${id}-wait`,
        type: 'blueprint',
        position: { x: 200, y: 0 },
        data: { kind: 'wait', label: `Wait ${days} days`, waitUntilId: 'pause_days', days },
      },
      {
        id: `${id}-done`,
        type: 'blueprint',
        position: { x: 400, y: 0 },
        data: { kind: 'stop', label: 'Done' },
      },
    ],
    edges: [
      { id: `${id}-e1`, source: `${id}-start`, target: `${id}-wait` },
      { id: `${id}-e2`, source: `${id}-wait`, target: `${id}-done` },
    ],
  }
}

function invoice(status: Invoice['status'], paperworkStatus = 'unknown'): Invoice {
  return {
    id: INV_ID,
    invoice_number: 'STAGE-001',
    client_id: 'c-test',
    client_name: 'Test Carrier',
    broker_id: 'b1',
    broker_name: 'Broker',
    amount: 100,
    status,
    invoice_date: '2026-10-01',
    created_at: '2026-10-01T00:00:00.000Z',
    documents_count: 0,
    notes_history: [],
    document_send_history: [{ sent_at: '2026-10-02T00:00:00.000Z', status: 'sent' }],
    email_lifecycle: { paperwork_status: paperworkStatus },
  } as unknown as Invoice
}

function runsFor(blueprintId: string) {
  return listBlueprintRuns().filter((r) => r.subjectId === INV_ID && r.blueprintId === blueprintId)
}

describe('blueprint stages — hold pauses and resumes the chase', () => {
  beforeEach(() => {
    installLocalStorage()
    clearInvoices()
    setBlueprintsRunnerEnabled(true)
    saveBlueprint(waitBlueprint('bp-paper', 'Paperwork chase', '3'))
    saveBlueprint(waitBlueprint('bp-pay', 'Payment chase', '10'))
    saveBlueprint(waitBlueprint('bp-hold', 'Hold notice', '5'))
    applyStageConfig({
      enabled: true,
      blueprints: { paperwork: 'bp-paper', payment: 'bp-pay', hold: 'bp-hold' },
      holdResume: 'resume',
    })
  })

  it('resumes the paperwork chase at the same wait after the hold', async () => {
    hydrateInvoices([invoice('approved')])
    await syncInvoiceBlueprints(INV_ID, 'status change')
    const [paper] = runsFor('bp-paper')
    expect(paper.status).toBe('waiting')
    const wake = paper.waitUntil

    hydrateInvoices([invoice('hold')])
    await onInvoiceHeld(INV_ID)
    expect(runsFor('bp-paper')[0].status).toBe('paused')
    expect(runsFor('bp-hold')[0].status).toBe('waiting')

    hydrateInvoices([invoice('approved')])
    await onInvoiceHoldCleared(INV_ID)
    const resumed = runsFor('bp-paper')[0]
    expect(resumed.status).toBe('waiting')
    expect(resumed.waitUntil).toBe(wake)
    expect(resumed.currentStep.startsWith('Paused')).toBe(false)
    expect(runsFor('bp-hold')[0].status).toBe('stopped')
  })

  it('moves to the payment chase when paperwork was confirmed during the hold', async () => {
    hydrateInvoices([invoice('approved')])
    await syncInvoiceBlueprints(INV_ID, 'status change')
    hydrateInvoices([invoice('hold')])
    await onInvoiceHeld(INV_ID)

    hydrateInvoices([invoice('approved', 'good')])
    await onInvoiceHoldCleared(INV_ID)
    // Paperwork and payment share the invoice's main run row; payment takes it over.
    expect(runsFor('bp-paper')).toHaveLength(0)
    const [pay] = runsFor('bp-pay')
    expect(pay.status).toBe('waiting')
    expect(pay.history?.some((h) => /moved to Payment/.test(h.title))).toBe(true)
    expect(runsFor('bp-hold')[0].status).toBe('stopped')
  })

  it('keeps the older matching when stages are off', async () => {
    applyStageConfig({ enabled: false, blueprints: {}, holdResume: 'resume' })
    hydrateInvoices([invoice('hold')])
    await onInvoiceHeld(INV_ID)
    expect(runsFor('bp-paper').some((r) => r.status === 'paused')).toBe(false)
  })
})
