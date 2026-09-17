/**
 * Settings → AI: live model status probe (proxy + OpenAI).
 */
import { useState } from 'react'
import { Activity, CheckCircle2, AlertTriangle, XCircle, PauseCircle } from 'lucide-react'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  checkAiModelStatus,
  type AiStatusCheckResult,
  type AiStatusLevel,
} from '../../services/aiStatusService'
import { AI_REVIEW_CONFIG, getReviewModelSummary } from '../../config/aiReview'

function levelStyles(level: AiStatusLevel): { color: string; bg: string; border: string } {
  switch (level) {
    case 'ok':
      return { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' }
    case 'degraded':
      return { color: '#a16207', bg: '#fefce8', border: '#fde68a' }
    case 'disabled':
      return { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' }
    case 'down':
    default:
      return { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' }
  }
}

function LevelIcon({ level }: { level: AiStatusLevel }) {
  const className = 'w-5 h-5 flex-shrink-0'
  switch (level) {
    case 'ok':
      return <CheckCircle2 className={className} />
    case 'degraded':
      return <AlertTriangle className={className} />
    case 'disabled':
      return <PauseCircle className={className} />
    case 'down':
    default:
      return <XCircle className={className} />
  }
}

export default function AiStatusCheckPanel() {
  const c = useClientTheme()
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<AiStatusCheckResult | null>(null)

  const runCheck = async () => {
    setChecking(true)
    try {
      const next = await checkAiModelStatus()
      setResult(next)
    } catch (err) {
      setResult({
        level: 'down',
        ok: false,
        headline: 'Status check failed',
        detail: err instanceof Error ? err.message : String(err),
        latencyMs: null,
        model: AI_REVIEW_CONFIG.PRIMARY_MODEL,
        checkedAt: new Date().toISOString(),
        policyEnabled: true,
        proxyConfigured: false,
      })
    } finally {
      setChecking(false)
    }
  }

  const styles = result ? levelStyles(result.level) : null

  return (
    <section className="dashboard-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 p-2 rounded border"
          style={{ borderColor: c.border, backgroundColor: c.card, color: c.secondary }}
        >
          <Activity className="w-5 h-5" style={{ color: c.secondary }} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold" style={{ color: c.primary }}>
            AI status check
          </h2>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: c.secondary }}>
            Ping the live OpenAI model through openai-proxy when DocSort or review looks stuck.
            This does not charge a full packet review — only a tiny health request.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={checking}
          className="dashboard-btn-primary text-xs inline-flex items-center gap-1.5 shrink-0"
        >
          {checking ? 'Checking…' : 'Check AI status'}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: c.secondary }}>
        Configured models: {getReviewModelSummary()}
      </p>

      {result && styles ? (
        <div
          className="rounded border px-3 py-3 space-y-2"
          style={{ borderColor: styles.border, backgroundColor: styles.bg, color: styles.color }}
        >
          <div className="flex items-start gap-2">
            <LevelIcon level={result.level} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{result.headline}</p>
              <p className="text-xs mt-1 opacity-90 whitespace-pre-wrap break-words">
                {result.detail}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
            <div>
              <dt className="opacity-70">Model</dt>
              <dd className="font-medium truncate" title={result.model}>
                {result.model}
              </dd>
            </div>
            <div>
              <dt className="opacity-70">Latency</dt>
              <dd className="font-medium tabular-nums">
                {result.latencyMs != null ? `${result.latencyMs} ms` : '—'}
              </dd>
            </div>
            <div>
              <dt className="opacity-70">Master switch</dt>
              <dd className="font-medium">{result.policyEnabled ? 'On' : 'Off'}</dd>
            </div>
            <div>
              <dt className="opacity-70">Checked</dt>
              <dd className="font-medium tabular-nums">
                {new Date(result.checkedAt).toLocaleTimeString()}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="text-xs" style={{ color: c.secondary }}>
          No check run yet this session.
        </p>
      )}
    </section>
  )
}
