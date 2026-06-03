
import { formatCurrency } from '../../utils/format'
import { PendingBatch } from '../../types/admin'

interface PendingBatchesTableProps {
  batches: PendingBatch[]
  onBatchClick?: (batchId: string) => void
}

export function PendingBatchesTable({
  batches,
  onBatchClick,
}: PendingBatchesTableProps) {
  const getTimeColor = (minutes: number) => {
    if (minutes < 240) return { color: '#819291' } // < 4 hours
    if (minutes < 720) return { color: '#C2A558' } // 4-12 hours
    return { color: '#C2A558' } // > 12 hours
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      ready_to_post: { bg: '#C2A558', text: '#FFFFFF', label: 'Ready to Post' },
      verification: { bg: '#819291', text: '#FFFFFF', label: 'Verification' },
      approval: { bg: '#113543', text: '#FFFFFF', label: 'Approval' },
      submitted: { bg: '#C2A558', text: '#FFFFFF', label: 'Submitted' },
      processing: { bg: '#C2A558', text: '#FFFFFF', label: 'Processing' },
      pending: { bg: '#819291', text: '#FFFFFF', label: 'Pending' },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending

    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
        style={{ backgroundColor: config.bg, color: config.text }}
      >
        {config.label}
      </span>
    )
  }

  if (batches.length === 0) {
    return (
      <div className="border p-6" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: '#113543' }}>Pending Batches</h2>
          <button className="text-sm transition-colors" style={{ color: '#819291' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#113543' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#819291' }}>
            View All Batches
          </button>
        </div>
        <div className="flex items-center justify-center py-8" style={{ color: '#819291' }}>
          <div className="text-center">
            <div className="text-4xl mb-2">✓</div>
            <div className="font-medium">All caught up! No pending batches.</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#113543' }}>Pending Batches</h2>
            <p className="text-sm mt-1" style={{ color: '#819291' }}>Batches awaiting review</p>
          </div>
          <button className="text-sm font-medium transition-colors" style={{ color: '#819291' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#113543' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#819291' }}>
            View All Batches
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: '#819291' }}>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Client
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Batch#
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Total Invoices
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Total Amount
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Time Passed
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Status
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch, index) => {
                const hours = Math.floor(batch.minutes_since_submitted / 60)
                const minutes = batch.minutes_since_submitted % 60
                const timeText =
                  hours > 0 ? `${hours} hours ago` : `${minutes} minutes ago`

                return (
                  <tr
                    key={batch.id}
                    className={`border-b transition-colors ${
                      onBatchClick ? 'cursor-pointer' : ''
                    }`}
                    style={{
                      borderColor: '#819291',
                      backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                    }}
                    onClick={() => onBatchClick?.(batch.id)}
                    onMouseEnter={(e) => {
                      if (onBatchClick) {
                        e.currentTarget.style.backgroundColor = '#f0f0f0'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (onBatchClick) {
                        e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#f8f9fa' : '#FFFFFF'
                      }
                    }}
                  >
                    <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                      {batch.client_name}
                    </td>
                    <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>{batch.batch_number}</td>
                    <td className="py-3 px-4 text-sm text-right" style={{ color: '#113543' }}>
                      {batch.total_invoices}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                      {formatCurrency(batch.total_amount)}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium" style={getTimeColor(batch.minutes_since_submitted)}>
                      {timeText}
                    </td>
                    <td className="py-3 px-4 text-sm">{getStatusBadge(batch.status)}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onBatchClick?.(batch.id)
                        }}
                        className="px-3 py-1 text-sm font-medium text-white transition-colors"
                        style={{ backgroundColor: '#C2A558' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#b89547'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#C2A558'
                        }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

