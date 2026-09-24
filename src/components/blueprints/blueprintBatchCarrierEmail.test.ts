import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlueprintFlowNode, SavedBlueprint } from '../../types/blueprintGraph'
import { setBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import {
  blueprintGraphOwnsBatchCarrierEmail,
  shouldSkipSettingsBatchCarrierEmail,
} from './blueprintBatchCarrierEmail'
import { assignBatchBlueprint, clearBatchBlueprintAssignment } from './batchBlueprintAssignment'
import { saveBlueprint, deleteSavedBlueprint } from './blueprintStore'
import { defaultTriggerFilters } from './blueprintTriggerFilters'

const BP_EMAIL = 'bp-test-batch-carrier-email'
const BP_ALERTS = 'bp-test-batch-alerts-only'
const BATCH_ID = 'batch-gate-1'

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

function actionNode(actionIds: string[]): BlueprintFlowNode {
  return {
    id: 'n-act',
    type: 'blueprint',
    position: { x: 0, y: 0 },
    data: {
      kind: 'action',
      label: 'Then do',
      actionId: actionIds[0],
      actionIds,
    },
  }
}

function batchBp(id: string, actionIds: string[]): SavedBlueprint {
  return {
    id,
    name: id,
    updatedAt: '2026-09-24T00:00:00.000Z',
    priority: 70,
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
        position: { x: 100, y: 0 },
        data: {
          kind: 'if',
          label: 'Processed',
          checkId: 'batch_processed',
          whenMatch: 'yes',
        },
      },
      actionNode(actionIds),
    ],
    edges: [
      { id: 'e1', source: 'n-start', target: 'n-when' },
      { id: 'e2', source: 'n-when', target: 'n-act' },
    ],
  }
}

describe('blueprintBatchCarrierEmail', () => {
  beforeEach(() => {
    installLocalStorage()
    setBlueprintsRunnerEnabled(false)
    deleteSavedBlueprint(BP_EMAIL)
    deleteSavedBlueprint(BP_ALERTS)
    clearBatchBlueprintAssignment(BATCH_ID)
  })

  it('detects email_carrier_batch_processed in graph', () => {
    expect(blueprintGraphOwnsBatchCarrierEmail([actionNode(['push_notify'])])).toBe(
      false
    )
    expect(
      blueprintGraphOwnsBatchCarrierEmail([
        actionNode(['email_carrier_batch_processed']),
      ])
    ).toBe(true)
  })

  it('skips Settings send when Live + assigned email blueprint', () => {
    saveBlueprint(batchBp(BP_EMAIL, ['email_carrier_batch_processed']))
    assignBatchBlueprint(BATCH_ID, BP_EMAIL, 'Email')
    expect(shouldSkipSettingsBatchCarrierEmail(BATCH_ID)).toBe(false)
    setBlueprintsRunnerEnabled(true)
    expect(shouldSkipSettingsBatchCarrierEmail(BATCH_ID)).toBe(true)
  })

  it('does not skip for alert-only blueprint', () => {
    setBlueprintsRunnerEnabled(true)
    saveBlueprint(batchBp(BP_ALERTS, ['push_notify', 'urgent_review']))
    assignBatchBlueprint(BATCH_ID, BP_ALERTS, 'Alerts')
    expect(shouldSkipSettingsBatchCarrierEmail(BATCH_ID)).toBe(false)
  })
})
