import { Loader } from 'lucide-react'
import { useReviewTimeEstimate } from '../../utils/estimateReviewTime'

interface AnalysisProgressMessageProps {
  files: File[]
  message?: string
  compact?: boolean
}

/** Spinner + status text with estimated analysis time. */
export default function AnalysisProgressMessage({
  files,
  message = 'Analyzing documents...',
  compact = false,
}: AnalysisProgressMessageProps) {
  const estimate = useReviewTimeEstimate(files)

  if (compact) {
    return (
      <span className="inline-flex flex-col gap-0.5 text-xs" style={{ color: '#64748b' }}>
        <span className="inline-flex items-center gap-1">
          <Loader className="w-3.5 h-3.5 animate-spin" />
          Analyzing...
        </span>
        {estimate && <span>Est. {estimate}</span>}
      </span>
    )
  }

  return (
    <div className="rounded border px-3 py-2 space-y-1" style={{ borderColor: '#e2e8f0', backgroundColor: '#FFFFFF' }}>
      <div className="flex items-center gap-2 text-sm" style={{ color: '#113543' }}>
        <Loader className="w-4 h-4 animate-spin flex-shrink-0" />
        <span>{message}</span>
      </div>
      {estimate && (
        <p className="text-xs pl-6" style={{ color: '#64748b' }}>
          Estimated time: {estimate}
        </p>
      )}
    </div>
  )
}
