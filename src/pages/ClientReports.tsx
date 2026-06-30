import { useMemo, useState, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { formatCurrency, formatDate } from '../utils/format'
import {
  FileText,
  Download,
  Calendar,
  BarChart3,
  TrendingUp,
  DollarSign,
  Building2,
  Wallet,
  Clock,
  AlertTriangle,
  ArrowRight,
  Activity,
} from 'lucide-react'
import ClientLayout from '../components/ClientLayout'
import DashboardPanel from '../components/client/dashboard/DashboardPanel'
import AgingARChart from '../components/client/AgingARChart'
import PaymentTrendsChart from '../components/client/PaymentTrendsChart'
import CashFlowChart from '../components/client/CashFlowChart'
import CashCollectionForecast from '../components/client/CashCollectionForecast'
import { useClientTheme } from '../theme/ThemeContext'
import {
  computeOpenArAging,
  computeBrokerScores,
  computeCashFlowTrend,
  computePipelineMetrics,
  computePaymentLag,
  computePeriodSummary,
  computeTaxReport,
  computeCollectionsByMonth,
  getPresetRange,
  type DateRange,
} from '../utils/clientReports'
import { computeCashCollectionForecast } from '../utils/cashCollectionForecast'
import {
  OVERVIEW_REPORT_SECTIONS,
  buildOverviewCsvRows,
  computeConcentrationRisk,
} from '../utils/clientOverviewReports'
import { getBrokerPayRating } from '../utils/clientBrokers'
import BrokerPayRatingBadge from '../components/client/BrokerPayRatingBadge'
import { useClientSession } from '../hooks/useClientSession'

type ReportType = 'overview' | 'aging' | 'cashflow' | 'brokers' | 'pipeline'

type DatePreset = 'mtd' | '30d' | '90d' | 'ytd'

const BUCKET_COLORS = (c: ReturnType<typeof useClientTheme>) =>
  [c.chart.blue, c.chart.cyan, c.chart.purple, c.chart.amber, c.chart.orange, c.chart.red] as const

function ReportBarRow({
  label,
  value,
  max,
  color,
  display,
  sub,
}: {
  label: string
  value: number
  max: number
  color: string
  display: string
  sub?: string
}) {
  const c = useClientTheme()
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0

  return (
    <div className="report-bar-row">
      <div className="report-bar-row__head">
        <span className="font-medium truncate" style={{ color: c.secondary }}>
          {label}
        </span>
        <span className="font-semibold tabular-nums shrink-0 text-right" style={{ color: c.primary }}>
          {display}
        </span>
      </div>
      {sub && (
        <p className="text-[11px] -mt-1" style={{ color: c.mutedLight }}>
          {sub}
        </p>
      )}
      <div className="report-bar-row__track">
        <div
          className="report-bar-row__fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function MiniKpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = useClientTheme()
  return (
    <div className="report-mini-kpi">
      <span className="report-mini-kpi__label">{label}</span>
      <span className="report-mini-kpi__value" style={{ color: accent ?? c.primary }}>
        {value}
      </span>
    </div>
  )
}

function StatStripCell({
  label,
  value,
  icon: Icon,
  bg,
  iconColor,
}: {
  label: string
  value: string
  icon: typeof DollarSign
  bg: string
  iconColor: string
}) {
  const c = useClientTheme()
  return (
    <div
      className="report-stat-cell flex items-center justify-between gap-2 px-3 py-2 sm:border-r border-b sm:border-b-0 last:border-r-0"
      style={{ backgroundColor: bg, borderColor: c.border }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className="w-3 h-3 shrink-0" style={{ color: iconColor }} />
        <span className="text-[11px] font-medium truncate" style={{ color: c.secondary }}>
          {label}
        </span>
      </div>
      <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
        {value}
      </span>
    </div>
  )
}

function ReportPanel({
  children,
  span = 12,
}: {
  children: ReactNode
  span?: 3 | 4 | 5 | 6 | 7 | 12
}) {
  const spanClass: Record<number, string> = {
    3: 'lg:col-span-3',
    4: 'lg:col-span-4',
    5: 'lg:col-span-5',
    6: 'lg:col-span-6',
    7: 'lg:col-span-7',
    12: 'lg:col-span-12',
  }
  return (
    <div className={`client-reports-panel ${spanClass[span] ?? 'lg:col-span-12'}`}>{children}</div>
  )
}

export default function ClientReports() {
  const c = useClientTheme()
  const navigate = useNavigate()
  const { clientId, clientName } = useClientSession()
  const { invoices: clientInvoices, payments: clientPayments } = useClientDemoSnapshot()
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('overview')
  const [datePreset, setDatePreset] = useState<DatePreset | 'custom'>('90d')
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange('90d'))

  const applyPreset = (preset: DatePreset) => {
    setDatePreset(preset)
    setDateRange(getPresetRange(preset))
  }

  const aging = useMemo(() => computeOpenArAging(clientInvoices), [clientInvoices])
  const summary = useMemo(
    () => computePeriodSummary(clientInvoices, clientPayments, dateRange),
    [clientInvoices, clientPayments, dateRange]
  )
  const cashFlow = useMemo(
    () => computeCashFlowTrend(clientInvoices, clientPayments, 6),
    [clientInvoices, clientPayments]
  )
  const collectionForecast = useMemo(
    () => computeCashCollectionForecast(clientInvoices, clientPayments),
    [clientInvoices, clientPayments]
  )
  const brokers = useMemo(
    () => computeBrokerScores(clientInvoices, clientPayments, dateRange),
    [clientInvoices, clientPayments, dateRange]
  )
  const pipeline = useMemo(
    () => computePipelineMetrics(clientInvoices, dateRange),
    [clientInvoices, dateRange]
  )
  const paymentLag = useMemo(
    () => computePaymentLag(clientPayments, clientInvoices, dateRange),
    [clientPayments, clientInvoices, dateRange]
  )
  const taxReport = useMemo(
    () => computeTaxReport(clientInvoices, clientPayments, dateRange),
    [clientInvoices, clientPayments, dateRange]
  )
  const collectionsByMonth = useMemo(
    () => computeCollectionsByMonth(clientInvoices, clientPayments, dateRange),
    [clientInvoices, clientPayments, dateRange]
  )

  const brokerRiskRows = useMemo(
    () =>
      brokers
        .filter((b) => b.collected_in_range > 0 || b.open_ar > 0)
        .map((b) => ({ ...b, rating: getBrokerPayRating(b) }))
        .sort((a, b) => {
          const order = { red: 0, yellow: 1, green: 2 }
          if (order[a.rating] !== order[b.rating]) return order[a.rating] - order[b.rating]
          return b.collected_in_range - a.collected_in_range
        }),
    [brokers]
  )

  const concentration = useMemo(() => computeConcentrationRisk(brokers), [brokers])

  const maxCollectionsMonth = Math.max(
    ...collectionsByMonth.map((m) => Math.max(m.invoiced, m.collected)),
    1
  )

  const bucketColors = BUCKET_COLORS(c)
  const maxAgingAmount = Math.max(...aging.buckets.map((b) => b.amount), 1)
  const maxBrokerAr = brokers[0]?.open_ar ?? 1

  const paymentMethods = useMemo(() => {
    const confirmed = clientPayments.filter(
      (p) => p.status === 'confirmed' && p.received_date >= dateRange.start_date && p.received_date <= dateRange.end_date
    )
    const labels: Record<string, string> = {
      check: 'Check',
      wire: 'Wire',
      ach: 'ACH',
      credit_card: 'Card',
    }
    return ['check', 'wire', 'ach', 'credit_card']
      .map((method) => {
        const items = confirmed.filter((p) => p.payment_method === method)
        return {
          method: labels[method] || method,
          amount: items.reduce((s, p) => s + p.amount, 0),
          count: items.length,
        }
      })
      .filter((m) => m.count > 0)
  }, [clientPayments, dateRange])

  const maxMethodAmount = Math.max(...paymentMethods.map((m) => m.amount), 1)

  const handleExportCSV = useCallback(() => {
    let csvContent = ''
    let filename = ''

    switch (selectedReportType) {
      case 'overview':
        csvContent = buildOverviewCsvRows({
          summary,
          aging,
          taxReport,
          paymentLag,
          forecast: collectionForecast,
          concentration,
          brokerRiskRows,
        })
        filename = `overview_${dateRange.start_date}_to_${dateRange.end_date}.csv`
        break
      case 'aging':
        csvContent = 'Bucket,Amount,Invoices\n'
        aging.buckets.forEach((b) => {
          csvContent += `${b.label},${b.amount},${b.invoice_count}\n`
        })
        filename = `ar_aging_${dateRange.end_date}.csv`
        break
      case 'cashflow':
        csvContent = 'Month,Invoiced,Collected,Invoice Count,Payment Count\n'
        cashFlow.forEach((row) => {
          csvContent += `${row.month},${row.invoiced},${row.collected},${row.invoice_count},${row.payment_count}\n`
        })
        filename = `cash_flow_${dateRange.start_date}_to_${dateRange.end_date}.csv`
        break
      case 'brokers':
        csvContent =
          'Broker,Open A/R,Open Invoices,Invoiced in Range,Collected,Collection Rate,Avg Days to Pay,Overdue Amount\n'
        brokers.forEach((b) => {
          csvContent += `${b.broker_name},${b.open_ar},${b.open_invoices},${b.invoiced_in_range},${b.collected_in_range},${b.collection_rate.toFixed(1)}%,${b.avg_days_to_pay ?? ''},${b.overdue_amount}\n`
        })
        filename = `broker_scorecard_${dateRange.start_date}_to_${dateRange.end_date}.csv`
        break
      case 'pipeline':
        csvContent = 'Metric,Value\n'
        csvContent += `Submitted,${pipeline.submitted}\n`
        csvContent += `Approved,${pipeline.approved}\n`
        csvContent += `Pending,${pipeline.pending}\n`
        csvContent += `On Hold,${pipeline.on_hold}\n`
        csvContent += `Paid,${pipeline.paid}\n`
        csvContent += `Approval Rate,${pipeline.approval_rate.toFixed(1)}%\n`
        csvContent += `Avg Days to Approve,${pipeline.avg_days_to_approve ?? ''}\n`
        csvContent += `Open Disputes,${pipeline.open_dispute_count}\n`
        filename = `pipeline_${dateRange.start_date}_to_${dateRange.end_date}.csv`
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
  }, [
    selectedReportType,
    summary,
    aging,
    cashFlow,
    brokers,
    pipeline,
    dateRange,
    taxReport,
    brokerRiskRows,
    paymentLag,
    collectionForecast,
    concentration,
  ])

  const reportTabs: { id: ReportType; label: string; icon: typeof Calendar }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'aging', label: 'A/R Aging', icon: Clock },
    { id: 'cashflow', label: 'Cash Flow', icon: Wallet },
    { id: 'brokers', label: 'Brokers', icon: Building2 },
    { id: 'pipeline', label: 'Pipeline', icon: Activity },
  ]

  const inputCompactStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  return (
    <ClientLayout clientName={clientName} clientId={clientId} flushMain>
      <div className="client-reports-page overflow-hidden flex flex-col min-h-0">
        <div
          className="client-reports-chrome shrink-0 border-b flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 px-4 py-2"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <div
            className="client-segmented-control client-reports-segmented min-w-0"
            role="tablist"
            aria-label="Report type"
          >
            {reportTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selectedReportType === tab.id}
                onClick={() => setSelectedReportType(tab.id)}
                className={`client-segmented-control__btn ${
                  selectedReportType === tab.id ? 'client-segmented-control__btn--active' : ''
                }`}
              >
                <tab.icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="client-reports-filters flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'mtd' as const, label: 'MTD' },
                  { id: '30d' as const, label: '30d' },
                  { id: '90d' as const, label: '90d' },
                  { id: 'ytd' as const, label: 'YTD' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={`batch-filter-pill batch-filter-pill--sm ${
                    datePreset === preset.id ? 'batch-filter-pill--active' : ''
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={dateRange.start_date}
              onChange={(e) => {
                setDatePreset('custom')
                setDateRange((prev) => ({ ...prev, start_date: e.target.value }))
              }}
              className="client-input client-reports-date-input"
              style={inputCompactStyle}
              aria-label="Start date"
            />
            <span className="text-[11px] font-medium hidden sm:inline" style={{ color: c.secondary }}>
              –
            </span>
            <input
              type="date"
              value={dateRange.end_date}
              onChange={(e) => {
                setDatePreset('custom')
                setDateRange((prev) => ({ ...prev, end_date: e.target.value }))
              }}
              className="client-input client-reports-date-input"
              style={inputCompactStyle}
              aria-label="End date"
            />
            <button
              type="button"
              onClick={handleExportCSV}
              className="dashboard-btn-secondary dashboard-btn-compact shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>

        <section
          className="client-stat-strip client-reports-stat-strip grid grid-cols-2 lg:grid-cols-4 border-b shrink-0"
          style={{ borderColor: c.border }}
        >
          {selectedReportType === 'overview' && (
            <>
              <StatStripCell label="Collected" value={formatCurrency(summary.collected)} icon={TrendingUp} bg={c.stat.green} iconColor={c.success} />
              <StatStripCell label="DSO" value={summary.dso !== null ? `${summary.dso}d` : '—'} icon={Clock} bg={c.stat.blue} iconColor={c.info} />
              <StatStripCell label="Overdue" value={formatCurrency(aging.overdue_amount)} icon={AlertTriangle} bg={c.stat.red} iconColor={c.error} />
              <StatStripCell label="Collection rate" value={`${summary.collection_rate.toFixed(0)}%`} icon={BarChart3} bg={c.stat.amber} iconColor={c.warning} />
            </>
          )}
          {selectedReportType === 'aging' && (
            <>
              <StatStripCell label="Open A/R" value={formatCurrency(aging.total_ar)} icon={DollarSign} bg={c.stat.blue} iconColor={c.info} />
              <StatStripCell label="Open invoices" value={String(aging.total_invoices)} icon={FileText} bg={c.stat.slate} iconColor={c.secondary} />
              <StatStripCell label="Overdue" value={formatCurrency(aging.overdue_amount)} icon={AlertTriangle} bg={c.stat.red} iconColor={c.error} />
              <StatStripCell label="91+ days" value={formatCurrency(aging.aging_ar.over_91)} icon={Clock} bg={c.stat.amber} iconColor={c.warning} />
            </>
          )}
          {selectedReportType === 'cashflow' && (
            <>
              <StatStripCell label="Invoiced" value={formatCurrency(summary.invoiced)} icon={FileText} bg={c.stat.blue} iconColor={c.info} />
              <StatStripCell label="Collected" value={formatCurrency(summary.collected)} icon={DollarSign} bg={c.stat.green} iconColor={c.success} />
              <StatStripCell
                label="Expected 7d"
                value={formatCurrency(collectionForecast.next_7_days)}
                icon={TrendingUp}
                bg={c.stat.amber}
                iconColor={c.warning}
              />
              <StatStripCell
                label="Expected 30d"
                value={formatCurrency(collectionForecast.next_30_days)}
                icon={Wallet}
                bg={c.stat.slate}
                iconColor={c.secondary}
              />
            </>
          )}
          {selectedReportType === 'brokers' && (
            <>
              <StatStripCell label="Active brokers" value={String(brokers.length)} icon={Building2} bg={c.stat.blue} iconColor={c.info} />
              <StatStripCell label="Top broker A/R" value={formatCurrency(maxBrokerAr)} icon={DollarSign} bg={c.stat.green} iconColor={c.success} />
              <StatStripCell
                label="Slowest payer"
                value={
                  brokers.find((b) => b.avg_days_to_pay !== null)?.broker_name?.split(' ')[0] ?? '—'
                }
                icon={Clock}
                bg={c.stat.amber}
                iconColor={c.warning}
              />
              <StatStripCell
                label="Overdue brokers"
                value={String(brokers.filter((b) => b.overdue_count > 0).length)}
                icon={AlertTriangle}
                bg={c.stat.red}
                iconColor={c.error}
              />
            </>
          )}
          {selectedReportType === 'pipeline' && (
            <>
              <StatStripCell label="Submitted" value={String(pipeline.submitted)} icon={FileText} bg={c.stat.blue} iconColor={c.info} />
              <StatStripCell label="Approval rate" value={`${pipeline.approval_rate.toFixed(0)}%`} icon={TrendingUp} bg={c.stat.green} iconColor={c.success} />
              <StatStripCell label="On hold" value={String(pipeline.on_hold)} icon={AlertTriangle} bg={c.stat.amber} iconColor={c.warning} />
              <StatStripCell label="Open disputes" value={String(pipeline.open_dispute_count)} icon={Activity} bg={c.stat.red} iconColor={c.error} />
            </>
          )}
        </section>

        {selectedReportType === 'overview' && (
          <div
            className="client-reports-overview-key shrink-0 px-4 py-1.5 border-b flex flex-wrap items-center gap-x-3 gap-y-1"
            style={{ borderColor: c.border, backgroundColor: c.card }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: c.mutedLight }}>
              Report pack
            </span>
            {OVERVIEW_REPORT_SECTIONS.map((section) => (
              <span
                key={section.id}
                className="text-[10px]"
                style={{ color: c.secondary }}
                title={section.description}
              >
                {section.industryLabel}
              </span>
            ))}
          </div>
        )}

        <div className="client-reports-body flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {selectedReportType === 'overview' && (
          <div className="client-reports-grid grid grid-cols-1 lg:grid-cols-12 gap-3 w-full">
            <ReportPanel span={7}>
              <DashboardPanel title="Cash flow trend" compact interactive={false} className="client-reports-panel-card">
                <CashFlowChart data={cashFlow} compact />
              </DashboardPanel>
            </ReportPanel>

            <ReportPanel span={5}>
              <DashboardPanel
                title="Expected collections"
                compact
                interactive
                actionLabel="Cash flow"
                onAction={() => setSelectedReportType('cashflow')}
                className="client-reports-panel-card"
              >
                <CashCollectionForecast
                  invoices={clientInvoices}
                  payments={clientPayments}
                  compact
                />
              </DashboardPanel>
            </ReportPanel>

            <ReportPanel span={6}>
              <DashboardPanel
                title="Collections effectiveness"
                compact
                interactive
                actionLabel="Collections"
                onAction={() => navigate('/client/collections')}
                className="client-reports-panel-card"
              >
                <div className="p-3 space-y-3">
                  <p className="text-[11px]" style={{ color: c.secondary }}>
                    {formatDate(dateRange.start_date)} – {formatDate(dateRange.end_date)}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <MiniKpi label="Invoiced" value={formatCurrency(summary.invoiced)} />
                    <MiniKpi label="Collected" value={formatCurrency(summary.collected)} accent={c.success} />
                    <MiniKpi
                      label="Outstanding"
                      value={formatCurrency(Math.max(0, summary.invoiced - summary.collected))}
                      accent={c.warning}
                    />
                    <MiniKpi label="DSO" value={summary.dso !== null ? `${summary.dso} days` : '—'} />
                    <MiniKpi
                      label="On-time pay"
                      value={paymentLag.sample_size > 0 ? `${paymentLag.on_time_pct.toFixed(0)}%` : '—'}
                      accent={c.success}
                    />
                    <MiniKpi
                      label="Late pay"
                      value={paymentLag.sample_size > 0 ? `${paymentLag.late_pct.toFixed(0)}%` : '—'}
                      accent={paymentLag.late_pct > 30 ? c.error : c.secondary}
                    />
                  </div>
                  {collectionsByMonth.length > 0 ? (
                    <div className="space-y-2 pt-1 border-t" style={{ borderColor: c.border }}>
                      {collectionsByMonth.map((row) => (
                        <ReportBarRow
                          key={row.monthKey}
                          label={row.label}
                          value={row.collected}
                          max={maxCollectionsMonth}
                          color={c.success}
                          display={formatCurrency(row.collected)}
                          sub={`${formatCurrency(row.invoiced)} invoiced`}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-center py-2" style={{ color: c.secondary }}>
                      No activity in this period
                    </p>
                  )}
                </div>
              </DashboardPanel>
            </ReportPanel>

            <ReportPanel span={6}>
              <DashboardPanel
                title="A/R aging snapshot"
                compact
                interactive
                actionLabel="Full aging"
                onAction={() => setSelectedReportType('aging')}
                className="client-reports-panel-card"
              >
                <AgingARChart aging={aging.aging_ar} compact />
                <div className="px-3 pb-3 space-y-1.5 border-t" style={{ borderColor: c.border }}>
                  {aging.buckets.map((bucket, i) => (
                    <ReportBarRow
                      key={bucket.id}
                      label={bucket.label}
                      value={bucket.amount}
                      max={maxAgingAmount}
                      color={bucketColors[i % bucketColors.length]}
                      display={formatCurrency(bucket.amount)}
                      sub={`${bucket.invoice_count} invoice${bucket.invoice_count !== 1 ? 's' : ''}`}
                    />
                  ))}
                </div>
              </DashboardPanel>
            </ReportPanel>

            <ReportPanel span={6}>
              <DashboardPanel
                title="Broker credit & risk"
                compact
                interactive
                actionLabel="Broker directory"
                onAction={() => navigate('/client/brokers')}
                className="client-reports-panel-card"
              >
                {concentration.top_broker_name && (
                  <div
                    className="mx-3 mt-2 px-2.5 py-1.5 rounded-lg text-[11px] flex items-center justify-between gap-2"
                    style={{
                      backgroundColor: concentration.is_elevated ? c.stat.red : c.stat.slate,
                      color: concentration.is_elevated ? c.error : c.secondary,
                    }}
                  >
                    <span className="truncate">
                      Top exposure: <strong>{concentration.top_broker_name}</strong>
                    </span>
                    <span className="font-semibold tabular-nums shrink-0">
                      {concentration.top_broker_pct.toFixed(0)}% of A/R
                    </span>
                  </div>
                )}
                {brokerRiskRows.length === 0 ? (
                  <p className="text-xs text-center py-6 px-4" style={{ color: c.secondary }}>
                    No broker payment activity in this period
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="dashboard-table dashboard-table--compact">
                      <thead>
                        <tr>
                          <th>Broker</th>
                          <th className="text-right">Open A/R</th>
                          <th className="text-right">Avg pay</th>
                          <th>Risk</th>
                          <th className="text-right">Overdue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brokerRiskRows.slice(0, 8).map((broker) => (
                          <tr key={broker.broker_name}>
                            <td className="font-medium truncate max-w-[120px]">{broker.broker_name}</td>
                            <td className="text-right tabular-nums" style={{ color: c.primary }}>
                              {formatCurrency(broker.open_ar)}
                            </td>
                            <td className="text-right tabular-nums" style={{ color: c.secondary }}>
                              {broker.avg_days_to_pay !== null ? `${broker.avg_days_to_pay}d` : '—'}
                            </td>
                            <td>
                              <BrokerPayRatingBadge rating={broker.rating} size="sm" />
                            </td>
                            <td className="text-right tabular-nums" style={{ color: broker.overdue_amount > 0 ? c.error : c.mutedLight }}>
                              {broker.overdue_amount > 0 ? formatCurrency(broker.overdue_amount) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </DashboardPanel>
            </ReportPanel>

            <ReportPanel span={6}>
              <DashboardPanel title="Tax & revenue (1099)" compact interactive={false} className="client-reports-panel-card">
                <div className="p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <MiniKpi label="Gross collected" value={formatCurrency(taxReport.gross_collected)} accent={c.success} />
                    <MiniKpi label="Payments" value={String(taxReport.payment_count)} />
                    <MiniKpi label="Invoiced" value={formatCurrency(taxReport.invoiced_in_period)} />
                    <MiniKpi
                      label="Still outstanding"
                      value={formatCurrency(taxReport.outstanding_from_period)}
                      accent={c.warning}
                    />
                  </div>
                  {taxReport.by_broker.length > 0 ? (
                    <div className="space-y-2 pt-1 border-t" style={{ borderColor: c.border }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: c.secondary }}>
                        By broker (1099 reference)
                      </p>
                      {taxReport.by_broker.slice(0, 6).map((row, i) => (
                        <ReportBarRow
                          key={row.broker_name}
                          label={row.broker_name}
                          value={row.gross_collected}
                          max={taxReport.by_broker[0]?.gross_collected ?? 1}
                          color={bucketColors[i % bucketColors.length]}
                          display={formatCurrency(row.gross_collected)}
                          sub={`${row.payment_count} payment${row.payment_count !== 1 ? 's' : ''}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-center py-2" style={{ color: c.secondary }}>
                      No collections in this period for tax reporting
                    </p>
                  )}
                  <p className="text-[10px] leading-snug" style={{ color: c.mutedLight }}>
                    Summary of freight revenue collected in the selected period. Export CSV or share with your accountant for 1099 / tax prep.
                  </p>
                </div>
              </DashboardPanel>
            </ReportPanel>
          </div>
        )}

        {selectedReportType === 'aging' && (
          <div className="client-reports-grid grid grid-cols-1 lg:grid-cols-12 gap-3 w-full">
            <ReportPanel span={6}>
            <DashboardPanel
              title="A/R distribution"
              compact
              interactive
              actionLabel="View invoices"
              onAction={() => navigate('/client/collections')}
              className="client-reports-panel-card"
            >
              <AgingARChart aging={aging.aging_ar} compact />
            </DashboardPanel>
            </ReportPanel>
            <ReportPanel span={6}>
            <DashboardPanel title="Bucket detail" compact interactive={false} className="client-reports-panel-card">
              <div className="p-3 space-y-2.5">
                {aging.buckets.map((bucket, i) => (
                  <ReportBarRow
                    key={bucket.id}
                    label={`${bucket.label} days`}
                    value={bucket.amount}
                    max={maxAgingAmount}
                    color={bucketColors[i % bucketColors.length]}
                    display={formatCurrency(bucket.amount)}
                    sub={`${bucket.invoice_count} invoice${bucket.invoice_count !== 1 ? 's' : ''} · ${aging.total_ar > 0 ? ((bucket.amount / aging.total_ar) * 100).toFixed(0) : 0}% of open A/R`}
                  />
                ))}
              </div>
            </DashboardPanel>
            </ReportPanel>
          </div>
        )}

        {selectedReportType === 'cashflow' && (
          <div className="client-reports-grid grid grid-cols-1 lg:grid-cols-12 gap-3 w-full">
            <ReportPanel span={6}>
              <DashboardPanel title="Cash flow" compact interactive={false} className="client-reports-panel-card">
                <CashFlowChart data={cashFlow} compact />
              </DashboardPanel>
            </ReportPanel>
            <ReportPanel span={6}>
              <DashboardPanel title="Collection forecast" compact interactive={false} className="client-reports-panel-card">
                <CashCollectionForecast
                  invoices={clientInvoices}
                  payments={clientPayments}
                  compact
                />
              </DashboardPanel>
            </ReportPanel>
            <ReportPanel span={12}>
              <DashboardPanel title="Payment behavior" compact interactive={false} className="client-reports-panel-card">
                <div className="p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <MiniKpi
                      label="On-time"
                      value={paymentLag.sample_size > 0 ? `${paymentLag.on_time_pct.toFixed(0)}%` : '—'}
                      accent={c.success}
                    />
                    <MiniKpi
                      label="Late"
                      value={paymentLag.sample_size > 0 ? `${paymentLag.late_pct.toFixed(0)}%` : '—'}
                      accent={c.error}
                    />
                  </div>
                  {paymentMethods.length === 0 ? (
                    <p className="text-xs text-center py-3" style={{ color: c.secondary }}>
                      No payments in range
                    </p>
                  ) : (
                    paymentMethods.map((method) => (
                      <ReportBarRow
                        key={method.method}
                        label={method.method}
                        value={method.amount}
                        max={maxMethodAmount}
                        color={c.info}
                        display={formatCurrency(method.amount)}
                        sub={`${method.count} pmt`}
                      />
                    ))
                  )}
                </div>
              </DashboardPanel>
            </ReportPanel>
            <ReportPanel span={12}>
              <DashboardPanel title="Collections trend" compact interactive={false} className="client-reports-panel-card">
                <PaymentTrendsChart payments={clientPayments} compact />
              </DashboardPanel>
            </ReportPanel>
          </div>
        )}

        {selectedReportType === 'brokers' && (
          <DashboardPanel
            title="Broker scorecard"
            compact
            interactive
            actionLabel="Aging by broker"
            onAction={() => navigate('/client/collections')}
            className="w-full"
          >
            <div className="p-3 space-y-2.5 border-b" style={{ borderColor: c.border }}>
              {brokers.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: c.secondary }}>
                  No broker activity in this range
                </p>
              ) : (
                brokers.slice(0, 5).map((broker, index) => (
                  <ReportBarRow
                    key={broker.broker_name}
                    label={broker.broker_name}
                    value={broker.open_ar}
                    max={maxBrokerAr}
                    color={bucketColors[index % bucketColors.length]}
                    display={formatCurrency(broker.open_ar)}
                    sub={`${broker.share_of_ar.toFixed(0)}% of A/R · ${broker.open_invoices} open · avg pay ${broker.avg_days_to_pay ?? '—'}d`}
                  />
                ))
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="dashboard-table dashboard-table--compact">
                <thead>
                  <tr>
                    <th>Broker</th>
                    <th className="text-right">Open A/R</th>
                    <th className="text-right">Share</th>
                    <th className="text-right">Collected</th>
                    <th className="text-right">Avg pay</th>
                    <th className="text-right">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {brokers.map((broker) => (
                    <tr key={broker.broker_name}>
                      <td className="font-semibold">
                        <span className="inline-flex items-center gap-2">
                          <span className="truncate max-w-[160px]">{broker.broker_name}</span>
                          {broker.overdue_count > 0 && (
                            <span className="report-broker-flag">{broker.overdue_count} overdue</span>
                          )}
                        </span>
                      </td>
                      <td className="text-right font-medium tabular-nums">
                        {formatCurrency(broker.open_ar)}
                      </td>
                      <td className="text-right tabular-nums">{broker.share_of_ar.toFixed(0)}%</td>
                      <td className="text-right tabular-nums" style={{ color: c.success }}>
                        {formatCurrency(broker.collected_in_range)}
                      </td>
                      <td className="text-right tabular-nums">
                        {broker.avg_days_to_pay !== null ? `${broker.avg_days_to_pay}d` : '—'}
                      </td>
                      <td className="text-right tabular-nums" style={{ color: broker.overdue_amount > 0 ? c.error : c.mutedLight }}>
                        {broker.overdue_amount > 0 ? formatCurrency(broker.overdue_amount) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashboardPanel>
        )}

        {selectedReportType === 'pipeline' && (
          <div className="client-reports-grid grid grid-cols-1 lg:grid-cols-12 gap-3 w-full">
            <ReportPanel span={6}>
            <DashboardPanel title="Submission funnel" compact interactive={false} className="client-reports-panel-card">
              <div className="p-3 space-y-2.5">
                {[
                  { label: 'Submitted', count: pipeline.submitted, amount: 0, color: c.chart.blue },
                  { label: 'Approved / Paid', count: pipeline.approved + pipeline.paid, amount: 0, color: c.success },
                  { label: 'Pending review', count: pipeline.pending, amount: 0, color: c.chart.cyan },
                  { label: 'On hold', count: pipeline.on_hold, amount: 0, color: c.warning },
                  { label: 'Rejected', count: pipeline.rejected, amount: 0, color: c.error },
                ]
                  .filter((row) => row.count > 0)
                  .map((row) => (
                    <ReportBarRow
                      key={row.label}
                      label={row.label}
                      value={row.count}
                      max={pipeline.submitted || 1}
                      color={row.color}
                      display={String(row.count)}
                      sub={
                        pipeline.submitted > 0
                          ? `${((row.count / pipeline.submitted) * 100).toFixed(0)}% of submissions`
                          : undefined
                      }
                    />
                  ))}
              </div>
            </DashboardPanel>
            </ReportPanel>

            <ReportPanel span={6}>
            <DashboardPanel title="Processing health" compact interactive={false} className="client-reports-panel-card">
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <MiniKpi label="Approval rate" value={`${pipeline.approval_rate.toFixed(0)}%`} />
                  <MiniKpi
                    label="Avg approve"
                    value={pipeline.avg_days_to_approve !== null ? `${pipeline.avg_days_to_approve}d` : '—'}
                  />
                  <MiniKpi label="Disputes" value={String(pipeline.dispute_count)} />
                  <MiniKpi
                    label="Open disputes"
                    value={String(pipeline.open_dispute_count)}
                    accent={pipeline.open_dispute_count > 0 ? c.error : undefined}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/client/invoices')}
                  className="dashboard-btn-secondary dashboard-btn-compact w-full justify-center"
                >
                  Invoice queue
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </DashboardPanel>
            </ReportPanel>
          </div>
        )}
        </div>
      </div>
    </ClientLayout>
  )
}
