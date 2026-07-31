import { Upload, DollarSign, BarChart3, MessageSquare } from 'lucide-react'

type WelcomeHeaderProps = {
  carrierName: string
  loading?: boolean
  onUpload?: () => void
  onPostPayment?: () => void
  onViewReport?: () => void
  onAskAI?: () => void
  canUpload?: boolean
  canPostPayment?: boolean
}

/**
 * Welcome header for carrier dashboard with quick action buttons.
 * Sits at the top of the dashboard for orientation and fast access to key actions.
 */
export default function WelcomeHeader({
  carrierName,
  loading = false,
  onUpload,
  onPostPayment,
  onViewReport,
  onAskAI,
  canUpload = true,
  canPostPayment = true,
}: WelcomeHeaderProps) {
  if (loading) {
    return (
      <header className="cd-welcome-header is-loading">
        <div className="cd-welcome-header__main">
          <h1 className="cd-welcome-header__title">—</h1>
        </div>
      </header>
    )
  }

  return (
    <header className="cd-welcome-header">
      <div className="cd-welcome-header__main">
        <div className="cd-welcome-header__text">
          <h1 className="cd-welcome-header__title">
            Welcome back, {carrierName}
          </h1>
          <p className="cd-welcome-header__subtitle">
            Here's what's happening with your A/R
          </p>
        </div>
      </div>

      <div className="cd-welcome-header__actions">
        {canUpload && onUpload ? (
          <button
            type="button"
            onClick={onUpload}
            className="cd-welcome-action cd-welcome-action--secondary"
            title="Upload documents"
          >
            <Upload className="cd-welcome-action__icon" size={16} strokeWidth={2} />
            <span>Upload</span>
          </button>
        ) : null}

        {canPostPayment && onPostPayment ? (
          <button
            type="button"
            onClick={onPostPayment}
            className="cd-welcome-action cd-welcome-action--secondary"
            title="Post a payment"
          >
            <DollarSign className="cd-welcome-action__icon" size={16} strokeWidth={2} />
            <span>Post Payment</span>
          </button>
        ) : null}

        {onViewReport ? (
          <button
            type="button"
            onClick={onViewReport}
            className="cd-welcome-action cd-welcome-action--secondary"
            title="View reports"
          >
            <BarChart3 className="cd-welcome-action__icon" size={16} strokeWidth={2} />
            <span>Reports</span>
          </button>
        ) : null}

        {onAskAI ? (
          <button
            type="button"
            onClick={onAskAI}
            className="cd-welcome-action cd-welcome-action--primary"
            title="Ask AI assistant"
          >
            <MessageSquare className="cd-welcome-action__icon" size={16} strokeWidth={2} />
            <span>Ask AI</span>
          </button>
        ) : null}
      </div>
    </header>
  )
}
