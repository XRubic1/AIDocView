/**
 * Then-do → notes/status + real broker/carrier emails when Live runner is on.
 */
import {
  addAdminInvoiceNote,
  postInvoiceStatusNote,
  type InvoiceStatusNoteKind,
} from '../../services/adminInvoiceNoteActions'
import { getBrokerById, updateBroker } from '../../data/mockBrokers'
import { getInvoiceById } from '../../data/mockInvoices'
import { getClientById } from '../../services/clientRegistry'
import { notifyAdminBlueprintAlert } from '../../services/adminNotificationService'
import { applyBlueprintBrokerRiskMark } from '../../services/blueprintBrokerRiskActions'
import { sendTransactionalEmail } from '../../services/emailService'
import { isEmailLifecycleRuleEnabled } from '../../config/emailLifecycle'
import { formatCurrency } from '../../utils/format'
import { resolveBrokerPaperworkEmail } from '../../utils/paperworkSender'
import {
  sendBrokerPaymentStatusFollowup,
  sendBrokerPaymentStatusInquiry,
} from '../../utils/collectionsChase'
import type { BlueprintActionTaskConfig } from './blueprintActionSetup'
import { defaultTaskConfig } from './blueprintActionSetup'
import { lookupActionById } from './blueprintCatalog'
import type { Invoice } from '../../types/invoice'
import type { Broker } from '../../types/broker'

export type BlueprintActionResult = {
  actionId: string
  ok: boolean
  skipped?: boolean
  detail: string
}

const STATUS_KIND_BY_ACTION: Partial<Record<string, InvoiceStatusNoteKind>> = {
  will_pay: 'will_pay',
  call_back: 'call_back',
  payment_confirmed: 'payment_confirmed',
  ppw_confirmed: 'ppw_confirmed',
  set_due_date: 'set_due_date',
}

function withBlueprintTag(body: string, blueprintName: string): string {
  const tag = `(Blueprint: ${blueprintName})`
  const trimmed = body.trim()
  if (!trimmed) return tag
  if (trimmed.includes(tag)) return trimmed
  return `${trimmed}\n\n${tag}`
}

function resolveBrokerChaseEmail(broker: Broker | undefined): string | null {
  if (!broker) return null
  return (
    broker.emails?.find((e) => e.category === 'accounting')?.email?.trim() ||
    resolveBrokerPaperworkEmail(broker) ||
    broker.email?.trim() ||
    null
  )
}

async function sendCustomBrokerChaseEmail(input: {
  invoice: Invoice
  broker: Broker
  to: string
  templateId: string
  extraNote: string
  label: string
  actionId: string
}): Promise<BlueprintActionResult> {
  const { invoice, broker, to, templateId, extraNote, label, actionId } = input
  const result = await sendTransactionalEmail(templateId, to, {
    invoiceNumber: invoice.invoice_number,
    loadNumber: invoice.load_number ?? '',
    amount: formatCurrency(invoice.amount),
    brokerName: broker.name,
    extraNote,
  })
  if (result.ok) {
    try {
      const { recordOutboundMessage } = await import('../../services/emailLifecycleService')
      recordOutboundMessage({
        invoice,
        to,
        subject: `${label} — Invoice ${invoice.invoice_number}`,
        body:
          extraNote ||
          `${label} for load ${invoice.load_number ?? '—'} · ${formatCurrency(invoice.amount)}.`,
        templateId,
        messageId: result.id,
      })
    } catch (err) {
      console.warn('[blueprintThenDo] inbox log failed', err)
    }
  }
  return {
    actionId,
    ok: result.ok,
    detail: result.ok
      ? `${label}: emailed ${to}.`
      : `${label}: ${result.error ?? 'email failed'}.`,
  }
}

async function executeChaseEmailThenDo(input: {
  invoiceId: string
  actionId: 'email_payment_status' | 'email_followup'
  blueprintName: string
  config: BlueprintActionTaskConfig
  label: string
}): Promise<BlueprintActionResult> {
  const invoice = getInvoiceById(input.invoiceId)
  if (!invoice) {
    return {
      actionId: input.actionId,
      ok: false,
      detail: `${input.label}: invoice not found.`,
    }
  }
  const broker = getBrokerById(invoice.broker_id)
  if (!broker) {
    return {
      actionId: input.actionId,
      ok: false,
      detail: `${input.label}: broker not found.`,
    }
  }

  const templateId = input.config.templateId?.trim()
  if (templateId) {
    const to = resolveBrokerChaseEmail(broker)
    if (!to) {
      return {
        actionId: input.actionId,
        ok: false,
        detail: `${input.label}: no broker email on file.`,
      }
    }
    return sendCustomBrokerChaseEmail({
      invoice,
      broker,
      to,
      templateId,
      extraNote: withBlueprintTag(
        input.config.message?.trim() || '',
        input.blueprintName
      ),
      label: input.label,
      actionId: input.actionId,
    })
  }

  const result =
    input.actionId === 'email_payment_status'
      ? await sendBrokerPaymentStatusInquiry(invoice, broker)
      : await sendBrokerPaymentStatusFollowup(invoice, broker)

  return {
    actionId: input.actionId,
    ok: result.ok,
    detail: result.ok
      ? `${input.label}: emailed broker.`
      : `${input.label}: ${result.error ?? 'email failed'}.`,
  }
}

async function executeNotifyCarrierThenDo(input: {
  invoiceId: string
  blueprintName: string
  config: BlueprintActionTaskConfig
  authorName: string
  label: string
}): Promise<BlueprintActionResult> {
  const invoice = getInvoiceById(input.invoiceId)
  if (!invoice) {
    return {
      actionId: 'notify_carrier',
      ok: false,
      detail: `${input.label}: invoice not found.`,
    }
  }

  const channel = input.config.channel || 'both'
  const wantsEmail = channel === 'email' || channel === 'both'
  const wantsApp = channel === 'app' || channel === 'both'
  const parts: string[] = []
  let ok = true

  if (wantsEmail) {
    const customTemplate = input.config.templateId?.trim()
    if (
      !customTemplate &&
      !isEmailLifecycleRuleEnabled('carrier_claim_or_hold_notice')
    ) {
      parts.push('email skipped — carrier hold/update notice disabled in Settings')
    } else {
      const client = getClientById(invoice.client_id)
      const to = client?.email?.trim()
      if (!to) {
        ok = false
        parts.push('email failed — no client email on file')
      } else {
        const templateId = customTemplate || 'carrier_claim_or_hold_notice'
        const summary =
          input.config.message?.trim() ||
          'Update from Credyx on your invoice.'
        const result = await sendTransactionalEmail(templateId, to, {
          contactName: client?.contact_person || 'there',
          clientName: client?.name || invoice.client_name,
          invoiceNumber: invoice.invoice_number,
          loadNumber: invoice.load_number || 'N/A',
          brokerName: invoice.broker_name,
          summary: withBlueprintTag(summary, input.blueprintName),
          portalLink: '/client/invoices',
        })
        if (result.ok) {
          parts.push(`emailed ${to}`)
          try {
            const { recordOutboundMessage } = await import(
              '../../services/emailLifecycleService'
            )
            recordOutboundMessage({
              invoice,
              to,
              subject: `Invoice update — ${invoice.invoice_number}`,
              body: summary,
              templateId,
              messageId: result.id,
            })
          } catch {
            /* optional */
          }
        } else {
          ok = false
          parts.push(result.error ?? 'email failed')
        }
      }
    }
  }

  if (wantsApp) {
    const body = withBlueprintTag(
      input.config.message?.trim() || 'Update from Credyx on your invoice.',
      input.blueprintName
    )
    const updated = addAdminInvoiceNote(input.invoiceId, body, input.authorName, {
      visibility: 'client',
    })
    if (updated) parts.push('note added (client)')
    else {
      ok = false
      parts.push('could not add note')
    }
  }

  return {
    actionId: 'notify_carrier',
    ok,
    detail: `${input.label}: ${parts.join(' · ') || 'nothing to do'}.`,
  }
}

/**
 * Execute one Then-do task (notes/status and/or email).
 */
export async function executeBlueprintThenDo(input: {
  invoiceId: string
  actionId: string
  blueprintName: string
  config?: BlueprintActionTaskConfig
  authorName?: string
}): Promise<BlueprintActionResult> {
  const author = input.authorName?.trim() || 'Credyx Blueprint'
  const cfg = input.config ?? defaultTaskConfig(input.actionId)
  const action = lookupActionById(input.actionId)
  const label = action?.defaultTitle ?? input.actionId

  if (
    input.actionId === 'email_payment_status' ||
    input.actionId === 'email_followup'
  ) {
    return executeChaseEmailThenDo({
      invoiceId: input.invoiceId,
      actionId: input.actionId,
      blueprintName: input.blueprintName,
      config: cfg,
      label,
    })
  }

  if (input.actionId === 'notify_carrier') {
    return executeNotifyCarrierThenDo({
      invoiceId: input.invoiceId,
      blueprintName: input.blueprintName,
      config: cfg,
      authorName: author,
      label,
    })
  }

  const statusKind = STATUS_KIND_BY_ACTION[input.actionId]
  if (statusKind) {
    const updated = postInvoiceStatusNote(input.invoiceId, {
      kind: statusKind,
      authorName: author,
      extraNote: withBlueprintTag(cfg.message || '', input.blueprintName),
    })
    return {
      actionId: input.actionId,
      ok: Boolean(updated),
      detail: updated
        ? `${label}: status note posted.`
        : `${label}: could not post status note.`,
    }
  }

  if (
    input.actionId === 'add_note' ||
    input.actionId === 'create_task' ||
    input.actionId === 'mark_urgent' ||
    input.actionId === 'push_notify'
  ) {
    const visibility =
      input.actionId === 'add_note' ? ('client' as const) : ('internal' as const)
    const fallback =
      input.actionId === 'mark_urgent'
        ? 'Marked urgent for Credyx follow-up.'
        : input.actionId === 'create_task'
          ? 'Staff task from blueprint.'
          : action?.cardLine ?? label
    const body = withBlueprintTag(cfg.message?.trim() || fallback, input.blueprintName)
    const updated = addAdminInvoiceNote(input.invoiceId, body, author, { visibility })
    return {
      actionId: input.actionId,
      ok: Boolean(updated),
      detail: updated
        ? `${label}: note added (${visibility}).`
        : `${label}: could not add note.`,
    }
  }

  return {
    actionId: input.actionId,
    ok: true,
    skipped: true,
    detail: `${label}: skipped — not mapped yet.`,
  }
}

const RISK_MARK_ACTION: Record<string, 'good' | 'review' | 'bad'> = {
  mark_good: 'good',
  mark_review: 'review',
  mark_bad: 'bad',
}

/**
 * Broker Then-do — notes, admin alerts, and real risk publish/clear/flag.
 */
export function executeBlueprintBrokerThenDo(input: {
  brokerId: string
  actionId: string
  blueprintName: string
  config?: BlueprintActionTaskConfig
  authorName?: string
}): BlueprintActionResult {
  const author = input.authorName?.trim() || 'Credyx Blueprint'
  const cfg = input.config ?? defaultTaskConfig(input.actionId)
  const action = lookupActionById(input.actionId)
  const label = action?.defaultTitle ?? input.actionId
  const broker = getBrokerById(input.brokerId)
  if (!broker) {
    return {
      actionId: input.actionId,
      ok: false,
      detail: `${label}: broker not found.`,
    }
  }

  const appendBrokerNote = (body: string) => {
    const tagged = withBlueprintTag(body, input.blueprintName)
    const nextNotes = broker.notes?.trim()
      ? `${broker.notes.trim()}\n\n${tagged}`
      : tagged
    return updateBroker(input.brokerId, { notes: nextNotes })
  }

  if (input.actionId === 'add_note') {
    const body =
      cfg.message?.trim() ||
      action?.cardLine ||
      'Note from blueprint.'
    const updated = appendBrokerNote(body)
    return {
      actionId: input.actionId,
      ok: Boolean(updated),
      detail: updated ? `${label}: note added on broker.` : `${label}: could not add note.`,
    }
  }

  if (input.actionId === 'urgent_review' || input.actionId === 'push_notify') {
    const body =
      cfg.message?.trim() ||
      (input.actionId === 'urgent_review'
        ? 'New broker needs urgent Credyx review.'
        : 'Blueprint push notification.')
    const updated = appendBrokerNote(body)
    try {
      notifyAdminBlueprintAlert({
        title:
          input.actionId === 'urgent_review'
            ? 'Blueprint · Urgent broker review'
            : 'Blueprint · Broker alert',
        message: `${broker.name}: ${body}`,
        brokerId: broker.id,
        brokerName: broker.name,
        blueprintName: input.blueprintName,
      })
    } catch {
      /* optional */
    }
    return {
      actionId: input.actionId,
      ok: Boolean(updated),
      detail: updated
        ? `${label}: note + admin alert.`
        : `${label}: could not update broker.`,
    }
  }

  const riskMark = RISK_MARK_ACTION[input.actionId]
  if (riskMark) {
    const body =
      cfg.message?.trim() ||
      (riskMark === 'good'
        ? 'Marked good by blueprint.'
        : riskMark === 'bad'
          ? 'Marked high risk by blueprint.'
          : 'Flagged for manual risk review by blueprint.')
    appendBrokerNote(
      riskMark === 'good'
        ? `[Risk: good] ${body}`
        : riskMark === 'bad'
          ? `[Risk: bad] ${body}`
          : `[Risk: review] ${body}`
    )
    const result = applyBlueprintBrokerRiskMark({
      brokerId: input.brokerId,
      mark: riskMark,
      note: body,
      authorName: author,
      blueprintName: input.blueprintName,
    })
    return {
      actionId: input.actionId,
      ok: result.ok,
      detail: `${label}: ${result.detail}`,
    }
  }

  return {
    actionId: input.actionId,
    ok: true,
    skipped: true,
    detail: `${label}: skipped — not mapped for brokers yet.`,
  }
}

/**
 * Batch Then-do — admin alerts + optional carrier batch-processed email.
 */
export async function executeBlueprintBatchThenDo(input: {
  batchId: string
  batchNumber: string
  clientId: string
  clientName: string
  actionId: string
  blueprintName: string
  config?: BlueprintActionTaskConfig
  authorName?: string
}): Promise<BlueprintActionResult> {
  void input.authorName
  const cfg = input.config ?? defaultTaskConfig(input.actionId)
  const action = lookupActionById(input.actionId)
  const label = action?.defaultTitle ?? input.actionId

  if (input.actionId === 'email_carrier_batch_processed') {
    const { getInvoicesByBatchId } = await import('../../data/mockInvoices')
    const { emailCarrierBatchProcessed } = await import(
      '../../services/credyx/batchLifecycleEmails'
    )
    const invoices = getInvoicesByBatchId(input.batchId)
    const held = invoices.filter((i) => i.status === 'hold')
    const result = await emailCarrierBatchProcessed({
      clientId: input.clientId,
      batchNumber: input.batchNumber,
      invoices,
      heldInvoices: held,
    })
    if (result.skipped) {
      return {
        actionId: input.actionId,
        ok: true,
        skipped: true,
        detail: `${label}: skipped (${result.error ?? 'disabled or no email'}).`,
      }
    }
    return {
      actionId: input.actionId,
      ok: result.ok,
      detail: result.ok
        ? `${label}: carrier emailed.`
        : `${label}: ${result.error ?? 'email failed'}.`,
    }
  }

  if (
    input.actionId === 'add_note' ||
    input.actionId === 'urgent_review' ||
    input.actionId === 'push_notify'
  ) {
    const body =
      cfg.message?.trim() ||
      (input.actionId === 'urgent_review'
        ? 'Batch processed — Credyx should review outcomes (holds / PPW).'
        : input.actionId === 'push_notify'
          ? 'Blueprint push notification for a processed batch.'
          : action?.cardLine ?? 'Note from blueprint.')
    try {
      notifyAdminBlueprintAlert({
        title:
          input.actionId === 'urgent_review'
            ? 'Blueprint · Urgent batch review'
            : input.actionId === 'push_notify'
              ? 'Blueprint · Batch alert'
              : 'Blueprint · Batch note',
        message: `${input.batchNumber} (${input.clientName}): ${body}`,
        batchId: input.batchId,
        batchNumber: input.batchNumber,
        clientName: input.clientName,
        blueprintName: input.blueprintName,
      })
    } catch {
      /* optional */
    }
    return {
      actionId: input.actionId,
      ok: true,
      detail: `${label}: admin alert posted.`,
    }
  }

  return {
    actionId: input.actionId,
    ok: true,
    skipped: true,
    detail: `${label}: skipped — not mapped for batches yet.`,
  }
}
