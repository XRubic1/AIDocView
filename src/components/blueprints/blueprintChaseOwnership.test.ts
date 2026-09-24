import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlueprintFlowNode, SavedBlueprint } from '../../types/blueprintGraph'
import { setBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { hydrateInvoices, clearInvoices, getInvoiceById } from '../../data/mockInvoices'
import type { Invoice } from '../../types/invoice'
import {
  blueprintGraphOwnsBrokerChaseEmails,
  resolveBlueprintOwnsChaseFlag,
} from './blueprintChaseOwnership'
import { shouldSkipEmailLifecyclePaymentChase } from './blueprintChaseSkip'
import {
  assignInvoiceBlueprint,
  clearInvoiceBlueprintAssignment,
} from './invoiceBlueprintAssignment'
import { saveBlueprint, deleteSavedBlueprint } from './blueprintStore'

const BP_CHASE = 'bp-test-chase-emails'
const BP_HOLD = 'bp-test-hold-only'
const INV_ID = 'inv-chase-own-1'

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

function noteOnlyBlueprint(): SavedBlueprint {
  return {
    id: BP_HOLD,
    name: 'Hold note only',
    updatedAt: '2026-09-24T00:00:00.000Z',
    nodes: [actionNode(['add_note'])],
    edges: [],
  }
}

function chaseEmailBlueprint(): SavedBlueprint {
  return {
    id: BP_CHASE,
    name: 'Payment chase',
    updatedAt: '2026-09-24T00:00:00.000Z',
    nodes: [actionNode(['email_payment_status', 'email_followup'])],
    edges: [],
  }
}

function baseInvoice(): Invoice {
  return {
    id: INV_ID,
    invoice_number: 'INV-OWN-1',
    client_id: 'c1',
    client_name: 'Carrier',
    broker_id: 'br-1',
    broker_name: 'Broker Co',
    amount: 1000,
    invoice_date: '2026-01-01',
    status: 'approved',
    created_at: '2026-01-01T12:00:00.000Z',
    email_lifecycle: { paperwork_status: 'good' },
  }
}

describe('blueprintChaseOwnership', () => {
  beforeEach(() => {
    installLocalStorage()
    setBlueprintsRunnerEnabled(false)
    clearInvoices()
    hydrateInvoices([baseInvoice()])
    deleteSavedBlueprint(BP_CHASE)
    deleteSavedBlueprint(BP_HOLD)
    clearInvoiceBlueprintAssignment(INV_ID)
  })

  it('blueprintGraphOwnsBrokerChaseEmails detects payment / follow-up', () => {
    expect(
      blueprintGraphOwnsBrokerChaseEmails([actionNode(['add_note', 'notify_carrier'])])
    ).toBe(false)
    expect(
      blueprintGraphOwnsBrokerChaseEmails([actionNode(['email_payment_status'])])
    ).toBe(true)
    expect(
      blueprintGraphOwnsBrokerChaseEmails([actionNode(['email_followup'])])
    ).toBe(true)
  })

  it('shouldSkip requires Live runner + assignment + chase-email graph', () => {
    saveBlueprint(chaseEmailBlueprint())
    assignInvoiceBlueprint(INV_ID, BP_CHASE, 'Payment chase')

    expect(shouldSkipEmailLifecyclePaymentChase(INV_ID)).toBe(false)

    setBlueprintsRunnerEnabled(true)
    expect(shouldSkipEmailLifecyclePaymentChase(INV_ID)).toBe(true)

    clearInvoiceBlueprintAssignment(INV_ID)
    expect(shouldSkipEmailLifecyclePaymentChase(INV_ID)).toBe(false)
  })

  it('hold-only blueprint does not skip payment chase', () => {
    setBlueprintsRunnerEnabled(true)
    saveBlueprint(noteOnlyBlueprint())
    assignInvoiceBlueprint(INV_ID, BP_HOLD, 'Hold note only')
    expect(resolveBlueprintOwnsChaseFlag(BP_HOLD)).toBe(false)
    expect(shouldSkipEmailLifecyclePaymentChase(INV_ID)).toBe(false)
    expect(getInvoiceById(INV_ID)?.email_lifecycle?.blueprint_owns_chase).toBe(false)
  })

  it('assign stamps blueprint_owns_chase when Live + chase emails', () => {
    setBlueprintsRunnerEnabled(true)
    saveBlueprint(chaseEmailBlueprint())
    assignInvoiceBlueprint(INV_ID, BP_CHASE, 'Payment chase')
    expect(getInvoiceById(INV_ID)?.email_lifecycle?.blueprint_owns_chase).toBe(true)

    clearInvoiceBlueprintAssignment(INV_ID)
    expect(getInvoiceById(INV_ID)?.email_lifecycle?.blueprint_owns_chase).toBe(false)
  })
})
