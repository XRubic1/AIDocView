import { FormEvent, useMemo, useState } from 'react'
import { Gauge, RotateCcw, Settings } from 'lucide-react'
import EngineLayout from '../components/engine/EngineLayout'
import { ff } from '../components/loadReview/factorfox/factorFoxTheme'
import { AI_REVIEW_CONFIG, getEffectiveTpmBudget } from '../config/aiReview'
import {
  clearUserTpmLimit,
  getEffectiveTpmLimit,
  getEnvTpmLimit,
  getUserTpmLimit,
  hasUserTpmLimitOverride,
  setUserTpmLimit,
} from '../utils/aiReviewUserSettings'

function formatTpm(value: number): string {
  return value.toLocaleString()
}

/** AIDocView engine settings — TPM limit and related review planning values. */
export default function EngineSettingsPage() {
  const envDefault = getEnvTpmLimit()
  const [savedLimit, setSavedLimit] = useState(() => getEffectiveTpmLimit())
  const [draftLimit, setDraftLimit] = useState(() => String(getEffectiveTpmLimit()))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasOverride = hasUserTpmLimitOverride()
  const planBudget = useMemo(
    () => Math.round(savedLimit * AI_REVIEW_CONFIG.TPM_THROTTLE_RATIO),
    [savedLimit]
  )

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const parsed = Number.parseInt(draftLimit.replace(/,/g, ''), 10)
    if (!Number.isFinite(parsed) || parsed < 1_000) {
      setError('Enter a TPM limit of at least 1,000 tokens per minute.')
      return
    }
    if (parsed > 10_000_000) {
      setError('TPM limit cannot exceed 10,000,000.')
      return
    }

    try {
      setUserTpmLimit(parsed)
      setSavedLimit(parsed)
      setDraftLimit(String(parsed))
      setMessage('Saved. Pre-run TPM estimates and parallel batching will use this limit.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save settings.')
    }
  }

  const handleReset = () => {
    clearUserTpmLimit()
    const next = getEnvTpmLimit()
    setSavedLimit(next)
    setDraftLimit(String(next))
    setError(null)
    setMessage(`Reset to environment default (${formatTpm(next)} TPM).`)
  }

  return (
    <EngineLayout
      headerTitle={
        <div>
          <h1
            className="text-xl font-bold uppercase tracking-wide flex items-center gap-2"
            style={{ color: ff.text, fontFamily: ff.fontDisplay }}
          >
            <Settings className="w-5 h-5" style={{ color: ff.accent }} />
            Settings
          </h1>
          <p className="text-xs mt-1 max-w-xl" style={{ color: ff.textMuted, fontFamily: ff.fontMono }}>
            Configure review engine limits. Changes apply on the next TPM estimate or Run review.
          </p>
        </div>
      }
    >
      <div className="p-4 sm:p-6 max-w-2xl mx-auto w-full space-y-6">
        <section
          className="border p-5 sm:p-6 space-y-5 transition-shadow hover:shadow-lg"
          style={{
            borderColor: ff.borderLight,
            backgroundColor: ff.bg2,
            boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex-shrink-0 p-2 border"
              style={{ borderColor: ff.accentBorder, backgroundColor: ff.accentDim }}
            >
              <Gauge className="w-5 h-5" style={{ color: ff.accent }} />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                className="text-sm font-bold uppercase tracking-wider"
                style={{ color: ff.text, fontFamily: ff.fontDisplay }}
              >
                OpenAI TPM limit
              </h2>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: ff.textMuted }}>
                Tokens per minute for your OpenAI org tier. Used to plan parallel PDF reviews and
                warn before rate limits. Find your limit at{' '}
                <a
                  href="https://platform.openai.com/account/rate-limits"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 transition-colors hover:opacity-80"
                  style={{ color: ff.accent }}
                >
                  platform.openai.com/account/rate-limits
                </a>
                .
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-2">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: ff.textMuted, fontFamily: ff.fontMono }}
              >
                TPM limit (tokens / minute)
              </span>
              <input
                type="number"
                min={1000}
                max={10_000_000}
                step={1000}
                value={draftLimit}
                onChange={(event) => setDraftLimit(event.target.value)}
                className="w-full px-3 py-2.5 text-sm border outline-none transition-colors focus:ring-1"
                style={{
                  fontFamily: ff.fontMono,
                  color: ff.text,
                  backgroundColor: ff.bg3,
                  borderColor: ff.borderLight,
                }}
              />
            </label>

            <dl
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
              style={{ fontFamily: ff.fontMono }}
            >
              <div className="p-3 border" style={{ borderColor: ff.border, backgroundColor: ff.bg3 }}>
                <dt style={{ color: ff.textMuted }}>Planning budget</dt>
                <dd className="mt-1 font-semibold" style={{ color: ff.accent }}>
                  {formatTpm(planBudget)} TPM
                </dd>
                <dd className="mt-0.5" style={{ color: ff.textSubtle }}>
                  {Math.round(AI_REVIEW_CONFIG.TPM_THROTTLE_RATIO * 100)}% of limit
                </dd>
              </div>
              <div className="p-3 border" style={{ borderColor: ff.border, backgroundColor: ff.bg3 }}>
                <dt style={{ color: ff.textMuted }}>Environment default</dt>
                <dd className="mt-1 font-semibold" style={{ color: ff.text }}>
                  {formatTpm(envDefault)} TPM
                </dd>
                <dd className="mt-0.5" style={{ color: ff.textSubtle }}>
                  {hasOverride ? 'Overridden locally' : 'Currently active'}
                </dd>
              </div>
            </dl>

            {error ? (
              <p className="text-xs" style={{ color: ff.red }}>
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="text-xs" style={{ color: ff.green }}>
                {message}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-90"
                style={{
                  fontFamily: ff.fontMono,
                  backgroundColor: ff.accent,
                  color: ff.onPrimary,
                }}
              >
                Save TPM limit
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider border transition-colors hover:opacity-90"
                style={{
                  fontFamily: ff.fontMono,
                  color: ff.textMuted,
                  borderColor: ff.borderLight,
                  backgroundColor: 'transparent',
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to default
              </button>
            </div>
          </form>
        </section>

        <p className="text-[11px] leading-relaxed" style={{ color: ff.textSubtle, fontFamily: ff.fontMono }}>
          Active limit: {formatTpm(getEffectiveTpmLimit())} TPM · effective budget{' '}
          {formatTpm(getEffectiveTpmBudget())} TPM
          {getUserTpmLimit() != null ? ` (saved ${formatTpm(getUserTpmLimit()!)} TPM)` : ''}
        </p>
      </div>
    </EngineLayout>
  )
}
