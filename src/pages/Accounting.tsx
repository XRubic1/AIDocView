import { useState, useMemo } from 'react'
import { Header } from '../components/admin/Header'
import { getAllBatches } from '../data/mockBatches'
import { getAllClients } from '../services/clientRegistry'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/format'
import { DollarSign, TrendingUp, Users, FileText, Calendar, Download } from 'lucide-react'

export default function Accounting() {
  const [dateRange, setDateRange] = useState<'all' | 'month' | 'quarter' | 'year'>('all')
  const [selectedClient, setSelectedClient] = useState<string | null>(null)

  const batches = getAllBatches()

  // Calculate earnings from batches
  const earningsData = useMemo(() => {
    const now = new Date()
    let startDate: Date | null = null

    switch (dateRange) {
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3)
        startDate = new Date(now.getFullYear(), quarter * 3, 1)
        break
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1)
        break
      default:
        startDate = null
    }

    // Filter batches by date range
    const filteredBatches = batches.filter((batch) => {
      if (!startDate) return true
      const batchDate = new Date(batch.submitted_at)
      return batchDate >= startDate
    })

    // Calculate total earnings
    let totalEarnings = 0
    let totalBatchAmount = 0
    let totalNetAmount = 0
    const clientEarnings: Record<string, {
      clientId: string
      clientName: string
      totalFees: number
      totalBatchAmount: number
      totalNetAmount: number
      batchCount: number
    }> = {}

    filteredBatches.forEach((batch) => {
      if (batch.fee_calculation?.total_fee) {
        totalEarnings += batch.fee_calculation.total_fee
        totalBatchAmount += batch.total_amount
        totalNetAmount += batch.fee_calculation.net_amount || 0

        // Group by client
        if (!clientEarnings[batch.client_id]) {
          clientEarnings[batch.client_id] = {
            clientId: batch.client_id,
            clientName: batch.client_name,
            totalFees: 0,
            totalBatchAmount: 0,
            totalNetAmount: 0,
            batchCount: 0,
          }
        }

        clientEarnings[batch.client_id].totalFees += batch.fee_calculation.total_fee
        clientEarnings[batch.client_id].totalBatchAmount += batch.total_amount
        clientEarnings[batch.client_id].totalNetAmount += batch.fee_calculation.net_amount || 0
        clientEarnings[batch.client_id].batchCount += 1
      }
    })

    // Convert to array and sort by total fees
    const clientEarningsArray = Object.values(clientEarnings)
      .filter((client) => !selectedClient || client.clientId === selectedClient)
      .sort((a, b) => b.totalFees - a.totalFees)

    return {
      totalEarnings,
      totalBatchAmount,
      totalNetAmount,
      clientEarnings: clientEarningsArray,
      totalBatches: filteredBatches.filter((b) => b.fee_calculation?.total_fee).length,
    }
  }, [batches, dateRange, selectedClient])

  // Get detailed batch list for selected client
  const clientBatchDetails = useMemo(() => {
    if (!selectedClient) return []
    
    const now = new Date()
    let startDate: Date | null = null

    switch (dateRange) {
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3)
        startDate = new Date(now.getFullYear(), quarter * 3, 1)
        break
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1)
        break
      default:
        startDate = null
    }

    return batches
      .filter((batch) => {
        if (batch.client_id !== selectedClient) return false
        if (!batch.fee_calculation?.total_fee) return false
        if (!startDate) return true
        const batchDate = new Date(batch.submitted_at)
        return batchDate >= startDate
      })
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
  }, [batches, selectedClient, dateRange])

  const handleExportReport = () => {
    // In a real implementation, this would generate and download a report
    alert('Export functionality will be implemented')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
      <Header userName="Admin User" />
      
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{ color: '#113543' }}>
              Accounting Dashboard
            </h1>
            <p className="text-sm" style={{ color: '#819291' }}>
              Financial overview, earnings, and reports
            </p>
          </div>
          <button
            onClick={handleExportReport}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: '#819291' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#6b7a7a'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#819291'
            }}
          >
            <Download className="w-4 h-4" />
            <span>Export Report</span>
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border p-4 mb-6" style={{ borderColor: '#819291' }}>
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4" style={{ color: '#819291' }} />
              <label className="text-sm font-medium" style={{ color: '#113543' }}>
                Date Range:
              </label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
                className="px-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: '#819291',
                  color: '#113543',
                  backgroundColor: '#FFFFFF',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C2A558'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#819291'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <option value="all">All Time</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4" style={{ color: '#819291' }} />
              <label className="text-sm font-medium" style={{ color: '#113543' }}>
                Client:
              </label>
              <select
                value={selectedClient || ''}
                onChange={(e) => setSelectedClient(e.target.value || null)}
                className="px-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: '#819291',
                  color: '#113543',
                  backgroundColor: '#FFFFFF',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C2A558'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#819291'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <option value="">All Clients</option>
                {getAllClients().map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {/* Total Earnings */}
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#819291' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#E8F5E9' }}>
                <DollarSign className="w-6 h-6" style={{ color: '#2E7D32' }} />
              </div>
              <TrendingUp className="w-5 h-5" style={{ color: '#2E7D32' }} />
            </div>
            <h3 className="text-sm font-medium mb-1" style={{ color: '#819291' }}>
              Total Earnings
            </h3>
            <p className="text-2xl font-bold" style={{ color: '#113543' }}>
              {formatCurrency(earningsData.totalEarnings)}
            </p>
          </div>

          {/* Total Batch Amount */}
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#819291' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#E3F2FD' }}>
                <FileText className="w-6 h-6" style={{ color: '#1976D2' }} />
              </div>
            </div>
            <h3 className="text-sm font-medium mb-1" style={{ color: '#819291' }}>
              Total Batch Amount
            </h3>
            <p className="text-2xl font-bold" style={{ color: '#113543' }}>
              {formatCurrency(earningsData.totalBatchAmount)}
            </p>
          </div>

          {/* Net Amount */}
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#819291' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#FFF3E0' }}>
                <DollarSign className="w-6 h-6" style={{ color: '#E65100' }} />
              </div>
            </div>
            <h3 className="text-sm font-medium mb-1" style={{ color: '#819291' }}>
              Net Amount (After Fees)
            </h3>
            <p className="text-2xl font-bold" style={{ color: '#113543' }}>
              {formatCurrency(earningsData.totalNetAmount)}
            </p>
          </div>

          {/* Total Batches */}
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#819291' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#F3E5F5' }}>
                <FileText className="w-6 h-6" style={{ color: '#7B1FA2' }} />
              </div>
            </div>
            <h3 className="text-sm font-medium mb-1" style={{ color: '#819291' }}>
              Total Batches
            </h3>
            <p className="text-2xl font-bold" style={{ color: '#113543' }}>
              {earningsData.totalBatches}
            </p>
          </div>
        </div>

        {/* Earnings by Client */}
        <div className="bg-white rounded-lg border mb-6" style={{ borderColor: '#819291' }}>
          <div className="p-6 border-b" style={{ borderColor: '#819291' }}>
            <h2 className="text-xl font-bold" style={{ color: '#113543' }}>
              Earnings by Client
            </h2>
            <p className="text-sm mt-1" style={{ color: '#819291' }}>
              Breakdown of fees earned from each client
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#F5F5F5' }}>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Client Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Batches
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Total Batch Amount
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Total Fees
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Net Amount
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: '#819291' }}>
                {earningsData.clientEarnings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-sm" style={{ color: '#819291' }}>
                      No earnings data available for the selected filters
                    </td>
                  </tr>
                ) : (
                  earningsData.clientEarnings.map((client) => (
                    <tr
                      key={client.clientId}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedClient(selectedClient === client.clientId ? null : client.clientId)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium" style={{ color: '#113543' }}>
                          {client.clientName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm" style={{ color: '#113543' }}>
                          {client.batchCount}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium" style={{ color: '#113543' }}>
                          {formatCurrency(client.totalBatchAmount)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold" style={{ color: '#2E7D32' }}>
                          {formatCurrency(client.totalFees)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm" style={{ color: '#113543' }}>
                          {formatCurrency(client.totalNetAmount)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedClient(selectedClient === client.clientId ? null : client.clientId)
                          }}
                          className="text-sm font-medium transition-colors"
                          style={{ color: '#819291' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#113543'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#819291'
                          }}
                        >
                          {selectedClient === client.clientId ? 'Hide Details' : 'View Details'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Client Batch Details */}
        {selectedClient && clientBatchDetails.length > 0 && (
          <div className="bg-white rounded-lg border mb-6" style={{ borderColor: '#819291' }}>
            <div className="p-6 border-b" style={{ borderColor: '#819291' }}>
              <h2 className="text-xl font-bold" style={{ color: '#113543' }}>
                Batch Details - {earningsData.clientEarnings.find((c) => c.clientId === selectedClient)?.clientName}
              </h2>
              <p className="text-sm mt-1" style={{ color: '#819291' }}>
                Individual batch breakdown for selected client
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: '#F5F5F5' }}>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                      Batch Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                      Submitted Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                      Batch Amount
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                      Fee Type
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                      Fee Amount
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                      Net Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: '#819291' }}>
                  {clientBatchDetails.map((batch) => (
                    <tr key={batch.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium" style={{ color: '#113543' }}>
                          {batch.batch_number}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm" style={{ color: '#113543' }}>
                          {formatDate(batch.submitted_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor:
                              batch.status === 'submitted' || batch.status === 'processing'
                                ? '#E8F5E9'
                                : batch.status === 'approval'
                                ? '#E3F2FD'
                                : batch.status === 'verification'
                                ? '#FFF3E0'
                                : '#F5F5F5',
                            color:
                              batch.status === 'submitted' || batch.status === 'processing'
                                ? '#2E7D32'
                                : batch.status === 'approval'
                                ? '#1976D2'
                                : batch.status === 'verification'
                                ? '#E65100'
                                : '#819291',
                          }}
                        >
                          {batch.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium" style={{ color: '#113543' }}>
                          {formatCurrency(batch.total_amount)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm" style={{ color: '#113543' }}>
                          {batch.fee_calculation?.fee_type === 'percentage'
                            ? `${batch.fee_calculation.fee_percentage}%`
                            : batch.fee_calculation?.fee_type === 'flat'
                            ? 'Flat'
                            : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold" style={{ color: '#2E7D32' }}>
                          {formatCurrency(batch.fee_calculation?.total_fee || 0)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm" style={{ color: '#113543' }}>
                          {formatCurrency(batch.fee_calculation?.net_amount || 0)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Reports Section */}
        <div className="bg-white rounded-lg border" style={{ borderColor: '#819291' }}>
          <div className="p-6 border-b" style={{ borderColor: '#819291' }}>
            <h2 className="text-xl font-bold" style={{ color: '#113543' }}>
              Financial Reports
            </h2>
            <p className="text-sm mt-1" style={{ color: '#819291' }}>
              Generate and download accounting reports
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                onClick={handleExportReport}
                className="p-4 border rounded-lg text-left transition-colors hover:bg-gray-50"
                style={{ borderColor: '#819291' }}
              >
                <FileText className="w-6 h-6 mb-2" style={{ color: '#819291' }} />
                <h3 className="text-sm font-semibold mb-1" style={{ color: '#113543' }}>
                  Earnings Report
                </h3>
                <p className="text-xs" style={{ color: '#819291' }}>
                  Detailed breakdown of all earnings by client and batch
                </p>
              </button>
              <button
                onClick={handleExportReport}
                className="p-4 border rounded-lg text-left transition-colors hover:bg-gray-50"
                style={{ borderColor: '#819291' }}
              >
                <DollarSign className="w-6 h-6 mb-2" style={{ color: '#819291' }} />
                <h3 className="text-sm font-semibold mb-1" style={{ color: '#113543' }}>
                  Revenue Summary
                </h3>
                <p className="text-xs" style={{ color: '#819291' }}>
                  Total revenue and fee calculations summary
                </p>
              </button>
              <button
                onClick={handleExportReport}
                className="p-4 border rounded-lg text-left transition-colors hover:bg-gray-50"
                style={{ borderColor: '#819291' }}
              >
                <Users className="w-6 h-6 mb-2" style={{ color: '#819291' }} />
                <h3 className="text-sm font-semibold mb-1" style={{ color: '#113543' }}>
                  Client Statement
                </h3>
                <p className="text-xs" style={{ color: '#819291' }}>
                  Individual client earnings and batch history
                </p>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

