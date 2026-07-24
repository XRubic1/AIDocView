/**
 * Credyx admin Assistant data — chase / aging from live collections queue.
 * Chat replies remain keyword-based (not an LLM).
 */

import type {
  AssistantActionItem,
  AssistantCalendarEvent,
  AssistantMessage,
} from '../types/assistant'
import type { Invoice } from '../types/invoice'
import type { Broker } from '../types/broker'
import { mockInvoices } from './mockInvoices'
import { mockBrokers } from './mockBrokers'
import type { SharedCalendarEvent } from './sharedCalendarEvents'
import {
  deriveAdminCalendarEvents,
  deriveAdminChaseAsSharedEvents,
  deriveAdminDueTodayActions,
  deriveAdminDueTodayCount,
} from '../utils/deriveAdminCalendarEvents'
import {
  buildPageOfferLine,
  type AssistantPageHelp,
} from '../utils/assistantPageContext'

function resolveInvoices(invoices?: Invoice[]): Invoice[] {
  return invoices?.length ? invoices : mockInvoices
}

function resolveBrokers(brokers?: Broker[]): Broker[] {
  return brokers?.length ? brokers : mockBrokers
}

/** Admin tasks due today (payment checks, invoice reviews) from live chase. */
export function getMockAdminDueTodayActions(
  invoices?: Invoice[],
  brokers?: Broker[]
): AssistantActionItem[] {
  return deriveAdminDueTodayActions(resolveInvoices(invoices), resolveBrokers(brokers))
}

/** Quiet greeting for Credyx staff. */
export function getAdminQuietGreetingMessage(
  invoices?: Invoice[],
  brokers?: Broker[],
  /** Page the user opened the buddy from — tailors the offer and the "Try" list. */
  pageHelp?: AssistantPageHelp | null
): AssistantMessage {
  const due = getMockAdminDueTodayActions(invoices, brokers).filter(
    (a) => a.status === 'pending'
  )
  const dueLine =
    due.length === 0
      ? "You're clear today. No payment checks or aging reviews queued."
      : `${due.length} Credyx task${due.length === 1 ? '' : 's'} need you today — payment status checks and invoice follow-ups are on the calendar.`

  const offerLine = buildPageOfferLine(pageHelp ?? null)
  const tryList = pageHelp?.chips?.length
    ? `\n\nTry:\n${pageHelp.chips
        .slice(0, 4)
        .map((c) => `- ${c}`)
        .join('\n')}`
    : ''

  return {
    id: 'admin-msg-quiet',
    role: 'assistant',
    kind: 'quiet',
    createdAt: new Date().toISOString(),
    text: offerLine ? `${offerLine}\n\n${dueLine}${tryList}` : `${dueLine}${tryList}`,
  }
}

export const ADMIN_ASSISTANT_SUGGESTED_CHIPS = [
  "What's due today?",
  'Open collections',
  'Open payment posting',
  'Draft email to client about holds',
  'Show aging follow-ups',
] as const

/** Credyx chase / ops calendar events from live A/R. */
export function getMockAdminCalendarEvents(
  invoices?: Invoice[],
  brokers?: Broker[]
): AssistantCalendarEvent[] {
  return deriveAdminCalendarEvents(resolveInvoices(invoices), resolveBrokers(brokers))
}

/** Map chase events into shared-calendar shape for the admin month grid. */
export function getMockAdminChaseAsSharedEvents(
  invoices?: Invoice[],
  brokers?: Broker[]
): SharedCalendarEvent[] {
  return deriveAdminChaseAsSharedEvents(resolveInvoices(invoices), resolveBrokers(brokers))
}

/** FAB badge — pending Credyx tasks due today. */
export function getMockAdminDueTodayCount(
  invoices?: Invoice[],
  brokers?: Broker[]
): number {
  return deriveAdminDueTodayCount(resolveInvoices(invoices), resolveBrokers(brokers))
}

let messageSeq = 0
function nextMsgId(): string {
  messageSeq += 1
  return `admin-msg-${Date.now()}-${messageSeq}`
}

/** Keyword replies for Credyx staff Assistant. */
export function buildMockAdminAssistantReplies(
  prompt: string,
  actionState: AssistantActionItem[]
): AssistantMessage[] {
  const q = prompt.trim().toLowerCase()
  const now = new Date().toISOString()

  if (
    q.includes('due today') ||
    q.includes("what's due") ||
    q.includes('whats due') ||
    q.includes('need me') ||
    q.includes('payment check') ||
    q.includes('aging')
  ) {
    const pending = actionState.filter((a) => a.status === 'pending')
    if (pending.length === 0) {
      return [
        {
          id: nextMsgId(),
          role: 'assistant',
          kind: 'quiet',
          createdAt: now,
          text: 'Nothing needs you today. Payment checks and aging reviews are clear.',
        },
      ]
    }
    return [
      {
        id: nextMsgId(),
        role: 'assistant',
        kind: 'plain',
        createdAt: now,
        text: `${pending.length} Credyx task${pending.length === 1 ? '' : 's'} for today:`,
      },
      {
        id: nextMsgId(),
        role: 'assistant',
        kind: 'action',
        createdAt: now,
        actions: pending,
      },
    ]
  }

  if (q.includes('hold') || q.includes('held')) {
    return [
      {
        id: nextMsgId(),
        role: 'assistant',
        kind: 'plain',
        createdAt: now,
        text: 'Ask me about a carrier’s held invoices, or “What’s due today?” for chase tasks. I can also draft an email to the carrier about holds.',
      },
    ]
  }

  return [
    {
      id: nextMsgId(),
      role: 'assistant',
      kind: 'plain',
      createdAt: now,
      text: 'I can queue payment status checks, aging follow-ups, and AP calls from live collections. Ask “What’s due today?” or open the calendar.',
    },
  ]
}

export function createAdminUserMessage(text: string): AssistantMessage {
  return {
    id: nextMsgId(),
    role: 'user',
    kind: 'plain',
    createdAt: new Date().toISOString(),
    text: text.trim(),
  }
}
