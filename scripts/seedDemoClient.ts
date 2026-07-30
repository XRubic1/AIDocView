/**
 * Wipe + reseed demo A/R data for a carrier portal demo account.
 *
 * Dates are always relative to "today" (last ~4 months), so demos stay fresh
 * when you re-run the script months later.
 *
 * Usage:
 *   npm run seed-demo -- "ABC Trucking"
 *   npm run seed-demo -- --client-id client-xxx
 *   npm run seed-demo -- "ABC Trucking" dry-run
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL in .env
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Env / CLI ───────────────────────────────────────────────────────────────

function loadEnvFile(): void {
  const envPath = resolve(process.cwd(), '.env')
  try {
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    /* optional if vars already set */
  }
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  if (idx < 0 || idx + 1 >= process.argv.length) return undefined
  return process.argv[idx + 1]
}

/** Positional: [clientName] — npm on Windows often strips --flags. */
function readPositionalArgs(): { clientName?: string; dryRun: boolean } {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const dryRun = hasFlag('--dry-run') || args.includes('dry-run')
  const clientName = args.find((a) => a !== 'dry-run')
  return { clientName, dryRun }
}

// ─── Date helpers (relative to today) ────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local calendar YYYY-MM-DD (avoids UTC day-shift surprises). */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

/** Day `day` of the month that is `monthsAgo` months before today (clamped). */
function dateInMonth(monthsAgo: number, day: number): Date {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(Math.max(1, day), last))
  return d
}

function isoAt(date: Date, hour = 14, minute = 0): string {
  const d = new Date(date)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from)
  a.setHours(0, 0, 0, 0)
  const b = new Date(to)
  b.setHours(0, 0, 0, 0)
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000)
}

// ─── Supabase REST helpers ───────────────────────────────────────────────────

type Json = Record<string, unknown>

async function rest<T = unknown>(
  baseUrl: string,
  serviceKey: string,
  path: string,
  init: RequestInit & { prefer?: string } = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (init.prefer) headers.Prefer = init.prefer

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...init,
    headers,
  })
  const text = await res.text()
  let data: T
  try {
    data = text ? (JSON.parse(text) as T) : (null as T)
  } catch {
    data = text as unknown as T
  }
  return { ok: res.ok, status: res.status, data }
}

// ─── Demo catalog ────────────────────────────────────────────────────────────

const DEMO_TAG = 'demo-abc' // stable id prefix for wipe safety checks
const CLIENT_NAME_DEFAULT = 'ABC Trucking'
const OPS = 'Credyx Ops'
/** Carrier-side contact name on client-visible notes (reads as real ops, not “demo”). */
const CARRIER_CONTACT = 'Alex Rivera'

interface DemoBroker {
  id: string
  name: string
  email: string
}

const DEMO_BROKERS: DemoBroker[] = [
  { id: 'broker-demo-tql', name: 'TQL', email: 'ap@tql.example' },
  { id: 'broker-demo-landstar', name: 'LANDSTAR RANGER INC', email: 'payables@landstar.example' },
  { id: 'broker-demo-newage', name: 'New Age Logistics', email: 'billing@newage.example' },
  { id: 'broker-demo-agl', name: 'AGL GROUP', email: 'ap@aglgroup.example' },
]

type ScenarioKind =
  | 'paid'
  | 'open'
  | 'overdue'
  | 'force_closed'
  | 'hold_dispute'
  | 'awaiting_confirm'
  | 'short_awaiting'
  | 'short_confirmed'
  | 'over_awaiting'
  | 'over_confirmed'
  | 'chargeback'
  | 'short_writeoff'
  | 'will_pay'
  | 'callback'
  | 'resolved_dispute'

interface DemoInvoiceSpec {
  /** Stable suffix → inv-demo-abc-{suffix} */
  key: string
  invoiceNumber: string
  loadNumber: string
  /** 0 = current month … 3 = three months ago */
  monthsAgo: number
  /** Day of that month for invoice_date */
  day: number
  /** Net terms days (used when daysPastExpected is omitted) */
  termsDays: number
  /**
   * Days past expected payment as of today (drives Aging A/R + overdue).
   * Positive = past due; 0 = due today; negative = due in N days.
   * When set, overrides invoice_date + termsDays for due/expected.
   */
  daysPastExpected?: number
  /** For paid invoices: how many days ago payment was received (dashboard “last 7 days”). */
  paidDaysAgo?: number
  amount: number
  brokerIndex: number
  /** Which submitted batch bucket (monthsAgo of that batch) */
  batch: number
  scenario: ScenarioKind
  docsSent?: boolean
}

/** Approved vault docs so Document Vault setup reads as complete (everything on file). */
interface DemoVaultDocSpec {
  key: string
  name: string
  file_name: string
  category: 'broker' | 'compliance' | 'other'
  document_type: string
  notes?: string
  /** Days until expiration reminder (omit = no expiry). */
  expiresInDays?: number
  /** Only seed when client.factoring is true. */
  factoringOnly?: boolean
}

const VAULT_DOC_SPECS: DemoVaultDocSpec[] = [
  {
    key: 'w9',
    name: 'W-9 Tax Form',
    file_name: 'W9.pdf',
    category: 'compliance',
    document_type: 'w9',
    notes: 'Current year W-9 on file.',
  },
  {
    key: 'coi',
    name: 'Certificate of Insurance',
    file_name: 'COI.pdf',
    category: 'compliance',
    document_type: 'coi',
    notes: 'Liability + cargo coverage verified.',
    expiresInDays: 320,
  },
  {
    key: 'mc-authority',
    name: 'MC Authority',
    file_name: 'MC-Authority.pdf',
    category: 'compliance',
    document_type: 'mc_authority',
  },
  {
    key: 'dot-reg',
    name: 'DOT Registration',
    file_name: 'DOT-Registration.pdf',
    category: 'compliance',
    document_type: 'dot_registration',
  },
  {
    key: 'voided-check',
    name: 'Voided check — operating account',
    file_name: 'Voided-Check.pdf',
    category: 'broker',
    document_type: 'voided_check',
    notes: 'Bank proof for remittance.',
  },
  {
    key: 'bank-letter',
    name: 'Bank letter — remittance verification',
    file_name: 'Bank-Letter.pdf',
    category: 'broker',
    document_type: 'bank_letter',
    notes: 'Confirms ACH remittance account on file.',
  },
  {
    key: 'noa',
    name: 'Notice of Assignment',
    file_name: 'NOA.pdf',
    category: 'broker',
    document_type: 'noa',
    notes: 'Factoring NOA on file.',
    factoringOnly: true,
  },
]

/**
 * Mix across last 4 months. `daysPastExpected` fills Aging A/R buckets:
 * current (≤0) · 1–15 · 16–30 · 31–45 · 46–60 · 61–90 · 91+
 * Force-closed loads leave aging (Managed-only); keep one demo example with a clear reason.
 * Overdue badge = approved + daysPastExpected ≥ 15.
 */
const INVOICE_SPECS: DemoInvoiceSpec[] = [
  // ── 4 months ago — force-closed after 90+ days (uncollectable; fee still applies) ──
  {
    key: 'm4-force-closed',
    invoiceNumber: '2001',
    loadNumber: 'LD-87001',
    monthsAgo: 4,
    day: 8,
    termsDays: 30,
    daysPastExpected: 95,
    amount: 980,
    brokerIndex: 0,
    batch: 4,
    scenario: 'force_closed',
    docsSent: true,
  },
  {
    key: 'm4-paid',
    invoiceNumber: '2002',
    loadNumber: 'LD-87022',
    monthsAgo: 4,
    day: 18,
    termsDays: 30,
    amount: 4125,
    brokerIndex: 2,
    batch: 4,
    scenario: 'paid',
    docsSent: true,
  },

  // ── 3 months ago ──
  {
    key: 'm3-paid-1',
    invoiceNumber: '2101',
    loadNumber: 'LD-88401',
    monthsAgo: 3,
    day: 4,
    termsDays: 30,
    amount: 2450,
    brokerIndex: 0,
    batch: 3,
    scenario: 'paid',
    docsSent: true,
  },
  {
    key: 'm3-paid-2',
    invoiceNumber: '2102',
    loadNumber: 'LD-88412',
    monthsAgo: 3,
    day: 18,
    termsDays: 30,
    amount: 1875.5,
    brokerIndex: 1,
    batch: 3,
    scenario: 'paid',
    docsSent: true,
  },
  {
    key: 'm3-overdue',
    invoiceNumber: '2103',
    loadNumber: 'LD-88430',
    monthsAgo: 3,
    day: 22,
    termsDays: 15,
    daysPastExpected: 68,
    amount: 3200,
    brokerIndex: 2,
    batch: 3,
    scenario: 'overdue',
    docsSent: true,
  },

  // ── 2 months ago ──
  {
    key: 'm2-paid',
    invoiceNumber: '2201',
    loadNumber: 'LD-89101',
    monthsAgo: 2,
    day: 6,
    termsDays: 30,
    paidDaysAgo: 5, // payment in last 7 days
    amount: 4100,
    brokerIndex: 3,
    batch: 2,
    scenario: 'paid',
    docsSent: true,
  },
  {
    key: 'm2-open',
    invoiceNumber: '2202',
    loadNumber: 'LD-89122',
    monthsAgo: 2,
    day: 14,
    termsDays: 30,
    daysPastExpected: 40,
    amount: 2750,
    brokerIndex: 0,
    batch: 2,
    scenario: 'open',
    docsSent: true,
  },
  {
    key: 'm2-hold',
    invoiceNumber: '2203',
    loadNumber: 'LD-89140',
    monthsAgo: 2,
    day: 20,
    termsDays: 30,
    daysPastExpected: 35,
    amount: 1980,
    brokerIndex: 1,
    batch: 2,
    scenario: 'hold_dispute',
    docsSent: false,
  },
  {
    key: 'm2-resolved',
    invoiceNumber: '2204',
    loadNumber: 'LD-89155',
    monthsAgo: 2,
    day: 25,
    termsDays: 30,
    daysPastExpected: 28,
    amount: 1560,
    brokerIndex: 2,
    batch: 2,
    scenario: 'resolved_dispute',
    docsSent: true,
  },

  // ── 1 month ago ──
  {
    key: 'm1-paid',
    invoiceNumber: '2301',
    loadNumber: 'LD-90201',
    monthsAgo: 1,
    day: 3,
    termsDays: 30,
    paidDaysAgo: 3, // payment in last 7 days
    amount: 2890,
    brokerIndex: 0,
    batch: 1,
    scenario: 'paid',
    docsSent: true,
  },
  {
    key: 'm1-overdue',
    invoiceNumber: '2302',
    loadNumber: 'LD-90218',
    monthsAgo: 1,
    day: 8,
    termsDays: 15,
    daysPastExpected: 52,
    amount: 3650,
    brokerIndex: 3,
    batch: 1,
    scenario: 'overdue',
    docsSent: true,
  },
  {
    key: 'm1-willpay',
    invoiceNumber: '2303',
    loadNumber: 'LD-90233',
    monthsAgo: 1,
    day: 15,
    termsDays: 30,
    daysPastExpected: 12,
    amount: 2100,
    brokerIndex: 1,
    batch: 1,
    scenario: 'will_pay',
    docsSent: true,
  },
  {
    key: 'm1-await',
    invoiceNumber: '2304',
    loadNumber: 'LD-90250',
    monthsAgo: 1,
    day: 20,
    termsDays: 30,
    daysPastExpected: 8,
    amount: 1750,
    brokerIndex: 2,
    batch: 1,
    scenario: 'awaiting_confirm',
    docsSent: true,
  },
  {
    key: 'm1-short',
    invoiceNumber: '2305',
    loadNumber: 'LD-90266',
    monthsAgo: 1,
    day: 24,
    termsDays: 30,
    daysPastExpected: 5,
    amount: 3000, // $2,550 remitted; $450 short — missed delivery
    brokerIndex: 0,
    batch: 1,
    scenario: 'short_awaiting',
    docsSent: true,
  },

  // ── Current month ──
  {
    key: 'm0-paid-recent',
    invoiceNumber: '2400',
    loadNumber: 'LD-90990',
    monthsAgo: 0,
    day: 5,
    termsDays: 15,
    paidDaysAgo: 2, // payment in last 7 days
    amount: 1650,
    brokerIndex: 1,
    batch: 0,
    scenario: 'paid',
    docsSent: true,
  },
  {
    key: 'm0-open-1',
    invoiceNumber: '2401',
    loadNumber: 'LD-91001',
    monthsAgo: 0,
    day: 2,
    termsDays: 30,
    daysPastExpected: -14,
    amount: 2250,
    brokerIndex: 1,
    batch: 0,
    scenario: 'open',
    docsSent: true,
  },
  {
    key: 'm0-open-2',
    invoiceNumber: '2402',
    loadNumber: 'LD-91014',
    monthsAgo: 0,
    day: 8,
    termsDays: 30,
    daysPastExpected: -7,
    amount: 1890,
    brokerIndex: 3,
    batch: 0,
    scenario: 'open',
    docsSent: true,
  },
  {
    key: 'm0-callback',
    invoiceNumber: '2403',
    loadNumber: 'LD-91028',
    monthsAgo: 0,
    day: 12,
    termsDays: 30,
    daysPastExpected: 6,
    amount: 3400,
    brokerIndex: 2,
    batch: 0,
    scenario: 'callback',
    docsSent: true,
  },
  {
    key: 'm0-hold',
    invoiceNumber: '2404',
    loadNumber: 'LD-91040',
    monthsAgo: 0,
    day: 15,
    termsDays: 30,
    daysPastExpected: -10,
    amount: 1425,
    brokerIndex: 0,
    batch: 0,
    scenario: 'hold_dispute',
    docsSent: false,
  },
  {
    key: 'm0-open-3',
    invoiceNumber: '2405',
    loadNumber: 'LD-91055',
    monthsAgo: 0,
    day: 18,
    termsDays: 30,
    daysPastExpected: -12,
    amount: 2675,
    brokerIndex: 1,
    batch: 0,
    scenario: 'open',
    docsSent: true,
  },
  {
    key: 'm0-await',
    invoiceNumber: '2406',
    loadNumber: 'LD-91070',
    monthsAgo: 0,
    day: 20,
    termsDays: 30,
    daysPastExpected: -3,
    amount: 980,
    brokerIndex: 3,
    batch: 0,
    scenario: 'awaiting_confirm',
    docsSent: true,
  },

  // ── Payment variance showcase (current month) ──
  {
    key: 'm0-short-confirmed',
    invoiceNumber: '2407',
    loadNumber: 'LD-91082',
    monthsAgo: 0,
    day: 10,
    termsDays: 30,
    daysPastExpected: 4,
    amount: 2800,
    brokerIndex: 1,
    batch: 0,
    scenario: 'short_confirmed', // confirmed short — lumper $200 still due
    docsSent: true,
  },
  {
    key: 'm0-over-await',
    invoiceNumber: '2408',
    loadNumber: 'LD-91090',
    monthsAgo: 0,
    day: 11,
    termsDays: 30,
    daysPastExpected: 2,
    amount: 2100,
    brokerIndex: 2,
    batch: 0,
    scenario: 'over_awaiting', // overpay awaiting confirm (+$125)
    docsSent: true,
  },
  {
    key: 'm0-over-confirmed',
    invoiceNumber: '2409',
    loadNumber: 'LD-91102',
    monthsAgo: 0,
    day: 13,
    termsDays: 30,
    daysPastExpected: 1,
    amount: 1950,
    brokerIndex: 0,
    batch: 0,
    scenario: 'over_confirmed', // confirmed overpay — accept excess pending
    docsSent: true,
  },
  {
    key: 'm0-chargeback',
    invoiceNumber: '2410',
    loadNumber: 'LD-91114',
    monthsAgo: 0,
    day: 14,
    termsDays: 30,
    daysPastExpected: 3,
    amount: 3200,
    brokerIndex: 3,
    batch: 0,
    scenario: 'chargeback', // paid in full, then $350 chargeback correction
    docsSent: true,
  },
  {
    key: 'm0-short-writeoff',
    invoiceNumber: '2411',
    loadNumber: 'LD-91126',
    monthsAgo: 0,
    day: 16,
    termsDays: 30,
    daysPastExpected: 9,
    amount: 2500,
    brokerIndex: 1,
    batch: 0,
    scenario: 'short_writeoff', // short $400 written off as uncollectable
    docsSent: true,
  },
]

// ─── Builders ────────────────────────────────────────────────────────────────

function note(
  id: string,
  text: string,
  createdBy: string,
  at: string,
  type: string = 'note',
  visibility: 'client' | 'internal' = 'client'
) {
  return { id, note: text, created_by: createdBy, created_at: at, type, visibility }
}

function sendRecord(
  email: string,
  at: string,
  docs: string[],
  status: 'sent' | 'delivered' = 'delivered'
) {
  return {
    email_address: email,
    sent_at: at,
    sent_by: OPS,
    status,
    documents_sent: docs,
  }
}

/** PostgREST requires every object in a bulk insert to share the same keys. */
function emptyPaymentSkeleton(): Json {
  return {
    notes: null,
    posted_source: null,
    posted_by: null,
    confirmed_by: null,
    confirmed_at: null,
    client_confirmation_deadline: null,
    client_confirmed_at: null,
    client_confirmed_by: null,
    dispute: null,
    rejection_reason: null,
    reversed_at: null,
    reversed_by: null,
    reversal_reason: null,
    reversal_type: null,
    moved_to_payment_id: null,
    moved_from_payment_id: null,
    parent_payment_id: null,
    payment_kind: 'normal',
    short_pay_reason: null,
    batch_id: null,
    batch_number: null,
    load_number: null,
  }
}

function normalizePayment(partial: Json): Json {
  return { ...emptyPaymentSkeleton(), ...partial }
}

/** Build approved vault rows so setup checklist is complete. */
function buildVaultDocuments(
  clientId: string,
  factoring: boolean,
  today: Date
): Json[] {
  const uploadedAt = isoAt(addDays(today, -45), 10, 20)
  const approvedAt = isoAt(addDays(today, -44), 14, 5)

  return VAULT_DOC_SPECS.filter((spec) => !spec.factoringOnly || factoring).map((spec, index) => {
    const expires_at =
      typeof spec.expiresInDays === 'number'
        ? isoAt(addDays(today, spec.expiresInDays), 0, 0)
        : null

    return {
      id: `cdoc-${DEMO_TAG}-${spec.key}`,
      client_id: clientId,
      name: spec.name,
      file_name: spec.file_name,
      category: spec.category,
      document_type: spec.document_type,
      notes: spec.notes ?? null,
      size: 165_000 + index * 12_000,
      mime_type: 'application/pdf',
      storage_path: null,
      uploaded_at: uploadedAt,
      uploaded_by: CARRIER_CONTACT,
      expires_at,
      approval_status: 'approved',
      approved_by: OPS,
      approved_at: approvedAt,
      rejection_reason: null,
      uploaded_by_role: 'client',
    }
  })
}

interface BuiltInvoice {
  row: Json
  payments: Json[]
}

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildInvoice(
  spec: DemoInvoiceSpec,
  clientId: string,
  clientName: string,
  batchId: string,
  batchNumber: string,
  broker: DemoBroker,
  today: Date
): BuiltInvoice {
  const invDate = dateInMonth(spec.monthsAgo, spec.day)
  let due = addDays(invDate, spec.termsDays)
  let expected = new Date(due)

  // Explicit aging target (relative to today) — keeps Aging A/R chart realistic
  if (typeof spec.daysPastExpected === 'number') {
    expected = addDays(today, -spec.daysPastExpected)
    due = new Date(expected)
  }

  const invoiceId = `inv-${DEMO_TAG}-${spec.key}`
  const createdAt = isoAt(invDate, 10, 15)
  const approvedAt = isoAt(addDays(invDate, 1), 11, 0)
  const docs = ['invoice.pdf', 'bol.pdf', 'pod.pdf', 'ratecon.pdf']

  const notes: Json[] = []
  const disputes: Json[] = []
  let document_send_history: Json[] = []
  let status: string = 'approved'
  let hold_reason: string | null = null
  let paid_amount: number | null = null
  let overpayment_accepted_at: string | null = null
  let write_off_request: Json | null = null
  let collection_status: string | null = null
  let collection_date: string | null = null
  let broker_contacted = false
  let last_broker_contact: string | null = null
  let days_since_expected: number | null =
    typeof spec.daysPastExpected === 'number' ? Math.max(0, spec.daysPastExpected) : null
  const payments: Json[] = []

  // Baseline notes every invoice gets
  notes.push(
    note(
      `note-${spec.key}-submit`,
      `Submitted packet for load ${spec.loadNumber}. Docs look complete on our end.`,
      CARRIER_CONTACT,
      isoAt(invDate, 10, 30),
      'client_note',
      'client'
    ),
    note(
      `note-${spec.key}-review`,
      'Paperwork verified. Invoice approved for broker submission.',
      OPS,
      approvedAt,
      'approval',
      'client'
    )
  )

  if (spec.docsSent !== false && spec.scenario !== 'hold_dispute') {
    const sentAt = isoAt(addDays(invDate, 2), 15, 20)
    document_send_history = [sendRecord(broker.email, sentAt, docs)]
    notes.push(
      note(
        `note-${spec.key}-ppw`,
        `PPW sent to ${broker.name} AP (${broker.email}) — invoice, BOL, POD, rate con.`,
        OPS,
        sentAt,
        'status_update',
        'client'
      )
    )
    broker_contacted = true
    last_broker_contact = sentAt
  }

  switch (spec.scenario) {
    case 'paid': {
      status = 'paid'
      paid_amount = spec.amount
      // Prefer explicit recent payment for dashboard “last 7 days” metrics
      const received =
        typeof spec.paidDaysAgo === 'number'
          ? addDays(today, -spec.paidDaysAgo)
          : (() => {
              const payDate = addDays(due, -3)
              return payDate > today ? addDays(invDate, 18) : payDate
            })()
      const payIso = isoAt(received, 16, 0)
      notes.push(
        note(
          `note-${spec.key}-paid`,
          `Payment of $${spec.amount.toFixed(2)} received via ACH. Marked paid.`,
          OPS,
          payIso,
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-paid-thanks`,
          'Confirmed — funds are in. Thanks.',
          CARRIER_CONTACT,
          isoAt(received, 17, 10),
          'client_note',
          'client'
        )
      )
      payments.push(
        normalizePayment({
          id: `pay-${DEMO_TAG}-${spec.key}`,
          client_id: clientId,
          invoice_id: invoiceId,
          invoice_number: spec.invoiceNumber,
          broker_name: broker.name,
          amount: spec.amount,
          payment_date: toDateStr(received),
          received_date: toDateStr(received),
          payment_method: 'ach',
          payment_reference: `ACH-${spec.invoiceNumber}`,
          status: 'confirmed',
          notes: 'Full payment received via ACH.',
          posted_source: 'credyx',
          posted_by: OPS,
          confirmed_by: OPS,
          confirmed_at: payIso,
          client_confirmed_at: payIso,
          client_confirmed_by: CARRIER_CONTACT,
          payment_kind: 'normal',
          batch_id: batchId,
          batch_number: batchNumber,
          load_number: spec.loadNumber,
        })
      )
      break
    }
    case 'overdue': {
      // Still open A/R — chased, no remittance yet (not force-closed).
      status = 'approved'
      days_since_expected = daysBetween(expected, today)
      const call1 = isoAt(addDays(due, 7), 14, 15)
      const call2 = isoAt(addDays(due, 14), 11, 20)
      const lastChase = isoAt(addDays(due, 21), 15, 40)
      notes.push(
        note(
          `note-${spec.key}-chase1`,
          `Email follow-up to ${broker.name} AP — past due. Asked for remittance status or any hold reason.`,
          OPS,
          isoAt(addDays(due, 5), 13, 0),
          'note',
          'client'
        ),
        note(
          `note-${spec.key}-call1`,
          `Called ${broker.name} AP desk. Left voicemail with invoice #${spec.invoiceNumber} / load ${spec.loadNumber}. Requested callback.`,
          OPS,
          call1,
          'note',
          'client'
        ),
        note(
          `note-${spec.key}-chase2`,
          'Second email chase sent with PPW packet attached. Asked for payment date or hold reason.',
          OPS,
          isoAt(addDays(due, 12), 10, 30),
          'note',
          'client'
        ),
        note(
          `note-${spec.key}-call2`,
          `Phone follow-up with ${broker.name}. Spoke with AP — they said invoice is in queue, no dispute on docs. No remittance date given.`,
          OPS,
          call2,
          'note',
          'client'
        ),
        note(
          `note-${spec.key}-chase3`,
          `Still open — ${days_since_expected} days past expected pay. Continuing collections chase with ${broker.name}; no payment posted yet.`,
          OPS,
          lastChase,
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-internal`,
          'Collections active — escalate if no remittance before force-close eligibility (90+ days past expected).',
          OPS,
          lastChase,
          'note',
          'internal'
        )
      )
      broker_contacted = true
      last_broker_contact = lastChase
      collection_status = 'C/B'
      collection_date = toDateStr(addDays(today, 3))
      break
    }
    case 'force_closed': {
      // Managed-only: Credyx closed aged uncollectable load after collections work; fee still bills.
      status = 'force_closed'
      days_since_expected = typeof spec.daysPastExpected === 'number' ? spec.daysPastExpected : 95
      const call1 = isoAt(addDays(due, 10), 14, 15)
      const call2 = isoAt(addDays(due, 25), 11, 20)
      const call3 = isoAt(addDays(due, 45), 15, 40)
      const escalateAt = isoAt(addDays(due, 75), 10, 5)
      const closedAt = isoAt(addDays(today, -3), 16, 20)
      notes.push(
        note(
          `note-${spec.key}-chase1`,
          `Email follow-up to ${broker.name} AP — past due. Asked for remittance status.`,
          OPS,
          isoAt(addDays(due, 5), 13, 0),
          'note',
          'client'
        ),
        note(
          `note-${spec.key}-call1`,
          `Called ${broker.name} AP desk. Left voicemail with invoice #${spec.invoiceNumber} / load ${spec.loadNumber}. No callback.`,
          OPS,
          call1,
          'note',
          'client'
        ),
        note(
          `note-${spec.key}-chase2`,
          'Second email chase with PPW packet attached. No reply from broker AP.',
          OPS,
          isoAt(addDays(due, 18), 10, 30),
          'note',
          'client'
        ),
        note(
          `note-${spec.key}-call2`,
          `Phone follow-up with ${broker.name}. Reached receptionist — transferred to voicemail. No dispute raised; still no remittance.`,
          OPS,
          call2,
          'note',
          'client'
        ),
        note(
          `note-${spec.key}-call3`,
          `Called ${broker.name} again. AP would not commit to a pay date. Docs remain undisputed; payment not forthcoming.`,
          OPS,
          call3,
          'note',
          'client'
        ),
        note(
          `note-${spec.key}-eligible`,
          `Now ${days_since_expected} days past expected pay — past Credyx force-close threshold (90+ days). Broker unresponsive after repeated collections outreach.`,
          OPS,
          escalateAt,
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-closed`,
          `Invoice force closed — collection fee applies: Force closed — uncollectable for full amount $${spec.amount.toFixed(2)}. Broker never remitted after extensive collections chase; closed as aged uncollectable (Managed policy).`,
          OPS,
          closedAt,
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-internal`,
          'Force-closed after 90+ days past expected. Fee remains billable (unlike write-off). Removed from aging A/R and collections chase.',
          OPS,
          closedAt,
          'note',
          'internal'
        )
      )
      broker_contacted = true
      last_broker_contact = call3
      collection_status = null
      collection_date = null
      break
    }
    case 'hold_dispute': {
      // Credyx holds immediately at verification when paperwork is incomplete (e.g. missing BOL).
      status = 'hold'
      hold_reason = 'Missing BOL — held at verification'
      const holdAt = isoAt(invDate, 11, 20) // same day as submit — immediate hold

      // Drop the default “approved” note — this packet never cleared verification.
      const approvalIdx = notes.findIndex((n) => (n as { id?: string }).id === `note-${spec.key}-review`)
      if (approvalIdx >= 0) notes.splice(approvalIdx, 1)

      notes.push(
        note(
          `note-${spec.key}-hold`,
          `Placed on hold during verification: BOL is missing from the packet (load ${spec.loadNumber}). Invoice was not submitted to the broker.`,
          OPS,
          holdAt,
          'hold_reason',
          'client'
        ),
        note(
          `note-${spec.key}-detail`,
          'We need a clear BOL (all pages) matching this load. Rate con / invoice alone are not enough to release the hold.',
          OPS,
          isoAt(invDate, 11, 35),
          'note',
          'client'
        ),
        note(
          `note-${spec.key}-action`,
          'Action needed: Upload the missing BOL so Credyx can verify and release the hold.',
          OPS,
          isoAt(invDate, 11, 40),
          'note',
          'client'
        )
      )
      // No PPW / no broker dispute — hold is internal until docs are complete.
      document_send_history = []
      broker_contacted = false
      last_broker_contact = null
      break
    }
    case 'resolved_dispute': {
      status = 'approved'
      const opened = isoAt(addDays(invDate, 4), 12, 0)
      const resolved = isoAt(addDays(invDate, 9), 15, 30)
      disputes.push({
        id: `dispute-${DEMO_TAG}-${spec.key}`,
        reason: 'amount_discrepancy',
        description: 'Broker questioned accessorial — lumper fee.',
        status: 'resolved',
        created_by: CARRIER_CONTACT,
        created_at: opened,
        resolved_at: resolved,
        response: 'Lumper receipt accepted. Invoice remains at original amount.',
        responded_at: resolved,
        responded_by: OPS,
      })
      notes.push(
        note(
          `note-${spec.key}-disp-open`,
          'Dispute opened: Amount discrepancy — lumper fee.',
          CARRIER_CONTACT,
          opened,
          'dispute',
          'client'
        ),
        note(
          `note-${spec.key}-disp-res`,
          'Dispute resolved — lumper receipt accepted. Broker processing payment.',
          OPS,
          resolved,
          'status_update',
          'client'
        )
      )
      break
    }
    case 'awaiting_confirm': {
      status = 'approved'
      const payDate = addDays(today, -2)
      const deadline = addDays(today, 5)
      notes.push(
        note(
          `note-${spec.key}-posted`,
          `Posted $${spec.amount.toFixed(2)} from ${broker.name}. Please confirm you received the funds.`,
          OPS,
          isoAt(payDate, 12, 0),
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-action`,
          'Action needed: Confirm payment receipt in Payments, or dispute if funds were not received.',
          OPS,
          isoAt(payDate, 12, 5),
          'note',
          'client'
        )
      )
      payments.push(
        normalizePayment({
          id: `pay-${DEMO_TAG}-${spec.key}`,
          client_id: clientId,
          invoice_id: invoiceId,
          invoice_number: spec.invoiceNumber,
          broker_name: broker.name,
          amount: spec.amount,
          payment_date: toDateStr(payDate),
          received_date: toDateStr(payDate),
          payment_method: 'ach',
          payment_reference: `ACH-${spec.invoiceNumber}`,
          status: 'awaiting_receipt',
          notes: 'Full remittance posted — awaiting receipt confirmation.',
          posted_source: 'credyx',
          posted_by: OPS,
          client_confirmation_deadline: toDateStr(deadline),
          payment_kind: 'normal',
          batch_id: batchId,
          batch_number: batchNumber,
          load_number: spec.loadNumber,
        })
      )
      break
    }
    case 'short_awaiting': {
      // Partial underpayment (not payment_kind short — that is a correction that subtracts).
      // Inv #2305: $3,000 face, $450 missed-delivery deduction → $2,550 remitted.
      status = 'approved'
      const shortfall = 450
      const paidAmt = Math.round((spec.amount - shortfall) * 100) / 100
      const payDate = addDays(today, -1)
      const deadline = addDays(today, 4)
      notes.push(
        note(
          `note-${spec.key}-short`,
          `${broker.name} remitted $${money(paidAmt)} of $${money(spec.amount)}. Short by $${money(shortfall)} — missed delivery deduction.`,
          OPS,
          isoAt(payDate, 11, 0),
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-reason`,
          `Short-pay reason: Missed delivery — $${money(shortfall)} deducted by broker. $${money(shortfall)} still due on invoice #${spec.invoiceNumber} / load ${spec.loadNumber}.`,
          OPS,
          isoAt(payDate, 11, 5),
          'note',
          'client'
        ),
        note(
          `note-${spec.key}-action`,
          `Action needed: Confirm the $${money(paidAmt)} you received, or dispute if the missed-delivery deduction is incorrect.`,
          OPS,
          isoAt(payDate, 11, 10),
          'note',
          'client'
        )
      )
      payments.push(
        normalizePayment({
          id: `pay-${DEMO_TAG}-${spec.key}`,
          client_id: clientId,
          invoice_id: invoiceId,
          invoice_number: spec.invoiceNumber,
          broker_name: broker.name,
          amount: paidAmt,
          payment_date: toDateStr(payDate),
          received_date: toDateStr(payDate),
          payment_method: 'ach',
          payment_reference: `ACH-${spec.invoiceNumber}`,
          status: 'awaiting_receipt',
          notes: 'Short pay — missed delivery $450',
          posted_source: 'credyx',
          posted_by: OPS,
          client_confirmation_deadline: toDateStr(deadline),
          payment_kind: 'normal',
          batch_id: batchId,
          batch_number: batchNumber,
          load_number: spec.loadNumber,
        })
      )
      break
    }
    case 'short_confirmed': {
      // Confirmed partial remittance — short paid, balance still open.
      status = 'approved'
      const shortfall = 200
      const paidAmt = Math.round((spec.amount - shortfall) * 100) / 100
      const payDate = addDays(today, -4)
      const payIso = isoAt(payDate, 14, 20)
      paid_amount = paidAmt
      notes.push(
        note(
          `note-${spec.key}-short`,
          `${broker.name} remitted $${money(paidAmt)} of $${money(spec.amount)}. Short by $${money(shortfall)} — lumper fee deducted.`,
          OPS,
          payIso,
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-confirm`,
          `Confirmed receipt of $${money(paidAmt)}. $${money(shortfall)} still due — chasing lumper deduction with broker.`,
          CARRIER_CONTACT,
          isoAt(payDate, 16, 5),
          'client_note',
          'client'
        ),
        note(
          `note-${spec.key}-follow`,
          `Short-pay reason: Lumper fee $${money(shortfall)}. Requested revised remittance or credit memo from ${broker.name}.`,
          OPS,
          isoAt(addDays(today, -2), 10, 30),
          'note',
          'client'
        )
      )
      payments.push(
        normalizePayment({
          id: `pay-${DEMO_TAG}-${spec.key}`,
          client_id: clientId,
          invoice_id: invoiceId,
          invoice_number: spec.invoiceNumber,
          broker_name: broker.name,
          amount: paidAmt,
          payment_date: toDateStr(payDate),
          received_date: toDateStr(payDate),
          payment_method: 'ach',
          payment_reference: `ACH-${spec.invoiceNumber}`,
          status: 'confirmed',
          notes: 'Short pay — lumper fee $200',
          posted_source: 'credyx',
          posted_by: OPS,
          confirmed_by: OPS,
          confirmed_at: payIso,
          client_confirmed_at: isoAt(payDate, 16, 5),
          client_confirmed_by: CARRIER_CONTACT,
          payment_kind: 'normal',
          batch_id: batchId,
          batch_number: batchNumber,
          load_number: spec.loadNumber,
        })
      )
      broker_contacted = true
      last_broker_contact = isoAt(addDays(today, -2), 10, 30)
      break
    }
    case 'over_awaiting': {
      // Broker remitted more than face — awaiting carrier confirm.
      status = 'approved'
      const overage = 125
      const paidAmt = Math.round((spec.amount + overage) * 100) / 100
      const payDate = addDays(today, -1)
      const deadline = addDays(today, 5)
      notes.push(
        note(
          `note-${spec.key}-over`,
          `${broker.name} remitted $${money(paidAmt)} on a $${money(spec.amount)} invoice ($${money(overage)} over). Please confirm what landed in your account.`,
          OPS,
          isoAt(payDate, 11, 15),
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-action`,
          `Action needed: Confirm the $${money(paidAmt)} remittance, or dispute if the amount is wrong.`,
          OPS,
          isoAt(payDate, 11, 20),
          'note',
          'client'
        )
      )
      payments.push(
        normalizePayment({
          id: `pay-${DEMO_TAG}-${spec.key}`,
          client_id: clientId,
          invoice_id: invoiceId,
          invoice_number: spec.invoiceNumber,
          broker_name: broker.name,
          amount: paidAmt,
          payment_date: toDateStr(payDate),
          received_date: toDateStr(payDate),
          payment_method: 'ach',
          payment_reference: `ACH-${spec.invoiceNumber}`,
          status: 'awaiting_receipt',
          notes: `Overpay — remitted $${money(paidAmt)} (+$${money(overage)})`,
          posted_source: 'credyx',
          posted_by: OPS,
          client_confirmation_deadline: toDateStr(deadline),
          payment_kind: 'normal',
          batch_id: batchId,
          batch_number: batchNumber,
          load_number: spec.loadNumber,
        })
      )
      break
    }
    case 'over_confirmed': {
      // Confirmed overpayment — excess not yet accepted.
      status = 'paid'
      const overage = 85
      const paidAmt = Math.round((spec.amount + overage) * 100) / 100
      const payDate = addDays(today, -3)
      const payIso = isoAt(payDate, 13, 40)
      paid_amount = paidAmt
      notes.push(
        note(
          `note-${spec.key}-over`,
          `${broker.name} remitted $${money(paidAmt)} on a $${money(spec.amount)} invoice ($${money(overage)} over).`,
          OPS,
          payIso,
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-confirm`,
          `Confirmed receipt of $${money(paidAmt)}. Excess $${money(overage)} still needs to be accepted or resolved.`,
          CARRIER_CONTACT,
          isoAt(payDate, 15, 10),
          'client_note',
          'client'
        )
      )
      payments.push(
        normalizePayment({
          id: `pay-${DEMO_TAG}-${spec.key}`,
          client_id: clientId,
          invoice_id: invoiceId,
          invoice_number: spec.invoiceNumber,
          broker_name: broker.name,
          amount: paidAmt,
          payment_date: toDateStr(payDate),
          received_date: toDateStr(payDate),
          payment_method: 'ach',
          payment_reference: `ACH-${spec.invoiceNumber}`,
          status: 'confirmed',
          notes: `Overpay — remitted $${money(paidAmt)} (+$${money(overage)})`,
          posted_source: 'credyx',
          posted_by: OPS,
          confirmed_by: OPS,
          confirmed_at: payIso,
          client_confirmed_at: isoAt(payDate, 15, 10),
          client_confirmed_by: CARRIER_CONTACT,
          payment_kind: 'normal',
          batch_id: batchId,
          batch_number: batchNumber,
          load_number: spec.loadNumber,
        })
      )
      break
    }
    case 'chargeback': {
      // Paid in full, then broker chargeback short correction.
      status = 'approved'
      const chargebackAmt = 350
      const netPaid = Math.round((spec.amount - chargebackAmt) * 100) / 100
      const fullPayDate = addDays(today, -8)
      const fullPayIso = isoAt(fullPayDate, 12, 0)
      const cbDate = addDays(today, -2)
      const cbIso = isoAt(cbDate, 10, 45)
      const parentPayId = `pay-${DEMO_TAG}-${spec.key}-full`
      paid_amount = netPaid
      notes.push(
        note(
          `note-${spec.key}-paid`,
          `Payment of $${money(spec.amount)} received via ACH. Marked paid.`,
          OPS,
          fullPayIso,
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-confirm`,
          'Confirmed — funds are in. Thanks.',
          CARRIER_CONTACT,
          isoAt(fullPayDate, 14, 0),
          'client_note',
          'client'
        ),
        note(
          `note-${spec.key}-cb`,
          `Short payment correction posted: chargeback of $${money(chargebackAmt)} against the original remittance. Net received now $${money(netPaid)} of $${money(spec.amount)}.`,
          OPS,
          cbIso,
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-cb-confirm`,
          `Confirmed the $${money(chargebackAmt)} chargeback. $${money(chargebackAmt)} still due — following up with ${broker.name}.`,
          CARRIER_CONTACT,
          isoAt(cbDate, 15, 20),
          'client_note',
          'client'
        )
      )
      payments.push(
        normalizePayment({
          id: parentPayId,
          client_id: clientId,
          invoice_id: invoiceId,
          invoice_number: spec.invoiceNumber,
          broker_name: broker.name,
          amount: spec.amount,
          payment_date: toDateStr(fullPayDate),
          received_date: toDateStr(fullPayDate),
          payment_method: 'ach',
          payment_reference: `ACH-${spec.invoiceNumber}`,
          status: 'confirmed',
          notes: 'Full payment received via ACH.',
          posted_source: 'credyx',
          posted_by: OPS,
          confirmed_by: OPS,
          confirmed_at: fullPayIso,
          client_confirmed_at: isoAt(fullPayDate, 14, 0),
          client_confirmed_by: CARRIER_CONTACT,
          payment_kind: 'normal',
          batch_id: batchId,
          batch_number: batchNumber,
          load_number: spec.loadNumber,
        }),
        normalizePayment({
          id: `pay-${DEMO_TAG}-${spec.key}-cb`,
          client_id: clientId,
          invoice_id: invoiceId,
          invoice_number: spec.invoiceNumber,
          broker_name: broker.name,
          amount: chargebackAmt,
          payment_date: toDateStr(cbDate),
          received_date: toDateStr(cbDate),
          payment_method: 'ach',
          payment_reference: `ACH-${spec.invoiceNumber}-CB`,
          status: 'confirmed',
          notes: 'Short payment — chargeback $350',
          posted_source: 'credyx',
          posted_by: OPS,
          confirmed_by: OPS,
          confirmed_at: cbIso,
          client_confirmed_at: isoAt(cbDate, 15, 20),
          client_confirmed_by: CARRIER_CONTACT,
          parent_payment_id: parentPayId,
          payment_kind: 'short',
          short_pay_reason: 'chargeback',
          batch_id: batchId,
          batch_number: batchNumber,
          load_number: spec.loadNumber,
        })
      )
      broker_contacted = true
      last_broker_contact = cbIso
      break
    }
    case 'short_writeoff': {
      // Confirmed short pay; remaining balance written off as uncollectable.
      status = 'written_off'
      const shortfall = 400
      const paidAmt = Math.round((spec.amount - shortfall) * 100) / 100
      const payDate = addDays(today, -12)
      const payIso = isoAt(payDate, 11, 30)
      const writeOffAt = isoAt(addDays(today, -1), 16, 0)
      paid_amount = paidAmt
      write_off_request = {
        requested_by: CARRIER_CONTACT,
        requested_at: isoAt(addDays(today, -3), 9, 15),
        client_note: `Broker deducted $${money(shortfall)} for claimed detention that we dispute. Accepting write-off on the balance.`,
        received_amount: paidAmt,
        shortfall,
        resolved_at: writeOffAt,
        resolved_by: OPS,
        resolution: 'approved',
        internal_note: 'Approved — aged short balance closed as uncollectable.',
      }
      notes.push(
        note(
          `note-${spec.key}-short`,
          `${broker.name} remitted $${money(paidAmt)} of $${money(spec.amount)}. Short by $${money(shortfall)} — detention claim.`,
          OPS,
          payIso,
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-confirm`,
          `Confirmed receipt of $${money(paidAmt)}.`,
          CARRIER_CONTACT,
          isoAt(payDate, 14, 0),
          'client_note',
          'client'
        ),
        note(
          `note-${spec.key}-wo-req`,
          `Write-off requested on remaining $${money(shortfall)} — disputed detention deduction.`,
          CARRIER_CONTACT,
          isoAt(addDays(today, -3), 9, 15),
          'client_note',
          'client'
        ),
        note(
          `note-${spec.key}-wo`,
          `Closed as uncollectable — received $${money(paidAmt)}, write-off $${money(shortfall)}. Disputed detention deduction accepted as uncollectable.`,
          OPS,
          writeOffAt,
          'status_update',
          'client'
        )
      )
      payments.push(
        normalizePayment({
          id: `pay-${DEMO_TAG}-${spec.key}`,
          client_id: clientId,
          invoice_id: invoiceId,
          invoice_number: spec.invoiceNumber,
          broker_name: broker.name,
          amount: paidAmt,
          payment_date: toDateStr(payDate),
          received_date: toDateStr(payDate),
          payment_method: 'ach',
          payment_reference: `ACH-${spec.invoiceNumber}`,
          status: 'confirmed',
          notes: 'Short pay — detention claim $400',
          posted_source: 'credyx',
          posted_by: OPS,
          confirmed_by: OPS,
          confirmed_at: payIso,
          client_confirmed_at: isoAt(payDate, 14, 0),
          client_confirmed_by: CARRIER_CONTACT,
          payment_kind: 'normal',
          batch_id: batchId,
          batch_number: batchNumber,
          load_number: spec.loadNumber,
        })
      )
      break
    }
    case 'will_pay': {
      status = 'approved'
      collection_status = 'W/P'
      collection_date = toDateStr(addDays(today, 5))
      broker_contacted = true
      last_broker_contact = isoAt(addDays(today, -3), 14, 0)
      notes.push(
        note(
          `note-${spec.key}-wp`,
          `${broker.name} AP confirmed will pay by ${collection_date}. Tracking as W/P.`,
          OPS,
          last_broker_contact,
          'status_update',
          'client'
        )
      )
      break
    }
    case 'callback': {
      status = 'approved'
      collection_status = 'C/B'
      collection_date = toDateStr(addDays(today, 2))
      broker_contacted = true
      last_broker_contact = isoAt(addDays(today, -1), 15, 45)
      notes.push(
        note(
          `note-${spec.key}-cb`,
          `Left voicemail with ${broker.name} AP. Callback scheduled for ${collection_date}.`,
          OPS,
          last_broker_contact,
          'status_update',
          'client'
        ),
        note(
          `note-${spec.key}-cb2`,
          'Will update after the callback.',
          OPS,
          isoAt(addDays(today, -1), 15, 50),
          'note',
          'client'
        )
      )
      break
    }
    case 'open':
    default: {
      status = 'approved'
      notes.push(
        note(
          `note-${spec.key}-track`,
          `Invoice submitted to ${broker.name}. Monitoring for acceptance and payment.`,
          OPS,
          isoAt(addDays(invDate, 3), 9, 0),
          'note',
          'client'
        )
      )
      break
    }
  }

  if (days_since_expected == null && expected < today && status === 'approved') {
    days_since_expected = daysBetween(expected, today)
  }

  const row: Json = {
    id: invoiceId,
    invoice_number: spec.invoiceNumber,
    client_id: clientId,
    client_name: clientName,
    broker_id: broker.id,
    broker_name: broker.name,
    amount: spec.amount,
    paid_amount,
    overpayment_accepted_at,
    write_off_request,
    invoice_date: toDateStr(invDate),
    due_date: toDateStr(due),
    expected_payment_date: toDateStr(expected),
    status,
    load_number: spec.loadNumber,
    batch_id: batchId,
    batch_number: batchNumber,
    reviewed_at: status === 'pending' ? null : approvedAt,
    reviewed_by: status === 'pending' ? null : OPS,
    approved_by:
      status === 'approved' ||
      status === 'paid' ||
      status === 'force_closed' ||
      status === 'written_off'
        ? OPS
        : null,
    approved_at:
      status === 'approved' ||
      status === 'paid' ||
      status === 'force_closed' ||
      status === 'written_off'
        ? approvedAt
        : null,
    hold_reason,
    notes: hold_reason,
    notes_history: notes,
    disputes,
    documents_count: spec.docsSent === false ? 1 : 4,
    broker_contacted,
    last_broker_contact,
    days_since_expected,
    document_send_history,
    remittance_snapshot: null,
    collection_date,
    collection_status,
    verification_status: 'Email',
    contact_persons: ['AP Desk', 'Dispatcher'],
    selected_contact_person: 'AP Desk',
    ai_confirmed_at: isoAt(invDate, 10, 45),
    ai_confirmed_by: CARRIER_CONTACT,
    ai_review_status: status === 'pending' ? 'running' : 'ready',
    ai_review_summary:
      status === 'pending' ? 'Review in progress' : 'All required docs present',
    fee_terms: {
      fee_type: 'percentage',
      fee_percentage: 1,
      billing_mode: 'billable',
      locked_at: createdAt,
    },
    created_at: createdAt,
    updated_at: new Date().toISOString(),
  }

  return { row, payments }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvFile()

  const baseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const positional = readPositionalArgs()
  const dryRun = positional.dryRun
  const clientIdArg = readArg('--client-id')
  const clientNameArg =
    readArg('--client') ?? positional.clientName ?? CLIENT_NAME_DEFAULT

  if (!baseUrl || !serviceKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const today = new Date()
  today.setHours(12, 0, 0, 0)

  console.log(`\nCredyx demo seed`)
  console.log(`  As of:     ${toDateStr(today)}`)
  console.log(`  Window:    last 4 months (relative)`)
  console.log(`  Client:    ${clientIdArg ?? clientNameArg}`)
  console.log(`  Dry run:   ${dryRun}\n`)

  // Resolve client
  let client: Json | undefined
  if (clientIdArg) {
    const { ok, data } = await rest<Json[]>(
      baseUrl,
      serviceKey,
      `clients?id=eq.${encodeURIComponent(clientIdArg)}&select=*`
    )
    if (!ok || !data?.[0]) {
      console.error(`Client id not found: ${clientIdArg}`)
      process.exit(1)
    }
    client = data[0]
  } else {
    // Exact name, then fuzzy contains (e.g. "ABC Trucking ( DEMO )")
    const exact = await rest<Json[]>(
      baseUrl,
      serviceKey,
      `clients?name=eq.${encodeURIComponent(clientNameArg)}&select=*&order=created_at.asc`
    )
    let matches = exact.ok ? exact.data ?? [] : []
    if (!matches.length) {
      const fuzzy = await rest<Json[]>(
        baseUrl,
        serviceKey,
        `clients?name=ilike.*${encodeURIComponent(clientNameArg)}*&select=*&order=created_at.asc`
      )
      matches = fuzzy.ok ? fuzzy.data ?? [] : []
    }
    if (!matches.length) {
      console.error(`No client named "${clientNameArg}". Create the client first (enroll / admin).`)
      process.exit(1)
    }
    // Prefer active match
    client = matches.find((c) => c.status === 'active') ?? matches[0]
  }

  const clientId = String(client!.id)
  const clientName = String(client!.name)
  const clientFactoring = Boolean(client!.factoring)
  const batchCode = String(client!.batch_code || 'ABCT').slice(0, 4).toUpperCase()

  console.log(`  Resolved:  ${clientName} (${clientId})\n`)

  // Preview counts
  const existingInv = await rest<Json[]>(
    baseUrl,
    serviceKey,
    `invoices?client_id=eq.${encodeURIComponent(clientId)}&select=id`
  )
  const existingPay = await rest<Json[]>(
    baseUrl,
    serviceKey,
    `payments?client_id=eq.${encodeURIComponent(clientId)}&select=id`
  )
  const existingBat = await rest<Json[]>(
    baseUrl,
    serviceKey,
    `batches?client_id=eq.${encodeURIComponent(clientId)}&select=id`
  )
  const existingDocs = await rest<Json[]>(
    baseUrl,
    serviceKey,
    `client_documents?client_id=eq.${encodeURIComponent(clientId)}&select=id`
  )

  const vaultDocsPreview = buildVaultDocuments(clientId, clientFactoring, today)

  console.log(`Will remove:`)
  console.log(`  payments:  ${existingPay.data?.length ?? 0}`)
  console.log(`  invoices:  ${existingInv.data?.length ?? 0}`)
  console.log(`  batches:   ${existingBat.data?.length ?? 0}`)
  console.log(`  vault docs:${existingDocs.data?.length ?? 0}`)
  console.log(`Will insert:`)
  console.log(`  brokers:   ${DEMO_BROKERS.length} (upsert)`)
  console.log(`  batches:   5`)
  console.log(`  invoices:  ${INVOICE_SPECS.length}`)
  console.log(
    `  payments:  ${INVOICE_SPECS.filter((s) =>
      [
        'paid',
        'awaiting_confirm',
        'short_awaiting',
        'short_confirmed',
        'over_awaiting',
        'over_confirmed',
        'chargeback',
        'short_writeoff',
      ].includes(s.scenario)
    ).length}+ (chargeback adds a correction row)`
  )
  console.log(`  vault docs:${vaultDocsPreview.length} (approved — setup complete)`)

  if (dryRun) {
    console.log('\nDry run only — no changes made.')
    // Show relative month labels
    for (let m = 3; m >= 0; m--) {
      const d = dateInMonth(m, 1)
      const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      const count = INVOICE_SPECS.filter((s) => s.monthsAgo === m).length
      console.log(`  ${label}: ${count} invoices`)
    }
    return
  }

  // 1) Wipe tenant A/R (order matters for FKs)
  console.log('\nWiping existing demo A/R…')
  const delPay = await rest(
    baseUrl,
    serviceKey,
    `payments?client_id=eq.${encodeURIComponent(clientId)}`,
    { method: 'DELETE', prefer: 'return=minimal' }
  )
  if (!delPay.ok) console.error('  payment delete warning', delPay.status, delPay.data)

  const delInv = await rest(
    baseUrl,
    serviceKey,
    `invoices?client_id=eq.${encodeURIComponent(clientId)}`,
    { method: 'DELETE', prefer: 'return=minimal' }
  )
  if (!delInv.ok) {
    console.error('Failed to delete invoices', delInv.status, delInv.data)
    process.exit(1)
  }

  const delBat = await rest(
    baseUrl,
    serviceKey,
    `batches?client_id=eq.${encodeURIComponent(clientId)}`,
    { method: 'DELETE', prefer: 'return=minimal' }
  )
  if (!delBat.ok) console.error('  batch delete warning', delBat.status, delBat.data)

  const delDocs = await rest(
    baseUrl,
    serviceKey,
    `client_documents?client_id=eq.${encodeURIComponent(clientId)}`,
    { method: 'DELETE', prefer: 'return=minimal' }
  )
  if (!delDocs.ok) console.error('  vault doc delete warning', delDocs.status, delDocs.data)

  // 2) Upsert demo brokers (stable ids)
  console.log('Upserting brokers…')
  for (const b of DEMO_BROKERS) {
    const row = {
      id: b.id,
      name: b.name,
      contact_person: 'AP Desk',
      email: b.email,
      phone: '555-0100',
      payment_terms_days: 30,
      updated_at: new Date().toISOString(),
    }
    const res = await rest(baseUrl, serviceKey, 'brokers?on_conflict=id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify(row),
    })
    if (!res.ok) {
      // Fallback: try insert ignoring conflict by patching name match
      console.warn(`  broker upsert ${b.name}:`, res.status, res.data)
    }
  }

  // 3) Batches — one per month; all processed same day as submitted
  // Current-month batch is always processed within the last 7 days (dashboard activity).
  console.log('Creating batches…')
  const year = today.getFullYear()
  const batches: { id: string; batch_number: string; monthsAgo: number; status: string }[] = [
    {
      id: `batch-${DEMO_TAG}-m4`,
      batch_number: `${batchCode}-${year}-M4`,
      monthsAgo: 4,
      status: 'submitted',
    },
    {
      id: `batch-${DEMO_TAG}-m3`,
      batch_number: `${batchCode}-${year}-M3`,
      monthsAgo: 3,
      status: 'submitted',
    },
    {
      id: `batch-${DEMO_TAG}-m2`,
      batch_number: `${batchCode}-${year}-M2`,
      monthsAgo: 2,
      status: 'submitted',
    },
    {
      id: `batch-${DEMO_TAG}-m1`,
      batch_number: `${batchCode}-${year}-M1`,
      monthsAgo: 1,
      status: 'submitted',
    },
    {
      id: `batch-${DEMO_TAG}-m0`,
      batch_number: `${batchCode}-${year}-M0`,
      monthsAgo: 0,
      status: 'submitted',
    },
  ]

  const batchRows = batches.map((b) => {
    // M0 = processed ~3 days ago; older months stay on their calendar month
    const submitted =
      b.monthsAgo === 0 ? addDays(today, -3) : dateInMonth(b.monthsAgo, 5)
    const specs = INVOICE_SPECS.filter((s) => s.batch === b.monthsAgo)
    const total = specs.reduce((sum, s) => sum + s.amount, 0)
    const processedAt = isoAt(submitted, 15, 30) // same-day process
    return {
      id: b.id,
      batch_number: b.batch_number,
      client_id: clientId,
      client_name: clientName,
      total_invoices: specs.length,
      total_amount: total,
      minutes_since_submitted: Math.max(60, daysBetween(submitted, today) * 24 * 60),
      status: b.status,
      submitted_at: isoAt(submitted, 11, 0),
      in_use: false,
      in_use_by: null,
      fee_terms: {
        fee_type: 'percentage',
        fee_percentage: 1,
        billing_mode: 'billable',
        locked_at: isoAt(submitted, 10, 0),
      },
      reviewed_at: processedAt,
      reviewed_by: OPS,
      approved_count: specs.filter((s) => s.scenario !== 'hold_dispute').length,
      rejected_count: 0,
      created_at: isoAt(submitted, 10, 0),
      updated_at: new Date().toISOString(),
    }
  })

  const batIns = await rest(baseUrl, serviceKey, 'batches', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify(batchRows),
  })
  if (!batIns.ok) {
    console.error('Failed to insert batches', batIns.status, batIns.data)
    process.exit(1)
  }

  // 4) Invoices + payments
  console.log('Creating invoices + payments…')
  const invoiceRows: Json[] = []
  const paymentRows: Json[] = []

  for (const spec of INVOICE_SPECS) {
    const broker = DEMO_BROKERS[spec.brokerIndex % DEMO_BROKERS.length]
    const batchMeta = batches.find((b) => b.monthsAgo === spec.batch)!

    const built = buildInvoice(
      spec,
      clientId,
      clientName,
      batchMeta.id,
      batchMeta.batch_number,
      broker,
      today
    )
    invoiceRows.push(built.row)
    paymentRows.push(...built.payments)
  }

  const invIns = await rest(baseUrl, serviceKey, 'invoices', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify(invoiceRows),
  })
  if (!invIns.ok) {
    console.error('Failed to insert invoices', invIns.status, invIns.data)
    process.exit(1)
  }

  if (paymentRows.length) {
    const payIns = await rest(baseUrl, serviceKey, 'payments', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify(paymentRows),
    })
    if (!payIns.ok) {
      console.error('Failed to insert payments', payIns.status, payIns.data)
      process.exit(1)
    }
  }

  // 5) Document vault — approved setup packet (setup complete)
  console.log('Creating vault documents…')
  const vaultRows = buildVaultDocuments(clientId, clientFactoring, today)
  if (vaultRows.length) {
    const docIns = await rest(baseUrl, serviceKey, 'client_documents', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify(vaultRows),
    })
    if (!docIns.ok) {
      console.error('Failed to insert vault documents', docIns.status, docIns.data)
      process.exit(1)
    }
  }

  // Summary by scenario
  const byScenario = INVOICE_SPECS.reduce<Record<string, number>>((acc, s) => {
    acc[s.scenario] = (acc[s.scenario] ?? 0) + 1
    return acc
  }, {})

  console.log('\nDone.')
  console.log(`  Client:   ${clientName}`)
  console.log(`  Invoices: ${invoiceRows.length}`)
  console.log(`  Payments: ${paymentRows.length}`)
  console.log(`  Vault:    ${vaultRows.length} approved docs (setup complete)`)
  console.log('  Mix:', byScenario)
  console.log('\nRe-run anytime to refresh dates to the latest 4 months:')
  console.log(`  npm run seed-demo -- "${clientName}"`)
  console.log('')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
