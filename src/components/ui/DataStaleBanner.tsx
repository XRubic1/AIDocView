import { AlertTriangle, X } from 'lucide-react'

interface DataStaleBannerProps {
  message?: string
  onDismiss?: () => void
}

/** Dismissible banner when a background refetch fails. */
export default function DataStaleBanner({
  message = 'Data may be out of date. Try refreshing the page.',
  onDismiss,
}: DataStaleBannerProps) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 text-sm bg-amber-50 text-amber-900 border-b border-amber-200"
      role="alert"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
        <span className="truncate">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 p-1 rounded hover:bg-amber-100"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
