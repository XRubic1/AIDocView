import { AI_REVIEW_CONFIG } from '../config/aiReview'
import { buildSignatureCropVerifyPrompt } from '../config/documentAiPrompts'
import { ReviewCostBudget } from './reviewCost'
import { BolAudit, SignatureStatus } from '../types/documentPipeline'
import { DocumentReviewAttempt, FieldRegionBox, ReviewImageInfo } from '../types/documentReview'
import { buildRegionReviewImage } from './cropImageRegion'
import { coerceStringField } from './rateConParseMapper'

export type SignatureMarkKind =
  | 'ink_signature'
  | 'stamp'
  | 'initials'
  | 'printed_text'
  | 'empty'
  | 'unclear'

export type SignatureCropContent =
  | 'handwritten_signature'
  | 'stamp'
  | 'initials'
  | 'printed_text'
  | 'empty'
  | 'unclear'

/** Normalized bounding box + description for a signature claimed PRESENT. */
export interface SignatureLocalization {
  page: number
  x: number
  y: number
  w: number
  h: number
  description: string
  mark_kind?: SignatureMarkKind
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function normalizeMarkKind(value: unknown): SignatureMarkKind | undefined {
  const text = coerceStringField(value)?.toLowerCase().replace(/\s+/g, '_')
  if (!text) return undefined
  if (text.includes('ink') || text === 'handwritten_signature' || text === 'signature') {
    return 'ink_signature'
  }
  if (text.includes('stamp')) return 'stamp'
  if (text.includes('initial')) return 'initials'
  if (text.includes('print')) return 'printed_text'
  if (text === 'empty' || text === 'blank') return 'empty'
  if (text === 'unclear') return 'unclear'
  return undefined
}

/** Parse receiver/shipper/carrier localization from BOL validator JSON. */
export function parseSignatureLocalization(raw: unknown): SignatureLocalization | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const region = raw as Record<string, unknown>
  const page = Number(region.page ?? region.page_number ?? region.pageNumber)
  const x = Number(region.x)
  const y = Number(region.y)
  const w = Number(region.w ?? region.width)
  const h = Number(region.h ?? region.height)
  const description = coerceStringField(region.description)?.trim() ?? ''

  if ([x, y, w, h].some((value) => Number.isNaN(value)) || w <= 0 || h <= 0) {
    return undefined
  }

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    x: clamp01(x),
    y: clamp01(y),
    w: clamp01(w),
    h: clamp01(h),
    description,
    mark_kind: normalizeMarkKind(region.mark_kind ?? region.markKind),
  }
}

export function localizationToRegion(localization: SignatureLocalization): FieldRegionBox {
  return {
    pageNumber: localization.page,
    x: localization.x,
    y: localization.y,
    width: localization.w,
    height: localization.h,
  }
}

/** Expand a normalized box with fixed padding for crop verification. */
export function expandNormalizedRegion(
  region: FieldRegionBox,
  padding = AI_REVIEW_CONFIG.SIGNATURE_CROP_PADDING
): FieldRegionBox {
  const padW = region.width * padding
  const padH = region.height * padding
  const x = Math.max(0, region.x - padW)
  const y = Math.max(0, region.y - padH)
  const width = Math.min(1 - x, region.width + padW * 2)
  const height = Math.min(1 - y, region.height + padH * 2)
  return { pageNumber: region.pageNumber, x, y, width, height }
}

export function hasValidReceiverLocalization(audit: BolAudit): boolean {
  const localization = audit.signatures.receiver_localization
  if (!localization) return false
  return localization.w > 0 && localization.h > 0 && localization.description.trim().length > 0
}

export function parseSignatureCropContent(raw: Record<string, unknown>): SignatureCropContent {
  const text = coerceStringField(raw.content ?? raw.signature_content ?? raw.result)
    ?.toLowerCase()
    .replace(/\s+/g, '_')

  if (!text) return 'unclear'
  if (text.includes('handwritten') || text === 'ink_signature' || text === 'signature') {
    return 'handwritten_signature'
  }
  if (text.includes('stamp')) return 'stamp'
  if (text.includes('initial')) return 'initials'
  if (text.includes('print')) return 'printed_text'
  if (text === 'empty' || text === 'blank' || text === 'none') return 'empty'
  return 'unclear'
}

export function cropContentSupportsPresentSignature(content: SignatureCropContent): boolean {
  return content === 'handwritten_signature' || content === 'stamp' || content === 'initials'
}

export interface ReceiverPassResult {
  receiver: SignatureStatus
  cropVerified: boolean
}

/**
 * Unanimous PRESENT with verified crop → PRESENT; unanimous MISSING → MISSING; else UNCLEAR.
 */
export function reconcileReceiverSignatureConsensus(passes: ReceiverPassResult[]): SignatureStatus {
  if (passes.length === 0) return 'MISSING'

  const allMissing = passes.every((pass) => pass.receiver === 'MISSING')
  if (allMissing) return 'MISSING'

  const allPresent = passes.every(
    (pass) => pass.receiver === 'PRESENT' && pass.cropVerified
  )
  if (allPresent) return 'PRESENT'

  return 'UNCLEAR'
}

export interface CropVerificationInput {
  audit: BolAudit
  pages: ReviewImageInfo[]
  model: string
  budget?: ReviewCostBudget
  callJson: (
    prompt: string,
    options: {
      images?: ReviewImageInfo[]
      model?: string
      detail?: 'low' | 'high'
      budget?: ReviewCostBudget
    }
  ) => Promise<{ data: Record<string, unknown>; usage: unknown }>
  usageForAttempt: (usage: unknown) => DocumentReviewAttempt['usage']
}

/** Crop receiver signature region and run a cheap follow-up vision check. */
export async function verifyReceiverSignatureCrop(
  input: CropVerificationInput
): Promise<{ audit: BolAudit; attempt?: DocumentReviewAttempt }> {
  const { audit, pages, model, budget, callJson, usageForAttempt } = input
  if (audit.signatures.receiver !== 'PRESENT') {
    return { audit }
  }

  const localization = audit.signatures.receiver_localization
  if (!localization) {
    return { audit }
  }

  const page = pages.find((entry) => entry.pageNumber === localization.page) ?? pages[0]
  if (!page) return { audit }

  const region = expandNormalizedRegion(localizationToRegion(localization))
  const cropImage = await buildRegionReviewImage(page, region)

  const { data, usage } = await callJson(buildSignatureCropVerifyPrompt(), {
    images: [cropImage],
    model,
    detail: AI_REVIEW_CONFIG.SIGNATURE_CROP_DETAIL,
    budget,
  })

  const cropContent = parseSignatureCropContent(data)
  const cropVerified = cropContentSupportsPresentSignature(cropContent)
  const disagrees = !cropVerified

  const attempt: DocumentReviewAttempt = {
    model,
    confidence: typeof data.confidence === 'number' ? data.confidence : cropVerified ? 0.85 : 0.4,
    rawResponse: {
      ...data,
      crop_content: cropContent,
      crop_disagreed: disagrees,
      localization,
      consensus_note: 'Receiver signature crop verification',
    },
    usedForResult: true,
    reviewedAt: new Date().toISOString(),
    promptKind: 'bol_signature_crop_verify',
    usage: usageForAttempt(usage),
  }

  if (!disagrees) {
    return { audit, attempt }
  }

  return {
    audit: {
      ...audit,
      signatures: {
        ...audit.signatures,
        receiver: 'UNCLEAR',
      },
      flags: [
        ...(audit.flags ?? []),
        `Receiver signature crop verification disagrees — crop shows ${cropContent.replace(/_/g, ' ')}.`,
      ],
    },
    attempt,
  }
}
