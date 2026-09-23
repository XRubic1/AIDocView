import type { Invoice } from '../types/invoice'
import type { InvoiceAiReviewSnapshot } from '../types/invoiceAiReview'
import type { LoadCheckRow, LoadCheckStatus } from './loadReviewSummary'
import { getInvoiceAiReviewCache } from '../data/invoiceAiReviewCache'

const VALID_STATUSES = new Set<LoadCheckStatus>([
  'ok',
  'issue',
  'warning',
  'info',
  'missing',
])

function coerceCheckRow(raw: unknown, index: number): LoadCheckRow | null {
  if (typeof raw === 'string') {
    const label = raw.trim()
    if (!label) return null
    // Legacy edge snapshots stored plain strings — show the label with a pass icon
    // so the panel is readable until catalog rebuild replaces the snapshot.
    return {
      id: `legacy_${index}`,
      label,
      status: 'ok',
      summary: label,
    }
  }
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<LoadCheckRow>
  const label = String(row.label ?? '').trim()
  if (!label && !row.id) return null
  const status = VALID_STATUSES.has(row.status as LoadCheckStatus)
    ? (row.status as LoadCheckStatus)
    : 'issue'
  return {
    id: String(row.id ?? `check_${index}`),
    label: label || String(row.id),
    status,
    summary: String(row.summary ?? label ?? ''),
    detail: row.detail,
    excelValue: row.excelValue,
    documentValue: row.documentValue,
  }
}

/** True when raw stored JSON uses the legacy edge shape (string check rows / no paperwork). */
export function isMalformedAiReviewSnapshotRaw(raw?: string | null): boolean {
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw) as {
      requiredAll?: unknown
      paperwork?: unknown
      source?: string
    }
    const rows = parsed.requiredAll
    if (!Array.isArray(rows) || rows.length === 0) return true
    if (rows.some((row) => typeof row === 'string')) return true
    if (
      rows.some(
        (row) =>
          !row ||
          typeof row !== 'object' ||
          !('status' in (row as object)) ||
          !('label' in (row as object))
      )
    ) {
      return true
    }
    // Edge writes that never included paperwork leave the Extracted panel blank.
    if (parsed.source === 'batch-ai-process-edge' && !parsed.paperwork) return true
    return false
  } catch {
    return true
  }
}

/** Coerce string-shaped check rows so the outcome panel can render labels + icons. */
export function normalizeInvoiceAiReviewSnapshot(
  snapshot: InvoiceAiReviewSnapshot | null
): InvoiceAiReviewSnapshot | null {
  if (!snapshot) return null
  if (!Array.isArray(snapshot.requiredAll)) return snapshot

  const requiredAll = snapshot.requiredAll
    .map((row, i) => coerceCheckRow(row, i))
    .filter((row): row is LoadCheckRow => Boolean(row))

  if (requiredAll.length === 0) return snapshot

  const requiredPassed = requiredAll.filter((r) => r.status === 'ok')
  const requiredFailed = requiredAll.filter((r) => r.status !== 'ok')
  const hadStringRows = snapshot.requiredAll.some((row) => typeof row === 'string')

  return {
    ...snapshot,
    requiredAll,
    requiredPassed,
    requiredFailed,
    passCount: hadStringRows ? requiredPassed.length : (snapshot.passCount ?? requiredPassed.length),
    requiredTotal: snapshot.requiredTotal || requiredAll.length,
    paperwork: snapshot.paperwork ?? {},
  }
}

/** Parse stored AI review JSON; returns null when missing or invalid. */
export function parseInvoiceAiReviewSnapshot(
  raw?: string | null
): InvoiceAiReviewSnapshot | null {
  if (!raw) return null
  try {
    return normalizeInvoiceAiReviewSnapshot(JSON.parse(raw) as InvoiceAiReviewSnapshot)
  } catch {
    return null
  }
}

/** Snapshot from in-memory cache or persisted invoice JSON. */
export function invoiceAiReviewSnapshotFor(invoice: Invoice): InvoiceAiReviewSnapshot | null {
  const cached = getInvoiceAiReviewCache(invoice.id)?.snapshot
  if (cached) return normalizeInvoiceAiReviewSnapshot(cached)
  return parseInvoiceAiReviewSnapshot(invoice.ai_review_snapshot)
}
