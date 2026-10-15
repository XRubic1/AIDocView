/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Primary vision model — use a dated snapshot for reproducibility (default: gpt-4.1-2025-04-14) */
  readonly VITE_AI_PRIMARY_MODEL?: string
  /** Fallback when confidence is low (default: gpt-4o-2024-08-06) */
  readonly VITE_AI_FALLBACK_MODEL?: string
  /** OpenAI seed for deterministic extraction/audit (default: 42001337) */
  readonly VITE_AI_OPENAI_SEED?: string
  /** BOL receiver-signature validator passes: 1 or 2 (default 2 = consensus) */
  readonly VITE_AI_SIGNATURE_CONSENSUS?: string
  /** true = second consensus pass uses fallback model instead of primary */
  readonly VITE_AI_SIGNATURE_CONSENSUS_MIXED?: string
  /** Optional max PDF pages per file; omit or 0 = review all pages */
  readonly VITE_AI_MAX_PDF_PAGES?: string
  /** Rate-con text extraction (default: gpt-4.1-mini-2025-04-14). Image reads stay on the primary model. */
  readonly VITE_AI_RATE_CON_TEXT_MODEL?: string
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
  /** Max DocSort / batch AI document scans started per minute (default 6) */
  readonly VITE_AI_DOCS_PER_MINUTE?: string
  /** DocSort concurrent file scans (default 1) */
  readonly VITE_DOCSORT_PARALLEL?: string
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
  /** true = show Assistant token/cost meter outside local DEV (testing only) */
  readonly VITE_ASSISTANT_SHOW_USAGE?: string
  /** Assistant chat model (default gpt-4o-mini) */
  readonly VITE_ASSISTANT_CHAT_MODEL?: string
  /** Credyx ops inbox for Assistant email drafts (default ops@credyx.net) */
  readonly VITE_CREDYX_OPS_EMAIL?: string
  readonly VITE_ADMIN_ALERT_EMAIL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Hosting-friendly aliases (Vercel) — same values as VITE_* */
  readonly SUPABASE_URL?: string
  readonly SUPABASE_PUBLISHABLE_KEY?: string
  readonly SUPABASE_ANON_KEY?: string
  /** true when building the public waitlist-only Vercel site */
  readonly VITE_MARKETING_ONLY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
