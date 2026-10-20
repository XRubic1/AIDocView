import { Skeleton } from './Skeleton'

/** Generic list/table placeholder: rows of two-line cells with a trailing amount. */
export default function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 border-b"
          style={{ borderColor: 'rgba(148, 163, 184, 0.2)' }}
          aria-hidden
        >
          <div className="w-24 shrink-0">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mt-1.5 h-3 w-20" />
          </div>
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="mt-1.5 h-3 w-32" />
          </div>
          <Skeleton className="hidden h-4 w-20 sm:block" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}
