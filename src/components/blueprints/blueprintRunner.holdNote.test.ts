/**
 * Hold → park at Removed-from-hold When → clear → Then-do note.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import type { Invoice } from '../../types/invoice'
import { clearInvoices, hydrateInvoices, getInvoiceById } from '../../data/mockInvoices'
import { setBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { defaultTriggerFilters } from './blueprintTriggerFilters'
import { saveBlueprint, deleteSavedBlueprint } from './blueprintStore'
import { clearInvoiceBlueprintAssignment } from './invoiceBlueprintAssignment'
import {
  listBlueprintRuns,
  upsertBlueprintRun,
  getPrimaryRunForInvoice,
} from './blueprintRuns'
import { onInvoiceHeld, onInvoiceHoldCleared } from './blueprintRunner'

const BP_ID = 'bp-test-hold-cleared-note'
const INV_ID = 'inv-hold-note-test'

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

function holdClearedBlueprint(): SavedBlueprint {
  return {
    id: BP_ID,
    name: 'Note when hold cleared',
    updatedAt: '2026-09-23T00:00:00.000Z',
    priority: 50,
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
              statuses: ['pending', 'approved', 'hold'],
              minDaysPastDue: '',
            },
          },
        },
      },
      {
        id: 'n-when',
        type: 'blueprint',
        position: { x: 200, y: 0 },
        data: {
          kind: 'if',
          label: 'Removed from hold',
          checkId: 'on_hold',
          whenMatch: 'no',
        },
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
          actionConfigs: {
            add_note: {
              message: 'Hold cleared — paperwork good to go.',
              channel: 'app',
            },
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'n-start', target: 'n-when' },
      { id: 'e2', source: 'n-when', target: 'n-note' },
    ],
  }
}

function makeInvoice(status: Invoice['status']): Invoice {
  return {
    id: INV_ID,
    invoice_number: 'HOLD-NOTE-001',
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

describe('blueprintRunner hold → clear → note', () => {
  beforeEach(() => {
    installLocalStorage()
    clearInvoices()
    setBlueprintsRunnerEnabled(true)
    deleteSavedBlueprint(BP_ID)
    clearInvoiceBlueprintAssignment(INV_ID)
    for (const r of listBlueprintRuns()) {
      if (r.subjectId === INV_ID) {
        upsertBlueprintRun({ ...r, status: 'stopped', waitUntil: null })
      }
    }
    saveBlueprint(holdClearedBlueprint())
  })

  it('parks on place-hold and posts Then-do note when hold is cleared', async () => {
    hydrateInvoices([makeInvoice('hold')])

    await onInvoiceHeld(INV_ID)

    const parked = getPrimaryRunForInvoice(getInvoiceById(INV_ID)!)
    expect(parked?.status).toBe('waiting')
    expect(parked?.currentNodeId).toBe('n-when')
    expect(getInvoiceById(INV_ID)?.notes_history ?? []).toHaveLength(0)

    hydrateInvoices([
      {
        ...makeInvoice('approved'),
        notes_history: [],
      },
    ])
    await onInvoiceHoldCleared(INV_ID)

    const notes = getInvoiceById(INV_ID)?.notes_history ?? []
    expect(notes.some((n) => /Hold cleared/i.test(n.note))).toBe(true)
    expect(notes.some((n) => /Blueprint:/i.test(n.note))).toBe(true)
  })
})
