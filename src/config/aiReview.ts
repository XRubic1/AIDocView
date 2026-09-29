/** AI document review configuration — primary model with confidence-based fallback. */
import { getRuntimeEnvString } from '../platform/runtimeEnv'
import { getOpenAIChatCompletionsHandler } from '../platform/openaiTransport'
import { isSupabaseConfigured } from '../lib/supabase'
import { getUserTpmLimit } from '../utils/aiReviewUserSettings'

const DEFAULT_PRIMARY_MODEL = 'gpt-4.1-2025-04-14'
const DEFAULT_FALLBACK_MODEL = 'gpt-4o-2024-08-06'
/** Text-layer rate cons. Same family as the vision model, about 5× cheaper. */
const DEFAULT_RATE_CON_TEXT_MODEL = 'gpt-4.1-mini-2025-04-14'
const DEFAULT_OPENAI_SEED = 42_001_337

type ModelEnvKey =
  | 'VITE_AI_PRIMARY_MODEL'
  | 'VITE_AI_FALLBACK_MODEL'
  | 'VITE_AI_CLASSIFY_MODEL'
  | 'VITE_AI_CHAT_MODEL'
  | 'VITE_AI_RATE_CON_TEXT_MODEL'

function readEnvModel(key: ModelEnvKey, fallback: string): string {
  return getRuntimeEnvString(key) || fallback
}

function readEnvBool(
  key:
    | 'VITE_AI_REVIEW_ECONOMY'
    | 'VITE_AI_ENABLE_FALLBACK'
    | 'VITE_AI_AUTO_THROTTLE_PARALLEL'
    | 'VITE_AI_SIGNATURE_CONSENSUS_MIXED',
  defaultValue: boolean
): boolean {
  const raw = getRuntimeEnvString(key)?.toLowerCase()
  if (!raw) return defaultValue
  return raw === 'true' || raw === '1' || raw === 'yes'
}

function readEnvInt(
  key:
    | 'VITE_AI_MAX_PDF_PAGES'
    | 'VITE_AI_CLASSIFY_BATCH_SIZE'
    | 'VITE_AI_MAX_IMAGE_WIDTH'
    | 'VITE_AI_PARALLEL_DOCUMENTS'
    | 'VITE_AI_TPM_LIMIT'
    | 'VITE_AI_PARALLEL_STAGGER_MS'
    | 'VITE_AI_OPENAI_SEED'
    | 'VITE_AI_SIGNATURE_CONSENSUS',
  fallback: number
): number {
  const raw = getRuntimeEnvString(key)
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const economyMode = () => readEnvBool('VITE_AI_REVIEW_ECONOMY', false)

function readVisionDetail(): 'low' | 'high' {
  const raw = getRuntimeEnvString('VITE_AI_DEEP_REVIEW_DETAIL')?.toLowerCase()
  if (raw === 'low' || raw === 'high') return raw
  return economyMode() ? 'low' : 'high'
}

function readEnvFloat(
  key: 'VITE_AI_MAX_REVIEW_COST_USD' | 'VITE_AI_TPM_WARN_RATIO' | 'VITE_AI_TPM_THROTTLE_RATIO' | 'VITE_AI_TPM_ESTIMATE_BUFFER',
  fallback: number
): number {
  const raw = getRuntimeEnvString(key)
  if (!raw) return fallback
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export const AI_REVIEW_CONFIG = {
  /** OpenAI sampling temperature for extraction/audit (0 = most deterministic). */
  OPENAI_TEMPERATURE: 0,
  /** Fixed seed for reproducible vision extraction when the model supports it. */
  get OPENAI_SEED() {
    return readEnvInt('VITE_AI_OPENAI_SEED', DEFAULT_OPENAI_SEED)
  },
  /**
   * Receiver-signature BOL validator passes (1 = single call, 2 = consensus default).
   * Only the BOL signature audit is repeated — classify/extract stay single-call.
   */
  get SIGNATURE_CONSENSUS_RUNS() {
    return Math.max(1, Math.min(3, readEnvInt('VITE_AI_SIGNATURE_CONSENSUS', 2)))
  },
  /** When true, the second consensus pass uses FALLBACK_MODEL instead of PRIMARY_MODEL. */
  get SIGNATURE_CONSENSUS_MIXED_MODELS() {
    return readEnvBool('VITE_AI_SIGNATURE_CONSENSUS_MIXED', false)
  },
  /** Vision detail for signature crop follow-up (cheap verification). */
  SIGNATURE_CROP_DETAIL: 'low' as const,
  /** Fixed padding around signature boxes for crop verification (fraction of box size). */
  SIGNATURE_CROP_PADDING: 0.12,
  /** Image reads (scanned rate cons, BOL). Pin via VITE_AI_PRIMARY_MODEL. */
  get PRIMARY_MODEL() {
    return readEnvModel('VITE_AI_PRIMARY_MODEL', DEFAULT_PRIMARY_MODEL)
  },
  /** Rate cons that have a PDF text layer. Pin via VITE_AI_RATE_CON_TEXT_MODEL. */
  get RATE_CON_TEXT_MODEL() {
    return readEnvModel('VITE_AI_RATE_CON_TEXT_MODEL', DEFAULT_RATE_CON_TEXT_MODEL)
  },
  /** Re-run extraction when confidence is below threshold (if fallback enabled). */
  get FALLBACK_MODEL() {
    return readEnvModel('VITE_AI_FALLBACK_MODEL', DEFAULT_FALLBACK_MODEL)
  },
  /** Page classification — same tier as extraction (gpt-4.1 by default, not mini). */
  get CLASSIFY_MODEL() {
    return readEnvModel(
      'VITE_AI_CLASSIFY_MODEL',
      economyMode()
        ? readEnvModel('VITE_AI_FALLBACK_MODEL', DEFAULT_FALLBACK_MODEL)
        : readEnvModel('VITE_AI_PRIMARY_MODEL', DEFAULT_PRIMARY_MODEL)
    )
  },
  /** Explainability chat — text-only; defaults to gpt-4o. */
  get CHAT_MODEL() {
    return readEnvModel(
      'VITE_AI_CHAT_MODEL',
      readEnvModel('VITE_AI_FALLBACK_MODEL', DEFAULT_FALLBACK_MODEL)
    )
  },
  CONFIDENCE_THRESHOLD: 0.65,
  get ENABLE_MODEL_FALLBACK() {
    return readEnvBool('VITE_AI_ENABLE_FALLBACK', false)
  },
  /**
   * Longest side (px) after resize — sent to vision API.
   * Default 1024 with high detail, 640 with low. Override via VITE_AI_MAX_IMAGE_WIDTH.
   */
  get MAX_IMAGE_WIDTH() {
    return readEnvInt(
      'VITE_AI_MAX_IMAGE_WIDTH',
      economyMode() ? 576 : readVisionDetail() === 'high' ? 1024 : 640
    )
  },
  /**
   * Max PDF pages per file (0 = unlimited — every page is classified and reviewed).
   * Set VITE_AI_MAX_PDF_PAGES to cap very large scans.
   */
  get MAX_PDF_PAGES() {
    return readEnvInt('VITE_AI_MAX_PDF_PAGES', 0)
  },
  /** Pages per classify API call (1 = one call per page; 5–8 is a good balance). */
  get CLASSIFY_BATCH_SIZE() {
    return readEnvInt('VITE_AI_CLASSIFY_BATCH_SIZE', economyMode() ? 10 : 8)
  },
  /**
   * How many PDFs to review at the same time in one upload (1 = sequential).
   * 4–6 is a practical default; raise if your OpenAI tier allows higher RPM.
   */
  get PARALLEL_DOCUMENTS() {
    return readEnvInt('VITE_AI_PARALLEL_DOCUMENTS', economyMode() ? 3 : 5)
  },
  /**
   * Max estimated AI spend per PDF before stopping extraction (USD).
   * 0 = no cap. Default $0.10 — remaining checks are skipped and load is marked for review.
   */
  get MAX_REVIEW_COST_USD() {
    return readEnvFloat('VITE_AI_MAX_REVIEW_COST_USD', 0.1)
  },
  /**
   * OpenAI org tokens-per-minute cap for the primary review model (gpt-4.1 by default).
   * Used for pre-flight estimates — set to your limit from platform.openai.com/account/rate-limits.
   */
  get TPM_LIMIT() {
    return getUserTpmLimit() ?? readEnvInt('VITE_AI_TPM_LIMIT', 30_000)
  },
  /** Plan/throttle using this fraction of TPM_LIMIT (default 0.72 — leaves headroom for estimate error). */
  get TPM_THROTTLE_RATIO() {
    return readEnvFloat('VITE_AI_TPM_THROTTLE_RATIO', 0.72)
  },
  /** Multiplier on per-file burst estimates (default 1.15). */
  get TPM_ESTIMATE_BUFFER() {
    return readEnvFloat('VITE_AI_TPM_ESTIMATE_BUFFER', 1.15)
  },
  /** Warn when estimated peak TPM exceeds this fraction of TPM_LIMIT (default 0.85). */
  get TPM_WARN_RATIO() {
    return readEnvFloat('VITE_AI_TPM_WARN_RATIO', 0.85)
  },
  /** When estimate exceeds TPM_LIMIT, auto-lower parallel PDFs instead of failing (default true). */
  get AUTO_THROTTLE_PARALLEL() {
    return readEnvBool('VITE_AI_AUTO_THROTTLE_PARALLEL', true)
  },
  /** Delay between starting parallel PDF reviews (ms) — spreads classify spikes (default 5000). */
  get PARALLEL_STAGGER_MS() {
    return readEnvInt('VITE_AI_PARALLEL_STAGGER_MS', 5000)
  },
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  get PAGE_CLASSIFY_DETAIL() {
    return readVisionDetail()
  },
  get DEEP_REVIEW_DETAIL() {
    return readVisionDetail()
  },
  /** @deprecated Use MAX_PDF_PAGES */
  get MAX_BOL_PAGES() {
    return this.MAX_PDF_PAGES
  },
}

/** TPM budget used for wave planning / auto-throttle (below hard OpenAI limit). */
export function getEffectiveTpmBudget(): number {
  return Math.round(AI_REVIEW_CONFIG.TPM_LIMIT * AI_REVIEW_CONFIG.TPM_THROTTLE_RATIO)
}

/** How many PDF pages to send to the model (all pages when no cap is configured). */
export function resolvePdfPagesToReview(totalPages: number): number {
  const cap = AI_REVIEW_CONFIG.MAX_PDF_PAGES
  if (cap <= 0) return totalPages
  return Math.min(totalPages, cap)
}

export function getOpenAIApiKey(): string | undefined {
  return getRuntimeEnvString('VITE_OPENAI_API_KEY') || undefined
}

export function isAIReviewEnabled(): boolean {
  if (getOpenAIChatCompletionsHandler()) return true
  return isSupabaseConfigured()
}

/** Labels shown in the UI for the active model setup. */
export function getReviewModelSummary(): string {
  const classify = `${AI_REVIEW_CONFIG.CLASSIFY_MODEL} (batch ${AI_REVIEW_CONFIG.CLASSIFY_BATCH_SIZE}, ${AI_REVIEW_CONFIG.PAGE_CLASSIFY_DETAIL} detail)`
  const extract = `${AI_REVIEW_CONFIG.RATE_CON_TEXT_MODEL} text, ${AI_REVIEW_CONFIG.PRIMARY_MODEL} image (${AI_REVIEW_CONFIG.DEEP_REVIEW_DETAIL} detail)`
  const fallback = AI_REVIEW_CONFIG.ENABLE_MODEL_FALLBACK
    ? ` → ${AI_REVIEW_CONFIG.FALLBACK_MODEL} if <${Math.round(AI_REVIEW_CONFIG.CONFIDENCE_THRESHOLD * 100)}%`
    : ', no fallback'
  return `Classify: ${classify} · Extract: ${extract}${fallback}`
}

/** Short note on active token-saving settings for the workbench UI. */
export function getTokenOptimizationSummary(): string {
  const parts = [
    `Classify ${AI_REVIEW_CONFIG.CLASSIFY_BATCH_SIZE} pg/call on ${AI_REVIEW_CONFIG.CLASSIFY_MODEL}`,
    `images ≤${AI_REVIEW_CONFIG.MAX_IMAGE_WIDTH}px`,
    `extract ${AI_REVIEW_CONFIG.DEEP_REVIEW_DETAIL} detail`,
  ]
  if (!AI_REVIEW_CONFIG.ENABLE_MODEL_FALLBACK) parts.push('fallback off')
  if (AI_REVIEW_CONFIG.MAX_PDF_PAGES > 0) parts.push(`max ${AI_REVIEW_CONFIG.MAX_PDF_PAGES} pages/file`)
  if (AI_REVIEW_CONFIG.MAX_REVIEW_COST_USD > 0) {
    parts.push('credit cap per PDF')
  }
  if (economyMode()) parts.push('economy mode')
  parts.push(`TPM est. vs ${AI_REVIEW_CONFIG.TPM_LIMIT.toLocaleString()}`)
  return parts.join(' · ')
}
