/**
 * Credyx Assistant chat — grounded OpenAI replies over live calendar / A/R context.
 * Calls go through the openai-proxy Edge Function (OPENAI_API_KEY server-side).
 */

import { isAIReviewEnabled } from '../config/aiReview'
import { postOpenAIChatCompletions } from '../utils/openaiFetch'
import { usageFromOpenAIResponse, type ApiUsageRecord } from '../utils/reviewCost'
import { clientVisibleNotesForInvoice } from '../utils/clientInvoiceView'
import {
  buildDisputeDraftForInvoice,
  deriveHoldExplanation,
  prioritizeHoldNotes,
} from '../utils/assistantHoldExplanation'
import type {
  AssistantActionItem,
  AssistantArSummaryCard,
  AssistantCalendarEvent,
  AssistantDisputeDraft,
  AssistantDisputeReason,
  AssistantEmailAudience,
  AssistantEmailDraft,
  AssistantExpectedPayment,
  AssistantFollowUp,
  AssistantMessage,
  AssistantMessageKind,
  AssistantNoteDraft,
  AssistantNoteVisibility,
  AssistantPaymentStatusCard,
} from '../types/assistant'
import type { Invoice, InvoiceDispute, InvoiceNote } from '../types/invoice'
import type { Payment } from '../types/payment'
import type { Broker } from '../types/broker'
import { getAllClients } from './clientRegistry'
import {
  attachFollowUps,
  enrichFollowUps,
  isMissingDocsQuery,
} from '../utils/assistantFollowUps'
import {
  catalogForPrompt,
  isAppNavigationIntent,
  matchCatalogFromPrompt,
  resolveAppActions,
} from '../utils/assistantAppActions'
import {
  buildPaymentStatusSnapshot,
  buildPaymentStatusSnapshots,
  isPaymentStatusQuery,
  type AssistantPaymentStatus,
} from '../utils/assistantPaymentStatus'
import {
  buildArSummarySnapshot,
  isArSummaryQuery,
  type AssistantArSummary,
} from '../utils/assistantArSummary'

export type AssistantChatMode = 'client' | 'admin'

export interface AssistantChatContextInput {
  mode: AssistantChatMode
  clientName?: string
  /** Carrier portal login email when known. */
  clientEmail?: string
  invoices: Invoice[]
  payments: Payment[]
  calendarEvents: AssistantCalendarEvent[]
  dueTodayActions: AssistantActionItem[]
  /** Brokers for contact emails (admin + client lookups). */
  brokers?: Broker[]
  /** Current user message — used to pull matching invoice notes into context. */
  prompt?: string
  /** Prior user turns (soft context only — never overrides portfolio hold asks). */
  historyPrompt?: string
  /** Screen the user is looking at — lets replies stay relevant to the page. */
  currentPage?: { title: string; offer: string }
}

/** Usage + cost returned with each live assistant reply (for testing UI). */
export type AssistantChatUsage = ApiUsageRecord

export interface AssistantChatResult {
  messages: AssistantMessage[]
  usage: AssistantChatUsage
}

type AiReplyPart = {
  kind?: string
  text?: string
  actionIds?: string[]
  expectedPaymentInvoiceId?: string
  expectedPaymentInvoiceNumber?: string
  followUps?: Array<{
    label?: string
    prompt?: string
    action?: string
    appActionId?: string
  }>
  appActions?: Array<{
    id?: string
    label?: string
    invoiceId?: string
    invoiceNumber?: string
  }>
  noteDraft?: {
    body?: string
    invoiceNumber?: string
    invoiceId?: string
    brokerName?: string
    visibility?: string
  }
  disputeDraft?: {
    invoiceNumber?: string
    invoiceId?: string
    brokerName?: string
    reason?: string
    description?: string
  }
  /** Invoice ids or numbers for structured payment status cards. */
  paymentStatusInvoiceIds?: string[]
  paymentStatusInvoiceNumbers?: string[]
  emailDraft?: {
    audience?: string
    to?: string
    toName?: string
    subject?: string
    body?: string
    invoiceNumber?: string
    invoiceId?: string
    brokerName?: string
  }
}

type AiReplyPayload = {
  messages?: AiReplyPart[]
  text?: string
  followUps?: Array<{
    label?: string
    prompt?: string
    action?: string
    appActionId?: string
  }>
}

const DEFAULT_ASSISTANT_MODEL = 'gpt-4o-mini'
const NOTE_TEXT_MAX = 160
const NOTES_PER_INVOICE = 6

/** Assistant chat model — cheap text model; override with VITE_ASSISTANT_CHAT_MODEL. */
function getAssistantChatModel(): string {
  return import.meta.env.VITE_ASSISTANT_CHAT_MODEL?.trim() || DEFAULT_ASSISTANT_MODEL
}

function nextMsgId(prefix = 'ai'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function truncateText(text: string, max = NOTE_TEXT_MAX): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/** Pull invoice # / load # tokens from free text for focused lookups. */
function extractLookupTokens(prompt: string): string[] {
  const tokens = new Set<string>()
  const q = prompt.trim()
  if (!q) return []

  for (const m of q.matchAll(/\b(?:invoice|inv)\s*#?\s*([A-Za-z0-9-]{2,})\b/gi)) {
    tokens.add(m[1].toLowerCase())
  }
  for (const m of q.matchAll(/\b(?:load|ld)\s*#?\s*([A-Za-z0-9-]{2,})\b/gi)) {
    tokens.add(m[1].toLowerCase())
  }
  for (const m of q.matchAll(/#\s*([A-Za-z0-9-]{2,})\b/g)) {
    tokens.add(m[1].toLowerCase())
  }
  // Bare numbers that look like invoice/load ids (3+ digits)
  for (const m of q.matchAll(/\b(\d{3,})\b/g)) {
    tokens.add(m[1].toLowerCase())
  }

  return [...tokens]
}

function invoiceMatchesTokens(inv: Invoice, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  const number = (inv.invoice_number || '').toLowerCase()
  const load = (inv.load_number || '').toLowerCase()
  const id = inv.id.toLowerCase()
  return tokens.some(
    (t) =>
      number === t ||
      number.includes(t) ||
      load === t ||
      load.includes(t) ||
      id === t ||
      id.includes(t)
  )
}

function notesForMode(inv: Invoice, mode: AssistantChatMode): InvoiceNote[] {
  if (mode === 'admin') return inv.notes_history ?? []
  return clientVisibleNotesForInvoice(inv)
}

function summarizeNotes(
  notes: InvoiceNote[],
  limit = NOTES_PER_INVOICE,
  preferHoldRelevant = false
) {
  const ordered = preferHoldRelevant
    ? prioritizeHoldNotes(notes, limit)
    : [...notes]
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, limit)
  return ordered.map((n) => ({
    at: n.created_at,
    by: n.created_by,
    type: n.type ?? 'note',
    visibility: n.visibility ?? 'client',
    text: truncateText(n.note),
  }))
}

function summarizeDisputes(disputes: InvoiceDispute[] | undefined) {
  if (!disputes?.length) return []
  return disputes.slice(0, 6).map((d) => ({
    reason: d.reason,
    status: d.status,
    description: truncateText(d.description, 240),
    created_at: d.created_at,
    response: d.response ? truncateText(d.response, 240) : null,
  }))
}

function summarizeWriteOff(inv: Invoice, mode: AssistantChatMode) {
  const req = inv.write_off_request
  if (!req) return null
  return {
    requested_by: req.requested_by,
    requested_at: req.requested_at,
    client_note: truncateText(req.client_note || '', 300),
    received_amount: req.received_amount,
    shortfall: req.shortfall,
    resolution: req.resolution ?? null,
    resolved_at: req.resolved_at ?? null,
    resolved_by: req.resolved_by ?? null,
    ...(mode === 'admin' && req.internal_note
      ? { internal_note: truncateText(req.internal_note, 300) }
      : {}),
  }
}

/** Compact list rows for open A/R (no full note dump). */
function summarizeInvoices(invoices: Invoice[], limit = 12) {
  return invoices.slice(0, limit).map((inv) => {
    const hold =
      inv.status === 'hold' || inv.hold_reason
        ? deriveHoldExplanation(inv, 'client')
        : null
    return {
      id: inv.id,
      number: inv.invoice_number,
      load: inv.load_number ?? undefined,
      broker: inv.broker_name,
      client: inv.client_name,
      status: inv.status,
      amount: inv.amount,
      due: inv.due_date,
      hold: hold ? truncateText(hold.reason, 80) : undefined,
    }
  })
}

/** Full detail for invoices the user asked about (includes notes + payment truth). */
function summarizeInvoiceDetails(
  invoices: Invoice[],
  mode: AssistantChatMode,
  payments: Payment[] = []
) {
  return invoices.map((inv) => {
    const pay = buildPaymentStatusSnapshot(inv, payments)
    const onHold =
      inv.status === 'hold' ||
      Boolean(inv.hold_reason?.trim()) ||
      (inv.documents_count === 0 && inv.status === 'pending')
    const hold = onHold ? deriveHoldExplanation(inv, mode) : null
    return {
      id: inv.id,
      number: inv.invoice_number,
      load: inv.load_number ?? undefined,
      broker: inv.broker_name,
      client: inv.client_name,
      status: inv.status,
      amount: inv.amount,
      paid: inv.paid_amount ?? undefined,
      due: inv.due_date,
      // Prefer derived hold (notes + uploads) over the raw field alone.
      hold: hold ? truncateText(hold.reason, 160) : undefined,
      holdDetail: hold ? truncateText(hold.detail, 280) : undefined,
      carrierUploadedAfterNotice: hold?.carrierUploadedAfterNotice || undefined,
      lastUploadAt: hold?.lastUploadAt,
      lastUploadText: hold?.lastUploadText,
      notes: summarizeNotes(notesForMode(inv, mode), NOTES_PER_INVOICE, onHold),
      disputes: summarizeDisputes(inv.disputes),
      write_off: summarizeWriteOff(inv, mode) ?? undefined,
      // Structured money truth — prefer this over guessing from notes.
      paymentStatus: {
        headline: pay.headline,
        headlineLabel: pay.headlineLabel,
        summary: pay.summary,
        faceAmount: pay.faceAmount,
        confirmedReceived: pay.confirmedReceived,
        balanceDue: pay.balanceDue,
        displayStatus: pay.displayStatus,
        variance: pay.variance,
        why: pay.why,
        payments: pay.payments.map((p) => ({
          amount: p.amount,
          status: p.status,
          date: p.date,
          reason: p.reason,
          reversalType: p.reversalType,
        })),
      },
    }
  })
}

function summarizePayments(payments: Payment[], limit = 6) {
  return payments.slice(0, limit).map((p) => ({
    id: p.id,
    inv: p.invoice_number,
    invId: p.invoice_id,
    broker: p.broker_name,
    amount: p.amount,
    status: p.status,
    date: p.received_date || p.payment_date,
    reversalReason: p.reversal_reason || undefined,
    rejectionReason: p.rejection_reason || undefined,
    reversalType: p.reversal_type || undefined,
    disputeReason: p.dispute
      ? [p.dispute.reason, p.dispute.description].filter(Boolean).join(' — ')
      : undefined,
  }))
}

function toPaymentStatusCard(snap: AssistantPaymentStatus): AssistantPaymentStatusCard {
  return {
    invoiceId: snap.invoiceId,
    invoiceNumber: snap.invoiceNumber,
    brokerName: snap.brokerName,
    headline: snap.headline,
    headlineLabel: snap.headlineLabel,
    summary: snap.summary,
    faceAmountLabel: snap.faceAmountLabel,
    confirmedReceivedLabel: snap.confirmedReceivedLabel,
    balanceDueLabel: snap.balanceDueLabel,
    balanceTone: snap.balanceTone,
    displayStatus: snap.displayStatus,
    variance: snap.variance,
    invoiceStatus: snap.invoiceStatus,
    why: snap.why
      ? {
          source: snap.why.source,
          paymentStatusLabel: snap.why.paymentStatusLabel,
          reason: snap.why.reason,
          reversalType: snap.why.reversalType,
          date: snap.why.date,
        }
      : undefined,
    payments: snap.payments.map((p) => ({
      id: p.id,
      amountLabel: p.amountLabel,
      statusLabel: p.statusLabel,
      date: p.date,
      reason: p.reason,
    })),
  }
}

function toArSummaryCard(snap: AssistantArSummary): AssistantArSummaryCard {
  return {
    headline: snap.headline,
    summary: snap.summary,
    openArLabel: snap.openArLabel,
    openInvoiceCount: snap.openInvoiceCount,
    onHoldLabel: snap.onHoldLabel,
    onHoldCount: snap.onHoldCount,
    overdueLabel: snap.overdueLabel,
    overdueCount: snap.overdueCount,
    dsoDays: snap.dsoDays,
    invoicedGrowthPct: snap.invoicedGrowthPct,
    invoicedThisMonthLabel: snap.invoicedThisMonthLabel,
    collectedGrowthPct: snap.collectedGrowthPct,
    collectedThisMonthLabel: snap.collectedThisMonthLabel,
    project7Label: snap.project7Label,
    project30Label: snap.project30Label,
    cashFlow: snap.cashFlow.map((m) => ({
      month: m.month,
      monthKey: m.monthKey,
      invoiced: m.invoiced,
      collected: m.collected,
      invoice_count: m.invoice_count,
      payment_count: m.payment_count,
    })),
    aging: snap.aging,
  }
}

function summarizeCalendar(events: AssistantCalendarEvent[], limit = 12) {
  return events.slice(0, limit).map((e) => ({
    id: e.id,
    type: e.type,
    title: e.title,
    inv: e.invoiceNumber,
    invId: e.invoiceId,
    broker: e.brokerName,
    due: e.dueDate,
    status: e.status,
  }))
}

function findClientNameHint(prompt: string, invoices: Invoice[]): string | null {
  const q = prompt.toLowerCase()
  const names = [...new Set(invoices.map((i) => i.client_name).filter(Boolean))]
  const hit = names.find((name) => name.length >= 3 && q.includes(name.toLowerCase()))
  return hit ?? null
}

function buildSystemPrompt(mode: AssistantChatMode): string {
  const sharedFormat = `Format plain answers with Markdown — keep lists tight and scannable:
- Lead with ONE totals line (e.g. "**$5,910** open · **$3,895** on hold · 7 invoices").
- Then "- " bullets, ONE invoice per line: "- **1260** · $250 · Approved · HD Shipping".
- **Bold** the invoice number only. Never put the # alone on its own line, and never put the amount on the next line.
- Cap long lists at 8 rows; if more, show the largest and add "+N more".
- No run-on paragraphs.`
  const pageRules = `CREDYX CONTEXT may include currentPage (the screen the user is looking at):
- Bias vague asks ("what should I do?", "help", "anything here?") toward that page's work before offering unrelated areas.
- Don't send them to a screen they're already on — help them right there instead.`
  const contextRules = `CONVERSATION CONTEXT — CRITICAL:
- When the user says "this invoice", "that one", "it", or asks a follow-up action without naming an invoice, resolve it to the invoice most recently discussed in the conversation (last card or last # mentioned).
- NEVER ask "which invoice?" when exactly one invoice was just discussed — use it.
- Only ask which invoice when nothing was discussed or several are equally plausible.`
  const followUpRules = `After useful answers, include top-level followUps (2–3 max) that deepen THIS answer — not generic navigation:
- A/R overview (kind ar_summary) → "What's still open?", "What's on hold?", "What's past due?" — NOT an invoice dump in the overview itself.
- Missing docs → e.g. "Why are they on hold?", "Draft email about holds" (email_scope), "Add a note on one" (note_scope). NEVER "Upload missing docs" — the cards already have Upload.
- Holds → e.g. "Why are they on hold?", "Draft email about holds" (email_scope), "Add a note on one" (note_scope)
- Aging → e.g. "Who is most overdue?", "Draft a chase email"
- Do NOT add "Open payments" / "Open invoices" / other app_nav chips after a list or summary — those aren't going deeper.
- action "prompt" requires prompt text to send next.
- action "email_scope" opens a picker (one invoice / all / broker).
- action "note_scope" opens a picker to choose which invoice to post a note on.
- Labels: short, specific, no fluff.`
  const arSummaryRules = `When the user asks to summarize A/R / receivables overview / growth / projection / how collections are doing:
- Respond with kind "ar_summary" ONLY — the UI renders KPIs, MoM growth, 7/30-day projection, and charts.
- Do NOT list individual invoices in the text. Invoice lists are a separate follow-up ("What's still open?").
- Optional short text (one sentence) is fine; otherwise leave text empty and let the card speak.
- If they ask to list open invoices explicitly, use plain markdown bullets instead (not ar_summary).`
  const holdRules = `When CREDYX CONTEXT includes heldInvoices (portfolio hold ask):
- Cover EVERY invoice in heldInvoices — never stop at one just because it was discussed earlier.
- "What's on hold?" → short totals line + one bullet per held invoice (number · amount · broker).
- "Why are they on hold?" / "explain each hold reason" → one bullet per held invoice using heldInvoices[].holdDetail (preferred) or .hold. Include carrierUploadedAfterNotice / lastUploadText when present — e.g. "Missing BOL for second stop — carrier uploaded after that notice (Jul 24: Uploaded 1 document…); Credyx may still be reviewing."
- NEVER invent "Hold reason not recorded" when hold / holdDetail / notes already explain it.
- If the user names a specific invoice # (even bare like "64830 why is it on hold"), answer ONLY about that invoice from invoiceDetails — do not re-list the whole portfolio.
- Do NOT emit note_draft / email_draft unless the user asked to draft a note or email.`
  const missingDocsRules = `When the user asks about missing documents / paperwork / what needs upload:
- Respond with ONE kind "action" message using actionIds from dueTodayActions (upload_docs tasks).
- Lead text: ONE short sentence only, e.g. "**3** invoices need documents — tap Upload on each."
- Do NOT also list the same invoices as markdown bullets — the action cards ARE the list.
- Do NOT emit one action message per invoice — batch them in a single actionIds array.
- If dueTodayActions is empty, say nothing needs docs right now.`
  const noteRules = `When the user asks to add/post/leave a note on an invoice:
- Respond with kind "note_draft" and a noteDraft object.
- Require a real invoice from CREDYX CONTEXT (invoiceId + invoiceNumber). If unclear which invoice, ask OR use followUp action "note_scope".
- body: plain text ONLY — short, factual, no markdown. Do not invent facts not in context.
- visibility: "client" (carrier-visible) or "internal" (Credyx-only). Carrier mode always uses "client". Admin default "client" unless they ask for internal.
- Do NOT claim the note was posted — the user must confirm Post on the card.`
  const disputeRules = `When the user asks to open/file a dispute (or contest / challenge an invoice or payment):
- Respond with kind "dispute_draft" and a disputeDraft object: {invoiceId, invoiceNumber, reason, description}.
- reason must be one of: "amount_discrepancy" | "missing_documents" | "broker_rejection" | "payment_delay" | "other".
- If invoiceDetails shows carrierUploadedAfterNotice / lastUploadText (carrier already uploaded after a missing-docs notice): use reason "other" (NOT "missing_documents"). Description must be carrier-facing first person: state the hold reason, that THEY already uploaded (cite lastUploadText + date), and ask Credyx to review the upload and clear the hold. Never say "the carrier uploaded" — say "I already uploaded".
- If docs are still missing with no upload after the notice: reason "missing_documents" and ask Credyx what is still needed.
- description: 1–3 plain-text sentences from context. The user can edit it on the card.
- ANY invoice can be disputed — including paid ones. NEVER refuse; hand over the draft card.
- Resolve "this invoice" from conversation context. Do NOT claim the dispute was opened — the user confirms on the card.`
  const paymentRules = `When the user ASKS about payment / paid / balance due / reversed / “what happened” for invoice(s) (informational — NOT when they ask to dispute, note, or email; use the matching draft kind instead, without repeating the payment card):
- Prefer invoiceDetails[].paymentStatus (structured). Never invent a WHY from notes when paymentStatus.why exists.
- Respond with kind "payment_status" and paymentStatusInvoiceNumbers (and/or paymentStatusInvoiceIds) for each invoice asked about.
- Keep any plain text SHORT: one sentence pointing at the card. Do not contradict the card (e.g. if headline is payment_reversed with balanceDue > 0, say the money came off and balance is due again — even if invoice.status is still "approved").
- Notes are history only — they may say “confirmed” from an earlier step; money truth is confirmedReceived + balanceDue + payment rows.`
  const appActionRules = `You can open ANY screen in Credyx for the user via kind "app_action":
- Pick ids ONLY from CREDYX CONTEXT appActions catalog (never invent paths).
- Also allowed dynamic ids: "open_invoice" or "upload_invoice" with invoiceId and/or invoiceNumber.
- When the user asks to go somewhere, create something, or do a workflow in the app, respond with kind "app_action" + appActions:[{"id":"...","label":"optional override"}] (1–4 buttons).
- You may combine a short plain text tip with an app_action message.
- Do not claim you completed a workflow yourself — you hand them the button to open the right place.`
  const emailRules = `When the user asks to draft/write/generate/send an email (to broker, Credyx, or client):
- Respond with kind "email_draft" and an emailDraft object. ALWAYS fill subject AND body — never return an empty draft or a refusal.
- A GENERAL email to Credyx needs NO invoice. If they just say "draft an email to Credyx" / "connect me with Credyx" / "email about disputes or holds in general", write a short professional note to Credyx Ops (audience "credyx") asking their question — no invoice required.
- Use contacts from CREDYX CONTEXT for "to" / "toName". If no contact is listed, still draft it with audience "credyx" (system fills the Credyx Ops address) — do NOT invent other addresses.
- audience must be "broker" | "credyx" | "client" | "other".
- Held / missing-docs emails: mode "client" (carrier) → audience "credyx"; mode "admin" (Credyx staff) → audience "client" (the carrier). Do not email the broker for holds unless the user explicitly asks for the broker.
- subject + body: plain text ONLY — no markdown (**bold**, # headings, or "- " markdown bullets). Use real newlines (\\n) and numbered lines like "1) Invoice 64830 — $2,140 — Missing BOL".
- Keep body professional and factual. Only cite invoice #s / amounts that are in CREDYX CONTEXT.
- Include invoiceNumber / invoiceId / brokerName when the email is about a specific invoice.
- Do NOT claim the email was sent — only draft for review.`
  const knowledgeRules = `PRODUCT KNOWLEDGE — answer questions about Credyx and this assistant directly (kind "plain"); do NOT say "I don't have information" for the facts below:
- Credyx is a factoring / A/R platform for trucking carriers. Carriers submit invoices + paperwork (BOL, POD, rate con) in batches; Credyx advances funds and manages collections from brokers. This portal is where a carrier tracks invoices, payments, holds, disputes, documents, brokers, aging, and reports.
- Holds: an invoice goes on hold when paperwork is missing or something needs review. The carrier uploads the missing docs (or Credyx clears it) to move it forward.
- Payments: Credyx posts payments; the carrier confirms receipt. Payments can be reversed or short-paid; the money truth is confirmed received + balance due.
- Disputes lifecycle: a carrier opens a dispute (reason + description) → Credyx reviews it (open → under review) → Credyx resolves or closes it. The CARRIER opens and can add notes/withdraw context, but CLOSING/RESOLVING is done by Credyx after review — so answer "can I close a dispute?" with: you open it and Credyx reviews and closes it; you can add notes or email Credyx to withdraw it.
- What this assistant can do: explain holds/payments/disputes, summarize A/R (growth, projection, aging), list open/held/past-due invoices, draft emails to Credyx/brokers, post invoice notes, open disputes, upload missing docs, and open any screen in the portal.
- Contacting Credyx: you cannot transfer a human, but you CAN draft an email to Credyx Ops (offer this and, if they say yes, emit an email_draft to audience "credyx").
- Security/vulnerabilities or anything NOT in context: say you can't speak to that and point them to Credyx support — briefly, without inventing specifics.
- Keep these answers to 1–3 short sentences unless asked for more.`

  if (mode === 'admin') {
    return `You are Credyx staff Assistant for trucking A/R.
Answer ONLY from CREDYX CONTEXT JSON — never invent data.
Help with due-today chase, aging, payment checks, invoice notes/write-offs, drafting emails, posting invoice notes, and opening any Credyx admin screen the user needs.
Use invoiceDetails for why held/written off/disputed. Prefer invoiceDetails over openInvoices.
For due-today, kind "action" + actionIds from dueTodayActions. Expected pay: kind "expected_payment" + expectedPaymentInvoiceId.
${contextRules}
${pageRules}
${appActionRules}
${noteRules}
${disputeRules}
${paymentRules}
${arSummaryRules}
${holdRules}
${missingDocsRules}
${emailRules}
${knowledgeRules}
${followUpRules}
${sharedFormat}
JSON only: {"messages":[{"kind":"plain"|"quiet"|"action"|"expected_payment"|"email_draft"|"note_draft"|"dispute_draft"|"payment_status"|"ar_summary"|"app_action","text":"...","actionIds":[],"expectedPaymentInvoiceId":"","paymentStatusInvoiceNumbers":["1260"],"appActions":[{"id":"admin-collections"}],"noteDraft":{"body":"","invoiceNumber":"","invoiceId":"","brokerName":"","visibility":"client"},"disputeDraft":{"invoiceNumber":"","invoiceId":"","reason":"amount_discrepancy","description":""},"emailDraft":{"audience":"client","to":"","toName":"","subject":"","body":"","invoiceNumber":"","invoiceId":"","brokerName":""}}],"followUps":[{"label":"...","prompt":"...","action":"prompt"}]}`
  }

  return `You are Credyx Assistant for a trucking carrier portal.
Answer ONLY from CREDYX CONTEXT JSON — never invent data.
Help with missing docs, expected pay, payment status, carrier-visible notes, drafting emails to Credyx, posting notes on invoices, and opening ANY screen in their portal (batches, invoices, payments, brokers, reports, settings, etc.).
Use invoiceDetails for why held/written off/disputed. No Credyx chase tasks for the carrier.
For due-today uploads, kind "action" + actionIds from dueTodayActions. Expected pay: kind "expected_payment" + expectedPaymentInvoiceId.
${contextRules}
${pageRules}
${appActionRules}
${noteRules}
${disputeRules}
${paymentRules}
${arSummaryRules}
${holdRules}
${missingDocsRules}
${emailRules}
${knowledgeRules}
${followUpRules}
${sharedFormat}
JSON only: {"messages":[{"kind":"plain"|"quiet"|"action"|"expected_payment"|"email_draft"|"note_draft"|"dispute_draft"|"payment_status"|"ar_summary"|"app_action","text":"...","actionIds":[],"expectedPaymentInvoiceId":"","paymentStatusInvoiceNumbers":["1260"],"appActions":[{"id":"client-batches"}],"noteDraft":{"body":"","invoiceNumber":"","invoiceId":"","brokerName":"","visibility":"client"},"disputeDraft":{"invoiceNumber":"","invoiceId":"","reason":"amount_discrepancy","description":""},"emailDraft":{"audience":"credyx","to":"","toName":"","subject":"","body":"","invoiceNumber":"","invoiceId":"","brokerName":""}}],"followUps":[{"label":"...","prompt":"...","action":"prompt"}]}`
}

function brokerContactSummary(broker: Broker) {
  const accounting =
    broker.emails?.find((e) => e.category === 'accounting')?.email?.trim() ||
    broker.email?.trim() ||
    ''
  const paperwork =
    broker.emails?.find((e) => e.category === 'paperwork')?.email?.trim() || ''
  return {
    id: broker.id,
    name: broker.name,
    accountingEmail: accounting || undefined,
    paperworkEmail: paperwork || undefined,
    preferredContact: broker.preferred_contact,
  }
}

function credyxOpsEmail(): string {
  return (
    import.meta.env.VITE_ADMIN_ALERT_EMAIL?.trim() ||
    import.meta.env.VITE_CREDYX_OPS_EMAIL?.trim() ||
    'ops@credyx.net'
  )
}

function asksForEmail(prompt: string): boolean {
  return /\b(email|e-mail|draft|write|compose|reach out|contact|mailto)\b/i.test(prompt)
}

function asksForNote(prompt: string): boolean {
  return /\b(add|post|leave|write)\b.{0,24}\bnote\b|\bnote\b.{0,24}\b(invoice|hold|on)\b|\bpost a note\b|\binvoice note\b/i.test(
    prompt
  )
}

/** Held invoices the buddy should explain as a set (not one leftover # from history). */
function heldInvoicesForAssistant(invoices: Invoice[]): Invoice[] {
  return invoices.filter(
    (inv) =>
      inv.status === 'hold' ||
      Boolean(inv.hold_reason?.trim()) ||
      (inv.documents_count === 0 && inv.status === 'pending')
  )
}

/**
 * Portfolio hold questions — “what’s on hold?”, “why are THEY on hold?”, “each hold reason”.
 * These must never shrink to a single invoice just because history mentioned one.
 */
function isHoldPortfolioQuery(prompt: string): boolean {
  const q = prompt.trim()
  if (!/\b(hold|held)\b/i.test(q)) return false
  // Explicit single-invoice hold ask keeps focus (with #, "inv", or a bare 3+ digit id).
  if (
    /\b(invoice|inv)\s*#?\s*\d{3,}\b/i.test(q) ||
    /#\s*\d{3,}\b/.test(q) ||
    /\b\d{3,}\b/.test(q)
  ) {
    return false
  }
  return (
    /\bwhat('s| is| are)\b.{0,24}\b(on\s+hold|held)\b/i.test(q) ||
    /\b(why|reason|explain)\b.{0,48}\b(hold|held)\b/i.test(q) ||
    /\b(hold|held)\b.{0,48}\b(why|reason|explain|each)\b/i.test(q) ||
    /\beach\b.{0,24}\bhold\b/i.test(q) ||
    /\b(they|these|my invoices|all)\b.{0,32}\b(hold|held)\b/i.test(q)
  )
}

function isHoldWhyQuery(prompt: string): boolean {
  return (
    isHoldPortfolioQuery(prompt) &&
    /\b(why|reason|explain|each)\b/i.test(prompt)
  )
}

/**
 * Build a lean grounding JSON blob — only ship what the question needs.
 * Input tokens dominate cost; keep this small.
 *
 * Intent detection uses the CURRENT user message only. Optional history text may
 * soft-expand invoice context for vague follow-ups (“why?”) but never override a
 * portfolio hold / list question.
 */
export function buildAssistantGroundingJson(input: AssistantChatContextInput): string {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  const prompt = (input.prompt ?? '').trim()
  const historyPrompt = (input.historyPrompt ?? '').trim()

  // Tokens for focusing: current message first. History only for vague follow-ups.
  const currentTokens = extractLookupTokens(prompt)
  const historyTokens = extractLookupTokens(historyPrompt)
  const holdPortfolio = isHoldPortfolioQuery(prompt)
  const vagueFollowUp =
    !holdPortfolio &&
    currentTokens.length === 0 &&
    /^(why|and|what about|more|explain)\b/i.test(prompt)

  const tokens = holdPortfolio
    ? [] // never focus a portfolio hold ask on leftover #s from a prior note/email
    : currentTokens.length > 0
      ? currentTokens
      : vagueFollowUp
        ? historyTokens
        : currentTokens

  const mentioned = input.invoices.filter((inv) => invoiceMatchesTokens(inv, tokens))
  const clientHint = findClientNameHint(prompt, input.invoices)
  const asksRisk =
    /\b(risk|hold|missing|write.?off|dispute|aging|problem|issue)\b/i.test(prompt)
  const wantsEmail = asksForEmail(prompt)
  const wantsNote = asksForNote(prompt)
  const wantsPayment = isPaymentStatusQuery(prompt)
  const wantsHoldWhy = isHoldWhyQuery(prompt)

  const detailMap = new Map<string, Invoice>()
  for (const inv of mentioned) detailMap.set(inv.id, inv)

  // Portfolio holds: always attach EVERY held invoice with reasons.
  if (holdPortfolio) {
    heldInvoicesForAssistant(input.invoices)
      .slice(0, 10)
      .forEach((inv) => detailMap.set(inv.id, inv))
  } else if (
    (asksRisk || clientHint || wantsEmail || wantsNote || wantsPayment) &&
    mentioned.length === 0
  ) {
    // Only attach noteworthy details when asking about risk/holds or a named client overview.
    const pool = clientHint
      ? input.invoices.filter((inv) => inv.client_name === clientHint)
      : input.invoices
    pool
      .filter(
        (inv) =>
          inv.hold_reason ||
          inv.write_off_request ||
          (inv.disputes && inv.disputes.length > 0) ||
          inv.status === 'hold' ||
          inv.status === 'written_off' ||
          inv.status === 'write_off_pending'
      )
      .slice(0, wantsEmail ? 6 : 4)
      .forEach((inv) => detailMap.set(inv.id, inv))
  }

  const openPool = (
    clientHint
      ? input.invoices.filter((inv) => inv.client_name === clientHint)
      : input.invoices
  ).filter(
    (inv) =>
      inv.status !== 'paid' &&
      inv.status !== 'written_off' &&
      inv.status !== 'force_closed'
  )

  const dueToday = input.dueTodayActions.slice(0, 8).map((a) => ({
    id: a.id,
    title: a.title,
    inv: a.invoiceNumber,
    invId: a.invoiceId,
    broker: a.brokerName,
    status: a.status,
    kind: a.kind,
  }))

  // Focused invoice Q&A — skip the big open/calendar dump.
  // Portfolio hold asks are NOT focused even if history mentioned one invoice.
  const focused =
    !holdPortfolio &&
    (mentioned.length > 0 || (wantsPayment && detailMap.size > 0))

  const payload: Record<string, unknown> = {
    today: `${y}-${m}-${d}`,
    mode: input.mode,
    clientName: input.clientName ?? null,
    dueTodayActions: dueToday,
    appActions: catalogForPrompt(input.mode),
  }

  if (input.currentPage) {
    payload.currentPage = input.currentPage
  }

  if (holdPortfolio) {
    const held = [...detailMap.values()]
    payload.heldInvoices = summarizeInvoiceDetails(held, input.mode, input.payments)
    payload.heldCount = held.length
    if (wantsHoldWhy) {
      payload.instruction =
        'Explain the hold reason for EVERY invoice in heldInvoices — one bullet each. Do not drop any.'
    }
  } else if (focused || wantsEmail || wantsNote || wantsPayment) {
    const detailInvoices = [...detailMap.values()].slice(0, 6)
    if (detailInvoices.length > 0) {
      payload.invoiceDetails = summarizeInvoiceDetails(
        detailInvoices,
        input.mode,
        input.payments
      )
    }
    payload.recentPayments = summarizePayments(
      input.payments
        .filter((p) =>
          detailInvoices.length
            ? detailInvoices.some((inv) => inv.id === p.invoice_id)
            : true
        )
        .sort((a, b) =>
          (b.received_date || b.payment_date || '').localeCompare(
            a.received_date || a.payment_date || ''
          )
        ),
      focused ? 4 : 5
    )
  } else {
    payload.openInvoices = summarizeInvoices(openPool, clientHint ? 15 : 12)
    payload.openCount = openPool.length
    payload.calendarEvents = summarizeCalendar(
      input.calendarEvents.filter((e) => e.status === 'pending'),
      10
    )
    if (detailMap.size > 0) {
      payload.invoiceDetails = summarizeInvoiceDetails(
        [...detailMap.values()].slice(0, 4),
        input.mode,
        input.payments
      )
    }
    payload.recentPayments = summarizePayments(
      [...input.payments].sort((a, b) =>
        (b.received_date || b.payment_date || '').localeCompare(
          a.received_date || a.payment_date || ''
        )
      ),
      5
    )
  }

  // Contact directory for email drafts (lean).
  if (wantsEmail || focused) {
    const brokers = input.brokers ?? []
    const brokerIds = new Set(
      [...detailMap.values()]
        .map((inv) => inv.broker_id)
        .filter(Boolean)
        .concat(
          [...detailMap.values()].flatMap((inv) => {
            const byName = brokers.find((b) => b.name === inv.broker_name)
            return byName ? [byName.id] : []
          })
        )
    )
    const relatedBrokers =
      brokerIds.size > 0
        ? brokers.filter((b) => brokerIds.has(b.id)).slice(0, 6)
        : brokers.slice(0, 4)

    payload.contacts = {
      credyxOps: { email: credyxOpsEmail(), name: 'Credyx Ops' },
      client: input.clientEmail
        ? { email: input.clientEmail, name: input.clientName ?? 'Carrier' }
        : clientHint
          ? { name: clientHint }
          : undefined,
      brokers: relatedBrokers.map(brokerContactSummary),
    }
  }

  return JSON.stringify(payload)
}

function parseAiJson(raw: string): AiReplyPayload {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  try {
    return JSON.parse(candidate) as AiReplyPayload
  } catch {
    // Model sometimes wraps JSON in prose — try first/last brace slice.
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as AiReplyPayload
    }
    throw new Error('Assistant returned non-JSON content.')
  }
}

function resolveExpectedPayment(
  part: AiReplyPart,
  calendarEvents: AssistantCalendarEvent[]
): AssistantExpectedPayment | undefined {
  const byId = part.expectedPaymentInvoiceId
    ? calendarEvents.find(
        (e) =>
          e.type === 'expected_payment' && e.invoiceId === part.expectedPaymentInvoiceId
      )
    : undefined
  const byNumber = part.expectedPaymentInvoiceNumber
    ? calendarEvents.find(
        (e) =>
          e.type === 'expected_payment' &&
          e.invoiceNumber.replace(/^#/, '') ===
            String(part.expectedPaymentInvoiceNumber).replace(/^#/, '')
      )
    : undefined
  const match = byId ?? byNumber
  if (!match) return undefined
  return {
    invoiceNumber: match.invoiceNumber,
    invoiceId: match.invoiceId,
    brokerName: match.brokerName,
    dateLabel: match.dueLabel,
    confidence: 'medium',
    source: 'forecast',
  }
}

function normalizeAudience(raw?: string): AssistantEmailAudience {
  const a = (raw || '').toLowerCase()
  if (a === 'broker' || a === 'credyx' || a === 'client' || a === 'other') return a
  if (a.includes('broker') || a.includes('ap')) return 'broker'
  if (a.includes('credyx') || a.includes('ops')) return 'credyx'
  if (a.includes('client') || a.includes('carrier')) return 'client'
  return 'other'
}

function findBrokerForDraft(
  input: AssistantChatContextInput,
  invoiceId?: string,
  invoiceNumber?: string,
  brokerName?: string
): Broker | undefined {
  const brokers = input.brokers ?? []
  if (brokerName) {
    const byName = brokers.find(
      (b) => b.name.toLowerCase() === brokerName.trim().toLowerCase()
    )
    if (byName) return byName
  }
  const inv = input.invoices.find(
    (i) =>
      (invoiceId && i.id === invoiceId) ||
      (invoiceNumber &&
        String(i.invoice_number).replace(/^#/, '') ===
          String(invoiceNumber).replace(/^#/, ''))
  )
  if (!inv) return undefined
  return (
    brokers.find((b) => b.id === inv.broker_id) ||
    brokers.find((b) => b.name === inv.broker_name)
  )
}

/** Strip markdown so mail apps show clean plain text. */
function toPlainEmailText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function isHoldRelatedDraft(
  input: AssistantChatContextInput,
  subject: string,
  body: string,
  audience: AssistantEmailAudience
): boolean {
  const blob = `${input.prompt ?? ''} ${subject} ${body}`.toLowerCase()
  const holdCue =
    /\b(hold|held|missing\s+doc|missing\s+bol|pod|paperwork|upload)\b/.test(blob)
  // Explicit broker request overrides hold routing.
  const wantsBroker =
    /\bbroker\b/.test((input.prompt ?? '').toLowerCase()) && audience === 'broker'
  return holdCue && !wantsBroker
}

function resolveEmailDraft(
  part: AiReplyPart,
  input: AssistantChatContextInput
): AssistantEmailDraft | null {
  const raw = part.emailDraft
  if (!raw && part.kind?.toLowerCase() !== 'email_draft') return null

  let audience = normalizeAudience(raw?.audience)
  const invoiceNumber = raw?.invoiceNumber?.trim()
  const invoiceId = raw?.invoiceId?.trim()
  const brokerName = raw?.brokerName?.trim()
  const subjectRaw = (raw?.subject || '').trim()
  const bodyRaw = (raw?.body || part.text || '').trim()

  // Held invoices: carrier portal → Credyx; Credyx admin → carrier (client).
  if (isHoldRelatedDraft(input, subjectRaw, bodyRaw, audience)) {
    audience = input.mode === 'admin' ? 'client' : 'credyx'
  }

  const broker = findBrokerForDraft(input, invoiceId, invoiceNumber, brokerName)

  let to = (raw?.to || '').trim()
  let toName = (raw?.toName || '').trim()

  if (audience === 'credyx') {
    to = credyxOpsEmail()
    toName = toName || 'Credyx Ops'
  } else if (audience === 'broker') {
    const accounting =
      broker?.emails?.find((e) => e.category === 'accounting')?.email?.trim() ||
      broker?.email?.trim() ||
      ''
    to = to || accounting
    toName = toName || broker?.name || brokerName || 'Broker'
  } else if (audience === 'client') {
    const inv = input.invoices.find(
      (i) =>
        (invoiceId && i.id === invoiceId) ||
        (invoiceNumber &&
          String(i.invoice_number).replace(/^#/, '') ===
            String(invoiceNumber).replace(/^#/, ''))
    )
    const clients = getAllClients()
    const clientRow =
      clients.find((c) => c.id === inv?.client_id) ||
      clients.find(
        (c) =>
          c.name === inv?.client_name ||
          (input.clientName && c.name === input.clientName)
      ) ||
      (input.mode === 'admin'
        ? clients.find((c) =>
            input.invoices.some(
              (i) => i.status === 'hold' && (i.client_id === c.id || i.client_name === c.name)
            )
          )
        : undefined)
    to = input.clientEmail?.trim() || clientRow?.email?.trim() || to
    toName =
      toName ||
      input.clientName ||
      clientRow?.name ||
      inv?.client_name ||
      'Carrier'
  }

  const subject = toPlainEmailText(subjectRaw)
  const body = toPlainEmailText(bodyRaw)
  if (!subject && !body) return null

  const inv =
    input.invoices.find(
      (i) =>
        (invoiceId && i.id === invoiceId) ||
        (invoiceNumber &&
          String(i.invoice_number).replace(/^#/, '') ===
            String(invoiceNumber).replace(/^#/, ''))
    ) || undefined

  return {
    audience,
    to,
    toName,
    subject: subject || `Regarding invoice #${invoiceNumber || inv?.invoice_number || ''}`,
    body,
    invoiceNumber: invoiceNumber || inv?.invoice_number,
    invoiceId: invoiceId || inv?.id,
    brokerName: brokerName || broker?.name || inv?.broker_name,
  }
}

function resolveNoteDraft(
  part: AiReplyPart,
  input: AssistantChatContextInput
): AssistantNoteDraft | null {
  const raw = part.noteDraft
  if (!raw && part.kind?.toLowerCase() !== 'note_draft') return null

  const invoiceNumber = raw?.invoiceNumber?.trim()
  const invoiceId = raw?.invoiceId?.trim()
  const inv =
    input.invoices.find(
      (i) =>
        (invoiceId && i.id === invoiceId) ||
        (invoiceNumber &&
          String(i.invoice_number).replace(/^#/, '') ===
            String(invoiceNumber).replace(/^#/, ''))
    ) || undefined

  const body = toPlainEmailText((raw?.body || part.text || '').trim())
  if (!body) return null
  if (!inv?.id && !invoiceId) return null

  let visibility: AssistantNoteVisibility =
    raw?.visibility === 'internal' ? 'internal' : 'client'
  if (input.mode === 'client') visibility = 'client'

  return {
    body,
    invoiceId: inv?.id || invoiceId!,
    invoiceNumber: inv?.invoice_number || invoiceNumber || invoiceId!,
    brokerName: raw?.brokerName?.trim() || inv?.broker_name,
    visibility,
  }
}

const DISPUTE_REASON_KEYS: AssistantDisputeReason[] = [
  'amount_discrepancy',
  'missing_documents',
  'broker_rejection',
  'payment_delay',
  'other',
]

function normalizeDisputeReason(raw?: string): AssistantDisputeReason {
  const key = raw?.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return DISPUTE_REASON_KEYS.find((k) => k === key) ?? 'other'
}

function resolveDisputeDraft(
  part: AiReplyPart,
  input: AssistantChatContextInput
): AssistantDisputeDraft | null {
  const raw = part.disputeDraft
  if (!raw && part.kind?.toLowerCase() !== 'dispute_draft') return null

  const invoiceNumber = raw?.invoiceNumber?.trim()
  const invoiceId = raw?.invoiceId?.trim()
  const inv =
    input.invoices.find(
      (i) =>
        (invoiceId && i.id === invoiceId) ||
        (invoiceNumber &&
          String(i.invoice_number).replace(/^#/, '') ===
            String(invoiceNumber).replace(/^#/, ''))
    ) || undefined
  if (!inv?.id && !invoiceId) return null

  // Prefer grounded draft when we know the invoice — fixes “missing docs”
  // framing after the carrier already uploaded.
  if (inv) {
    const grounded = buildDisputeDraftForInvoice(inv, input.mode)
    const modelDesc = toPlainEmailText((raw?.description || '').trim())
    const modelSaysUploaded =
      /\b(i|we)\s+(already\s+)?(uploaded|attached|sent)\b/i.test(modelDesc) ||
      /\balready uploaded\b/i.test(modelDesc)
    const modelStillMissing =
      /\b(still\s+missing|missing documents|we are still missing)\b/i.test(modelDesc) &&
      !modelSaysUploaded

    // Keep a good model description; otherwise replace with grounded text.
    const useGroundedDesc =
      !modelDesc ||
      (grounded.youUploaded && (modelStillMissing || !modelSaysUploaded))

    return {
      ...grounded,
      // Model may pick amount_discrepancy etc. for payment disputes — keep that
      // unless we know this is a post-upload hold clear request.
      reason: grounded.youUploaded
        ? 'other'
        : normalizeDisputeReason(raw?.reason) || grounded.reason,
      description: useGroundedDesc ? grounded.description : modelDesc,
      brokerName:
        raw?.brokerName?.trim() || grounded.brokerName || inv.broker_name,
    }
  }

  return {
    invoiceId: invoiceId!,
    invoiceNumber: invoiceNumber || invoiceId!,
    brokerName: raw?.brokerName?.trim(),
    reason: normalizeDisputeReason(raw?.reason),
    description: toPlainEmailText((raw?.description || '').trim()),
  }
}

/** Intent checks used to keep informational cards from hijacking action requests. */
function isDisputeIntent(prompt: string): boolean {
  return /\b(dispute|disput\w*|contest|challenge)\b/i.test(prompt)
}

function isActionIntent(prompt: string): boolean {
  return (
    isDisputeIntent(prompt) ||
    /\b(add|post|leave|write|draft|send|create|upload|open|take me|go to)\b\s+(a\s+|an\s+|the\s+|my\s+)?(note|email|dispute|batch|screen|page)/i.test(
      prompt
    )
  )
}

/** Most recently discussed invoice — from structured assistant cards, then user text. */
function lastDiscussedInvoice(
  history: AssistantMessage[],
  invoices: Invoice[]
): Invoice | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]
    const ref =
      m.paymentStatus?.invoiceId ||
      m.noteDraft?.invoiceId ||
      m.disputeDraft?.invoiceId ||
      m.expectedPayment?.invoiceId ||
      m.emailDraft?.invoiceId
    if (ref) {
      const inv = invoices.find((x) => x.id === ref)
      if (inv) return inv
    }
    if (m.role === 'user' && m.text) {
      const tokens = extractLookupTokens(m.text)
      const inv = invoices.find((x) => invoiceMatchesTokens(x, tokens))
      if (inv) return inv
    }
  }
  return undefined
}

function mapAiPartsToMessages(
  parts: AiReplyPart[],
  dueTodayActions: AssistantActionItem[],
  calendarEvents: AssistantCalendarEvent[],
  input: AssistantChatContextInput
): AssistantMessage[] {
  const actionById = new Map(dueTodayActions.map((a) => [a.id, a]))
  const now = new Date().toISOString()
  const out: AssistantMessage[] = []

  for (const part of parts) {
    const kindRaw = (part.kind || 'plain').toLowerCase()
    const kind = (
      [
        'plain',
        'quiet',
        'action',
        'expected_payment',
        'risk',
        'email_draft',
        'note_draft',
        'dispute_draft',
        'payment_status',
        'ar_summary',
        'app_action',
      ].includes(kindRaw)
        ? kindRaw
        : 'plain'
    ) as AssistantMessageKind

    if (kind === 'ar_summary') {
      const snap = buildArSummarySnapshot(input.invoices, input.payments)
      out.push({
        id: nextMsgId(),
        role: 'assistant',
        kind: 'ar_summary',
        createdAt: now,
        text: part.text?.trim() && part.text.trim().length < 160 ? part.text.trim() : undefined,
        arSummary: toArSummaryCard(snap),
      })
      continue
    }

    if (kind === 'payment_status') {
      const refs = [
        ...(part.paymentStatusInvoiceIds || []),
        ...(part.paymentStatusInvoiceNumbers || []),
      ]
      const matched = input.invoices.filter((inv) =>
        refs.some((r) => {
          const needle = String(r).replace(/^#/, '').toLowerCase()
          return (
            inv.id.toLowerCase() === needle ||
            String(inv.invoice_number).replace(/^#/, '').toLowerCase() === needle
          )
        })
      )
      const snaps = buildPaymentStatusSnapshots(matched, input.payments, 6)
      if (snaps.length > 0) {
        if (part.text?.trim()) {
          out.push({
            id: nextMsgId(),
            role: 'assistant',
            kind: 'plain',
            createdAt: now,
            text: part.text.trim(),
          })
        }
        for (const snap of snaps) {
          out.push({
            id: nextMsgId(),
            role: 'assistant',
            kind: 'payment_status',
            createdAt: now,
            paymentStatus: toPaymentStatusCard(snap),
          })
        }
        continue
      }
      out.push({
        id: nextMsgId(),
        role: 'assistant',
        kind: 'plain',
        createdAt: now,
        text:
          part.text?.trim() ||
          'Tell me the invoice number and I’ll show confirmed received, balance due, and why.',
      })
      continue
    }

    if (kind === 'note_draft') {
      const noteDraft = resolveNoteDraft(part, input)
      if (noteDraft) {
        if (part.text?.trim() && part.text.trim() !== noteDraft.body) {
          out.push({
            id: nextMsgId(),
            role: 'assistant',
            kind: 'plain',
            createdAt: now,
            text: part.text.trim(),
          })
        }
        out.push({
          id: nextMsgId(),
          role: 'assistant',
          kind: 'note_draft',
          createdAt: now,
          noteDraft,
        })
        continue
      }
      out.push({
        id: nextMsgId(),
        role: 'assistant',
        kind: 'plain',
        createdAt: now,
        text:
          part.text?.trim() ||
          'Tell me which invoice to note (number or load #), and what to write.',
      })
      continue
    }

    if (kind === 'dispute_draft') {
      const disputeDraft = resolveDisputeDraft(part, input)
      if (disputeDraft) {
        if (part.text?.trim()) {
          out.push({
            id: nextMsgId(),
            role: 'assistant',
            kind: 'plain',
            createdAt: now,
            text: part.text.trim(),
          })
        }
        out.push({
          id: nextMsgId(),
          role: 'assistant',
          kind: 'dispute_draft',
          createdAt: now,
          disputeDraft,
        })
        continue
      }
      out.push({
        id: nextMsgId(),
        role: 'assistant',
        kind: 'plain',
        createdAt: now,
        text:
          part.text?.trim() ||
          'Tell me which invoice to dispute (number or load #) and what went wrong.',
      })
      continue
    }

    if (kind === 'app_action') {
      const appActions = resolveAppActions(input.mode, part.appActions ?? [])
      if (appActions.length > 0) {
        if (part.text?.trim()) {
          out.push({
            id: nextMsgId(),
            role: 'assistant',
            kind: 'plain',
            createdAt: now,
            text: part.text.trim(),
          })
        }
        out.push({
          id: nextMsgId(),
          role: 'assistant',
          kind: 'app_action',
          createdAt: now,
          appActions,
        })
        continue
      }
      out.push({
        id: nextMsgId(),
        role: 'assistant',
        kind: 'plain',
        createdAt: now,
        text:
          part.text?.trim() ||
          'Tell me which screen you need — batches, invoices, payments, brokers, reports…',
      })
      continue
    }

    if (kind === 'email_draft') {
      const emailDraft = resolveEmailDraft(part, input)
      if (emailDraft) {
        if (part.text?.trim()) {
          out.push({
            id: nextMsgId(),
            role: 'assistant',
            kind: 'plain',
            createdAt: now,
            text: part.text.trim(),
          })
        }
        out.push({
          id: nextMsgId(),
          role: 'assistant',
          kind: 'email_draft',
          createdAt: now,
          emailDraft,
        })
        continue
      }
      out.push({
        id: nextMsgId(),
        role: 'assistant',
        kind: 'plain',
        createdAt: now,
        text:
          part.text?.trim() ||
          'I couldn’t build an email draft from the available contacts. Try naming the invoice and who to contact (broker, Credyx, or client).',
      })
      continue
    }

    if (kind === 'action') {
      const ids = part.actionIds?.length
        ? part.actionIds
        : dueTodayActions.filter((a) => a.status === 'pending').map((a) => a.id)
      const actions = ids
        .map((id) => actionById.get(id))
        .filter((a): a is AssistantActionItem => Boolean(a))
      if (actions.length === 0) {
        out.push({
          id: nextMsgId(),
          role: 'assistant',
          kind: 'quiet',
          createdAt: now,
          text: part.text?.trim() || 'Nothing needs you today.',
        })
        continue
      }

      // Merge into an existing action message instead of stacking one card set per AI part.
      const existing = out.find((m) => m.kind === 'action' && m.actions?.length)
      if (existing?.actions) {
        const seen = new Set(existing.actions.map((a) => a.id))
        for (const a of actions) {
          if (!seen.has(a.id)) {
            existing.actions.push(a)
            seen.add(a.id)
          }
        }
        // Keep only a short lead if we don't already have one.
        if (!existing.text?.trim() && part.text?.trim() && part.text.trim().length < 140) {
          existing.text = part.text.trim()
        }
        continue
      }

      out.push({
        id: nextMsgId(),
        role: 'assistant',
        kind: 'action',
        createdAt: now,
        // One short lead only — never a duplicate invoice bullet list.
        text:
          part.text?.trim() && part.text.trim().length < 140
            ? part.text.trim()
            : undefined,
        actions,
      })
      continue
    }

    if (kind === 'expected_payment') {
      const expectedPayment = resolveExpectedPayment(part, calendarEvents)
      if (expectedPayment) {
        out.push({
          id: nextMsgId(),
          role: 'assistant',
          kind: 'expected_payment',
          createdAt: now,
          text: part.text?.trim(),
          expectedPayment,
        })
        continue
      }
      out.push({
        id: nextMsgId(),
        role: 'assistant',
        kind: 'plain',
        createdAt: now,
        text:
          part.text?.trim() ||
          'I don’t see an expected payment date for that invoice in your calendar yet.',
      })
      continue
    }

    out.push({
      id: nextMsgId(),
      role: 'assistant',
      kind: kind === 'quiet' ? 'quiet' : 'plain',
      createdAt: now,
      text: part.text?.trim() || (kind === 'quiet' ? "You're clear today." : '…'),
    })
  }

  return out.length > 0
    ? out
    : [
        {
          id: nextMsgId(),
          role: 'assistant',
          kind: 'plain',
          createdAt: now,
          text: 'I could not format a reply. Try asking what’s due today.',
        },
      ]
}

/** Normalize model followUps into typed chips. */
function normalizeModelFollowUps(
  raw: AiReplyPayload['followUps'] | AiReplyPart['followUps']
): AssistantFollowUp[] | undefined {
  if (!raw?.length) return undefined
  const out: AssistantFollowUp[] = []
  for (const f of raw) {
    const label = f.label?.trim()
    if (!label) continue
    const action =
      f.action === 'email_scope'
        ? 'email_scope'
        : f.action === 'note_scope'
          ? 'note_scope'
          : f.action === 'app_nav'
            ? 'app_nav'
            : 'prompt'
    out.push({
      id: nextMsgId('fu'),
      label,
      prompt: f.prompt?.trim() || undefined,
      action,
      appActionId: f.appActionId?.trim() || undefined,
    })
  }
  return out.length ? out : undefined
}

/** If user asked about payment on named invoices and the model forgot cards, attach them.
 *  Only fires on informational questions about invoices named in the CURRENT prompt —
 *  never on action requests (dispute/note/email/open) and never over draft cards. */
function ensurePaymentStatusCards(
  messages: AssistantMessage[],
  prompt: string,
  invoices: Invoice[],
  payments: Payment[]
): AssistantMessage[] {
  if (!isPaymentStatusQuery(prompt)) return messages
  if (isActionIntent(prompt)) return messages
  if (
    messages.some(
      (m) =>
        m.kind === 'payment_status' ||
        m.kind === 'note_draft' ||
        m.kind === 'dispute_draft' ||
        m.kind === 'email_draft'
    )
  ) {
    return messages
  }

  const tokens = extractLookupTokens(prompt)
  const matched = invoices.filter((inv) => invoiceMatchesTokens(inv, tokens))
  if (matched.length === 0) return messages

  const snaps = buildPaymentStatusSnapshots(matched, payments, 4)
  if (!snaps.length) return messages

  const cards: AssistantMessage[] = snaps.map((snap) => ({
    id: nextMsgId(),
    role: 'assistant' as const,
    kind: 'payment_status' as const,
    createdAt: new Date().toISOString(),
    paymentStatus: toPaymentStatusCard(snap),
  }))

  // Drop verbose plain replies that often contradict money truth; keep a short lead-in.
  const lead: AssistantMessage = {
    id: nextMsgId(),
    role: 'assistant',
    kind: 'plain',
    createdAt: new Date().toISOString(),
    text:
      snaps.length === 1
        ? `Here’s the payment status for #${snaps[0].invoiceNumber}:`
        : `Here’s the payment status for ${snaps.length} invoices:`,
  }

  const withoutConflictingPlain = messages.filter((m) => {
    if (m.kind !== 'plain' || !m.text) return true
    // Keep short tips; drop long status essays we’ll replace with cards.
    return m.text.trim().length < 80
  })

  return [...withoutConflictingPlain, lead, ...cards]
}

/** If the user asked to dispute and the model refused or asked "which invoice",
 *  attach a dispute draft card for the invoice in play (prompt first, then history). */
function ensureDisputeDraft(
  messages: AssistantMessage[],
  prompt: string,
  history: AssistantMessage[],
  input: AssistantChatContextInput
): AssistantMessage[] {
  if (!isDisputeIntent(prompt)) return messages
  if (messages.some((m) => m.kind === 'dispute_draft')) {
    // Enrich any model draft that still lacks the upload banner / clear wording.
    return messages.map((m) => {
      if (m.kind !== 'dispute_draft' || !m.disputeDraft) return m
      const inv = input.invoices.find(
        (i) =>
          i.id === m.disputeDraft!.invoiceId ||
          String(i.invoice_number).replace(/^#/, '') ===
            String(m.disputeDraft!.invoiceNumber).replace(/^#/, '')
      )
      if (!inv) return m
      const grounded = buildDisputeDraftForInvoice(inv, input.mode)
      if (!grounded.youUploaded) {
        return {
          ...m,
          disputeDraft: {
            ...m.disputeDraft,
            youUploaded: grounded.youUploaded,
            uploadSummary: grounded.uploadSummary,
            uploadAt: grounded.uploadAt,
          },
        }
      }
      const desc = m.disputeDraft.description || ''
      const needsRewrite =
        !desc.trim() ||
        (/\bstill\s+missing\b/i.test(desc) && !/\balready uploaded\b/i.test(desc)) ||
        m.disputeDraft.reason === 'missing_documents'
      return {
        ...m,
        disputeDraft: {
          ...grounded,
          description: needsRewrite ? grounded.description : desc,
          brokerName: m.disputeDraft.brokerName || grounded.brokerName,
        },
      }
    })
  }

  const tokens = extractLookupTokens(prompt)
  const inv =
    input.invoices.find((x) => invoiceMatchesTokens(x, tokens)) ||
    lastDiscussedInvoice(history, input.invoices)
  if (!inv) return messages

  const draft: AssistantMessage = {
    id: nextMsgId(),
    role: 'assistant',
    kind: 'dispute_draft',
    createdAt: new Date().toISOString(),
    text: buildDisputeDraftForInvoice(inv, input.mode).youUploaded
      ? 'You already uploaded paperwork on this invoice — this dispute asks Credyx to review it and clear the hold.'
      : undefined,
    disputeDraft: buildDisputeDraftForInvoice(inv, input.mode),
  }
  // Drop refusal-style essays; keep short lead-ins so the card is the answer.
  const kept = messages.filter(
    (m) => m.kind !== 'plain' || !m.text || m.text.trim().length < 120
  )
  return [...kept, draft]
}

/**
 * Fallback so an email request never dead-ends. If the user clearly asked to
 * email/contact Credyx and the model returned no email_draft (or a refusal),
 * synthesize a general Credyx Ops email — no invoice required.
 */
function ensureEmailDraft(
  messages: AssistantMessage[],
  prompt: string,
  history: AssistantMessage[],
  input: AssistantChatContextInput
): AssistantMessage[] {
  if (!asksForEmail(prompt)) return messages
  // Model already produced a usable draft, or a more specific card the user asked for.
  if (
    messages.some(
      (m) =>
        m.kind === 'email_draft' ||
        m.kind === 'note_draft' ||
        m.kind === 'dispute_draft'
    )
  ) {
    return messages
  }
  // Only step in for the safe, unambiguous case: emailing Credyx (carrier → ops).
  // Broker/client emails need specific recipients; leave those to the model.
  const wantsBroker = /\bbroker\b/i.test(prompt)
  const wantsClient = /\b(client|carrier|customer)\b/i.test(prompt)
  if (wantsBroker || (wantsClient && input.mode === 'admin')) return messages

  // Try to anchor to an invoice if one is in play, but never require it.
  const tokens = extractLookupTokens(prompt)
  const inv =
    input.invoices.find((x) => invoiceMatchesTokens(x, tokens)) ||
    lastDiscussedInvoice(history, input.invoices)

  const topic = /\bdispute\b/i.test(prompt)
    ? 'dispute'
    : /\b(hold|held|on hold)\b/i.test(prompt)
      ? 'hold'
      : 'general'

  const senderName = input.clientName || 'the carrier team'
  const invRef = inv ? ` regarding invoice #${inv.invoice_number}` : ''

  let subject = 'Question for Credyx Ops'
  let intro = 'I have a question I was hoping the Credyx team could help with.'
  if (topic === 'dispute') {
    subject = inv
      ? `Dispute question — invoice #${inv.invoice_number}`
      : 'Question about disputes'
    intro = `I'd like to understand the dispute process${invRef} — specifically how a dispute is reviewed and closed once it's opened.`
  } else if (topic === 'hold') {
    subject = inv
      ? `Held invoice — invoice #${inv.invoice_number}`
      : 'Question about held invoices'
    intro = `I'd like help clearing a hold${invRef} — please let me know what's needed to move it forward.`
  }

  const body = toPlainEmailText(
    `Hi Credyx team,\n\n${intro}\n\nPlease let me know the next steps or if you need anything from me.\n\nThank you,\n${senderName}`
  )

  const draft: AssistantMessage = {
    id: nextMsgId(),
    role: 'assistant',
    kind: 'email_draft',
    createdAt: new Date().toISOString(),
    emailDraft: {
      audience: 'credyx',
      to: credyxOpsEmail(),
      toName: 'Credyx Ops',
      subject,
      body,
      invoiceNumber: inv?.invoice_number,
      invoiceId: inv?.id,
    },
  }

  // Drop refusal-style plain text; keep a short lead-in only.
  const kept = messages.filter(
    (m) =>
      (m.kind === 'plain' || m.kind === 'quiet') &&
      m.text &&
      m.text.trim().length < 120 &&
      !/couldn.t build an email/i.test(m.text)
  )
  return [...kept, draft]
}

/** If “why on hold / each reason” only covered some invoices, replace with a full list. */
function ensureHoldWhyReply(
  messages: AssistantMessage[],
  prompt: string,
  invoices: Invoice[],
  mode: AssistantChatMode = 'client'
): AssistantMessage[] {
  if (!isHoldWhyQuery(prompt)) return messages

  const held = heldInvoicesForAssistant(invoices)
  if (held.length === 0) {
    return [
      {
        id: nextMsgId(),
        role: 'assistant',
        kind: 'quiet',
        createdAt: new Date().toISOString(),
        text: 'Nothing on hold right now.',
      },
    ]
  }

  const replyText = messages.map((m) => m.text || '').join('\n')
  const mentionedNums = new Set(
    [...replyText.matchAll(/#?\b(\d{3,})\b/g)].map((m) => m[1])
  )
  const covered = held.filter((inv) =>
    mentionedNums.has(String(inv.invoice_number).replace(/^#/, ''))
  )
  // Model already listed every hold — keep it (but drop stray note/email drafts).
  if (covered.length >= held.length && !messages.some((m) => m.kind === 'note_draft')) {
    return messages.filter(
      (m) => m.kind === 'plain' || m.kind === 'quiet' || m.kind === 'action'
    )
  }

  const money = (n: number) =>
    `$${Number(n || 0).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`
  const bullets = held
    .map((inv) => {
      const hold = deriveHoldExplanation(inv, mode)
      return `- **${inv.invoice_number}** · ${money(inv.amount)} · ${inv.broker_name} — ${hold.detail}`
    })
    .join('\n')

  return [
    {
      id: nextMsgId(),
      role: 'assistant',
      kind: 'plain',
      createdAt: new Date().toISOString(),
      text: `**${held.length}** on hold — here’s why:\n\n${bullets}`,
    },
  ]
}

/**
 * Single-invoice “why is 64830 on hold?” — answer only that invoice from notes/uploads.
 * Runs when the prompt names an invoice # and asks why/hold (not a portfolio ask).
 */
function isFocusedHoldWhyQuery(prompt: string): boolean {
  if (isHoldPortfolioQuery(prompt) || isHoldWhyQuery(prompt)) return false
  if (!/\b(hold|held)\b/i.test(prompt)) return false
  if (extractLookupTokens(prompt).length === 0) return false
  return (
    /\b(why|reason|explain)\b/i.test(prompt) ||
    /\bon\s+hold\b/i.test(prompt)
  )
}

function ensureFocusedHoldWhyReply(
  messages: AssistantMessage[],
  prompt: string,
  invoices: Invoice[],
  mode: AssistantChatMode = 'client'
): AssistantMessage[] {
  if (!isFocusedHoldWhyQuery(prompt)) return messages

  const tokens = extractLookupTokens(prompt)
  const inv = invoices.find((x) => invoiceMatchesTokens(x, tokens))
  if (!inv) return messages

  const hold = deriveHoldExplanation(inv, mode)
  const money = `$${Number(inv.amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`

  // If the model already gave a focused answer that mentions this # and isn't a portfolio dump, keep it.
  const replyText = messages.map((m) => m.text || '').join('\n')
  const otherHeld = heldInvoicesForAssistant(invoices).filter((h) => h.id !== inv.id)
  const dumpsOthers = otherHeld.some((h) =>
    new RegExp(`#?\\b${String(h.invoice_number).replace(/^#/, '')}\\b`).test(replyText)
  )
  const mentionsTarget = new RegExp(
    `#?\\b${String(inv.invoice_number).replace(/^#/, '')}\\b`
  ).test(replyText)
  const looksGeneric =
    /Hold reason not recorded/i.test(replyText) &&
    Boolean(hold.missingNoticeText || hold.lastUploadText)

  if (
    mentionsTarget &&
    !dumpsOthers &&
    !looksGeneric &&
    messages.some((m) => m.kind === 'plain' || m.kind === 'quiet')
  ) {
    return messages.filter(
      (m) => m.kind === 'plain' || m.kind === 'quiet' || m.kind === 'action'
    )
  }

  return [
    {
      id: nextMsgId(),
      role: 'assistant',
      kind: 'plain',
      createdAt: new Date().toISOString(),
      text: `**${inv.invoice_number}** · ${money} · ${inv.broker_name}\n\n${hold.detail}`,
    },
  ]
}

/** Replace invoice dumps with a portfolio A/R overview card. */
function ensureArSummaryCard(
  messages: AssistantMessage[],
  prompt: string,
  invoices: Invoice[],
  payments: Payment[]
): AssistantMessage[] {
  if (!isArSummaryQuery(prompt)) return messages
  if (messages.some((m) => m.kind === 'ar_summary')) return messages

  const snap = buildArSummarySnapshot(invoices, payments)
  return [
    {
      id: nextMsgId(),
      role: 'assistant',
      kind: 'ar_summary',
      createdAt: new Date().toISOString(),
      arSummary: toArSummaryCard(snap),
    },
  ]
}

/** Collapse messy missing-docs replies into one lead + one action card list. */
function ensureMissingDocActions(
  messages: AssistantMessage[],
  prompt: string,
  dueTodayActions: AssistantActionItem[]
): AssistantMessage[] {
  if (!isMissingDocsQuery(prompt)) return messages

  const pending = dueTodayActions.filter((a) => a.status === 'pending')
  if (pending.length === 0) {
    // Keep a quiet answer if the model already said clear; otherwise say so.
    if (messages.some((m) => m.kind === 'quiet' || (m.kind === 'plain' && m.text))) {
      return messages.filter((m) => m.kind !== 'action')
    }
    return [
      {
        id: nextMsgId(),
        role: 'assistant',
        kind: 'quiet',
        createdAt: new Date().toISOString(),
        text: 'No invoices are missing documents right now.',
      },
    ]
  }

  // Prefer action ids the model already picked; fall back to all pending uploads.
  const fromModel = messages.flatMap((m) => m.actions ?? [])
  const byId = new Map(pending.map((a) => [a.id, a]))
  const picked: AssistantActionItem[] = []
  for (const a of fromModel) {
    const match = byId.get(a.id)
    if (match && !picked.some((p) => p.id === match.id)) picked.push(match)
  }
  const actions = picked.length > 0 ? picked : pending

  const lead =
    actions.length === 1
      ? `**1** invoice needs documents — tap Upload:`
      : `**${actions.length}** invoices need documents — tap Upload on each:`

  return [
    {
      id: nextMsgId(),
      role: 'assistant',
      kind: 'action',
      createdAt: new Date().toISOString(),
      text: lead,
      actions,
    },
  ]
}

/** If user asked to open something and the model forgot buttons, attach catalog matches. */
function ensureAppActions(
  messages: AssistantMessage[],
  prompt: string,
  mode: AssistantChatMode
): AssistantMessage[] {
  if (!isAppNavigationIntent(prompt)) return messages
  const already = messages.some((m) => (m.appActions?.length ?? 0) > 0)
  if (already) return messages
  const matched = matchCatalogFromPrompt(prompt, mode, 3)
  if (!matched.length) return messages
  return [
    ...messages,
    {
      id: nextMsgId(),
      role: 'assistant',
      kind: 'app_action',
      createdAt: new Date().toISOString(),
      appActions: matched,
    },
  ]
}

/**
 * Send a user message to OpenAI, grounded in live Credyx A/R + calendar context.
 */
export async function sendAssistantChatMessage(params: {
  prompt: string
  history: AssistantMessage[]
  context: AssistantChatContextInput
}): Promise<AssistantChatResult> {
  if (!isAIReviewEnabled()) {
    throw new Error(
      'AI requires Supabase. Deploy the openai-proxy Edge Function with OPENAI_API_KEY.'
    )
  }

  const historyHints = params.history
    .filter((m) => m.role === 'user' && m.text?.trim())
    .slice(-4)
    .map((m) => m.text!.trim())
    .join(' ')

  const grounding = buildAssistantGroundingJson({
    ...params.context,
    prompt: params.prompt,
    historyPrompt: historyHints,
  })
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `${buildSystemPrompt(params.context.mode)}\n\n--- CREDYX CONTEXT (JSON) ---\n${grounding}`,
    },
  ]

  // Prior turns as plain text (skip structured card payloads).
  for (const msg of params.history.slice(-6)) {
    if (msg.role === 'user' && msg.text?.trim()) {
      messages.push({ role: 'user', content: msg.text.trim() })
      continue
    }
    if (msg.role === 'assistant') {
      const bits: string[] = []
      if (msg.text?.trim()) {
        // Cap history size — full prior markdown dumps burn input tokens.
        const clipped =
          msg.text.trim().length > 500
            ? `${msg.text.trim().slice(0, 499)}…`
            : msg.text.trim()
        bits.push(clipped)
      }
      if (msg.kind === 'action' && msg.actions?.length) {
        bits.push(
          `Actions: ${msg.actions
            .slice(0, 5)
            .map((a) => `${a.title} (#${a.invoiceNumber})`)
            .join('; ')}`
        )
      }
      if (msg.kind === 'expected_payment' && msg.expectedPayment) {
        bits.push(
          `Expected payment #${msg.expectedPayment.invoiceNumber} on ${msg.expectedPayment.dateLabel}`
        )
      }
      if (msg.kind === 'payment_status' && msg.paymentStatus) {
        bits.push(
          `Payment #${msg.paymentStatus.invoiceNumber}: ${msg.paymentStatus.headlineLabel}; balance ${msg.paymentStatus.balanceDueLabel}; confirmed ${msg.paymentStatus.confirmedReceivedLabel}`
        )
      }
      if (msg.kind === 'ar_summary' && msg.arSummary) {
        bits.push(
          `A/R overview: ${msg.arSummary.headline}; ${msg.arSummary.summary}`
        )
      }
      // Keep the invoice-in-play visible so follow-ups like "dispute it" resolve.
      if (msg.kind === 'note_draft' && msg.noteDraft) {
        bits.push(`Drafted a note on invoice #${msg.noteDraft.invoiceNumber}`)
      }
      if (msg.kind === 'dispute_draft' && msg.disputeDraft) {
        bits.push(`Drafted a dispute on invoice #${msg.disputeDraft.invoiceNumber}`)
      }
      if (msg.kind === 'email_draft' && msg.emailDraft?.invoiceNumber) {
        bits.push(`Drafted an email about invoice #${msg.emailDraft.invoiceNumber}`)
      }
      if (msg.kind === 'app_action' && msg.appActions?.length) {
        bits.push(
          `Opened shortcuts: ${msg.appActions
            .slice(0, 4)
            .map((a) => a.label)
            .join('; ')}`
        )
      }
      if (bits.length) messages.push({ role: 'assistant', content: bits.join('\n') })
    }
  }

  messages.push({ role: 'user', content: params.prompt.trim() })

  const model = getAssistantChatModel()
  const response = await postOpenAIChatCompletions({
    model,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    max_tokens: 700,
    messages,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Assistant request failed: ${errText.slice(0, 280)}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }

  if (data.error?.message) {
    throw new Error(data.error.message)
  }

  const raw = data.choices?.[0]?.message?.content?.trim()
  if (!raw) {
    throw new Error('Empty response from assistant.')
  }

  const parsed = parseAiJson(raw)
  const parts: AiReplyPart[] =
    parsed.messages && parsed.messages.length > 0
      ? parsed.messages
      : [{ kind: 'plain', text: parsed.text || raw }]

  const usage = usageFromOpenAIResponse(data as Record<string, unknown>, model)

  const mapped = mapAiPartsToMessages(
    parts,
    params.context.dueTodayActions,
    params.context.calendarEvents,
    { ...params.context, prompt: params.prompt }
  )

  const fromModel =
    normalizeModelFollowUps(parsed.followUps) ||
    normalizeModelFollowUps(parts.find((p) => p.followUps?.length)?.followUps)

  const replyText = mapped.map((m) => m.text || '').join('\n')
  // Force cards only from the CURRENT prompt — history invoice #s caused card spam.
  const withPay = ensurePaymentStatusCards(
    mapped,
    params.prompt,
    params.context.invoices,
    params.context.payments
  )
  const withAr = ensureArSummaryCard(
    withPay,
    params.prompt,
    params.context.invoices,
    params.context.payments
  )
  const withHolds = ensureHoldWhyReply(
    withAr,
    params.prompt,
    params.context.invoices,
    params.context.mode
  )
  const withFocusHold = ensureFocusedHoldWhyReply(
    withHolds,
    params.prompt,
    params.context.invoices,
    params.context.mode
  )
  const withDispute = ensureDisputeDraft(
    withFocusHold,
    params.prompt,
    params.history,
    params.context
  )
  const withDocs = ensureMissingDocActions(
    withDispute,
    params.prompt,
    params.context.dueTodayActions
  )
  const withNav = ensureAppActions(withDocs, params.prompt, params.context.mode)
  const withEmail = ensureEmailDraft(
    withNav,
    params.prompt,
    params.history,
    params.context
  )
  const followUps = enrichFollowUps(
    params.prompt,
    params.context.mode,
    fromModel,
    replyText
  )

  // Prefer payment-aware follow-ups on money questions — deepen, don't navigate.
  const payFollowUps =
    isPaymentStatusQuery(params.prompt) &&
    withEmail.some((m) => m.kind === 'payment_status')
      ? dedupePayFollowUps([
          {
            id: nextMsgId('fu'),
            label: 'Open a dispute',
            prompt: 'Open a dispute for this invoice',
            action: 'prompt' as const,
          },
          {
            id: nextMsgId('fu'),
            label: 'Add a note',
            action: 'note_scope' as const,
          },
          ...followUps,
        ])
      : followUps

  return {
    messages: attachFollowUps(withEmail, payFollowUps),
    usage,
  }
}

/** Cap payment follow-ups at 3 and drop redundant “Open …” nav chips. */
function dedupePayFollowUps(items: AssistantFollowUp[]): AssistantFollowUp[] {
  const seen = new Set<string>()
  const out: AssistantFollowUp[] = []
  for (const item of items) {
    const key = item.label.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    if (item.action === 'app_nav' && /^open\b/i.test(item.label)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= 3) break
  }
  return out
}

/** Testing-only: show token/cost meter in local/dev or when explicitly enabled. */
export function shouldShowAssistantUsageMeter(): boolean {
  if (import.meta.env.DEV) return true
  const flag = import.meta.env.VITE_ASSISTANT_SHOW_USAGE?.toLowerCase()
  return flag === 'true' || flag === '1' || flag === 'yes'
}

/** Format a single-reply usage line for the testing meter. */
export function formatAssistantUsageLine(usage: AssistantChatUsage): string {
  const inTok = usage.promptTokens.toLocaleString()
  const outTok = usage.completionTokens.toLocaleString()
  const total = usage.totalTokens.toLocaleString()
  return `${total} tok (${inTok} in / ${outTok} out) · ~$${usage.estimatedCostUsd.toFixed(4)} · ${usage.model}`
}
