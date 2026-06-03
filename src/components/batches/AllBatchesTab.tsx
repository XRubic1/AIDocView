import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { formatDate } from '../../utils/format'
import { PendingBatch } from '../../types/admin'
import { getAllBatches } from '../../data/mockBatches'

interface AllBatchesTabProps {
  onBatchSelect: (batchId: string, tab?: 'ready_to_post' | 'verification' | 'approval') => void
}

interface Batch extends PendingBatch {
  reviewed_at?: string
  reviewed_by?: string
  approved_count?: number
  rejected_count?: number
  in_use?: boolean
  in_use_by?: string
}

export default function AllBatchesTab({ onBatchSelect }: AllBatchesTabProps) {
  const navigate = useNavigate()
  // Use shared batches data source
  const [batches] = useState<Batch[]>(getAllBatches())

  const [filter, setFilter] = useState<'all' | 'ready_to_post' | 'verification' | 'approval' | 'submitted' | 'processing' | 'approved' | 'documents_uploaded'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showNavigationModal, setShowNavigationModal] = useState(false)
  const [selectedBatchForNavigation, setSelectedBatchForNavigation] = useState<Batch | null>(null)

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      ready_to_post: { bg: '#C2A558', text: '#FFFFFF', label: 'Ready to Post' },
      verification: { bg: '#819291', text: '#FFFFFF', label: 'Verification' },
      approval: { bg: '#113543', text: '#FFFFFF', label: 'Approval' },
      submitted: { bg: '#C2A558', text: '#FFFFFF', label: 'Submitted' },
      processing: { bg: '#C2A558', text: '#FFFFFF', label: 'Processing' },
      approved: { bg: '#819291', text: '#FFFFFF', label: 'Approved' },
      rejected: { bg: '#C2A558', text: '#FFFFFF', label: 'Rejected' },
      documents_uploaded: { bg: '#F59E0B', text: '#FFFFFF', label: 'Documents Uploaded' },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.ready_to_post

    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
        style={{ backgroundColor: config.bg, color: config.text }}
      >
        {config.label}
      </span>
    )
  }

  const handleViewClick = (batch: Batch, e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (batch.status === 'ready_to_post') {
      // Go directly to Ready to Post
      onBatchSelect(batch.id, 'ready_to_post')
    } else if (batch.status === 'verification') {
      // Show popup to choose Verification or Ready to Post
      setSelectedBatchForNavigation(batch)
      setShowNavigationModal(true)
    } else if (batch.status === 'approval') {
      // Show popup to choose Approval, Verification, or Ready to Post
      setSelectedBatchForNavigation(batch)
      setShowNavigationModal(true)
    } else {
      // Default behavior for other statuses
      onBatchSelect(batch.id)
    }
  }

  const handleNavigateToTab = (tab: 'ready_to_post' | 'verification' | 'approval') => {
    if (selectedBatchForNavigation) {
      onBatchSelect(selectedBatchForNavigation.id, tab)
      setShowNavigationModal(false)
      setSelectedBatchForNavigation(null)
    }
  }

  const filteredBatches = batches.filter((batch) => {
    const matchesFilter = filter === 'all' || batch.status === filter
    const matchesSearch =
      searchTerm === '' ||
      batch.batch_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.client_name.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold" style={{ color: '#113543' }}>All Batches</h2>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Search batches..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 text-sm border rounded"
            style={{
              borderColor: '#819291',
              color: '#113543',
              backgroundColor: '#FFFFFF',
            }}
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="px-3 py-1.5 text-sm border rounded"
            style={{
              borderColor: '#819291',
              color: '#113543',
              backgroundColor: '#FFFFFF',
            }}
          >
            <option value="all">All Status</option>
            <option value="ready_to_post">Ready to Post</option>
            <option value="verification">Verification</option>
            <option value="approval">Approval</option>
            <option value="submitted">Submitted</option>
            <option value="processing">Processing</option>
            <option value="approved">Approved</option>
          </select>
          <button
            onClick={() => navigate('/batches/create')}
            className="flex items-center space-x-2 px-4 py-1.5 text-sm font-medium text-white transition-colors rounded"
            style={{ backgroundColor: '#C2A558' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#b89547'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#C2A558'
            }}
          >
            <Plus className="w-4 h-4" />
            <span>Create</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: '#819291' }}>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Batch#
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Client
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Invoices
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Amount
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Submitted
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  In Use
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Reviewed
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                  Action
                </th>
              </tr>
            </thead>
          <tbody>
            {filteredBatches.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center" style={{ color: '#819291' }}>
                  No batches found
                </td>
              </tr>
            ) : (
              filteredBatches.map((batch, index) => (
                <tr
                  key={batch.id}
                  className="border-b cursor-pointer transition-colors"
                  style={{
                    borderColor: '#819291',
                    backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                  }}
                  onClick={() => onBatchSelect(batch.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f0f0f0'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#f8f9fa' : '#FFFFFF'
                  }}
                >
                  <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                    {batch.batch_number}
                  </td>
                  <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>{batch.client_name}</td>
                  <td className="py-3 px-4 text-sm text-right" style={{ color: '#113543' }}>
                    {batch.total_invoices}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                    {formatCurrency(batch.total_amount)}
                  </td>
                  <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                    {formatDate(batch.submitted_at)}
                  </td>
                  <td className="py-3 px-4 text-sm">{getStatusBadge(batch.status)}</td>
                  <td className="py-3 px-4 text-sm">
                    {batch.in_use ? (
                      <div>
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium mb-1"
                          style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
                        >
                          In Use
                        </span>
                        <div className="text-xs mt-1" style={{ color: '#819291' }}>{batch.in_use_by}</div>
                      </div>
                    ) : (
                      <span className="text-sm" style={{ color: '#819291' }}>Available</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                    {batch.reviewed_at ? (
                      <div>
                        <div>{formatDate(batch.reviewed_at)}</div>
                        <div className="text-xs" style={{ color: '#819291' }}>{batch.reviewed_by}</div>
                      </div>
                    ) : (
                      <span className="text-sm" style={{ color: '#819291' }}>Not reviewed</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={(e) => handleViewClick(batch, e)}
                      className="px-3 py-1 text-sm font-medium text-white transition-colors"
                      style={{ backgroundColor: '#C2A558' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#b89547'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#C2A558'
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Navigation Modal */}
      {showNavigationModal && selectedBatchForNavigation && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="relative rounded-lg shadow-xl max-w-md w-full"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <div
                className="sticky top-0 border-b px-6 py-4 flex items-center justify-between"
                style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}
              >
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                    Select Workflow Stage
                  </h3>
                  <p className="text-sm mt-1" style={{ color: '#819291' }}>
                    {selectedBatchForNavigation.batch_number}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowNavigationModal(false)
                    setSelectedBatchForNavigation(null)
                  }}
                  className="p-2 transition-colors"
                  style={{ color: '#819291' }}
                >
                  ×
                </button>
              </div>

              <div className="p-6">
                <p className="text-sm mb-4" style={{ color: '#113543' }}>
                  Choose which workflow stage to view this batch:
                </p>
                <div className="space-y-2">
                  {selectedBatchForNavigation.status === 'approval' && (
                    <button
                      onClick={() => handleNavigateToTab('approval')}
                      className="w-full text-left px-4 py-3 border rounded transition-colors"
                      style={{
                        borderColor: '#819291',
                        backgroundColor: '#FFFFFF',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f8f9fa'
                        e.currentTarget.style.borderColor = '#C2A558'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#FFFFFF'
                        e.currentTarget.style.borderColor = '#819291'
                      }}
                    >
                      <div className="font-medium" style={{ color: '#113543' }}>
                        Approval
                      </div>
                      <div className="text-xs mt-1" style={{ color: '#819291' }}>
                        Final approval and processing
                      </div>
                    </button>
                  )}
                  {(selectedBatchForNavigation.status === 'verification' || selectedBatchForNavigation.status === 'approval') && (
                    <button
                      onClick={() => handleNavigateToTab('verification')}
                      className="w-full text-left px-4 py-3 border rounded transition-colors"
                      style={{
                        borderColor: '#819291',
                        backgroundColor: '#FFFFFF',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f8f9fa'
                        e.currentTarget.style.borderColor = '#C2A558'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#FFFFFF'
                        e.currentTarget.style.borderColor = '#819291'
                      }}
                    >
                      <div className="font-medium" style={{ color: '#113543' }}>
                        Verification
                      </div>
                      <div className="text-xs mt-1" style={{ color: '#819291' }}>
                        Verify and approve invoices
                      </div>
                    </button>
                  )}
                  <button
                    onClick={() => handleNavigateToTab('ready_to_post')}
                    className="w-full text-left px-4 py-3 border rounded transition-colors"
                    style={{
                      borderColor: '#819291',
                      backgroundColor: '#FFFFFF',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f8f9fa'
                      e.currentTarget.style.borderColor = '#C2A558'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#FFFFFF'
                      e.currentTarget.style.borderColor = '#819291'
                    }}
                  >
                    <div className="font-medium" style={{ color: '#113543' }}>
                      Ready to Post
                    </div>
                    <div className="text-xs mt-1" style={{ color: '#819291' }}>
                      Assign paperwork and brokers
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

