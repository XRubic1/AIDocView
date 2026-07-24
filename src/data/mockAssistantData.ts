/**
 * Carrier Assistant data layer — calendar + due-today from live invoices/payments.
 * Chat replies remain keyword-based (not an LLM).
 */

import type {
  AssistantActionItem,
  AssistantCalendarEvent,
  AssistantCalendarFilter,
  AssistantMessage,
  AssistantRiskPayload,
} from '../types/assistant'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import {
  deriveClientCalendarEvents,
  deriveClientDueTodayActions,
  deriveClientDueTodayCount,
} from '../utils/deriveClientCalendarEvents'
import {
  buildPageOfferLine,
  type AssistantPageHelp,
} from '../utils/assistantPageContext'
import {
  buildArSummarySnapshot,
  isArSummaryQuery,
  isOpenInvoiceListQuery,
} from '../utils/assistantArSummary'
import { deriveHoldExplanation } from '../utils/assistantHoldExplanation'

/** Format a date as YYYY-MM-DD in local time. */
function daysFromNow(offset: number): Date {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Demo risk card kept for keyword “broker risk” / MC queries until a live risk API exists. */
const MOCK_RISK_TQL: AssistantRiskPayload = {
  brokerName: 'TQL',
  mcNumber: 'MC-123456',
  riskLevel: 'medium',
  confidence: 'high',
  analyzedAtLabel: 'Sun, Mar 15 2026',
  invoiceCount: 60,
  notesRecencyLabel: '8 days ago',
  bullets: [
    'Avg payment: 31 days (was 24 days two months ago)',
    '5 invoices required follow-up · 2 documentation disputes · 0 non-payment',
    'Dispute rate 3% → 7% MoM',
  ],
  recommendation:
    'Broker appears stable but payment performance has declined over the last two months.',
  ageCaveat:
    'Older notes (3+ months) are weighted less — recent invoices may already reflect improvement.',
}

/** Carrier due-today actions (missing docs) from live A/R. */
export function getMockDueTodayActions(
  invoices: Invoice[] = [],
  payments: Payment[] = []
): AssistantActionItem[] {
  return deriveClientDueTodayActions(invoices, payments)
}

/** Quiet-morning / welcome greeting used as initial assistant message. */
export function getQuietGreetingMessage(
  invoices: Invoice[] = [],
  payments: Payment[] = [],
  clientName?: string,
  /** Page the user opened the buddy from — tailors the offer and the "Try" list. */
  pageHelp?: AssistantPageHelp | null
): AssistantMessage {
  const due = getMockDueTodayActions(invoices, payments).filter((a) => a.status === 'pending')
  const name = clientName?.trim() || 'there'
  const dueLine =
    due.length > 0
      ? `\n\nRight now: **${due.length}** thing${due.length === 1 ? '' : 's'} need you today.`
      : `\n\nYou're clear on uploads today — still ask me anything.`

  const offerLine = buildPageOfferLine(pageHelp ?? null)
  const intro = offerLine
    ? `${offerLine} Or tell me where to take you (batches, payments, brokers…).`
    : "I'm your Credyx buddy — ask me anything about your company, or tell me where to take you (batches, payments, brokers…)."

  const tryList = (
    pageHelp?.chips?.length
      ? pageHelp.chips
      : ["What's on hold?", 'Open my payments', 'Create a batch', 'Check MC#']
  )
    .slice(0, 4)
    .map((c) => `- ${c}`)
    .join('\n')

  return {
    id: 'msg-quiet',
    role: 'assistant',
    kind: 'quiet',
    createdAt: new Date().toISOString(),
    text: `Hey ${name} 👋

${intro}${dueLine}

Try:
${tryList}

Or tap a chip below.`,
  }
}

/** Suggested composer chips — carrier portal. */
export const ASSISTANT_SUGGESTED_CHIPS = [
  "What's on hold?",
  'What needs my attention?',
  'Payment status for my open invoices',
  'Add a note on a held invoice',
  'Open my payments',
  'Create a batch',
  'Draft email to Credyx about my holds',
] as const

/** Carrier calendar from live invoices + payments (no invented seeds). */
export function getMockCalendarEvents(
  invoices: Invoice[] = [],
  payments: Payment[] = []
): AssistantCalendarEvent[] {
  return deriveClientCalendarEvents(invoices, payments)
}

/** Count of pending carrier tasks due today (FAB badge) — missing docs only. */
export function getMockDueTodayCount(
  invoices: Invoice[] = [],
  payments: Payment[] = []
): number {
  return deriveClientDueTodayCount(invoices, payments)
}

/** Filter calendar events for carrier agenda UI. */
export function filterMockCalendarEvents(
  events: AssistantCalendarEvent[],
  filter: AssistantCalendarFilter
): AssistantCalendarEvent[] {
  if (filter === 'all') return events
  if (filter === 'expected') {
    return events.filter(
      (e) => e.type === 'expected_payment' || e.type === 'payment_posted'
    )
  }
  if (filter === 'my_tasks') {
    return events.filter(
      (e) =>
        e.type === 'paperwork_check' ||
        e.type === 'meeting' ||
        (e.type === 'reminder' && (e.owner === 'user' || e.owner === 'credyx_staff'))
    )
  }
  // needs_me — pending docs uploads + meetings/reminders for the carrier
  return events.filter(
    (e) =>
      e.status === 'pending' &&
      (e.type === 'paperwork_check' ||
        e.type === 'meeting' ||
        (e.type === 'reminder' && (e.owner === 'user' || e.owner === 'credyx_staff')))
  )
}

let messageSeq = 0
function nextMsgId(): string {
  messageSeq += 1
  return `msg-${Date.now()}-${messageSeq}`
}

function extractInvoiceNumber(prompt: string): string | null {
  const hash = prompt.match(/#?\s*(\d{3,})/)
  if (hash) return hash[1]
  const inv = prompt.match(/invoice\s+#?\s*(\d+)/i)
  if (inv) return inv[1]
  return null
}

/**
 * Keyword replies — not an LLM.
 * Uses live calendar when answering due-today / expected-pay questions.
 */
export function buildMockAssistantReplies(
  prompt: string,
  actionState: AssistantActionItem[],
  context?: { invoices: Invoice[]; payments: Payment[] }
): AssistantMessage[] {
  const q = prompt.trim().toLowerCase()
  const now = new Date().toISOString()
  const invoices = context?.invoices ?? []
  const payments = context?.payments ?? []
  const calendar = deriveClientCalendarEvents(invoices, payments)

  if (
    q.includes('due today') ||
    q.includes("what's due") ||
    q.includes('whats due') ||
    q.includes('need me') ||
    q.includes('missing doc') ||
    q.includes('missing paper') ||
    q.includes('upload pod') ||
    q.includes('paperwork')
  ) {
    const pending = actionState.filter((a) => a.status === 'pending')
    if (pending.length === 0) {
      return [
        {
          id: nextMsgId(),
          role: 'assistant',
          kind: 'quiet',
          createdAt: now,
          text: 'Nothing needs you today — no missing paperwork on open invoices.',
        },
      ]
    }
    return [
      {
        id: nextMsgId(),
        role: 'assistant',
        kind: 'action',
        createdAt: now,
        text:
          pending.length === 1
            ? '**1** invoice needs documents — tap Upload:'
            : `**${pending.length}** invoices need documents — tap Upload on each:`,
        actions: pending,
      },
    ]
  }

  if (
    q.includes('mc-123456') ||
    q.includes('medium risk') ||
    q.includes('broker risk') ||
    q.includes('tql risk') ||
    (q.includes('why') && q.includes('risk'))
  ) {
    return [
      {
        id: nextMsgId(),
        role: 'assistant',
        kind: 'plain',
        createdAt: now,
        text: 'Their average payment time rose from 24 to 31 days over the last two months, with 2 documentation disputes. No reports of non-payment.',
      },
      {
        id: nextMsgId(),
        role: 'assistant',
        kind: 'risk',
        createdAt: now,
        risk: MOCK_RISK_TQL,
      },
    ]
  }

  if (q.includes('pay') || q.includes('expected') || extractInvoiceNumber(q)) {
    const invNum = extractInvoiceNumber(q)
    const match = invNum
      ? calendar.find(
          (e) =>
            e.type === 'expected_payment' &&
            e.invoiceNumber.replace(/^#/, '') === invNum
        )
      : calendar.find((e) => e.type === 'expected_payment' && e.status === 'pending')

    if (match) {
      return [
        {
          id: nextMsgId(),
          role: 'assistant',
          kind: 'expected_payment',
          createdAt: now,
          expectedPayment: {
            invoiceNumber: match.invoiceNumber,
            invoiceId: match.invoiceId,
            brokerName: match.brokerName,
            dateLabel: match.dueLabel,
            confidence: 'medium',
            source: 'forecast',
          },
          text: match.detail,
        },
      ]
    }

    return [
      {
        id: nextMsgId(),
        role: 'assistant',
        kind: 'quiet',
        createdAt: now,
        text: invNum
          ? `I don’t see an expected payment date for invoice #${invNum} yet.`
          : 'No expected payments on the calendar right now.',
      },
    ]
  }

  if (q.includes('clear') || q.includes('quiet') || q.includes('nothing')) {
    return [getQuietGreetingMessage(invoices, payments)]
  }

  // A/R overview — growth / projection / charts (not an invoice dump).
  if (isArSummaryQuery(q)) {
    const snap = buildArSummarySnapshot(invoices, payments)
    return [
      {
        id: nextMsgId(),
        role: 'assistant',
        kind: 'ar_summary',
        createdAt: now,
        arSummary: {
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
        },
      },
    ]
  }

  // Explicit open-invoice list (separate from the A/R overview).
  if (isOpenInvoiceListQuery(q) || /\bwhat('s| is) (still )?open\b/.test(q)) {
    const open = invoices.filter(
      (inv) =>
        inv.status !== 'paid' &&
        inv.status !== 'written_off' &&
        inv.status !== 'force_closed'
    )
    const money = (n: number) =>
      `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    const statusLabel = (inv: Invoice) => {
      if (inv.status === 'hold' || inv.hold_reason) return 'On hold'
      if (inv.status === 'approved') return 'Approved'
      if (inv.status === 'pending') return 'Pending'
      return inv.status.replace(/_/g, ' ')
    }
    const openTotal = open.reduce((s, inv) => s + Number(inv.amount || 0), 0)
    const rows = [...open]
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      .slice(0, 8)
      .map(
        (inv) =>
          `- **${inv.invoice_number}** · ${money(Number(inv.amount || 0))} · ${statusLabel(inv)} · ${inv.broker_name}`
      )
      .join('\n')
    const more = open.length > 8 ? `\n- +${open.length - 8} more` : ''
    return [
      {
        id: nextMsgId(),
        role: 'assistant',
        kind: 'plain',
        createdAt: now,
        text: `**${money(openTotal)}** open · ${open.length} invoice${open.length === 1 ? '' : 's'}\n\n${rows}${more}`,
      },
    ]
  }

  if (q.includes('hold') || q.includes('held')) {
    const held = invoices.filter(
      (inv) =>
        inv.status === 'hold' ||
        Boolean(inv.hold_reason?.trim()) ||
        (inv.documents_count === 0 && inv.status === 'pending')
    )
    if (held.length === 0) {
      return [
        {
          id: nextMsgId(),
          role: 'assistant',
          kind: 'quiet',
          createdAt: now,
          text: 'Nothing on hold right now.',
        },
      ]
    }
    const money = (n: number) =>
      `$${Number(n || 0).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`
    const wantWhy = /\b(why|reason|explain|each)\b/i.test(q)
    // Bare / labeled invoice # → answer only that invoice.
    const namedNums = [
      ...q.matchAll(/\b(?:invoice|inv)\s*#?\s*(\d{3,})\b/gi),
      ...q.matchAll(/#\s*(\d{3,})\b/g),
      ...q.matchAll(/\b(\d{3,})\b/g),
    ].map((m) => m[1])
    const focused =
      namedNums.length > 0
        ? held.find((inv) =>
            namedNums.some(
              (n) => String(inv.invoice_number).replace(/^#/, '') === n
            )
          )
        : undefined
    if (focused) {
      const hold = deriveHoldExplanation(focused, 'client')
      return [
        {
          id: nextMsgId(),
          role: 'assistant',
          kind: 'plain',
          createdAt: now,
          text: `**${focused.invoice_number}** · ${money(focused.amount)} · ${focused.broker_name}\n\n${hold.detail}`,
        },
      ]
    }
    const bullets = held
      .slice(0, 12)
      .map((inv) => {
        const hold = deriveHoldExplanation(inv, 'client')
        return wantWhy
          ? `- **${inv.invoice_number}** · ${money(inv.amount)} · ${inv.broker_name} — ${hold.detail}`
          : `- **${inv.invoice_number}** · ${money(inv.amount)} · ${inv.broker_name}`
      })
      .join('\n')
    return [
      {
        id: nextMsgId(),
        role: 'assistant',
        kind: 'plain',
        createdAt: now,
        text: wantWhy
          ? `**${held.length}** on hold — here’s why:\n\n${bullets}`
          : `**${held.length}** on hold:\n\n${bullets}`,
      },
    ]
  }

  return [
    {
      id: nextMsgId(),
      role: 'assistant',
      kind: 'plain',
      createdAt: now,
      text: 'I can help with what’s due today (missing docs), expected payment dates, or open the full Assistant for the calendar.',
    },
  ]
}

/** Create a user chat message. */
export function createUserMessage(text: string): AssistantMessage {
  return {
    id: nextMsgId(),
    role: 'user',
    kind: 'plain',
    createdAt: new Date().toISOString(),
    text: text.trim(),
  }
}

export { MOCK_RISK_TQL, formatShortDate, daysFromNow }
