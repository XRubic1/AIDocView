/**
 * New broker → blueprint enroll → Then-do note + urgent review.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import { setBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { clearInvoices } from '../../data/mockInvoices'
import { hydrateBrokers, getBrokerById, addBroker } from '../../data/mockBrokers'
import { defaultTriggerFilters } from './blueprintTriggerFilters'
import { saveBlueprint, deleteSavedBlueprint } from './blueprintStore'
import { findBestMatchingBrokerBlueprint } from './blueprintAutoMatch'
import { onBrokerCreated } from './blueprintBrokerRunner'
import { getPrimaryRunForBroker } from './blueprintRuns'

const BP_ID = 'bp-test-new-broker'

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

function newBrokerBlueprint(): SavedBlueprint {
  return {
    id: BP_ID,
    name: 'New broker onboarding (test)',
    updatedAt: '2026-09-24T00:00:00.000Z',
    priority: 90,
    nodes: [
      {
        id: 'n-start',
        type: 'blueprint',
        position: { x: 0, y: 0 },
        data: {
          kind: 'trigger',
          label: 'Start',
          triggerSubject: 'brokers',
          triggerEntry: 'event',
          triggerFilters: defaultTriggerFilters(),
        },
      },
      {
        id: 'n-when',
        type: 'blueprint',
        position: { x: 200, y: 0 },
        data: {
          kind: 'if',
          label: 'Created',
          checkId: 'broker_created',
          whenMatch: 'yes',
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
              message: 'Welcome — review this new broker.',
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

describe('blueprintBrokerRunner new broker', () => {
  beforeEach(() => {
    installLocalStorage()
    clearInvoices()
    hydrateBrokers([])
    setBlueprintsRunnerEnabled(true)
    deleteSavedBlueprint(BP_ID)
    saveBlueprint(newBrokerBlueprint())
  })

  it('matches broker_created to broker-subject event graphs', () => {
    const m = findBestMatchingBrokerBlueprint('broker_created')
    expect(m).not.toBeNull()
    expect(m!.blueprint.id).toBe(BP_ID)
  })

  it('enrolls and writes a broker note when a broker is created', () => {
    const created = addBroker({
      id: 'broker-bp-test-1',
      name: 'Test Logistics LLC',
      payment_terms_days: 30,
    })
    // addBroker queues onBrokerCreated — also call directly for sync test
    onBrokerCreated(created.id)

    const broker = getBrokerById(created.id)
    expect(broker?.notes).toMatch(/Welcome/i)
    expect(broker?.notes).toMatch(/Blueprint:/i)

    const run = getPrimaryRunForBroker(created)
    expect(run?.status).toBe('completed')
    expect(run?.blueprintId).toBe(BP_ID)
  })
})
