import type { TdHTMLAttributes, ReactNode } from 'react'

type ClientListTdVariant =
  | 'default'
  | 'primary'
  | 'amount'
  | 'meta'
  | 'status'
  | 'actions'
  | 'desktop'

type ClientListTdProps = TdHTMLAttributes<HTMLTableCellElement> & {
  /** Desktop column label. Used for default variant fallback layout. */
  label?: string
  variant?: ClientListTdVariant
  children: ReactNode
}

const VARIANT_CLASS: Record<ClientListTdVariant, string> = {
  default: '',
  primary: 'dashboard-table__cell--primary',
  amount: 'dashboard-table__cell--amount',
  meta: 'dashboard-table__cell--meta',
  status: 'dashboard-table__cell--status',
  actions: 'dashboard-table__cell--actions',
  desktop: 'client-list-td--desktop',
}

/** Table cell with compact mobile card roles (used with client-table-scroll--mobile-stack). */
export default function ClientListTd({
  label,
  variant = 'default',
  className,
  children,
  ...props
}: ClientListTdProps) {
  const dataLabel = variant === 'default' ? label : undefined

  return (
    <td
      data-label={dataLabel}
      className={[VARIANT_CLASS[variant], className].filter(Boolean).join(' ') || undefined}
      {...props}
    >
      {children}
    </td>
  )
}
