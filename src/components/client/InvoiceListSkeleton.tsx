import { Skeleton } from '../ui/Skeleton'

const HEADERS: Array<{ label: string; className: string; align?: 'right' }> = [
  { label: 'Invoice', className: 'inv-col-invoice' },
  { label: 'Broker', className: 'inv-col-broker' },
  { label: 'Date', className: 'inv-col-date' },
  { label: 'Amount', className: 'inv-col-amount', align: 'right' },
  { label: 'Status', className: 'inv-col-status' },
]

/** Placeholder rows that match the invoices table while data loads. */
export function InvoiceTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="inv-table-scroll flex-1 min-h-0 overflow-y-auto" aria-busy="true">
      <table className="inv-table">
        <thead>
          <tr>
            {HEADERS.map((h) => (
              <th key={h.label} className={h.className}>
                <span
                  className="dashboard-table__sort-btn"
                  style={h.align ? { marginLeft: 'auto' } : undefined}
                >
                  {h.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i} className="inv-row" aria-hidden>
              <td className="inv-col-invoice">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="mt-1.5 h-3 w-20" />
              </td>
              <td className="inv-col-broker">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="mt-1.5 h-3 w-28" />
              </td>
              <td className="inv-col-date">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-1.5 h-3 w-16" />
              </td>
              <td className="inv-col-amount">
                <Skeleton className="ml-auto h-4 w-16" />
              </td>
              <td className="inv-col-status">
                <Skeleton className="h-5 w-20 rounded-full" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Placeholder cards for the mobile invoice list. */
export function InvoiceCardsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="mobile-invoice-list flex-1 min-h-0 overflow-y-auto" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5" aria-hidden>
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-3 w-40 max-w-full" />
          </div>
          <div className="flex flex-col items-end">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mt-2 h-5 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
