/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY?: string
  /** Primary vision model for document review (default: gpt-4.1) */
  readonly VITE_AI_PRIMARY_MODEL?: string
  /** Fallback when confidence is low (default: gpt-4o) */
  readonly VITE_AI_FALLBACK_MODEL?: string
  /** Optional max PDF pages per file; omit or 0 = review all pages */
  readonly VITE_AI_MAX_PDF_PAGES?: string
  /** Page classification model (default: same as VITE_AI_PRIMARY_MODEL, gpt-4.1) */
  readonly VITE_AI_CLASSIFY_MODEL?: string
  /** Pages per classify API call (default 5) */
  readonly VITE_AI_CLASSIFY_BATCH_SIZE?: string
  /** Max longest side in px before vision API (default 1024 with high detail) */
  readonly VITE_AI_MAX_IMAGE_WIDTH?: string
  /** low | high — extraction/BOL vision detail */
  readonly VITE_AI_DEEP_REVIEW_DETAIL?: string
  /** true = enable second model pass on low confidence */
  readonly VITE_AI_ENABLE_FALLBACK?: string
  /** true = economy presets (gpt-4o classify, batch 8, low extract detail, no fallback) */
  readonly VITE_AI_REVIEW_ECONOMY?: string
  /** PDFs reviewed in parallel per upload (default 5; use 1 for sequential) */
  readonly VITE_AI_PARALLEL_DOCUMENTS?: string
  /** Max estimated AI cost per PDF in USD (default 0.10; 0 = unlimited) */
  readonly VITE_AI_MAX_REVIEW_COST_USD?: string
  /** OpenAI tokens-per-minute limit for pre-flight checks (default 30000) */
  readonly VITE_AI_TPM_LIMIT?: string
  /** Warn when estimated peak exceeds this fraction of TPM (default 0.85) */
  readonly VITE_AI_TPM_WARN_RATIO?: string
  /** Auto-reduce parallel PDFs when estimate exceeds TPM (default true) */
  readonly VITE_AI_AUTO_THROTTLE_PARALLEL?: string
  /** Fraction of TPM_LIMIT used for batch planning (default 0.72) */
  readonly VITE_AI_TPM_THROTTLE_RATIO?: string
  /** Safety multiplier on burst estimates (default 1.15) */
  readonly VITE_AI_TPM_ESTIMATE_BUFFER?: string
  /** Ms delay between starting parallel PDF reviews (default 5000) */
  readonly VITE_AI_PARALLEL_STAGGER_MS?: string
  /** Model for review explainability chat (default gpt-4o) */
  readonly VITE_AI_CHAT_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
