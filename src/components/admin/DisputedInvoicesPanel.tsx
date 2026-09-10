import { useMemo, useState } from 'react'
import { CheckCircle2, Scale } from 'lucide-react'
import DashboardPanel from '../client/dashboard/DashboardPanel'
import ClientSortableHeader from '../client/ClientSortableHeader'
import { useClientTheme } from '../../theme/ThemeContext'
import { formatCurrency } from '../../utils/format'
import type { SortDir } from '../../utils/clientListPage'
import { compareByClientName } from '../../utils/compareByClientName'
import type { OpenDisputedInvoiceRow } from '../../utils/clientInvoiceDisputeStatus'

type SortField = 'client_name' | 'amount' | 'invoice_number'

type DisputedInvoicesPanelProps = {
  rows: OpenDisputedInvoiceRow[]
  onInvoiceClick?: (invoiceId: string) => void
  onViewAll?: () => void
}

/**
 * Admin dashboard list of Open Disputed invoices (paperwork/claim + receipt disputes).
 */
export function DisputedInvoicesPanel({
  rows,
  onInvoiceClick,
  onViewAll,
}: DisputedInvoicesPanelProps) {
  const c = useClientTheme()
  const [sortField, setSortField] = useState<SortField>('amount')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const onSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDir(field === 'client_name' || field === 'invoice_number' ? 'asc' : 'desc')
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortField === 'client_name') {
        return compareByClientName(a.invoice.client_name, b.invoice.client_name, sortDir)
      }
      if (sortField === 'invoice_number') {
        const cmp = a.invoice.invoice_number.localeCompare(b.invoice.invoice_number, undefined, {
          numeric: true,
        })
        return sortDir === 'asc' ? cmp : -cmp
      }
      const cmp = a.invoice.amount - b.invoice.amount
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortField, sortDir])

  if (rows.length === 0) {
    return (
      <DashboardPanel title="Disputed invoices" icon={Scale} iconTone="amber" interactive={false}>
        <div className="p-8 text-center flex flex-col items-center gap-2" style={{ color: c.secondary }}>
          <CheckCircle2 className="w-8 h-8" style={{ color: c.success }} strokeWidth={1.5} />
          <div className="font-medium text-sm" style={{ color: c.primary }}>
            No open disputes
          </div>
          <div className="text-xs">Invoice and receipt disputes will show up here</div>
        </div>
      </DashboardPanel>
    )
  }

  return (
    <DashboardPanel
      title="Disputed invoices"
      icon={Scale}
      iconTone="amber"
      badge={rows.length}
      badgeTone="amber"
      actionLabel={onViewAll ? 'View all' : undefined}
      onAction={onViewAll}
      interactive={false}
    >
      <div className="overflow-x-auto">
        <table className="dashboard-table dashboard-table--compact w-full">
          <thead>
            <tr>
              <ClientSortableHeader
                field="invoice_number"
                label="Inv#"
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
              />
              <ClientSortableHeader
                field="client_name"
                label="Client"
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
              />
              <th>Broker</th>
              <th>Type</th>
              <th>Reason</th>
              <ClientSortableHeader
                field="amount"
                label="Amount"
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
                className="text-right"
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const { invoice } = row
              return (
                <tr
                  key={invoice.id}
                  className={onInvoiceClick ? 'cursor-pointer' : undefined}
                  onClick={() => onInvoiceClick?.(invoice.id)}
                >
                  <td className="font-medium" style={{ color: c.primary }}>
                    {invoice.invoice_number}
                  </td>
                  <td>{invoice.client_name}</td>
                  <td>{invoice.broker_name}</td>
                  <td>
                    <span className="status-pill status-pill--hold">
                      {row.source === 'receipt' ? 'Receipt' : 'Invoice'}
                    </span>
                  </td>
                  <td className="max-w-[14rem] truncate" title={row.reason}>
                    {row.reason}
                  </td>
                  <td className="text-right tabular-nums font-medium">
                    {formatCurrency(invoice.amount)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </DashboardPanel>
  )
}
