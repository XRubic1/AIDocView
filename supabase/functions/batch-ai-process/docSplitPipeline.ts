/**
 * Server-side Doc Split pipeline — browser-free packet creation.
 *
 * Split multi-page PDFs (pdf-lib) → classify pages (OpenAI, PDF file input)
 * → collapse each upload into Invoice / RC binder / BOL binder
 * → extract RC/BOL fields from the binders → one packet per upload
 * (loose docs still match RC↔BOL). Checkpoints every step into batch.doc_sort_snapshot so
 * each invocation does bounded work and cron resumes from where it stopped.
 *
 * Differences vs the browser pipeline (intentional):
 * - Pages are sent to OpenAI as PDF file inputs (no canvas rasterizing in Deno).
 * - The generated carrier invoice PDF is skipped (admin UI tolerates it missing).
 * - Broker matching is best-effort by name; unmatched brokers stay pending.
 */
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'
import {
  invoiceDraftGroupsFromSort,
  matchSortedDocuments,
  preferredPacketLoadNumber,
  primaryLoadLabel,
  namesOverlap,
  type DocSortKind,
  type MatchFingerprint,
  type MatchLoadGroup,
} from '../_shared/docSortMatch.ts'
import {
  isSourceBinderFileName,
  parseSourceBinderFileName,
  parseUploadPageFileName,
  partitionSourceBinders,
  planSourceBinders,
  sourceBinderFileName,
  stemHasSourceBinder,
} from '../_shared/sourceDocBinders.ts'
import {
  mergeRateConWalk,
  rateConFromUnknown,
  rateConWalkComplete,
  rateConWalkToRaw,
  type WalkableRateCon,
} from '../_shared/rateConWalk.ts'

// deno-lint-ignore no-explicit-any
type Supa = any

const BUCKET = 'batch-documents'
const HANDOFF_FOLDER = 'handoff-documents'
/** Stop starting new AI work after this much wall time; re-queue for the next tick. */
const TIME_BUDGET_MS = 100_000
const MODEL = Deno.env.get('AI_PRIMARY_MODEL') ?? 'gpt-4.1-2025-04-14'
const OPENAI_SEED = 42_001_337

const MARK_KINDS: DocSortKind[] = ['rate_confirmation', 'bill_of_lading', 'invoice']

export interface PipelineBatch {
  id: string
  batch_number: string
  client_id: string
  client_name: string
  doc_sort_snapshot: string | null
  status: string | null
}

export interface PipelineOutcome {
  done: boolean
  progress: string
  invoicesCreated?: number
  failed?: string
}

type CatalogFp = MatchFingerprint & {
  /** True once the server classified this page (so kind 'other' is final, not pending). */
  classified?: boolean
}

interface StoredDoc {
  docId: string
  fileName: string
  storagePath: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function isPageSplitFileName(fileName: string): boolean {
  return /-(p\d+)\.(pdf|jpe?g|png)$/i.test(fileName)
}

function pdfNameStem(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').replace(/-(p\d+)$/i, '')
}

function deriveUnpackedFileName(sourceName: string, suffix: string): string {
  const base = sourceName.replace(/\.pdf$/i, '').trim() || 'document'
  const cleanSuffix = suffix.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'part'
  return `${base}-${cleanSuffix}.pdf`
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function guessMime(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  return 'application/octet-stream'
}

// ---------------------------------------------------------------------------
// Snapshot catalog (checkpoint store)
// ---------------------------------------------------------------------------

function parseCatalog(raw: string | null | undefined): Map<string, CatalogFp> {
  const map = new Map<string, CatalogFp>()
  if (!raw) return map
  try {
    const parsed = JSON.parse(raw) as { fingerprints?: CatalogFp[] }
    for (const fp of parsed.fingerprints ?? []) {
      if (fp?.docId) {
        map.set(fp.docId, {
          ...fp,
          confidence: fp.confidence ?? 0.5,
          loadNumbers: Array.isArray(fp.loadNumbers) ? fp.loadNumbers : [],
          kind: fp.kind ?? 'other',
        })
      }
    }
  } catch {
    /* ignore bad snapshot */
  }
  return map
}

function buildSnapshot(catalog: Map<string, CatalogFp>, groupCount: number): string {
  return JSON.stringify({
    sortedAt: nowIso(),
    totalDocuments: catalog.size,
    groupCount,
    fingerprints: [...catalog.values()],
    needsDocSplit: false,
  })
}

/**
 * Checkpoint: merge our updates into the freshest DB snapshot and write it back.
 * A user mark (RC/BOL/INV set in the Doc Splitter while we run) always beats an
 * AI-classified kind from this worker.
 */
async function writeCheckpoint(
  admin: Supa,
  batchId: string,
  jobId: string,
  catalog: Map<string, CatalogFp>,
  baselineKinds: Map<string, DocSortKind>,
  progress: string
): Promise<void> {
  try {
    const { data } = await admin
      .from('batches')
      .select('doc_sort_snapshot')
      .eq('id', batchId)
      .maybeSingle()
    const fresh = parseCatalog(data?.doc_sort_snapshot as string | null)
    for (const [docId, freshFp] of fresh) {
      const mine = catalog.get(docId)
      if (!mine) continue // we intentionally removed it (split parent)
      const freshMarked = MARK_KINDS.includes(freshFp.kind)
      const baseline = baselineKinds.get(docId)
      // Fresh snapshot has a mark we did not know at load → user marked it mid-run.
      if (freshMarked && freshFp.kind !== baseline && freshFp.kind !== mine.kind) {
        catalog.set(docId, { ...mine, kind: freshFp.kind })
      }
    }
  } catch {
    /* best effort merge — still write our state */
  }

  await admin
    .from('batches')
    .update({ doc_sort_snapshot: buildSnapshot(catalog, 0) })
    .eq('id', batchId)

  // Heartbeat the job lock so the browser drain never reclaims a live worker.
  await admin
    .from('batch_processing_jobs')
    .update({ locked_at: nowIso(), last_error: progress, updated_at: nowIso() })
    .eq('id', jobId)
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function listHandoffDocs(
  admin: Supa,
  clientId: string,
  batchId: string
): Promise<StoredDoc[]> {
  const prefix = `${clientId}/${batchId}/${HANDOFF_FOLDER}`
  const { data: folders, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 500 })
  if (error || !folders?.length) return []

  const docs: StoredDoc[] = []
  for (const folder of folders) {
    const docId = folder.name
    if (!docId || docId.startsWith('.')) continue
    const { data: files } = await admin.storage
      .from(BUCKET)
      .list(`${prefix}/${docId}`, { limit: 10 })
    const file = (files ?? []).find(
      (f: { name: string }) => f.name && !f.name.startsWith('.')
    )
    if (file) {
      docs.push({ docId, fileName: file.name, storagePath: `${prefix}/${docId}/${file.name}` })
    } else if (/\.(pdf|jpe?g|png)$/i.test(docId)) {
      // Legacy flat layout: object directly under the handoff folder.
      docs.push({
        docId: docId.replace(/\.(pdf|jpe?g|png)$/i, ''),
        fileName: docId,
        storagePath: `${prefix}/${docId}`,
      })
    }
  }
  return docs
}

async function downloadBytes(admin: Supa, path: string): Promise<Uint8Array | null> {
  const { data, error } = await admin.storage.from(BUCKET).download(path)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

async function uploadBytes(
  admin: Supa,
  path: string,
  bytes: Uint8Array,
  contentType: string
): Promise<boolean> {
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    upsert: true,
    contentType,
  })
  return !error
}

async function mergePdfPageBytes(parts: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const bytes of parts) {
    let src: PDFDocument
    try {
      src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    } catch {
      continue
    }
    if (src.getPageCount() === 0) continue
    const copied = await out.copyPages(src, src.getPageIndices())
    for (const page of copied) out.addPage(page)
  }
  if (out.getPageCount() === 0) throw new Error('Binder PDF is empty')
  return out.save()
}

async function pdfSinglePageBytes(source: Uint8Array, pageIndex: number): Promise<Uint8Array> {
  const src = await PDFDocument.load(source, { ignoreEncryption: true })
  if (src.getPageCount() <= 1) return source
  const out = await PDFDocument.create()
  const [page] = await out.copyPages(src, [pageIndex])
  out.addPage(page)
  return out.save()
}

// ---------------------------------------------------------------------------
// OpenAI (direct — same model/settings as the browser pipeline)
// ---------------------------------------------------------------------------

class RateLimitedError extends Error {
  retryMs: number
  constructor(message: string, retryMs: number) {
    super(message)
    this.retryMs = retryMs
  }
}

function parseRetrySeconds(body: string): number | undefined {
  const match = body.match(/try again in ([\d.]+)s/i)
  if (!match) return undefined
  const seconds = Number.parseFloat(match[1])
  return Number.isFinite(seconds) ? seconds : undefined
}

async function callOpenAiJson(
  prompt: string,
  doc: { fileName: string; bytes: Uint8Array },
  deadline: number
): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured for batch-ai-process')

  const mime = guessMime(doc.fileName)
  const base64 = bytesToBase64(doc.bytes)
  const filePart =
    mime === 'application/pdf'
      ? {
          type: 'file',
          file: { filename: doc.fileName, file_data: `data:application/pdf;base64,${base64}` },
        }
      : {
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' },
        }

  const body = JSON.stringify({
    model: MODEL,
    temperature: 0,
    seed: OPENAI_SEED,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, filePart] }],
  })

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body,
    })
    const text = await res.text()

    if (res.status === 429) {
      const waitMs = Math.ceil((parseRetrySeconds(text) ?? 5) * 1000) + 500
      if (Date.now() + waitMs > deadline) {
        // Not enough budget to wait — hand back to cron; checkpoints keep progress.
        throw new RateLimitedError('OpenAI rate limited — resuming next tick', waitMs)
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      continue
    }
    if (!res.ok) {
      throw new Error(`OpenAI request failed (${res.status}): ${text.slice(0, 400)}`)
    }
    const payload = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('OpenAI returned an empty response')
    return JSON.parse(content) as Record<string, unknown>
  }
  throw new RateLimitedError('OpenAI rate limited — retries exhausted this tick', 30_000)
}

// ---------------------------------------------------------------------------
// Prompts (mirrors src/config/documentAiPrompts.ts)
// ---------------------------------------------------------------------------

const CLASSIFIER_RULES = `Key distinctions:
- RATE_CON: broker load tender (TQL, Landstar, etc.) — all pages of the same broker packet, including terms/notes pages.
- INVOICE: carrier bill to broker for payment (often page 1 before rate con in a submission).
- LUMPER_RECEIPT: warehouse unloading receipt (lumper, COMcheck, EFS) — not linehaul invoice.
- BOL: shipper/consignee blocks, freight description, signatures.
- UNKNOWN only if illegible; if it mentions load/broker/pickup/delivery, prefer the best freight type.`

const CLASSIFY_PROMPT = `Classify one freight document page.

${CLASSIFIER_RULES}

Types: RATE_CON | BOL | INVOICE | POD | LUMPER_RECEIPT | SCALE_TICKET | DELIVERY_CONFIRMATION | TRAILER_CONTROL_RECORD | STAMPED_BOL | BLANK | UNKNOWN

JSON only:
{"page_number":1,"doc_type":"RATE_CON","confidence":0.97,"is_blank":false,"is_legible":true,"notes":""}`

const RATE_CON_PROMPT = `Extract fields from this rate confirmation. JSON only; null if not visible; do not guess.

Carrier vs broker: carrier = motor carrier; broker = who arranged load. Landstar-branded docs → broker Landstar, not agency office names.
Also: rate_line_items (linehaul/fuel/unloading/detention/other), bol_reference_numbers.

{
 "load_number":"","broker_name":"","broker_mc":"","carrier_name":"","carrier_mc":"",
 "rate_total":null,"rate_currency":"USD",
 "origin":{"name":"","address":"","city":"","state":"","zip":"","pickup_date":""},
 "destinations":[{"stop_number":1,"name":"","address":"","city":"","state":"","zip":"","delivery_date":""}],
 "bol_reference_numbers":[],
 "confidence":0.9
}`

const BOL_PROMPT = `Audit this bill of lading. JSON only; null if not visible; do not guess.

- reference_numbers: all visible load/BOL/PO numbers.
- ship_from / ship_to: copy the full shipper and consignee facility lines.
- signatures: look for ink/stamp/initials — not printed text.

{"bol_audit":{"destination_match":"UNKNOWN","legibility":"PASS","page_count":"PASS","signatures":{"carrier":"MISSING","shipper":"MISSING","receiver":"MISSING","receiver_date":"MISSING"},"ship_from":"","ship_to":"","load_number":"","reference_numbers":[],"overall":"APPROVED","flags":[]}}`

function kindFromDocType(docType: string): DocSortKind {
  const t = (docType || '').toUpperCase()
  if (t === 'RATE_CON') return 'rate_confirmation'
  if (t === 'BOL' || t === 'STAMPED_BOL' || t === 'POD' || t === 'DELIVERY_CONFIRMATION') {
    return 'bill_of_lading'
  }
  if (t === 'INVOICE') return 'invoice'
  if (t === 'LUMPER_RECEIPT') return 'lumper'
  return 'other'
}

function formatStop(stop?: {
  name?: string
  address?: string
  city?: string
  state?: string
  zip?: string
}): string | undefined {
  if (!stop) return undefined
  const parts = [stop.name, stop.address, stop.city, stop.state, stop.zip].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : undefined
}

// ---------------------------------------------------------------------------
// Invoice numbering (mirrors src/utils/clientInvoiceNumbers.ts)
// ---------------------------------------------------------------------------

function parseInvoiceNumberSequence(invoiceNumber: string): number | null {
  const trimmed = invoiceNumber.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
  const legacy = trimmed.match(/INV-\d{4}-(\d+)$/i)
  if (legacy) return Number.parseInt(legacy[1], 10)
  const tail = trimmed.match(/(\d+)$/)
  if (tail) return Number.parseInt(tail[1], 10)
  return null
}

function isSystemStyleInvoiceNumber(invoiceNumber: string): boolean {
  const trimmed = invoiceNumber.trim()
  return /^\d+$/.test(trimmed) || /^INV-\d{4}-\d+$/i.test(trimmed)
}

function formatClientInvoiceNumber(sequence: number): string {
  if (!Number.isFinite(sequence) || sequence < 1) return '001'
  if (sequence < 1000) return String(sequence).padStart(3, '0')
  return String(sequence)
}

async function allocateInvoiceNumbers(
  admin: Supa,
  clientId: string,
  count: number
): Promise<string[]> {
  const { data } = await admin
    .from('invoices')
    .select('invoice_number')
    .eq('client_id', clientId)
    .limit(5000)
  let max = 0
  for (const row of data ?? []) {
    const num = String((row as { invoice_number?: string }).invoice_number ?? '')
    if (!isSystemStyleInvoiceNumber(num)) continue
    const seq = parseInvoiceNumberSequence(num)
    if (seq != null && seq > max) max = seq
  }
  return Array.from({ length: count }, (_, i) => formatClientInvoiceNumber(max + 1 + i))
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function runServerDocSplitPipeline(
  admin: Supa,
  jobId: string,
  batch: PipelineBatch,
  startedAt: number
): Promise<PipelineOutcome> {
  const deadline = startedAt + TIME_BUDGET_MS
  const outOfBudget = () => Date.now() > deadline

  const catalog = parseCatalog(batch.doc_sort_snapshot)
  const baselineKinds = new Map<string, DocSortKind>(
    [...catalog.entries()].map(([id, fp]) => [id, fp.kind])
  )
  const stored = await listHandoffDocs(admin, batch.client_id, batch.id)
  const pathByDocId = new Map(stored.map((d) => [d.docId, d.storagePath]))

  const catalogHasChildrenOf = (fileName: string): boolean => {
    const stem = pdfNameStem(fileName).toLowerCase()
    if (!stem) return false
    for (const fp of catalog.values()) {
      if (!isPageSplitFileName(fp.fileName)) continue
      if (pdfNameStem(fp.fileName).toLowerCase() === stem) return true
    }
    return false
  }

  // Register storage docs missing from the catalog (skip already-split parents
  // and uploads that were already collapsed into binders).
  const catalogNames = () => [...catalog.values()].map((fp) => fp.fileName)
  for (const doc of stored) {
    if (catalog.has(doc.docId)) continue
    if (isSourceBinderFileName(doc.fileName) || doc.docId.startsWith('binder-')) {
      const parsed = parseSourceBinderFileName(doc.fileName)
      catalog.set(doc.docId, {
        docId: doc.docId,
        fileName: doc.fileName,
        kind: parsed?.kind ?? 'other',
        confidence: 0.9,
        loadNumbers: [],
        classified: true,
      })
      continue
    }
    if (
      !isPageSplitFileName(doc.fileName) &&
      (catalogHasChildrenOf(doc.fileName) || stemHasSourceBinder(catalogNames(), doc.fileName))
    ) {
      continue
    }
    catalog.set(doc.docId, {
      docId: doc.docId,
      fileName: doc.fileName,
      kind: 'other',
      confidence: 0.3,
      loadNumbers: [],
    })
  }

  const checkpoint = (progress: string) =>
    writeCheckpoint(admin, batch.id, jobId, catalog, baselineKinds, progress)

  // ---- 1. SPLIT multi-page PDFs --------------------------------------------
  const splitCandidates = [...catalog.values()].filter(
    (fp) =>
      /\.pdf$/i.test(fp.fileName) &&
      !isPageSplitFileName(fp.fileName) &&
      !isSourceBinderFileName(fp.fileName) &&
      !fp.docId.startsWith('page-split-') &&
      !fp.docId.startsWith('binder-') &&
      !MARK_KINDS.includes(fp.kind) &&
      !catalogHasChildrenOf(fp.fileName) &&
      !stemHasSourceBinder(catalogNames(), fp.fileName) &&
      pathByDocId.has(fp.docId)
  )

  for (const parent of splitCandidates) {
    if (outOfBudget()) {
      await checkpoint('Splitting PDFs — resuming next tick')
      return { done: false, progress: 'Splitting PDFs…' }
    }
    const bytes = await downloadBytes(admin, pathByDocId.get(parent.docId)!)
    if (!bytes) continue

    let pdf: PDFDocument
    try {
      pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
    } catch {
      continue // unreadable — leave for manual handling
    }
    const pageCount = pdf.getPageCount()
    if (pageCount <= 1) continue

    for (let page = 1; page <= pageCount; page += 1) {
      const childDocId = `page-split-${Date.now()}-p${page}-${Math.random()
        .toString(36)
        .slice(2, 7)}`
      const childName = deriveUnpackedFileName(parent.fileName, `p${page}`)
      const child = await PDFDocument.create()
      const [copied] = await child.copyPages(pdf, [page - 1])
      child.addPage(copied)
      const childBytes = await child.save()
      const childPath = `${batch.client_id}/${batch.id}/${HANDOFF_FOLDER}/${childDocId}/${childName}`
      const uploaded = await uploadBytes(admin, childPath, childBytes, 'application/pdf')
      if (!uploaded) throw new Error(`Failed to upload split page ${childName}`)
      pathByDocId.set(childDocId, childPath)
      catalog.set(childDocId, {
        docId: childDocId,
        fileName: childName,
        kind: 'other',
        confidence: 0.4,
        loadNumbers: parent.loadNumbers,
        broker: parent.broker,
      })
    }
    catalog.delete(parent.docId) // strip parent — children replace it
    await checkpoint(`Split ${parent.fileName} into ${pageCount} page(s)`)
  }

  // ---- 2. CLASSIFY pending pages -------------------------------------------
  const pendingClassify = () =>
    [...catalog.values()].filter(
      (fp) => !MARK_KINDS.includes(fp.kind) && fp.kind !== 'lumper' && !fp.classified
    )

  for (const fp of pendingClassify()) {
    if (outOfBudget()) {
      await checkpoint('Classifying pages — resuming next tick')
      return { done: false, progress: 'Classifying pages…' }
    }
    const path = pathByDocId.get(fp.docId)
    if (!path) continue
    const bytes = await downloadBytes(admin, path)
    if (!bytes) continue
    try {
      const raw = await callOpenAiJson(CLASSIFY_PROMPT, { fileName: fp.fileName, bytes }, deadline)
      const kind = kindFromDocType(String(raw.doc_type ?? ''))
      const confidence = Number(raw.confidence ?? 0.5)
      catalog.set(fp.docId, {
        ...fp,
        kind,
        confidence: Number.isFinite(confidence) ? confidence : 0.5,
        classified: true,
      })
      await checkpoint(`Classified ${fp.fileName} → ${kind}`)
    } catch (err) {
      if (err instanceof RateLimitedError) {
        await checkpoint('Rate limited — waiting for the next tick')
        return { done: false, progress: err.message }
      }
      throw err
    }
  }

  // ---- 2b. COLLAPSE each upload into Invoice / RC binder / BOL binder ------
  // Do not rewrite storage once packets exist — their docs still point at the
  // page files from the run that created them.
  const { data: existingBeforeCollapse } = await admin
    .from('invoices')
    .select('id')
    .eq('batch_id', batch.id)
    .limit(1)
  if ((existingBeforeCollapse ?? []).length > 0) {
    return { done: true, progress: 'Packets already exist — skipped create', invoicesCreated: 0 }
  }

  // Pages stay split only long enough to classify. Matching individual RC
  // pages created extra packets from continuation pages of the same upload.
  const existingBinderNames = () =>
    new Set([...catalog.values()].map((fp) => fp.fileName.toLowerCase()))

  const collapsePlans = planSourceBinders([...catalog.values()])
  for (const plan of collapsePlans) {
    if (outOfBudget()) {
      await checkpoint('Building binders — resuming next tick')
      return { done: false, progress: 'Building binders…' }
    }

    const pageIds = plan.buckets.flatMap((bucket) => bucket.pages.map((page) => page.docId))
    const missing = pageIds.some((docId) => !pathByDocId.has(docId))
    if (missing) {
      const stemHasBinder = plan.buckets.some((bucket) =>
        existingBinderNames().has(bucket.fileName.toLowerCase())
      )
      if (!stemHasBinder) continue
      for (const docId of pageIds) {
        catalog.delete(docId)
        pathByDocId.delete(docId)
      }
      await checkpoint(`Dropped split pages for ${plan.stem} — binders already stored`)
      continue
    }

    const created: CatalogFp[] = []
    const createdPaths: Array<{ docId: string; path: string; bytes: Uint8Array }> = []
    let failed = false

    for (const bucket of plan.buckets) {
      if (existingBinderNames().has(bucket.fileName.toLowerCase())) continue
      const parts: Uint8Array[] = []
      const ordered = [...bucket.pages].sort((a, b) => {
        const left = parseUploadPageFileName(a.fileName)?.page ?? 0
        const right = parseUploadPageFileName(b.fileName)?.page ?? 0
        return left - right
      })
      for (const page of ordered) {
        const bytes = await downloadBytes(admin, pathByDocId.get(page.docId)!)
        if (!bytes) {
          failed = true
          break
        }
        parts.push(bytes)
      }
      if (failed || parts.length === 0) {
        failed = true
        break
      }
      try {
        const merged = await mergePdfPageBytes(parts)
        const docId = `binder-${Date.now()}-${bucket.kind}-${Math.random().toString(36).slice(2, 7)}`
        const path = `${batch.client_id}/${batch.id}/${HANDOFF_FOLDER}/${docId}/${bucket.fileName}`
        created.push({
          docId,
          fileName: sourceBinderFileName(plan.stem, bucket.kind),
          kind: bucket.kind,
          confidence: 1,
          loadNumbers: [],
          classified: true,
        })
        createdPaths.push({ docId, path, bytes: merged })
      } catch (err) {
        console.warn('[docSplitPipeline] binder merge failed', plan.stem, bucket.kind, err)
        failed = true
        break
      }
    }

    if (failed) continue

    for (const item of createdPaths) {
      const uploaded = await uploadBytes(admin, item.path, item.bytes, 'application/pdf')
      if (!uploaded) throw new Error(`Failed to upload binder ${item.path}`)
      pathByDocId.set(item.docId, item.path)
    }
    for (const fp of created) catalog.set(fp.docId, fp)

    const pagePaths = pageIds
      .map((docId) => pathByDocId.get(docId))
      .filter((path): path is string => Boolean(path))
    if (pagePaths.length > 0) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove(pagePaths)
      if (removeError) {
        throw new Error(`Failed to remove split pages for ${plan.stem}: ${removeError.message}`)
      }
    }
    for (const docId of pageIds) {
      catalog.delete(docId)
      pathByDocId.delete(docId)
    }
    await checkpoint(`Collapsed ${plan.stem} into binders`)
  }

  // ---- 3. EXTRACT RC / BOL fields ------------------------------------------
  const pendingExtract = () =>
    [...catalog.values()].filter(
      (fp) =>
        (fp.kind === 'rate_confirmation' ||
          (fp.kind === 'bill_of_lading' && !isSourceBinderFileName(fp.fileName))) &&
        !fp.extract
    )

  for (const fp of pendingExtract()) {
    if (outOfBudget()) {
      await checkpoint('Extracting RC/BOL fields — resuming next tick')
      return { done: false, progress: 'Extracting fields…' }
    }
    const path = pathByDocId.get(fp.docId)
    if (!path) continue
    const bytes = await downloadBytes(admin, path)
    if (!bytes) continue
    try {
      if (fp.kind === 'rate_confirmation') {
        let pdfPageCount = 1
        try {
          const loaded = await PDFDocument.load(bytes, { ignoreEncryption: true })
          pdfPageCount = Math.max(1, loaded.getPageCount())
        } catch {
          pdfPageCount = 1
        }
        let walked: WalkableRateCon = {}
        let raw: Record<string, unknown> = {}
        for (let pageIndex = 0; pageIndex < pdfPageCount; pageIndex += 1) {
          if (pageIndex > 0 && outOfBudget()) {
            await checkpoint(`Rate con ${fp.fileName} paused after page ${pageIndex}`)
            return { done: false, progress: 'Extracting fields…' }
          }
          const slice =
            pdfPageCount === 1 ? bytes : await pdfSinglePageBytes(bytes, pageIndex)
          const pageRaw = (await callOpenAiJson(
            RATE_CON_PROMPT,
            { fileName: `${fp.fileName}#p${pageIndex + 1}`, bytes: slice },
            deadline
          )) as Record<string, unknown>
          walked = mergeRateConWalk(walked, rateConFromUnknown(pageRaw))
          raw = rateConWalkToRaw(walked, pageRaw)
          if (rateConWalkComplete(walked)) break
        }
        const destinations = Array.isArray(raw.destinations) ? raw.destinations : []
        const lastStop = destinations[destinations.length - 1] as Record<string, string> | undefined
        const origin = (raw.origin ?? undefined) as Record<string, string> | undefined
        const loadNumbers = [
          ...(raw.load_number ? [String(raw.load_number)] : []),
          ...((raw.bol_reference_numbers as string[] | undefined) ?? []).map(String),
          ...fp.loadNumbers,
        ]
        catalog.set(fp.docId, {
          ...fp,
          broker: String(raw.broker_name ?? '') || fp.broker,
          carrier: String(raw.carrier_name ?? '') || fp.carrier,
          rateAmount:
            typeof raw.rate_total === 'number' && raw.rate_total > 0
              ? raw.rate_total
              : fp.rateAmount,
          pickup: formatStop(origin) ?? fp.pickup,
          delivery: formatStop(lastStop) ?? fp.delivery,
          pickupDate: String(origin?.pickup_date ?? '') || fp.pickupDate,
          deliveryDate: String(lastStop?.delivery_date ?? '') || fp.deliveryDate,
          loadNumbers: [...new Set(loadNumbers.filter(Boolean))],
          extract: {
            documentType: 'rate_confirmation',
            loadNumber: raw.load_number ? String(raw.load_number) : undefined,
            rateConParse: {
              load_number: raw.load_number ? String(raw.load_number) : undefined,
              broker_name: raw.broker_name ? String(raw.broker_name) : undefined,
              carrier_name: raw.carrier_name ? String(raw.carrier_name) : undefined,
              rate_total: typeof raw.rate_total === 'number' ? raw.rate_total : undefined,
              bol_reference_numbers: ((raw.bol_reference_numbers as string[] | undefined) ?? []).map(
                String
              ),
              destinations,
              origin,
            },
          },
        })
      } else {
        const raw = (await callOpenAiJson(
          BOL_PROMPT,
          { fileName: fp.fileName, bytes },
          deadline
        )) as { bol_audit?: Record<string, unknown> }
        const audit = (raw.bol_audit ?? raw) as Record<string, unknown> & {
          load_number?: string
          reference_numbers?: string[]
          ship_from?: string
          ship_to?: string
        }
        const loadNumbers = [
          ...(audit.load_number ? [String(audit.load_number)] : []),
          ...(audit.reference_numbers ?? []).map(String),
          ...fp.loadNumbers,
        ]
        catalog.set(fp.docId, {
          ...fp,
          pickup: String(audit.ship_from ?? '') || fp.pickup,
          delivery: String(audit.ship_to ?? '') || fp.delivery,
          loadNumbers: [...new Set(loadNumbers.filter(Boolean))],
          extract: {
            documentType: 'bill_of_lading',
            loadNumber: audit.load_number ? String(audit.load_number) : undefined,
            shipFrom: audit.ship_from ? String(audit.ship_from) : undefined,
            shipTo: audit.ship_to ? String(audit.ship_to) : undefined,
            bolAudit: audit,
          },
        })
      }
      await checkpoint(`Extracted ${fp.fileName}`)
    } catch (err) {
      if (err instanceof RateLimitedError) {
        await checkpoint('Rate limited — waiting for the next tick')
        return { done: false, progress: err.message }
      }
      throw err
    }
  }

  // ---- 4. MATCH + CREATE invoices ------------------------------------------
  // Binder uploads are one packet each (RC binder + BOL binder). The carrier
  // invoice stays unassigned. Loose docs still go through RC↔BOL matching.
  const all = [...catalog.values()]
  const partitioned = partitionSourceBinders(all)
  const forMatch = partitioned.loose.filter(
    (fp) => fp.kind === 'rate_confirmation' || fp.kind === 'bill_of_lading'
  )
  const binderInvoices = [
    ...partitioned.packets.flatMap((packet) => packet.invoices),
    ...partitioned.unassigned,
  ]
  const sortResult = matchSortedDocuments(forMatch)
  sortResult.otherDocuments = [
    ...sortResult.otherDocuments,
    ...partitioned.loose.filter(
      (fp) => fp.kind !== 'rate_confirmation' && fp.kind !== 'bill_of_lading'
    ),
  ]
  sortResult.totalDocuments = all.length
  const grouped = invoiceDraftGroupsFromSort(sortResult)
  const binderGroups: MatchLoadGroup[] = partitioned.packets.map((packet) => {
    const anchor = packet.rateCons[0] ?? packet.bols[0]
    return {
      groupId: `source-${packet.stem}`,
      label: anchor ? primaryLoadLabel(anchor) : packet.stem,
      rateCons: packet.rateCons,
      bols: packet.bols,
      others: packet.support,
      matchReason: 'uploaded packet binders',
      matchScore: 100,
    }
  })
  grouped.groups = [...binderGroups, ...grouped.groups]
  grouped.unmatched.other = [...grouped.unmatched.other, ...binderInvoices]

  if (grouped.groups.length === 0) {
    return {
      done: true,
      progress: 'Doc Split finished but produced 0 packets',
      failed:
        'Doc Split finished but produced 0 packets (need matched RC+BOL). Open Doc Splitter or Packet Rework.',
    }
  }

  // Never create duplicates — another worker / a browser tab may have finished.
  const { data: existing } = await admin
    .from('invoices')
    .select('id')
    .eq('batch_id', batch.id)
    .limit(1)
  if ((existing ?? []).length > 0) {
    return { done: true, progress: 'Packets already exist — skipped create', invoicesCreated: 0 }
  }

  // Best-effort broker match by name (unmatched stays pending for Credyx).
  const brokerIdByName = new Map<string, string>()
  try {
    const { data: brokers } = await admin.from('brokers').select('id, name').limit(3000)
    for (const b of brokers ?? []) {
      const name = String((b as { name?: string }).name ?? '')
      if (name) brokerIdByName.set(name, String((b as { id?: string }).id ?? ''))
    }
  } catch {
    /* brokers table optional */
  }
  const matchBrokerId = (name?: string): string => {
    if (!name?.trim()) return ''
    for (const [candidate, id] of brokerIdByName) {
      if (namesOverlap(candidate, name)) return id
    }
    return ''
  }

  const numbers = await allocateInvoiceNumbers(admin, batch.client_id, grouped.groups.length)
  const today = new Date().toISOString().slice(0, 10)
  let totalAmount = 0
  const rows: Record<string, unknown>[] = []

  grouped.groups.forEach((group: MatchLoadGroup, index: number) => {
    const fps = [...group.rateCons, ...group.bols, ...(group.others ?? [])]
    const rc = group.rateCons[0]
    const withRate = fps.find((fp) => (fp.rateAmount ?? 0) > 0)
    const withBroker = fps.find(
      (fp) => fp.broker?.trim() && fp.broker.trim().toLowerCase() !== 'broker'
    )
    const loadNumber =
      (rc ? preferredPacketLoadNumber(rc) : undefined) ||
      (rc ? primaryLoadLabel(rc) : undefined) ||
      group.label?.trim() ||
      ''
    const amount = withRate?.rateAmount ?? 0
    totalAmount += amount

    const docIds = fps.map((fp) => fp.docId)
    const storagePaths: Record<string, string> = {}
    for (const docId of docIds) {
      const path = pathByDocId.get(docId)
      if (path) storagePaths[docId] = path
    }

    rows.push({
      id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${index}`,
      invoice_number: numbers[index],
      client_id: batch.client_id,
      client_name: batch.client_name,
      broker_id: matchBrokerId(withBroker?.broker) || null,
      broker_name: withBroker?.broker?.trim() ?? '',
      amount,
      invoice_date: today,
      due_date: today,
      expected_payment_date: today,
      status: 'pending',
      load_number: loadNumber,
      batch_id: batch.id,
      batch_number: batch.batch_number,
      documents_count: docIds.length,
      ai_confirmed_at: nowIso(),
      ai_confirmed_by: 'AI Doc Split (server)',
      ai_review_status: 'not_run',
      doc_sort_group_id: group.groupId,
      document_doc_ids: docIds,
      document_storage_paths: storagePaths,
      created_at: nowIso(),
      updated_at: nowIso(),
    })
  })

  const { error: insertError } = await admin.from('invoices').insert(rows)
  if (insertError) {
    throw new Error(`Invoice insert failed: ${insertError.message}`)
  }

  // Fee calculation from the client's live fee terms (best effort).
  let feeCalculation: Record<string, unknown> | null = null
  try {
    const { data: client } = await admin
      .from('clients')
      .select('*')
      .eq('id', batch.client_id)
      .maybeSingle()
    const feeTermsRaw = (client as Record<string, unknown> | null)?.fee_terms
    const feeTerms = (
      typeof feeTermsRaw === 'string' ? JSON.parse(feeTermsRaw) : feeTermsRaw
    ) as { fee_type?: string; fee_percentage?: number; flat_fee_amount?: number } | null
    if (feeTerms?.fee_type === 'percentage' && typeof feeTerms.fee_percentage === 'number') {
      const totalFee = (totalAmount * feeTerms.fee_percentage) / 100
      feeCalculation = {
        fee_type: 'percentage',
        fee_percentage: feeTerms.fee_percentage,
        total_fee: Math.round(totalFee * 100) / 100,
        net_amount: Math.round((totalAmount - totalFee) * 100) / 100,
      }
    } else if (feeTerms?.fee_type === 'flat' && typeof feeTerms.flat_fee_amount === 'number') {
      const totalFee = feeTerms.flat_fee_amount * rows.length
      feeCalculation = {
        fee_type: 'flat',
        flat_fee_amount: feeTerms.flat_fee_amount,
        total_fee: totalFee,
        net_amount: totalAmount - totalFee,
      }
    }
  } catch {
    /* fee calc optional — app-side syncBatchFees repairs it */
  }

  const unmatchedIds = [
    ...grouped.unmatched.rateCons.map((fp: MatchFingerprint) => fp.docId),
    ...grouped.unmatched.bols.map((fp: MatchFingerprint) => fp.docId),
    ...grouped.unmatched.other.map((fp: MatchFingerprint) => fp.docId),
  ]

  await admin
    .from('batches')
    .update({
      status: 'ready_to_post',
      sort_status: 'ready',
      needs_doc_split: false,
      total_invoices: rows.length,
      total_amount: totalAmount,
      unmatched_doc_ids: unmatchedIds,
      doc_sort_snapshot: buildSnapshot(catalog, grouped.groups.length),
      ...(feeCalculation ? { fee_calculation: feeCalculation } : {}),
    })
    .eq('id', batch.id)

  return {
    done: true,
    progress: `Created ${rows.length} packet(s) server-side`,
    invoicesCreated: rows.length,
  }
}

/** True when this batch still needs server-side Doc Split / packet creation. */
export function batchWantsServerDocSplit(batch: {
  status?: string | null
  needs_doc_split?: boolean | null
}): boolean {
  const status = batch.status ?? ''
  if (status === 'rework' || status === 'draft') return false
  return true
}
