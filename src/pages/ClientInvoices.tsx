import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mockClientDashboardData } from '../data/mockClientDashboard'
import { mockInvoices } from '../data/mockInvoices'
import { Invoice } from '../types/invoice'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/format'
import { FileText, Eye, Search, Filter, X } from 'lucide-react'
import DocumentViewer from '../components/DocumentViewer'
import ClientHeader from '../components/ClientHeader'

export default function ClientInvoices() {
  const [data] = useState(mockClientDashboardData)
  const [searchParams, setSearchParams] = useSearchParams()
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null)

  // Filter invoices for current client
  const clientInvoices = mockInvoices.filter(
    (inv) => inv.client_id === data.client_id || inv.client_name === data.client_name
  )

  const [invoices] = useState<Invoice[]>(clientInvoices)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showInvoiceDetailModal, setShowInvoiceDetailModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showDocumentViewer, setShowDocumentViewer] = useState(false)
  const [viewingInvoiceDocuments, setViewingInvoiceDocuments] = useState<Invoice | null>(null)

  const navItems = [
    { label: 'Dashboard', path: '/client/dashboard' },
    { label: 'Batches', path: '/client/batches' },
    { label: 'Invoices', path: '/client/invoices' },
    { label: 'Payments', path: '/client/payments' },
    { label: 'Collections', path: '/client/collections' },
    { label: 'Reports', path: '/client/reports' },
    { label: 'Settings', path: '/client/settings' },
  ]

  // Filter invoices based on search and status
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.broker_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.load_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.batch_number?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: '#C2A558', text: '#FFFFFF', label: 'Pending' },
      approved: { bg: '#819291', text: '#FFFFFF', label: 'Approved' },
      hold: { bg: '#C2A558', text: '#FFFFFF', label: 'On Hold' },
      paid: { bg: '#819291', text: '#FFFFFF', label: 'Paid' },
    }

    const config = statusConfig[status] || { bg: '#819291', text: '#FFFFFF', label: status }

    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium capitalize"
        style={{ backgroundColor: config.bg, color: config.text }}
      >
        {config.label}
      </span>
    )
  }

  const handleViewInvoiceDetail = (invoice: Invoice) => {
    setSelectedInvoice(invoice)
    setShowInvoiceDetailModal(true)
  }

  const handleViewDocuments = (invoice: Invoice) => {
    setViewingInvoiceDocuments(invoice)
    setShowDocumentViewer(true)
  }

  // Convert invoice to document format for DocumentViewer
  const getDocumentsForInvoice = (invoice: Invoice) => {
    if (!invoice || !invoice.documents_count) return []
    
    // Generate mock documents based on count
    return Array.from({ length: invoice.documents_count || 0 }).map((_, idx) => ({
      id: `doc-${invoice.id}-${idx}`,
      name: `Document ${idx + 1}.pdf`,
      type: 'application/pdf',
      size: 1024 * 500, // Mock size
    }))
  }

  const totalAmount = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0)
  const pendingAmount = filteredInvoices
    .filter((inv) => inv.status === 'pending' || inv.status === 'hold')
    .reduce((sum, inv) => sum + inv.amount, 0)

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

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      <ClientHeader clientName={data.client_name} navItems={navItems} />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>
            Invoices
          </h2>
          <p style={{ color: '#819291' }}>View and manage your invoices</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border rounded p-4" style={{ borderColor: '#819291' }}>
            <div className="flex items-center space-x-2 mb-2">
              <FileText className="w-4 h-4" style={{ color: '#C2A558' }} />
              <span className="text-sm" style={{ color: '#819291' }}>
                Total Invoices
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color: '#113543' }}>
              {filteredInvoices.length}
            </div>
          </div>
          <div className="bg-white border rounded p-4" style={{ borderColor: '#819291' }}>
            <div className="flex items-center space-x-2 mb-2">
              <FileText className="w-4 h-4" style={{ color: '#C2A558' }} />
              <span className="text-sm" style={{ color: '#819291' }}>
                Total Amount
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color: '#113543' }}>
              {formatCurrency(totalAmount)}
            </div>
          </div>
          <div className="bg-white border rounded p-4" style={{ borderColor: '#819291' }}>
            <div className="flex items-center space-x-2 mb-2">
              <FileText className="w-4 h-4" style={{ color: '#C2A558' }} />
              <span className="text-sm" style={{ color: '#819291' }}>
                Pending Amount
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color: '#113543' }}>
              {formatCurrency(pendingAmount)}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border rounded mb-6 p-4" style={{ borderColor: '#819291' }}>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: '#819291' }} />
              <input
                type="text"
                placeholder="Search by invoice number, broker, load number, or batch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border rounded focus:outline-none"
                style={{
                  borderColor: '#819291',
                  color: '#113543',
                  backgroundColor: '#FFFFFF',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C2A558'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#819291'
                }}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4" style={{ color: '#819291' }} />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border rounded focus:outline-none"
                style={{
                  borderColor: '#819291',
                  color: '#113543',
                  backgroundColor: '#FFFFFF',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C2A558'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#819291'
                }}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="hold">On Hold</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="bg-white border rounded" style={{ borderColor: '#819291' }}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold" style={{ color: '#113543' }}>
                  All Invoices
                </h3>
                <p className="text-sm mt-1" style={{ color: '#819291' }}>
                  {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''} found
                </p>
              </div>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: '#819291' }} />
                <p className="text-lg font-medium mb-2" style={{ color: '#113543' }}>
                  No invoices found
                </p>
                <p className="text-sm" style={{ color: '#819291' }}>
                  {searchTerm || statusFilter !== 'all'
                    ? 'Try adjusting your search or filters'
                    : 'Your invoices will appear here'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b" style={{ borderColor: '#819291' }}>
                      <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                        Invoice#
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                        Load#
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                        Broker
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                        Batch#
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                        Amount
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                        Invoice Date
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                        Status
                      </th>
                      <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((invoice, index) => {
                      const isHighlighted = highlightedInvoiceId === invoice.id
                      return (
                      <tr
                        key={invoice.id}
                        className={`border-b cursor-pointer transition-colors ${isHighlighted ? 'highlight-flash' : ''}`}
                        style={{
                          borderColor: '#819291',
                          backgroundColor: isHighlighted 
                            ? '#FFF9E6' 
                            : index % 2 === 0 ? '#f8f9fa' 
                            : '#FFFFFF',
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
                          {invoice.invoice_number}
                        </td>
                        <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                          {invoice.load_number || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                          {invoice.broker_name}
                        </td>
                        <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                          {invoice.batch_number || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                          {formatCurrency(invoice.amount)}
                        </td>
                        <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                          {formatDate(invoice.invoice_date)}
                        </td>
                        <td className="py-3 px-4 text-sm">{getStatusBadge(invoice.status)}</td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleViewInvoiceDetail(invoice)
                              }}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              style={{ color: '#113543' }}
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {(invoice.documents_count || 0) > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleViewDocuments(invoice)
                                }}
                                className="p-1 hover:bg-gray-100 rounded transition-colors"
                                style={{ color: '#113543' }}
                                title="View Documents"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
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
      </main>

      {/* Invoice Detail Modal */}
      {showInvoiceDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10"
              style={{ borderColor: '#819291' }}
            >
              <div>
                <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                  Invoice Details
                </h3>
                <p className="text-sm mt-1" style={{ color: '#819291' }}>
                  {selectedInvoice.invoice_number}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowInvoiceDetailModal(false)
                  setSelectedInvoice(null)
                }}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
                style={{ color: '#113543' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {/* Invoice Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="border p-4 rounded" style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}>
                  <div className="text-sm mb-1" style={{ color: '#819291' }}>
                    Amount
                  </div>
                  <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                    {formatCurrency(selectedInvoice.amount)}
                  </div>
                </div>
                <div className="border p-4 rounded" style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}>
                  <div className="text-sm mb-1" style={{ color: '#819291' }}>
                    Invoice Date
                  </div>
                  <div className="text-lg font-medium" style={{ color: '#113543' }}>
                    {formatDate(selectedInvoice.invoice_date)}
                  </div>
                </div>
                <div className="border p-4 rounded" style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}>
                  <div className="text-sm mb-1" style={{ color: '#819291' }}>
                    Status
                  </div>
                  <div className="mt-1">{getStatusBadge(selectedInvoice.status)}</div>
                </div>
              </div>

              {/* Invoice Information */}
              <div className="space-y-4 mb-6">
                <div className="border p-4 rounded" style={{ borderColor: '#819291' }}>
                  <h4 className="text-sm font-semibold mb-3" style={{ color: '#113543' }}>
                    Invoice Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium" style={{ color: '#819291' }}>
                        Invoice Number:
                      </span>
                      <span className="ml-2" style={{ color: '#113543' }}>
                        {selectedInvoice.invoice_number}
                      </span>
                    </div>
                    {selectedInvoice.load_number && (
                      <div>
                        <span className="font-medium" style={{ color: '#819291' }}>
                          Load Number:
                        </span>
                        <span className="ml-2" style={{ color: '#113543' }}>
                          {selectedInvoice.load_number}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="font-medium" style={{ color: '#819291' }}>
                        Broker:
                      </span>
                      <span className="ml-2" style={{ color: '#113543' }}>
                        {selectedInvoice.broker_name}
                      </span>
                    </div>
                    {selectedInvoice.batch_number && (
                      <div>
                        <span className="font-medium" style={{ color: '#819291' }}>
                          Batch Number:
                        </span>
                        <span className="ml-2" style={{ color: '#113543' }}>
                          {selectedInvoice.batch_number}
                        </span>
                      </div>
                    )}
                    {selectedInvoice.due_date && (
                      <div>
                        <span className="font-medium" style={{ color: '#819291' }}>
                          Due Date:
                        </span>
                        <span className="ml-2" style={{ color: '#113543' }}>
                          {formatDate(selectedInvoice.due_date)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {selectedInvoice.notes && (
                  <div className="border p-4 rounded" style={{ borderColor: '#819291' }}>
                    <h4 className="text-sm font-semibold mb-2" style={{ color: '#113543' }}>
                      Notes
                    </h4>
                    <p className="text-sm" style={{ color: '#113543' }}>
                      {selectedInvoice.notes}
                    </p>
                  </div>
                )}

                {selectedInvoice.hold_reason && (
                  <div className="border p-4 rounded" style={{ borderColor: '#819291' }}>
                    <h4 className="text-sm font-semibold mb-2" style={{ color: '#113543' }}>
                      Hold Reason
                    </h4>
                    <p className="text-sm" style={{ color: '#113543' }}>
                      {selectedInvoice.hold_reason}
                    </p>
                  </div>
                )}

                {/* Documents Section */}
                {(selectedInvoice.documents_count || 0) > 0 && (
                  <div className="border p-4 rounded" style={{ borderColor: '#819291' }}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold" style={{ color: '#113543' }}>
                        Documents ({selectedInvoice.documents_count})
                      </h4>
                      <button
                        onClick={() => {
                          setShowInvoiceDetailModal(false)
                          handleViewDocuments(selectedInvoice)
                        }}
                        className="px-3 py-1 text-xs font-medium rounded transition-colors"
                        style={{
                          color: '#113543',
                          border: '1px solid #819291',
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
                        <Eye className="w-3 h-3 inline mr-1" />
                        View All
                      </button>
                    </div>
                  </div>
                )}

                {/* Document Send History */}
                <div className="border p-4 rounded" style={{ borderColor: '#819291' }}>
                  <h4 className="text-sm font-semibold mb-3" style={{ color: '#113543' }}>
                    Document Send History
                  </h4>
                  {selectedInvoice.document_send_history && selectedInvoice.document_send_history.length > 0 ? (
                    <div className="space-y-3">
                      {selectedInvoice.document_send_history.map((send, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded"
                          style={{ backgroundColor: '#f8f9fa' }}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="text-sm font-medium mb-1" style={{ color: '#113543' }}>
                                Sent to: {send.email_address}
                              </div>
                              <div className="text-xs" style={{ color: '#819291' }}>
                                Sent on: {formatDate(send.sent_at)}
                              </div>
                              {send.sent_by && (
                                <div className="text-xs mt-1" style={{ color: '#819291' }}>
                                  Sent by: {send.sent_by}
                                </div>
                              )}
                            </div>
                            {send.status && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded"
                                style={{
                                  backgroundColor: send.status === 'delivered' ? '#819291' : send.status === 'failed' ? '#dc2626' : '#C2A558',
                                  color: '#FFFFFF',
                                }}
                              >
                                {send.status}
                              </span>
                            )}
                          </div>
                          {send.documents_sent && send.documents_sent.length > 0 && (
                            <div className="mt-2 text-xs" style={{ color: '#819291' }}>
                              Documents: {send.documents_sent.join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm" style={{ color: '#819291' }}>
                        No documents have been sent yet
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className="flex items-center justify-end space-x-3 p-6 border-t"
              style={{ borderColor: '#819291' }}
            >
              {(selectedInvoice.documents_count || 0) > 0 && (
                <button
                  onClick={() => {
                    setShowInvoiceDetailModal(false)
                    handleViewDocuments(selectedInvoice)
                  }}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    color: '#113543',
                    border: '1px solid #819291',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8f9fa'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF'
                  }}
                >
                  <Eye className="w-4 h-4 inline mr-2" />
                  View Documents
                </button>
              )}
              <button
                onClick={() => {
                  setShowInvoiceDetailModal(false)
                  setSelectedInvoice(null)
                }}
                className="px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: '#113543',
                  color: '#FFFFFF',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#0d2a35'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#113543'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer */}
      {showDocumentViewer && viewingInvoiceDocuments && (
        <DocumentViewer
          isOpen={showDocumentViewer}
          onClose={() => {
            setShowDocumentViewer(false)
            setViewingInvoiceDocuments(null)
          }}
          documents={getDocumentsForInvoice(viewingInvoiceDocuments)}
          invoiceNumber={viewingInvoiceDocuments.invoice_number}
          title="View Documents"
        />
      )}
    </div>
  )
}

