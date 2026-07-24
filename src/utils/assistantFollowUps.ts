/**
 * Default / enriched follow-ups and email-scope options for the Assistant.
 *
 * Follow-ups must match what the user just asked — never dump a generic
 * “Open payments / Open invoices” set after an A/R summary.
 */

import type {
  AssistantEmailScopeOption,
  AssistantFollowUp,
  AssistantMessage,
} from '../types/assistant'
import type { Invoice } from '../types/invoice'
import { isArSummaryQuery } from './assistantArSummary'

/** Client portal vs Credyx staff — mirrors AssistantChatMode. */
type FollowUpMode = 'client' | 'admin'

function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function isHoldQuery(prompt: string): boolean {
  return /\b(hold|held|on hold)\b/i.test(prompt) && !isMissingDocsQuery(prompt)
}

/** Missing paperwork / upload asks. */
export function isMissingDocsQuery(prompt: string): boolean {
  return /\b(missing\s+docs?(?:uments?)?|missing\s+paper(?:work)?|upload\s+(?:a\s+|the\s+)?(?:pod|bol|docs?)|need(?:s)?\s+docs?|paperwork|what\s+docs?)\b/i.test(
    prompt
  )
}

function isAgingQuery(prompt: string): boolean {
  return /\b(aging|past\s*due|overdue|collections?)\b/i.test(prompt) && !isArSummaryQuery(prompt)
}

function heldInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.filter(
    (inv) =>
      inv.status === 'hold' ||
      Boolean(inv.hold_reason?.trim()) ||
      (inv.documents_count === 0 && inv.status === 'pending')
  )
}

/** Dedupe by label (case-insensitive) and prefer earlier entries. */
function dedupeFollowUps(items: AssistantFollowUp[], limit = 3): AssistantFollowUp[] {
  const seen = new Set<string>()
  const out: AssistantFollowUp[] = []
  for (const item of items) {
    const key = item.label.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    // Drop “open X screen” chips — they rarely deepen the answer.
    if (item.action === 'app_nav' && /^open\b/i.test(item.label)) continue
    // Drop chips that just restate the upload action already on the cards.
    if (/^upload\b/i.test(item.label)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

/** Follow-ups after a missing-docs / upload list. */
export function buildMissingDocsFollowUps(mode: FollowUpMode): AssistantFollowUp[] {
  return [
    {
      id: nextId('fu'),
      label: 'Why are they on hold?',
      prompt:
        mode === 'admin'
          ? 'Why are these invoices on hold? Explain each hold reason.'
          : 'Why are my invoices on hold? Explain each hold reason.',
      action: 'prompt',
    },
    {
      id: nextId('fu'),
      label: 'Draft email about holds',
      action: 'email_scope',
    },
    {
      id: nextId('fu'),
      label: 'Add a note on one',
      action: 'note_scope',
    },
  ]
}

/** Follow-ups when the user asked about holds. */
export function buildHoldFollowUps(mode: FollowUpMode): AssistantFollowUp[] {
  return [
    {
      id: nextId('fu'),
      label: 'Why are they on hold?',
      prompt:
        mode === 'admin'
          ? 'Why are these invoices on hold? Explain each hold reason.'
          : 'Why are my invoices on hold? Explain each hold reason.',
      action: 'prompt',
    },
    {
      id: nextId('fu'),
      label: 'Draft email about holds',
      action: 'email_scope',
    },
    {
      id: nextId('fu'),
      label: 'Add a note on one',
      action: 'note_scope',
    },
  ]
}

/** Follow-ups after an A/R overview — invoice lists are separate questions. */
export function buildArSummaryFollowUps(
  mode: FollowUpMode,
  _replyText: string
): AssistantFollowUp[] {
  return [
    {
      id: nextId('fu'),
      label: "What's still open?",
      prompt:
        mode === 'admin'
          ? 'List the open invoices with amounts and status.'
          : "What's still open in my A/R? List the invoices.",
      action: 'prompt',
    },
    {
      id: nextId('fu'),
      label: "What's on hold?",
      prompt: "What's on hold?",
      action: 'prompt',
    },
    {
      id: nextId('fu'),
      label: "What's past due?",
      prompt:
        mode === 'admin'
          ? 'Which invoices are past due and by how many days?'
          : 'Which of my invoices are past due?',
      action: 'prompt',
    },
  ]
}

/** Follow-ups after aging / past-due answers. */
export function buildAgingFollowUps(mode: FollowUpMode): AssistantFollowUp[] {
  return [
    {
      id: nextId('fu'),
      label: 'Who is most overdue?',
      prompt:
        mode === 'admin'
          ? 'Which invoices or clients are most overdue?'
          : 'Which of my invoices are most overdue?',
      action: 'prompt',
    },
    {
      id: nextId('fu'),
      label: 'Draft a chase email',
      action: 'email_scope',
    },
    {
      id: nextId('fu'),
      label: "What's on hold?",
      prompt: "What's on hold?",
      action: 'prompt',
    },
  ]
}

/** Attach follow-ups to the last assistant message in a reply batch. */
export function attachFollowUps(
  messages: AssistantMessage[],
  followUps: AssistantFollowUp[]
): AssistantMessage[] {
  if (!messages.length || !followUps.length) return messages
  const last = messages[messages.length - 1]
  return [...messages.slice(0, -1), { ...last, followUps }]
}

/** Clear stale follow-ups / scope pickers when the user sends a new message. */
export function clearInteractiveFollowUps(messages: AssistantMessage[]): AssistantMessage[] {
  return messages
    .filter((m) => m.kind !== 'followup_picker')
    .map((m) => (m.followUps?.length ? { ...m, followUps: undefined } : m))
}

/** Generic useful follow-ups when the model didn't supply any. */
export function buildGenericFollowUps(prompt: string, mode: FollowUpMode): AssistantFollowUp[] {
  if (isMissingDocsQuery(prompt)) return buildMissingDocsFollowUps(mode)
  if (isHoldQuery(prompt)) return buildHoldFollowUps(mode)
  if (isArSummaryQuery(prompt)) return buildArSummaryFollowUps(mode, '')
  if (isAgingQuery(prompt)) return buildAgingFollowUps(mode)
  if (/\b(paid|payment|revenue|loads)\b/i.test(prompt)) {
    return [
      {
        id: nextId('fu'),
        label: "What's still open?",
        prompt: "What's still open in my A/R?",
        action: 'prompt',
      },
      {
        id: nextId('fu'),
        label: "What's on hold?",
        prompt: "What's on hold?",
        action: 'prompt',
      },
    ]
  }
  return [
    {
      id: nextId('fu'),
      label: "What's on hold?",
      prompt: "What's on hold?",
      action: 'prompt',
    },
    {
      id: nextId('fu'),
      label: 'What needs my attention?',
      prompt: 'What needs my attention?',
      action: 'prompt',
    },
  ]
}

/**
 * Scope options for posting a note on one invoice (open / held first).
 */
export function buildNoteScopeOptions(
  invoices: Invoice[],
  mode: FollowUpMode
): AssistantEmailScopeOption[] {
  const held = heldInvoices(invoices)
  const open = invoices.filter(
    (inv) =>
      inv.status !== 'paid' &&
      inv.status !== 'force_closed' &&
      inv.status !== 'written_off'
  )
  const pool = held.length > 0 ? held : open
  const options: AssistantEmailScopeOption[] = []

  const who =
    mode === 'admin'
      ? 'Post a Credyx note'
      : 'Post a note (carrier-visible to Credyx)'

  for (const inv of pool.slice(0, 14)) {
    const reason = inv.hold_reason?.trim()
    options.push({
      id: `note-inv-${inv.id}`,
      label: `#${inv.invoice_number} · ${inv.broker_name}${
        reason ? ` · ${reason.slice(0, 40)}` : ''
      }`,
      prompt: `${who} on invoice #${inv.invoice_number} (id ${inv.id}). Draft a short factual note about the current hold/status and what we need next.`,
    })
  }

  if (options.length === 0) {
    options.push({
      id: 'note-none',
      label: 'No open invoices — ask me which one',
      prompt: 'I want to add a note to an invoice. Ask me which invoice number.',
    })
  }

  return options
}

/**
 * Scope options for drafting a hold/contact email:
 * all holds, each invoice, each broker with holds.
 */
export function buildHoldEmailScopeOptions(
  invoices: Invoice[],
  mode: FollowUpMode
): AssistantEmailScopeOption[] {
  const held = heldInvoices(invoices)
  const options: AssistantEmailScopeOption[] = []

  const audience =
    mode === 'admin'
      ? 'the carrier (client) about held invoices'
      : 'Credyx about my held invoices'

  if (held.length > 0) {
    options.push({
      id: 'scope-all-holds',
      label: `All held invoices (${held.length})`,
      prompt: `Draft an email to ${audience}. Include every held invoice with amounts, brokers, and hold reasons.`,
    })
  }

  const brokers = [...new Set(held.map((i) => i.broker_name).filter(Boolean))]
  for (const broker of brokers.slice(0, 8)) {
    const count = held.filter((i) => i.broker_name === broker).length
    options.push({
      id: `scope-broker-${broker}`,
      label: `${broker} (${count})`,
      prompt: `Draft an email to ${audience} only for held invoices with broker ${broker}. Include invoice #s, amounts, and hold reasons.`,
    })
  }

  for (const inv of held.slice(0, 12)) {
    options.push({
      id: `scope-inv-${inv.id}`,
      label: `#${inv.invoice_number} · ${inv.broker_name}`,
      prompt: `Draft an email to ${audience} for invoice #${inv.invoice_number} (load ${inv.load_number || 'n/a'}). Explain why it's on hold and what we need.`,
    })
  }

  if (options.length === 0) {
    options.push({
      id: 'scope-none',
      label: 'No holds found — draft a general note',
      prompt: `Draft a short email to ${audience} asking for help reviewing my open invoices.`,
    })
  }

  return options
}

/**
 * Merge model follow-ups with intent-aware defaults.
 * Prefer the user's question over casual “on hold” wording in the reply.
 */
export function enrichFollowUps(
  prompt: string,
  mode: FollowUpMode,
  fromModel: AssistantFollowUp[] | undefined,
  replyText: string
): AssistantFollowUp[] {
  const model = fromModel?.filter((f) => f.label.trim()) ?? []

  // Missing docs — deepen with why/email/note, never “Upload missing docs” again.
  if (isMissingDocsQuery(prompt)) {
    return dedupeFollowUps([...model, ...buildMissingDocsFollowUps(mode)], 3)
  }

  // A/R / open summary — never force hold chips just because totals mention holds.
  if (isArSummaryQuery(prompt)) {
    return dedupeFollowUps([...model, ...buildArSummaryFollowUps(mode, replyText)], 3)
  }

  if (isAgingQuery(prompt) && !isHoldQuery(prompt)) {
    return dedupeFollowUps([...model, ...buildAgingFollowUps(mode)], 3)
  }

  // Explicit hold questions (or a hold-focused answer without being an A/R dump).
  const aboutHolds = isHoldQuery(prompt)
  if (aboutHolds) {
    const defaults = buildHoldFollowUps(mode)
    return dedupeFollowUps([...model, ...defaults], 3)
  }

  if (model.length > 0) return dedupeFollowUps(model, 3)
  return dedupeFollowUps(buildGenericFollowUps(prompt, mode), 3)
}
