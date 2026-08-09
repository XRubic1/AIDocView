import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, ChevronRight } from 'lucide-react'
import DashboardPanel from '../client/dashboard/DashboardPanel'
import ClientSortableHeader from '../client/ClientSortableHeader'
import { useClientTheme } from '../../theme/ThemeContext'
import type { SortDir } from '../../utils/clientListPage'
import { compareByClientName } from '../../utils/compareByClientName'
import type { ClientWorkSummary } from '../../utils/clientWorkQueue'

type SortField = 'clientName' | 'totalOpen' | 'disputes' | 'payments' | 'holds' | 'callbacks' | 'batches'

type Props = {
  summaries: ClientWorkSummary[]
  /** Max rows on the compact dashboard teaser. */
  limit?: number
  /** Show link to full work queue page. */
  showViewAll?: boolean
}

/**
 * Compact client-centric work queue for the admin dashboard.
 */
export function ClientWorkQueuePanel({
  summaries,
  limit = 12,
  showViewAll = true,
}: Props) {
  const c = useClientTheme()
  const navigate = useNavigate()
  const [sortField, setSortField] = useState<SortField>('totalOpen')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const onSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDir(field === 'clientName' ? 'asc' : 'desc')
  }

  const rows = useMemo(() => {
    const sorted = [...summaries].sort((a, b) => {
      if (sortField === 'clientName') {
        return compareByClientName(a.clientName, b.clientName, sortDir)
      }
      const left = a[sortField]
      const right = b[sortField]
      const cmp = (left as number) - (right as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted.slice(0, limit)
  }, [summaries, sortField, sortDir, limit])

  if (summaries.length === 0) {
    return (
      <DashboardPanel title="Client Work Queue" icon={Briefcase} iconTone="blue" interactive={false}>
        <div className="p-8 text-center" style={{ color: c.secondary }}>
          <div className="text-3xl mb-2">✓</div>
          <div className="font-medium text-sm">No open client work</div>
        </div>
      </DashboardPanel>
    )
  }

  return (
    <DashboardPanel
      title="Client Work Queue"
      icon={Briefcase}
      iconTone="blue"
      actionLabel={showViewAll ? 'View all' : undefined}
      onAction={showViewAll ? () => navigate('/admin/work-queue') : undefined}
      interactive={false}
    >
      <div className="overflow-x-auto">
        <table className="dashboard-table dashboard-table--compact w-full">
          <thead>
            <tr>
              <ClientSortableHeader
                field="clientName"
                label="Client"
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
              />
              <ClientSortableHeader
                field="totalOpen"
                label="Open"
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
                align="center"
                className="text-center"
              />
              <ClientSortableHeader
                field="disputes"
                label="Disputes"
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
                align="center"
                className="text-center"
              />
              <ClientSortableHeader
                field="payments"
                label="Payments"
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
                align="center"
                className="text-center"
              />
              <ClientSortableHeader
                field="holds"
                label="Holds"
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
                align="center"
                className="text-center"
              />
              <ClientSortableHeader
                field="callbacks"
                label="Callbacks"
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
                align="center"
                className="text-center"
              />
              <ClientSortableHeader
                field="batches"
                label="Batches"
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
                align="center"
                className="text-center"
              />
              <th>Next</th>
              <th className="text-center" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.clientId}
                className="cursor-pointer"
                onClick={() => navigate(row.links.workQueue)}
              >
                <td>
                  <div className="font-medium">{row.clientName}</div>
                  <div className="text-xs" style={{ color: c.secondary }}>
                    {row.severity} priority
                  </div>
                </td>
                <td className="text-center font-semibold tabular-nums">{row.totalOpen}</td>
                <td className="text-center tabular-nums">{row.disputes || '—'}</td>
                <td className="text-center tabular-nums">{row.payments || '—'}</td>
                <td className="text-center tabular-nums">{row.holds || '—'}</td>
                <td className="text-center tabular-nums">{row.callbacks || '—'}</td>
                <td className="text-center tabular-nums">{row.batches || '—'}</td>
                <td className="text-sm" style={{ color: c.secondary }}>
                  {row.nextDueLabel}
                </td>
                <td className="text-center">
                  <ChevronRight className="w-4 h-4 inline" style={{ color: c.muted }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summaries.length > limit ? (
        <div className="px-4 py-2 text-xs border-t" style={{ color: c.secondary, borderColor: c.border }}>
          Showing {limit} of {summaries.length} clients with open work
        </div>
      ) : null}
    </DashboardPanel>
  )
}
