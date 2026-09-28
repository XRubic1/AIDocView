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
import {
  resolveBrokerPaperworkEmail,
  sendBrokerPacketForInvoice,
} from '../../utils/paperworkSender'
import {
  sendBrokerPaymentStatusFollowup,
  sendBrokerPaymentStatusInquiry,
} from '../../utils/collectionsChase'
import type { BlueprintActionTaskConfig, BlueprintFromMailbox } from './blueprintActionSetup'
import {
  defaultTaskConfig,
  resolveFromEmailsList,
} from './blueprintActionSetup'
import { lookupActionById } from './blueprintCatalog'
import { fillBlueprintNoteTokens } from '../../../supabase/functions/_shared/blueprintNoteTokens'
import {
  EMAIL_MAILBOXES,
  displayNameForFromEmail,
  formatResendFrom,
} from '../../config/emailMailboxes'
import type { Invoice } from '../../types/invoice'
import type { Broker } from '../../types/broker'

export type BlueprintActionResult = {
  actionId: string
  ok: boolean
  skipped?: boolean
  detail: string
}

function resolveFromAndCc(config: {
  fromEmails?: string[]
  fromEmail?: string
  fromMailbox?: BlueprintFromMailbox | ''
}): { fromOverride?: string; cc: string[] } {
  const m = EMAIL_MAILBOXES
  const list = resolveFromEmailsList(config, {
    billing: m.billingEmail,
    ops: m.opsEmail,
    admin: m.adminEmail,
    notifications: m.notificationsEmail,
  })
  if (!list.length) return { cc: [] }
  const [fromEmail, ...cc] = list
  return {
    fromOverride: formatResendFrom(displayNameForFromEmail(fromEmail, m), fromEmail),
    cc,
  }
}

const STATUS_KIND_BY_ACTION: Partial<Record<string, InvoiceStatusNoteKind>> = {
  will_pay: 'will_pay',
  call_back: 'call_back',
  payment_confirmed: 'payment_confirmed',
  ppw_confirmed: 'ppw_confirmed',
  set_due_date: 'set_due_date',
}

function sentToLabel(to?: string, extra: string[] = []): string {
  return [to, ...extra]
    .map((email) => email?.trim())
    .filter((email): email is string => Boolean(email))
    .join(', ')
}

function fillBlueprintMessage(message: string, invoiceId: string, sentTo?: string): string {
  const invoice = getInvoiceById(invoiceId)
  const broker = invoice ? getBrokerById(invoice.broker_id) : undefined
  return fillBlueprintNoteTokens(message, {
    brokerEmail:
      sentTo?.trim() ||
      resolveBrokerChaseEmail(broker) ||
      (broker ? resolveBrokerPaperworkEmail(broker) : '') ||
      broker?.email?.trim() ||
      '',
    brokerName: broker?.name || invoice?.broker_name || '',
    invoiceNumber: invoice?.invoice_number || '',
    loadNumber: invoice?.load_number || '',
  })
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

function emailedDetail(label: string, to: string, extra: string[]): string {
  if (extra.length === 0) return `${label}: emailed ${to}.`
  return `${label}: emailed ${to} (also ${extra.join(', ')}).`
}

function splitOverrideRecipients(toEmails?: string[]): {
  to?: string
  extraCc: string[]
} {
  const list = (toEmails ?? []).map((e) => e.trim()).filter(Boolean)
  if (list.length === 0) return { extraCc: [] }
  const [to, ...extraCc] = list
  return { to, extraCc }
}

async function sendCustomBrokerChaseEmail(input: {
  invoice: Invoice
  broker: Broker
  to: string
  templateId: string
  extraNote: string
  label: string
  actionId: string
  fromEmail?: string
  fromMailbox?: BlueprintFromMailbox | ''
  fromEmails?: string[]
  extraCc?: string[]
}): Promise<BlueprintActionResult> {
  const { invoice, broker, to, templateId, extraNote, label, actionId } = input
  const { fromOverride, cc } = resolveFromAndCc({
    fromEmails: input.fromEmails,
    fromEmail: input.fromEmail,
    fromMailbox: input.fromMailbox,
  })
  const extraCc = input.extraCc ?? []
  const allCc = [...cc, ...extraCc]
  const result = await sendTransactionalEmail(
    templateId,
    to,
    {
      invoiceNumber: invoice.invoice_number,
      loadNumber: invoice.load_number ?? '',
      amount: formatCurrency(invoice.amount),
      brokerName: broker.name,
      extraNote,
    },
    { fromOverride, cc: allCc }
  )
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
      ? emailedDetail(label, to, extraCc)
      : `${label}: ${result.error ?? 'email failed'}.`,
  }
}

async function executeBrokerPacketThenDo(input: {
  invoiceId: string
  blueprintName: string
  config: BlueprintActionTaskConfig
  authorName: string
  label: string
  actionId: string
  skipIfAlreadySent?: boolean
  toOverride?: string
  extraCc?: string[]
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
  const to =
    input.toOverride ||
    resolveBrokerChaseEmail(broker) ||
    resolveBrokerPaperworkEmail(broker)
  if (!to) {
    return {
      actionId: input.actionId,
      ok: false,
      detail: `${input.label}: no broker email on file.`,
    }
  }

  const { fromOverride, cc } = resolveFromAndCc(input.config)
  const extraCc = input.extraCc ?? []
  const sentTo = sentToLabel(to, extraCc)
  const noteMessage = fillBlueprintMessage(
    input.config.message?.trim() || '',
    invoice.id,
    sentTo
  )
  const result = await sendBrokerPacketForInvoice(invoice, {
    recipientEmail: to,
    collectMode: 'defaults',
    message: withBlueprintTag(noteMessage, input.blueprintName),
    sentBy: input.authorName,
    automatic: true,
    skipIfAlreadySent: input.skipIfAlreadySent !== false,
    fromOverride,
    cc: [...cc, ...extraCc],
  })

  if (result.success) {
    if (noteMessage) {
      addAdminInvoiceNote(invoice.id, withBlueprintTag(noteMessage, input.blueprintName), input.authorName, {
        visibility: 'internal',
      })
    }
    try {
      const { onInvoicePpwSent } = await import('./blueprintRunner')
      onInvoicePpwSent(invoice.id)
    } catch {
      /* optional */
    }
  }

  if (result.skipped) {
    return {
      actionId: input.actionId,
      ok: true,
      skipped: true,
      detail: `${input.label}: skipped (${result.error ?? 'already sent or disabled'}).`,
    }
  }

  return {
    actionId: input.actionId,
    ok: result.success,
    detail: result.success
      ? `${input.label}: packet sent to ${to}${
          extraCc.length ? ` (also ${extraCc.join(', ')})` : ''
        }${
          result.partCount && result.partCount > 1
            ? ` (${result.partCount} parts)`
            : ''
        }.`
      : `${input.label}: ${result.error ?? 'packet send failed'}.`,
  }
}

async function executeChaseEmailThenDo(input: {
  invoiceId: string
  actionId: 'email_payment_status' | 'email_followup'
  blueprintName: string
  config: BlueprintActionTaskConfig
  label: string
  authorName: string
  toOverride?: string
  extraCc?: string[]
}): Promise<BlueprintActionResult> {
  const templateId = input.config.templateId?.trim()
  // Selecting the packet template on a chase Then-do must use real PPW attach path.
  if (templateId === 'broker_packet') {
    return executeBrokerPacketThenDo({
      invoiceId: input.invoiceId,
      blueprintName: input.blueprintName,
      config: input.config,
      authorName: input.authorName,
      label: input.label,
      actionId: input.actionId,
      toOverride: input.toOverride,
      extraCc: input.extraCc,
    })
  }

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

  const to = input.toOverride || resolveBrokerChaseEmail(broker)
  if (templateId || input.toOverride) {
    if (!to) {
      return {
        actionId: input.actionId,
        ok: false,
        detail: `${input.label}: no broker email on file.`,
      }
    }
    const noteMessage = fillBlueprintMessage(
      input.config.message?.trim() || '',
      invoice.id,
      sentToLabel(to, input.extraCc)
    )
    const result = await sendCustomBrokerChaseEmail({
      invoice,
      broker,
      to,
      templateId:
        templateId ||
        (input.actionId === 'email_payment_status'
          ? 'broker_payment_status_inquiry'
          : 'broker_payment_status_followup'),
      extraNote: withBlueprintTag(noteMessage, input.blueprintName),
      label: input.label,
      actionId: input.actionId,
      fromEmail: input.config.fromEmail,
      fromMailbox: input.config.fromMailbox,
      fromEmails: input.config.fromEmails,
      extraCc: input.extraCc,
    })
    if (result.ok && noteMessage) {
      addAdminInvoiceNote(
        invoice.id,
        withBlueprintTag(noteMessage, input.blueprintName),
        input.authorName,
        { visibility: 'internal' }
      )
    }
    return result
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
  toOverride?: string
  extraCc?: string[]
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
      const to = input.toOverride || client?.email?.trim()
      if (!to) {
        ok = false
        parts.push('email failed — no client email on file')
      } else {
        const templateId = customTemplate || 'carrier_claim_or_hold_notice'
        const extraCc = input.extraCc ?? []
        const summary = fillBlueprintMessage(
          input.config.message?.trim() || 'Update from Credyx on your invoice.',
          invoice.id,
          sentToLabel(to, extraCc)
        )
        const { fromOverride, cc } = resolveFromAndCc(input.config)
        const result = await sendTransactionalEmail(
          templateId,
          to,
          {
            contactName: client?.contact_person || 'there',
            clientName: client?.name || invoice.client_name,
            invoiceNumber: invoice.invoice_number,
            loadNumber: invoice.load_number || 'N/A',
            brokerName: invoice.broker_name,
            summary: withBlueprintTag(summary, input.blueprintName),
            portalLink: '/client/invoices',
          },
          { fromOverride, cc: [...cc, ...extraCc] }
        )
        if (result.ok) {
          parts.push(
            extraCc.length ? `emailed ${to} (also ${extraCc.join(', ')})` : `emailed ${to}`
          )
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
      fillBlueprintMessage(
        input.config.message?.trim() || 'Update from Credyx on your invoice.',
        input.invoiceId,
        sentToLabel(input.toOverride, input.extraCc)
      ),
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
  /** Default true so Process and a later enroll do not send the packet twice. */
  skipIfAlreadySent?: boolean
  /** Staff override. First address is To; the rest are copied. */
  toEmails?: string[]
}): Promise<BlueprintActionResult> {
  const author = input.authorName?.trim() || 'Credyx Blueprint'
  const cfg = input.config ?? defaultTaskConfig(input.actionId)
  const action = lookupActionById(input.actionId)
  const label = action?.defaultTitle ?? input.actionId
  const { to: toOverride, extraCc } = splitOverrideRecipients(input.toEmails)

  if (input.actionId === 'email_broker_packet') {
    return executeBrokerPacketThenDo({
      invoiceId: input.invoiceId,
      blueprintName: input.blueprintName,
      config: cfg,
      authorName: author,
      label,
      actionId: input.actionId,
      skipIfAlreadySent: input.skipIfAlreadySent,
      toOverride,
      extraCc,
    })
  }

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
      authorName: author,
      toOverride,
      extraCc,
    })
  }

  if (input.actionId === 'notify_carrier') {
    return executeNotifyCarrierThenDo({
      invoiceId: input.invoiceId,
      blueprintName: input.blueprintName,
      config: cfg,
      authorName: author,
      label,
      toOverride,
      extraCc,
    })
  }

  const statusKind = STATUS_KIND_BY_ACTION[input.actionId]
  if (statusKind) {
    const updated = postInvoiceStatusNote(input.invoiceId, {
      kind: statusKind,
      authorName: author,
      extraNote: withBlueprintTag(
        fillBlueprintMessage(cfg.message || '', input.invoiceId, sentToLabel(toOverride, extraCc)),
        input.blueprintName
      ),
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
    const body = withBlueprintTag(
      fillBlueprintMessage(
        cfg.message?.trim() || fallback,
        input.invoiceId,
        sentToLabel(toOverride, extraCc)
      ),
      input.blueprintName
    )
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
    const { fromOverride, cc } = resolveFromAndCc(cfg)
    const fromAddr =
      fromOverride?.match(/<([^>]+)>/)?.[1] ||
      fromOverride?.match(/([^\s<>]+@[^\s<>]+)/)?.[1] ||
      fromOverride ||
      ''
    const result = await emailCarrierBatchProcessed({
      clientId: input.clientId,
      batchNumber: input.batchNumber,
      invoices,
      heldInvoices: held,
      fromOverride,
      cc,
    })
    if (result.skipped) {
      return {
        actionId: input.actionId,
        ok: true,
        skipped: true,
        detail: `${label}: skipped (${result.error ?? 'disabled or no email'}).`,
      }
    }
    const routeHint = fromAddr
      ? ` From ${fromAddr}${cc.length ? ` · CC ${cc.join(', ')}` : ''}`
      : ''
    return {
      actionId: input.actionId,
      ok: result.ok,
      detail: result.ok
        ? `${label}: carrier emailed.${routeHint}`
        : `${label}: ${result.error ?? 'email failed'}.${routeHint}`,
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
