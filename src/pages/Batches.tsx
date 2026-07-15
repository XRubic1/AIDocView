import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import AdminCreateBatchPanel from '../components/batches/AdminCreateBatchPanel'
import ReadyToPostTab from '../components/batches/ReadyToPostTab'
import VerificationTab from '../components/batches/VerificationTab'
import ApprovalTab from '../components/batches/ApprovalTab'
import AllBatchesTab from '../components/batches/AllBatchesTab'
import { getAllBatches, updateBatchStatus } from '../data/mockBatches'
import { useClientTheme } from '../theme/ThemeContext'

type TabType = 'ready_to_post' | 'verification' | 'approval' | 'all'

export default function Batches() {
  const c = useClientTheme()
  const [activeTab, setActiveTab] = useState<TabType>('ready_to_post')
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showCreateBatch, setShowCreateBatch] = useState(false)

  const handleBatchCreated = (batchId: string) => {
    setRefreshKey((prev) => prev + 1)
    setShowCreateBatch(false)
    setActiveTab('ready_to_post')
    setSelectedBatchId(batchId)
  }

  const batchCounts = useMemo(() => {
    const allBatches = getAllBatches()
    return {
      ready_to_post: allBatches.filter((b) => b.status === 'ready_to_post').length,
      verification: allBatches.filter((b) => b.status === 'verification').length,
      approval: allBatches.filter((b) => b.status === 'approval').length,
      all: allBatches.length,
    }
  }, [refreshKey])

  const tabs = [
    { id: 'ready_to_post' as TabType, label: 'Ready to Post', count: batchCounts.ready_to_post },
    { id: 'verification' as TabType, label: 'Verification', count: batchCounts.verification },
    { id: 'approval' as TabType, label: 'Approval', count: batchCounts.approval },
    { id: 'all' as TabType, label: 'All batches', count: batchCounts.all },
  ]

  const handleBatchSelect = (batchId: string, nextStage?: TabType) => {
    setSelectedBatchId(batchId)
    if (nextStage) {
      setActiveTab(nextStage)
    }
  }

  const handleMoveToVerification = (batchId: string) => {
    updateBatchStatus(batchId, 'verification')
    setRefreshKey((prev) => prev + 1)
    setActiveTab('verification')
    setSelectedBatchId(batchId)
  }

  const handleMoveToApproval = (batchId: string) => {
    updateBatchStatus(batchId, 'approval')
    setRefreshKey((prev) => prev + 1)
    setActiveTab('approval')
    setSelectedBatchId(batchId)
  }

  const handleAllBatchesSelect = (
    batchId: string,
    tab?: 'ready_to_post' | 'verification' | 'approval'
  ) => {
    setSelectedBatchId(batchId)
    if (tab) {
      setActiveTab(tab)
    }
  }

  const inDetailView = Boolean(selectedBatchId)

  return (
    <AdminLayout userName="Admin User" userRole="Administrator" flushMain>
      <div className="admin-batches-page overflow-hidden flex flex-col min-h-0 h-full">
        {showCreateBatch ? (
          <div className="dashboard-card flex-1 min-h-0 overflow-hidden flex flex-col rounded-none border-0 shadow-none">
            <AdminCreateBatchPanel
              onComplete={handleBatchCreated}
              onCancel={() => setShowCreateBatch(false)}
            />
          </div>
        ) : (
          <>
            <div
              className="client-page-tabs-bar shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-b"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <div className="page-tabs flex flex-wrap gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id)
                      setSelectedBatchId(null)
                    }}
                    className={`page-tab ${activeTab === tab.id ? 'page-tab--active' : ''}`}
                  >
                    {tab.label}
                    <span className="text-xs tabular-nums opacity-70">{tab.count}</span>
                  </button>
                ))}
              </div>
              {!inDetailView && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBatchId(null)
                    setShowCreateBatch(true)
                  }}
                  className="dashboard-btn-primary shrink-0 self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create batch
                </button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {activeTab === 'ready_to_post' && (
                <ReadyToPostTab
                  batchId={selectedBatchId}
                  onBatchSelect={(batchId) => handleBatchSelect(batchId)}
                  onMoveToVerification={handleMoveToVerification}
                  onBack={() => setSelectedBatchId(null)}
                />
              )}
              {activeTab === 'verification' && (
                <VerificationTab
                  batchId={selectedBatchId}
                  onBatchSelect={(batchId) => handleBatchSelect(batchId)}
                  onMoveToApproval={handleMoveToApproval}
                  onBack={() => setSelectedBatchId(null)}
                />
              )}
              {activeTab === 'approval' && (
                <ApprovalTab
                  batchId={selectedBatchId}
                  onBatchSelect={(batchId) => handleBatchSelect(batchId)}
                  onBack={() => setSelectedBatchId(null)}
                />
              )}
              {activeTab === 'all' && (
                <AllBatchesTab onBatchSelect={handleAllBatchesSelect} />
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
