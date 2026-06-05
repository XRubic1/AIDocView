import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mockClientDashboardData } from '../data/mockClientDashboard'
import { ClientCollectionItem } from '../types/collections'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/format'
import { AlertCircle, Eye, CheckCircle } from 'lucide-react'
import ClientLayout from '../components/ClientLayout'
import CollectionsInvoiceModal from '../components/collections/CollectionsInvoiceModal'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'

export default function ClientCollections() {
  const [data] = useState(mockClientDashboardData)
  const [searchParams, setSearchParams] = useSearchParams()
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null)

  // Get all approved invoices for the client that haven't been paid
  const clientInvoices = mockInvoices.filter(
    (inv) => (inv.client_id === data.client_id || inv.client_name === data.client_name) && inv.status === 'approved'
  )

  // Get confirmed payments to check which invoices have been paid
  const confirmedPayments = mockPayments.filter((p) => p.status === 'confirmed')
  const paidInvoiceIds = new Set(confirmedPayments.map((p) => p.invoice_id))

  // Convert invoices to collection items and calculate days since expected payment
  const collections = useMemo<ClientCollectionItem[]>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return clientInvoices
      .filter((inv) => !paidInvoiceIds.has(inv.id)) // Only show unpaid invoices
      .map((inv) => {
        const expectedDate = new Date(inv.expected_payment_date)
        expectedDate.setHours(0, 0, 0, 0)
        const daysSince = Math.floor((today.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24))
        const daysSinceExpected = daysSince > 0 ? daysSince : 0

        // Determine payment status based on days overdue and if payment exists
        let paymentStatus: 'not_received' | 'paid' | 'review' = 'not_received'
        if (daysSinceExpected >= 15) {
          // Check if there's a pending payment (payment exists but not confirmed yet)
          const hasPendingPayment = mockPayments.some(
            (p) => p.invoice_id === inv.id && p.status === 'pending'
          )
          // If there's a pending payment, keep as not_received (payment not yet confirmed)
          // Otherwise, it's not_received
          paymentStatus = 'not_received'
        }

        return {
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          broker_name: inv.broker_name,
          broker_id: inv.broker_id,
          amount: inv.amount,
          expected_payment_date: inv.expected_payment_date,
          days_since_expected: daysSinceExpected,
          payment_status: paymentStatus,
          broker_contacted: inv.broker_contacted || false,
          last_broker_contact: inv.last_broker_contact || null,
          load_number: inv.load_number,
          batch_number: inv.batch_number,
          invoice_date: inv.invoice_date,
        }
      })
      .sort((a, b) => b.days_since_expected - a.days_since_expected) // Sort by days overdue (most urgent first)
  }, [clientInvoices, paidInvoiceIds])

  const [collectionsState, setCollectionsState] = useState<ClientCollectionItem[]>(collections)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showInvoiceDetailModal, setShowInvoiceDetailModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)

  // Check for highlight parameter from notification
  useEffect(() => {
    const highlightInvoiceId = searchParams.get('highlight_invoice')
    if (highlightInvoiceId) {
      setHighlightedInvoiceId(highlightInvoiceId)
      // Remove the parameter from URL
      searchParams.delete('highlight_invoice')
      setSearchParams(searchParams, { replace: true })

      // Remove highlight after 3 seconds (flashing effect)
      const timer = setTimeout(() => {
        setHighlightedInvoiceId(null)
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [searchParams, setSearchParams])

  // Update collections state when collections change, but preserve in_review status
  useEffect(() => {
    setCollectionsState((prev) => {
      return collections.map((item) => {
        const existingItem = prev.find((p) => p.invoice_id === item.invoice_id)
        // Preserve review status if it was set
        if (existingItem && existingItem.payment_status === 'review') {
          return { ...item, payment_status: 'review' as const }
        }
        return item
      })
    })
  }, [collections])

  // Filter collections based on search and status
  const filteredCollections = collectionsState.filter((item) => {
    const matchesSearch =
      item.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.broker_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.load_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.batch_number?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || item.payment_status === statusFilter

    return matchesSearch && matchesStatus
  })

  const getPaymentStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      not_received: { bg: '#0891b2', text: '#FFFFFF', label: 'Not Received' },
      paid: { bg: '#64748b', text: '#FFFFFF', label: 'Paid' },
      review: { bg: '#0891b2', text: '#FFFFFF', label: 'Review' },
    }

    const config = statusConfig[status] || { bg: '#64748b', text: '#FFFFFF', label: status }

    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium capitalize"
        style={{ backgroundColor: config.bg, color: config.text }}
      >
        {config.label}
      </span>
    )
  }

  const getDaysBadge = (days: number) => {
    const isUrgent = days >= 20
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: isUrgent ? '#0891b2' : '#FFF9E6',
          color: isUrgent ? '#FFFFFF' : '#113543',
        }}
      >
        {days} days
      </span>
    )
  }

  const handleViewInvoiceDetail = (invoiceId: string) => {
    setSelectedInvoice(invoiceId)
    setShowInvoiceDetailModal(true)
  }

  const handleConfirmPayment = (item: ClientCollectionItem) => {
    // Update payment status to paid
    setCollectionsState((prev: ClientCollectionItem[]) =>
      prev.map((c) =>
        c.invoice_id === item.invoice_id
          ? { ...c, payment_status: 'paid' as const }
          : c
      )
    )
  }

  const handleAddNote = (invoiceId: string, note: string) => {
    // In a real app, this would make an API call to add the note
    // For now, we'll just update the mock invoice's notes_history
    const invoice = mockInvoices.find((inv) => inv.id === invoiceId)
    
    if (invoice) {
      const newNote = {
        id: `note-${Date.now()}`,
        note: note,
        created_by: data.client_name, // Use client name from dashboard data
        created_at: new Date().toISOString(),
        type: 'note' as const,
      }
      
      if (!invoice.notes_history) {
        invoice.notes_history = []
      }
      invoice.notes_history.push(newNote)
      
      // If invoice is 25+ days overdue, set status to review
      setCollectionsState((prev: ClientCollectionItem[]) => {
        const collectionItem = prev.find((c) => c.invoice_id === invoiceId)
        if (collectionItem && collectionItem.days_since_expected >= 25) {
          return prev.map((c) =>
            c.invoice_id === invoiceId
              ? { ...c, payment_status: 'review' as const }
              : c
          )
        }
        return prev
      })
    }
  }

  const handleConfirmPaymentFromModal = (invoiceId: string) => {
    const item = collectionsState.find((c) => c.invoice_id === invoiceId)
    if (item) {
      handleConfirmPayment(item)
    }
  }

  const handleMarkNotReceived = (invoiceId: string, note: string) => {
    // Add the note first
    const invoice = mockInvoices.find((inv) => inv.id === invoiceId)
    
    if (invoice) {
      const newNote = {
        id: `note-${Date.now()}`,
        note: note,
        created_by: data.client_name,
        created_at: new Date().toISOString(),
        type: 'note' as const,
      }
      
      if (!invoice.notes_history) {
        invoice.notes_history = []
      }
      invoice.notes_history.push(newNote)
    }
    
    // If invoice is 25+ days overdue, set status to review (prevents auto-closure)
    // Otherwise, set to not_received
    setCollectionsState((prev: ClientCollectionItem[]) => {
      const collectionItem = prev.find((c) => c.invoice_id === invoiceId)
      if (collectionItem && collectionItem.days_since_expected >= 25) {
        return prev.map((c) =>
          c.invoice_id === invoiceId
            ? { ...c, payment_status: 'review' as const }
            : c
        )
      } else {
        return prev.map((c) =>
          c.invoice_id === invoiceId
            ? { ...c, payment_status: 'not_received' as const }
            : c
        )
      }
    })
  }

  const totalOverdue = filteredCollections.reduce((sum, item) => sum + item.amount, 0)
  const urgentCount = filteredCollections.filter((item) => item.days_since_expected >= 25).length
  const urgentAmount = filteredCollections
    .filter((item) => item.days_since_expected >= 25)
    .reduce((sum, item) => sum + item.amount, 0)

  const selectedInvoiceData = selectedInvoice
    ? mockInvoices.find((inv) => inv.id === selectedInvoice)
    : null

  return (
    <>
      <style>{`
        @keyframes flashHighlight {
          0%, 100% { background-color: #FFF9E6; }
          50% { background-color: #FFE699; }
        }
      `}</style>
      <ClientLayout clientName={data.client_name} clientId={data.client_id}>
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>
              Collections
            </h2>
            <p style={{ color: '#64748b' }}>
              Track approved invoices awaiting payment
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white border rounded p-6" style={{ borderColor: '#e2e8f0' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm" style={{ color: '#64748b' }}>Total Awaiting Payment</div>
                <AlertCircle className="w-5 h-5" style={{ color: '#0891b2' }} />
              </div>
              <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                {formatCurrency(totalOverdue)}
              </div>
            </div>

            <div className="bg-white border rounded p-6" style={{ borderColor: '#e2e8f0' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm" style={{ color: '#64748b' }}>Urgent (20+ days)</div>
                <AlertCircle className="w-5 h-5" style={{ color: '#0891b2' }} />
              </div>
              <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                {urgentCount} invoices
              </div>
              <div className="text-sm mt-1" style={{ color: '#64748b' }}>
                {formatCurrency(urgentAmount)}
              </div>
            </div>

            <div className="bg-white border rounded p-6" style={{ borderColor: '#e2e8f0' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm" style={{ color: '#64748b' }}>Total Items</div>
                <AlertCircle className="w-5 h-5" style={{ color: '#64748b' }} />
              </div>
              <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                {filteredCollections.length}
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-white border rounded p-6 mb-6" style={{ borderColor: '#e2e8f0' }}>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4" style={{ color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="Search by invoice, broker, load, or batch..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border rounded focus:outline-none"
                  style={{
                    borderColor: '#e2e8f0',
                    color: '#113543',
                    backgroundColor: '#FFFFFF',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#0891b2'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#64748b'
                  }}
                />
              </div>
              <div className="flex items-center space-x-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm border rounded focus:outline-none"
                  style={{
                    borderColor: '#e2e8f0',
                    color: '#113543',
                    backgroundColor: '#FFFFFF',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#0891b2'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#64748b'
                  }}
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Payment Received</option>
                  <option value="not_received">Not Received</option>
                </select>
              </div>
            </div>
          </div>

          {/* Collections Table */}
          <div className="bg-white border rounded overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold" style={{ color: '#113543' }}>
                    Overdue Invoices
                  </h3>
                  <p className="text-sm mt-1" style={{ color: '#64748b' }}>
                    Invoices past expected payment date (Day +15). Invoices 25+ days require immediate action.
                  </p>
                </div>
              </div>

              {filteredCollections.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#64748b' }} />
                  <p className="text-lg font-medium mb-2" style={{ color: '#113543' }}>
                    No overdue invoices
                  </p>
                  <p className="text-sm" style={{ color: '#64748b' }}>
                    {searchTerm || statusFilter !== 'all'
                      ? 'Try adjusting your search or filters'
                      : 'No approved invoices awaiting payment'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b" style={{ borderColor: '#e2e8f0' }}>
                        <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Invoice#
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Broker
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Amount
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Expected Date
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Days Overdue
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Payment Status
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Broker Contacted
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCollections.map((item, index) => {
                        const isHighlighted = highlightedInvoiceId === item.invoice_id
                        const isUrgent = item.days_since_expected >= 25
                        const isCritical = item.days_since_expected >= 30
                        return (
                          <tr
                            key={item.invoice_id}
                            className={`border-b cursor-pointer transition-colors ${isHighlighted ? 'highlight-flash' : ''}`}
                            style={{
                              borderColor: '#e2e8f0',
                              backgroundColor: isHighlighted
                                ? '#FFF9E6'
                                : index % 2 === 0
                                ? '#f8f9fa'
                                : '#FFFFFF',
                              borderLeft: isUrgent 
                                ? isCritical 
                                  ? '4px solid #dc2626' 
                                  : '4px solid #0891b2' 
                                : 'none',
                              animation: isHighlighted ? 'flashHighlight 1.5s ease-in-out 3' : 'none',
                            }}
                            onMouseEnter={(e) => {
                              if (!isHighlighted) {
                                e.currentTarget.style.backgroundColor = '#f0f0f0'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isHighlighted) {
                                e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#f8f9fa' : '#FFFFFF'
                              } else {
                                e.currentTarget.style.backgroundColor = '#FFF9E6'
                              }
                            }}
                          >
                            <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                              {item.invoice_number}
                            </td>
                            <td className="py-3 px-4 text-sm" style={{ color: '#64748b' }}>
                              {item.broker_name}
                            </td>
                            <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                              {formatCurrency(item.amount)}
                            </td>
                            <td className="py-3 px-4 text-sm" style={{ color: '#64748b' }}>
                              {formatDate(item.expected_payment_date)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {item.days_since_expected > 0 ? (
                                getDaysBadge(item.days_since_expected)
                              ) : (
                                <span className="text-sm" style={{ color: '#64748b' }}>On time</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-sm">{getPaymentStatusBadge(item.payment_status)}</td>
                            <td className="py-3 px-4 text-center">
                              {item.broker_contacted ? (
                                <span className="text-sm" style={{ color: '#64748b' }}>✓ Yes</span>
                              ) : (
                                <span className="text-sm" style={{ color: '#64748b' }}>No</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleViewInvoiceDetail(item.invoice_id)
                                  }}
                                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                                  style={{ color: '#113543' }}
                                  title="View Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                {item.payment_status !== 'paid' && item.payment_status !== 'review' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleConfirmPayment(item)
                                    }}
                                    className="px-2 py-1 text-xs font-medium transition-colors"
                                    style={{
                                      backgroundColor: '#0891b2',
                                      color: '#FFFFFF',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#0a2529'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = '#0891b2'
                                    }}
                                    title="Confirm Payment Received"
                                  >
                                    <CheckCircle className="w-3 h-3 inline mr-1" />
                                    Received
                                  </button>
                                )}
                                {item.payment_status === 'review' && (
                                  <span className="text-xs font-medium" style={{ color: '#0891b2' }}>
                                    Under Review
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {showInvoiceDetailModal && selectedInvoiceData && (
          <CollectionsInvoiceModal
            invoice={selectedInvoiceData}
            paymentStatus={collectionsState.find((c) => c.invoice_id === selectedInvoice)?.payment_status || 'not_received'}
            onClose={() => {
              setShowInvoiceDetailModal(false)
              setSelectedInvoice(null)
            }}
            onAddNote={handleAddNote}
            onConfirmPayment={handleConfirmPaymentFromModal}
            onMarkNotReceived={handleMarkNotReceived}
          />
        )}
      </ClientLayout>
    </>
  )
}

