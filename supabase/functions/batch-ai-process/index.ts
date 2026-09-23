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
}

type Fingerprint = {
  docId: string
  fileName: string
  kind: string
  loadNumbers?: string[]
  broker?: string
  extract?: Record<string, unknown>
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
  const hasBol = fps.some((f) => f.kind === 'bol' || f.kind === 'bill_of_lading' || /bol/i.test(f.kind))
  const issues: string[] = []
  if (!hasRc) issues.push('Missing rate confirmation')
  if (!hasBol) issues.push('Missing BOL')

  const load = (inv.load_number || '').trim()
  if (load) {
    const loadHit = fps.some((f) =>
      (f.loadNumbers ?? []).some((n) => normalizeId(n) === normalizeId(load))
    )
    if (!loadHit) issues.push(`Load # ${load} not found on attached docs`)
  }

  const ready = issues.length === 0
  const headline = ready ? 'Good to go' : 'Needs additional work'
  const detail = ready
    ? 'DocSort extracts look complete (RC + BOL). Credyx can still re-check in AI verification.'
    : issues.join('; ')

  return {
    status: ready ? 'ready' : 'needs_work',
    headline,
    detail,
    snapshot: {
      headline,
      detail,
      ready,
      passCount: ready ? 2 : Math.max(0, 2 - issues.length),
      requiredTotal: 2,
      requiredAll: ['Rate confirmation present', 'BOL present'],
      requiredFailed: issues,
      requiredPassed: [
        hasRc ? 'Rate confirmation present' : null,
        hasBol ? 'BOL present' : null,
      ].filter(Boolean),
      additional: [],
      issues,
      warnings: [],
      reviewedAt: new Date().toISOString(),
      source: 'batch-ai-process-edge',
    },
  }
}

function normalizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

function minimalSnapshot(detail: string, issues: string[]) {
  return {
    headline: 'Needs additional work',
    detail,
    ready: false,
    passCount: 0,
    requiredTotal: 0,
    requiredAll: [],
    requiredFailed: [],
    requiredPassed: [],
    additional: [],
    issues,
    warnings: [],
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
              'id, invoice_number, load_number, amount, broker_name, client_name, document_doc_ids, ai_review_status'
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
          // Legacy verify-only batches without extracts — wait for the browser intake.
          await admin
            .from('batch_processing_jobs')
            .update({
              status: 'pending',
              attempts: Math.max(0, (job.attempts ?? 1) - 1),
              locked_at: null,
              locked_by: null,
              last_error: list.length === 0 ? 'Waiting for invoices' : 'Waiting for DocSort snapshot',
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
          // Skip invoices already reviewed unless not_run.
          if (
            inv.ai_review_status &&
            inv.ai_review_status !== 'not_run' &&
            inv.ai_review_status !== 'running'
          ) {
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
