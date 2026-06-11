import { useMemo, useState, useCallback } from 'react'
import { mockClientDashboardData } from '../data/mockClientDashboard'
import { mockPayments } from '../data/mockPayments'
import { mockInvoices } from '../data/mockInvoices'
import { formatCurrency, formatDate } from '../utils/format'
import {
  FileText,
  Download,
  Calendar,
  BarChart3,
  TrendingUp,
  DollarSign,
  Building2,
} from 'lucide-react'
import ClientLayout from '../components/ClientLayout'
import DashboardPanel from '../components/client/dashboard/DashboardPanel'
import AgingARChart from '../components/client/AgingARChart'
import PaymentTrendsChart from '../components/client/PaymentTrendsChart'
import { useClientTheme } from '../theme/ThemeContext'

type ReportType = 'aging' | 'payment' | 'invoice' | 'broker' | 'monthly'

type DatePreset = 'mtd' | '30d' | '90d' | 'ytd'

function getPresetRange(preset: DatePreset): { start_date: string; end_date: string } {
  const end = new Date()
  const start = new Date()
  end.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)

  switch (preset) {
    case 'mtd':
      start.setDate(1)
      break
    case '30d':
      start.setDate(start.getDate() - 30)
      break
    case '90d':
      start.setDate(start.getDate() - 90)
      break
    case 'ytd':
      start.setMonth(0, 1)
      break
  }

  return {
    start_date: start.toISOString().split('T')[0],
    end_date: end.toISOString().split('T')[0],
  }
}

function ReportBarRow({
  label,
  value,
  max,
  color,
  display,
}: {
  label: string
  value: number
  max: number
  color: string
  display: string
}) {
  const c = useClientTheme()
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium truncate" style={{ color: c.secondary }}>
          {label}
        </span>
        <span className="font-semibold tabular-nums shrink-0" style={{ color: c.primary }}>
          {display}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: c.chartGrid }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export default function ClientReports() {
  const c = useClientTheme()
  const [data] = useState(mockClientDashboardData)
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('aging')
  const [datePreset, setDatePreset] = useState<DatePreset | 'custom'>('custom')
  const [dateRange, setDateRange] = useState(() => ({
    start_date: '2025-01-01',
    end_date: new Date().toISOString().split('T')[0],
  }))

  const clientInvoices = useMemo(
    () =>
      mockInvoices.filter(
        (inv) => inv.client_id === data.client_id || inv.client_name === data.client_name
      ),
    [data.client_id, data.client_name]
  )

  const clientInvoiceIds = useMemo(
    () => new Set(clientInvoices.map((inv) => inv.id)),
    [clientInvoices]
  )

  const clientPayments = useMemo(
    () => mockPayments.filter((p) => clientInvoiceIds.has(p.invoice_id)),
    [clientInvoiceIds]
  )

  const filterByDateRange = useCallback(
    (date: string) => date >= dateRange.start_date && date <= dateRange.end_date,
    [dateRange]
  )

  const applyPreset = (preset: DatePreset) => {
    setDatePreset(preset)
    setDateRange(getPresetRange(preset))
  }

  const agingReport = useMemo(() => {
    const buckets = [
      { period: '0–15 days', amount: data.aging_ar['1_15'], invoice_count: 5, color: c.chart.blue },
      { period: '16–30 days', amount: data.aging_ar['16_30'], invoice_count: 8, color: c.chart.cyan },
      { period: '31–45 days', amount: data.aging_ar['31_45'], invoice_count: 6, color: c.chart.purple },
      { period: '46–60 days', amount: data.aging_ar['46_60'], invoice_count: 4, color: c.chart.amber },
      { period: '61–90 days', amount: data.aging_ar['61_90'], invoice_count: 3, color: c.chart.orange },
      { period: '91+ days', amount: data.aging_ar.over_91, invoice_count: 2, color: c.chart.red },
    ]
    return {
      buckets,
      total_ar: data.aging_ar.total,
      total_invoices: buckets.reduce((sum, item) => sum + item.invoice_count, 0),
    }
  }, [data.aging_ar, c.chart])

  const paymentReport = useMemo(() => {
    const filtered = clientPayments.filter((p) => filterByDateRange(p.payment_date))
    const confirmed = filtered.filter((p) => p.status === 'confirmed')
    const totalPaid = confirmed.reduce((sum, p) => sum + p.amount, 0)

    const methods = ['check', 'wire', 'ach', 'credit_card'].map((method) => {
      const methodPayments = confirmed.filter((p) => p.payment_method === method)
      const labels: Record<string, string> = {
        check: 'Check',
        wire: 'Wire',
        ach: 'ACH',
        credit_card: 'Card',
      }
      return {
        method: labels[method] || method,
        amount: methodPayments.reduce((sum, p) => sum + p.amount, 0),
        count: methodPayments.length,
      }
    })

    return {
      total_paid: totalPaid,
      payment_count: filtered.length,
      pending_count: filtered.filter((p) => p.status === 'pending').length,
      average_payment: confirmed.length > 0 ? totalPaid / confirmed.length : 0,
      payment_methods: methods.filter((m) => m.count > 0),
    }
  }, [clientPayments, filterByDateRange])

  const invoiceReport = useMemo(() => {
    const filtered = clientInvoices.filter((inv) => filterByDateRange(inv.invoice_date))
    const statusColors: Record<string, string> = {
      Pending: c.chart.blue,
      Approved: c.chart.cyan,
      Hold: c.chart.amber,
      Paid: c.success,
    }

    const byStatus = ['pending', 'approved', 'hold', 'paid'].map((status) => {
      const items = filtered.filter((inv) => inv.status === status)
      const label = status === 'hold' ? 'On Hold' : status.charAt(0).toUpperCase() + status.slice(1)
      return {
        status: label,
        count: items.length,
        amount: items.reduce((sum, inv) => sum + inv.amount, 0),
        color: statusColors[label] || c.chart.purple,
      }
    })

    return {
      total_invoices: filtered.length,
      total_amount: filtered.reduce((sum, inv) => sum + inv.amount, 0),
      by_status: byStatus.filter((s) => s.count > 0),
    }
  }, [clientInvoices, filterByDateRange, c])

  const brokerReport = useMemo(() => {
    const filtered = clientInvoices.filter((inv) => filterByDateRange(inv.invoice_date))
    const brokerMap = new Map<
      string,
      { broker_name: string; total_invoices: number; total_amount: number; paid_amount: number }
    >()

    filtered.forEach((inv) => {
      const existing = brokerMap.get(inv.broker_name) ?? {
        broker_name: inv.broker_name,
        total_invoices: 0,
        total_amount: 0,
        paid_amount: 0,
      }
      existing.total_invoices += 1
      existing.total_amount += inv.amount
      if (inv.status === 'paid') existing.paid_amount += inv.amount
      brokerMap.set(inv.broker_name, existing)
    })

    return Array.from(brokerMap.values())
      .map((broker) => ({
        ...broker,
        pending_amount: broker.total_amount - broker.paid_amount,
        collection_rate:
          broker.total_amount > 0 ? (broker.paid_amount / broker.total_amount) * 100 : 0,
      }))
      .sort((a, b) => b.total_amount - a.total_amount)
  }, [clientInvoices, filterByDateRange])

  const monthlyReport = useMemo(() => {
    const filteredInvoices = clientInvoices.filter((inv) => filterByDateRange(inv.invoice_date))
    const filteredPayments = clientPayments.filter(
      (p) => filterByDateRange(p.payment_date) && p.status === 'confirmed'
    )
    const totalInvoiceAmount = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0)
    const totalPaid = filteredPayments.reduce((sum, p) => sum + p.amount, 0)

    return {
      total_invoices: filteredInvoices.length,
      total_invoice_amount: totalInvoiceAmount,
      total_paid: totalPaid,
      outstanding: totalInvoiceAmount - totalPaid,
      collection_rate: totalInvoiceAmount > 0 ? (totalPaid / totalInvoiceAmount) * 100 : 0,
    }
  }, [clientInvoices, clientPayments, filterByDateRange])

  const handleExportCSV = () => {
    let csvContent = ''
    let filename = ''

    switch (selectedReportType) {
      case 'aging':
        csvContent = 'Period,Amount,Invoice Count\n'
        agingReport.buckets.forEach((item) => {
          csvContent += `${item.period},${item.amount},${item.invoice_count}\n`
        })
        filename = `aging_report_${dateRange.start_date}_to_${dateRange.end_date}.csv`
        break
      case 'payment':
        csvContent = 'Method,Amount,Count\n'
        paymentReport.payment_methods.forEach((item) => {
          csvContent += `${item.method},${item.amount},${item.count}\n`
        })
        filename = `payment_report_${dateRange.start_date}_to_${dateRange.end_date}.csv`
        break
      case 'invoice':
        csvContent = 'Status,Count,Amount\n'
        invoiceReport.by_status.forEach((item) => {
          csvContent += `${item.status},${item.count},${item.amount}\n`
        })
        filename = `invoice_report_${dateRange.start_date}_to_${dateRange.end_date}.csv`
        break
      case 'broker':
        csvContent = 'Broker,Total Invoices,Total Amount,Paid Amount,Pending Amount,Collection Rate\n'
        brokerReport.forEach((item) => {
          csvContent += `${item.broker_name},${item.total_invoices},${item.total_amount},${item.paid_amount},${item.pending_amount},${item.collection_rate.toFixed(1)}%\n`
        })
        filename = `broker_report_${dateRange.start_date}_to_${dateRange.end_date}.csv`
        break
      case 'monthly':
        csvContent = 'Metric,Value\n'
        csvContent += `Total Invoices,${monthlyReport.total_invoices}\n`
        csvContent += `Invoice Amount,${monthlyReport.total_invoice_amount}\n`
        csvContent += `Total Paid,${monthlyReport.total_paid}\n`
        csvContent += `Outstanding,${monthlyReport.outstanding}\n`
        csvContent += `Collection Rate,${monthlyReport.collection_rate.toFixed(1)}%\n`
        filename = `monthly_report_${dateRange.start_date}_to_${dateRange.end_date}.csv`
        break
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

  const handleExportPDF = () => {
    alert('PDF export will be available in a future update.')
  }

  const reportTabs: { id: ReportType; label: string; icon: typeof Calendar }[] = [
    { id: 'aging', label: 'Aging', icon: Calendar },
    { id: 'payment', label: 'Payments', icon: DollarSign },
    { id: 'invoice', label: 'Invoices', icon: FileText },
    { id: 'broker', label: 'Brokers', icon: Building2 },
    { id: 'monthly', label: 'Monthly', icon: TrendingUp },
  ]

  const inputCompactStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  const maxBrokerAmount = brokerReport[0]?.total_amount ?? 1
  const maxStatusAmount = Math.max(...invoiceReport.by_status.map((s) => s.amount), 1)
  const maxMethodAmount = Math.max(...paymentReport.payment_methods.map((m) => m.amount), 1)
  const maxAgingAmount = Math.max(...agingReport.buckets.map((b) => b.amount), 1)

  return (
    <ClientLayout clientName={data.client_name} clientId={data.client_id}>
      <div className="client-reports-page space-y-4">
        <div className="page-tabs">
          {reportTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedReportType(tab.id)}
              className={`page-tab inline-flex items-center gap-1.5 ${
                selectedReportType === tab.id ? 'page-tab--active' : ''
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <section
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border rounded-xl overflow-hidden"
          style={{ borderColor: c.border }}
        >
          {selectedReportType === 'aging' && (
            <>
              <StatCell label="Total A/R" value={formatCurrency(agingReport.total_ar)} icon={DollarSign} bg={c.stat.blue} iconColor={c.info} />
              <StatCell label="Open invoices" value={String(agingReport.total_invoices)} icon={FileText} bg={c.stat.slate} iconColor={c.secondary} />
              <StatCell label="Largest bucket" value={formatCurrency(maxAgingAmount)} icon={BarChart3} bg={c.stat.amber} iconColor={c.warning} />
              <StatCell label="Over 91 days" value={formatCurrency(data.aging_ar.over_91)} icon={TrendingUp} bg={c.stat.red} iconColor={c.error} />
            </>
          )}
          {selectedReportType === 'payment' && (
            <>
              <StatCell label="Total paid" value={formatCurrency(paymentReport.total_paid)} icon={DollarSign} bg={c.stat.green} iconColor={c.success} />
              <StatCell label="Payments" value={String(paymentReport.payment_count)} icon={FileText} bg={c.stat.blue} iconColor={c.info} />
              <StatCell label="Pending" value={String(paymentReport.pending_count)} icon={Calendar} bg={c.stat.amber} iconColor={c.warning} />
              <StatCell label="Avg payment" value={formatCurrency(paymentReport.average_payment)} icon={TrendingUp} bg={c.stat.slate} iconColor={c.secondary} />
            </>
          )}
          {selectedReportType === 'invoice' && (
            <>
              <StatCell label="Invoices" value={String(invoiceReport.total_invoices)} icon={FileText} bg={c.stat.blue} iconColor={c.info} />
              <StatCell label="Total amount" value={formatCurrency(invoiceReport.total_amount)} icon={DollarSign} bg={c.stat.green} iconColor={c.success} />
              <StatCell label="Status groups" value={String(invoiceReport.by_status.length)} icon={BarChart3} bg={c.stat.amber} iconColor={c.warning} />
              <StatCell label="Date range" value={`${formatDate(dateRange.start_date)}`} icon={Calendar} bg={c.stat.slate} iconColor={c.secondary} isText />
            </>
          )}
          {selectedReportType === 'broker' && (
            <>
              <StatCell label="Brokers" value={String(brokerReport.length)} icon={Building2} bg={c.stat.blue} iconColor={c.info} />
              <StatCell label="Top broker volume" value={formatCurrency(maxBrokerAmount)} icon={DollarSign} bg={c.stat.green} iconColor={c.success} />
              <StatCell
                label="Avg collection"
                value={`${brokerReport.length ? (brokerReport.reduce((s, b) => s + b.collection_rate, 0) / brokerReport.length).toFixed(0) : 0}%`}
                icon={TrendingUp}
                bg={c.stat.amber}
                iconColor={c.warning}
              />
              <StatCell label="Invoices in range" value={String(clientInvoices.filter((i) => filterByDateRange(i.invoice_date)).length)} icon={FileText} bg={c.stat.slate} iconColor={c.secondary} />
            </>
          )}
          {selectedReportType === 'monthly' && (
            <>
              <StatCell label="Invoiced" value={formatCurrency(monthlyReport.total_invoice_amount)} icon={DollarSign} bg={c.stat.blue} iconColor={c.info} />
              <StatCell label="Collected" value={formatCurrency(monthlyReport.total_paid)} icon={DollarSign} bg={c.stat.green} iconColor={c.success} />
              <StatCell label="Outstanding" value={formatCurrency(monthlyReport.outstanding)} icon={TrendingUp} bg={c.stat.amber} iconColor={c.warning} />
              <StatCell label="Collection rate" value={`${monthlyReport.collection_rate.toFixed(1)}%`} icon={BarChart3} bg={c.stat.slate} iconColor={c.secondary} />
            </>
          )}
        </section>

        <div
          className="dashboard-card px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
        >
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'mtd' as const, label: 'MTD' },
                { id: '30d' as const, label: '30 days' },
                { id: '90d' as const, label: '90 days' },
                { id: 'ytd' as const, label: 'YTD' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`batch-filter-pill ${datePreset === preset.id ? 'batch-filter-pill--active' : ''}`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
            <input
              type="date"
              value={dateRange.start_date}
              onChange={(e) => {
                setDatePreset('custom')
                setDateRange((prev) => ({ ...prev, start_date: e.target.value }))
              }}
              className="client-input"
              style={inputCompactStyle}
              aria-label="Start date"
            />
            <span className="text-xs font-medium hidden sm:inline" style={{ color: c.secondary }}>
              to
            </span>
            <input
              type="date"
              value={dateRange.end_date}
              onChange={(e) => {
                setDatePreset('custom')
                setDateRange((prev) => ({ ...prev, end_date: e.target.value }))
              }}
              className="client-input"
              style={inputCompactStyle}
              aria-label="End date"
            />
            <button type="button" onClick={handleExportCSV} className="dashboard-btn-secondary shrink-0">
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button type="button" onClick={handleExportPDF} className="dashboard-btn-secondary shrink-0">
              <Download className="w-3.5 h-3.5" />
              PDF
            </button>
          </div>
        </div>

        {selectedReportType === 'aging' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <DashboardPanel title="A/R distribution" compact interactive={false}>
              <AgingARChart aging={data.aging_ar} />
            </DashboardPanel>
            <DashboardPanel title="Aging breakdown" compact interactive={false}>
              <div className="p-5 space-y-4">
                {agingReport.buckets.map((bucket) => (
                  <ReportBarRow
                    key={bucket.period}
                    label={bucket.period}
                    value={bucket.amount}
                    max={maxAgingAmount}
                    color={bucket.color}
                    display={`${formatCurrency(bucket.amount)} · ${bucket.invoice_count} inv`}
                  />
                ))}
              </div>
            </DashboardPanel>
          </div>
        )}

        {selectedReportType === 'payment' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2">
              <DashboardPanel title="Payment trends" compact interactive={false}>
                <PaymentTrendsChart payments={clientPayments} />
              </DashboardPanel>
            </div>
            <DashboardPanel title="By method" compact interactive={false}>
              <div className="p-5 space-y-4">
                {paymentReport.payment_methods.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: c.secondary }}>
                    No confirmed payments in this range
                  </p>
                ) : (
                  paymentReport.payment_methods.map((method) => (
                    <ReportBarRow
                      key={method.method}
                      label={method.method}
                      value={method.amount}
                      max={maxMethodAmount}
                      color={c.info}
                      display={`${formatCurrency(method.amount)} · ${method.count}`}
                    />
                  ))
                )}
              </div>
            </DashboardPanel>
          </div>
        )}

        {selectedReportType === 'invoice' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <DashboardPanel title="Status mix" compact interactive={false}>
              <div className="p-5 space-y-4">
                {invoiceReport.by_status.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: c.secondary }}>
                    No invoices in this range
                  </p>
                ) : (
                  invoiceReport.by_status.map((row) => (
                    <ReportBarRow
                      key={row.status}
                      label={row.status}
                      value={row.amount}
                      max={maxStatusAmount}
                      color={row.color}
                      display={`${formatCurrency(row.amount)} · ${row.count}`}
                    />
                  ))
                )}
              </div>
            </DashboardPanel>
            <DashboardPanel title="Status detail" compact interactive={false}>
              <div className="overflow-x-auto">
                <table className="dashboard-table dashboard-table--compact">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th className="text-right">Count</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceReport.by_status.map((row) => (
                      <tr key={row.status}>
                        <td className="font-medium">{row.status}</td>
                        <td className="text-right tabular-nums">{row.count}</td>
                        <td className="text-right font-medium tabular-nums">
                          {formatCurrency(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashboardPanel>
          </div>
        )}

        {selectedReportType === 'broker' && (
          <DashboardPanel title="Broker performance" compact interactive={false}>
            <div className="p-5 space-y-5 border-b" style={{ borderColor: c.border }}>
              {brokerReport.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: c.secondary }}>
                  No broker activity in this range
                </p>
              ) : (
                brokerReport.slice(0, 6).map((broker, index) => (
                  <ReportBarRow
                    key={broker.broker_name}
                    label={broker.broker_name}
                    value={broker.total_amount}
                    max={maxBrokerAmount}
                    color={[c.chart.blue, c.chart.cyan, c.chart.purple, c.chart.amber, c.chart.orange, c.chart.red][index % 6]}
                    display={formatCurrency(broker.total_amount)}
                  />
                ))
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="dashboard-table dashboard-table--compact">
                <thead>
                  <tr>
                    <th>Broker</th>
                    <th className="text-right">Invoices</th>
                    <th className="text-right">Volume</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Collection</th>
                  </tr>
                </thead>
                <tbody>
                  {brokerReport.map((broker) => (
                    <tr key={broker.broker_name}>
                      <td className="font-semibold truncate max-w-[180px]">{broker.broker_name}</td>
                      <td className="text-right tabular-nums">{broker.total_invoices}</td>
                      <td className="text-right font-medium tabular-nums">
                        {formatCurrency(broker.total_amount)}
                      </td>
                      <td className="text-right tabular-nums" style={{ color: c.success }}>
                        {formatCurrency(broker.paid_amount)}
                      </td>
                      <td className="text-right tabular-nums">
                        {broker.collection_rate.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashboardPanel>
        )}

        {selectedReportType === 'monthly' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <DashboardPanel title="Collection rate" compact interactive={false} className="lg:col-span-1">
              <div className="p-6 flex flex-col items-center justify-center">
                <div
                  className="relative w-40 h-40 rounded-full flex items-center justify-center"
                  style={{
                    background: `conic-gradient(${c.success} ${monthlyReport.collection_rate}%, ${c.chartGrid} 0)`,
                  }}
                >
                  <div
                    className="absolute inset-3 rounded-full flex flex-col items-center justify-center"
                    style={{ backgroundColor: c.card }}
                  >
                    <span className="text-3xl font-bold tabular-nums" style={{ color: c.primary }}>
                      {monthlyReport.collection_rate.toFixed(0)}%
                    </span>
                    <span className="text-xs font-medium mt-1" style={{ color: c.secondary }}>
                      collected
                    </span>
                  </div>
                </div>
                <p className="text-sm mt-4 text-center" style={{ color: c.secondary }}>
                  {formatCurrency(monthlyReport.total_paid)} of{' '}
                  {formatCurrency(monthlyReport.total_invoice_amount)} invoiced
                </p>
              </div>
            </DashboardPanel>
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MetricCard label="Invoices submitted" value={String(monthlyReport.total_invoices)} sub="in selected range" />
              <MetricCard label="Invoice volume" value={formatCurrency(monthlyReport.total_invoice_amount)} sub="gross billed" />
              <MetricCard label="Cash collected" value={formatCurrency(monthlyReport.total_paid)} sub="confirmed payments" accent={c.success} />
              <MetricCard label="Still outstanding" value={formatCurrency(monthlyReport.outstanding)} sub="open balance" accent={c.warning} />
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  )
}

function StatCell({
  label,
  value,
  icon: Icon,
  bg,
  iconColor,
  isText,
}: {
  label: string
  value: string
  icon: typeof DollarSign
  bg: string
  iconColor: string
  isText?: boolean
}) {
  const c = useClientTheme()
  return (
    <div
      className="flex items-center justify-between gap-2 px-4 py-2.5 border-b sm:border-b-0 sm:border-r last:border-r-0"
      style={{ backgroundColor: bg, borderColor: c.border }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: iconColor }} />
        <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
          {label}
        </span>
      </div>
      <span
        className={`${isText ? 'text-sm' : 'text-lg'} font-bold tabular-nums shrink-0`}
        style={{ color: c.primary }}
      >
        {value}
      </span>
    </div>
  )
}

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub: string
  accent?: string
}) {
  const c = useClientTheme()
  return (
    <div className="dashboard-card p-5">
      <p className="text-xs font-medium" style={{ color: c.secondary }}>
        {label}
      </p>
      <p
        className="text-2xl font-bold tabular-nums mt-1"
        style={{ color: accent ?? c.primary }}
      >
        {value}
      </p>
      <p className="text-xs mt-1" style={{ color: c.mutedLight }}>
        {sub}
      </p>
    </div>
  )
}
