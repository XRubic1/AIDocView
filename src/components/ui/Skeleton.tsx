interface SkeletonProps {
  className?: string
}

/** Pulse placeholder block for loading layouts. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/80 dark:bg-zinc-800/80 ${className}`.trim()}
      aria-hidden
    />
  )
}

interface SkeletonRowsProps {
  rows?: number
  /** Tailwind height class per row, e.g. h-10 */
  rowClassName?: string
  className?: string
}

/** Stacked skeleton rows for tables and lists. */
export function SkeletonRows({
  rows = 5,
  rowClassName = 'h-10',
  className = '',
}: SkeletonRowsProps) {
  return (
    <div className={`space-y-2 ${className}`.trim()} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={`w-full ${rowClassName}`} />
      ))}
    </div>
  )
}
