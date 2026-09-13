import { AI_REVIEW_CONFIG } from '../../../config/aiReview'
import { DOC_SORT_FINGERPRINT_PROMPT } from '../config/prompts'
import type { DocSortFingerprint, DocSortKind } from '../types'
import { loadNumberFromFileName } from '../../../utils/extractBatchFields'
import { parseRateAmount } from '../utils/formatRate'
import { normalizeDocDate } from '../utils/matchKeys'
import { fileToReviewImages } from '../../../utils/fileToReviewImage'
import { postOpenAIChatCompletions } from '../../../utils/openaiFetch'
import { isAiReviewConfigured } from '../../../utils/aiConfigured'
import type { ReviewImageInfo } from '../../../types/documentReview'

function mapDocType(raw: string): DocSortKind {
  const t = raw.toUpperCase().replace(/\s+/g, '_')
  if (t === 'RATE_CON' || t === 'RATE_CONFIRMATION') return 'rate_confirmation'
  if (t === 'BOL' || t === 'BILL_OF_LADING') return 'bill_of_lading'
  return 'other'
}

/** DocSort classify uses low detail — smaller payloads, fewer Edge Function 502s. */
const DOC_SORT_VISION_DETAIL = 'low' as const

function buildVisionContent(prompt: string, pages: ReviewImageInfo[]) {
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: prompt },
    {
      type: 'text',
      text: `This file has ${pages[0]?.totalPages ?? pages.length} page(s). Treat every page as part of ONE document. The payable rate may appear after page 1.`,
    },
  ]
  pages.forEach((image) => {
    content.push({ type: 'text', text: `Page ${image.pageNumber} of ${image.totalPages}` })
    content.push({
      type: 'image_url',
      image_url: { url: image.previewDataUrl, detail: DOC_SORT_VISION_DETAIL },
    })
  })
  return content
}

function parseFingerprintResponse(
  raw: Record<string, unknown>,
  docId: string,
  fileName: string
): DocSortFingerprint {
  const loadNumbers: string[] = []
  const rawLoads = raw.load_numbers ?? raw.loadNumbers
  if (Array.isArray(rawLoads)) {
    rawLoads.forEach((item) => {
      if (item != null && String(item).trim()) loadNumbers.push(String(item).trim())
    })
  } else if (typeof raw.load_number === 'string' && raw.load_number.trim()) {
    loadNumbers.push(raw.load_number.trim())
  }

  const fromFile = loadNumberFromFileName(fileName)
  if (fromFile && !loadNumbers.some((n) => n.includes(fromFile))) {
    loadNumbers.push(fromFile)
  }

  const kind = mapDocType(String(raw.doc_type ?? raw.docType ?? 'OTHER'))
  const rateRaw = raw.rate_amount ?? raw.rateAmount ?? raw.linehaul_rate ?? raw.total_rate
  const rateAmount = parseRateAmount(rateRaw)
  const rateCurrency =
    typeof raw.rate_currency === 'string' && raw.rate_currency.trim()
      ? raw.rate_currency.trim().toUpperCase()
      : rateAmount != null
        ? 'USD'
        : undefined

  return {
    docId,
    fileName,
    kind,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0.7))),
    loadNumbers,
    broker: typeof raw.broker_name === 'string' ? raw.broker_name.trim() : undefined,
    carrier: typeof raw.carrier_name === 'string' ? raw.carrier_name.trim() : undefined,
    pickup: typeof raw.pickup === 'string' ? raw.pickup.trim() : undefined,
    delivery: typeof raw.delivery === 'string' ? raw.delivery.trim() : undefined,
    pickupDate: normalizeDocDate(
      typeof raw.pickup_date === 'string' ? raw.pickup_date : String(raw.pickupDate ?? '')
    ) || undefined,
    deliveryDate: normalizeDocDate(
      typeof raw.delivery_date === 'string' ? raw.delivery_date : String(raw.deliveryDate ?? '')
    ) || undefined,
    rateAmount,
    rateCurrency,
    notes: typeof raw.notes === 'string' ? raw.notes.trim() : undefined,
  }
}

const DOC_SORT_PAGES_PER_FILE = 4

/**
 * One vision call per file — classify + extract match keys (up to first 4 pages).
 */
export async function fingerprintDocSortFile(
  file: File,
  docId: string
): Promise<DocSortFingerprint> {
  if (!isAiReviewConfigured()) {
    throw new Error(
      'AI review requires Supabase. Deploy openai-proxy with OPENAI_API_KEY.'
    )
  }

  const pages = await fileToReviewImages(file, DOC_SORT_PAGES_PER_FILE)
  if (pages.length === 0) {
    throw new Error('Could not read document image.')
  }

  const response = await postOpenAIChatCompletions({
    model: AI_REVIEW_CONFIG.CLASSIFY_MODEL,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: buildVisionContent(DOC_SORT_FINGERPRINT_PROMPT, pages) }],
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`DocSort scan failed (${response.status}): ${body}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('DocSort scan returned empty response.')
  }

  const raw = JSON.parse(content) as Record<string, unknown>
  return parseFingerprintResponse(raw, docId, file.name)
}
