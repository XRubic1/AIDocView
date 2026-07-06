import { useMemo, useState, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { formatCurrency, formatDate } from '../utils/format'
import {
  FileText,
  Download,
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Clock,
  AlertTriangle,
  ArrowRight,
  Activity,
  Receipt,
  type LucideIcon,
} from 'lucide-react'
import ClientLayout from '../components/ClientLayout'
import DashboardPanel from '../components/client/dashboard/DashboardPanel'
import AgingARChart from '../components/client/AgingARChart'
import PaymentTrendsChart from '../components/client/PaymentTrendsChart'
import CashFlowChart from '../components/client/CashFlowChart'
import CashCollectionForecast from '../components/client/CashCollectionForecast'
import CollectionsColumnChart from '../components/client/reports/CollectionsColumnChart'
import CollectionsPeriodRing from '../components/client/reports/CollectionsPeriodRing'
import SubmissionFunnelBar from '../components/client/reports/SubmissionFunnelBar'
import { useClientTheme } from '../theme/ThemeContext'
import {
  computeOpenArAging,
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
  buildOverviewCsvRows,
} from '../utils/clientOverviewReports'
import { useClientSession } from '../hooks/useClientSession'

type ReportType = 'overview' | 'aging' | 'cashflow'

type DatePreset = 'mtd' | '30d' | '90d' | 'ytd'

const BUCKET_COLORS = (c: ReturnType<typeof useClientTheme>) =>
  [c.chart.blue, c.chart.cyan, c.chart.purple, c.chart.amber, c.chart.orange, c.chart.red] as const

/** Previous period of equal length ending the day before the current range starts. */
function getPreviousEqualRange(range: DateRange): DateRange {
  const start = new Date(`${range.start_date}T00:00:00`)
  const end = new Date(`${range.end_date}T00:00:00`)
  const durationMs = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - 86_400_000)
  const prevStart = new Date(prevEnd.getTime() - durationMs)
  return {
    start_date: prevStart.toISOString().split('T')[0],
    end_date: prevEnd.toISOString().split('T')[0],
  }
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : 100
  return ((current - previous) / previous) * 100
}

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
  accentColor,
  trend,
}: {
  label: string
  value: string
  icon: LucideIcon
  accentColor: string
  trend?: { pct: number; invert?: boolean } | null
}) {
  const c = useClientTheme()
  const showTrend = trend != null && Number.isFinite(trend.pct) && Math.abs(trend.pct) >= 0.5
  const favorable = trend
    ? trend.invert
      ? trend.pct < 0
      : trend.pct > 0
    : false
  const unfavorable = trend
    ? trend.invert
      ? trend.pct > 0
      : trend.pct < 0
    : false

  return (
    <div
      className="report-stat-cell report-stat-cell--accent flex flex-col justify-center gap-0.5 px-3 py-2 sm:border-r border-b sm:border-b-0 last:border-r-0"
      style={{ borderColor: c.border, ['--report-stat-accent' as string]: accentColor }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="w-3 h-3 shrink-0" style={{ color: accentColor }} />
          <span className="text-[11px] font-medium truncate" style={{ color: c.secondary }}>
            {label}
          </span>
        </div>
        <span className="report-stat-cell__value shrink-0 text-right" style={{ color: c.primary }}>
          {value}
        </span>
      </div>
      {showTrend && trend && (
        <span
          className={`report-stat-trend ${
            favorable ? 'report-stat-trend--up' : unfavorable ? 'report-stat-trend--down' : ''
          }`}
          style={!favorable && !unfavorable ? { color: c.mutedLight } : undefined}
        >
          {trend.pct > 0 ? (
            <TrendingUp className="w-2.5 h-2.5" aria-hidden />
          ) : trend.pct < 0 ? (
            <TrendingDown className="w-2.5 h-2.5" aria-hidden />
          ) : null}
          {Math.abs(trend.pct).toFixed(0)}% vs prior
        </span>
      )}
    </div>
  )
}

function ReportPanel({
  children,
  span = 12,
  enterIndex = 0,
}: {
  children: ReactNode
  span?: 3 | 4 | 5 | 6 | 7 | 12
  enterIndex?: number
}) {
  const spanClass: Record<number, string> = {
    3: 'lg:col-span-3',
    4: 'lg:col-span-4',
    5: 'lg:col-span-5',
    6: 'lg:col-span-6',
    7: 'lg:col-span-7',
    12: 'lg:col-span-12',
  }
  const enterClass = `dashboard-section-enter dashboard-section-enter--${Math.min(enterIndex, 5)}`
  return (
    <div className={`client-reports-panel ${spanClass[span] ?? 'lg:col-span-12'} ${enterClass}`}>
      {children}
    </div>
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

  const previousRange = useMemo(() => getPreviousEqualRange(dateRange), [dateRange])
  const prevEndDate = useMemo(
    () => new Date(`${previousRange.end_date}T00:00:00`),
    [previousRange.end_date]
  )

  const aging = useMemo(() => computeOpenArAging(clientInvoices), [clientInvoices])
  const prevAging = useMemo(
    () => computeOpenArAging(clientInvoices, prevEndDate),
    [clientInvoices, prevEndDate]
  )
  const summary = useMemo(
    () => computePeriodSummary(clientInvoices, clientPayments, dateRange),
    [clientInvoices, clientPayments, dateRange]
  )
  const prevSummary = useMemo(
    () => computePeriodSummary(clientInvoices, clientPayments, previousRange),
    [clientInvoices, clientPayments, previousRange]
  )
  const cashFlow = useMemo(
    () => computeCashFlowTrend(clientInvoices, clientPayments, 6),
    [clientInvoices, clientPayments]
  )
  const collectionForecast = useMemo(
    () => computeCashCollectionForecast(clientInvoices, clientPayments),
    [clientInvoices, clientPayments]
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

  const bucketColors = BUCKET_COLORS(c)
  const maxAgingAmount = Math.max(...aging.buckets.map((b) => b.amount), 1)
  const periodOutstanding = Math.max(0, summary.invoiced - summary.collected)

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
          concentration: {
            top_broker_name: null,
            top_broker_ar: 0,
            top_broker_pct: 0,
            top3_pct: 0,
            is_elevated: false,
          },
          brokerRiskRows: [],
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
    dateRange,
    taxReport,
    paymentLag,
    collectionForecast,
  ])

  const reportTabs: { id: ReportType; label: string; icon: LucideIcon }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'aging', label: 'A/R Aging', icon: Clock },
    { id: 'cashflow', label: 'Cash Flow', icon: Wallet },
  ]

  const inputCompactStyle = {
    backgroundColor: c.card,
    height: 28,
    paddingTop: 4,
    paddingBottom: 4,
    fontSize: 12,
  } as const

  const collectedTrend = pctChange(summary.collected, prevSummary.collected)
  const dsoTrend =
    summary.dso !== null && prevSummary.dso !== null
      ? pctChange(summary.dso, prevSummary.dso)
      : null
  const overdueTrend = pctChange(aging.overdue_amount, prevAging.overdue_amount)
  const collectionRateTrend = pctChange(summary.collection_rate, prevSummary.collection_rate)
  const invoicedTrend = pctChange(summary.invoiced, prevSummary.invoiced)
  const openArTrend = pctChange(aging.total_ar, prevAging.total_ar)

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
            <div className="client-reports-date-group">
              <div
                className="client-segmented-control client-reports-date-presets"
                role="group"
                aria-label="Date presets"
              >
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
                    className={`client-segmented-control__btn ${
                      datePreset === preset.id ? 'client-segmented-control__btn--active' : ''
                    }`}
                    style={
                      datePreset === preset.id
                        ? { color: c.accent, backgroundColor: `${c.accent}14` }
                        : undefined
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="client-reports-date-inputs">
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
                <span className="text-[11px] font-medium" style={{ color: c.mutedLight }}>
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
              </div>
            </div>
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
          key={selectedReportType}
          className="client-stat-strip client-reports-stat-strip grid grid-cols-2 lg:grid-cols-4 border-b shrink-0"
          style={{ borderColor: c.border }}
        >
          {selectedReportType === 'overview' && (
            <>
              <StatStripCell
                label="Collected"
                value={formatCurrency(summary.collected)}
                icon={TrendingUp}
                accentColor={c.success}
                trend={collectedTrend != null ? { pct: collectedTrend } : null}
              />
              <StatStripCell
                label="DSO"
                value={summary.dso !== null ? `${summary.dso}d` : '—'}
                icon={Clock}
                accentColor={c.info}
                trend={dsoTrend != null ? { pct: dsoTrend, invert: true } : null}
              />
              <StatStripCell
                label="Overdue"
                value={formatCurrency(aging.overdue_amount)}
                icon={AlertTriangle}
                accentColor={c.error}
                trend={overdueTrend != null ? { pct: overdueTrend, invert: true } : null}
              />
              <StatStripCell
                label="Collection rate"
                value={`${summary.collection_rate.toFixed(0)}%`}
                icon={BarChart3}
                accentColor={c.warning}
                trend={collectionRateTrend != null ? { pct: collectionRateTrend } : null}
              />
            </>
          )}
          {selectedReportType === 'aging' && (
            <>
              <StatStripCell
                label="Open A/R"
                value={formatCurrency(aging.total_ar)}
                icon={DollarSign}
                accentColor={c.info}
                trend={openArTrend != null ? { pct: openArTrend, invert: true } : null}
              />
              <StatStripCell
                label="Open invoices"
                value={String(aging.total_invoices)}
                icon={FileText}
                accentColor={c.secondary}
              />
              <StatStripCell
                label="Overdue"
                value={formatCurrency(aging.overdue_amount)}
                icon={AlertTriangle}
                accentColor={c.error}
                trend={overdueTrend != null ? { pct: overdueTrend, invert: true } : null}
              />
              <StatStripCell
                label="91+ days"
                value={formatCurrency(aging.aging_ar.over_91)}
                icon={Clock}
                accentColor={c.warning}
              />
            </>
          )}
          {selectedReportType === 'cashflow' && (
            <>
              <StatStripCell
                label="Invoiced"
                value={formatCurrency(summary.invoiced)}
                icon={FileText}
                accentColor={c.info}
                trend={invoicedTrend != null ? { pct: invoicedTrend } : null}
              />
              <StatStripCell
                label="Collected"
                value={formatCurrency(summary.collected)}
                icon={DollarSign}
                accentColor={c.success}
                trend={collectedTrend != null ? { pct: collectedTrend } : null}
              />
              <StatStripCell
                label="Expected 7d"
                value={formatCurrency(collectionForecast.next_7_days)}
                icon={TrendingUp}
                accentColor={c.warning}
              />
              <StatStripCell
                label="Expected 30d"
                value={formatCurrency(collectionForecast.next_30_days)}
                icon={Wallet}
                accentColor={c.secondary}
              />
            </>
          )}
        </section>

        <div key={`body-${selectedReportType}`} className="client-reports-body flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {selectedReportType === 'overview' && (
            <div className="client-reports-grid grid grid-cols-1 lg:grid-cols-12 gap-3 w-full">
              <ReportPanel span={7} enterIndex={0}>
                <DashboardPanel
                  title="Cash flow trend"
                  icon={TrendingUp}
                  iconTone="blue"
                  compact
                  interactive={false}
                  className="client-reports-panel-card"
                >
                  <CashFlowChart data={cashFlow} compact />
                </DashboardPanel>
              </ReportPanel>

              <ReportPanel span={5} enterIndex={1}>
                <DashboardPanel
                  title="Expected collections"
                  icon={Wallet}
                  iconTone="green"
                  compact
                  interactive
                  actionLabel="Cash flow"
                  onAction={() => setSelectedReportType('cashflow')}
                  className="client-reports-panel-card"
                >
                  <CollectionsPeriodRing
                    collected={summary.collected}
                    outstanding={periodOutstanding}
                    compact
                  />
                </DashboardPanel>
              </ReportPanel>

              <ReportPanel span={6} enterIndex={2}>
                <DashboardPanel
                  title="Collections effectiveness"
                  icon={BarChart3}
                  iconTone="blue"
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
                        value={formatCurrency(periodOutstanding)}
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
                    <CollectionsColumnChart data={collectionsByMonth} />
                  </div>
                </DashboardPanel>
              </ReportPanel>

              <ReportPanel span={6} enterIndex={3}>
                <DashboardPanel
                  title="A/R aging snapshot"
                  icon={Clock}
                  iconTone="amber"
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

              <ReportPanel span={6} enterIndex={4}>
                <DashboardPanel
                  title="Processing health"
                  icon={Activity}
                  iconTone="cyan"
                  compact
                  interactive={false}
                  className="client-reports-panel-card"
                >
                  <div className="p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <MiniKpi label="Approval rate" value={`${pipeline.approval_rate.toFixed(0)}%`} />
                      <MiniKpi
                        label="Avg approve"
                        value={pipeline.avg_days_to_approve !== null ? `${pipeline.avg_days_to_approve}d` : '—'}
                      />
                      <MiniKpi label="On hold" value={String(pipeline.on_hold)} accent={pipeline.on_hold > 0 ? c.warning : undefined} />
                      <MiniKpi
                        label="Open disputes"
                        value={String(pipeline.open_dispute_count)}
                        accent={pipeline.open_dispute_count > 0 ? c.error : undefined}
                      />
                    </div>
                    <SubmissionFunnelBar pipeline={pipeline} />
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

              <ReportPanel span={6} enterIndex={5}>
                <DashboardPanel
                  title="Tax & revenue (1099)"
                  icon={Receipt}
                  iconTone="slate"
                  compact
                  interactive={false}
                  className="client-reports-panel-card"
                >
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
              <ReportPanel span={6} enterIndex={0}>
                <DashboardPanel
                  title="A/R distribution"
                  icon={BarChart3}
                  iconTone="amber"
                  compact
                  interactive
                  actionLabel="View invoices"
                  onAction={() => navigate('/client/collections')}
                  className="client-reports-panel-card"
                >
                  <AgingARChart aging={aging.aging_ar} compact />
                </DashboardPanel>
              </ReportPanel>
              <ReportPanel span={6} enterIndex={1}>
                <DashboardPanel
                  title="Bucket detail"
                  icon={Clock}
                  iconTone="blue"
                  compact
                  interactive={false}
                  className="client-reports-panel-card"
                >
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
              <ReportPanel span={6} enterIndex={0}>
                <DashboardPanel
                  title="Cash flow"
                  icon={TrendingUp}
                  iconTone="blue"
                  compact
                  interactive={false}
                  className="client-reports-panel-card"
                >
                  <CashFlowChart data={cashFlow} compact />
                </DashboardPanel>
              </ReportPanel>
              <ReportPanel span={6} enterIndex={1}>
                <DashboardPanel
                  title="Collection forecast"
                  icon={Wallet}
                  iconTone="green"
                  compact
                  interactive={false}
                  className="client-reports-panel-card"
                >
                  <CashCollectionForecast
                    invoices={clientInvoices}
                    payments={clientPayments}
                    compact
                  />
                </DashboardPanel>
              </ReportPanel>
              <ReportPanel span={12} enterIndex={2}>
                <DashboardPanel
                  title="Payment behavior"
                  icon={DollarSign}
                  iconTone="purple"
                  compact
                  interactive={false}
                  className="client-reports-panel-card"
                >
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
              <ReportPanel span={12} enterIndex={3}>
                <DashboardPanel
                  title="Collections trend"
                  icon={Activity}
                  iconTone="cyan"
                  compact
                  interactive={false}
                  className="client-reports-panel-card"
                >
                  <PaymentTrendsChart payments={clientPayments} compact />
                </DashboardPanel>
              </ReportPanel>
            </div>
          )}
        </div>
      </div>
    </ClientLayout>
  )
}
