import { ChevronDown, ChevronUp } from 'lucide-react'
import type { SortDir } from '../../utils/clientListPage'

type ClientSortableHeaderProps<T extends string> = {
  field: T
  label: string
  sortField: T
  sortDir: SortDir
  onSort: (field: T) => void
  className?: string
  align?: 'left' | 'right' | 'center'
}

/** Clickable table column header with asc/desc sort indicator. */
export default function ClientSortableHeader<T extends string>({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  className,
  align = 'left',
}: ClientSortableHeaderProps<T>) {
  const active = sortField === field
  const alignClass =
    align === 'right' ? 'ml-auto' : align === 'center' ? 'mx-auto' : undefined

  return (
    <th className={className}>
      <button
        type="button"
        className={`dashboard-table__sort-btn ${alignClass ?? ''}`}
        onClick={() => onSort(field)}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label}
        {active &&
          (sortDir === 'asc' ? (
            <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden />
          ))}
      </button>
    </th>
  )
}
