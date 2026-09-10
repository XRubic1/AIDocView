import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  AlertCircle,
  Upload,
  Lightbulb,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from 'lucide-react'
import { formatCurrency } from '../../../utils/format'
import { requestAssistantOpen } from '../../../utils/assistantFabPlacement'

export type PriorityRecommendation = {
  id: string
  title: string
  reason: string
  action: string
  navigateTo: string
  icon?: 'check' | 'alert' | 'upload' | 'idea'
  impactAmount?: number
  meta?: string[]
  tone?: 'info' | 'warn' | 'danger' | 'success'
  /** Secondary CTA when the group has more than one item. */
  viewAllLabel?: string
  viewAllTo?: string
  /** Suggested prompt for Ask AI about this priority. */
  askAiPrompt?: string
}

type PriorityActionCardProps = {
  recommendations: PriorityRecommendation[]
  loading?: boolean
  /**
   * Phone layout: horizontal snap carousel. The whole slide is the hit
   * target — no CTA / pager / Ask AI buttons.
   */
  swipeable?: boolean
}

const ICONS = {
  check: CheckCircle2,
  alert: AlertCircle,
  upload: Upload,
  idea: Lightbulb,
}

const TONE_LABEL: Record<NonNullable<PriorityRecommendation['tone']>, string> = {
  success: 'Quick win',
  warn: 'Needs attention',
  danger: 'Urgent',
  info: 'Next step',
}

const SWIPE_CLICK_SLOP_PX = 12

function reasonText(rec: PriorityRecommendation): string {
  return rec.meta && rec.meta.length > 0
    ? `${rec.reason} · ${rec.meta.join(' · ')}`
    : rec.reason
}

/**
 * Static “What to do next” card — shows one priority at a time with a pager.
 * On phones (`swipeable`), priorities sit in a side-to-side snap strip.
 */
export default function PriorityActionCard({
  recommendations,
  loading = false,
  swipeable = false,
}: PriorityActionCardProps) {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const pointerStartX = useRef(0)
  const didSwipe = useRef(false)

  if (loading) {
    return (
      <section className="cdv2-priority is-loading" aria-label="What to do next">
        <p className="cdv2-priority__loading">Prioritizing your A/R…</p>
      </section>
    )
  }

  if (recommendations.length === 0) {
    return (
      <section className="cdv2-priority cdv2-priority--empty" role="status">
        <CheckCircle2 size={18} strokeWidth={2.25} className="cdv2-priority__empty-icon" aria-hidden />
        <div className="cdv2-priority__empty-copy">
          <div>
            <p className="cdv2-priority__empty-title">You&apos;re all caught up</p>
            <p className="cdv2-priority__empty-body">Nothing urgent right now</p>
          </div>
          {!swipeable ? (
            <button
              type="button"
              className="cdv2-priority__ask"
              onClick={() =>
                requestAssistantOpen('Summarize my A/R — anything I should watch this week?')
              }
            >
              <MessageSquare size={14} strokeWidth={2.25} aria-hidden />
              Ask AI about my A/R
            </button>
          ) : null}
        </div>
      </section>
    )
  }

  const total = recommendations.length

  /** Sync the active dot to whichever slide is snapped into view. */
  const handleTrackScroll = () => {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    const next = Math.round(track.scrollLeft / track.clientWidth)
    setIndex(Math.max(0, Math.min(total - 1, next)))
  }

  /** Ignore tap-to-open when the pointer was used to swipe. */
  const handleSlidePointerDown = (clientX: number) => {
    pointerStartX.current = clientX
    didSwipe.current = false
  }

  const handleSlidePointerMove = (clientX: number) => {
    if (Math.abs(clientX - pointerStartX.current) > SWIPE_CLICK_SLOP_PX) {
      didSwipe.current = true
    }
  }

  const openRecommendation = (rec: PriorityRecommendation) => {
    if (didSwipe.current) return
    navigate(rec.navigateTo)
  }

  if (swipeable) {
    return (
      <section
        className="cdv2-priority cdv2-priority--swipe"
        aria-label="What to do next"
        aria-roledescription="carousel"
      >
        <div
          ref={trackRef}
          className="cdv2-priority__track"
          onScroll={handleTrackScroll}
        >
          {recommendations.map((rec, i) => {
            const tone = rec.tone || 'info'
            const Icon = ICONS[rec.icon || 'idea']
            return (
              <button
                key={rec.id}
                type="button"
                className={`cdv2-priority__slide tone-${tone}`}
                aria-label={`${TONE_LABEL[tone]}: ${rec.title}. ${rec.action}`}
                aria-current={i === index ? 'true' : undefined}
                onPointerDown={(e) => handleSlidePointerDown(e.clientX)}
                onPointerMove={(e) => handleSlidePointerMove(e.clientX)}
                onClick={() => openRecommendation(rec)}
              >
                <span className={`cdv2-priority__icon tone-${tone}`} aria-hidden>
                  <Icon size={16} strokeWidth={2.25} />
                </span>
                <div className="cdv2-priority__copy">
                  <div className="cdv2-priority__title-row">
                    <span className={`cdv2-priority__tone tone-${tone}`}>{TONE_LABEL[tone]}</span>
                    {total > 1 ? (
                      <span className="cdv2-priority__pager-label tabular-nums">
                        {i + 1}/{total}
                      </span>
                    ) : null}
                    <span className="cdv2-priority__title">{rec.title}</span>
                  </div>
                  <p className="cdv2-priority__reason">{reasonText(rec)}</p>
                </div>
                {typeof rec.impactAmount === 'number' && rec.impactAmount > 0 ? (
                  <span className="cdv2-priority__impact tabular-nums">
                    {formatCurrency(rec.impactAmount)}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        {total > 1 ? (
          <div className="cdv2-priority__dots" aria-hidden>
            {recommendations.map((rec, i) => (
              <span
                key={rec.id}
                className={`cdv2-priority__dot${i === index ? ' is-active' : ''}`}
              />
            ))}
          </div>
        ) : null}
      </section>
    )
  }

  const safeIndex = Math.min(index, recommendations.length - 1)
  const rec = recommendations[safeIndex]
  const Icon = ICONS[rec.icon || 'idea']
  const tone = rec.tone || 'info'
  const askPrompt =
    rec.askAiPrompt ||
    `Help me with this: ${rec.title}. ${rec.reason}`

  return (
    <section className={`cdv2-priority tone-${tone}`} aria-label="What to do next">
      <div className="cdv2-priority__main">
        <span className={`cdv2-priority__icon tone-${tone}`} aria-hidden>
          <Icon size={16} strokeWidth={2.25} />
        </span>

        <div className="cdv2-priority__copy">
          <div className="cdv2-priority__title-row">
            <span className={`cdv2-priority__tone tone-${tone}`}>{TONE_LABEL[tone]}</span>
            {total > 1 ? (
              <span className="cdv2-priority__pager-label tabular-nums">
                {safeIndex + 1}/{total}
              </span>
            ) : null}
            <h2 className="cdv2-priority__title">{rec.title}</h2>
          </div>

          <div className="cdv2-priority__sub">
            <p className="cdv2-priority__reason">{reasonText(rec)}</p>
            <div className="cdv2-priority__links">
              {rec.viewAllLabel && rec.viewAllTo ? (
                <button
                  type="button"
                  className="cdv2-priority__view-all"
                  onClick={() => navigate(rec.viewAllTo!)}
                >
                  {rec.viewAllLabel}
                  <ArrowRight size={12} strokeWidth={2.25} aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                className="cdv2-priority__ask"
                onClick={() => requestAssistantOpen(askPrompt)}
                title={askPrompt}
              >
                <MessageSquare size={13} strokeWidth={2.25} aria-hidden />
                Ask AI
              </button>
            </div>
          </div>
        </div>

        <div className="cdv2-priority__aside">
          {typeof rec.impactAmount === 'number' && rec.impactAmount > 0 ? (
            <span className="cdv2-priority__impact tabular-nums">
              {formatCurrency(rec.impactAmount)}
            </span>
          ) : null}
          <button
            type="button"
            className="dashboard-btn-primary cdv2-priority__cta"
            onClick={() => navigate(rec.navigateTo)}
          >
            {rec.action}
            <ArrowRight size={14} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>

      {total > 1 ? (
        <div className="cdv2-priority__nav">
          <button
            type="button"
            className="cdv2-priority__nav-btn"
            aria-label="Previous priority"
            disabled={safeIndex === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft size={14} strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            className="cdv2-priority__nav-btn"
            aria-label="Next priority"
            disabled={safeIndex >= total - 1}
            onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          >
            <ChevronRight size={14} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      ) : null}
    </section>
  )
}
