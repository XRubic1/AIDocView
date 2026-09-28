/**
 * Run the broker-reply blueprint for confirmed, rejected, or unknown.
 */
import type { Invoice } from '../../types/invoice'
import type { InvoiceEmailLifecycle } from '../../types/emailLifecycle'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import {
  STANDARD_BROKER_CONFIRMED,
  STANDARD_BROKER_REJECTED,
  STANDARD_BROKER_UNKNOWN,
} from '../../../supabase/functions/_shared/standardBlueprints'
import { getSavedBlueprint } from './blueprintStore'
import { getActionIds } from './blueprintSubject'
import { executeBlueprintThenDo } from './blueprintRunnerActions'
import { upsertBlueprintRun } from './blueprintRuns'
import { holdAdminInvoice } from '../../services/adminInvoiceActions'
import { addAdminInvoiceNote, postInvoiceStatusNote } from '../../services/adminInvoiceNoteActions'
import { persistInvoiceLifecycle } from '../../services/emailLifecycleService'
import {
  confirmedTrack,
  type BrokerReplyReading,
  type BrokerReplyStatus,
} from '../../utils/brokerReplyReading'

const GRAPHS = {
  confirmed: STANDARD_BROKER_CONFIRMED,
  rejected: STANDARD_BROKER_REJECTED,
  unknown: STANDARD_BROKER_UNKNOWN,
} as const

function graphFor(status: BrokerReplyStatus): SavedBlueprint {
  const standard = GRAPHS[status]
  return (getSavedBlueprint(standard.id) ?? standard) as SavedBlueprint
}

async function applyReading(invoice: Invoice, reading: BrokerReplyReading, blueprintName: string): Promise<string> {
  const life: InvoiceEmailLifecycle = {
    paperwork_status: 'unknown',
    ...(invoice.email_lifecycle ?? {}),
    last_reply_status: reading.status,
  }
  const note = `${reading.summary} ${blueprintName}`

  if (reading.status === 'confirmed' && confirmedTrack(reading) === 'paperwork') {
    life.paperwork_status = 'good'
    life.paperwork = { ...(life.paperwork ?? {}), lastInboundAt: new Date().toISOString() }
    await persistInvoiceLifecycle(invoice.id, life)
    postInvoiceStatusNote(invoice.id, {
      kind: 'ppw_confirmed',
      authorName: 'Credyx',
      extraNote: reading.summary,
    })
    return 'Paperwork confirmed'
  }

  if (reading.status === 'confirmed') {
    life.payment = { ...(life.payment ?? {}), lastInboundAt: new Date().toISOString() }
    await persistInvoiceLifecycle(invoice.id, life)
    if (reading.payDate) {
      postInvoiceStatusNote(invoice.id, {
        kind: 'will_pay',
        authorName: 'Credyx',
        collectionDate: reading.payDate,
        extraNote: reading.summary,
      })
      return `Will pay ${reading.payDate}`
    }
    postInvoiceStatusNote(invoice.id, {
      kind: 'payment_confirmed',
      authorName: 'Credyx',
      extraNote: reading.summary,
    })
    return 'Payment confirmed'
  }

  if (reading.status === 'rejected') {
    life.paperwork_status = 'issue'
    life.paperwork = { ...(life.paperwork ?? {}), lastInboundAt: new Date().toISOString() }
    await persistInvoiceLifecycle(invoice.id, life)
    holdAdminInvoice(invoice.id, reading.summary, 'Credyx')
    return 'Broker rejected'
  }

  await persistInvoiceLifecycle(invoice.id, life)
  addAdminInvoiceNote(invoice.id, note, 'Credyx', { visibility: 'internal' })
  return 'Unknown reply'
}

export async function runBrokerReplyBlueprint(
  invoice: Invoice,
  reading: BrokerReplyReading
): Promise<{ ok: boolean; detail: string }> {
  const bp = graphFor(reading.status)
  const existing: InvoiceEmailLifecycle = {
    paperwork_status: 'unknown',
    ...(invoice.email_lifecycle ?? {}),
    last_reply_status: reading.status,
  }
  await persistInvoiceLifecycle(invoice.id, existing)
  const details: string[] = []
  for (const node of bp.nodes) {
    if (node.data.kind !== 'action') continue
    for (const actionId of getActionIds(node.data)) {
      if (actionId === 'apply_broker_reply') {
        details.push(await applyReading(invoice, reading, bp.name))
        continue
      }
      const cfg = node.data.actionConfigs?.[actionId]
      const result = await executeBlueprintThenDo({
        invoiceId: invoice.id,
        actionId,
        blueprintName: bp.name,
        config: cfg,
        authorName: 'Credyx',
      })
      details.push(result.detail)
    }
  }
  if (!details.length) {
    details.push(await applyReading(invoice, reading, bp.name))
  }

  const now = new Date().toISOString()
  upsertBlueprintRun(
    {
      id: `run-reply-${invoice.id}-${Date.now()}`,
      subject: 'invoice',
      subjectId: invoice.id,
      subjectLabel: invoice.invoice_number,
      clientLabel: invoice.client_name,
      blueprintId: bp.id,
      blueprintName: bp.name,
      status: 'completed',
      currentStep: `Done · ${reading.status}`,
      currentNodeId: 'n-done',
      waitUntil: null,
      startedAt: now,
      updatedAt: now,
    },
    {
      historyEvent: {
        kind: 'completed',
        title: reading.status === 'confirmed' ? 'Broker confirmed' : reading.status === 'rejected' ? 'Broker rejected' : 'Reply unknown',
        detail: reading.summary,
      },
    }
  )

  return { ok: true, detail: details.join(' · ') }
}
