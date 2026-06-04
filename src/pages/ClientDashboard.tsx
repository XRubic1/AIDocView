import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { mockClientDashboardData } from '../data/mockClientDashboard'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/format'
import {
  DollarSign,
  FileText,
  Clock,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Upload,
  Plus,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react'
import ClientHeader from '../components/ClientHeader'
import SimpleUploadModal from '../components/client/SimpleUploadModal'
import BatchStatusWidget from '../components/client/BatchStatusWidget'
import AgingARChart from '../components/client/AgingARChart'
import PaymentTrendsChart from '../components/client/PaymentTrendsChart'

export default function ClientDashboard() {
  const [data] = useState(mockClientDashboardData)
  const navigate = useNavigate()
  const [showSimpleUpload, setShowSimpleUpload] = useState(false)

  // Get invoices waiting payment confirmation (approved invoices) for this client
  const invoicesWaitingPayment = useMemo(() => {
    const clientInvoices = mockInvoices.filter(
      (inv) => inv.client_id === data.client_id && inv.status === 'approved'
    )

    return clientInvoices.map((invoice) => {
      // Calculate days overdue from due_date
      const dueDate = new Date(invoice.due_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      dueDate.setHours(0, 0, 0, 0)
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      
      // Warning threshold: 60+ days overdue (approaching force close)
      const isApproachingForceClose = daysOverdue >= 60

      return {
        ...invoice,
        daysOverdue: daysOverdue > 0 ? daysOverdue : 0,
        isApproachingForceClose,
      }
    }).sort((a, b) => {
      // Sort by: approaching force close first, then by days overdue
      if (a.isApproachingForceClose !== b.isApproachingForceClose) {
        return a.isApproachingForceClose ? -1 : 1
      }
      return b.daysOverdue - a.daysOverdue
    })
  }, [data.client_id])

  // Get all payments for this client (for trends chart)
  const clientPayments = useMemo(() => {
    // Get client invoice IDs to match with payments
    const clientInvoiceIds = new Set(
      mockInvoices
        .filter((inv) => inv.client_id === data.client_id)
        .map((inv) => inv.id)
    )

    return mockPayments.filter((payment) => clientInvoiceIds.has(payment.invoice_id))
  }, [data.client_id])

  // Get recent payments for this client
  const recentPayments = useMemo(() => {
    return clientPayments
      .sort((a, b) => {
        // Sort by received_date (most recent first)
        return new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
      })
      .slice(0, 5) // Show only the 5 most recent payments
  }, [clientPayments])

  const handleSimpleUploadComplete = (files: File[]) => {
    navigate(`/client/batches?tab=create&mode=ai`, {
      state: { initialFiles: files },
    })
  }

  const navItems = [
    { label: 'Dashboard', path: '/client/dashboard' },
    { label: 'Batches', path: '/client/batches' },
    { label: 'Invoices', path: '/client/invoices' },
    { label: 'Payments', path: '/client/payments' },
    { label: 'Collections', path: '/client/collections' },
    { label: 'Reports', path: '/client/reports' },
    { label: 'Settings', path: '/client/settings' },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      <ClientHeader clientName={data.client_name} navItems={navItems} />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Quick Upload Section - Prominent */}
        <div className="mb-8 bg-gradient-to-r rounded-lg p-8 border-2" style={{ 
          background: 'linear-gradient(135deg, #F5F5F5 0%, #FFFFFF 100%)',
          borderColor: '#C2A558',
        }}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <h3 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>
                Upload Your Load Documents
              </h3>
              <p className="text-base mb-4" style={{ color: '#819291' }}>
                Simply drag and drop your POD, BOL, and rate confirmations. We'll handle the rest.
              </p>
              <div className="flex flex-wrap gap-3 text-sm" style={{ color: '#819291' }}>
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" style={{ color: '#C2A558' }} />
                  Drag & drop files
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" style={{ color: '#C2A558' }} />
                  Auto-invoice creation
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" style={{ color: '#C2A558' }} />
                  Fast processing
                </span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowSimpleUpload(true)}
                className="flex items-center justify-center space-x-2 px-8 py-4 text-lg font-medium text-white rounded-lg transition-all shadow-lg"
                style={{ backgroundColor: '#113543' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#0a2529'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#113543'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <Upload className="w-5 h-5" />
                <span>Upload Documents</span>
              </button>
              <button
                onClick={() => navigate('/client/batches?tab=create')}
                className="flex items-center justify-center space-x-2 px-6 py-4 text-lg font-medium rounded-lg border-2 transition-all"
                style={{ 
                  color: '#113543',
                  borderColor: '#113543',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F5F5F5'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <Plus className="w-5 h-5" />
                <span>Create Batch</span>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Summary Cards with Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Summary Cards - 3 columns */}
            <div className="lg:col-span-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white border p-6 rounded" style={{ borderColor: '#819291' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm" style={{ color: '#819291' }}>Total A/R</div>
                <DollarSign className="w-5 h-5" style={{ color: '#C2A558' }} />
              </div>
              <div className="text-2xl font-bold" style={{ color: '#113543' }}>{formatCurrency(data.summary.total_ar)}</div>
            </div>

            <div className="bg-white border p-6 rounded" style={{ borderColor: '#819291' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm" style={{ color: '#819291' }}>Pending Invoices</div>
                <Clock className="w-5 h-5" style={{ color: '#C2A558' }} />
              </div>
              <div className="text-2xl font-bold" style={{ color: '#113543' }}>{data.summary.pending_invoices}</div>
            </div>

            <div className="bg-white border p-6 rounded" style={{ borderColor: '#819291' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm" style={{ color: '#819291' }}>Approved Invoices</div>
                <CheckCircle className="w-5 h-5" style={{ color: '#C2A558' }} />
              </div>
              <div className="text-2xl font-bold" style={{ color: '#113543' }}>{data.summary.approved_invoices}</div>
            </div>

            <div className="bg-white border p-6 rounded" style={{ borderColor: '#819291' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm" style={{ color: '#819291' }}>On Hold</div>
                <AlertCircle className="w-5 h-5" style={{ color: '#C2A558' }} />
              </div>
              <div className="text-2xl font-bold" style={{ color: '#113543' }}>{data.summary.on_hold_invoices}</div>
            </div>

            <div className="bg-white border p-6 rounded" style={{ borderColor: '#819291' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm" style={{ color: '#819291' }}>Paid This Month</div>
                <TrendingUp className="w-5 h-5" style={{ color: '#C2A558' }} />
              </div>
              <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                {formatCurrency(data.summary.paid_this_month)}
              </div>
            </div>

            <div className="bg-white border p-6 rounded" style={{ borderColor: '#819291' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm" style={{ color: '#819291' }}>Overdue Invoices</div>
                <FileText className="w-5 h-5" style={{ color: '#C2A558' }} />
              </div>
              <div className="text-2xl font-bold" style={{ color: '#113543' }}>{data.summary.overdue_invoices}</div>
            </div>
              </div>
            </div>

            {/* Status Overview Widget - Right side */}
            <div className="lg:col-span-1">
              <BatchStatusWidget clientId={data.client_id} />
            </div>
          </div>

          {/* Charts Row - Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Aging A/R Chart */}
            <AgingARChart aging={data.aging_ar} />

            {/* Payment Trends Chart */}
            <PaymentTrendsChart payments={clientPayments} />
          </div>

          {/* Tables Row - Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Invoices Waiting Payment Confirmation */}
            <div className="bg-white border rounded" style={{ borderColor: '#819291' }}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold" style={{ color: '#113543' }}>
                    Invoices Waiting Payment Confirmation
                  </h3>
                  {invoicesWaitingPayment.length > 0 && (
                    <button 
                      onClick={() => navigate('/client/invoices?status=approved')}
                      className="flex items-center space-x-1 text-sm transition-colors"
                      style={{ color: '#819291' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#113543'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#819291'}
                    >
                      <span>View All</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {invoicesWaitingPayment.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 mx-auto mb-2" style={{ color: '#C2A558' }} />
                    <p className="text-sm" style={{ color: '#819291' }}>
                      No invoices waiting payment confirmation
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
                            Broker
                          </th>
                          <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Amount
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Due Date
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Days Overdue
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoicesWaitingPayment.slice(0, 4).map((invoice, index) => (
                          <tr
                            key={invoice.id}
                            className="border-b"
                            style={{
                              borderColor: '#819291',
                              backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                              borderLeft: invoice.isApproachingForceClose ? '4px solid #dc2626' : undefined,
                            }}
                          >
                            <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                              {invoice.invoice_number}
                            </td>
                            <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                              {invoice.broker_name}
                            </td>
                            <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                              {formatCurrency(invoice.amount)}
                            </td>
                            <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                              {formatDate(invoice.due_date)}
                            </td>
                            <td className="py-3 px-4 text-sm">
                              {invoice.daysOverdue > 0 ? (
                                <span
                                  className="font-medium"
                                  style={{
                                    color: invoice.isApproachingForceClose ? '#dc2626' : '#819291',
                                  }}
                                >
                                  {invoice.daysOverdue}
                                </span>
                              ) : (
                                <span style={{ color: '#819291' }}>—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-sm">
                              {invoice.isApproachingForceClose ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded"
                                  style={{ backgroundColor: '#dc2626', color: '#FFFFFF' }}>
                                  <AlertTriangle className="w-3 h-3" />
                                  Force Close Warning
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium capitalize"
                                  style={{ backgroundColor: '#819291', color: '#FFFFFF' }}>
                                  Waiting Payment
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {invoicesWaitingPayment.length > 4 && (
                          <tr>
                            <td colSpan={6} className="py-3 px-4 text-center text-sm font-medium" style={{ color: '#113543' }}>
                              +{invoicesWaitingPayment.length - 4} more invoice{invoicesWaitingPayment.length - 4 !== 1 ? 's' : ''}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Payments */}
            <div className="bg-white border rounded" style={{ borderColor: '#819291' }}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold" style={{ color: '#113543' }}>Recent Payments</h3>
                  <button 
                    onClick={() => navigate('/client/payments')}
                    className="flex items-center space-x-1 text-sm transition-colors"
                    style={{ color: '#819291' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#113543'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#819291'}
                  >
                    <span>View All</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                {recentPayments.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 mx-auto mb-2" style={{ color: '#C2A558' }} />
                    <p className="text-sm" style={{ color: '#819291' }}>
                      No payments received yet
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
                            Broker
                          </th>
                          <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Amount
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Payment Method
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Received Date
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentPayments.map((payment, index) => (
                          <tr
                            key={payment.id}
                            className="border-b"
                            style={{ 
                              borderColor: '#819291',
                              backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF'
                            }}
                          >
                            <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                              {payment.invoice_number}
                            </td>
                            <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                              {payment.broker_name}
                            </td>
                            <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                              {formatCurrency(payment.amount)}
                            </td>
                            <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                              <span className="capitalize">{payment.payment_method}</span>
                            </td>
                            <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                              {formatDate(payment.received_date)}
                            </td>
                            <td className="py-3 px-4 text-sm">
                              <span 
                                className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium capitalize ${
                                  payment.status === 'confirmed' ? '' : ''
                                }`}
                                style={{ 
                                  backgroundColor: payment.status === 'confirmed' ? '#10b981' : '#f59e0b',
                                  color: '#FFFFFF'
                                }}
                              >
                                {payment.status === 'confirmed' ? (
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                ) : (
                                  <Clock className="w-3 h-3 mr-1" />
                                )}
                                {payment.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Simple Upload Modal */}
      <SimpleUploadModal
        isOpen={showSimpleUpload}
        onClose={() => setShowSimpleUpload(false)}
        onUploadComplete={handleSimpleUploadComplete}
        clientId={data.client_id}
        clientName={data.client_name}
      />
    </div>
  )
}

