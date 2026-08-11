/**
 * Seed one submitted batch of open invoices that are always N days old.
 *
 * Dates are relative to *real* calendar today (not the demo seed as-of):
 *   submitted_at / invoice_date / PPW sent = today − N
 *
 * Notes: only “PPW sent to broker” (no submit / review / chase notes).
 * Does not wipe the main demo seed — only this script’s rows (id prefix `d{N}`).
 *
 * Usage:
 *   npm run seed-30day -- "ABC Trucking"          # 10 invoices, today−30
 *   npm run seed-45day -- "ABC Trucking"          # 5 invoices, today−45
 *   npm run seed-30day -- --client-id client-xxx
 *   npm run seed-45day -- "ABC Trucking" dry-run
 *   npm run seed-45day -- "ABC Trucking" wipe-only
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL in .env
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CLIENT_NAME_DEFAULT = 'ABC Trucking'
const OPS = 'Credyx Ops'
const TERMS_DAYS = 30
const VALUE_FLAGS = new Set(['--days', '--count', '--client', '--client-id'])

type Json = Record<string, unknown>

interface DemoBroker {
  id: string
  name: string
  email: string
}

const BROKERS: DemoBroker[] = [
  { id: 'broker-demo-tql', name: 'TQL', email: 'ap@tql.example' },
  { id: 'broker-demo-landstar', name: 'LANDSTAR RANGER INC', email: 'payables@landstar.example' },
  { id: 'broker-demo-newage', name: 'New Age Logistics', email: 'billing@newage.example' },
  { id: 'broker-demo-agl', name: 'AGL GROUP', email: 'ap@aglgroup.example' },
]

/** Stable amounts so re-seeds stay recognizable. */
const INVOICE_AMOUNTS = [
  2450, 1875.5, 3200, 4100, 2750, 1980, 1560, 2890, 3650, 2100,
]

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

function readIntArg(flag: string, fallback: number): number {
  const raw = readArg(flag)
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function readPositionalArgs(): {
  clientName?: string
  dryRun: boolean
  wipeOnly: boolean
} {
  const argv = process.argv.slice(2)
  const args: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (VALUE_FLAGS.has(argv[i])) {
      i += 1
      continue
    }
    if (argv[i].startsWith('--')) continue
    args.push(argv[i])
  }
  const dryRun = hasFlag('--dry-run') || args.includes('dry-run')
  const wipeOnly = hasFlag('--wipe-only') || args.includes('wipe-only')
  const clientName = args.find((a) => a !== 'dry-run' && a !== 'wipe-only')
  return { clientName, dryRun, wipeOnly }
}

// ─── Date helpers (relative to real today) ───────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
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

/** Safe id fragment from a client UUID / slug. */
function clientKey(clientId: string): string {
  return clientId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'client'
}

// ─── Supabase REST ───────────────────────────────────────────────────────────

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

async function resolveClient(
  baseUrl: string,
  serviceKey: string,
  clientIdArg: string | undefined,
  clientNameArg: string
): Promise<Json> {
  if (clientIdArg) {
    const { ok, data } = await rest<Json[]>(
      baseUrl,
      serviceKey,
      `clients?id=eq.${encodeURIComponent(clientIdArg)}&select=*`
    )
    if (!ok || !data?.[0]) {
      throw new Error(`Client id not found: ${clientIdArg}`)
    }
    return data[0]
  }

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
    throw new Error(`No client named "${clientNameArg}". Create the client first (enroll / admin).`)
  }
  return matches.find((c) => c.status === 'active') ?? matches[0]
}

// ─── Row builders ────────────────────────────────────────────────────────────

function feeTerms(lockedAt: string): Json {
  return {
    fee_type: 'percentage',
    fee_percentage: 1,
    billing_mode: 'billable',
    locked_at: lockedAt,
  }
}

function buildBatchRow(opts: {
  batchId: string
  batchNumber: string
  clientId: string
  clientName: string
  submitted: Date
  today: Date
  totalAmount: number
  invoiceCount: number
}): Json {
  const { batchId, batchNumber, clientId, clientName, submitted, today, totalAmount, invoiceCount } =
    opts
  const processedAt = isoAt(submitted, 15, 30)
  return {
    id: batchId,
    batch_number: batchNumber,
    client_id: clientId,
    client_name: clientName,
    total_invoices: invoiceCount,
    total_amount: totalAmount,
    minutes_since_submitted: Math.max(60, daysBetween(submitted, today) * 24 * 60),
    status: 'submitted',
    submitted_at: isoAt(submitted, 11, 0),
    in_use: false,
    in_use_by: null,
    upload_mode: 'manual',
    sort_status: null,
    fee_terms: feeTerms(isoAt(submitted, 10, 0)),
    reviewed_at: processedAt,
    reviewed_by: OPS,
    approved_count: invoiceCount,
    rejected_count: 0,
    created_at: isoAt(submitted, 10, 0),
    updated_at: isoAt(today, 12, 0),
  }
}

/**
 * Approved open invoice dated today−N. Only note is PPW sent to the broker.
 */
function buildInvoiceRow(opts: {
  index: number
  clientId: string
  clientName: string
  batchId: string
  batchNumber: string
  broker: DemoBroker
  submitted: Date
  today: Date
  due: Date
  seedTag: string
  numberPrefix: string
}): Json {
  const {
    index,
    clientId,
    clientName,
    batchId,
    batchNumber,
    broker,
    submitted,
    today,
    due,
    seedTag,
    numberPrefix,
  } = opts
  const n = String(index + 1).padStart(2, '0')
  const invoiceId = `inv-${seedTag}-${clientKey(clientId)}-${n}`
  const invoiceNumber = `${numberPrefix}-${n}`
  const loadNumber = `LD-${numberPrefix}-${n}`
  const amount = INVOICE_AMOUNTS[index] ?? 2000 + index * 100
  const docs = ['invoice.pdf', 'bol.pdf', 'pod.pdf', 'ratecon.pdf']
  const createdAt = isoAt(submitted, 10, 15)
  const approvedAt = isoAt(submitted, 11, 0)
  const ppwAt = isoAt(submitted, 15, 20)
  const asOfIso = isoAt(today, 12, 0)

  return {
    id: invoiceId,
    invoice_number: invoiceNumber,
    client_id: clientId,
    client_name: clientName,
    broker_id: broker.id,
    broker_name: broker.name,
    amount,
    paid_amount: null,
    overpayment_accepted_at: null,
    write_off_request: null,
    invoice_date: toDateStr(submitted),
    due_date: toDateStr(due),
    expected_payment_date: toDateStr(due),
    status: 'approved',
    load_number: loadNumber,
    batch_id: batchId,
    batch_number: batchNumber,
    reviewed_at: approvedAt,
    reviewed_by: OPS,
    approved_by: OPS,
    approved_at: approvedAt,
    hold_reason: null,
    notes: null,
    notes_history: [
      {
        id: `note-${seedTag}-${n}-ppw`,
        note: `PPW sent to ${broker.name} AP (${broker.email}) — invoice, BOL, POD, rate con.`,
        created_by: OPS,
        created_at: ppwAt,
        type: 'status_update',
        visibility: 'client',
      },
    ],
    disputes: [],
    documents_count: 4,
    broker_contacted: false,
    last_broker_contact: null,
    days_since_expected: Math.max(0, daysBetween(due, today)),
    document_send_history: [
      {
        email_address: broker.email,
        sent_at: ppwAt,
        sent_by: OPS,
        status: 'delivered',
        documents_sent: docs,
      },
    ],
    remittance_snapshot: null,
    collection_date: null,
    collection_status: null,
    verification_status: 'Email',
    contact_persons: ['AP Desk', 'Dispatcher'],
    selected_contact_person: 'AP Desk',
    ai_confirmed_at: isoAt(submitted, 10, 45),
    ai_confirmed_by: OPS,
    ai_review_status: 'ready',
    ai_review_summary: 'All required docs present',
    fee_terms: feeTerms(createdAt),
    created_at: createdAt,
    updated_at: asOfIso,
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvFile()

  const ageDays = readIntArg('--days', 30)
  const invoiceCount = readIntArg('--count', 10)
  const seedTag = `d${ageDays}`
  const numberPrefix = `D${ageDays}`
  const npmScript = ageDays === 45 && invoiceCount === 5 ? 'seed-45day' : 'seed-30day'

  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const submitted = addDays(today, -ageDays)
  const due = addDays(submitted, TERMS_DAYS)

  const baseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const positional = readPositionalArgs()
  const dryRun = positional.dryRun
  const wipeOnly = positional.wipeOnly
  const clientIdArg = readArg('--client-id')
  const clientNameArg = readArg('--client') ?? positional.clientName ?? CLIENT_NAME_DEFAULT

  if (!baseUrl || !serviceKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  console.log(`\nCredyx ${ageDays}-day batch seed`)
  console.log(`  Today:     ${toDateStr(today)}`)
  console.log(`  Submitted: ${toDateStr(submitted)} (today − ${ageDays})`)
  console.log(`  Due:       ${toDateStr(due)} (net ${TERMS_DAYS})`)
  console.log(`  Client:    ${clientIdArg ?? clientNameArg}`)
  console.log(`  Dry run:   ${dryRun}`)
  console.log(`  Wipe only: ${wipeOnly}\n`)

  const client = await resolveClient(baseUrl, serviceKey, clientIdArg, clientNameArg)
  const clientId = String(client.id)
  const clientName = String(client.name)
  const batchCode = String(client.batch_code || 'ABCT').slice(0, 4).toUpperCase()
  const key = clientKey(clientId)
  const batchId = `batch-${seedTag}-${key}`
  const year = today.getFullYear()
  const batchNumber = `${batchCode}-${year}-${numberPrefix}`
  const invoiceIdPrefix = `inv-${seedTag}-${key}-`
  const totalAmount = INVOICE_AMOUNTS.slice(0, invoiceCount).reduce((sum, n) => sum + n, 0)

  console.log(`  Resolved:  ${clientName} (${clientId})\n`)

  const existingInv = await rest<Json[]>(
    baseUrl,
    serviceKey,
    `invoices?client_id=eq.${encodeURIComponent(clientId)}&id=like.${encodeURIComponent(invoiceIdPrefix)}*&select=id`
  )
  const existingBat = await rest<Json[]>(
    baseUrl,
    serviceKey,
    `batches?client_id=eq.${encodeURIComponent(clientId)}&id=eq.${encodeURIComponent(batchId)}&select=id`
  )

  console.log(`Will remove (this seed only):`)
  console.log(`  invoices:  ${existingInv.data?.length ?? 0}`)
  console.log(`  batches:   ${existingBat.data?.length ?? 0}`)
  if (!wipeOnly) {
    console.log(`Will insert:`)
    console.log(`  brokers:   ${BROKERS.length} (upsert)`)
    console.log(`  batches:   1 (${batchNumber})`)
    console.log(`  invoices:  ${invoiceCount} (open, PPW-only notes)`)
  }

  if (dryRun) {
    console.log('\nDry run only — no changes made.')
    return
  }

  console.log(`\nWiping prior ${ageDays}-day seed rows…`)
  const delInv = await rest(
    baseUrl,
    serviceKey,
    `invoices?client_id=eq.${encodeURIComponent(clientId)}&id=like.${encodeURIComponent(invoiceIdPrefix)}*`,
    { method: 'DELETE', prefer: 'return=minimal' }
  )
  if (!delInv.ok) {
    console.error(`Failed to delete ${ageDays}-day invoices`, delInv.status, delInv.data)
    process.exit(1)
  }

  const delBat = await rest(
    baseUrl,
    serviceKey,
    `batches?client_id=eq.${encodeURIComponent(clientId)}&id=eq.${encodeURIComponent(batchId)}`,
    { method: 'DELETE', prefer: 'return=minimal' }
  )
  if (!delBat.ok) console.error('  batch delete warning', delBat.status, delBat.data)

  if (wipeOnly) {
    console.log('\nWipe complete — other A/R left intact.')
    console.log(`Restore later with:`)
    console.log(`  npm run ${npmScript} -- "${clientName}"`)
    return
  }

  console.log('Upserting brokers…')
  for (const b of BROKERS) {
    const row = {
      id: b.id,
      name: b.name,
      contact_person: 'AP Desk',
      email: b.email,
      phone: '555-0100',
      payment_terms_days: TERMS_DAYS,
      updated_at: isoAt(today, 12, 0),
    }
    const res = await rest(baseUrl, serviceKey, 'brokers?on_conflict=id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify(row),
    })
    if (!res.ok) console.warn(`  broker upsert ${b.name}:`, res.status, res.data)
  }

  console.log('Creating batch…')
  const batchRow = buildBatchRow({
    batchId,
    batchNumber,
    clientId,
    clientName,
    submitted,
    today,
    totalAmount,
    invoiceCount,
  })
  const batIns = await rest(baseUrl, serviceKey, 'batches', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify(batchRow),
  })
  if (!batIns.ok) {
    console.error('Failed to insert batch', batIns.status, batIns.data)
    process.exit(1)
  }

  console.log('Creating invoices…')
  const invoiceRows = Array.from({ length: invoiceCount }, (_, index) =>
    buildInvoiceRow({
      index,
      clientId,
      clientName,
      batchId,
      batchNumber,
      broker: BROKERS[index % BROKERS.length],
      submitted,
      today,
      due,
      seedTag,
      numberPrefix,
    })
  )

  const invIns = await rest(baseUrl, serviceKey, 'invoices', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify(invoiceRows),
  })
  if (!invIns.ok) {
    console.error('Failed to insert invoices', invIns.status, invIns.data)
    process.exit(1)
  }

  console.log('\nDone.')
  console.log(`  Client:   ${clientName}`)
  console.log(`  Batch:    ${batchNumber} submitted ${toDateStr(submitted)}`)
  console.log(
    `  Invoices: ${invoiceRows.length} (${numberPrefix}-01 … ${numberPrefix}-${String(invoiceCount).padStart(2, '0')})`
  )
  console.log(`  Notes:    PPW sent to broker only`)
  console.log(`\nRe-run anytime to keep this batch exactly ${ageDays} days old:`)
  console.log(`  npm run ${npmScript} -- "${clientName}"`)
  console.log('')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
