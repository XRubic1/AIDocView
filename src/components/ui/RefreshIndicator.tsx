import Spinner from './Spinner'

interface RefreshIndicatorProps {
  visible: boolean
}

/** Subtle top-bar indicator during background data refresh (keeps prior data visible). */
export default function RefreshIndicator({ visible }: RefreshIndicatorProps) {
  if (!visible) return null

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 bg-slate-100/90 border-b border-slate-200"
      role="status"
      aria-live="polite"
    >
      <Spinner size="sm" className="text-[#0891b2]" />
      <span>Refreshing data…</span>
    </div>
  )
}
