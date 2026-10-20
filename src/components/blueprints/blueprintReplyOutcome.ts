/**
 * Run the broker-reply blueprint for confirmed, rejected, or unknown.
 */
import type { Invoice } from '../../types/invoice'
import type { InvoiceEmailLifecycle } from '../../types/emailLifecycle'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import {
  BROKER_CONFIRMED_NOTE,
  STANDARD_BROKER_CONFIRMED,
  STANDARD_BROKER_REJECTED,
  STANDARD_BROKER_UNKNOWN,
} from '../../../supabase/functions/_shared/standardBlueprints'
import { startPaymentChaseAfterConfirm } from './blueprintRunner'
import { getSavedBlueprint } from './blueprintStore'
import { getActionIds } from './blueprintSubject'
import { executeBlueprintThenDo } from './blueprintRunnerActions'
import { upsertBlueprintRun } from './blueprintRuns'
import { approveAdminInvoice, holdAdminInvoice } from '../../services/adminInvoiceActions'
import { getInvoiceById } from '../../data/mockInvoices'
import { addAdminInvoiceNote, postInvoiceStatusNote } from '../../services/adminInvoiceNoteActions'
import { persistInvoiceLifecycle } from '../../services/emailLifecycleService'
import { replyFromLine } from '../../../supabase/functions/_shared/rateVerificationReply'
import { notifyAdminBlueprintIssue } from '../../services/adminNotificationService'
import { getClientById } from '../../services/clientRegistry'
import { sendTransactionalEmail } from '../../services/emailService'
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

function notedSummary(reading: BrokerReplyReading, repliedBy?: string): string {
  const who = repliedBy ? replyFromLine(repliedBy, reading.status) : ''
  return [who, reading.summary].filter(Boolean).join(' ')
}

async function tellAdminAndCarrier(invoice: Invoice, summary: string, blueprintName: string): Promise<void> {
  const number = invoice.invoice_number?.trim()
  notifyAdminBlueprintIssue({
    invoiceId: invoice.id,
    invoiceNumber: number,
    code: 'paperwork-issue',
    title: 'Paperwork status needs attention',
    message: number ? `Invoice ${number}. ${summary}` : summary,
    blueprintName,
    brokerName: invoice.broker_name,
  })
  const client = getClientById(invoice.client_id)
  const to = client?.email?.trim()
  if (!to) return
  try {
    await sendTransactionalEmail('carrier_claim_or_hold_notice', to, {
      contactName: client?.contact_person || 'there',
      clientName: client?.name || invoice.client_name,
      invoiceNumber: invoice.invoice_number,
      loadNumber: invoice.load_number || 'N/A',
      brokerName: invoice.broker_name,
      summary,
      portalLink: '/client/invoices',
    })
  } catch (err) {
    console.warn('[blueprint] carrier paperwork notice failed', err)
  }
}

/** A confirmed broker reply (good to go / pay date) clears the invoice hold. */
function releaseHoldAfterBrokerConfirm(invoiceId: string): boolean {
  const current = getInvoiceById(invoiceId)
  if (current?.status !== 'hold') return false
  return approveAdminInvoice(invoiceId, 'Credyx')?.status === 'approved'
}

async function applyReading(
  invoice: Invoice,
  reading: BrokerReplyReading,
  blueprintName: string,
  repliedBy?: string
): Promise<string> {
  const life: InvoiceEmailLifecycle = {
    paperwork_status: 'unknown',
    ...(invoice.email_lifecycle ?? {}),
    last_reply_status: reading.status,
  }
  const summary = notedSummary(reading, repliedBy)
  const note = `${summary} ${blueprintName}`

  if (reading.status === 'confirmed' && confirmedTrack(reading) === 'paperwork') {
    life.paperwork_status = 'good'
    life.paperwork = { ...(life.paperwork ?? {}), lastInboundAt: new Date().toISOString() }
    await persistInvoiceLifecycle(invoice.id, life)
    postInvoiceStatusNote(invoice.id, {
      kind: 'ppw_confirmed',
      authorName: 'Credyx',
      extraNote: summary,
    })
    // "Paperwork is good, we'll pay Nov 17" — keep the pay date so Payment takes over.
    if (reading.payDate) {
      postInvoiceStatusNote(invoice.id, {
        kind: 'will_pay',
        authorName: 'Credyx',
        collectionDate: reading.payDate,
        extraNote: summary,
      })
    }
    const released = releaseHoldAfterBrokerConfirm(invoice.id)
    const base = reading.payDate ? `Paperwork confirmed · Will pay ${reading.payDate}` : 'Paperwork confirmed'
    return released ? `${base} · Hold released` : base
  }

  if (reading.status === 'confirmed') {
    const nowIso = new Date().toISOString()
    // A broker who agrees to pay has accepted the paperwork — leave the paperwork stage.
    life.paperwork_status = 'good'
    life.paperwork = { ...(life.paperwork ?? {}), lastInboundAt: nowIso }
    life.payment = { ...(life.payment ?? {}), lastInboundAt: nowIso }
    await persistInvoiceLifecycle(invoice.id, life)
    if (reading.payDate) {
      postInvoiceStatusNote(invoice.id, {
        kind: 'will_pay',
        authorName: 'Credyx',
        collectionDate: reading.payDate,
        extraNote: summary,
      })
      const released = releaseHoldAfterBrokerConfirm(invoice.id)
      return `Will pay ${reading.payDate}${released ? ' · Hold released' : ''}`
    }
    postInvoiceStatusNote(invoice.id, {
      kind: 'payment_confirmed',
      authorName: 'Credyx',
      extraNote: summary,
    })
    const released = releaseHoldAfterBrokerConfirm(invoice.id)
    return released ? 'Payment confirmed · Hold released' : 'Payment confirmed'
  }

  if (reading.status === 'rejected') {
    life.paperwork_status = 'issue'
    life.paperwork = { ...(life.paperwork ?? {}), lastInboundAt: new Date().toISOString() }
    await persistInvoiceLifecycle(invoice.id, life)
    holdAdminInvoice(invoice.id, summary, 'Credyx')
    if (reading.outboundKind === 'paperwork' || reading.classification === 'missing_docs') {
      await tellAdminAndCarrier(invoice, summary, blueprintName)
    } else {
      notifyAdminBlueprintIssue({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        code: 'paperwork-issue',
        title: 'Broker reply needs attention',
        message: summary,
        blueprintName,
        brokerName: invoice.broker_name,
      })
    }
    return 'Broker rejected'
  }

  await persistInvoiceLifecycle(invoice.id, life)
  addAdminInvoiceNote(invoice.id, note, 'Credyx', { visibility: 'internal' })
  return 'Unknown reply'
}

export async function runBrokerReplyBlueprint(
  invoice: Invoice,
  reading: BrokerReplyReading,
  repliedBy?: string
): Promise<{ ok: boolean; detail: string }> {
  const bp = graphFor(reading.status)
  const existing: InvoiceEmailLifecycle = {
    paperwork_status: 'unknown',
    ...(invoice.email_lifecycle ?? {}),
    last_reply_status: reading.status,
  }
  await persistInvoiceLifecycle(invoice.id, existing)
  const paperworkConfirmed = reading.status === 'confirmed' && confirmedTrack(reading) === 'paperwork'
  const details: string[] = []
  let noted = false
  for (const node of bp.nodes) {
    if (node.data.kind !== 'action') continue
    for (const actionId of getActionIds(node.data)) {
      if (actionId === 'apply_broker_reply') {
        details.push(await applyReading(invoice, reading, bp.name, repliedBy))
        continue
      }
      if (actionId === 'add_note' && paperworkConfirmed) {
        const cfg = node.data.actionConfigs?.[actionId]
        const body = cfg?.message?.trim() || BROKER_CONFIRMED_NOTE
        addAdminInvoiceNote(invoice.id, body, 'Credyx', {
          visibility: 'internal',
        })
        noted = true
        details.push('Confirmed note')
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
    details.push(await applyReading(invoice, reading, bp.name, repliedBy))
  }
  if (reading.status === 'unknown') {
    notifyAdminBlueprintIssue({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      code: 'reply-unclear',
      title: 'Broker reply could not be read',
      message: notedSummary(reading, repliedBy),
      blueprintName: bp.name,
      brokerName: invoice.broker_name,
    })
  }
  if (paperworkConfirmed && !noted) {
    addAdminInvoiceNote(invoice.id, BROKER_CONFIRMED_NOTE, 'Credyx', {
      visibility: 'internal',
    })
    details.push('Confirmed note')
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

  // Any confirmed reply (paperwork good, or a pay promise) moves the invoice to the payment chase.
  if (reading.status === 'confirmed') {
    const chase = await startPaymentChaseAfterConfirm(invoice.id)
    details.push(chase.detail)
  }

  return { ok: true, detail: details.join(' · ') }
}
