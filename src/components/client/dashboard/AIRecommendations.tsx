import { useNavigate } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Upload, Lightbulb } from 'lucide-react'

type Recommendation = {
  id: string
  priority: number
  title: string
  reason: string
  action: string
  navigateTo: string
  icon?: 'check' | 'alert' | 'upload' | 'idea'
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

/**
 * AI-powered "What to Do Next" recommendations widget.
 * Smart prioritization of actions based on urgency, impact, and ease.
 */
export default function AIRecommendations({
  recommendations,
  loading = false,
}: AIRecommendationsProps) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="cd-ai-recs is-loading" aria-label="Loading recommendations">
        <header className="cd-ai-recs__head">
          <h3 className="cd-ai-recs__title">💡 What to Do Next</h3>
        </header>
        <div className="cd-ai-recs__body">
          <p className="cd-ai-recs__loading">Analyzing your A/R...</p>
        </div>
      </div>
    )
  }

  if (recommendations.length === 0) {
    return (
      <div className="cd-ai-recs cd-ai-recs--empty">
        <header className="cd-ai-recs__head">
          <h3 className="cd-ai-recs__title">💡 What to Do Next</h3>
        </header>
        <div className="cd-ai-recs__body">
          <p className="cd-ai-recs__empty-text">
            You're all caught up! No urgent actions right now.
          </p>
        </div>
      </div>
    )
  }

  // Show top 3 recommendations
  const topRecs = recommendations.slice(0, 3)

  return (
    <div className="cd-ai-recs">
      <header className="cd-ai-recs__head">
        <h3 className="cd-ai-recs__title">💡 What to Do Next</h3>
        <span className="cd-ai-recs__subtitle">AI-powered recommendations</span>
      </header>

      <ol className="cd-ai-recs__list">
        {topRecs.map((rec, idx) => {
          const Icon = REC_ICONS[rec.icon || 'idea']
          return (
            <li key={rec.id} className="cd-ai-recs__item">
              <button
                type="button"
                className="cd-ai-recs__card"
                onClick={() => navigate(rec.navigateTo)}
              >
                <div className="cd-ai-recs__card-head">
                  <span className="cd-ai-recs__num">{idx + 1}</span>
                  <span className="cd-ai-recs__icon" aria-hidden>
                    <Icon size={16} strokeWidth={2} />
                  </span>
                </div>
                <div className="cd-ai-recs__card-body">
                  <p className="cd-ai-recs__card-title">{rec.title}</p>
                  <p className="cd-ai-recs__card-reason">{rec.reason}</p>
                </div>
                <div className="cd-ai-recs__card-action">
                  <span className="cd-ai-recs__action-label">{rec.action}</span>
                  <span className="cd-ai-recs__action-arrow" aria-hidden>
                    →
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
