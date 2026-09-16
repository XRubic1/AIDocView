/**
 * Email lifecycle: threads, inbound review, confirm actions, two-track chase.
 */
import { getInvoiceById, mockInvoices, updateInvoiceAsync } from '../data/mockInvoices'
import { mockBrokers, updateBrokerAsync } from '../data/mockBrokers'
import { getClientById } from './clientRegistry'
import { addAdminInvoiceNote } from './adminInvoiceNoteActions'
import { holdAdminInvoice } from './adminInvoiceActions'
import { sendTransactionalEmail } from './emailService'
import { openClientInvoiceDispute } from './clientInvoiceActions'
import {
  addEmailMessage,
  findThreadForInvoice,
  getEmailReviewById,
  listEmailMessagesForInvoice,
  listEmailReviews,
  upsertEmailReview,
  upsertEmailThread,
} from '../data/emailInboxStore'
import type { Invoice } from '../types/invoice'
import type { Broker } from '../types/broker'
import type {
  EmailMessage,
  EmailReviewItem,
  EmailThread,
  InboundClassification,
  InvoiceEmailLifecycle,
  ProposedAction,
} from '../types/emailLifecycle'
import { classifyInboundBrokerReply } from '../utils/classifyInboundBrokerReply'
import { brokerEmailAccept, daysBetween, resolveTrackClock } from '../utils/emailLifecycleClocks'
import {
  isEmailLifecycleRuleEnabled,
  type EmailLifecycleTrack,
} from '../config/emailLifecycle'
import { getPpwSentAt } from '../utils/ppwSent'
import { resolveBrokerPaperworkEmail } from '../utils/paperworkSender'
import { defaultPortalLink } from '../utils/carrierAttentionLink'
import { formatCurrency } from '../utils/format'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { getEffectiveInvoiceDueDate } from '../utils/invoiceAging'
import { daysFromYmd } from '../utils/collectionsPolicy'

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function ensureLifecycle(invoice: Invoice): InvoiceEmailLifecycle {
  return invoice.email_lifecycle ?? { paperwork_status: 'unknown' }
}

export async function persistInvoiceLifecycle(
  invoiceId: string,
  lifecycle: InvoiceEmailLifecycle,
  extra?: Partial<Invoice>
): Promise<Invoice | undefined> {
  return updateInvoiceAsync(invoiceId, { email_lifecycle: lifecycle, ...extra })
}

export function getOrCreateThread(invoice: Invoice): EmailThread {
  const existing = findThreadForInvoice(invoice.id)
  if (existing) return existing
  const now = new Date().toISOString()
  const thread = upsertEmailThread({
    id: newId('thread'),
    invoice_id: invoice.id,
    broker_id: invoice.broker_id,
    client_id: invoice.client_id,
    subject: `Invoice ${invoice.invoice_number} · Load ${invoice.load_number ?? '—'}`,
    created_at: now,
    updated_at: now,
  })
  void import('./supabase/tenantPersist')
    .then(({ persistEmailThread }) => persistEmailThread(thread))
    .catch((err) => console.warn('[emailLifecycle] persist thread failed', err))
  return thread
}

/**
 * Log an outbound Credyx email on the invoice thread (memory + Supabase).
 * Call after a successful send so Inbox shows invoice / client / broker context.
 */
export function recordOutboundMessage(opts: {
  invoice: Invoice
  to: string
  subject: string
  body: string
  templateId?: string
  /** Resend / provider message id when available. */
  messageId?: string
  fromAddress?: string
}): EmailMessage {
  const thread = getOrCreateThread(opts.invoice)
  const message = addEmailMessage({
    id: newId('msg'),
    thread_id: thread.id,
    direction: 'outbound',
    from_address: opts.fromAddress || 'ops@credyx.net',
    to_address: opts.to,
    subject: opts.subject,
    body_text: opts.body,
    sent_at: new Date().toISOString(),
    template_id: opts.templateId,
  })
  upsertEmailThread({ ...thread, updated_at: message.sent_at })
  void import('./supabase/tenantPersist')
    .then(async ({ persistEmailThread, persistEmailMessage }) => {
      await persistEmailThread({ ...thread, updated_at: message.sent_at })
      await persistEmailMessage({
        ...message,
        message_id: opts.messageId,
      })
    })
    .catch((err) => console.warn('[emailLifecycle] persist outbound failed', err))
  return message
}

function createReview(partial: Omit<EmailReviewItem, 'id' | 'created_at' | 'status'> & {
  status?: EmailReviewItem['status']
}): EmailReviewItem {
  return upsertEmailReview({
    id: newId('review'),
    created_at: new Date().toISOString(),
    status: partial.status ?? 'pending_review',
    ...partial,
  })
}

/** Staff paste or inbound webhook body → pending review. */
export function ingestBrokerReply(opts: {
  invoiceId?: string
  fromAddress: string
  subject: string
  bodyText: string
}): EmailReviewItem {
  const invoice = opts.invoiceId ? getInvoiceById(opts.invoiceId) : matchInvoiceFromText(opts.subject, opts.bodyText)
  const classified = classifyInboundBrokerReply({ subject: opts.subject, bodyText: opts.bodyText })
  if (invoice) {
    const thread = getOrCreateThread(invoice)
    addEmailMessage({
      id: newId('msg'),
      thread_id: thread.id,
      direction: 'inbound',
      from_address: opts.fromAddress,
      to_address: 'collections@credyx.net',
      subject: opts.subject,
      body_text: opts.bodyText,
      sent_at: new Date().toISOString(),
    })
  }
  return createReview({
    thread_id: invoice ? findThreadForInvoice(invoice.id)?.id : null,
    invoice_id: invoice?.id ?? null,
    broker_id: invoice?.broker_id ?? null,
    client_id: invoice?.client_id ?? null,
    classification: classified.classification,
    proposed_actions: classified.proposed_actions,
    summary: classified.summary,
    body_text: opts.bodyText,
    from_address: opts.fromAddress,
    subject: opts.subject,
    load_number: invoice?.load_number,
    invoice_number: invoice?.invoice_number,
  })
}

function matchInvoiceFromText(subject: string, body: string): Invoice | undefined {
  const hay = `${subject} ${body}`
  const invMatch = hay.match(/INV[- ]?(\w[\w-]*)/i)
  if (invMatch) {
    const needle = invMatch[0].replace(/\s/g, '')
    const found = mockInvoices.find(
      (i) => i.invoice_number.replace(/\s/g, '').toLowerCase() === needle.toLowerCase() ||
        i.invoice_number.toLowerCase().includes(invMatch[1].toLowerCase())
    )
    if (found) return found
  }
  const loadMatch = hay.match(/load[:\s#]+([A-Za-z0-9-]+)/i)
  if (loadMatch) {
    return mockInvoices.find((i) => (i.load_number || '').toLowerCase() === loadMatch[1].toLowerCase())
  }
  return undefined
}

export async function confirmEmailReview(
  reviewId: string,
  opts: {
    classification?: InboundClassification
    actions?: ProposedAction[]
    invoiceId?: string
    actorName?: string
    extraNote?: string
  } = {}
): Promise<{ ok: boolean; error?: string }> {
  const review = getEmailReviewById(reviewId)
  if (!review) return { ok: false, error: 'Review item not found' }
  const invoiceId = opts.invoiceId ?? review.invoice_id
  if (!invoiceId) return { ok: false, error: 'Match an invoice before confirming' }

  const invoice = getInvoiceById(invoiceId)
  if (!invoice) return { ok: false, error: 'Invoice not found' }

  const classification = opts.classification ?? review.classification
  const actions = opts.actions ?? review.proposed_actions
  const actor = opts.actorName ?? 'Credyx'
  const noteBits = [review.summary, opts.extraNote, review.body_text.slice(0, 400)].filter(Boolean)
  const noteText = `Broker reply (${classification}): ${noteBits.join(' — ')}`

  if (actions.includes('add_note') || actions.includes('log_paperwork_good') || actions.includes('log_payment_ok')) {
    addAdminInvoiceNote(invoiceId, noteText, actor, { visibility: 'client' })
  }

  const lifecycle = { ...ensureLifecycle(invoice) }
  const now = new Date().toISOString()

  if (actions.includes('log_paperwork_good') || classification === 'paperwork_ok') {
    lifecycle.paperwork_status = 'good'
    lifecycle.paperwork = {
      ...(lifecycle.paperwork ?? {}),
      lastInboundAt: now,
    }
    lifecycle.payment = {
      ...(lifecycle.payment ?? {}),
      startedAt: lifecycle.payment?.startedAt ?? now,
    }
  }

  if (actions.includes('log_payment_ok') || classification === 'payment_ok') {
    lifecycle.payment = { ...(lifecycle.payment ?? {}), lastInboundAt: now }
  }

  if (classification === 'missing_docs' || classification === 'claim' || classification === 'negative') {
    lifecycle.paperwork_status = classification === 'missing_docs' ? 'issue' : lifecycle.paperwork_status
    lifecycle.paperwork = { ...(lifecycle.paperwork ?? {}), lastInboundAt: now }
  }

  if (actions.includes('hold_invoice')) {
    holdAdminInvoice(invoiceId, noteText.slice(0, 180), actor)
  }

  await persistInvoiceLifecycle(invoiceId, lifecycle, {
    collections_needs_attention: false,
  })

  const fresh = getInvoiceById(invoiceId)
  if (fresh && (actions.includes('notify_carrier') || classification === 'negative' || classification === 'claim' || classification === 'missing_docs')) {
    await notifyCarrierHoldOrClaim(fresh, noteText)
  }

  upsertEmailReview({
    ...review,
    invoice_id: invoiceId,
    classification,
    proposed_actions: actions,
    status: 'confirmed',
    confirmed_at: now,
    confirmed_by: actor,
  })

  return { ok: true }
}

async function notifyCarrierHoldOrClaim(invoice: Invoice, summary: string): Promise<void> {
  if (!isEmailLifecycleRuleEnabled('carrier_claim_or_hold_notice')) return
  const client = getClientById(invoice.client_id)
  const to = client?.email
  if (!to) return
  await sendTransactionalEmail('carrier_claim_or_hold_notice', to, {
    contactName: client.contact_person || 'there',
    clientName: client.name,
    invoiceNumber: invoice.invoice_number,
    loadNumber: invoice.load_number || 'N/A',
    brokerName: invoice.broker_name,
    summary,
    portalLink: `${defaultPortalLink()}/client/invoices`,
  })
}

export async function sendClaimScopeEmail(invoice: Invoice, message = ''): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailLifecycleRuleEnabled('broker_claim_scope')) {
    return { ok: false, error: 'Claim-scope email is turned off in Email workflow.' }
  }
  const broker = mockBrokers.find((b) => b.id === invoice.broker_id)
  const to = resolveBrokerPaperworkEmail(broker)
  if (!to) return { ok: false, error: 'No broker email on file.' }
  const result = await sendTransactionalEmail('broker_claim_scope', to, {
    brokerName: broker?.name || invoice.broker_name,
    invoiceNumber: invoice.invoice_number,
    loadNumber: invoice.load_number || 'N/A',
    clientName: invoice.client_name,
    message,
  })
  if (result.ok) {
    recordOutboundMessage({
      invoice,
      to,
      subject: `Claim scope — ${invoice.invoice_number}`,
      body: message || 'Is the claim on the whole account?',
      templateId: 'broker_claim_scope',
    })
  }
  return { ok: result.ok, error: result.error }
}

/** Open dispute on open invoices for this carrier × broker and email the carrier. */
export async function openBrokerAccountDispute(opts: {
  clientId: string
  brokerId: string
  reason: string
  actorName?: string
}): Promise<{ ok: boolean; count: number; error?: string }> {
  const broker = mockBrokers.find((b) => b.id === opts.brokerId)
  const client = getClientById(opts.clientId)
  const open = mockInvoices.filter(
    (inv) =>
      inv.client_id === opts.clientId &&
      inv.broker_id === opts.brokerId &&
      inv.status !== 'paid' &&
      inv.status !== 'written_off' &&
      inv.status !== 'force_closed'
  )
  for (const inv of open) {
    holdAdminInvoice(inv.id, opts.reason, opts.actorName ?? 'Credyx')
    addAdminInvoiceNote(inv.id, `Account dispute with ${broker?.name ?? 'broker'}: ${opts.reason}`, opts.actorName ?? 'Credyx', {
      visibility: 'client',
    })
    try {
        openClientInvoiceDispute(inv.id, 'claim_dispute', opts.reason, opts.actorName ?? 'Credyx')
    } catch {
      /* carrier dispute helper may require client session — note+hold still apply */
    }
  }
  if (broker) {
    const line = `Dispute with ${client?.name ?? opts.clientId}: ${opts.reason}`
    const nextNotes = broker.carrier_notes ? `${broker.carrier_notes}\n${line}` : line
    await updateBrokerAsync(broker.id, { carrier_notes: nextNotes })
  }
  if (isEmailLifecycleRuleEnabled('carrier_dispute_opened') && client?.email) {
    await sendTransactionalEmail('carrier_dispute_opened', client.email, {
      contactName: client.contact_person || 'there',
      clientName: client.name,
      brokerName: broker?.name || 'Broker',
      summary: opts.reason,
      portalLink: `${defaultPortalLink()}/client/brokers`,
      brokerContact: resolveBrokerPaperworkEmail(broker) || broker?.phone || 'See portal',
    })
  }
  return { ok: true, count: open.length }
}

async function sendTrackAsk(
  invoice: Invoice,
  broker: Broker | undefined,
  track: EmailLifecycleTrack,
  step: 'first' | 'second'
): Promise<{ ok: boolean; error?: string }> {
  const accept = brokerEmailAccept(broker)
  const allowEmail = track === 'paperwork' ? accept.paperworkStatus : accept.paymentStatus
  const ruleId =
    track === 'paperwork'
      ? step === 'first'
        ? 'broker_paperwork_status_inquiry'
        : 'broker_paperwork_status_followup'
      : step === 'first'
        ? 'broker_payment_status_inquiry'
        : 'broker_payment_status_followup'
  if (!isEmailLifecycleRuleEnabled(ruleId)) {
    return { ok: false, error: 'This chase email rule is disabled' }
  }

  const now = new Date().toISOString()
  const lifecycle = ensureLifecycle(invoice)
  const trackState = { ...(track === 'paperwork' ? lifecycle.paperwork : lifecycle.payment) }
  let emailed = false

  if (!allowEmail) {
    createReview({
      invoice_id: invoice.id,
      broker_id: invoice.broker_id,
      client_id: invoice.client_id,
      classification: track === 'paperwork' ? 'non_response_paperwork' : 'non_response_payment',
      proposed_actions: ['staff_call'],
      summary: `${step === 'first' ? 'First' : 'Second'} ${track} follow-up: broker does not accept email — call.`,
      body_text: '',
      invoice_number: invoice.invoice_number,
      load_number: invoice.load_number,
    })
    trackState.lastAskChannel = 'phone'
  } else {
    const to = resolveBrokerPaperworkEmail(broker)
    if (!to) {
      return { ok: false, error: 'No broker email on file' }
    }
    const template =
      track === 'paperwork'
        ? step === 'first'
          ? 'broker_paperwork_status_inquiry'
          : 'broker_paperwork_status_followup'
        : step === 'first'
          ? 'broker_payment_status_inquiry'
          : 'broker_payment_status_followup'
    const sendResult = await sendTransactionalEmail(template, to, {
      brokerName: broker?.name || invoice.broker_name,
      invoiceNumber: invoice.invoice_number,
      loadNumber: invoice.load_number || 'N/A',
      clientName: invoice.client_name,
      amount: formatCurrency(invoice.amount),
    })
    if (!sendResult.ok) {
      return { ok: false, error: sendResult.error || 'Send failed' }
    }
    const label =
      track === 'paperwork'
        ? step === 'first'
          ? 'Paperwork status'
          : 'Paperwork follow-up'
        : step === 'first'
          ? 'Payment status'
          : 'Payment follow-up'
    recordOutboundMessage({
      invoice,
      to,
      subject: `${label} — Invoice ${invoice.invoice_number}`,
      body: `${label} ask for load ${invoice.load_number || '—'} · ${invoice.client_name}.`,
      templateId: template,
      messageId: sendResult.id,
    })
    trackState.lastAskChannel = 'email'
    emailed = true
  }

  if (step === 'first') trackState.firstAskedAt = now
  else trackState.secondAskedAt = now

  if (track === 'paperwork') lifecycle.paperwork = trackState
  else lifecycle.payment = trackState

  await persistInvoiceLifecycle(invoice.id, lifecycle, {
    broker_contacted: true,
    last_broker_contact: now,
    collections_last_inquiry_at: track === 'payment' && step === 'first' ? now : invoice.collections_last_inquiry_at,
    collections_followup_at: track === 'payment' && step === 'second' ? now : invoice.collections_followup_at,
  })

  return {
    ok: true,
    error: emailed ? undefined : 'Broker does not accept email — staff call opened instead',
  }
}

/**
 * Manual PPW / payment chase from Collections (right-click).
 * Picks first vs follow-up from the invoice lifecycle when step is omitted.
 */
export async function sendManualBrokerChaseEmail(
  invoice: Invoice,
  broker: Broker | undefined,
  opts: { track: EmailLifecycleTrack; step?: 'first' | 'second' }
): Promise<{ ok: boolean; error?: string }> {
  const latest = getInvoiceById(invoice.id) ?? invoice
  const lifecycle = ensureLifecycle(latest)
  const trackState = opts.track === 'paperwork' ? lifecycle.paperwork : lifecycle.payment
  const step =
    opts.step ?? (trackState?.firstAskedAt && !trackState?.secondAskedAt ? 'second' : 'first')

  if (opts.track === 'paperwork') {
    const ppwAt = getPpwSentAt(latest) || lifecycle.paperwork?.startedAt
    if (!ppwAt) {
      return { ok: false, error: 'PPW has not been sent yet — send paperwork first' }
    }
  }

  return sendTrackAsk(latest, broker, opts.track, step)
}

function maybeStaffAction(
  invoice: Invoice,
  track: EmailLifecycleTrack,
  kind: 'action_needed' | 'needs_attention'
): void {
  const classification = track === 'paperwork' ? 'non_response_paperwork' : 'non_response_payment'
  const existing = listEmailReviews('pending_review').find(
    (r) => r.invoice_id === invoice.id && r.classification === classification
  )
  if (existing && kind === 'action_needed') return
  createReview({
    invoice_id: invoice.id,
    broker_id: invoice.broker_id,
    client_id: invoice.client_id,
    classification,
    proposed_actions: ['staff_call'],
    summary:
      kind === 'needs_attention'
        ? `Needs attention: no ${track} reply after second follow-up.`
        : `Action needed: no ${track} reply after first ask.`,
    body_text: '',
    invoice_number: invoice.invoice_number,
    load_number: invoice.load_number,
  })
}

/** Advance paperwork then payment clocks; send or create call tasks. */
export async function runEmailLifecycleChase(nowMs = Date.now()): Promise<{
  sent: number
  actions: number
}> {
  let sent = 0
  let actions = 0
  const brokerById = new Map(mockBrokers.map((b) => [b.id, b]))

  for (const invoice of mockInvoices) {
    if (
      invoice.status === 'paid' ||
      invoice.status === 'written_off' ||
      invoice.status === 'force_closed' ||
      invoice.status === 'write_off_pending' ||
      invoice.status === 'pending' ||
      invoice.status === 'hold'
    ) {
      continue
    }

    const broker = brokerById.get(invoice.broker_id)
    const lifecycle = ensureLifecycle(invoice)
    const ppwAt = getPpwSentAt(invoice) || lifecycle.paperwork?.startedAt
    const paperworkGood = lifecycle.paperwork_status === 'good'

    if (!paperworkGood && ppwAt) {
      const clock = resolveTrackClock('paperwork', broker)
      const started = lifecycle.paperwork?.startedAt || ppwAt
      const daysSinceStart = daysBetween(started, nowMs) ?? 0
      const firstAt = lifecycle.paperwork?.firstAskedAt
      const secondAt = lifecycle.paperwork?.secondAskedAt
      const inbound = lifecycle.paperwork?.lastInboundAt

      if (!firstAt && daysSinceStart >= clock.firstAskDays) {
        const result = await sendTrackAsk(invoice, broker, 'paperwork', 'first')
        if (result.ok) sent += 1
        continue
      }
      if (firstAt && !inbound) {
        const daysSinceFirst = daysBetween(firstAt, nowMs) ?? 0
        if (
          clock.actionNeededAfterFirst &&
          daysSinceFirst >= clock.actionNeededAfterFirstDays &&
          !lifecycle.paperwork?.actionNeededAt
        ) {
          maybeStaffAction(invoice, 'paperwork', 'action_needed')
          actions += 1
          await persistInvoiceLifecycle(invoice.id, {
            ...lifecycle,
            paperwork: { ...lifecycle.paperwork, startedAt: started, actionNeededAt: new Date().toISOString() },
          })
        }
        if (!secondAt && clock.secondFollowupDays > 0 && daysSinceFirst >= clock.secondFollowupDays) {
          const result = await sendTrackAsk(invoice, broker, 'paperwork', 'second')
          if (result.ok) sent += 1
          continue
        }
        const afterSecond = secondAt ? daysBetween(secondAt, nowMs) : null
        if (
          afterSecond != null &&
          afterSecond >= clock.needsAttentionAfterSecondDays &&
          !lifecycle.paperwork?.needsAttentionAt
        ) {
          maybeStaffAction(invoice, 'paperwork', 'needs_attention')
          actions += 1
          await persistInvoiceLifecycle(invoice.id, {
            ...ensureLifecycle(getInvoiceById(invoice.id) ?? invoice),
            paperwork: {
              ...(getInvoiceById(invoice.id)?.email_lifecycle?.paperwork ?? lifecycle.paperwork),
              needsAttentionAt: new Date().toISOString(),
            },
          }, { collections_needs_attention: true })
        }
      }
    }

    const latest = getInvoiceById(invoice.id) ?? invoice
    const life = ensureLifecycle(latest)
    if (life.paperwork_status !== 'good') continue

    const dueYmd = getEffectiveInvoiceDueDate(latest)
    if (dueYmd) {
      const daysPastDue = daysFromYmd(dueYmd, new Date(nowMs))
      if (daysPastDue == null || daysPastDue < 0) continue
    }

    const payClock = resolveTrackClock('payment', broker)
    const payStart = life.payment?.startedAt
    if (!payStart) {
      await persistInvoiceLifecycle(latest.id, {
        ...life,
        payment: { startedAt: new Date().toISOString() },
      })
      continue
    }
    const daysPay = daysBetween(payStart, nowMs) ?? 0
    const payFirst = life.payment?.firstAskedAt
    const paySecond = life.payment?.secondAskedAt
    const payIn = life.payment?.lastInboundAt

    if (!payFirst && daysPay >= payClock.firstAskDays) {
      const result = await sendTrackAsk(latest, broker, 'payment', 'first')
      if (result.ok) sent += 1
      continue
    }
    if (payFirst && !payIn) {
      const daysSinceFirst = daysBetween(payFirst, nowMs) ?? 0
      if (
        payClock.actionNeededAfterFirst &&
        daysSinceFirst >= payClock.actionNeededAfterFirstDays &&
        !life.payment?.actionNeededAt
      ) {
        maybeStaffAction(latest, 'payment', 'action_needed')
        actions += 1
        await persistInvoiceLifecycle(latest.id, {
          ...life,
          payment: { ...life.payment, actionNeededAt: new Date().toISOString() },
        })
      }
      if (!paySecond && payClock.secondFollowupDays > 0 && daysSinceFirst >= payClock.secondFollowupDays) {
        const result = await sendTrackAsk(latest, broker, 'payment', 'second')
        if (result.ok) sent += 1
        continue
      }
      const afterSecond = paySecond ? daysBetween(paySecond, nowMs) : null
      if (
        afterSecond != null &&
        afterSecond >= payClock.needsAttentionAfterSecondDays &&
        !life.payment?.needsAttentionAt
      ) {
        maybeStaffAction(latest, 'payment', 'needs_attention')
        actions += 1
        await persistInvoiceLifecycle(latest.id, {
          ...ensureLifecycle(getInvoiceById(latest.id) ?? latest),
          payment: {
            ...(getInvoiceById(latest.id)?.email_lifecycle?.payment ?? life.payment),
            needsAttentionAt: new Date().toISOString(),
          },
        }, { collections_needs_attention: true })
      }
    }
  }

  return { sent, actions }
}

export async function hydrateEmailInboxFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const [t, m, r] = await Promise.all([
    supabase.from('email_threads').select('*'),
    supabase.from('email_messages').select('*'),
    supabase.from('email_review_items').select('*'),
  ])
  if (t.error || m.error || r.error) return
  const { hydrateEmailInbox } = await import('../data/emailInboxStore')
  hydrateEmailInbox({
    threads: (t.data ?? []) as EmailThread[],
    messages: (m.data ?? []) as EmailMessage[],
    reviews: (r.data ?? []) as EmailReviewItem[],
  })
}

/** Re-run AI/rules classification on a pending review. */
export async function reclassifyEmailReview(reviewId: string): Promise<EmailReviewItem | undefined> {
  const review = getEmailReviewById(reviewId)
  if (!review) return undefined
  const { classifyInboundNoteWithAi } = await import('../utils/classifyInboundNoteAi')
  const result = await classifyInboundNoteWithAi({
    subject: review.subject ?? '',
    bodyText: review.body_text || review.summary,
  })
  return upsertEmailReview({
    ...review,
    classification: result.classification,
    proposed_actions: result.proposed_actions,
    summary: result.summary,
  })
}

export { listEmailReviews, listEmailMessagesForInvoice, getEmailReviewById }
