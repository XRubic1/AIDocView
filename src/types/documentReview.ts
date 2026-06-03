import {
  FIELD_UNCERTAINTY_THRESHOLD,
  getDefaultLoadNumberPrompt,
  RateConFieldKey,
} from '../config/rateConRules'
import { parseSourceRegion } from '../utils/parseSourceRegion'

/** Per-page types including non-actionable pages. */
export type PageDocumentType =
  | 'invoice'
  | 'blank'
  | 'rate_confirmation'
  | 'bill_of_lading'
  | 'proof_of_delivery'
  | 'lumper'
  | 'other'

export type DocumentType =
  | 'rate_confirmation'
  | 'bill_of_lading'
  | 'proof_of_delivery'
  | 'lumper'
  | 'other'

export type ReviewModel = string

export interface PageLegibility {
  pageNumber: number
  isLegible: boolean
  notes?: string
}

/** AI-extracted field with confidence and optional user clarification request. */
export interface ExtractedField<T = string | number> {
  value?: T
  confidence: number
  needsUserInput?: boolean
  userPrompt?: string
  /** Where on the document to look, e.g. "Under Carrier header". */
  labelHint?: string
  /** Short sentence explaining why the AI chose this value. */
  reasoning?: string
  sourcePage?: number
  /** Normalized box (0–1) where the AI read this value on the page. */
  sourceRegion?: FieldRegionBox
}

export interface RateConFields {
  carrier?: ExtractedField<string>
  broker?: ExtractedField<string>
  rate?: ExtractedField<number>
  emailDomain?: ExtractedField<string>
  loadNumber?: ExtractedField<string>
  pickup?: ExtractedField<string>
  drop?: ExtractedField<string>
}

export interface PageClassification {
  pageNumber: number
  pageType: PageDocumentType
  isBlank: boolean
  isLegible: boolean
  confidence: number
  notes?: string
  skipped?: boolean
  skipReason?: string
}

export interface ExtractedDocumentData {
  documentType: DocumentType
  origin?: string
  destination?: string
  shipFrom?: string
  shipTo?: string
  loadNumber?: string
  rate?: number
  hasSignature: boolean
  hasReceiverSignature?: boolean
  receivingDate?: string
  signatureNotes?: string
  confidence: number
  fieldsFound: string[]
  notes?: string
  totalPagesInFile?: number
  pagesReviewed?: number
  pageLegibility?: PageLegibility[]
  isFullyLegible?: boolean
  /** Per-page classification for multi-page packets. */
  pageClassifications?: PageClassification[]
  /** Structured rate con fields with per-field confidence. */
  rateConFields?: RateConFields
  /** Per-field AI reasoning for BOL values (keys match training UI, e.g. bol_shipFrom). */
  bolFieldMeta?: Record<string, FieldAiMeta>
  /** Prompt 2 — structured rate con parse. */
  rateConParse?: import('./documentPipeline').RateConParse
  /** Prompt 3 — BOL audit report. */
  bolAudit?: import('./documentPipeline').BolAudit
  /** Per-page BOL audits when rate con has multiple delivery stops. */
  bolPageAudits?: Array<{
    pageNumber: number
    shipTo?: string
    audit: import('./documentPipeline').BolAudit
  }>
  /** Per-page invoice extraction when multiple invoice sheets exist. */
  invoicePageAudits?: Array<{
    pageNumber: number
    invoice: import('./documentPipeline').InvoiceParse
  }>
  /** Per-page lumper extraction when lumper receipts are present. */
  lumperPageAudits?: Array<{
    pageNumber: number
    amount?: number
    vendor?: string
    notes?: string
  }>
  /** Best-matching invoice for this load (from multi-invoice verification). */
  primaryInvoice?: import('./documentPipeline').InvoiceParse
  /** Pipeline stage outputs (batch-level may duplicate on each doc). */
  pipeline?: import('./documentPipeline').LoadAuditPipeline
}

/** Metadata explaining how the AI extracted a field value. */
export interface FieldAiMeta {
  reasoning?: string
  labelHint?: string
  confidence?: number
  sourcePage?: number
}

/** Normalized bounding box (0–1) marking where a field appears on a page. */
export interface FieldRegionBox {
  pageNumber: number
  x: number
  y: number
  width: number
  height: number
}

export interface ReviewImageInfo {
  previewDataUrl: string
  sourceType: 'pdf_page' | 'image'
  pageNumber: number
  totalPages: number
  imageWidth: number
  imageHeight: number
  fileName: string
  fileSize: number
  mimeType: string
}

export interface DocumentReviewAttempt {
  model: ReviewModel
  confidence: number
  rawResponse: Record<string, unknown>
  usedForResult: boolean
  reviewedAt: string
  /** Token usage and estimated cost for this API call. */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    estimatedCostUsd: number
  }
  promptKind?:
    | 'classify'
    | 'page_classify'
    | 'bol_deep_review'
    | 'bol_validator'
    | 'rate_con_deep_review'
    | 'invoice_extractor'
    | 'lumper_extractor'
    | 'cross_validation'
    | 'final_summary'
    | 'dispatcher_rule'
    | 'field_hint'
    | 'field_region'
    | 'page_scan'
}

export interface DocumentReviewDebugLog {
  image: ReviewImageInfo
  images?: ReviewImageInfo[]
  attempts: DocumentReviewAttempt[]
  promptNote: string
}

export interface DocumentReviewResult {
  documentId: string
  fileName: string
  modelUsed: ReviewModel
  upgradedFromMini: boolean
  extraction: ExtractedDocumentData
  debugLog: DocumentReviewDebugLog
  /** AI spend cap reached before all extraction steps finished. */
  costCapExceeded?: boolean
  costCapMessage?: string
}

/** User override for a single extracted field (for corrections / future ML). */
export interface UserFieldCorrection {
  fieldKey: RateConFieldKey | string
  aiValue?: string | number
  correctedValue: string | number
  /** User marked the AI extraction as correct (true) or wrong (false). */
  aiCorrect?: boolean
  userHint?: string
  labelHint?: string
  reasoning?: string
  sourcePage?: number
  region?: FieldRegionBox
  correctedAt: string
}

export interface BatchDocumentReviewResult {
  documents: DocumentReviewResult[]
  rateConDestination?: string
  bolShipTo?: string
  bolDestination?: string
  destinationMatch: boolean | null
  overallConfidence: number
  issues: string[]
  warnings: string[]
  reviewedAt: string
  /** Prompt 4 — cross-validation across load documents. */
  crossValidation?: import('./documentPipeline').CrossValidationResult
  /** Prompt 6 — dispatcher-readable summary. */
  auditSummary?: import('./documentPipeline').LoadAuditSummary
  /** Excel load sheet comparison (Section 4). */
  excelMatch?: import('./loadSheet').ExcelMatchResult
  /** Uploaded Excel file name — carrier account (motor carrier) identifier. */
  excelFileName?: string
  /** Column mapping status from Excel upload. */
  excelDetectedColumns?: import('./loadSheet').ExcelDetectedColumn[]
  /** Estimated OpenAI cost for this verification run. */
  reviewCost?: import('../utils/reviewCost').ReviewCostSummary
  /** One signed BOL required per rate con delivery stop. */
  multiStopBol?: import('../utils/multiStopBolValidation').MultiStopBolResult
  /** All carrier invoices in the upload verified against rate con / Excel. */
  multiInvoice?: import('../utils/multiInvoiceValidation').MultiInvoiceResult
}

/** Raw field object from OpenAI JSON response. */
export interface RawExtractedField {
  value?: string | number | null
  confidence?: number
  needsUserInput?: boolean
  userPrompt?: string
  labelHint?: string
  reasoning?: string
  sourcePage?: number
  source_region?: {
    page_number?: number
    pageNumber?: number
    x?: number
    y?: number
    width?: number
    height?: number
  }
}

export function parseRawField<T extends string | number>(
  raw: RawExtractedField | string | number | null | undefined,
  fallbackPrompt?: string
): ExtractedField<T> | undefined {
  if (raw === null || raw === undefined) return undefined

  if (typeof raw === 'string' || typeof raw === 'number') {
    return {
      value: raw as T,
      confidence: 1,
    }
  }

  const value =
    raw.value === null || raw.value === undefined ? undefined : (raw.value as T)
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence ?? (value ? 0.85 : 0.3))))
  const needsUserInput =
    raw.needsUserInput ?? (confidence < FIELD_UNCERTAINTY_THRESHOLD && value === undefined)

  return {
    value,
    confidence,
    needsUserInput,
    userPrompt: raw.userPrompt ?? (needsUserInput ? fallbackPrompt : undefined),
    labelHint: raw.labelHint,
    reasoning: raw.reasoning?.trim() || undefined,
    sourceRegion: parseSourceRegion(
      raw.source_region,
      Number(raw.sourcePage ?? 1)
    ),
    sourcePage:
      raw.sourcePage ??
      parseSourceRegion(raw.source_region, 1)?.pageNumber,
  }
}

export function getEffectiveFieldValue<T extends string | number>(
  field?: ExtractedField<T>,
  userOverride?: T
): T | undefined {
  if (userOverride !== undefined && userOverride !== '') return userOverride
  return field?.value
}

export function getRateConDestination(fields?: RateConFields, extraction?: ExtractedDocumentData): string | undefined {
  return (
    getEffectiveFieldValue(fields?.drop) ??
    extraction?.destination ??
    extraction?.shipTo
  )
}

export function getRateConLoadNumber(fields?: RateConFields, extraction?: ExtractedDocumentData): string | undefined {
  return getEffectiveFieldValue(fields?.loadNumber) ?? extraction?.loadNumber
}

export function applyLoadNumberPrompt(fields: RateConFields): RateConFields {
  const loadField = fields.loadNumber
  if (!loadField?.needsUserInput || loadField.userPrompt) return fields

  return {
    ...fields,
    loadNumber: {
      ...loadField,
      userPrompt: getDefaultLoadNumberPrompt(),
    },
  }
}
