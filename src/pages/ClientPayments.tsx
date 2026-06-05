import { useState } from 'react'
import { mockClientDashboardData } from '../data/mockClientDashboard'
import { mockPayments } from '../data/mockPayments'
import { Payment } from '../types/payment'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/format'
import { DollarSign, Search, Filter, X, Eye, Calendar, CreditCard, CheckCircle } from 'lucide-react'
import ClientLayout from '../components/ClientLayout'

export default function ClientPayments() {
  const [data] = useState(mockClientDashboardData)

  // Filter payments for current client
  const clientPayments = mockPayments

  const [payments, setPayments] = useState<Payment[]>(clientPayments)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [methodFilter, setMethodFilter] = useState<string>('all')
  const [showPaymentDetailModal, setShowPaymentDetailModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [showConfirmPaymentModal, setShowConfirmPaymentModal] = useState(false)
  const [paymentToConfirm, setPaymentToConfirm] = useState<Payment | null>(null)
  const [confirmPaymentData, setConfirmPaymentData] = useState({
    payment_method: 'check' as 'check' | 'wire' | 'ach' | 'credit_card',
    payment_reference: '',
    received_date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  // Filter payments based on search, status, and method
  const filteredPayments = payments.filter((payment) => {
    const matchesSearch =
      payment.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.broker_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.load_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.batch_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.payment_reference?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter
    const matchesMethod = methodFilter === 'all' || payment.payment_method === methodFilter

    return matchesSearch && matchesStatus && matchesMethod
  })

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: '#64748b', text: '#FFFFFF', label: 'Pending' },
      confirmed: { bg: '#0891b2', text: '#FFFFFF', label: 'Confirmed' },
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

  const getMethodBadge = (method: string) => {
    const methodLabels: Record<string, string> = {
      check: 'Check',
      wire: 'Wire Transfer',
      ach: 'ACH',
      credit_card: 'Credit Card',
    }

    return (
      <span className="text-sm" style={{ color: '#113543' }}>
        {methodLabels[method] || method}
      </span>
    )
  }

  const handleViewPaymentDetail = (payment: Payment) => {
    setSelectedPayment(payment)
    setShowPaymentDetailModal(true)
  }

  const handleConfirmPayment = (payment: Payment) => {
    setPaymentToConfirm(payment)
    setConfirmPaymentData({
      payment_method: payment.payment_method || 'check',
      payment_reference: payment.payment_reference || '',
      received_date: payment.received_date || new Date().toISOString().split('T')[0],
      notes: payment.notes || '',
    })
    setShowConfirmPaymentModal(true)
  }

  const handleConfirmPaymentSubmit = () => {
    if (!paymentToConfirm) return

    // Update payment status to confirmed
    setPayments((prev) =>
      prev.map((p) =>
        p.id === paymentToConfirm.id
          ? {
              ...p,
              status: 'confirmed',
              payment_method: confirmPaymentData.payment_method,
              payment_reference: confirmPaymentData.payment_reference || p.payment_reference,
              received_date: confirmPaymentData.received_date,
              notes: confirmPaymentData.notes || p.notes,
            }
          : p
      )
    )

    setShowConfirmPaymentModal(false)
    setPaymentToConfirm(null)
    setConfirmPaymentData({
      payment_method: 'check',
      payment_reference: '',
      received_date: new Date().toISOString().split('T')[0],
      notes: '',
    })
  }

  // Calculate summary statistics
  const totalPaid = filteredPayments
    .filter((p) => p.status === 'confirmed')
    .reduce((sum, p) => sum + p.amount, 0)

  const pendingPayments = filteredPayments.filter((p) => p.status === 'pending').length
  const pendingAmount = filteredPayments
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0)

  const thisMonth = new Date().getMonth()
  const thisYear = new Date().getFullYear()
  const thisMonthPaid = filteredPayments
    .filter((p) => {
      const paymentDate = new Date(p.payment_date)
      return (
        paymentDate.getMonth() === thisMonth &&
        paymentDate.getFullYear() === thisYear &&
        p.status === 'confirmed'
      )
    })
    .reduce((sum, p) => sum + p.amount, 0)

  return (
    <ClientLayout clientName={data.client_name} clientId={data.client_id}>
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>
            Payments
          </h2>
          <p style={{ color: '#64748b' }}>View payment history and track payment status</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border rounded p-4" style={{ borderColor: '#e2e8f0' }}>
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="w-4 h-4" style={{ color: '#0891b2' }} />
              <span className="text-sm" style={{ color: '#64748b' }}>
                Total Paid
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color: '#113543' }}>
              {formatCurrency(totalPaid)}
            </div>
          </div>
          <div className="bg-white border rounded p-4" style={{ borderColor: '#e2e8f0' }}>
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="w-4 h-4" style={{ color: '#0891b2' }} />
              <span className="text-sm" style={{ color: '#64748b' }}>
                Pending Payments
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color: '#113543' }}>
              {pendingPayments}
            </div>
            <div className="text-xs mt-1" style={{ color: '#64748b' }}>
              {formatCurrency(pendingAmount)}
            </div>
          </div>
          <div className="bg-white border rounded p-4" style={{ borderColor: '#e2e8f0' }}>
            <div className="flex items-center space-x-2 mb-2">
              <Calendar className="w-4 h-4" style={{ color: '#0891b2' }} />
              <span className="text-sm" style={{ color: '#64748b' }}>
                This Month
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color: '#113543' }}>
              {formatCurrency(thisMonthPaid)}
            </div>
          </div>
          <div className="bg-white border rounded p-4" style={{ borderColor: '#e2e8f0' }}>
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="w-4 h-4" style={{ color: '#0891b2' }} />
              <span className="text-sm" style={{ color: '#64748b' }}>
                Total Payments
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color: '#113543' }}>
              {filteredPayments.length}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border rounded mb-6 p-4" style={{ borderColor: '#e2e8f0' }}>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: '#64748b' }} />
              <input
                type="text"
                placeholder="Search by invoice number, broker, load number, batch, or reference..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border rounded focus:outline-none"
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
              <Filter className="w-4 h-4" style={{ color: '#64748b' }} />
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
                <option value="confirmed">Confirmed</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <CreditCard className="w-4 h-4" style={{ color: '#64748b' }} />
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
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
                <option value="all">All Methods</option>
                <option value="check">Check</option>
                <option value="wire">Wire Transfer</option>
                <option value="ach">ACH</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>
          </div>
        </div>

        {/* Payments Table */}
        <div className="bg-white border rounded overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ backgroundColor: '#f8f9fa' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#113543' }}>
                    Invoice #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#113543' }}>
                    Broker
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#113543' }}>
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#113543' }}>
                    Payment Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#113543' }}>
                    Received Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#113543' }}>
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#113543' }}>
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#113543' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: '#e2e8f0' }}>
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-sm" style={{ color: '#64748b' }}>
                      No payments found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="hover:bg-gray-50 transition-colors"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f8f9fa'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#FFFFFF'
                      }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" style={{ color: '#113543' }}>
                        {payment.invoice_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: '#113543' }}>
                        {payment.broker_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" style={{ color: '#113543' }}>
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: '#64748b' }}>
                        {formatDate(payment.payment_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: '#64748b' }}>
                        {formatDate(payment.received_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: '#113543' }}>
                        {getMethodBadge(payment.payment_method)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(payment.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleViewPaymentDetail(payment)}
                            className="flex items-center space-x-1 px-3 py-1 rounded transition-colors"
                            style={{
                              color: '#113543',
                              border: '1px solid #e2e8f0',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f8f9fa'
                              e.currentTarget.style.borderColor = '#0891b2'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#FFFFFF'
                              e.currentTarget.style.borderColor = '#64748b'
                            }}
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>
                          {payment.status === 'pending' && (
                            <button
                              onClick={() => handleConfirmPayment(payment)}
                              className="flex items-center space-x-1 px-3 py-1 rounded transition-colors"
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
                            >
                              <CheckCircle className="w-3 h-3" />
                              <span>Confirm</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Confirm Payment Modal */}
      {showConfirmPaymentModal && paymentToConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: '#e2e8f0' }}>
              <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                Confirm Payment Received
              </h3>
              <button
                onClick={() => {
                  setShowConfirmPaymentModal(false)
                  setPaymentToConfirm(null)
                }}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
                style={{ color: '#113543' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 rounded" style={{ backgroundColor: '#f8f9fa' }}>
                <p className="text-sm" style={{ color: '#64748b' }}>Invoice Number</p>
                <p className="text-sm font-semibold mt-1" style={{ color: '#113543' }}>
                  {paymentToConfirm.invoice_number}
                </p>
                <p className="text-sm mt-2" style={{ color: '#64748b' }}>Amount</p>
                <p className="text-sm font-semibold mt-1" style={{ color: '#113543' }}>
                  {formatCurrency(paymentToConfirm.amount)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                  Payment Method *
                </label>
                <select
                  value={confirmPaymentData.payment_method}
                  onChange={(e) =>
                    setConfirmPaymentData({
                      ...confirmPaymentData,
                      payment_method: e.target.value as 'check' | 'wire' | 'ach' | 'credit_card',
                    })
                  }
                  className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
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
                  <option value="check">Check</option>
                  <option value="wire">Wire Transfer</option>
                  <option value="ach">ACH</option>
                  <option value="credit_card">Credit Card</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                  Payment Reference (Check #, Transaction ID, etc.)
                </label>
                <input
                  type="text"
                  value={confirmPaymentData.payment_reference}
                  onChange={(e) =>
                    setConfirmPaymentData({ ...confirmPaymentData, payment_reference: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
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
                  placeholder="Enter payment reference"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                  Received Date *
                </label>
                <input
                  type="date"
                  value={confirmPaymentData.received_date}
                  onChange={(e) =>
                    setConfirmPaymentData({ ...confirmPaymentData, received_date: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
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

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                  Notes (Optional)
                </label>
                <textarea
                  value={confirmPaymentData.notes}
                  onChange={(e) => setConfirmPaymentData({ ...confirmPaymentData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
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
                  placeholder="Add any additional notes about this payment"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t" style={{ borderColor: '#e2e8f0' }}>
                <button
                  onClick={() => {
                    setShowConfirmPaymentModal(false)
                    setPaymentToConfirm(null)
                  }}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    color: '#113543',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#FFFFFF',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8f9fa'
                    e.currentTarget.style.borderColor = '#0891b2'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF'
                    e.currentTarget.style.borderColor = '#64748b'
                  }}
                  >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPaymentSubmit}
                  className="px-4 py-2 text-sm font-medium transition-colors"
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
                >
                  <CheckCircle className="w-4 h-4 inline mr-1" />
                  Confirm Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Detail Modal */}
      {showPaymentDetailModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: '#e2e8f0' }}>
              <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                Payment Details
              </h3>
              <button
                onClick={() => {
                  setShowPaymentDetailModal(false)
                  setSelectedPayment(null)
                }}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
                style={{ color: '#113543' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium" style={{ color: '#64748b' }}>
                    Invoice Number
                  </label>
                  <p className="text-sm mt-1" style={{ color: '#113543' }}>
                    {selectedPayment.invoice_number}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: '#64748b' }}>
                    Broker Name
                  </label>
                  <p className="text-sm mt-1" style={{ color: '#113543' }}>
                    {selectedPayment.broker_name}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: '#64748b' }}>
                    Amount
                  </label>
                  <p className="text-sm mt-1 font-semibold" style={{ color: '#113543' }}>
                    {formatCurrency(selectedPayment.amount)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: '#64748b' }}>
                    Status
                  </label>
                  <div className="mt-1">
                    {getStatusBadge(selectedPayment.status)}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: '#64748b' }}>
                    Payment Date
                  </label>
                  <p className="text-sm mt-1" style={{ color: '#113543' }}>
                    {formatDate(selectedPayment.payment_date)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: '#64748b' }}>
                    Received Date
                  </label>
                  <p className="text-sm mt-1" style={{ color: '#113543' }}>
                    {formatDate(selectedPayment.received_date)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: '#64748b' }}>
                    Payment Method
                  </label>
                  <p className="text-sm mt-1" style={{ color: '#113543' }}>
                    {getMethodBadge(selectedPayment.payment_method)}
                  </p>
                </div>
                {selectedPayment.payment_reference && (
                  <div>
                    <label className="text-sm font-medium" style={{ color: '#64748b' }}>
                      Payment Reference
                    </label>
                    <p className="text-sm mt-1" style={{ color: '#113543' }}>
                      {selectedPayment.payment_reference}
                    </p>
                  </div>
                )}
                {selectedPayment.load_number && (
                  <div>
                    <label className="text-sm font-medium" style={{ color: '#64748b' }}>
                      Load Number
                    </label>
                    <p className="text-sm mt-1" style={{ color: '#113543' }}>
                      {selectedPayment.load_number}
                    </p>
                  </div>
                )}
                {selectedPayment.batch_number && (
                  <div>
                    <label className="text-sm font-medium" style={{ color: '#64748b' }}>
                      Batch Number
                    </label>
                    <p className="text-sm mt-1" style={{ color: '#113543' }}>
                      {selectedPayment.batch_number}
                    </p>
                  </div>
                )}
              </div>

              {selectedPayment.notes && (
                <div>
                  <label className="text-sm font-medium" style={{ color: '#64748b' }}>
                    Notes
                  </label>
                  <p className="text-sm mt-1 p-3 rounded" style={{ color: '#113543', backgroundColor: '#f8f9fa' }}>
                    {selectedPayment.notes}
                  </p>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t" style={{ borderColor: '#e2e8f0' }}>
                <button
                  onClick={() => {
                    setShowPaymentDetailModal(false)
                    setSelectedPayment(null)
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
        </div>
      )}
    </ClientLayout>
  )
}

