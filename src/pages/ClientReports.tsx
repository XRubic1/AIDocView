import { useState } from 'react'
import { mockClientDashboardData } from '../data/mockClientDashboard'
import { mockPayments } from '../data/mockPayments'
import { mockInvoices } from '../data/mockInvoices'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/format'
import {
  FileText,
  Download,
  Calendar,
  BarChart3,
  TrendingUp,
  DollarSign,
  X,
} from 'lucide-react'
import ClientLayout from '../components/ClientLayout'

export default function ClientReports() {
  const [data] = useState(mockClientDashboardData)

  const [selectedReportType, setSelectedReportType] = useState<string>('aging')
  const [dateRange, setDateRange] = useState({
    start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
  })
  const [showReportModal, setShowReportModal] = useState(false)
  const [generatedReport, setGeneratedReport] = useState<any>(null)

  // Filter data based on date range
  const filterByDateRange = (date: string) => {
    return date >= dateRange.start_date && date <= dateRange.end_date
  }

  // Generate Aging A/R Report
  const generateAgingReport = () => {
    const agingData = [
      { period: '1-15 Days', amount: data.aging_ar['1_15'], invoice_count: 5 },
      { period: '16-30 Days', amount: data.aging_ar['16_30'], invoice_count: 8 },
      { period: '31-45 Days', amount: data.aging_ar['31_45'], invoice_count: 6 },
      { period: '46-60 Days', amount: data.aging_ar['46_60'], invoice_count: 4 },
      { period: '61-90 Days', amount: data.aging_ar['61_90'], invoice_count: 3 },
      { period: 'Over 91 Days', amount: data.aging_ar.over_91, invoice_count: 2 },
    ]

    return {
      type: 'aging',
      title: 'Aging A/R Report',
      date_range: dateRange,
      data: agingData,
      summary: {
        total_ar: data.aging_ar.total,
        total_invoices: agingData.reduce((sum, item) => sum + item.invoice_count, 0),
      },
    }
  }

  // Generate Payment Report
  const generatePaymentReport = () => {
    const filteredPayments = mockPayments.filter((p) => filterByDateRange(p.payment_date))

    const totalPaid = filteredPayments
      .filter((p) => p.status === 'confirmed')
      .reduce((sum, p) => sum + p.amount, 0)

    const paymentMethods = ['check', 'wire', 'ach', 'credit_card'].map((method) => {
      const methodPayments = filteredPayments.filter((p) => p.payment_method === method)
      return {
        method: method.charAt(0).toUpperCase() + method.slice(1),
        amount: methodPayments.reduce((sum, p) => sum + p.amount, 0),
        count: methodPayments.length,
      }
    })

    return {
      type: 'payment',
      title: 'Payment Summary Report',
      date_range: dateRange,
      data: {
        total_paid: totalPaid,
        payment_count: filteredPayments.length,
        average_payment: filteredPayments.length > 0 ? totalPaid / filteredPayments.length : 0,
        payment_methods: paymentMethods.filter((m) => m.count > 0),
      },
    }
  }

  // Generate Invoice Report
  const generateInvoiceReport = () => {
    const clientInvoices = mockInvoices.filter(
      (inv) => inv.client_id === data.client_id || inv.client_name === data.client_name
    )
    const filteredInvoices = clientInvoices.filter((inv) => filterByDateRange(inv.invoice_date))

    const byStatus = ['pending', 'approved', 'hold', 'paid'].map((status) => {
      const statusInvoices = filteredInvoices.filter((inv) => inv.status === status)
      return {
        status: status.charAt(0).toUpperCase() + status.slice(1),
        count: statusInvoices.length,
        amount: statusInvoices.reduce((sum, inv) => sum + inv.amount, 0),
      }
    })

    return {
      type: 'invoice',
      title: 'Invoice Status Report',
      date_range: dateRange,
      data: {
        total_invoices: filteredInvoices.length,
        total_amount: filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0),
        by_status: byStatus.filter((s) => s.count > 0),
      },
    }
  }

  // Generate Broker Performance Report
  const generateBrokerReport = () => {
    const clientInvoices = mockInvoices.filter(
      (inv) => inv.client_id === data.client_id || inv.client_name === data.client_name
    )
    const filteredInvoices = clientInvoices.filter((inv) => filterByDateRange(inv.invoice_date))

    const brokerMap = new Map<string, any>()

    filteredInvoices.forEach((inv) => {
      if (!brokerMap.has(inv.broker_name)) {
        brokerMap.set(inv.broker_name, {
          broker_name: inv.broker_name,
          total_invoices: 0,
          total_amount: 0,
          paid_amount: 0,
          pending_amount: 0,
          invoices: [],
        })
      }

      const broker = brokerMap.get(inv.broker_name)!
      broker.total_invoices++
      broker.total_amount += inv.amount
      broker.invoices.push(inv)

      if (inv.status === 'paid') {
        broker.paid_amount += inv.amount
      } else {
        broker.pending_amount += inv.amount
      }
    })

    const brokerData = Array.from(brokerMap.values()).map((broker) => {
      // Calculate average days to pay (mock calculation)
      const paidInvoices = broker.invoices.filter((inv: any) => inv.status === 'paid')
      const averageDays = paidInvoices.length > 0 ? 25 : 0 // Mock average

      return {
        ...broker,
        average_days_to_pay: averageDays,
      }
    })

    return {
      type: 'broker',
      title: 'Broker Performance Report',
      date_range: dateRange,
      data: brokerData,
    }
  }

  // Generate Monthly Summary Report
  const generateMonthlyReport = () => {
    const clientInvoices = mockInvoices.filter(
      (inv) => inv.client_id === data.client_id || inv.client_name === data.client_name
    )
    const filteredInvoices = clientInvoices.filter((inv) => filterByDateRange(inv.invoice_date))
    const filteredPayments = mockPayments.filter((p) => filterByDateRange(p.payment_date))

    const totalInvoices = filteredInvoices.length
    const totalInvoiceAmount = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0)
    const totalPaid = filteredPayments
      .filter((p) => p.status === 'confirmed')
      .reduce((sum, p) => sum + p.amount, 0)

    return {
      type: 'monthly',
      title: 'Monthly Summary Report',
      date_range: dateRange,
      data: {
        total_invoices: totalInvoices,
        total_invoice_amount: totalInvoiceAmount,
        total_paid: totalPaid,
        outstanding: totalInvoiceAmount - totalPaid,
        collection_rate: totalInvoiceAmount > 0 ? (totalPaid / totalInvoiceAmount) * 100 : 0,
      },
    }
  }

  const handleGenerateReport = () => {
    let report: any

    switch (selectedReportType) {
      case 'aging':
        report = generateAgingReport()
        break
      case 'payment':
        report = generatePaymentReport()
        break
      case 'invoice':
        report = generateInvoiceReport()
        break
      case 'broker':
        report = generateBrokerReport()
        break
      case 'monthly':
        report = generateMonthlyReport()
        break
      default:
        report = generateAgingReport()
    }

    setGeneratedReport(report)
    setShowReportModal(true)
  }

  const handleExportPDF = () => {
    // TODO: Implement PDF export
    alert('PDF export functionality will be implemented')
  }

  const handleExportCSV = () => {
    if (!generatedReport) return

    let csvContent = ''
    let filename = ''

    switch (generatedReport.type) {
      case 'aging':
        csvContent = 'Period,Amount,Invoice Count\n'
        generatedReport.data.forEach((item: any) => {
          csvContent += `${item.period},${item.amount},${item.invoice_count}\n`
        })
        filename = `aging_report_${dateRange.start_date}_to_${dateRange.end_date}.csv`
        break
      case 'payment':
        csvContent = 'Method,Amount,Count\n'
        generatedReport.data.payment_methods.forEach((item: any) => {
          csvContent += `${item.method},${item.amount},${item.count}\n`
        })
        filename = `payment_report_${dateRange.start_date}_to_${dateRange.end_date}.csv`
        break
      case 'invoice':
        csvContent = 'Status,Count,Amount\n'
        generatedReport.data.by_status.forEach((item: any) => {
          csvContent += `${item.status},${item.count},${item.amount}\n`
        })
        filename = `invoice_report_${dateRange.start_date}_to_${dateRange.end_date}.csv`
        break
      case 'broker':
        csvContent = 'Broker,Total Invoices,Total Amount,Paid Amount,Pending Amount,Avg Days to Pay\n'
        generatedReport.data.forEach((item: any) => {
          csvContent += `${item.broker_name},${item.total_invoices},${item.total_amount},${item.paid_amount},${item.pending_amount},${item.average_days_to_pay}\n`
        })
        filename = `broker_report_${dateRange.start_date}_to_${dateRange.end_date}.csv`
        break
      default:
        return
    }

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const reportTypes = [
    { value: 'aging', label: 'Aging A/R Report', icon: Calendar, description: 'View accounts receivable aging breakdown' },
    { value: 'payment', label: 'Payment Summary', icon: DollarSign, description: 'Payment history and method analysis' },
    { value: 'invoice', label: 'Invoice Status', icon: FileText, description: 'Invoice status breakdown and statistics' },
    { value: 'broker', label: 'Broker Performance', icon: BarChart3, description: 'Broker payment performance analysis' },
    { value: 'monthly', label: 'Monthly Summary', icon: TrendingUp, description: 'Monthly financial summary and metrics' },
  ]

  return (
    <ClientLayout clientName={data.client_name} clientId={data.client_id}>
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>
            Reports
          </h2>
          <p style={{ color: '#64748b' }}>Generate and export detailed reports</p>
        </div>

        {/* Report Type Selection */}
        <div className="bg-white border rounded mb-6 p-6" style={{ borderColor: '#e2e8f0' }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: '#113543' }}>
            Select Report Type
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reportTypes.map((report) => {
              const Icon = report.icon
              return (
                <button
                  key={report.value}
                  onClick={() => setSelectedReportType(report.value)}
                  className="p-4 border rounded text-left transition-colors"
                  style={{
                    borderColor: selectedReportType === report.value ? '#0891b2' : '#64748b',
                    backgroundColor: selectedReportType === report.value ? '#f8f9fa' : '#FFFFFF',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedReportType !== report.value) {
                      e.currentTarget.style.borderColor = '#0891b2'
                      e.currentTarget.style.backgroundColor = '#f8f9fa'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedReportType !== report.value) {
                      e.currentTarget.style.borderColor = '#64748b'
                      e.currentTarget.style.backgroundColor = '#FFFFFF'
                    }
                  }}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <Icon className="w-5 h-5" style={{ color: '#0891b2' }} />
                    <span className="font-medium" style={{ color: '#113543' }}>
                      {report.label}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: '#64748b' }}>
                    {report.description}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Date Range Selection */}
        <div className="bg-white border rounded mb-6 p-6" style={{ borderColor: '#e2e8f0' }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: '#113543' }}>
            Date Range
          </h3>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-2" style={{ color: '#64748b' }}>
                Start Date
              </label>
              <input
                type="date"
                value={dateRange.start_date}
                onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })}
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
            <div className="flex-1">
              <label className="block text-sm font-medium mb-2" style={{ color: '#64748b' }}>
                End Date
              </label>
              <input
                type="date"
                value={dateRange.end_date}
                onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })}
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
            <div className="flex items-end">
              <button
                onClick={handleGenerateReport}
                className="px-6 py-2 text-sm font-medium transition-colors"
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
                Generate Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && generatedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: '#e2e8f0' }}>
              <div>
                <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                  {generatedReport.title}
                </h3>
                <p className="text-sm mt-1" style={{ color: '#64748b' }}>
                  {formatDate(generatedReport.date_range.start_date)} - {formatDate(generatedReport.date_range.end_date)}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleExportCSV}
                  className="flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded transition-colors"
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
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={handleExportPDF}
                  className="flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded transition-colors"
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
                  <Download className="w-4 h-4" />
                  <span>Export PDF</span>
                </button>
                <button
                  onClick={() => {
                    setShowReportModal(false)
                    setGeneratedReport(null)
                  }}
                  className="p-2 hover:bg-gray-100 rounded transition-colors"
                  style={{ color: '#113543' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Aging Report */}
              {generatedReport.type === 'aging' && (
                <div>
                  {generatedReport.summary && (
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-gray-50 p-4 rounded">
                        <p className="text-sm" style={{ color: '#64748b' }}>Total A/R</p>
                        <p className="text-xl font-bold mt-1" style={{ color: '#113543' }}>
                          {formatCurrency(generatedReport.summary.total_ar)}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded">
                        <p className="text-sm" style={{ color: '#64748b' }}>Total Invoices</p>
                        <p className="text-xl font-bold mt-1" style={{ color: '#113543' }}>
                          {generatedReport.summary.total_invoices}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead style={{ backgroundColor: '#f8f9fa' }}>
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                            Period
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                            Amount
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                            Invoice Count
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: '#e2e8f0' }}>
                        {generatedReport.data.map((item: any, index: number) => (
                          <tr key={index}>
                            <td className="px-4 py-3 text-sm" style={{ color: '#113543' }}>
                              {item.period}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium" style={{ color: '#113543' }}>
                              {formatCurrency(item.amount)}
                            </td>
                            <td className="px-4 py-3 text-sm" style={{ color: '#64748b' }}>
                              {item.invoice_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Payment Report */}
              {generatedReport.type === 'payment' && (
                <div>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm" style={{ color: '#64748b' }}>Total Paid</p>
                      <p className="text-xl font-bold mt-1" style={{ color: '#113543' }}>
                        {formatCurrency(generatedReport.data.total_paid)}
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm" style={{ color: '#64748b' }}>Payment Count</p>
                      <p className="text-xl font-bold mt-1" style={{ color: '#113543' }}>
                        {generatedReport.data.payment_count}
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm" style={{ color: '#64748b' }}>Average Payment</p>
                      <p className="text-xl font-bold mt-1" style={{ color: '#113543' }}>
                        {formatCurrency(generatedReport.data.average_payment)}
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead style={{ backgroundColor: '#f8f9fa' }}>
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                            Payment Method
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                            Amount
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                            Count
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: '#e2e8f0' }}>
                        {generatedReport.data.payment_methods.map((item: any, index: number) => (
                          <tr key={index}>
                            <td className="px-4 py-3 text-sm" style={{ color: '#113543' }}>
                              {item.method}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium" style={{ color: '#113543' }}>
                              {formatCurrency(item.amount)}
                            </td>
                            <td className="px-4 py-3 text-sm" style={{ color: '#64748b' }}>
                              {item.count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Invoice Report */}
              {generatedReport.type === 'invoice' && (
                <div>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm" style={{ color: '#64748b' }}>Total Invoices</p>
                      <p className="text-xl font-bold mt-1" style={{ color: '#113543' }}>
                        {generatedReport.data.total_invoices}
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm" style={{ color: '#64748b' }}>Total Amount</p>
                      <p className="text-xl font-bold mt-1" style={{ color: '#113543' }}>
                        {formatCurrency(generatedReport.data.total_amount)}
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead style={{ backgroundColor: '#f8f9fa' }}>
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                            Count
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: '#e2e8f0' }}>
                        {generatedReport.data.by_status.map((item: any, index: number) => (
                          <tr key={index}>
                            <td className="px-4 py-3 text-sm" style={{ color: '#113543' }}>
                              {item.status}
                            </td>
                            <td className="px-4 py-3 text-sm" style={{ color: '#64748b' }}>
                              {item.count}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium" style={{ color: '#113543' }}>
                              {formatCurrency(item.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Broker Report */}
              {generatedReport.type === 'broker' && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead style={{ backgroundColor: '#f8f9fa' }}>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                          Broker
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                          Total Invoices
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                          Total Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                          Paid Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                          Pending Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: '#113543' }}>
                          Avg Days to Pay
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: '#e2e8f0' }}>
                      {generatedReport.data.map((item: any, index: number) => (
                        <tr key={index}>
                          <td className="px-4 py-3 text-sm font-medium" style={{ color: '#113543' }}>
                            {item.broker_name}
                          </td>
                          <td className="px-4 py-3 text-sm" style={{ color: '#64748b' }}>
                            {item.total_invoices}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium" style={{ color: '#113543' }}>
                            {formatCurrency(item.total_amount)}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium" style={{ color: '#113543' }}>
                            {formatCurrency(item.paid_amount)}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium" style={{ color: '#113543' }}>
                            {formatCurrency(item.pending_amount)}
                          </td>
                          <td className="px-4 py-3 text-sm" style={{ color: '#64748b' }}>
                            {item.average_days_to_pay} days
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Monthly Report */}
              {generatedReport.type === 'monthly' && (
                <div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm" style={{ color: '#64748b' }}>Total Invoices</p>
                      <p className="text-xl font-bold mt-1" style={{ color: '#113543' }}>
                        {generatedReport.data.total_invoices}
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm" style={{ color: '#64748b' }}>Total Invoice Amount</p>
                      <p className="text-xl font-bold mt-1" style={{ color: '#113543' }}>
                        {formatCurrency(generatedReport.data.total_invoice_amount)}
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm" style={{ color: '#64748b' }}>Total Paid</p>
                      <p className="text-xl font-bold mt-1" style={{ color: '#113543' }}>
                        {formatCurrency(generatedReport.data.total_paid)}
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm" style={{ color: '#64748b' }}>Outstanding</p>
                      <p className="text-xl font-bold mt-1" style={{ color: '#113543' }}>
                        {formatCurrency(generatedReport.data.outstanding)}
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm" style={{ color: '#64748b' }}>Collection Rate</p>
                      <p className="text-xl font-bold mt-1" style={{ color: '#113543' }}>
                        {generatedReport.data.collection_rate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </ClientLayout>
  )
}

