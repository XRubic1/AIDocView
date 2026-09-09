/**
 * Page-aware Assistant help.
 *
 * Maps the current route to what the buddy can do *right here* — used for the
 * proactive FAB nudge ("Hey, I can help with held invoices"), the greeting
 * inside the chat, page-specific composer chips, and AI grounding context.
 */

export type AssistantPageMode = 'client' | 'admin'

export interface AssistantPageHelp {
  id: string
  mode: AssistantPageMode
  /** Route prefixes for this page — longest match wins. */
  paths: string[]
  /** Human page name, e.g. "Invoices". */
  title: string
  /** Short capability line: "held invoices, missing docs, and payment status". */
  offer: string
  /** One-line proactive nudge shown next to the floating buddy. */
  nudge: string
  /** Composer chips tailored to this page (most useful first). */
  chips: string[]
}

const CLIENT_PAGES: AssistantPageHelp[] = [
  {
    id: 'client-invoices',
    mode: 'client',
    paths: ['/client/invoices'],
    title: 'Invoices',
    offer: 'held invoices, missing documents, notes, and disputes',
    nudge: 'I can help with held invoices, missing docs, or posting a note.',
    chips: [
      "What's on hold?",
      'Which invoices are missing documents?',
      'Add a note on a held invoice',
      'Open a dispute on an invoice',
    ],
  },
  {
    id: 'client-attention',
    mode: 'client',
    paths: ['/client/invoices/needattention', '/client/attention'],
    title: 'Needs attention',
    offer: 'uploading paperwork Credyx asked for on held loads',
    nudge: 'I can help you upload the documents for a held invoice.',
    chips: [
      'Which invoices need documents?',
      'How do I upload paperwork?',
    ],
  },
  {
    id: 'client-payments',
    mode: 'client',
    paths: ['/client/payments'],
    title: 'Payments',
    offer: 'payment status, balances due, reversals, and disputes',
    nudge: 'I can explain any payment — reversals, short pays, balance due.',
    chips: [
      'Payment status for my open invoices',
      'Did I get paid last week?',
      'Why was a payment reversed?',
      'Open a dispute on an invoice',
    ],
  },
  {
    id: 'client-short-payments',
    mode: 'client',
    paths: ['/client/short-payments'],
    title: 'Pay variances',
    offer: 'short pays, overpayments, and write-off requests',
    nudge: 'I can break down any short pay or write-off request.',
    chips: [
      'Which invoices were short paid?',
      'Explain this short pay',
      'Draft email to Credyx about a short pay',
    ],
  },
  {
    id: 'client-batches',
    mode: 'client',
    paths: ['/client/batches'],
    title: 'Batches',
    offer: 'building batches, required paperwork, and submission status',
    nudge: 'I can help you build a batch or check what paperwork is missing.',
    chips: [
      'Create a batch',
      'What documents do I still need?',
      'What needs my attention?',
    ],
  },
  {
    id: 'client-collections',
    mode: 'client',
    paths: ['/client/collections'],
    title: 'Collections',
    offer: 'how invoices are performing, what’s past due, and what Credyx is working on',
    nudge: 'I can explain how an invoice is performing and what’s next.',
    chips: [
      'What needs attention?',
      'What’s past due?',
      'What is Credyx working on?',
    ],
  },
  {
    id: 'client-aging',
    mode: 'client',
    paths: ['/client/aging-ar'],
    title: 'Aging A/R',
    offer: 'aging buckets and open balance by age',
    nudge: 'I can show what’s past due and draft a chase email.',
    chips: [
      'What is past due?',
      'Show my aging buckets',
      'Draft email to Credyx about overdue invoices',
    ],
  },
  {
    id: 'client-brokers',
    mode: 'client',
    paths: ['/client/brokers'],
    title: 'Brokers',
    offer: 'broker risk, MC lookups, and who owes you the most',
    nudge: 'I can check a broker’s MC#, risk, and open balance.',
    chips: ['Check MC#', 'Which broker owes me the most?', 'Any risky brokers?'],
  },
  {
    id: 'client-documents',
    mode: 'client',
    paths: ['/client/documents'],
    title: 'Documents',
    offer: 'finding paperwork and spotting missing BOLs or PODs',
    nudge: 'I can find paperwork or tell you which docs are missing.',
    chips: ['Which invoices are missing documents?', "What's on hold?"],
  },
  {
    id: 'client-reports',
    mode: 'client',
    paths: ['/client/reports'],
    title: 'Reports',
    offer: 'revenue, A/R trends, and what the numbers mean',
    nudge: 'I can explain any number on this page.',
    chips: ['Summarize my A/R', 'How much did I invoice this month?'],
  },
  {
    id: 'client-settings',
    mode: 'client',
    paths: ['/client/settings'],
    title: 'Settings',
    offer: 'company details, users, and notification preferences',
    nudge: 'Ask me where a setting lives and I’ll take you there.',
    chips: ['Where do I change notifications?', 'Open my payments'],
  },
  {
    id: 'client-dashboard',
    mode: 'client',
    paths: ['/client/dashboard', '/client/dashboard-v2', '/client'],
    title: 'Dashboard',
    offer: 'what needs you today, holds, and expected payments',
    nudge: 'I can tell you what needs you today.',
    chips: ["What's on hold?", 'What needs my attention?', 'Open my payments'],
  },
]

const ADMIN_PAGES: AssistantPageHelp[] = [
  {
    id: 'admin-invoices',
    mode: 'admin',
    paths: ['/invoices'],
    title: 'Invoices',
    offer: 'holds, missing docs, notes, and write-off requests',
    nudge: 'I can help with held invoices, notes, or write-offs.',
    chips: [
      "What's on hold?",
      'Which invoices are missing documents?',
      'Add a note on a held invoice',
      'Draft email to client about holds',
    ],
  },
  {
    id: 'admin-payment-posting',
    mode: 'admin',
    paths: ['/payment-posting'],
    title: 'Payment posting',
    offer: 'payment status, reversals, short pays, and confirmations',
    nudge: 'I can explain any payment — reversals, short pays, balance due.',
    chips: [
      'Payment status for open invoices',
      'Any reversed payments?',
      'Which payments are awaiting confirmation?',
    ],
  },
  {
    id: 'admin-collections',
    mode: 'admin',
    paths: ['/collections'],
    title: 'Collections',
    offer: 'chase lists, past-due balances, and follow-up emails',
    nudge: 'I can build today’s chase list and draft the emails.',
    chips: [
      "What's due today?",
      'Show aging follow-ups',
      'Draft email to client about holds',
    ],
  },
  {
    id: 'admin-aging',
    mode: 'admin',
    paths: ['/aging-ar'],
    title: 'Aging A/R',
    offer: 'aging buckets, worst offenders, and chase priorities',
    nudge: 'I can rank what to chase first.',
    chips: ['Show aging follow-ups', 'Who is most past due?'],
  },
  {
    id: 'admin-broker-risk',
    mode: 'admin',
    paths: ['/admin/broker-risk'],
    title: 'Broker Risk',
    offer: 'review queue, payment timing vs Net, and month-over-month broker pay history',
    nudge: 'I can show which brokers are paying slower this quarter.',
    chips: [
      'Which brokers need review?',
      'Who is paying slower this quarter?',
      'Show payment history for a broker',
    ],
  },
  {
    id: 'admin-batches',
    mode: 'admin',
    paths: ['/batches'],
    title: 'Batches',
    offer: 'the review queue and what is blocking a batch',
    nudge: 'I can tell you what’s blocking a batch.',
    chips: ['Create a batch', "What's due today?"],
  },
  {
    id: 'admin-brokers',
    mode: 'admin',
    paths: ['/brokers'],
    title: 'Brokers',
    offer: 'broker risk, MC lookups, and exposure by broker',
    nudge: 'I can check a broker’s MC#, risk, and exposure.',
    chips: ['Check MC#', 'Which broker owes the most?'],
  },
  {
    id: 'admin-clients',
    mode: 'admin',
    paths: ['/clients'],
    title: 'Clients',
    offer: 'carrier A/R summaries and account health',
    nudge: 'I can summarize any carrier’s A/R.',
    chips: ['Summarize this client’s A/R', "What's on hold?"],
  },
  {
    id: 'admin-docs',
    mode: 'admin',
    paths: ['/docs', '/engine'],
    title: 'Documents',
    offer: 'missing paperwork and document review blockers',
    nudge: 'I can find which invoices are missing paperwork.',
    chips: ['Which invoices are missing documents?', "What's on hold?"],
  },
  {
    id: 'admin-dashboard',
    mode: 'admin',
    paths: ['/admin/dashboard', '/dashboard'],
    title: 'Dashboard',
    offer: 'today’s queue, aging, and payment checks',
    nudge: 'I can tell you what needs Credyx today.',
    chips: ["What's due today?", 'Open collections', 'Open payment posting'],
  },
]

/** Page help for a route — longest matching prefix wins. */
export function getAssistantPageHelp(
  pathname: string,
  mode: AssistantPageMode
): AssistantPageHelp | null {
  const pages = mode === 'admin' ? ADMIN_PAGES : CLIENT_PAGES
  let best: { help: AssistantPageHelp; length: number } | null = null

  for (const help of pages) {
    for (const path of help.paths) {
      const isMatch = pathname === path || pathname.startsWith(`${path}/`)
      if (!isMatch) continue
      if (!best || path.length > best.length) best = { help, length: path.length }
    }
  }

  return best?.help ?? null
}

/** Greeting line offering page-specific help, e.g. for the chat intro. */
export function buildPageOfferLine(help: AssistantPageHelp | null): string | null {
  if (!help) return null
  return `You're on **${help.title}** — I can help with ${help.offer}.`
}

/** Page chips first, then generic fallbacks, deduped and capped. */
export function mergePageChips(
  help: AssistantPageHelp | null,
  fallback: readonly string[],
  limit = 6
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const chip of [...(help?.chips ?? []), ...fallback]) {
    const key = chip.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(chip)
    if (out.length >= limit) break
  }
  return out
}
