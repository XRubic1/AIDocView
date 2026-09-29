/**
 * Actions panel: honor waits, or skip them and run every step.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import type { Invoice } from '../../types/invoice'
import { clearInvoices, hydrateInvoices, getInvoiceById } from '../../data/mockInvoices'
import { setBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { saveBlueprint, deleteSavedBlueprint } from './blueprintStore'
import { clearInvoiceBlueprintAssignment } from './invoiceBlueprintAssignment'
import { listBlueprintRuns, upsertBlueprintRun } from './blueprintRuns'
import { runInvoiceBlueprintManual } from './blueprintRunner'

const WAIT_BP = 'bp-test-manual-wait'
const WHEN_BP = 'bp-test-manual-when'
const WAIT_INV = 'inv-manual-wait'
const WHEN_INV = 'inv-manual-when'

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

function invoice(id: string, status: Invoice['status']): Invoice {
  return {
    id,
    invoice_number: id,
    client_id: 'c-test',
    client_name: 'Test Carrier',
    broker_id: 'b1',
    broker_name: 'Broker',
    amount: 100,
    status,
    invoice_date: '2026-09-22',
    created_at: '2026-09-22T00:00:00.000Z',
    documents_count: 0,
    notes_history: [],
  } as Invoice
}

function graph(id: string, name: string, nodes: SavedBlueprint['nodes'], edges: SavedBlueprint['edges']): SavedBlueprint {
  return {
    id,
    name,
    updatedAt: '2026-09-28T00:00:00.000Z',
    priority: 10,
    nodes,
    edges,
  }
}

const start = {
  id: 'n-start',
  type: 'blueprint' as const,
  position: { x: 0, y: 0 },
  data: {
    kind: 'trigger' as const,
    label: 'Start',
    triggerSubject: 'invoices' as const,
  },
}

describe('runInvoiceBlueprintManual', () => {
  beforeEach(() => {
    installLocalStorage()
    clearInvoices()
    setBlueprintsRunnerEnabled(false)
    for (const id of [WAIT_BP, WHEN_BP]) deleteSavedBlueprint(id)
    for (const id of [WAIT_INV, WHEN_INV]) clearInvoiceBlueprintAssignment(id)
    for (const run of listBlueprintRuns()) {
      if (run.subjectId === WAIT_INV || run.subjectId === WHEN_INV) {
        upsertBlueprintRun({ ...run, status: 'stopped', waitUntil: null })
      }
    }
  })

  it('stops on a Wait when run normally, and runs the later step when waits are skipped', async () => {
    saveBlueprint(
      graph(
        WAIT_BP,
        'Wait then note',
        [
          start,
          {
            id: 'n-wait',
            type: 'blueprint',
            position: { x: 200, y: 0 },
            data: { kind: 'wait', label: 'Pause', waitUntilId: 'pause_days', days: '3' },
          },
          {
            id: 'n-note',
            type: 'blueprint',
            position: { x: 400, y: 0 },
            data: {
              kind: 'action',
              label: 'Add note',
              actionId: 'add_note',
              actionIds: ['add_note'],
              actionConfigs: { add_note: { message: 'Ran after the wait.', channel: 'app' } },
            },
          },
        ],
        [
          { id: 'e1', source: 'n-start', target: 'n-wait' },
          { id: 'e2', source: 'n-wait', target: 'n-note' },
        ]
      )
    )
    hydrateInvoices([invoice(WAIT_INV, 'approved')])

    const normal = await runInvoiceBlueprintManual({
      invoiceId: WAIT_INV,
      blueprintId: WAIT_BP,
      mode: 'normal',
    })
    expect(normal.ok).toBe(true)
    expect(normal.detail).toMatch(/Waiting/i)
    expect(getInvoiceById(WAIT_INV)?.notes_history ?? []).toHaveLength(0)

    const skipped = await runInvoiceBlueprintManual({
      invoiceId: WAIT_INV,
      blueprintId: WAIT_BP,
      mode: 'skip_waits',
    })
    expect(skipped.ok).toBe(true)
    expect(skipped.detail).toMatch(/Skipped wait/i)
    expect(
      (getInvoiceById(WAIT_INV)?.notes_history ?? []).some((n) => /Ran after the wait/i.test(n.note))
    ).toBe(true)
  })

  it('parks on an unmatched When, and still runs the step when waits are skipped', async () => {
    saveBlueprint(
      graph(
        WHEN_BP,
        'When then note',
        [
          start,
          {
            id: 'n-when',
            type: 'blueprint',
            position: { x: 200, y: 0 },
            data: { kind: 'if', label: 'Removed from hold', checkId: 'on_hold', whenMatch: 'no' },
          },
          {
            id: 'n-note',
            type: 'blueprint',
            position: { x: 400, y: 0 },
            data: {
              kind: 'action',
              label: 'Add note',
              actionId: 'add_note',
              actionIds: ['add_note'],
              actionConfigs: { add_note: { message: 'Ran past the When.', channel: 'app' } },
            },
          },
        ],
        [
          { id: 'e1', source: 'n-start', target: 'n-when' },
          { id: 'e2', source: 'n-when', target: 'n-note' },
        ]
      )
    )
    hydrateInvoices([invoice(WHEN_INV, 'hold')])

    const normal = await runInvoiceBlueprintManual({
      invoiceId: WHEN_INV,
      blueprintId: WHEN_BP,
      mode: 'normal',
    })
    expect(normal.detail).toMatch(/Parked at When/i)
    expect(getInvoiceById(WHEN_INV)?.notes_history ?? []).toHaveLength(0)

    const skipped = await runInvoiceBlueprintManual({
      invoiceId: WHEN_INV,
      blueprintId: WHEN_BP,
      mode: 'skip_waits',
    })
    expect(skipped.detail).toMatch(/When not matched — continued/i)
    expect(
      (getInvoiceById(WHEN_INV)?.notes_history ?? []).some((n) => /Ran past the When/i.test(n.note))
    ).toBe(true)
  })
})
