/**
 * Catalog of in-app destinations the Assistant can open for the user.
 * The model may only pick these ids — never invent routes.
 */

import type { AssistantAppAction } from '../types/assistant'

export type AssistantAppMode = 'client' | 'admin'

export type AssistantCatalogEntry = {
  id: string
  label: string
  /** Short hint for the model + UI. */
  description: string
  path: string
  mode: AssistantAppMode
  /** Match user phrasing for offline / enrich heuristics. */
  keywords: string[]
}

const CLIENT_CATALOG: AssistantCatalogEntry[] = [
  {
    id: 'client-dashboard',
    label: 'Open dashboard',
    description: 'Company KPIs and overview',
    path: '/client/dashboard',
    mode: 'client',
    keywords: ['dashboard', 'home', 'overview', 'kpi'],
  },
  {
    id: 'client-batches',
    label: 'Open batches',
    description: 'Create or review document batches',
    path: '/client/batches',
    mode: 'client',
    keywords: ['batch', 'batches', 'submit packet', 'create batch', 'upload packet'],
  },
  {
    id: 'client-invoices',
    label: 'Open invoices',
    description: 'Browse and filter all invoices',
    path: '/client/invoices',
    mode: 'client',
    keywords: ['invoice', 'invoices', 'ar list', 'a/r'],
  },
  {
    id: 'client-payments',
    label: 'Open payments',
    description: 'Confirm, dispute, or review payments',
    path: '/client/payments',
    mode: 'client',
    keywords: ['payment', 'payments', 'paid', 'confirm payment', 'deposit'],
  },
  {
    id: 'client-short-payments',
    label: 'Open pay variances',
    description: 'Short pays and write-off requests',
    path: '/client/short-payments',
    mode: 'client',
    keywords: ['short pay', 'short-payment', 'variance', 'write-off', 'write off', 'underpaid'],
  },
  {
    id: 'client-collections',
    label: 'Open collections',
    description: 'Invoice performance: worked on, overdue, urgent',
    path: '/client/collections',
    mode: 'client',
    keywords: ['collections', 'chase', 'urgent', 'worked on', 'will pay'],
  },
  {
    id: 'client-aging',
    label: 'Open aging A/R',
    description: 'Aging buckets and open balance by age',
    path: '/client/aging-ar',
    mode: 'client',
    keywords: ['aging', 'past due', 'overdue', 'buckets'],
  },
  {
    id: 'client-brokers',
    label: 'Open brokers',
    description: 'Broker list, MC check, risk',
    path: '/client/brokers',
    mode: 'client',
    keywords: ['broker', 'brokers', 'mc', 'mc#', 'risk', 'factor'],
  },
  {
    id: 'client-mc-check',
    label: 'Open MC Check',
    description: 'Check a broker MC for credit, pay pace, authority, and insurance',
    path: '/client/brokers?tab=mc-check',
    mode: 'client',
    keywords: ['mc check', 'mc lookup', 'authority', 'safer', 'insurance lookup', 'credit check', 'paydex'],
  },
  {
    id: 'client-mc-logs',
    label: 'Open MC Logs',
    description: 'Brokers you checked and their status at the time',
    path: '/client/brokers?tab=mc-logs',
    mode: 'client',
    keywords: ['mc log', 'mc logs', 'review log', 'lookup history'],
  },
  {
    id: 'client-documents',
    label: 'Open document vault',
    description: 'Stored paperwork and files',
    path: '/client/documents',
    mode: 'client',
    keywords: ['document', 'documents', 'vault', 'pod', 'bol', 'paperwork files'],
  },
  {
    id: 'client-reports',
    label: 'Open reports',
    description: 'Revenue and A/R reports',
    path: '/client/reports',
    mode: 'client',
    keywords: ['report', 'reports', 'revenue report', 'analytics'],
  },
  {
    id: 'client-assistant',
    label: 'Open full Assistant',
    description: 'Full chat + calendar workspace',
    path: '/client/assistant',
    mode: 'client',
    keywords: ['calendar', 'full assistant', 'agenda', 'schedule'],
  },
  {
    id: 'client-settings',
    label: 'Open settings',
    description: 'Company and notification settings',
    path: '/client/settings',
    mode: 'client',
    keywords: ['settings', 'preferences', 'profile', 'notifications'],
  },
]

const ADMIN_CATALOG: AssistantCatalogEntry[] = [
  {
    id: 'admin-dashboard',
    label: 'Open dashboard',
    description: 'Credyx ops overview',
    path: '/admin/dashboard',
    mode: 'admin',
    keywords: ['dashboard', 'home', 'overview'],
  },
  {
    id: 'admin-batches',
    label: 'Open batches',
    description: 'Batch review queue',
    path: '/batches',
    mode: 'admin',
    keywords: ['batch', 'batches', 'packet'],
  },
  {
    id: 'admin-create-batch',
    label: 'Create a batch',
    description: 'Start a new batch',
    path: '/batches/create',
    mode: 'admin',
    keywords: ['create batch', 'new batch'],
  },
  {
    id: 'admin-invoices',
    label: 'Open invoices',
    description: 'Invoice search and list',
    path: '/invoices',
    mode: 'admin',
    keywords: ['invoice', 'invoices'],
  },
  {
    id: 'admin-aging',
    label: 'Open aging A/R',
    description: 'Aging receivables',
    path: '/aging-ar',
    mode: 'admin',
    keywords: ['aging', 'a/r', 'receivable'],
  },
  {
    id: 'admin-collections',
    label: 'Open collections',
    description: 'Collections workspace',
    path: '/collections',
    mode: 'admin',
    keywords: ['collections', 'chase', 'past due'],
  },
  {
    id: 'admin-payment-posting',
    label: 'Open payment posting',
    description: 'Post and approve payments',
    path: '/payment-posting',
    mode: 'admin',
    keywords: ['payment posting', 'post payment', 'payments', 'write-off'],
  },
  {
    id: 'admin-brokers',
    label: 'Open brokers',
    description: 'Broker directory',
    path: '/brokers',
    mode: 'admin',
    keywords: ['broker', 'brokers', 'mc'],
  },
  {
    id: 'admin-clients',
    label: 'Open clients',
    description: 'Carrier / client list',
    path: '/clients',
    mode: 'admin',
    keywords: ['client', 'clients', 'carrier'],
  },
  {
    id: 'admin-docs',
    label: 'Open docs',
    description: 'Document ops',
    path: '/docs',
    mode: 'admin',
    keywords: ['docs', 'documents', 'paperwork'],
  },
  {
    id: 'admin-accounting',
    label: 'Open accounting',
    description: 'Accounting tools',
    path: '/accounting',
    mode: 'admin',
    keywords: ['accounting', 'ledger'],
  },
  {
    id: 'admin-billing',
    label: 'Open billing',
    description: 'Billing',
    path: '/billing',
    mode: 'admin',
    keywords: ['billing'],
  },
  {
    id: 'admin-assistant',
    label: 'Open full Assistant',
    description: 'Chat + shared calendar',
    path: '/admin/assistant',
    mode: 'admin',
    keywords: ['calendar', 'full assistant', 'agenda'],
  },
  {
    id: 'admin-users',
    label: 'Open users',
    description: 'User management',
    path: '/users',
    mode: 'admin',
    keywords: ['users', 'user admin'],
  },
  {
    id: 'admin-settings',
    label: 'Open settings',
    description: 'System settings',
    path: '/settings',
    mode: 'admin',
    keywords: ['settings'],
  },
  {
    id: 'admin-engine',
    label: 'Open load review',
    description: 'Document / load review engine',
    path: '/engine',
    mode: 'admin',
    keywords: ['engine', 'load review', 'doc review'],
  },
]

/** Catalog entries for the given mode. */
export function getAssistantCatalog(mode: AssistantAppMode): AssistantCatalogEntry[] {
  return mode === 'admin' ? ADMIN_CATALOG : CLIENT_CATALOG
}

/** Lean list for the model system/context JSON. */
export function catalogForPrompt(mode: AssistantAppMode): Array<{
  id: string
  label: string
  description: string
}> {
  return getAssistantCatalog(mode).map(({ id, label, description }) => ({
    id,
    label,
    description,
  }))
}

/** Resolve catalog ids (and optional invoice deep-links) into clickable actions. */
export function resolveAppActions(
  mode: AssistantAppMode,
  refs: Array<{
    id?: string
    label?: string
    invoiceId?: string
    invoiceNumber?: string
  }>
): AssistantAppAction[] {
  const catalog = getAssistantCatalog(mode)
  const byId = new Map(catalog.map((e) => [e.id, e]))
  const out: AssistantAppAction[] = []

  for (const ref of refs) {
    const id = ref.id?.trim()
    if (!id) continue

    // Dynamic invoice open (not in static catalog).
    if (id === 'open_invoice' || id === 'upload_invoice') {
      const invId = ref.invoiceId?.trim()
      const invNum = ref.invoiceNumber?.trim()
      if (!invId && !invNum) continue
      const target = invId || invNum!
      const path =
        id === 'upload_invoice'
          ? `/client/invoices?highlight_invoice=${encodeURIComponent(target)}&open_upload=1`
          : mode === 'admin'
            ? `/invoices/workspace?invoice=${encodeURIComponent(target)}`
            : `/client/invoices?highlight_invoice=${encodeURIComponent(target)}`
      out.push({
        id: `${id}-${target}`,
        label:
          ref.label?.trim() ||
          (id === 'upload_invoice'
            ? `Upload docs for #${invNum || invId}`
            : `Open invoice #${invNum || invId}`),
        description: id === 'upload_invoice' ? 'Open upload for this invoice' : 'Open invoice detail',
        path,
        invoiceId: invId,
        invoiceNumber: invNum,
      })
      continue
    }

    const entry = byId.get(id)
    if (!entry) continue
    out.push({
      id: entry.id,
      label: ref.label?.trim() || entry.label,
      description: entry.description,
      path: entry.path,
      invoiceId: ref.invoiceId,
      invoiceNumber: ref.invoiceNumber,
    })
  }

  // Dedupe by id+path
  const seen = new Set<string>()
  return out.filter((a) => {
    const key = `${a.id}:${a.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Match a free-text ask to catalog entries (offline / enrichment). */
export function matchCatalogFromPrompt(
  prompt: string,
  mode: AssistantAppMode,
  limit = 3
): AssistantAppAction[] {
  const q = prompt.toLowerCase()
  const scored = getAssistantCatalog(mode)
    .map((entry) => {
      let score = 0
      for (const kw of entry.keywords) {
        if (q.includes(kw.toLowerCase())) score += kw.length
      }
      return { entry, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(({ entry }) => ({
    id: entry.id,
    label: entry.label,
    description: entry.description,
    path: entry.path,
  }))
}

/** True when the user is asking to go somewhere / do a workflow in the app. */
export function isAppNavigationIntent(prompt: string): boolean {
  return /\b(open|go to|take me|show me|navigate|bring me|launch|start|create a batch|upload (a )?batch|where (is|can)|how do i)\b/i.test(
    prompt
  )
}
