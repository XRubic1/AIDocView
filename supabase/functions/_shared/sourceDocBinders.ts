/**
 * Combined carrier uploads (invoice + rate con + BOL in one PDF) are classified
 * page by page, then collapsed into one file per type:
 *   {stem}.Invoice.pdf
 *   {stem}.RC.Binder.pdf
 *   {stem}.BOL.Binder.pdf
 *
 * Packet creation uses those binders directly — it does not match the pages
 * against each other. The carrier invoice stays unassigned.
 *
 * Used by the browser Doc Split pipeline and the server batch-ai-process pipeline.
 */

export type SourceBinderKind =
  | 'rate_confirmation'
  | 'bill_of_lading'
  | 'invoice'
  | 'lumper'
  | 'other'

const BINDER_SUFFIX: Record<SourceBinderKind, string> = {
  rate_confirmation: 'RC.Binder',
  bill_of_lading: 'BOL.Binder',
  invoice: 'Invoice',
  lumper: 'Lumper',
  other: 'Other',
}

const BINDER_NAME_RE = /^(.*)\.(RC\.Binder|BOL\.Binder|Invoice|Lumper|Other)\.pdf$/i

const SUFFIX_TO_KIND: Record<string, SourceBinderKind> = {
  'rc.binder': 'rate_confirmation',
  'bol.binder': 'bill_of_lading',
  invoice: 'invoice',
  lumper: 'lumper',
  other: 'other',
}

const KIND_ORDER: SourceBinderKind[] = [
  'rate_confirmation',
  'bill_of_lading',
  'invoice',
  'lumper',
  'other',
]

export function normalizeSourceBinderKind(kind: string): SourceBinderKind {
  if (
    kind === 'rate_confirmation' ||
    kind === 'bill_of_lading' ||
    kind === 'invoice' ||
    kind === 'lumper' ||
    kind === 'other'
  ) {
    return kind
  }
  return 'other'
}

export function sourceBinderFileName(stem: string, kind: string): string {
  const suffix = BINDER_SUFFIX[normalizeSourceBinderKind(kind)]
  return `${stem}.${suffix}.pdf`
}

export function parseSourceBinderFileName(
  fileName: string
): { stem: string; kind: SourceBinderKind } | null {
  const match = fileName.trim().match(BINDER_NAME_RE)
  if (!match) return null
  const stem = match[1].trim()
  const kind = SUFFIX_TO_KIND[match[2].toLowerCase()]
  if (!stem || !kind) return null
  return { stem, kind }
}

export function isSourceBinderFileName(fileName: string): boolean {
  return parseSourceBinderFileName(fileName) != null
}

/** `9772-p3.pdf` → { stem: '9772', page: 3 }. */
export function parseUploadPageFileName(
  fileName: string
): { stem: string; page: number } | null {
  const match = fileName.trim().match(/^(.*)-p(\d+)\.pdf$/i)
  if (!match) return null
  const page = Number(match[2])
  if (!Number.isFinite(page) || page < 1) return null
  const stem = match[1].trim()
  if (!stem) return null
  return { stem, page }
}

/** Stem of an original upload (`9772.pdf` or `9772-p2.pdf` → `9772`). */
export function uploadFileStem(fileName: string): string {
  const page = parseUploadPageFileName(fileName)
  if (page) return page.stem
  return fileName.replace(/\.pdf$/i, '').trim()
}

export function stemHasSourceBinder(fileNames: Iterable<string>, parentFileName: string): boolean {
  const stem = uploadFileStem(parentFileName).toLowerCase()
  if (!stem) return false
  for (const name of fileNames) {
    const parsed = parseSourceBinderFileName(name)
    if (parsed && parsed.stem.toLowerCase() === stem) return true
  }
  return false
}

export interface SourceBinderBucket<T> {
  kind: SourceBinderKind
  fileName: string
  pages: T[]
}

export interface SourceBinderPlan<T> {
  stem: string
  buckets: SourceBinderBucket<T>[]
}

/**
 * Group page-split children of the same upload. A stem is planned only when
 * it has two or more pages — single files stay loose and still get matched.
 */
export function planSourceBinders<T extends { fileName: string; kind: string }>(
  pages: T[]
): SourceBinderPlan<T>[] {
  const byStem = new Map<string, T[]>()
  for (const page of pages) {
    const parsed = parseUploadPageFileName(page.fileName)
    if (!parsed) continue
    const list = byStem.get(parsed.stem) ?? []
    list.push(page)
    byStem.set(parsed.stem, list)
  }

  const plans: SourceBinderPlan<T>[] = []
  for (const [stem, group] of byStem) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => {
      const left = parseUploadPageFileName(a.fileName)?.page ?? 0
      const right = parseUploadPageFileName(b.fileName)?.page ?? 0
      return left - right
    })
    const byKind = new Map<SourceBinderKind, T[]>()
    for (const page of sorted) {
      const kind = normalizeSourceBinderKind(page.kind)
      const list = byKind.get(kind) ?? []
      list.push(page)
      byKind.set(kind, list)
    }
    const buckets = KIND_ORDER.filter((kind) => (byKind.get(kind)?.length ?? 0) > 0).map(
      (kind) => ({
        kind,
        fileName: sourceBinderFileName(stem, kind),
        pages: byKind.get(kind)!,
      })
    )
    if (buckets.length > 0) plans.push({ stem, buckets })
  }
  return plans
}

export interface SourceBinderPacket<T> {
  stem: string
  rateCons: T[]
  bols: T[]
  /** Lumper / other binders from the same upload. Attached to the packet. */
  support: T[]
  /** Carrier invoice binders. Stay unassigned — not packet docs. */
  invoices: T[]
}

/**
 * Split already-collapsed binders from loose docs.
 * One packet per upload that has an RC binder and/or a BOL binder.
 */
export function partitionSourceBinders<T extends { fileName: string; kind: string }>(
  fingerprints: T[]
): { packets: SourceBinderPacket<T>[]; unassigned: T[]; loose: T[] } {
  const loose: T[] = []
  const byStem = new Map<string, T[]>()

  for (const fp of fingerprints) {
    const parsed = parseSourceBinderFileName(fp.fileName)
    if (!parsed) {
      loose.push(fp)
      continue
    }
    const list = byStem.get(parsed.stem) ?? []
    list.push(fp)
    byStem.set(parsed.stem, list)
  }

  const packets: SourceBinderPacket<T>[] = []
  const unassigned: T[] = []

  for (const [stem, docs] of byStem) {
    const rateCons = docs.filter((fp) => normalizeSourceBinderKind(fp.kind) === 'rate_confirmation')
    const bols = docs.filter((fp) => normalizeSourceBinderKind(fp.kind) === 'bill_of_lading')
    const invoices = docs.filter((fp) => normalizeSourceBinderKind(fp.kind) === 'invoice')
    const support = docs.filter((fp) => {
      const kind = normalizeSourceBinderKind(fp.kind)
      return kind === 'lumper' || kind === 'other'
    })

    if (rateCons.length === 0 && bols.length === 0) {
      unassigned.push(...invoices, ...support)
      continue
    }

    packets.push({ stem, rateCons, bols, support, invoices })
  }

  return { packets, unassigned, loose }
}
