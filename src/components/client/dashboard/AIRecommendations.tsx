import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Upload, Lightbulb, ArrowRight } from 'lucide-react'
import { formatCurrency } from '../../../utils/format'

export type Recommendation = {
  id: string
  priority: number
  title: string
  reason: string
  action: string
  navigateTo: string
  icon?: 'check' | 'alert' | 'upload' | 'idea'
  /** Dollar impact when available. */
  impactAmount?: number
  /** Short context chips (broker, age, count…). */
  meta?: string[]
  /** Visual urgency for the card accent. */
  tone?: 'info' | 'warn' | 'danger' | 'success'
}

type AIRecommendationsProps = {
  recommendations: Recommendation[]
  loading?: boolean
}

const REC_ICONS = {
  check: CheckCircle2,
  alert: AlertCircle,
  upload: Upload,
  idea: Lightbulb,
}

const TONE_LABEL: Record<NonNullable<Recommendation['tone']>, string> = {
  success: 'Quick win',
  warn: 'Needs attention',
  danger: 'Urgent',
  info: 'Next step',
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * News-ticker "What to Do Next" strip for the welcome header zone.
 * Scrolls through all recommendations; pauses on hover / focus.
 */
export default function AIRecommendations({
  recommendations,
  loading = false,
}: AIRecommendationsProps) {
  const navigate = useNavigate()
  const reducedMotion = usePrefersReducedMotion()

  if (loading) {
    return (
      <div className="cd-next-ticker is-loading" aria-label="Loading recommendations">
        <span className="cd-next-ticker__label">What to Do Next</span>
        <span className="cd-next-ticker__loading">Prioritizing your A/R…</span>
      </div>
    )
  }

  if (recommendations.length === 0) {
    return (
      <div className="cd-next-ticker cd-next-ticker--empty" role="status">
        <span className="cd-next-ticker__label">What to Do Next</span>
        <span className="cd-next-ticker__empty">
          <CheckCircle2 size={14} strokeWidth={2.25} aria-hidden />
          You&apos;re all caught up — nothing urgent right now
        </span>
      </div>
    )
  }

  // Duplicate the list so the marquee loops seamlessly.
  const loopItems = reducedMotion
    ? recommendations
    : [...recommendations, ...recommendations]

  const durationSec = Math.max(18, recommendations.length * 9)

  return (
    <div
      className={`cd-next-ticker${reducedMotion ? ' is-static' : ''}`}
      role="region"
      aria-label="What to do next"
    >
      <span className="cd-next-ticker__label">
        What to Do Next
        <span className="cd-next-ticker__count tabular-nums">
          {recommendations.length}
        </span>
      </span>

      <div className="cd-next-ticker__viewport">
        <ul
          className="cd-next-ticker__track"
          style={
            reducedMotion
              ? undefined
              : ({ ['--cd-ticker-duration' as string]: `${durationSec}s` } as CSSProperties)
          }
        >
          {loopItems.map((rec, idx) => {
            const Icon = REC_ICONS[rec.icon || 'idea']
            const tone = rec.tone || 'info'
            const isClone = idx >= recommendations.length
            return (
              <li
                key={`${rec.id}-${idx}`}
                className="cd-next-ticker__item"
                aria-hidden={isClone ? true : undefined}
              >
                <button
                  type="button"
                  className={`cd-next-ticker__card tone-${tone}`}
                  onClick={() => navigate(rec.navigateTo)}
                  tabIndex={isClone ? -1 : 0}
                >
                  <span className={`cd-next-ticker__icon tone-${tone}`} aria-hidden>
                    <Icon size={14} strokeWidth={2.25} />
                  </span>
                  <span className={`cd-next-ticker__tone tone-${tone}`}>
                    {TONE_LABEL[tone]}
                  </span>
                  <span className="cd-next-ticker__title">{rec.title}</span>
                  <span className="cd-next-ticker__sep" aria-hidden>
                    ·
                  </span>
                  <span className="cd-next-ticker__reason">{rec.reason}</span>
                  {rec.meta && rec.meta.length > 0 ? (
                    <>
                      <span className="cd-next-ticker__sep" aria-hidden>
                        ·
                      </span>
                      <span className="cd-next-ticker__meta">{rec.meta.join(' · ')}</span>
                    </>
                  ) : null}
                  {typeof rec.impactAmount === 'number' && rec.impactAmount > 0 ? (
                    <span className="cd-next-ticker__impact tabular-nums">
                      {formatCurrency(rec.impactAmount)}
                    </span>
                  ) : null}
                  <span className="cd-next-ticker__action">
                    {rec.action}
                    <ArrowRight size={13} strokeWidth={2.25} aria-hidden />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
