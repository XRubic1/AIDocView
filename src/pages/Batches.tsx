import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Header } from '../components/admin/Header'
import AdminCreateBatchPanel from '../components/batches/AdminCreateBatchPanel'
import ReadyToPostTab from '../components/batches/ReadyToPostTab'
import VerificationTab from '../components/batches/VerificationTab'
import ApprovalTab from '../components/batches/ApprovalTab'
import AllBatchesTab from '../components/batches/AllBatchesTab'
import { getAllBatches, updateBatchStatus } from '../data/mockBatches'

type TabType = 'ready_to_post' | 'verification' | 'approval' | 'all'

export default function Batches() {
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

  // Calculate counts dynamically from shared batches data
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
    { id: 'all' as TabType, label: 'All Batches', count: batchCounts.all },
  ]

  const handleBatchSelect = (batchId: string, nextStage?: TabType) => {
    setSelectedBatchId(batchId)
    if (nextStage) {
      setActiveTab(nextStage)
      // Keep the batch selected when moving to next stage
    }
  }

  const handleMoveToVerification = (batchId: string) => {
    // Update batch status to verification
    updateBatchStatus(batchId, 'verification')
    // Trigger re-render to update counts
    setRefreshKey((prev) => prev + 1)
    // Switch to verification tab and keep batch selected
    setActiveTab('verification')
    setSelectedBatchId(batchId)
  }

  const handleMoveToApproval = (batchId: string) => {
    // Update batch status to approval
    updateBatchStatus(batchId, 'approval')
    // Trigger re-render to update counts
    setRefreshKey((prev) => prev + 1)
    // Switch to approval tab and keep batch selected
    setActiveTab('approval')
    setSelectedBatchId(batchId)
  }
  
  const handleAllBatchesSelect = (batchId: string, tab?: 'ready_to_post' | 'verification' | 'approval') => {
    setSelectedBatchId(batchId)
    if (tab) {
      setActiveTab(tab)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      <Header userName="Admin User" userRole="Administrator" />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div
          className={`flex items-center justify-between flex-wrap gap-3 ${showCreateBatch ? 'mb-3' : 'mb-6'}`}
        >
          <div>
            <h1
              className={`font-bold ${showCreateBatch ? 'text-lg' : 'text-2xl'}`}
              style={{ color: '#113543' }}
            >
              Batches
            </h1>
            {!showCreateBatch && (
              <p className="text-sm mt-1" style={{ color: '#819291' }}>
                Manage client batches or create a new batch on behalf of a client
              </p>
            )}
          </div>
          {!showCreateBatch && (
            <button
              type="button"
              onClick={() => {
                setSelectedBatchId(null)
                setShowCreateBatch(true)
              }}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded transition-colors"
              style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#a88d47'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#C2A558'
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Create batch</span>
            </button>
          )}
        </div>

        {showCreateBatch ? (
          <div
            className="border mb-6 flex flex-col min-h-0"
            style={{ backgroundColor: '#FFFFFF', borderColor: '#819291', maxHeight: 'calc(100vh - 10rem)' }}
          >
            <AdminCreateBatchPanel
              onComplete={handleBatchCreated}
              onCancel={() => setShowCreateBatch(false)}
            />
          </div>
        ) : (
          <>
        {/* Tab Navigation */}
        <div className="border-b mb-6" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
          <nav className="flex space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  // Clear selectedBatchId when switching tabs to show the list view
                  // This prevents moving batches when just switching tabs
                    setSelectedBatchId(null)
                }}
                className="px-6 py-3 text-sm font-medium transition-colors relative"
                style={{
                  color: activeTab === tab.id ? '#113543' : '#819291',
                  borderBottom: activeTab === tab.id ? '2px solid #C2A558' : '2px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.color = '#113543'
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.color = '#819291'
                  }
                }}
              >
                {tab.label}
                {tab.count !== null && (
                  <span
                    className="ml-2 px-2 py-0.5 text-xs rounded"
                    style={{
                      backgroundColor: activeTab === tab.id ? '#C2A558' : '#819291',
                      color: '#FFFFFF',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
          {activeTab === 'ready_to_post' && (
            <ReadyToPostTab
              batchId={selectedBatchId}
              onBatchSelect={(batchId) => handleBatchSelect(batchId)}
              onMoveToVerification={handleMoveToVerification}
              onBack={() => {
                setSelectedBatchId(null)
              }}
            />
          )}
          {activeTab === 'verification' && (
            <VerificationTab
              batchId={selectedBatchId}
              onBatchSelect={(batchId) => handleBatchSelect(batchId)}
              onMoveToApproval={handleMoveToApproval}
              onBack={() => {
                setSelectedBatchId(null)
              }}
            />
          )}
          {activeTab === 'approval' && (
            <ApprovalTab
              batchId={selectedBatchId}
              onBatchSelect={(batchId) => handleBatchSelect(batchId)}
              onBack={() => {
                setSelectedBatchId(null)
              }}
            />
          )}
          {activeTab === 'all' && (
            <AllBatchesTab onBatchSelect={handleAllBatchesSelect} />
          )}
        </div>
          </>
        )}
      </main>
    </div>
  )
}

