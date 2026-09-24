/**
 * Batch Process → blueprint enroll → Then-do admin alert.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import { setBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { clearInvoices } from '../../data/mockInvoices'
import { clearBatches, hydrateBatches, getBatchById } from '../../data/mockBatches'
import type { Batch } from '../../data/mockBatches'
import { defaultTriggerFilters } from './blueprintTriggerFilters'
import { saveBlueprint, deleteSavedBlueprint } from './blueprintStore'
import { findBestMatchingBatchBlueprint } from './blueprintAutoMatch'
import { onBatchProcessed } from './blueprintBatchRunner'
import { getPrimaryRunForBatch } from './blueprintRuns'
import { clearBatchBlueprintAssignment } from './batchBlueprintAssignment'

const BP_ID = 'bp-test-batch-processed'
const BATCH_ID = 'batch-test-processed-1'

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

function batchBlueprint(): SavedBlueprint {
  return {
    id: BP_ID,
    name: 'Batch processed notice (test)',
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
          triggerSubject: 'batches',
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
          label: 'Processed',
          checkId: 'batch_processed',
          whenMatch: 'yes',
        },
      },
      {
        id: 'n-notify',
        type: 'blueprint',
        position: { x: 400, y: 0 },
        data: {
          kind: 'action',
          label: 'Notify',
          actionId: 'push_notify',
          actionIds: ['push_notify'],
          actionConfigs: {
            push_notify: {
              message: 'Batch processed — test alert.',
              channel: 'app',
            },
          },
        },
      },
      {
        id: 'n-done',
        type: 'blueprint',
        position: { x: 600, y: 0 },
        data: { kind: 'stop', label: 'Done' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n-start', target: 'n-when' },
      { id: 'e2', source: 'n-when', target: 'n-notify' },
      { id: 'e3', source: 'n-notify', target: 'n-done' },
    ],
  }
}

function sampleBatch(): Batch {
  return {
    id: BATCH_ID,
    batch_number: 'CY-TEST-001',
    client_name: 'Test Carrier',
    client_id: 'client-test-1',
    total_invoices: 1,
    total_amount: 1000,
    minutes_since_submitted: 0,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  }
}

describe('blueprintBatchRunner', () => {
  beforeEach(() => {
    installLocalStorage()
    setBlueprintsRunnerEnabled(true)
    clearInvoices()
    clearBatches()
    clearBatchBlueprintAssignment(BATCH_ID)
    deleteSavedBlueprint(BP_ID)
    saveBlueprint(batchBlueprint())
    hydrateBatches([sampleBatch()])
  })

  it('matches batch_processed blueprints', () => {
    const best = findBestMatchingBatchBlueprint('batch_processed')
    expect(best?.blueprint.id).toBe(BP_ID)
  })

  it('enrolls and completes Then-do on batch processed', async () => {
    await onBatchProcessed(BATCH_ID)
    const batch = getBatchById(BATCH_ID)
    expect(batch).toBeTruthy()
    const run = getPrimaryRunForBatch(batch!)
    expect(run).toBeTruthy()
    expect(run!.blueprintId).toBe(BP_ID)
    expect(run!.status).toBe('completed')
    expect(run!.subject).toBe('batch')
  })

  it('does nothing when Live runner is off', async () => {
    setBlueprintsRunnerEnabled(false)
    await onBatchProcessed(BATCH_ID)
    const batch = getBatchById(BATCH_ID)!
    expect(getPrimaryRunForBatch(batch)).toBeNull()
  })
})
