import { useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import AllInvoicesTab from '../components/invoices/AllInvoicesTab'
import OnHoldInvoicesTab from '../components/invoices/OnHoldInvoicesTab'
import PendingInvoicesTab from '../components/invoices/PendingInvoicesTab'
import InvoiceDetailTab from '../components/invoices/InvoiceDetailTab'

type TabType = 'all' | 'on-hold' | 'pending' | 'detail'

export default function InvoiceSearch() {
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

  const tabs = [
    { id: 'all' as TabType, label: 'All Invoices', count: 1250 },
    { id: 'on-hold' as TabType, label: 'On Hold', count: 42 },
    { id: 'pending' as TabType, label: 'Pending Review', count: 38 },
  ]

  const handleInvoiceSelect = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId)
    setActiveTab('detail')
  }

  return (
    <AdminLayout userName="Admin User" userRole="Administrator">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-black mb-2">Invoice Search</h1>
          <p className="text-gray-600">Search and manage invoices across all clients</p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white border-b border-gray-200 mb-6">
          <nav className="flex space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  if (tab.id !== 'detail') {
                    setSelectedInvoiceId(null)
                  }
                }}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-black border-b-2 border-black'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                {tab.label}
                {tab.count !== null && (
                  <span
                    className={`ml-2 px-2 py-0.5 text-xs rounded ${
                      activeTab === tab.id
                        ? 'bg-black text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white border border-gray-200">
          {activeTab === 'all' && (
            <AllInvoicesTab onInvoiceSelect={handleInvoiceSelect} />
          )}
          {activeTab === 'on-hold' && (
            <OnHoldInvoicesTab onInvoiceSelect={handleInvoiceSelect} />
          )}
          {activeTab === 'pending' && (
            <PendingInvoicesTab onInvoiceSelect={handleInvoiceSelect} />
          )}
          {activeTab === 'detail' && (
            <InvoiceDetailTab
              invoiceId={selectedInvoiceId}
              onBack={() => {
                setActiveTab('all')
                setSelectedInvoiceId(null)
              }}
            />
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

