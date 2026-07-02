import {
  DOCUMENT_CLASSIFIER_PROMPT,
  buildMultiPageClassifierPrompt,
  buildRateConExtractorPrompt,
  buildBolValidatorPrompt,
  buildInvoiceExtractorPrompt,
  buildLumperExtractorPrompt,
  buildMultiInvoiceExtractorPrompt,
  buildMultiLumperExtractorPrompt,
  buildDispatcherRulePrompt,
} from '../config/documentAiPrompts'
import { pipelineDocTypeToPageType } from '../utils/classifierMapping'
import { getShipperRulesForPrompt } from '../utils/shipperRulesStore'
import { getBolAiRulesForPrompt } from '../utils/reviewRulesStore'
import { buildBolRateConJson, buildCompactRateConContext } from '../utils/promptContext'
import {
  parseSignatureLocalization,
  reconcileReceiverSignatureConsensus,
  verifyReceiverSignatureCrop,
} from '../utils/bolSignatureVerification'
import { shouldUseCarrierOcrExcelCorrection } from '../utils/reviewRulesEngine'
import {
  coerceLocationString,
  coerceStringField,
  rateConParseToFields,
  rateConParseToFlat,
  finalizeRateConExtraction,
} from '../utils/rateConParseMapper'
import {
  runCrossValidation,
  runPerPacketCrossValidation,
  extractBatchContext,
} from './crossValidationService'
import { extractBatchFields } from '../utils/extractBatchFields'
import {
  autoMatchExcelRow,
  findBestExcelRow,
  matchLoadSheetToDocuments,
} from '../utils/excelLoadMatching'
import { buildLoadAuditSummary } from '../utils/loadAuditSummary'
import {
  documentHasBolEvidence,
  evaluateRequiredDocuments,
  mergeOverallStatus,
} from '../utils/requiredDocuments'
import {
  extractBolUnitsFromBatch,
  validateMultiStopBolCoverage,
} from '../utils/multiStopBolValidation'
import { refinePageClassifications, mergeTrainingPageClassifications } from '../utils/refinePageClassifications'
import {
  BolAuditContext,
  finalizeBolAudit,
  sanitizeBolPageCountAudit,
} from '../utils/bolAuditSanitizer'
import {
  extractInvoiceUnitsFromBatch,
  validateMultiInvoiceCoverage,
  buildRateConsFromBatch,
  isInvoiceAcceptedForLoad,
} from '../utils/multiInvoiceValidation'
import { reconcileCarrierNameAcrossDocuments } from '../utils/carrierOcrCorrection'
import { applyEffectiveRateToParse } from '../utils/effectiveRateAmount'
import {
  aggregateReviewCost,
  ApiUsageRecord,
  usageFromOpenAIResponse,
  ReviewCostBudget,
  ReviewCostBudgetExceededError,
  createDocumentReviewCostBudget,
  getReviewCostCapUserMessage,
} from '../utils/reviewCost'
import { resolveParallelDocumentsForBatch } from '../utils/estimateReviewTokens'
import { postOpenAIChatCompletions } from '../utils/openaiFetch'
import { runWithConcurrency } from '../utils/runWithConcurrency'
import { LoadSheetRow } from '../types/loadSheet'
import { destinationsMatch, formatRateConStop } from '../utils/locationMatch'
import {
  BolAudit,
  CrossValidationFlag,
  DispatcherShipperRule,
  InvoiceParse,
  RateConParse,
} from '../types/documentPipeline'
import {
  BatchDocumentReviewResult,
  DocumentReviewAttempt,
  DocumentReviewResult,
  DocumentType,
  ExtractedDocumentData,
  ExtractedField,
  FieldRegionBox,
  PageClassification,
  PageDocumentType,
  PageLegibility,
  parseRawField,
  RateConFields,
  RawExtractedField,
  ReviewImageInfo,
  ReviewModel,
  applyLoadNumberPrompt,
  FieldAiMeta,
} from '../types/documentReview'
import { getFieldLabel } from '../utils/annotatableFields'
import {
  computeBatchOverallConfidence,
  computeDocumentReviewConfidence,
} from '../utils/reviewConfidence'
import {
  countDeliveryProofPages,
  filterDeliveryProofPages,
  isDeliveryProofPageType,
} from '../utils/deliveryProofPages'
import { applyFailClosedApprovalGate } from '../utils/failClosedApprovalGate'
import { getBolFailureReasons } from '../utils/bolAuditSanitizer'
import { getPerPacketCrossValidation } from '../utils/perPacketVerification'
import { buildRegionReviewImage } from '../utils/cropImageRegion'
import { fileToReviewImages, getReviewPageCount } from '../utils/fileToReviewImage'
import {
  AI_REVIEW_CONFIG,
  getOpenAIApiKey,
  isAIReviewEnabled,
} from '../config/aiReview'

// Re-export for consumers
export { destinationsMatch } from '../utils/locationMatch'

import {
  getDefaultAddressPrompt,
  getDefaultLoadNumberPrompt,
  RateConFieldKey,
} from '../config/rateConRules'

const FIELD_HINT_PROMPT = (fieldKey: string, fieldLabel: string, userHint: string) =>
  `Re-extract ONLY the "${fieldLabel}" field (${fieldKey}) from this document page.

User guidance: "${userHint}"

Return ONLY JSON:
{ "fieldKey": "${fieldKey}", "field": { "value": "string or number or null", "confidence": 0-1, "labelHint": "where found", "reasoning": "why you chose this value", "source_region": { "page_number": 1, "x": 0, "y": 0, "width": 0, "height": 0 }, "needsUserInput": false } }`

const FIELD_REGION_PROMPT = (fieldKey: string, fieldLabel: string, userHint?: string) =>
  `The user drew a box on a trucking document pointing to "${fieldLabel}" (${fieldKey}).
This cropped image is ONLY the marked region — extract the field value from what you see inside the box.

${userHint ? `User note: "${userHint}"` : ''}

Rules:
- Addresses: return full street, city, and state when visible
- bol_receiverSignature: return "Yes" if a signature is visible, otherwise "No"
- rate: return number only

Return ONLY JSON:
{ "fieldKey": "${fieldKey}", "field": { "value": "string or number or null", "confidence": 0-1, "labelHint": "user marked region", "reasoning": "what you read inside the marked box", "needsUserInput": false } }`

interface ModelExtractionResult {
  extraction: ExtractedDocumentData
  rawResponse: Record<string, unknown>
  rateConFields?: RateConFields
  usage?: ApiUsageRecord
}

function usageForAttempt(usage?: ApiUsageRecord) {
  if (!usage) return undefined
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
  }
}

interface OpenAIExtractionResponse {
  documentType?: DocumentType | string
  pageType?: PageDocumentType | string
  isBlank?: boolean
  isLegible?: boolean
  origin?: string | Record<string, unknown> | null
  destination?: string | Record<string, unknown> | null
  destinations?: Array<Record<string, unknown>>
  shipFrom?: string | null
  shipTo?: string | null
  loadNumber?: string | null
  load_number?: string | null
  rate_total?: number | null
  rate?: number | null
  hasSignature?: boolean
  hasReceiverSignature?: boolean
  receivingDate?: string | null
  signatureNotes?: string | null
  confidence?: number
  totalPagesInFile?: number
  pagesReviewed?: number
  pageLegibility?: PageLegibility[]
  isFullyLegible?: boolean
  fieldsFound?: string[]
  notes?: string | null
  fields?: Record<string, RawExtractedField>
  field?: RawExtractedField
  fieldKey?: string
  fieldReasons?: Record<string, string>
  rate_line_items?: Array<{ description?: string; amount?: number | null; category?: string }>
  bol_reference_numbers?: string[]
  reference_numbers?: string[]
  delivery_exceptions?: {
    damages?: string
    shortage?: string
    protest?: string
    notes?: string
  }
  doc_type?: string
  is_blank?: boolean
  is_legible?: boolean
}

function getBolShipTo(extraction: ExtractedDocumentData): string | undefined {
  return extraction.shipTo || extraction.destination
}

function hasBolDeliveryProof(extraction: ExtractedDocumentData): boolean {
  const audit = extraction.bolAudit
  if (audit) {
    return (
      audit.signatures.receiver === 'PRESENT' || audit.signatures.receiver === 'PASS_BY_RULE'
    )
  }
  return Boolean(extraction.hasReceiverSignature)
}

function remapRegionToPacketPage(
  region: FieldRegionBox | undefined,
  packetPages: ReviewImageInfo[],
  defaultPage: number
): FieldRegionBox | undefined {
  if (!region) return undefined
  const packetPageNumbers = packetPages.map((page) => page.pageNumber)
  if (packetPageNumbers.length === 0) return { ...region, pageNumber: defaultPage }
  if (packetPageNumbers.includes(region.pageNumber)) return region

  // Some model responses return page_number relative to provided image order (1..N).
  const relativeIndex = Math.trunc(region.pageNumber) - 1
  if (relativeIndex >= 0 && relativeIndex < packetPageNumbers.length) {
    return { ...region, pageNumber: packetPageNumbers[relativeIndex] }
  }

  return { ...region, pageNumber: defaultPage }
}

function normalizeRateConFieldRegions(
  fields: RateConFields,
  packetPages: ReviewImageInfo[],
  defaultPage: number
): RateConFields {
  const normalized: RateConFields = { ...fields }

  ;(Object.keys(normalized) as RateConFieldKey[]).forEach((key) => {
    const field = normalized[key]
    if (!field) return

    const sourceRegion = remapRegionToPacketPage(field.sourceRegion, packetPages, defaultPage)
    field.sourceRegion = sourceRegion
    field.sourcePage = sourceRegion?.pageNumber ?? field.sourcePage ?? defaultPage
  })

  return normalized
}

function parseRateConFields(
  raw: Record<string, RawExtractedField> | undefined,
  sourcePage: number,
  packetPages: ReviewImageInfo[]
): RateConFields | undefined {
  if (!raw) return undefined

  let fields: RateConFields = {
    carrier: parseRawField<string>(raw.carrier),
    broker: parseRawField<string>(raw.broker),
    rate: parseRawField<number>(raw.rate),
    emailDomain: parseRawField<string>(raw.emailDomain),
    loadNumber: parseRawField<string>(raw.loadNumber, getDefaultLoadNumberPrompt()),
    pickup: parseRawField<string>(raw.pickup, getDefaultAddressPrompt('pickup')),
    drop: parseRawField<string>(raw.drop, getDefaultAddressPrompt('drop')),
  }

  fields = normalizeRateConFieldRegions(fields, packetPages, sourcePage)

  return applyLoadNumberPrompt(fields)
}

function mergeRateConIntoExtraction(
  extraction: ExtractedDocumentData,
  rateConFields: RateConFields,
  rateConParse?: RateConParse
): ExtractedDocumentData {
  const pickup = rateConFields.pickup?.value
  const drop = rateConFields.drop?.value
  const loadNumber = rateConFields.loadNumber?.value
  const rate = rateConFields.rate?.value

  return {
    ...extraction,
    documentType: 'rate_confirmation',
    origin: pickup ?? extraction.origin,
    destination: drop ?? extraction.destination,
    loadNumber: loadNumber ?? extraction.loadNumber,
    rate: rate ?? extraction.rate,
    rateConFields,
    rateConParse,
    fieldsFound: [
      ...new Set([
        ...extraction.fieldsFound,
        ...Object.entries(rateConFields)
          .filter(([, field]) => field?.value !== undefined)
          .map(([key]) => key),
      ]),
    ],
    notes: extraction.notes,
  }
}

function parseRateConParse(raw: Record<string, unknown>): RateConParse {
  const refsRaw = raw.bol_reference_numbers
  const refs = Array.isArray(refsRaw)
    ? refsRaw
        .map((v) => coerceStringField(v))
        .filter((v): v is string => Boolean(v?.trim()))
    : []

  const lineItemsRaw = raw.rate_line_items
  const rateLineItems = Array.isArray(lineItemsRaw)
    ? lineItemsRaw
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const row = item as Record<string, unknown>
          const amount =
            typeof row.amount === 'number'
              ? row.amount
              : typeof row.amount === 'string'
                ? Number(row.amount.replace(/[^\d.-]/g, ''))
                : null
          const category = coerceStringField(row.category)?.toLowerCase()
          return {
            description: coerceStringField(row.description) ?? null,
            amount: Number.isFinite(amount as number) ? (amount as number) : null,
            category:
              category === 'linehaul' ||
              category === 'fuel' ||
              category === 'unloading' ||
              category === 'detention'
                ? category
                : 'other',
          } as NonNullable<RateConParse['rate_line_items']>[number]
        })
        .filter((row): row is NonNullable<RateConParse['rate_line_items']>[number] => row != null)
    : undefined

  return {
    ...(raw as RateConParse),
    bol_reference_numbers: refs.length > 0 ? [...new Set(refs)] : undefined,
    rate_line_items: rateLineItems && rateLineItems.length > 0 ? rateLineItems : undefined,
  }
}

function parseBolAudit(raw: Record<string, unknown>): BolAudit | undefined {
  const audit = (raw.bol_audit ?? raw) as BolAudit
  if (!audit?.signatures) return undefined
  const referencesRaw = (raw.reference_numbers ??
    (raw.bol_audit as Record<string, unknown> | undefined)?.reference_numbers) as unknown
  const reference_numbers = Array.isArray(referencesRaw)
    ? referencesRaw
        .map((value) => coerceStringField(value))
        .filter((value): value is string => Boolean(value))
    : audit.reference_numbers ?? []

  const exceptionsRaw = (raw.delivery_exceptions ??
    (raw.bol_audit as Record<string, unknown> | undefined)?.delivery_exceptions) as
    | Record<string, unknown>
    | undefined
  const normalizeException = (value: unknown): 'NONE' | 'NOTED' | 'UNCLEAR' => {
    const text = coerceStringField(value)?.toUpperCase()
    if (text === 'NOTED') return 'NOTED'
    if (text === 'UNCLEAR') return 'UNCLEAR'
    return 'NONE'
  }
  const delivery_exceptions = exceptionsRaw
    ? {
        damages: normalizeException(exceptionsRaw.damages),
        shortage: normalizeException(exceptionsRaw.shortage),
        protest: normalizeException(exceptionsRaw.protest),
        notes: coerceStringField(exceptionsRaw.notes),
      }
    : audit.delivery_exceptions

  const sigRaw = audit.signatures as Record<string, unknown>
  const normalizeAuth = (value: unknown): 'NONE' | 'NOTED' | 'UNCLEAR' => {
    const text = coerceStringField(value)?.toUpperCase()
    if (text === 'NOTED') return 'NOTED'
    if (text === 'UNCLEAR') return 'UNCLEAR'
    return 'NONE'
  }
  const signatures = {
    ...audit.signatures,
    receiver_authenticity: normalizeAuth(sigRaw.receiver_authenticity),
    shipper_authenticity: normalizeAuth(sigRaw.shipper_authenticity),
    carrier_authenticity: normalizeAuth(sigRaw.carrier_authenticity),
    receiver_localization:
      parseSignatureLocalization(sigRaw.receiver_localization) ??
      audit.signatures.receiver_localization ??
      null,
    shipper_localization:
      parseSignatureLocalization(sigRaw.shipper_localization) ??
      audit.signatures.shipper_localization ??
      null,
    carrier_localization:
      parseSignatureLocalization(sigRaw.carrier_localization) ??
      audit.signatures.carrier_localization ??
      null,
  }

  return {
    ...audit,
    reference_numbers: [...new Set(reference_numbers)],
    delivery_exceptions,
    signatures,
  }
}

function parsePageClassification(raw: OpenAIExtractionResponse & Record<string, unknown>, pageNumber: number): PageClassification {
  const docType = (raw.doc_type as string) ?? (raw.pageType as string)
  const pageType = docType
    ? pipelineDocTypeToPageType(docType)
    : ['invoice', 'blank', 'rate_confirmation', 'bill_of_lading', 'proof_of_delivery', 'delivery_confirmation', 'lumper', 'other'].includes(
          raw.pageType as string
        )
      ? (raw.pageType as PageDocumentType)
      : 'other'

  const isBlank = Boolean(raw.is_blank ?? raw.isBlank) || pageType === 'blank'
  const isLegible = isBlank ? false : (raw.is_legible ?? raw.isLegible) !== false

  let skipped = false
  let skipReason: string | undefined
  if (isBlank) {
    skipped = true
    skipReason = 'Blank or unreadable page'
  }

  return {
    pageNumber,
    pageType,
    isBlank,
    isLegible,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0.5))),
    notes: raw.notes?.trim() || undefined,
    skipped,
    skipReason,
  }
}

function parseBolFieldMeta(raw: OpenAIExtractionResponse): Record<string, FieldAiMeta> | undefined {
  const reasons = raw.fieldReasons
  if (!reasons || typeof reasons !== 'object') return undefined

  const keyMap: Record<string, string> = {
    shipFrom: 'bol_shipFrom',
    shipTo: 'bol_shipTo',
    loadNumber: 'bol_loadNumber',
    hasReceiverSignature: 'bol_receiverSignature',
    receivingDate: 'bol_receivingDate',
  }

  const meta: Record<string, FieldAiMeta> = {}
  Object.entries(keyMap).forEach(([rawKey, annotKey]) => {
    const reasoning = reasons[rawKey]?.trim()
    if (reasoning) meta[annotKey] = { reasoning }
  })

  return Object.keys(meta).length > 0 ? meta : undefined
}

function parseExtraction(raw: OpenAIExtractionResponse): ExtractedDocumentData {
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence ?? 0)))
  const validTypes: DocumentType[] = [
    'rate_confirmation',
    'bill_of_lading',
    'proof_of_delivery',
    'delivery_confirmation',
    'lumper',
    'other',
  ]
  const documentType = validTypes.includes(raw.documentType as DocumentType)
    ? (raw.documentType as DocumentType)
    : 'other'

  const shipFrom = coerceStringField(raw.shipFrom)
  const shipTo = coerceStringField(raw.shipTo)
  const originFromObject = coerceLocationString(raw.origin)
  const destinationFromObject =
    coerceLocationString(raw.destination) ??
    (raw.destinations?.length ? coerceLocationString(raw.destinations[0]) : undefined)

  return {
    documentType,
    origin: originFromObject || shipFrom || undefined,
    destination: destinationFromObject || shipTo || undefined,
    shipFrom,
    shipTo,
    loadNumber: coerceStringField(raw.loadNumber) ?? coerceStringField(raw.load_number),
    rate:
      typeof raw.rate === 'number'
        ? raw.rate
        : typeof raw.rate_total === 'number'
          ? raw.rate_total
          : undefined,
    hasSignature: Boolean(raw.hasSignature),
    hasReceiverSignature:
      raw.hasReceiverSignature === undefined ? undefined : Boolean(raw.hasReceiverSignature),
    receivingDate: coerceStringField(raw.receivingDate),
    signatureNotes: coerceStringField(raw.signatureNotes),
    confidence,
    fieldsFound: Array.isArray(raw.fieldsFound) ? raw.fieldsFound : [],
    notes: coerceStringField(raw.notes),
    totalPagesInFile: typeof raw.totalPagesInFile === 'number' ? raw.totalPagesInFile : undefined,
    pagesReviewed: typeof raw.pagesReviewed === 'number' ? raw.pagesReviewed : undefined,
    pageLegibility: Array.isArray(raw.pageLegibility) ? raw.pageLegibility : undefined,
    isFullyLegible: raw.isFullyLegible === undefined ? undefined : Boolean(raw.isFullyLegible),
    bolFieldMeta: parseBolFieldMeta(raw),
  }
}

async function callOpenAIJson(
  prompt: string,
  options: {
    images?: ReviewImageInfo[]
    model?: ReviewModel
    detail?: 'low' | 'high'
    visionLabelMode?: 'default' | 'bol_audit'
    budget?: ReviewCostBudget
  }
): Promise<{ data: Record<string, unknown>; usage: ApiUsageRecord }> {
  const apiKey = getOpenAIApiKey()
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Add VITE_OPENAI_API_KEY to your .env file.')
  }

  options.budget?.assertWithinBudget()

  const images = options.images ?? []
  const messages = images.length
    ? [
        {
          role: 'user' as const,
          content: buildVisionContent(prompt, images, options.detail ?? 'low', options.visionLabelMode),
        },
      ]
    : [{ role: 'user' as const, content: prompt }]

  const response = await postOpenAIChatCompletions({
    model: options.model ?? AI_REVIEW_CONFIG.PRIMARY_MODEL,
    temperature: AI_REVIEW_CONFIG.OPENAI_TEMPERATURE,
    seed: AI_REVIEW_CONFIG.OPENAI_SEED,
    response_format: { type: 'json_object' },
    messages,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`)
  }

  const payload = (await response.json()) as Record<string, unknown>
  const content = (payload?.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content
  if (!content) throw new Error('OpenAI returned an empty response')
  const model = options.model ?? AI_REVIEW_CONFIG.PRIMARY_MODEL
  const usage = usageFromOpenAIResponse(payload, model)
  options.budget?.record(usage)
  return {
    data: JSON.parse(content) as Record<string, unknown>,
    usage,
  }
}

function applyBolAuditToExtraction(extraction: ExtractedDocumentData, audit: BolAudit): ExtractedDocumentData {
  const receiverOk =
    audit.signatures.receiver === 'PRESENT' || audit.signatures.receiver === 'PASS_BY_RULE'
  const dateOk =
    audit.signatures.receiver_date === 'PRESENT' || audit.signatures.receiver_date === 'PASS_BY_RULE'

  return {
    ...extraction,
    shipFrom: audit.ship_from ?? extraction.shipFrom,
    shipTo: audit.ship_to ?? extraction.shipTo,
    destination: audit.ship_to ?? extraction.destination,
    loadNumber:
      extraction.rateConParse?.load_number ??
      extraction.rateConFields?.loadNumber?.value?.toString() ??
      extraction.loadNumber ??
      audit.load_number,
    hasReceiverSignature: receiverOk,
    receivingDate: dateOk ? extraction.receivingDate ?? 'Present' : extraction.receivingDate,
    bolAudit: audit,
    isFullyLegible: audit.legibility === 'PASS',
    confidence:
      audit.overall === 'APPROVED'
        ? Math.min(0.88, Math.max(extraction.confidence, 0.75))
        : Math.min(extraction.confidence, receiverOk ? 0.62 : 0.5),
  }
}

function buildBolAuditContext(
  pages: ReviewImageInfo[],
  allBolPacketPageNumbers: number[]
): BolAuditContext {
  return {
    packetPageNumbers: pages.map((page) => page.pageNumber),
    allBolPacketPageNumbers,
    totalPacketPages: pages[0]?.totalPages ?? pages.length,
  }
}

async function auditBolPages(
  pages: ReviewImageInfo[],
  rateConParse?: RateConParse,
  bolContext?: BolAuditContext,
  budget?: ReviewCostBudget
): Promise<{ audit?: BolAudit; attempts: DocumentReviewAttempt[] }> {
  const context =
    bolContext ??
    buildBolAuditContext(
      pages,
      pages.map((page) => page.pageNumber)
    )

  const rulesForPrompt = [
    ...getShipperRulesForPrompt(),
    ...getBolAiRulesForPrompt().map((rule) => ({ shipper: 'Custom', rule })),
  ]
  const prompt = buildBolValidatorPrompt(
    buildBolRateConJson(rateConParse),
    JSON.stringify(rulesForPrompt),
    context
  )

  const consensusRuns = AI_REVIEW_CONFIG.SIGNATURE_CONSENSUS_RUNS
  const attempts: DocumentReviewAttempt[] = []
  const receiverPasses: Array<{ receiver: BolAudit['signatures']['receiver']; cropVerified: boolean }> =
    []
  let primaryAudit: BolAudit | undefined
  let primaryRaw: Record<string, unknown> | undefined

  for (let passIndex = 0; passIndex < consensusRuns; passIndex += 1) {
    if (budget?.isAtOrOverLimit()) break

    const model =
      passIndex > 0 && AI_REVIEW_CONFIG.SIGNATURE_CONSENSUS_MIXED_MODELS
        ? AI_REVIEW_CONFIG.FALLBACK_MODEL
        : AI_REVIEW_CONFIG.PRIMARY_MODEL

    const { data: raw, usage } = await callOpenAIJson(prompt, {
      images: pages,
      model,
      detail: AI_REVIEW_CONFIG.DEEP_REVIEW_DETAIL,
      visionLabelMode: 'bol_audit',
      budget,
    })

    const parsed = parseBolAudit(raw)
    if (!parsed) continue

    const { audit: cropChecked, attempt: cropAttempt } = await verifyReceiverSignatureCrop({
      audit: parsed,
      pages,
      model,
      budget,
      callJson: callOpenAIJson,
      usageForAttempt: (usage) => usageForAttempt(usage as ApiUsageRecord | undefined),
    })

    const cropVerified =
      cropChecked.signatures.receiver !== 'PRESENT' ||
      !cropAttempt?.rawResponse?.crop_disagreed

    receiverPasses.push({
      receiver: cropChecked.signatures.receiver,
      cropVerified,
    })

    attempts.push({
      model,
      confidence: cropChecked.overall === 'APPROVED' ? 0.9 : 0.5,
      rawResponse: {
        ...raw,
        consensus_pass: passIndex + 1,
        consensus_runs: consensusRuns,
        receiver_after_crop: cropChecked.signatures.receiver,
        crop_verified: cropVerified,
      },
      usage: usageForAttempt(usage),
      usedForResult: false,
      reviewedAt: new Date().toISOString(),
      promptKind: consensusRuns > 1 ? 'bol_validator_consensus' : 'bol_validator',
    })

    if (cropAttempt) {
      attempts.push(cropAttempt)
    }

    if (!primaryAudit) {
      primaryAudit = cropChecked
      primaryRaw = raw
    }
  }

  if (!primaryAudit) {
    return { audit: undefined, attempts }
  }

  if (receiverPasses.length > 1) {
    const reconciledReceiver = reconcileReceiverSignatureConsensus(receiverPasses)
    primaryAudit = {
      ...primaryAudit,
      signatures: {
        ...primaryAudit.signatures,
        receiver: reconciledReceiver,
      },
      flags:
        reconciledReceiver === 'UNCLEAR' &&
        !primaryAudit.flags.some((flag) => /consensus/i.test(flag))
          ? [
              ...(primaryAudit.flags ?? []),
              `Receiver signature consensus: ${receiverPasses.length} validator passes disagreed — manual review required.`,
            ]
          : primaryAudit.flags,
    }
  }

  const sanitized = sanitizeBolPageCountAudit(primaryAudit, context)
  const audit = finalizeBolAudit(sanitized, rateConParse)

  if (primaryRaw && attempts[0]) {
    attempts[0].rawResponse = {
      ...attempts[0].rawResponse,
      bol_audit: audit,
      consensus_receiver: audit.signatures.receiver,
    }
    attempts[0].confidence = audit.overall === 'APPROVED' ? 0.9 : 0.5
    attempts[0].usedForResult = true
  }

  attempts.forEach((attempt, index) => {
    if (index === 0) return
    attempt.usedForResult = false
  })

  return { audit, attempts }
}

function buildVisionContent(
  prompt: string,
  images: ReviewImageInfo[],
  detail: 'low' | 'high' = 'low',
  labelMode: 'default' | 'bol_audit' = 'default'
): Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> {
  const content: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
    { type: 'text', text: prompt },
  ]

  images.forEach((image) => {
    const pageLabel =
      labelMode === 'bol_audit' && image.sourceType === 'pdf_page'
        ? `PDF packet sheet ${image.pageNumber} of ${image.totalPages} in the combined upload (rate con / BOL / receipts — NOT the BOL's printed "Page X of Y")`
        : image.sourceType === 'pdf_page'
          ? `Page ${image.pageNumber} of ${image.totalPages}`
          : 'Marked region'
    content.push({ type: 'text', text: pageLabel })
    content.push({
      type: 'image_url',
      image_url: { url: image.previewDataUrl, detail },
    })
  })

  return content
}

async function extractWithModel(
  prompt: string,
  images: ReviewImageInfo[],
  model: ReviewModel,
  detail: 'low' | 'high' = 'low',
  budget?: ReviewCostBudget
): Promise<ModelExtractionResult> {
  const apiKey = getOpenAIApiKey()
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Add VITE_OPENAI_API_KEY to your .env file.')
  }

  budget?.assertWithinBudget()

  const response = await postOpenAIChatCompletions({
    model,
    temperature: AI_REVIEW_CONFIG.OPENAI_TEMPERATURE,
    seed: AI_REVIEW_CONFIG.OPENAI_SEED,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: buildVisionContent(prompt, images, detail) }],
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`)
  }

  const payload = (await response.json()) as Record<string, unknown>
  const content = (payload?.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI returned an empty response')
  }

  const rawResponse = JSON.parse(content) as OpenAIExtractionResponse
  const sourcePage = images[0]?.pageNumber ?? 1
  const rateConFields = parseRateConFields(rawResponse.fields, sourcePage, images)
  const usage = usageFromOpenAIResponse(payload, model)
  budget?.record(usage)

  return {
    extraction: parseExtraction(rawResponse),
    rawResponse: rawResponse as Record<string, unknown>,
    rateConFields,
    usage,
  }
}

async function runWithFallback(
  prompt: string,
  images: ReviewImageInfo[],
  promptKind: DocumentReviewAttempt['promptKind'],
  detail: 'low' | 'high' = AI_REVIEW_CONFIG.DEEP_REVIEW_DETAIL,
  budget?: ReviewCostBudget
): Promise<{
  extraction: ExtractedDocumentData
  rateConFields?: RateConFields
  modelUsed: ReviewModel
  upgradedFromMini: boolean
  attempts: DocumentReviewAttempt[]
}> {
  const attempts: DocumentReviewAttempt[] = []

  let primary = await extractWithModel(
    prompt,
    images,
    AI_REVIEW_CONFIG.PRIMARY_MODEL,
    detail,
    budget
  )
  attempts.push({
    model: AI_REVIEW_CONFIG.PRIMARY_MODEL,
    confidence: primary.extraction.confidence,
    rawResponse: primary.rawResponse,
    usage: usageForAttempt(primary.usage),
    usedForResult: true,
    reviewedAt: new Date().toISOString(),
    promptKind,
  })

  let extraction = primary.extraction
  let rateConFields = primary.rateConFields
  let modelUsed: ReviewModel = AI_REVIEW_CONFIG.PRIMARY_MODEL
  let upgradedFromMini = false

  const canFallback =
    AI_REVIEW_CONFIG.ENABLE_MODEL_FALLBACK &&
    AI_REVIEW_CONFIG.FALLBACK_MODEL !== AI_REVIEW_CONFIG.PRIMARY_MODEL

  if (
    canFallback &&
    !budget?.isAtOrOverLimit() &&
    extraction.confidence < AI_REVIEW_CONFIG.CONFIDENCE_THRESHOLD
  ) {
    attempts[0].usedForResult = false
    const fallback = await extractWithModel(
      prompt,
      images,
      AI_REVIEW_CONFIG.FALLBACK_MODEL,
      detail,
      budget
    )
    attempts.push({
      model: AI_REVIEW_CONFIG.FALLBACK_MODEL,
      confidence: fallback.extraction.confidence,
      rawResponse: fallback.rawResponse,
      usage: usageForAttempt(fallback.usage),
      usedForResult: true,
      reviewedAt: new Date().toISOString(),
      promptKind,
    })
    extraction = fallback.extraction
    rateConFields = fallback.rateConFields
    modelUsed = AI_REVIEW_CONFIG.FALLBACK_MODEL
    upgradedFromMini = true
  }

  return { extraction, rateConFields, modelUsed, upgradedFromMini, attempts }
}

function parseBatchedPageClassifications(
  raw: Record<string, unknown>,
  batch: ReviewImageInfo[]
): PageClassification[] {
  const rows = Array.isArray(raw.pages) ? (raw.pages as Record<string, unknown>[]) : [raw]

  return batch.map((page, index) => {
    const match =
      rows.find((row) => Number(row.page_number ?? row.pageNumber) === page.pageNumber) ??
      rows[index] ??
      raw
    return parsePageClassification(match as OpenAIExtractionResponse & Record<string, unknown>, page.pageNumber)
  })
}

async function classifyPageBatch(
  batch: ReviewImageInfo[],
  budget?: ReviewCostBudget
): Promise<{
  classifications: PageClassification[]
  attempt: DocumentReviewAttempt
}> {
  const prompt =
    batch.length === 1
      ? DOCUMENT_CLASSIFIER_PROMPT
      : buildMultiPageClassifierPrompt(batch.map((page) => page.pageNumber))

  const result = await extractWithModel(
    prompt,
    batch,
    AI_REVIEW_CONFIG.CLASSIFY_MODEL,
    AI_REVIEW_CONFIG.PAGE_CLASSIFY_DETAIL,
    budget
  )

  const classifications = parseBatchedPageClassifications(result.rawResponse, batch)
  const batchConfidence =
    classifications.length > 0
      ? classifications.reduce((sum, page) => sum + page.confidence, 0) / classifications.length
      : 0

  return {
    classifications: refinePageClassifications(classifications),
    attempt: {
      model: AI_REVIEW_CONFIG.CLASSIFY_MODEL,
      confidence: batchConfidence,
      rawResponse: result.rawResponse,
      usage: usageForAttempt(result.usage),
      usedForResult: true,
      reviewedAt: new Date().toISOString(),
      promptKind: 'page_classify',
    },
  }
}

/** Classify every page — batched API calls on the cheaper classify model. */
async function classifyAllPages(
  pages: ReviewImageInfo[],
  budget?: ReviewCostBudget
): Promise<{
  classifications: PageClassification[]
  attempts: DocumentReviewAttempt[]
}> {
  const classifications: PageClassification[] = []
  const attempts: DocumentReviewAttempt[] = []
  const batchSize = Math.max(1, AI_REVIEW_CONFIG.CLASSIFY_BATCH_SIZE)

  for (let index = 0; index < pages.length; index += batchSize) {
    if (budget?.isAtOrOverLimit()) break
    const batch = pages.slice(index, index + batchSize)
    const result = await classifyPageBatch(batch, budget)
    classifications.push(...result.classifications)
    attempts.push(result.attempt)
  }

  return { classifications, attempts }
}

async function reviewBolDocument(
  pages: ReviewImageInfo[],
  rateConParse?: RateConParse,
  budget?: ReviewCostBudget
) {
  const deliveryStops = rateConParse?.destinations?.length ?? 0
  const auditPerPage = deliveryStops > 1 && pages.length > 0
  const allBolPacketPageNumbers = pages.map((page) => page.pageNumber)

  if (auditPerPage) {
    const bolPageAudits: NonNullable<ExtractedDocumentData['bolPageAudits']> = []
    const attempts: DocumentReviewAttempt[] = []

    for (const page of pages) {
      if (budget?.isAtOrOverLimit()) break
      const { audit, attempts: pageAttempts } = await auditBolPages(
        [page],
        rateConParse,
        buildBolAuditContext([page], allBolPacketPageNumbers),
        budget
      )
      if (audit) {
        bolPageAudits.push({
          pageNumber: page.pageNumber,
          shipTo: audit.ship_to,
          audit,
        })
      }
      attempts.push(...pageAttempts)
    }

    const primaryAudit = bolPageAudits[0]?.audit
    let extraction: ExtractedDocumentData = {
      documentType: 'bill_of_lading',
      hasSignature: false,
      confidence: 0.5,
      fieldsFound: ['bol_audit'],
      totalPagesInFile: pages[0]?.totalPages ?? pages.length,
      pagesReviewed: pages.length,
      bolPageAudits,
    }

    if (primaryAudit) {
      extraction = applyBolAuditToExtraction(extraction, primaryAudit)
    }

    return {
      extraction,
      rateConFields: undefined,
      modelUsed: AI_REVIEW_CONFIG.PRIMARY_MODEL,
      upgradedFromMini: false,
      attempts,
    }
  }

  const { audit, attempts: bolAttempts } = await auditBolPages(
    pages,
    rateConParse,
    buildBolAuditContext(pages, allBolPacketPageNumbers),
    budget
  )

  let extraction: ExtractedDocumentData = {
    documentType: 'bill_of_lading',
    hasSignature: false,
    confidence: audit?.overall === 'APPROVED' ? 0.9 : 0.5,
    fieldsFound: ['bol_audit'],
    totalPagesInFile: pages[0]?.totalPages ?? pages.length,
    pagesReviewed: pages.length,
  }

  if (audit) {
    extraction = applyBolAuditToExtraction(extraction, audit)
  }

  return {
    extraction,
    rateConFields: undefined,
    modelUsed: AI_REVIEW_CONFIG.PRIMARY_MODEL,
    upgradedFromMini: false,
    attempts: bolAttempts,
  }
}

async function reviewRateConPages(pages: ReviewImageInfo[], budget?: ReviewCostBudget) {
  const result = await runWithFallback(
    buildRateConExtractorPrompt(),
    pages,
    'rate_con_deep_review',
    AI_REVIEW_CONFIG.DEEP_REVIEW_DETAIL,
    budget
  )

  const usedAttempt = result.attempts.find((attempt) => attempt.usedForResult)
  const raw = (usedAttempt?.rawResponse ?? {}) as Record<string, unknown>
  const rateConParse = parseRateConParse(raw)
  const flat = rateConParseToFlat(rateConParse)

  const rawFields = raw.fields as Record<string, RawExtractedField> | undefined
  const sourcePage = pages[0]?.pageNumber ?? 1

  let rateConFields = parseRateConFields(rawFields, sourcePage, pages)
  if (!rateConFields || !rateConFields.carrier?.value) {
    rateConFields = rateConParseToFields(rateConParse, rawFields, sourcePage)
  }

  const normalizedFields = normalizeRateConFieldRegions(rateConFields, pages, sourcePage)
  const finalized = finalizeRateConExtraction(
    rateConParse,
    applyLoadNumberPrompt(normalizedFields),
    rawFields
  )
  const finalParse = finalized.parse
  rateConFields = finalized.fields

  let extraction = result.extraction
  if (rateConFields) {
    extraction = mergeRateConIntoExtraction(extraction, rateConFields, finalParse)
  }

  extraction = {
    ...extraction,
    documentType: 'rate_confirmation' as DocumentType,
    loadNumber: flat.loadNumber ?? extraction.loadNumber,
    rate: flat.rate ?? extraction.rate,
    origin: flat.origin ?? extraction.origin,
    destination: flat.destination ?? extraction.destination,
    confidence: Number(finalParse.confidence ?? extraction.confidence),
    totalPagesInFile: pages[0]?.totalPages ?? pages.length,
    pagesReviewed: pages.length,
  }

  return {
    ...result,
    extraction,
    rateConFields,
  }
}

function resolvePrimaryDocumentType(classifications: PageClassification[]): DocumentType {
  const priority: PageDocumentType[] = [
    'rate_confirmation',
    'bill_of_lading',
    'proof_of_delivery',
    'delivery_confirmation',
    'lumper',
    'other',
  ]
  for (const type of priority) {
    if (classifications.some((page) => page.pageType === type && !page.skipped)) {
      return type as DocumentType
    }
  }
  return 'other'
}

function filterPagesByType(pages: ReviewImageInfo[], classifications: PageClassification[], type: PageDocumentType) {
  const pageNumbers = new Set(
    classifications.filter((c) => c.pageType === type && !c.skipped).map((c) => c.pageNumber)
  )
  return pages.filter((page) => pageNumbers.has(page.pageNumber))
}

/** Invoice pages are marked skipped for rate/BOL pipeline but still need extraction. */
function filterInvoicePages(pages: ReviewImageInfo[], classifications: PageClassification[]) {
  const pageNumbers = new Set(
    classifications.filter((c) => c.pageType === 'invoice').map((c) => c.pageNumber)
  )
  return pages.filter((page) => pageNumbers.has(page.pageNumber))
}

function parseInvoiceParse(raw: Record<string, unknown>): InvoiceParse {
  const amount =
    typeof raw.amount_total === 'number'
      ? raw.amount_total
      : typeof raw.amount === 'number'
        ? raw.amount
        : typeof raw.total === 'number'
          ? raw.total
          : null

  return {
    invoice_number: coerceStringField(raw.invoice_number) ?? coerceStringField(raw.invoiceNumber),
    load_number: coerceStringField(raw.load_number) ?? coerceStringField(raw.loadNumber),
    broker_name: coerceStringField(raw.broker_name) ?? coerceStringField(raw.broker),
    carrier_name: coerceStringField(raw.carrier_name) ?? coerceStringField(raw.carrier),
    amount_total: amount,
    invoice_date: coerceStringField(raw.invoice_date) ?? coerceStringField(raw.invoiceDate),
    line_items: Array.isArray(raw.line_items)
      ? (raw.line_items as Array<{ description?: string; amount?: number | null }>)
      : undefined,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : undefined,
    notes: coerceStringField(raw.notes),
  }
}

async function reviewInvoicePages(
  pages: ReviewImageInfo[],
  rateConParse?: RateConParse,
  budget?: ReviewCostBudget
) {
  const invoicePageAudits: NonNullable<ExtractedDocumentData['invoicePageAudits']> = []
  const attempts: DocumentReviewAttempt[] = []
  const rateContext = buildCompactRateConContext(rateConParse)

  if (pages.length === 0) {
    return { extraction: { invoicePageAudits, primaryInvoice: undefined }, attempts }
  }

  const prompt =
    pages.length === 1
      ? buildInvoiceExtractorPrompt(rateContext)
      : buildMultiInvoiceExtractorPrompt(
          pages.map((page) => page.pageNumber),
          rateContext
        )

  const { data: raw, usage } = await callOpenAIJson(prompt, {
    images: pages,
    model: AI_REVIEW_CONFIG.PRIMARY_MODEL,
    detail: AI_REVIEW_CONFIG.DEEP_REVIEW_DETAIL,
    budget,
  })

  const rows: Record<string, unknown>[] = Array.isArray(raw.pages)
    ? (raw.pages as Record<string, unknown>[])
    : [raw]

  pages.forEach((page, index) => {
    const row =
      rows.find((entry) => Number(entry.page_number) === page.pageNumber) ??
      rows[index] ??
      raw
    const invoice = parseInvoiceParse(row as Record<string, unknown>)
    invoicePageAudits.push({ pageNumber: page.pageNumber, invoice })
  })

  attempts.push({
    model: AI_REVIEW_CONFIG.PRIMARY_MODEL,
    confidence: invoicePageAudits[0]?.invoice.confidence ?? 0.85,
    rawResponse: raw,
    usage: usageForAttempt(usage),
    usedForResult: true,
    reviewedAt: new Date().toISOString(),
    promptKind: 'invoice_extractor',
  })

  const primaryInvoice = invoicePageAudits[0]?.invoice

  return {
    extraction: {
      invoicePageAudits,
      primaryInvoice,
      loadNumber: primaryInvoice?.load_number ?? undefined,
      rate: primaryInvoice?.amount_total ?? undefined,
    },
    attempts,
  }
}

async function reviewLumperPages(
  pages: ReviewImageInfo[],
  _rateConParse?: RateConParse,
  budget?: ReviewCostBudget
) {
  const lumperPageAudits: NonNullable<ExtractedDocumentData['lumperPageAudits']> = []
  const attempts: DocumentReviewAttempt[] = []

  if (pages.length === 0) {
    return { extraction: { lumperPageAudits }, attempts }
  }

  const prompt =
    pages.length === 1
      ? buildLumperExtractorPrompt()
      : buildMultiLumperExtractorPrompt(pages.map((page) => page.pageNumber))

  const { data: raw, usage } = await callOpenAIJson(prompt, {
    images: pages,
    model: AI_REVIEW_CONFIG.PRIMARY_MODEL,
    detail: AI_REVIEW_CONFIG.DEEP_REVIEW_DETAIL,
    budget,
  })

  const rows: Record<string, unknown>[] = Array.isArray(raw.pages)
    ? (raw.pages as Record<string, unknown>[])
    : [raw]

  pages.forEach((page, index) => {
    const row =
      rows.find((entry) => Number(entry.page_number) === page.pageNumber) ??
      rows[index] ??
      raw
    const amount =
      typeof row.amount === 'number'
        ? row.amount
        : typeof row.amount === 'string'
          ? Number(row.amount.replace(/[^\d.-]/g, ''))
          : undefined
    lumperPageAudits.push({
      pageNumber: page.pageNumber,
      amount: Number.isFinite(amount as number) ? (amount as number) : undefined,
      vendor: coerceStringField(row.vendor),
      notes: coerceStringField(row.notes),
    })
  })

  attempts.push({
    model: AI_REVIEW_CONFIG.PRIMARY_MODEL,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.8,
    rawResponse: raw,
    usage: usageForAttempt(usage),
    usedForResult: true,
    reviewedAt: new Date().toISOString(),
    promptKind: 'lumper_extractor',
  })

  return { extraction: { lumperPageAudits }, attempts }
}

/** Re-extract a field using a user-drawn region and/or text hint. */
export async function reExtractFieldWithGuidance(
  pageImage: ReviewImageInfo,
  fieldKey: string,
  options: { userHint?: string; region?: FieldRegionBox }
): Promise<{ field: ExtractedField<string | number>; attempt: DocumentReviewAttempt }> {
  const fieldLabel = getFieldLabel(fieldKey)
  const userHint = options.userHint?.trim()
  const region = options.region

  let targetImage = pageImage
  let prompt = FIELD_HINT_PROMPT(fieldKey, fieldLabel, userHint ?? '')
  let promptKind: DocumentReviewAttempt['promptKind'] = 'field_hint'
  let detail: 'low' | 'high' = 'low'

  if (region) {
    targetImage = await buildRegionReviewImage(pageImage, region)
    prompt = FIELD_REGION_PROMPT(fieldKey, fieldLabel, userHint)
    promptKind = 'field_region'
    detail = 'high'
  } else if (!userHint) {
    throw new Error('Add a hint or draw a box around the field first.')
  }

  const result = await extractWithModel(
    prompt,
    [targetImage],
    AI_REVIEW_CONFIG.FALLBACK_MODEL,
    detail
  )

  const rawField = (result.rawResponse.field ?? result.rawResponse) as RawExtractedField
  const parsed = parseRawField<string | number>(rawField) ?? { confidence: 0, needsUserInput: true }
  const parsedRegionForPage = parsed.sourceRegion
    ? { ...parsed.sourceRegion, pageNumber: pageImage.pageNumber }
    : undefined

  return {
    field: {
      ...parsed,
      sourcePage: region?.pageNumber ?? parsedRegionForPage?.pageNumber ?? pageImage.pageNumber,
      sourceRegion: region ?? parsedRegionForPage,
      labelHint: region ? 'user marked region' : parsed.labelHint,
      reasoning:
        parsed.reasoning ?? (region ? 'Read from the area you marked on the document' : parsed.reasoning),
    },
    attempt: {
      model: AI_REVIEW_CONFIG.FALLBACK_MODEL,
      confidence: parsed.confidence,
      rawResponse: result.rawResponse,
      usage: usageForAttempt(result.usage),
      usedForResult: true,
      reviewedAt: new Date().toISOString(),
      promptKind,
    },
  }
}

/** @deprecated Use reExtractFieldWithGuidance */
export async function reExtractRateConFieldWithHint(
  pageImage: ReviewImageInfo,
  fieldKey: RateConFieldKey,
  userHint: string
) {
  return reExtractFieldWithGuidance(pageImage, fieldKey, { userHint })
}

export interface ReviewDocumentFileOptions {
  /** Rate con from an earlier file in the same batch (multi-stop BOL per-page audit). */
  batchRateConParse?: RateConParse
  /** Skip BOL audit until batch rate con is merged (phase-1 batch review). */
  deferBolAudit?: boolean
}

/** Pick the richest rate con parse from a batch (prefer multi-stop destinations). */
function mergeBatchRateConParse(documents: DocumentReviewResult[]): RateConParse | undefined {
  const parses = documents
    .map((doc) => doc.extraction.rateConParse)
    .filter((parse): parse is RateConParse =>
      Boolean(parse?.load_number || parse?.carrier_name || (parse?.destinations?.length ?? 0) > 0)
    )

  if (parses.length === 0) return undefined

  return parses.reduce((best, current) => {
    const bestStops = best.destinations?.length ?? 0
    const currentStops = current.destinations?.length ?? 0
    return currentStops > bestStops ? current : best
  })
}

/** Phase 2: run BOL signature audit after batch rate con is available. */
async function completeDeferredBolAuditForDocument(
  file: File,
  partialResult: DocumentReviewResult,
  batchRateConParse?: RateConParse
): Promise<DocumentReviewResult> {
  const pageClassifications = partialResult.extraction.pageClassifications ?? []
  const allPages = await fileToReviewImages(file)
  const pagesToAudit = filterDeliveryProofPages(allPages, pageClassifications)

  if (
    pagesToAudit.length === 0 ||
    partialResult.costCapExceeded ||
    partialResult.extraction.bolAudit ||
    (partialResult.extraction.bolPageAudits?.length ?? 0) > 0
  ) {
    return partialResult
  }

  const budget = createDocumentReviewCostBudget()
  const rateConParse = partialResult.extraction.rateConParse ?? batchRateConParse
  const rateConPages = filterPagesByType(allPages, pageClassifications, 'rate_confirmation')

  try {
    const bolResult = await reviewBolDocument(pagesToAudit, rateConParse, budget)
    let extraction: ExtractedDocumentData = { ...partialResult.extraction, pageClassifications }

    if (rateConPages.length === 0) {
      extraction = { ...bolResult.extraction, pageClassifications }
    } else if (bolResult.extraction.bolAudit || bolResult.extraction.bolPageAudits?.length) {
      extraction = {
        ...extraction,
        pageClassifications,
        bolPageAudits: bolResult.extraction.bolPageAudits,
      }
      if (bolResult.extraction.bolAudit) {
        extraction = applyBolAuditToExtraction(extraction, bolResult.extraction.bolAudit)
      }
    } else {
      extraction = {
        ...extraction,
        shipFrom: bolResult.extraction.shipFrom,
        shipTo: bolResult.extraction.shipTo,
        hasReceiverSignature: bolResult.extraction.hasReceiverSignature,
        receivingDate: bolResult.extraction.receivingDate,
      }
    }

    return {
      ...partialResult,
      extraction,
      debugLog: {
        ...partialResult.debugLog,
        attempts: [...partialResult.debugLog.attempts, ...bolResult.attempts],
      },
    }
  } catch (error) {
    if (error instanceof ReviewCostBudgetExceededError) {
      return {
        ...partialResult,
        costCapExceeded: true,
        costCapMessage: error.message,
      }
    }
    throw error
  }
}

/** Review one document — classify all pages; extract invoice (billed info), rate con, and BOL. */
export async function reviewDocumentFile(
  file: File,
  documentId: string,
  options?: ReviewDocumentFileOptions
): Promise<DocumentReviewResult> {
  const allPages = await fileToReviewImages(file)
  const primaryImage = allPages[0]
  const budget = createDocumentReviewCostBudget()

  let attempts: DocumentReviewAttempt[] = []
  let modelUsed: ReviewModel = AI_REVIEW_CONFIG.PRIMARY_MODEL
  let upgradedFromMini = false
  let reviewedImages: ReviewImageInfo[] = [primaryImage]
  let costCapExceeded = false
  let costCapMessage: string | undefined

  let pageClassifications: PageClassification[] = []
  let extraction: ExtractedDocumentData = {
    documentType: 'other',
    hasSignature: false,
    confidence: 0,
    fieldsFound: [],
    pageClassifications: [],
    totalPagesInFile: primaryImage.totalPages,
    pagesReviewed: allPages.length,
  }

  try {
    if (allPages.length > 1 || allPages[0].sourceType === 'pdf_page') {
      const pageScan = await classifyAllPages(allPages, budget)
      pageClassifications = pageScan.classifications
      attempts.push(...pageScan.attempts)
    } else {
      const single = await classifyPageBatch([primaryImage], budget)
      pageClassifications = single.classifications
      attempts.push(single.attempt)
    }

    pageClassifications = mergeTrainingPageClassifications(
      refinePageClassifications(pageClassifications),
      file.name
    )

    extraction = {
      ...extraction,
      documentType: resolvePrimaryDocumentType(pageClassifications),
      pageClassifications,
    }

    const rateConPages = filterPagesByType(allPages, pageClassifications, 'rate_confirmation')
    const invoicePages = filterInvoicePages(allPages, pageClassifications)
    const deliveryProofPages = filterDeliveryProofPages(allPages, pageClassifications)
    const lumperPages = filterPagesByType(allPages, pageClassifications, 'lumper')

    let rateConParse: RateConParse | undefined = options?.batchRateConParse

    if (rateConPages.length > 0 && !budget?.isAtOrOverLimit()) {
      const rateConResult = await reviewRateConPages(rateConPages, budget)
      rateConParse = rateConResult.extraction.rateConParse
      extraction = {
        ...rateConResult.extraction,
        pageClassifications,
      }
      modelUsed = rateConResult.modelUsed
      upgradedFromMini = rateConResult.upgradedFromMini
      attempts.push(...rateConResult.attempts)
      reviewedImages = rateConPages
    }

    if (invoicePages.length > 0 && !budget?.isAtOrOverLimit()) {
      const invoiceResult = await reviewInvoicePages(invoicePages, rateConParse, budget)
      const invoicePageNumbers = new Set(invoicePages.map((page) => page.pageNumber))
      const updatedClassifications = pageClassifications.map((page) =>
        invoicePageNumbers.has(page.pageNumber) && page.pageType === 'invoice'
          ? {
              ...page,
              skipped: false,
              skipReason: 'Carrier invoice — extracted as billed information',
            }
          : page
      )
      extraction = {
        ...extraction,
        pageClassifications: updatedClassifications,
        invoicePageAudits: invoiceResult.extraction.invoicePageAudits,
        primaryInvoice: invoiceResult.extraction.primaryInvoice,
        loadNumber:
          rateConParse?.load_number ?? invoiceResult.extraction.loadNumber ?? extraction.loadNumber,
        rate: rateConParse?.rate_total ?? invoiceResult.extraction.rate ?? extraction.rate,
      }
      pageClassifications = updatedClassifications
      attempts.push(...invoiceResult.attempts)
    }

    if (deliveryProofPages.length > 0 && !budget?.isAtOrOverLimit() && !options?.deferBolAudit) {
      const bolResult = await reviewBolDocument(deliveryProofPages, rateConParse, budget)
      if (rateConPages.length === 0) {
        extraction = { ...bolResult.extraction, pageClassifications }
        modelUsed = bolResult.modelUsed
        upgradedFromMini = bolResult.upgradedFromMini
        reviewedImages = deliveryProofPages
      } else if (bolResult.extraction.bolAudit || bolResult.extraction.bolPageAudits?.length) {
        extraction = {
          ...extraction,
          pageClassifications,
          bolPageAudits: bolResult.extraction.bolPageAudits,
        }
        if (bolResult.extraction.bolAudit) {
          extraction = applyBolAuditToExtraction(extraction, bolResult.extraction.bolAudit)
        }
      } else {
        extraction = {
          ...extraction,
          shipFrom: bolResult.extraction.shipFrom,
          shipTo: bolResult.extraction.shipTo,
          hasReceiverSignature: bolResult.extraction.hasReceiverSignature,
          receivingDate: bolResult.extraction.receivingDate,
        }
      }
      attempts.push(...bolResult.attempts)
    }

    if (lumperPages.length > 0 && !budget?.isAtOrOverLimit()) {
      const lumperResult = await reviewLumperPages(lumperPages, rateConParse, budget)
      extraction = {
        ...extraction,
        lumperPageAudits: lumperResult.extraction.lumperPageAudits,
        pageClassifications,
      }
      attempts.push(...lumperResult.attempts)
    }

    if (rateConPages.length === 0 && deliveryProofPages.length === 0 && pageClassifications.length > 0) {
      extraction.confidence =
        pageClassifications.reduce((sum, page) => sum + page.confidence, 0) / pageClassifications.length
    }
  } catch (error) {
    if (error instanceof ReviewCostBudgetExceededError) {
      costCapExceeded = true
      costCapMessage = error.message
    } else {
      throw error
    }
  }

  const skippedPages = pageClassifications.filter((p) => p.skipped).map((p) => p.pageNumber)
  const rateConPageNums = pageClassifications
    .filter((p) => p.pageType === 'rate_confirmation')
    .map((p) => p.pageNumber)
  const invoicePageNums = pageClassifications
    .filter((p) => p.pageType === 'invoice')
    .map((p) => p.pageNumber)
  const deliveryProofPageNums = pageClassifications
    .filter((p) => isDeliveryProofPageType(p.pageType))
    .map((p) => p.pageNumber)

  let promptNote =
    allPages.length > 1
      ? `Scanned ${allPages.length} pages. ` +
        (invoicePageNums.length > 0 ? `Invoice (billed info) on page(s): ${invoicePageNums.join(', ')}. ` : '') +
        (rateConPageNums.length > 0 ? `Rate con on page(s): ${rateConPageNums.join(', ')}. ` : '') +
        (deliveryProofPageNums.length > 0 ? `Delivery proof on page(s): ${deliveryProofPageNums.join(', ')}. ` : '') +
        (skippedPages.length > 0 ? `Skipped blank/unreadable page(s): ${skippedPages.join(', ')}.` : '')
      : 'Single page review.'

  if (costCapExceeded) {
    promptNote = `${promptNote} ${costCapMessage ?? getReviewCostCapUserMessage()}`.trim()
  }

  return {
    documentId,
    fileName: file.name,
    modelUsed,
    upgradedFromMini,
    extraction,
    costCapExceeded: costCapExceeded || undefined,
    costCapMessage,
    debugLog: {
      image: primaryImage,
      images: reviewedImages.length > 1 || reviewedImages[0] !== primaryImage ? allPages : reviewedImages,
      attempts,
      promptNote,
    },
  }
}

function collectBolIssues(
  bol: DocumentReviewResult,
  rateConPresent: boolean,
  issues: string[],
  warnings: string[]
) {
  const { extraction, fileName } = bol
  const shipTo = getBolShipTo(extraction)
  const totalPages = extraction.totalPagesInFile ?? 1

  if (totalPages > 1) {
    const illegiblePages =
      extraction.pageLegibility?.filter((page) => !page.isLegible).map((page) => page.pageNumber) ?? []

    if (illegiblePages.length > 0) {
      warnings.push(
        `BOL "${fileName}" — page(s) ${illegiblePages.join(', ')} may not be legible.`
      )
    }
  }

  if (rateConPresent) {
    if (!hasBolDeliveryProof(extraction)) {
      issues.push(
        `Bill of lading in "${fileName}" is missing the receiver signature (required to prove delivery).`
      )
    }
  }

  const bolAudits: BolAudit[] = [
    extraction.bolAudit,
    ...(extraction.bolPageAudits?.map((entry) => entry.audit) ?? []),
  ].filter((audit): audit is BolAudit => Boolean(audit))

  bolAudits.forEach((audit) => {
    if (audit.page_count === 'INCOMPLETE' || audit.page_count === 'FAIL') {
      const failureLines = getBolFailureReasons(audit)
      if (failureLines.length > 0) {
        failureLines.forEach((line) => issues.push(`BOL "${fileName}" — ${line}`))
      } else {
        issues.push(
          `BOL "${fileName}" is incomplete — missing page(s) per printed BOL pagination (e.g. page 2 of 3).`
        )
      }
    }
  })

  if (!shipTo) {
    warnings.push(`BOL "${fileName}" — Ship To could not be read.`)
  }
}

export type ReviewUploadOptions = {
  invoiceAmount?: number | null
  invoiceLoadNumber?: string | null
  invoiceBroker?: string | null
  excelLoadNumber?: string | null
  excelBroker?: string | null
  excelAmount?: number | null
  excelInvoiceNumber?: string | null
  /** Manual Excel row override (optional). */
  excelRow?: LoadSheetRow
  /** Full parsed Excel sheet — auto-match row per invoice / batch. */
  excelRows?: LoadSheetRow[]
  /** Uploaded Excel file name — carrier account identifier. */
  excelFileName?: string
  /** Column detection from parsed Excel upload. */
  excelDetectedColumns?: import('../types/loadSheet').ExcelDetectedColumn[]
  /** Per-PDF progress for FactorFox-style invoice cards. */
  onDocumentProgress?: (event: {
    docId: string
    fileName: string
    status: 'reviewing' | 'complete' | 'error'
    progress: number
    stepLabel: string
    partialDocuments?: DocumentReviewResult[]
    error?: string
  }) => void
}

export async function reviewUploadedDocuments(
  documents: Array<{ id: string; name: string; file: File }>,
  options?: ReviewUploadOptions
): Promise<BatchDocumentReviewResult> {
  if (!isAIReviewEnabled()) {
    throw new Error('AI review is not configured. Add VITE_OPENAI_API_KEY to your .env file.')
  }

  let batchRateConParse: RateConParse | undefined
  const sortedDocuments = [...documents].sort((left, right) => {
    const leftIsRate = /rate|confirmation|rc/i.test(left.name)
    const rightIsRate = /rate|confirmation|rc/i.test(right.name)
    if (leftIsRate && !rightIsRate) return -1
    if (!leftIsRate && rightIsRate) return 1
    return 0
  })

  const configuredParallel = AI_REVIEW_CONFIG.PARALLEL_DOCUMENTS
  const pageCounts = await Promise.all(documents.map((document) => getReviewPageCount(document.file)))
  let parallelDocs = configuredParallel
  if (AI_REVIEW_CONFIG.AUTO_THROTTLE_PARALLEL) {
    parallelDocs = resolveParallelDocumentsForBatch(pageCounts, configuredParallel)
  }
  const completedResults: DocumentReviewResult[] = []

  const reviewOneDocument = async (
    document: { id: string; name: string; file: File },
    reviewOptions?: ReviewDocumentFileOptions
  ): Promise<DocumentReviewResult> => {
    options?.onDocumentProgress?.({
      docId: document.id,
      fileName: document.name,
      status: 'reviewing',
      progress: 12,
      stepLabel: reviewOptions?.deferBolAudit
        ? 'Classifying pages · extracting rate con & invoice…'
        : 'Classifying pages · extracting rate con, invoice & BOL…',
    })
    try {
      const sharedRateCon = batchRateConParse
      const result = await reviewDocumentFile(document.file, document.id, {
        batchRateConParse: sharedRateCon,
        ...reviewOptions,
      })
      if (result.extraction.rateConParse) {
        batchRateConParse = result.extraction.rateConParse
      }
      completedResults.push(result)
      options?.onDocumentProgress?.({
        docId: document.id,
        fileName: document.name,
        status: 'complete',
        progress: reviewOptions?.deferBolAudit ? 70 : 100,
        stepLabel: reviewOptions?.deferBolAudit ? 'Extraction complete · BOL audit pending' : 'Extraction complete',
        partialDocuments: [...completedResults],
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Review failed'
      options?.onDocumentProgress?.({
        docId: document.id,
        fileName: document.name,
        status: 'error',
        progress: 0,
        stepLabel: 'Failed',
        error: message,
      })
      throw error
    }
  }

  let reviewResults: DocumentReviewResult[]

  if (parallelDocs <= 1) {
    reviewResults = []
    for (const document of sortedDocuments) {
      reviewResults.push(await reviewOneDocument(document))
    }
  } else {
    const phase1Results = await runWithConcurrency(
      sortedDocuments,
      parallelDocs,
      (document) => reviewOneDocument(document, { deferBolAudit: true }),
      {
        staggerStartMs: AI_REVIEW_CONFIG.PARALLEL_STAGGER_MS,
      }
    )

    const mergedBatchRateCon = mergeBatchRateConParse(phase1Results)
    completedResults.length = 0

    reviewResults = await runWithConcurrency(
      sortedDocuments,
      parallelDocs,
      async (document) => {
        const partial = phase1Results.find((result) => result.documentId === document.id)
        if (!partial) {
          throw new Error(`Missing phase-1 review for ${document.name}`)
        }

        options?.onDocumentProgress?.({
          docId: document.id,
          fileName: document.name,
          status: 'reviewing',
          progress: 80,
          stepLabel: 'Auditing delivery proof signatures…',
        })

        try {
          const completed = await completeDeferredBolAuditForDocument(
            document.file,
            partial,
            mergedBatchRateCon
          )
          const existingIndex = completedResults.findIndex(
            (result) => result.documentId === completed.documentId
          )
          if (existingIndex >= 0) {
            completedResults[existingIndex] = completed
          } else {
            completedResults.push(completed)
          }
          options?.onDocumentProgress?.({
            docId: document.id,
            fileName: document.name,
            status: 'complete',
            progress: 100,
            stepLabel: 'Extraction complete',
            partialDocuments: [...completedResults],
          })
          return completed
        } catch (error) {
          const message = error instanceof Error ? error.message : 'BOL audit failed'
          options?.onDocumentProgress?.({
            docId: document.id,
            fileName: document.name,
            status: 'error',
            progress: 0,
            stepLabel: 'Failed',
            error: message,
          })
          throw error
        }
      },
      {
        staggerStartMs: AI_REVIEW_CONFIG.PARALLEL_STAGGER_MS,
      }
    )
  }

  const { rateConDoc, bolData, rateConParse } = extractBatchContext(reviewResults)
  const rateConPresent = Boolean(rateConDoc)
  const bolAudit =
    bolData?.audit ??
    reviewResults.find((doc) => doc.extraction.bolAudit)?.extraction.bolAudit

  const rateConDestination =
    formatRateConStop(rateConParse?.destinations?.[0]) ??
    (typeof rateConDoc?.extraction.rateConFields?.drop?.value === 'string'
      ? rateConDoc.extraction.rateConFields.drop.value
      : undefined) ??
    rateConDoc?.extraction.destination

  const bolShipTo =
    bolData?.audit?.ship_to ?? bolData?.shipTo ?? getBolShipTo(reviewResults.find((r) => r.extraction.bolAudit)?.extraction ?? reviewResults[0]?.extraction)

  const destinationMatch =
    bolAudit?.destination_match === 'PASS'
      ? true
      : rateConPresent && bolShipTo
        ? destinationsMatch(rateConDestination, bolShipTo)
        : null

  const bolUnits = extractBolUnitsFromBatch(reviewResults)
  const multiStopBol = validateMultiStopBolCoverage(
    rateConParse ?? rateConDoc?.extraction.rateConParse,
    bolUnits
  )

  const invoiceUnits = extractInvoiceUnitsFromBatch(reviewResults)

  let effectiveRateConParse = rateConParse ?? rateConDoc?.extraction.rateConParse
  if (effectiveRateConParse) {
    effectiveRateConParse = applyEffectiveRateToParse(effectiveRateConParse, rateConDoc)
  }

  const batchFields = extractBatchFields(reviewResults)
  const excelRows = options?.excelRows
  let excelRow = options?.excelRow
  if (!excelRow && excelRows?.length) {
    excelRow = findBestExcelRow(excelRows, batchFields)
  }

  const carrierReconcile = shouldUseCarrierOcrExcelCorrection()
    ? reconcileCarrierNameAcrossDocuments(
        effectiveRateConParse,
        invoiceUnits,
        excelRow?.carrier
      )
    : { parse: effectiveRateConParse, flag: undefined as CrossValidationFlag | undefined }
  if (carrierReconcile.parse) {
    effectiveRateConParse = carrierReconcile.parse
    if (rateConDoc) {
      rateConDoc.extraction.rateConParse = carrierReconcile.parse
      if (rateConDoc.extraction.rateConFields?.carrier) {
        rateConDoc.extraction.rateConFields = {
          ...rateConDoc.extraction.rateConFields,
          carrier: {
            ...rateConDoc.extraction.rateConFields.carrier,
            value: carrierReconcile.parse.carrier_name ?? rateConDoc.extraction.rateConFields.carrier.value,
            reasoning: carrierReconcile.flag?.message ?? rateConDoc.extraction.rateConFields.carrier.reasoning,
          },
        }
      }
    }
  }
  const excelMatch = excelRow
    ? matchLoadSheetToDocuments(excelRow, batchFields, options?.excelFileName)
    : excelRows?.length
      ? autoMatchExcelRow(excelRows, batchFields, options?.excelFileName)
      : undefined

  const rateConsInBatch = buildRateConsFromBatch(reviewResults).map((ref) => ({
    ...ref,
    parse: applyEffectiveRateToParse(
      ref.parse,
      reviewResults.find((doc) => doc.documentId === ref.documentId)
    ),
  }))
  const primaryLoadNumber = excelRow?.loadNumber ?? effectiveRateConParse?.load_number
  const multiInvoice = validateMultiInvoiceCoverage(
    effectiveRateConParse,
    invoiceUnits,
    options?.excelAmount ?? excelRow?.amount ?? batchFields.amount,
    {
      rateCons: rateConsInBatch,
      primaryLoadNumber,
      primaryRateConDocumentId: rateConDoc?.documentId,
      excelRows,
      excelFileName: options?.excelFileName,
      reviewDocuments: reviewResults,
    }
  )

  const primaryExcelFromInvoice = multiInvoice.verifications.find((v) => v.excelMatch)?.excelMatch
  const effectiveExcelMatch = primaryExcelFromInvoice ?? excelMatch
  const effectiveExcelRow = primaryExcelFromInvoice?.row ?? excelRow

  const crossValidation = multiInvoice.multiLoadUpload
    ? runPerPacketCrossValidation({
        reviewResults,
        rateCons: rateConsInBatch,
        multiInvoice,
      })
    : runCrossValidation({
        rateConParse: effectiveRateConParse,
        bolAudit,
        reviewDocuments: reviewResults,
        invoiceAmount:
          multiInvoice.primaryInvoice?.amount_total ??
          options?.invoiceAmount ??
          batchFields.amount,
        invoiceLoadNumber:
          multiInvoice.primaryInvoice?.load_number ??
          options?.invoiceLoadNumber ??
          batchFields.invoiceLoadNumber,
        invoiceBroker:
          multiInvoice.primaryInvoice?.broker_name ??
          options?.invoiceBroker ??
          batchFields.broker,
        excelLoadNumber: options?.excelLoadNumber ?? effectiveExcelRow?.loadNumber,
        excelBroker: options?.excelBroker ?? effectiveExcelRow?.broker,
        excelAmount: options?.excelAmount ?? effectiveExcelRow?.amount,
        excelInvoiceNumber: options?.excelInvoiceNumber ?? effectiveExcelRow?.invoiceNumber,
      })

  reviewResults.forEach((doc) => {
    if (!doc.costCapExceeded) return
    const capMessage = doc.costCapMessage ?? getReviewCostCapUserMessage()
    crossValidation.flags.push({
      level: 'WARNING',
      field: multiInvoice.multiLoadUpload ? `packet_${doc.fileName}_review_cost_cap` : 'review_cost_cap',
      message: multiInvoice.multiLoadUpload ? `${doc.fileName}: ${capMessage}` : capMessage,
    })
  })
  if (
    reviewResults.some((doc) => doc.costCapExceeded) &&
    crossValidation.overall === 'APPROVED'
  ) {
    crossValidation.overall = 'NEEDS_REVIEW'
  }

  const allPageClassifications = reviewResults.flatMap(
    (doc) => doc.extraction.pageClassifications ?? []
  )
  const bolPageCount = countDeliveryProofPages(allPageClassifications)

  const issues: string[] = []
  const warnings: string[] = []

  if (carrierReconcile.flag) {
    crossValidation.flags.push(carrierReconcile.flag)
    if (carrierReconcile.flag.level === 'WARNING') warnings.push(carrierReconcile.flag.message)
  }

  crossValidation.flags.forEach((flag) => {
    if (flag.level === 'ERROR') issues.push(flag.message)
    else warnings.push(flag.message)
  })

  if (
    !multiInvoice.multiLoadUpload &&
    multiStopBol.overall === 'INCOMPLETE' &&
    crossValidation.overall === 'APPROVED'
  ) {
    crossValidation.overall = 'REJECTED'
  }

  multiInvoice.flags.forEach((flag) => {
    const exists = crossValidation.flags.some(
      (existing) => existing.field === flag.field && existing.message === flag.message
    )
    if (!exists) crossValidation.flags.push(flag)
    if (flag.level === 'ERROR') issues.push(flag.message)
    else if (flag.level === 'WARNING') warnings.push(flag.message)
  })

  if (multiInvoice.primaryLoadIncomplete && crossValidation.overall === 'APPROVED') {
    const onlyReviewableGaps = multiInvoice.verifications.every(
      (v) =>
        isInvoiceAcceptedForLoad(v) ||
        v.amountExplainedByLumper ||
        (v.status === 'PARTIAL' && v.loadMatch && v.brokerMatch)
    )
    crossValidation.overall = onlyReviewableGaps ? 'NEEDS_REVIEW' : 'REJECTED'
  }

  const applyExcelMatchFlags = (match: typeof effectiveExcelMatch, prefix: string) => {
    match?.fields.forEach((field) => {
      if (field.status === 'MISMATCH') {
        issues.push(`Excel: ${field.message}`)
        crossValidation.flags.push({
          level: 'ERROR',
          field: `${prefix}excel_${field.field}`,
          message: field.message,
        })
      } else if (field.status === 'WARNING') {
        warnings.push(`Excel: ${field.message}`)
        crossValidation.flags.push({
          level: 'WARNING',
          field: `${prefix}excel_${field.field}`,
          message: field.message,
        })
      }
    })
  }

  if (multiInvoice.verifications.some((v) => v.excelMatch)) {
    multiInvoice.verifications.forEach((verification) => {
      if (verification.excelMatch) {
        applyExcelMatchFlags(
          verification.excelMatch,
          `inv_${verification.unit.pageNumbers.join('_')}_`
        )
      }
    })
  } else {
    applyExcelMatchFlags(effectiveExcelMatch, '')
  }

  const excelOverallWorst = multiInvoice.verifications.reduce<
    'MATCH' | 'PARTIAL' | 'MISMATCH' | undefined
  >((worst, verification) => {
    const o = verification.excelMatch?.overall
    if (!o) return worst
    if (o === 'MISMATCH') return 'MISMATCH'
    if (o === 'PARTIAL' && worst !== 'MISMATCH') return 'PARTIAL'
    if (!worst) return o
    return worst
  }, effectiveExcelMatch?.overall)

  if (excelOverallWorst === 'MISMATCH' && crossValidation.overall === 'APPROVED') {
    crossValidation.overall = 'REJECTED'
  } else if (excelOverallWorst === 'PARTIAL' && crossValidation.overall === 'APPROVED') {
    crossValidation.overall = 'NEEDS_REVIEW'
  }

  const requiredDocs = evaluateRequiredDocuments({
    rateConParse: effectiveRateConParse,
    bolAudit,
    bolPageCount,
    pageClassifications: allPageClassifications,
    hasExtractedInvoice: multiInvoice.invoiceCount > 0,
    hasExcelBilling: Boolean(excelRows?.length || options?.excelRow || effectiveExcelMatch),
    reviewDocuments: reviewResults,
    multiLoadUpload: multiInvoice.multiLoadUpload,
  })

  requiredDocs.flags.forEach((flag) => {
    const exists = crossValidation.flags.some(
      (existing) => existing.field === flag.field && existing.message === flag.message
    )
    if (!exists) crossValidation.flags.push(flag)
    if (flag.level === 'ERROR') issues.push(flag.message)
    else if (flag.level === 'WARNING') warnings.push(flag.message)
  })

  crossValidation.overall = mergeOverallStatus(crossValidation.overall, requiredDocs.documentGate)

  const failClosedGate = applyFailClosedApprovalGate({
    reviewDocuments: reviewResults,
    proposedOverall: crossValidation.overall,
  })
  if (failClosedGate.overall !== crossValidation.overall) {
    crossValidation.overall = failClosedGate.overall
  }
  crossValidation.failClosedInvariantFailures = failClosedGate.invariantFailures
  crossValidation.appliedRelaxationRules = failClosedGate.appliedRelaxationRules
  failClosedGate.flags.forEach((flag) => {
    const exists = crossValidation.flags.some(
      (existing) => existing.field === flag.field && existing.message === flag.message
    )
    if (!exists) {
      crossValidation.flags.push({
        level: 'WARNING',
        field: flag.field,
        message: flag.message,
      })
    }
    warnings.push(flag.message)
  })

  const reviewCost = aggregateReviewCost(
    reviewResults.flatMap((doc) => doc.debugLog.attempts.map((attempt) =>
      attempt.usage
        ? {
            model: attempt.model,
            promptTokens: attempt.usage.promptTokens,
            completionTokens: attempt.usage.completionTokens,
            totalTokens: attempt.usage.totalTokens,
            estimatedCostUsd: attempt.usage.estimatedCostUsd,
          }
        : undefined
    ))
  )

  const auditSummary = buildLoadAuditSummary({
    rateConParse: effectiveRateConParse,
    bolAudit,
    crossValidation,
    multiStopBol,
    multiInvoice,
    pageClassifications: allPageClassifications,
    bolPageCount,
    reviewCost,
    reviewDocuments: reviewResults,
  })

  if (!rateConDoc) {
    warnings.push('No rate confirmation detected.')
  }
  const anyDocHasBol = reviewResults.some((r) =>
    documentHasBolEvidence(r.extraction)
  )
  if (
    !requiredDocs.hasBol &&
    !anyDocHasBol &&
    !requiredDocs.flags.some((f) => f.field === 'tonu_no_bol' || f.field.includes('missing_bol'))
  ) {
    const bolMsg = requiredDocs.hasRateCon
      ? 'Bill of lading (BOL) is required but was not detected.'
      : 'No bill of lading detected.'
    if (requiredDocs.hasRateCon) issues.push(bolMsg)
    else warnings.push(bolMsg)
  }
  if (
    rateConPresent &&
    bolShipTo &&
    destinationMatch === false &&
    bolAudit?.destination_match !== 'PASS'
  ) {
    issues.push(
      `Destination mismatch: rate con drop is "${rateConDestination}" but BOL Ship To is "${bolShipTo}".`
    )
  }

  reviewResults.forEach((result) => {
    const hasDeliveryProofPages = result.extraction.pageClassifications?.some(
      (page) => isDeliveryProofPageType(page.pageType)
    )
    if (
      result.extraction.documentType === 'bill_of_lading' ||
      result.extraction.documentType === 'proof_of_delivery' ||
      result.extraction.documentType === 'delivery_confirmation' ||
      hasDeliveryProofPages
    ) {
      collectBolIssues(result, rateConPresent, issues, warnings)
    }

    const uncertainFields = result.extraction.rateConFields
      ? Object.entries(result.extraction.rateConFields).filter(([, field]) => field?.needsUserInput)
      : []
    uncertainFields.forEach(([key, field]) => {
      warnings.push(`"${result.fileName}" — AI needs help with ${key}: ${field?.userPrompt ?? 'Please verify.'}`)
    })
  })

  const batchDraft: BatchDocumentReviewResult = {
    documents: reviewResults,
    rateConDestination,
    bolShipTo,
    bolDestination: bolShipTo,
    destinationMatch,
    overallConfidence: 0,
    issues,
    warnings,
    reviewedAt: new Date().toISOString(),
    crossValidation,
    auditSummary,
    excelMatch: effectiveExcelMatch,
    excelFileName: options?.excelFileName,
    excelDetectedColumns: options?.excelDetectedColumns,
    reviewCost,
    multiStopBol,
    multiInvoice,
  }

  const documentsWithConfidence = reviewResults.map((doc) => ({
    ...doc,
    extraction: {
      ...doc.extraction,
      confidence: computeDocumentReviewConfidence(doc, {
        crossOverall: getPerPacketCrossValidation(doc.fileName, batchDraft)?.overall,
      }),
    },
  }))

  const overallConfidence = computeBatchOverallConfidence(
    documentsWithConfidence,
    crossValidation.overall
  )

  return {
    documents: documentsWithConfidence,
    rateConDestination,
    bolShipTo,
    bolDestination: bolShipTo,
    destinationMatch,
    overallConfidence,
    issues,
    warnings,
    reviewedAt: new Date().toISOString(),
    crossValidation,
    auditSummary,
    excelMatch: effectiveExcelMatch,
    excelFileName: options?.excelFileName,
    excelDetectedColumns: options?.excelDetectedColumns,
    reviewCost,
    multiStopBol,
    multiInvoice,
  }
}

/** Prompt 5 — generate a reusable shipper rule from dispatcher correction. */
export async function generateDispatcherRule(
  originalFinding: Record<string, unknown>,
  dispatcherCorrection: string
): Promise<DispatcherShipperRule> {
  const { data: raw } = await callOpenAIJson(
    buildDispatcherRulePrompt(JSON.stringify(originalFinding, null, 2), dispatcherCorrection),
    { model: AI_REVIEW_CONFIG.FALLBACK_MODEL }
  )
  return raw as unknown as DispatcherShipperRule
}

export { isAIReviewEnabled }
