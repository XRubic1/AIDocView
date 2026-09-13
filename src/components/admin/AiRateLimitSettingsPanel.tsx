import { FormEvent, useMemo, useState } from 'react'
import { Gauge, RotateCcw } from 'lucide-react'
import { AI_REVIEW_CONFIG, getEffectiveTpmBudget } from '../../config/aiReview'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  clearAiRateLimitSettings,
  getEffectiveDocSortParallel,
  getEffectiveDocsPerMinute,
  getEffectiveTpmLimit,
  getEnvDocSortParallel,
  getEnvDocsPerMinute,
  getEnvTpmLimit,
  hasAiRateLimitOverrides,
  setAiRateLimitSettings,
} from '../../utils/aiReviewUserSettings'

function formatTpm(value: number): string {
  return value.toLocaleString()
}

interface AiRateLimitSettingsPanelProps {
  /** Engine (dark FactorFox) vs admin portal card styling. */
  variant?: 'engine' | 'admin'
}

/**
 * TPM + DocSort pacing controls — shared by Engine Settings and Admin Settings.
 */
export default function AiRateLimitSettingsPanel({
  variant = 'admin',
}: AiRateLimitSettingsPanelProps) {
  const c = useClientTheme()
  const isEngine = variant === 'engine'

  const [draftTpm, setDraftTpm] = useState(() => String(getEffectiveTpmLimit()))
  const [draftDocsPerMin, setDraftDocsPerMin] = useState(() =>
    String(getEffectiveDocsPerMinute())
  )
  const [draftParallel, setDraftParallel] = useState(() =>
    String(getEffectiveDocSortParallel())
  )
  const [savedTpm, setSavedTpm] = useState(() => getEffectiveTpmLimit())
  const [savedDocs, setSavedDocs] = useState(() => getEffectiveDocsPerMinute())
  const [savedParallel, setSavedParallel] = useState(() => getEffectiveDocSortParallel())
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasOverride = hasAiRateLimitOverrides()
  const planBudget = useMemo(
    () => Math.round(savedTpm * AI_REVIEW_CONFIG.TPM_THROTTLE_RATIO),
    [savedTpm]
  )
  const intervalSec = useMemo(
    () => Math.ceil(60 / Math.max(1, savedDocs)),
    [savedDocs]
  )

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const tpm = Number.parseInt(draftTpm.replace(/,/g, ''), 10)
    const docsPerMinute = Number.parseInt(draftDocsPerMin.replace(/,/g, ''), 10)
    const docSortParallel = Number.parseInt(draftParallel.replace(/,/g, ''), 10)

    if (!Number.isFinite(tpm) || tpm < 1_000) {
      setError('TPM limit must be at least 1,000.')
      return
    }
    if (tpm > 10_000_000) {
      setError('TPM limit cannot exceed 10,000,000.')
      return
    }
    if (!Number.isFinite(docsPerMinute) || docsPerMinute < 1 || docsPerMinute > 120) {
      setError('Docs per minute must be between 1 and 120.')
      return
    }
    if (!Number.isFinite(docSortParallel) || docSortParallel < 1 || docSortParallel > 8) {
      setError('Parallel scans must be between 1 and 8.')
      return
    }

    try {
      setAiRateLimitSettings({ tpmLimit: tpm, docsPerMinute, docSortParallel })
      setSavedTpm(tpm)
      setSavedDocs(docsPerMinute)
      setSavedParallel(docSortParallel)
      setDraftTpm(String(tpm))
      setDraftDocsPerMin(String(docsPerMinute))
      setDraftParallel(String(docSortParallel))
      setMessage(
        `Saved. DocSort will start at most ${docsPerMinute} doc${
          docsPerMinute === 1 ? '' : 's'
        }/min (${docSortParallel} in parallel).`
      )
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save settings.')
    }
  }

  const handleReset = () => {
    clearAiRateLimitSettings()
    const tpm = getEnvTpmLimit()
    const docs = getEnvDocsPerMinute()
    const parallel = getEnvDocSortParallel()
    setSavedTpm(tpm)
    setSavedDocs(docs)
    setSavedParallel(parallel)
    setDraftTpm(String(tpm))
    setDraftDocsPerMin(String(docs))
    setDraftParallel(String(parallel))
    setError(null)
    setMessage(
      `Reset to defaults (${formatTpm(tpm)} TPM · ${docs}/min · parallel ${parallel}).`
    )
  }

  const inputStyle = isEngine
    ? undefined
    : {
        borderColor: c.border,
        color: c.primary,
        backgroundColor: c.card,
      }

  const sectionClass = isEngine
    ? 'border p-5 sm:p-6 space-y-5'
    : 'dashboard-card p-5 space-y-5'

  return (
    <section
      className={sectionClass}
      style={
        isEngine
          ? {
              borderColor: 'var(--ff-border-light, #334155)',
              backgroundColor: 'var(--ff-bg2, #0f172a)',
            }
          : undefined
      }
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 p-2 rounded border"
          style={
            isEngine
              ? undefined
              : { borderColor: c.border, backgroundColor: c.background, color: c.secondary }
          }
        >
          <Gauge className="w-5 h-5" style={isEngine ? undefined : { color: c.secondary }} />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className={`text-sm font-bold ${isEngine ? 'uppercase tracking-wider' : ''}`}
            style={isEngine ? undefined : { color: c.primary }}
          >
            AI rate limits
          </h2>
          <p
            className="text-xs mt-1 leading-relaxed"
            style={isEngine ? undefined : { color: c.secondary }}
          >
            Match your OpenAI org TPM and cap how fast DocSort / batch AI starts scans so you
            stay under the limit. Your tier is currently ~30,000 TPM for gpt-4.1 — each page
            image uses thousands of tokens.{' '}
            <a
              href="https://platform.openai.com/account/rate-limits"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
              style={isEngine ? undefined : { color: c.secondary }}
            >
              OpenAI rate limits
            </a>
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: c.secondary }}>
              TPM limit
            </span>
            <input
              type="number"
              min={1000}
              max={10_000_000}
              step={1000}
              value={draftTpm}
              onChange={(e) => setDraftTpm(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded outline-none"
              style={inputStyle}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: c.secondary }}>
              Docs / minute
            </span>
            <input
              type="number"
              min={1}
              max={120}
              step={1}
              value={draftDocsPerMin}
              onChange={(e) => setDraftDocsPerMin(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded outline-none"
              style={inputStyle}
              title="Max DocSort scans started per minute"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: c.secondary }}>
              Parallel scans
            </span>
            <input
              type="number"
              min={1}
              max={8}
              step={1}
              value={draftParallel}
              onChange={(e) => setDraftParallel(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded outline-none"
              style={inputStyle}
              title="How many files scan at once (1 is safest under low TPM)"
            />
          </label>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 border rounded" style={{ borderColor: c.border }}>
            <dt style={{ color: c.secondary }}>Planning budget</dt>
            <dd className="mt-1 font-semibold" style={{ color: c.primary }}>
              {formatTpm(planBudget)} TPM
            </dd>
          </div>
          <div className="p-3 border rounded" style={{ borderColor: c.border }}>
            <dt style={{ color: c.secondary }}>Start spacing</dt>
            <dd className="mt-1 font-semibold" style={{ color: c.primary }}>
              ~{intervalSec}s between docs
            </dd>
          </div>
          <div className="p-3 border rounded" style={{ borderColor: c.border }}>
            <dt style={{ color: c.secondary }}>Env defaults</dt>
            <dd className="mt-1 font-semibold" style={{ color: c.primary }}>
              {formatTpm(getEnvTpmLimit())} · {getEnvDocsPerMinute()}/min · p
              {getEnvDocSortParallel()}
            </dd>
            <dd className="mt-0.5" style={{ color: c.secondary }}>
              {hasOverride ? 'Local overrides active' : 'Using defaults'}
            </dd>
          </div>
        </dl>

        {error ? (
          <p className="text-xs" style={{ color: '#b91c1c' }}>
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-xs" style={{ color: '#15803d' }}>
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" className="dashboard-btn-primary text-xs">
            Save rate limits
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="dashboard-btn-secondary text-xs inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to defaults
          </button>
        </div>
      </form>

      <p className="text-[11px] leading-relaxed" style={{ color: c.secondary }}>
        Active: {formatTpm(getEffectiveTpmLimit())} TPM · budget{' '}
        {formatTpm(getEffectiveTpmBudget())} · {savedDocs} docs/min · parallel {savedParallel}.
        Tip: at 30k TPM use ~4–6 docs/min and parallel 1.
      </p>
    </section>
  )
}
