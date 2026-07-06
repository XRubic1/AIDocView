import { BolAudit } from '../types/documentPipeline'
import { DocumentReviewAttempt, DocumentReviewResult, ReviewImageInfo } from '../types/documentReview'
import { coerceStringField } from './rateConParseMapper'

export interface AiReasoningEntry {
  id: string
  step: string
  lookedAt: string
  thought: string
  confidence?: number
  status?: 'pass' | 'fail' | 'warn' | 'info'
}

const STEP_LABELS: Record<string, string> = {
  page_classify: 'Page classification',
  classify: 'Document classification',
  bol_validator: 'BOL audit',
  bol_validator_consensus: 'BOL audit',
  bol_signature_crop_verify: 'Signature crop check',
  rate_con_deep_review: 'Rate confirmation extract',
  invoice_extractor: 'Invoice extract',
  lumper_extractor: 'Lumper extract',
  bol_deep_review: 'BOL deep review',
  page_scan: 'Page scan',
  field_hint: 'Field hint',
  field_region: 'Field region',
}

function note(value: unknown): string | undefined {
  const text = coerceStringField(value)?.trim()
  return text || undefined
}

function formatPageRange(pages: number[]): string {
  if (pages.length === 0) return 'document pages'
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  if (sorted.length === 1) return `page ${sorted[0]}`
  if (sorted.length <= 4) return `pages ${sorted.join(', ')}`
  return `pages ${sorted[0]}–${sorted[sorted.length - 1]} (${sorted.length} total)`
}

function pagesFromRaw(raw: Record<string, unknown>): number[] {
  const rows = Array.isArray(raw.pages) ? (raw.pages as Record<string, unknown>[]) : []
  if (rows.length > 0) {
    return rows
      .map((row) => Number(row.page_number ?? row.pageNumber))
      .filter((page) => Number.isFinite(page) && page > 0)
  }
  const single = Number(raw.page_number ?? raw.pageNumber)
  return Number.isFinite(single) && single > 0 ? [single] : []
}

function formatClassifyLookedAt(raw: Record<string, unknown>, images?: ReviewImageInfo[]): string {
  const fromRaw = pagesFromRaw(raw)
  if (fromRaw.length > 0) return formatPageRange(fromRaw)
  if (images?.length) return formatPageRange(images.map((image) => image.pageNumber))
  return 'uploaded pages'
}

function formatClassifyThought(raw: Record<string, unknown>): string {
  const rows = Array.isArray(raw.pages) ? (raw.pages as Record<string, unknown>[]) : []
  if (rows.length > 0) {
    return rows
      .map((row) => {
        const page = row.page_number ?? row.pageNumber ?? '?'
        const type = row.doc_type ?? row.pageType ?? row.document_type ?? 'unknown'
        const conf =
          typeof row.confidence === 'number' ? ` (${Math.round(row.confidence * 100)}%)` : ''
        const legible =
          row.is_legible === false || row.isLegible === false ? ' · not legible' : ''
        const blank = row.is_blank === true || row.isBlank === true ? ' · blank' : ''
        return `p${page}: ${String(type).replace(/_/g, ' ')}${conf}${legible}${blank}`
      })
      .join(' · ')
  }

  const type = raw.doc_type ?? raw.pageType ?? raw.document_type
  const conf = typeof raw.confidence === 'number' ? ` (${Math.round(raw.confidence * 100)}%)` : ''
  if (type) return `${String(type).replace(/_/g, ' ')}${conf}`
  return note(raw.notes) ?? note(raw.reasoning) ?? 'Classified document pages.'
}

function bolPagesLookedAt(doc: DocumentReviewResult): string {
  const deliveryPages =
    doc.extraction.pageClassifications?.filter(
      (page) =>
        !page.skipped &&
        (page.pageType === 'bill_of_lading' ||
          page.pageType === 'proof_of_delivery' ||
          page.pageType === 'delivery_confirmation')
    ) ?? []
  if (deliveryPages.length > 0) {
    return formatPageRange(deliveryPages.map((page) => page.pageNumber))
  }
  return 'BOL / delivery proof pages'
}

function readBolAuditRaw(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  const audit = raw.bol_audit
  if (audit && typeof audit === 'object') return audit as Record<string, unknown>
  if (raw.signatures) return raw
  return undefined
}

function formatBolThought(raw: Record<string, unknown>, bol?: BolAudit): string {
  const parts: string[] = []
  const audit = readBolAuditRaw(raw) ?? {}

  const sig = (audit.signatures ?? bol?.signatures) as Record<string, unknown> | undefined
  if (sig) {
    if (sig.receiver) parts.push(`Receiver signature: ${sig.receiver}`)
    if (sig.receiver_date) parts.push(`Receiver date: ${sig.receiver_date}`)
    if (sig.shipper) parts.push(`Shipper signature: ${sig.shipper}`)
    if (sig.carrier) parts.push(`Carrier signature: ${sig.carrier}`)

    const receiverLoc = sig.receiver_localization as Record<string, unknown> | undefined
    if (receiverLoc?.description) {
      parts.push(`Receiver area: ${receiverLoc.description}`)
    }
    if (receiverLoc?.mark_kind) {
      parts.push(`Mark type: ${String(receiverLoc.mark_kind).replace(/_/g, ' ')}`)
    }
  }

  const destination = note(audit.destination_notes) ?? bol?.destination_notes
  if (destination) parts.push(`Destination: ${destination}`)

  const legibility = note(audit.legibility_notes) ?? bol?.legibility_notes
  if (legibility) parts.push(`Legibility: ${legibility}`)

  const pageCount = note(audit.page_count_notes) ?? bol?.page_count_notes
  if (pageCount) parts.push(`Pages: ${pageCount}`)

  const flags = Array.isArray(audit.flags) ? audit.flags : bol?.flags
  if (flags?.length) parts.push(`Notes: ${flags.join('; ')}`)

  const pass = Number(raw.consensus_pass)
  if (Number.isFinite(pass) && pass > 0) {
    parts.unshift(`Consensus pass ${pass}.`)
  }

  return parts.join(' · ') || 'Audited bill of lading signatures and delivery proof.'
}

function bolThoughtStatus(raw: Record<string, unknown>, bol?: BolAudit): AiReasoningEntry['status'] {
  const audit = readBolAuditRaw(raw)
  const receiver =
    (audit?.signatures as Record<string, unknown> | undefined)?.receiver ??
    bol?.signatures.receiver
  if (receiver === 'PRESENT' || receiver === 'PASS_BY_RULE') return 'pass'
  if (receiver === 'UNCLEAR') return 'warn'
  if (receiver === 'MISSING') return 'fail'
  return 'info'
}

function formatCropLookedAt(raw: Record<string, unknown>): string {
  const localization = raw.localization as Record<string, unknown> | undefined
  const page = localization?.page ?? localization?.page_number ?? localization?.pageNumber
  const attempt = raw.region_attempt
  const total = raw.region_attempts_total
  const regionNote =
    attempt && total ? ` (crop attempt ${attempt}/${total})` : ''
  if (page) return `Receiver signature box on page ${page}${regionNote}`
  return `Cropped receiver signature region${regionNote}`
}

function formatCropThought(raw: Record<string, unknown>): string {
  const parts: string[] = []
  const content = note(raw.crop_content ?? raw.content)
  if (content) parts.push(`Crop content: ${content.replace(/_/g, ' ')}`)

  const cropNotes = note(raw.notes)
  if (cropNotes) parts.push(cropNotes)

  const localization = raw.localization as Record<string, unknown> | undefined
  if (localization?.description) {
    parts.push(`Primary audit said: ${localization.description}`)
  }

  if (raw.localization_trusted === true) {
    parts.push('Trusted primary localization — box may have been misaligned.')
  } else if (raw.crop_disagreed === true) {
    parts.push('Crop disagreed with primary audit.')
  }

  return parts.join(' · ') || 'Verified cropped receiver signature region.'
}

function cropThoughtStatus(raw: Record<string, unknown>): AiReasoningEntry['status'] {
  if (raw.localization_trusted === true) return 'warn'
  const content = String(raw.crop_content ?? raw.content ?? '').toLowerCase()
  if (
    content.includes('handwritten') ||
    content.includes('signature') ||
    content.includes('stamp') ||
    content.includes('initial')
  ) {
    return 'pass'
  }
  if (content === 'empty' || content === 'printed_text') return 'fail'
  if (raw.crop_disagreed === true) return 'warn'
  return 'info'
}

function formatRateConThought(raw: Record<string, unknown>): string {
  const parts: string[] = []
  const fields = Array.isArray(raw.fields) ? (raw.fields as Record<string, unknown>[]) : []
  if (fields.length > 0) {
    const highlights = fields
      .filter((field) => field.value != null && field.value !== '')
      .slice(0, 6)
      .map((field) => {
        const key = String(field.key ?? field.name ?? field.field ?? 'field')
        return `${key}: ${field.value}`
      })
    if (highlights.length > 0) parts.push(`Extracted ${highlights.join(' · ')}`)
  }

  const notes = note(raw.notes) ?? note(raw.reasoning)
  if (notes) parts.push(notes)

  return parts.join(' · ') || 'Extracted rate confirmation fields.'
}

function formatInvoiceThought(raw: Record<string, unknown>): string {
  const invoice = (raw.invoice ?? raw) as Record<string, unknown>
  const parts: string[] = []
  if (invoice.load_number) parts.push(`Load: ${invoice.load_number}`)
  if (invoice.broker_name) parts.push(`Broker: ${invoice.broker_name}`)
  if (invoice.amount_total != null) parts.push(`Amount: $${invoice.amount_total}`)
  const notes = note(raw.notes) ?? note(invoice.notes)
  if (notes) parts.push(notes)
  return parts.join(' · ') || 'Extracted invoice fields.'
}

function formatGenericThought(raw: Record<string, unknown>): string {
  return (
    note(raw.notes) ??
    note(raw.reasoning) ??
    note(raw.summary) ??
    note(raw.message) ??
    'Completed AI review step.'
  )
}

function stepLabel(attempt: DocumentReviewAttempt): string {
  const kind = attempt.promptKind ?? 'review'
  const base = STEP_LABELS[kind] ?? kind.replace(/_/g, ' ')
  const pass = Number(attempt.rawResponse.consensus_pass)
  if (kind === 'bol_validator_consensus' && Number.isFinite(pass) && pass > 0) {
    return `${base} (pass ${pass})`
  }
  return base
}

function buildAttemptEntry(
  attempt: DocumentReviewAttempt,
  index: number,
  doc: DocumentReviewResult
): AiReasoningEntry | null {
  const kind = attempt.promptKind ?? 'unknown'
  const raw = attempt.rawResponse
  const images = doc.debugLog.images

  let lookedAt = ''
  let thought = ''
  let status: AiReasoningEntry['status'] = 'info'

  switch (kind) {
    case 'page_classify':
    case 'classify':
      lookedAt = formatClassifyLookedAt(raw, images)
      thought = formatClassifyThought(raw)
      break
    case 'bol_validator':
    case 'bol_validator_consensus':
      lookedAt = bolPagesLookedAt(doc)
      thought = formatBolThought(raw, doc.extraction.bolAudit)
      status = bolThoughtStatus(raw, doc.extraction.bolAudit)
      break
    case 'bol_signature_crop_verify':
      lookedAt = formatCropLookedAt(raw)
      thought = formatCropThought(raw)
      status = cropThoughtStatus(raw)
      break
    case 'rate_con_deep_review':
      lookedAt = 'Rate confirmation pages'
      thought = formatRateConThought(raw)
      break
    case 'invoice_extractor':
      lookedAt = 'Invoice pages'
      thought = formatInvoiceThought(raw)
      break
    case 'lumper_extractor':
      lookedAt = 'Lumper receipt pages'
      thought = formatGenericThought(raw)
      break
    default:
      lookedAt = images?.length
        ? formatPageRange(images.map((image) => image.pageNumber))
        : 'Document pages'
      thought = formatGenericThought(raw)
  }

  if (!thought.trim()) return null

  return {
    id: `${kind}-${index}`,
    step: stepLabel(attempt),
    lookedAt,
    thought,
    confidence: attempt.confidence,
    status,
  }
}

/** Human-readable AI reasoning steps for the Technical panel. */
export function buildAiReasoningLog(doc: DocumentReviewResult): AiReasoningEntry[] {
  const entries: AiReasoningEntry[] = []

  doc.debugLog.attempts.forEach((attempt, index) => {
    const entry = buildAttemptEntry(attempt, index, doc)
    if (entry) entries.push(entry)
  })

  const bol = doc.extraction.bolAudit
  const hasBolAttempt = doc.debugLog.attempts.some((attempt) =>
    /bol_validator|bol_deep_review/.test(attempt.promptKind ?? '')
  )
  if (bol && !hasBolAttempt) {
    entries.push({
      id: 'bol-final',
      step: 'BOL audit (final)',
      lookedAt: bolPagesLookedAt(doc),
      thought: formatBolThought({}, bol),
      status: bolThoughtStatus({}, bol),
    })
  }

  if (doc.extraction.signatureNotes?.trim()) {
    entries.push({
      id: 'signature-notes',
      step: 'Signature notes',
      lookedAt: bolPagesLookedAt(doc),
      thought: doc.extraction.signatureNotes.trim(),
      status: doc.extraction.hasReceiverSignature ? 'pass' : 'warn',
    })
  }

  if (doc.extraction.notes?.trim()) {
    entries.push({
      id: 'extraction-notes',
      step: 'AI summary',
      lookedAt: doc.fileName,
      thought: doc.extraction.notes.trim(),
      status: 'info',
    })
  }

  return entries
}
