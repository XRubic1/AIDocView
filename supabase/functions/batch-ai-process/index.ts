/**
 * Background DocSort / AI verification worker — browser-free.
 * Auth: user JWT (submit kick) or x-cron-secret (scheduled drain).
 *
 * Batches with no invoices: run the full server Doc Split pipeline
 * (split PDFs → classify → extract → match → create packets), checkpointed
 * into batch.doc_sort_snapshot so each tick resumes where the last stopped.
 * Batches with invoices: rebuild review from snapshot extracts (no vision).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  batchWantsServerDocSplit,
  runServerDocSplitPipeline,
} from './docSplitPipeline.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-auth',
}

type JobRow = {
  id: string
  batch_id: string
  client_id: string
  kind: string
  status: string
  attempts: number
  max_attempts: number
  locked_at: string | null
  locked_by: string | null
}

/** Fresh browser lock = a live tab owns this job; edge must not double-run. */
const BROWSER_LOCK_FRESH_MS = 2 * 60_000
/** Stale edge lock = a previous invocation crashed; safe to reclaim. */
const EDGE_LOCK_FRESH_MS = 5 * 60_000

function lockAgeMs(job: JobRow): number {
  if (!job.locked_at) return Number.MAX_SAFE_INTEGER
  const at = new Date(job.locked_at).getTime()
  return Number.isFinite(at) ? Date.now() - at : Number.MAX_SAFE_INTEGER
}

function isBrowserLock(job: JobRow): boolean {
  const by = job.locked_by ?? ''
  return by === 'browser-pipeline' || by === 'doc-split-pipeline' || by === ''
}

type InvoiceRow = {
  id: string
  invoice_number: string
  load_number: string | null
  amount: number
  broker_name: string | null
  client_name: string | null
  document_doc_ids: string[] | null
  ai_review_status: string | null
  ai_review_snapshot?: string | null
}

type Fingerprint = {
  docId: string
  fileName: string
  kind: string
  loadNumbers?: string[]
  broker?: string
  carrier?: string
  pickup?: string
  delivery?: string
  rateAmount?: number
  extract?: Record<string, unknown>
}

type CheckStatus = 'ok' | 'issue' | 'warning' | 'info' | 'missing'

type LoadCheckRow = {
  id: string
  label: string
  status: CheckStatus
  summary: string
  detail?: string
  excelValue?: string
  documentValue?: string
}

type PaperworkFields = {
  loadNumber?: string
  amount?: number
  brokerName?: string
  brokerDomain?: string
  carrierName?: string
  pickup?: string
  destinations?: string
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseFingerprints(raw: string | null | undefined): Map<string, Fingerprint> {
  const map = new Map<string, Fingerprint>()
  if (!raw) return map
  try {
    const parsed = JSON.parse(raw) as { fingerprints?: Fingerprint[] }
    for (const fp of parsed.fingerprints ?? []) {
      if (fp?.docId) map.set(fp.docId, fp)
    }
  } catch {
    /* ignore */
  }
  return map
}

function normalizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

function namesAlign(a?: string | null, b?: string | null): boolean {
  if (!a?.trim() || !b?.trim()) return false
  const left = a.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const right = b.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

function laneCityOnBol(lane: string, bolDelivery: string): boolean {
  const hay = bolDelivery.toLowerCase()
  return lane
    .split(/→|->|\||;/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 2)
    .some((part) => hay.includes(part) || namesAlign(part, bolDelivery))
}

function loadKeysAlign(a?: string | null, b?: string | null): boolean {
  if (!a?.trim() || !b?.trim()) return false
  const left = normalizeId(a)
  const right = normalizeId(b)
  if (!left || !right) return false
  return left === right || left.endsWith(right) || right.endsWith(left)
}

function checkRow(
  id: string,
  label: string,
  status: CheckStatus,
  summary: string,
  onFile?: string,
  paperwork?: string
): LoadCheckRow {
  return {
    id,
    label,
    status,
    summary,
    detail: `On file: ${onFile?.trim() || '—'} · Paperwork: ${paperwork?.trim() || '—'}`,
    excelValue: onFile,
    documentValue: paperwork,
  }
}

function formatStop(stop: unknown): string | undefined {
  if (!stop) return undefined
  if (typeof stop === 'string') return stop.trim() || undefined
  if (typeof stop !== 'object') return undefined
  const o = stop as Record<string, unknown>
  const city = String(o.city ?? '').trim()
  const state = String(o.state ?? '').trim()
  if (city && state) return `${city}, ${state}`
  return city || state || undefined
}

/** Pull display fields from DocSort fingerprint extracts for the UI "Extracted from paperwork" panel. */
function paperworkFromFingerprints(fps: Fingerprint[], inv: InvoiceRow): PaperworkFields {
  const rc = fps.find((f) => f.kind === 'rate_confirmation')
  const extract = (rc?.extract ?? {}) as Record<string, unknown>
  const rateCon = (extract.rateConParse ?? {}) as Record<string, unknown>
  const destinations = Array.isArray(rateCon.destinations) ? rateCon.destinations : []
  const lastStop = destinations[destinations.length - 1]

  const loadNumber =
    String(rateCon.load_number ?? extract.loadNumber ?? '').trim() ||
    rc?.loadNumbers?.[0] ||
    inv.load_number ||
    undefined
  const amount =
    typeof rateCon.rate_total === 'number' && rateCon.rate_total > 0
      ? rateCon.rate_total
      : typeof rc?.rateAmount === 'number' && rc.rateAmount > 0
        ? rc.rateAmount
        : inv.amount > 0
          ? inv.amount
          : undefined
  const brokerName =
    String(rateCon.broker_name ?? '').trim() || rc?.broker || inv.broker_name || undefined
  const carrierName =
    String(rateCon.carrier_name ?? '').trim() || rc?.carrier || inv.client_name || undefined
  const pickup = formatStop(rateCon.origin) || rc?.pickup || undefined
  const destinationsLine =
    destinations
      .map((d) => formatStop(d))
      .filter(Boolean)
      .join(' → ') ||
    rc?.delivery ||
    undefined

  return {
    loadNumber: loadNumber || undefined,
    amount,
    brokerName: brokerName || undefined,
    carrierName: carrierName || undefined,
    pickup,
    destinations: destinationsLine || undefined,
  }
}

/** True when a stored snapshot cannot render in InvoiceAiReviewOutcomePanel. */
function isMalformedAiReviewSnapshot(raw: string | null | undefined): boolean {
  if (!raw) return true
  try {
    const parsed = JSON.parse(raw) as { requiredAll?: unknown }
    const rows = parsed.requiredAll
    if (!Array.isArray(rows) || rows.length === 0) return true
    return rows.some((row) => typeof row === 'string' || !row || typeof row !== 'object' || !('status' in (row as object)))
  } catch {
    return true
  }
}

/** Heuristic verification from DocSort extract JSON (no second vision pass). */
function verifyInvoiceFromCatalog(
  inv: InvoiceRow,
  catalog: Map<string, Fingerprint>
): {
  status: 'ready' | 'needs_work'
  headline: string
  detail: string
  snapshot: Record<string, unknown>
} {
  const docIds = (inv.document_doc_ids ?? []).filter((id) => !id.startsWith('invoice-pdf-'))
  const fps = docIds.map((id) => catalog.get(id)).filter(Boolean) as Fingerprint[]

  if (docIds.length === 0) {
    const detail = 'No documents on file for AI review'
    return {
      status: 'needs_work',
      headline: 'Needs additional work',
      detail,
      snapshot: minimalSnapshot(detail, [detail]),
    }
  }

  if (fps.length < docIds.length) {
    const detail = 'Some documents are missing DocSort extracts — open AI verification to re-scan'
    return {
      status: 'needs_work',
      headline: 'Needs additional work',
      detail,
      snapshot: minimalSnapshot(detail, [detail]),
    }
  }

  const hasRc = fps.some((f) => f.kind === 'rate_confirmation' || /rate/i.test(f.kind))
  const hasBol = fps.some(
    (f) => f.kind === 'bol' || f.kind === 'bill_of_lading' || /bol/i.test(f.kind)
  )
  const paperwork = paperworkFromFingerprints(fps, inv)

  const loadOnFile = (inv.load_number || '').trim()
  const loadPaper = (paperwork.loadNumber || '').trim()
  const loadOk =
    (!loadOnFile && !loadPaper) ||
    (Boolean(loadOnFile) && Boolean(loadPaper) && loadKeysAlign(loadOnFile, loadPaper)) ||
    (Boolean(loadOnFile) &&
      fps.some((f) => (f.loadNumbers ?? []).some((n) => loadKeysAlign(n, loadOnFile))))

  const amountOnFile = inv.amount
  const amountPaper = paperwork.amount
  const amountOk =
    amountPaper == null ||
    amountOnFile == null ||
    Math.abs(Number(amountOnFile) - Number(amountPaper)) < 0.02

  const brokerOnFile = (inv.broker_name || '').trim()
  const brokerPaper = (paperwork.brokerName || '').trim()
  const brokerOk = !brokerPaper || !brokerOnFile || namesAlign(brokerOnFile, brokerPaper)

  const carrierOnFile = (inv.client_name || '').trim()
  const carrierPaper = (paperwork.carrierName || '').trim()
  const carrierOk = !carrierPaper || !carrierOnFile || namesAlign(carrierOnFile, carrierPaper)

  const bolFp = fps.find(
    (f) => f.kind === 'bol' || f.kind === 'bill_of_lading' || /bol/i.test(f.kind)
  )
  const bolExtract = (bolFp?.extract ?? {}) as Record<string, unknown>
  const bolAudit = (bolExtract.bolAudit ?? bolExtract) as Record<string, unknown>
  const bolDelivery = String(bolAudit.ship_to ?? bolFp?.delivery ?? '').trim()
  const receiver = String(
    (bolAudit.signatures as { receiver?: string } | undefined)?.receiver ??
      bolAudit.receiver_signature ??
      ''
  ).toUpperCase()
  const signatureMissing = receiver === 'MISSING' || receiver === 'ABSENT' || receiver === 'FAIL'
  const bolOk = hasBol && !signatureMissing && (Boolean(bolDelivery) || hasRc)
  const bolSummary = !hasBol
    ? 'Missing bill of lading.'
    : signatureMissing
      ? 'Receiver signature is missing or unclear.'
      : bolDelivery
        ? 'Signed and delivery address is on the bill of lading.'
        : 'Bill of lading is in the packet. Delivery address was not read.'

  const lane = (paperwork.destinations || '').trim()
  const stopsOk =
    hasBol &&
    Boolean(lane) &&
    (bolDelivery ? namesAlign(lane, bolDelivery) || laneCityOnBol(lane, bolDelivery) : false)
  const stopsSummary = !hasBol
    ? 'No bill of lading. Delivery stops cannot be verified.'
    : !lane
      ? 'Delivery stops were not found on the rate confirmation.'
      : !bolDelivery
        ? 'Delivery stop on the rate confirmation was not confirmed on the bill of lading.'
        : stopsOk
          ? 'Delivery stops on the rate confirmation are covered by the bill of lading.'
          : 'Delivery address on the bill of lading does not match the rate confirmation.'

  const pageNotes = [
    String(bolAudit.page_count_notes ?? ''),
    ...(Array.isArray(bolAudit.flags) ? (bolAudit.flags as string[]) : []),
  ].join(' ')
  const printed = pageNotes.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i)
  const printedCurrent = printed ? Number(printed[1]) : 0
  const printedTotal = printed ? Number(printed[2]) : 0
  const pageStatus = String(bolAudit.page_count ?? '').toUpperCase()
  const pageIncomplete =
    hasBol &&
    (pageStatus === 'INCOMPLETE' || pageStatus === 'FAIL') &&
    printedTotal > 1
  const pageOk = hasBol && !pageIncomplete
  const pageSummary = !hasBol
    ? 'No bill of lading found on this packet.'
    : pageIncomplete
      ? `Form shows page ${printedCurrent} of ${printedTotal} — missing BOL page(s).`
      : printedTotal > 1
        ? `Printed pagination ${printedCurrent} of ${printedTotal} — complete set on file.`
        : printedTotal === 1
          ? 'BOL shows page 1 of 1.'
          : 'No printed page count on BOL — assumed complete.'
  const pageValue = !hasBol
    ? 'Not found'
    : printedTotal > 0
      ? `${printedCurrent}/${printedTotal}`
      : 'No page mark'

  const requiredAll: LoadCheckRow[] = [
    checkRow(
      'req_load',
      'Load number',
      loadOk ? 'ok' : 'issue',
      loadOk
        ? 'Load number matches the packet on file.'
        : 'Load number on paperwork does not match the packet.',
      loadOnFile || undefined,
      loadPaper || undefined
    ),
    checkRow(
      'req_broker',
      'Broker name',
      brokerOk ? 'ok' : 'issue',
      brokerOk
        ? 'Broker name matches the packet on file.'
        : 'Broker name on paperwork does not match the packet.',
      brokerOnFile || undefined,
      brokerPaper || undefined
    ),
    checkRow(
      'req_amount',
      'Freight amount',
      amountOk ? 'ok' : 'issue',
      amountOk
        ? 'Freight amount matches the packet on file.'
        : 'Freight amount on paperwork does not match the packet.',
      amountOnFile != null ? String(amountOnFile) : undefined,
      amountPaper != null ? String(amountPaper) : undefined
    ),
    checkRow(
      'req_bol',
      'Bill of lading (signed & delivery address)',
      bolOk ? 'ok' : 'issue',
      bolSummary,
      hasBol ? 'present' : 'missing',
      hasBol ? bolDelivery || 'present' : 'missing'
    ),
    checkRow(
      'req_stops',
      'All delivery stops covered',
      stopsOk ? 'ok' : 'issue',
      stopsSummary,
      paperwork.destinations,
      bolDelivery || undefined
    ),
    checkRow(
      'req_carrier',
      'Carrier name',
      carrierOk ? 'ok' : 'issue',
      carrierOk
        ? 'Carrier name matches the account on file.'
        : 'Carrier name on paperwork does not match the account.',
      carrierOnFile || undefined,
      carrierPaper || undefined
    ),
    checkRow(
      'req_page_count',
      'BOL page count',
      pageOk ? 'ok' : 'issue',
      pageSummary,
      pageValue,
      pageValue
    ),
  ]

  const requiredPassed = requiredAll.filter((r) => r.status === 'ok')
  const requiredFailed = requiredAll.filter((r) => r.status !== 'ok')
  const issues = requiredFailed.map((r) => r.summary)
  const ready = requiredFailed.length === 0
  const headline = ready ? 'Good to go' : 'Needs additional work'
  const detail = ready
    ? `All ${requiredAll.length} required checks passed.`
    : issues.join('; ')

  return {
    status: ready ? 'ready' : 'needs_work',
    headline,
    detail,
    snapshot: {
      headline,
      detail,
      ready,
      passCount: requiredPassed.length,
      requiredTotal: requiredAll.length,
      requiredAll,
      requiredFailed,
      requiredPassed,
      additional: [],
      issues,
      warnings: [],
      paperwork,
      reviewedAt: new Date().toISOString(),
      source: 'batch-ai-process-edge',
    },
  }
}

function minimalSnapshot(detail: string, issues: string[]) {
  return {
    headline: 'Needs additional work',
    detail,
    ready: false,
    passCount: 0,
    requiredTotal: 0,
    requiredAll: [] as LoadCheckRow[],
    requiredFailed: [] as LoadCheckRow[],
    requiredPassed: [] as LoadCheckRow[],
    additional: [] as LoadCheckRow[],
    issues,
    warnings: [] as string[],
    paperwork: {},
    reviewedAt: new Date().toISOString(),
    source: 'batch-ai-process-edge',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const cronSecret = Deno.env.get('OPS_CRON_SECRET')
    const providedCron = req.headers.get('x-cron-secret')
    const isCron = Boolean(cronSecret && providedCron === cronSecret)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? ''

    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
    }

    if (!isCron) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return json(401, { error: 'Unauthorized' })
      }
      const jwt = authHeader.slice('Bearer '.length).trim()
      const userClient = createClient(supabaseUrl, anonKey || serviceKey)
      const { data: userData, error: userError } = await userClient.auth.getUser(jwt)
      if (userError || !userData.user) {
        return json(401, { error: 'Unauthorized', detail: userError?.message })
      }
    }

    const admin = createClient(supabaseUrl, serviceKey)
    let body: { batchId?: string; source?: string; limit?: number } = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 20)
    let jobs: JobRow[] = []

    if (body.batchId) {
      const { data } = await admin
        .from('batch_processing_jobs')
        .select('id, batch_id, client_id, kind, status, attempts, max_attempts, locked_at, locked_by')
        .eq('batch_id', body.batchId)
        .in('status', ['pending', 'running', 'failed'])
        .order('created_at', { ascending: false })
        .limit(1)
      jobs = (data as JobRow[]) ?? []
      // Re-queue failed when explicitly kicked for a batch.
      if (jobs[0]?.status === 'failed') {
        await admin
          .from('batch_processing_jobs')
          .update({
            status: 'pending',
            last_error: null,
            locked_at: null,
            locked_by: null,
            finished_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobs[0].id)
        jobs[0].status = 'pending'
      }
    } else if (body.source === 'queue-drain') {
      const { data } = await admin
        .from('batch_processing_jobs')
        .select('id, batch_id, client_id, kind, status, attempts, max_attempts, locked_at, locked_by')
        .eq('status', 'pending')
        .eq('kind', 'sort_and_verify')
        .order('created_at', { ascending: true })
        .limit(1)
      jobs = (data as JobRow[]) ?? []
    } else {
      // Include running jobs so we can reclaim zombies from closed browser tabs.
      const { data } = await admin
        .from('batch_processing_jobs')
        .select('id, batch_id, client_id, kind, status, attempts, max_attempts, locked_at, locked_by')
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: true })
        .limit(limit)
      jobs = (data as JobRow[]) ?? []
    }

    const invocationStartedAt = Date.now()
    const results: Array<Record<string, unknown>> = []

    for (const job of jobs) {
      if (job.status === 'running') {
        // A live worker (browser tab heartbeating, or another edge invocation)
        // owns this job — only reclaim once the lock is stale.
        const age = lockAgeMs(job)
        const freshLimit = isBrowserLock(job) ? BROWSER_LOCK_FRESH_MS : EDGE_LOCK_FRESH_MS
        if (age < freshLimit) {
          results.push({ jobId: job.id, skipped: true, reason: 'already_running' })
          continue
        }
      }

      let claimedCreation = false
      if (job.kind === 'sort_and_verify') {
        const { data: turn, error: turnErr } = await admin.rpc('claim_packet_creation_turn', {
          p_batch_id: job.batch_id,
        })
        if (!turnErr && turn !== 'started') {
          results.push({
            jobId: job.id,
            batchId: job.batch_id,
            skipped: true,
            reason: turn === 'queued' ? 'queued_behind_creation' : 'already_running',
          })
          continue
        }
        if (!turnErr && turn === 'started') claimedCreation = true
        else if (turnErr) {
          console.warn('[batch-ai-process] claim_packet_creation_turn', turnErr.message)
        }
      }

      if (!claimedCreation) {
        await admin
          .from('batch_processing_jobs')
          .update({
            status: 'running',
            attempts: (job.attempts ?? 0) + 1,
            started_at: new Date().toISOString(),
            locked_at: new Date().toISOString(),
            locked_by: isCron ? 'cron' : 'edge-invoke',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)
      }

      try {
        const { data: batch, error: batchErr } = await admin
          .from('batches')
          .select('id, batch_number, client_id, client_name, doc_sort_snapshot, sort_status, status')
          .eq('id', job.batch_id)
          .maybeSingle()

        if (batchErr || !batch) {
          throw new Error(batchErr?.message || 'Batch not found')
        }

        const fetchInvoices = async (): Promise<InvoiceRow[]> => {
          const { data: invoices, error: invErr } = await admin
            .from('invoices')
            .select(
              'id, invoice_number, load_number, amount, broker_name, client_name, document_doc_ids, ai_review_status, ai_review_snapshot'
            )
            .eq('batch_id', job.batch_id)
          if (invErr) throw new Error(invErr.message)
          return (invoices as InvoiceRow[]) ?? []
        }

        let list = await fetchInvoices()

        // No packets yet → run the server-side Doc Split pipeline (browser-free).
        if (list.length === 0) {
          if (!batchWantsServerDocSplit(batch)) {
            await admin
              .from('batch_processing_jobs')
              .update({
                status: 'succeeded',
                finished_at: new Date().toISOString(),
                locked_at: null,
                locked_by: null,
                last_error: `Batch is ${batch.status} — automated processing stays off.`,
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.id)
            results.push({ jobId: job.id, batchId: job.batch_id, skipped: true, reason: 'rework' })
            continue
          }

          await admin
            .from('batches')
            .update({ status: 'creating', sort_status: 'sorting' })
            .eq('id', job.batch_id)

          const outcome = await runServerDocSplitPipeline(
            admin,
            job.id,
            batch,
            invocationStartedAt
          )

          if (outcome.failed) {
            await admin
              .from('batch_processing_jobs')
              .update({
                status: 'failed',
                last_error: outcome.failed,
                finished_at: new Date().toISOString(),
                locked_at: null,
                locked_by: null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.id)
            await admin
              .from('batches')
              .update({ status: 'rework', sort_status: 'failed' })
              .eq('id', job.batch_id)
            results.push({ jobId: job.id, batchId: job.batch_id, ok: false, error: outcome.failed })
            continue
          }

          if (!outcome.done) {
            // Partial slice — checkpointed; hand back to cron without burning an attempt.
            await admin
              .from('batch_processing_jobs')
              .update({
                status: 'pending',
                attempts: Math.max(0, (job.attempts ?? 1) - 1),
                locked_at: null,
                locked_by: null,
                last_error: outcome.progress,
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.id)
            results.push({
              jobId: job.id,
              batchId: job.batch_id,
              partial: true,
              progress: outcome.progress,
            })
            continue
          }

          // Packets created — reload state and fall through to verification.
          list = await fetchInvoices()
          const { data: freshBatch } = await admin
            .from('batches')
            .select('doc_sort_snapshot, status')
            .eq('id', job.batch_id)
            .maybeSingle()
          if (freshBatch) {
            batch.doc_sort_snapshot = freshBatch.doc_sort_snapshot
            batch.status = freshBatch.status
          }
        }

        const catalog = parseFingerprints(batch.doc_sort_snapshot as string | null)
        if (catalog.size === 0 || list.length === 0) {
          // Packets without a DocSort snapshot need a browser re-scan — don't spin the cron.
          const reason =
            list.length === 0 ? 'Waiting for invoices' : 'Waiting for DocSort snapshot'
          const spinForever = list.length > 0 && catalog.size === 0
          await admin
            .from('batch_processing_jobs')
            .update({
              status: spinForever ? 'succeeded' : 'pending',
              attempts: spinForever
                ? job.attempts
                : Math.max(0, (job.attempts ?? 1) - 1),
              locked_at: null,
              locked_by: null,
              last_error: spinForever
                ? 'Invoices exist but DocSort snapshot is empty — open AI verification and Re-scan paperwork.'
                : reason,
              finished_at: spinForever ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id)
          results.push({
            jobId: job.id,
            batchId: job.batch_id,
            skipped: true,
            reason: list.length === 0 ? 'waiting_for_invoices' : 'waiting_for_docsort',
          })
          continue
        }

        let readyCount = 0
        let needsWorkCount = 0

        for (const inv of list) {
          // Skip finished reviews unless the stored snapshot is malformed
          // (legacy edge writes used plain strings for requiredAll — UI can't render those).
          const finished =
            inv.ai_review_status &&
            inv.ai_review_status !== 'not_run' &&
            inv.ai_review_status !== 'running'
          if (finished && !isMalformedAiReviewSnapshot(inv.ai_review_snapshot)) {
            if (inv.ai_review_status === 'ready') readyCount += 1
            else needsWorkCount += 1
            continue
          }

          const outcome = verifyInvoiceFromCatalog(inv, catalog)
          if (outcome.status === 'ready') readyCount += 1
          else needsWorkCount += 1

          await admin
            .from('invoices')
            .update({
              ai_review_status: outcome.status,
              ai_review_summary: outcome.headline,
              ai_review_snapshot: JSON.stringify(outcome.snapshot),
            })
            .eq('id', inv.id)
        }

        await admin
          .from('batches')
          .update({
            sort_status: 'ready',
            status: batch.status === 'ready_to_post' ? 'verification' : batch.status,
          })
          .eq('id', job.batch_id)

        await admin
          .from('batch_processing_jobs')
          .update({
            status: 'succeeded',
            finished_at: new Date().toISOString(),
            locked_at: null,
            locked_by: null,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        results.push({
          jobId: job.id,
          batchId: job.batch_id,
          ok: true,
          readyCount,
          needsWorkCount,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const attempts = (job.attempts ?? 0) + 1
        const giveUp = attempts >= (job.max_attempts ?? 5)
        await admin
          .from('batch_processing_jobs')
          .update({
            status: giveUp ? 'failed' : 'pending',
            last_error: message,
            finished_at: giveUp ? new Date().toISOString() : null,
            locked_at: null,
            locked_by: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        await admin
          .from('batches')
          .update({
            sort_status: giveUp ? 'failed' : 'sorting',
            status: giveUp ? 'rework' : 'creating',
          })
          .eq('id', job.batch_id)

        results.push({ jobId: job.id, batchId: job.batch_id, ok: false, error: message })
      }
    }

    return json(200, { processed: results.length, results })
  } catch (err) {
    return json(500, {
      error: err instanceof Error ? err.message : 'batch-ai-process failed',
    })
  }
})
