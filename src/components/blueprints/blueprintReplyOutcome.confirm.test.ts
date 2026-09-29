/**
 * Broker confirmed paperwork: internal note, then the live run is the payment chase.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase')
  return {
    ...actual,
    isSupabaseConfigured: () => false,
    getSupabase: () => null,
  }
})
import type { Invoice } from '../../types/invoice'
import { clearInvoices, hydrateInvoices, getInvoiceById } from '../../data/mockInvoices'
import { STANDARD_BROKER_CONFIRMED } from '../../../supabase/functions/_shared/standardBlueprints'
import { readBrokerReplyRules } from '../../utils/brokerReplyReading'
import { getPrimaryRunForInvoice, listBlueprintRuns, upsertBlueprintRun } from './blueprintRuns'
import { runBrokerReplyBlueprint } from './blueprintReplyOutcome'

const INV = 'inv-broker-confirmed'

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

beforeEach(() => {
  installLocalStorage()
  clearInvoices()
  hydrateInvoices([
    {
      id: INV,
      invoice_number: 'INV-4401',
      client_id: 'c-test',
      client_name: 'Test Carrier',
      broker_id: 'b1',
      broker_name: 'Broker',
      amount: 1200,
      status: 'approved',
      invoice_date: '2026-09-01',
      due_date: '2026-10-20',
      created_at: '2026-09-01T00:00:00.000Z',
      documents_count: 1,
      notes_history: [],
      email_lifecycle: { paperwork_status: 'unknown' },
    } as Invoice,
  ])
  localStorage.setItem('credyx.blueprint_runs.seeded.v1', '1')
  const now = '2026-09-29T12:00:00.000Z'
  upsertBlueprintRun({
    id: 'run-paperwork-live',
    subject: 'invoice',
    subjectId: INV,
    subjectLabel: 'INV-4401',
    clientLabel: 'Test Carrier',
    blueprintId: 'bp-standard-paperwork-chase',
    blueprintName: 'Standard paperwork chase',
    status: 'waiting',
    currentStep: 'Wait until · After PPW',
    currentNodeId: 'n-wait-first',
    waitUntil: '2026-10-06T13:00:00.000Z',
    startedAt: now,
    updatedAt: now,
  })
})

describe('broker confirmed paperwork', () => {
  it('includes a note step on the standard confirmed blueprint', () => {
    const ids = STANDARD_BROKER_CONFIRMED.nodes.map((node) => node.id)
    expect(ids).toEqual(['n-start', 'n-when', 'n-apply', 'n-note', 'n-done'])
    const note = STANDARD_BROKER_CONFIRMED.nodes.find((node) => node.id === 'n-note')
    expect(note?.data.actionId).toBe('add_note')
  })

  it('adds an internal note and parks the invoice on the payment chase', async () => {
    const invoice = getInvoiceById(INV)
    expect(invoice).toBeTruthy()
    const reading = readBrokerReplyRules({
      replyBody: 'paperwork is good',
      outboundKind: 'paperwork',
    })
    expect(reading.status).toBe('confirmed')
    expect(reading.classification).toBe('paperwork_ok')

    const result = await runBrokerReplyBlueprint(invoice!, reading)
    expect(result.ok).toBe(true)

    const updated = getInvoiceById(INV)
    const notes = (updated?.notes_history ?? []).filter((row) => /payment chase started/i.test(row.note))
    expect(notes).toHaveLength(1)
    expect(notes[0]?.visibility).toBe('internal')

    const live = getPrimaryRunForInvoice({ id: INV, invoice_number: 'INV-4401' })
    expect(live?.blueprintId).toBe('bp-standard-payment-chase')
    expect(live?.status).toBe('waiting')
    expect(live?.currentNodeId).toBe('n-wait-due')

    const paperwork = listBlueprintRuns().find((run) => run.id === 'run-paperwork-live')
    expect(paperwork?.status).toBe('stopped')
  })
})
