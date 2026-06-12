import { useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { mockClientDashboardData } from '../data/mockClientDashboard'
import { useClientSession } from '../hooks/useClientSession'
import { mockPayments } from '../data/mockPayments'
import { mockInvoices } from '../data/mockInvoices'
import {
  mockClientReportInvoices,
  mockClientReportPayments,
} from '../data/mockClientReports'
import { formatCurrency } from '../utils/format'
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
  ExternalLink,
} from 'lucide-react'
import ClientLayout from '../components/ClientLayout'
import DashboardPanel from '../components/client/dashboard/DashboardPanel'
import AgingARChart from '../components/client/AgingARChart'
import PaymentTrendsChart from '../components/client/PaymentTrendsChart'
import CashFlowChart from '../components/client/CashFlowChart'
import CashCollectionForecast from '../components/client/CashCollectionForecast'
import { useClientTheme } from '../theme/ThemeContext'
import { enrichInvoices } from '../utils/invoiceAging'
import {
  computeOpenArAging,
  computeBrokerScores,
  computeCashFlowTrend,
  computePipelineMetrics,
  computePaymentLag,
  computePeriodSummary,
  generateReportInsights,
  getPresetRange,
  type DateRange,
  type ReportInsight,
} from '../utils/clientReports'
import { computeCashCollectionForecast } from '../utils/cashCollectionForecast'

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

function InsightStrip({ insights }: { insights: ReportInsight[] }) {
  if (insights.length === 0) return null
  return (
    <div className="report-insight-strip">
      {insights.slice(0, 2).map((insight) => (
        <div key={insight.id} className={`report-insight-strip__item report-insight-strip__item--${insight.tone}`}>
          <span className="report-insight-strip__title">{insight.title}</span>
          <span className="report-insight-strip__sep">·</span>
          <span className="report-insight-strip__body">{insight.body}</span>
        </div>
      ))}
    </div>
  )
}

function DsoRing({ dso, compact = false, target = 30 }: { dso: number | null; compact?: boolean; target?: number }) {
  const c = useClientTheme()
  const pct = dso !== null ? Math.min(100, (dso / (target * 2)) * 100) : 0
  const ringColor = dso === null ? c.chartGrid : dso <= target ? c.success : dso <= target * 1.5 ? c.warning : c.error

  return (
    <div className={`flex flex-col items-center justify-center ${compact ? 'py-2' : 'py-4'}`}>
      <div
        className={compact ? 'report-dso-ring report-dso-ring--compact' : 'report-dso-ring'}
        style={{
          background: `conic-gradient(${ringColor} ${pct}%, ${c.chartGrid} 0)`,
        }}
      >
        <div className="report-dso-ring__inner">
          <span
            className={`font-bold tabular-nums ${compact ? 'text-xl' : 'text-3xl'}`}
            style={{ color: c.primary }}
          >
            {dso ?? '—'}
          </span>
          <span className="text-[10px] font-medium mt-0.5" style={{ color: c.secondary }}>
            days DSO
          </span>
        </div>
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

export default function ClientReports() {
  const c = useClientTheme()
  const navigate = useNavigate()
  const [data] = useState(mockClientDashboardData)
  const { clientId, clientName } = useClientSession()
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('overview')
  const [datePreset, setDatePreset] = useState<DatePreset | 'custom'>('90d')
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange('90d'))

  const clientInvoices = useMemo(() => {
    const base = mockInvoices.filter((inv) => inv.client_id === clientId)
    if (clientId !== 'client-1') return base
    // Merge date-relative demo data so charts and period filters stay populated
    const baseIds = new Set(base.map((inv) => inv.id))
    const supplemental = mockClientReportInvoices.filter((inv) => !baseIds.has(inv.id))
    return [...base, ...supplemental]
  }, [clientId])

  const clientInvoiceIds = useMemo(
    () => new Set(clientInvoices.map((inv) => inv.id)),
    [clientInvoices]
  )

  const clientPayments = useMemo(() => {
    const base = mockPayments.filter((p) => clientInvoiceIds.has(p.invoice_id))
    if (clientId !== 'client-1') return base
    const baseIds = new Set(base.map((p) => p.id))
    const supplemental = mockClientReportPayments.filter(
      (p) => clientInvoiceIds.has(p.invoice_id) && !baseIds.has(p.id)
    )
    return [...base, ...supplemental]
  }, [clientInvoiceIds, clientId])

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

  const insights = useMemo(
    () =>
      generateReportInsights({
        summary,
        aging,
        brokers,
        pipeline,
        paymentLag,
        cashFlow,
      }),
    [summary, aging, brokers, pipeline, paymentLag, cashFlow]
  )

  /** Invoices needing attention — overdue, hold, pending — sorted by severity */
  const attentionInvoices = useMemo(() => {
    return enrichInvoices(clientInvoices)
      .filter((inv) => inv.isOverdue || inv.status === 'hold' || inv.status === 'pending')
      .sort((a, b) => {
        const order = (inv: typeof a) => {
          if (inv.isForceCloseEligible) return 0
          if (inv.overdueSeverity === 'critical') return 1
          if (inv.overdueSeverity === 'urgent') return 2
          if (inv.isOverdue) return 3
          if (inv.status === 'hold') return 4
          return 5
        }
        const diff = order(a) - order(b)
        return diff !== 0 ? diff : b.daysOutstanding - a.daysOutstanding
      })
      .slice(0, 6)
  }, [clientInvoices])

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
        csvContent = 'Metric,Value\n'
        csvContent += `Open A/R,${summary.open_ar}\n`
        csvContent += `DSO (days),${summary.dso ?? ''}\n`
        csvContent += `Invoiced in range,${summary.invoiced}\n`
        csvContent += `Collected in range,${summary.collected}\n`
        csvContent += `Collection rate,${summary.collection_rate.toFixed(1)}%\n`
        filename = `executive_summary_${dateRange.start_date}_to_${dateRange.end_date}.csv`
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
  }, [selectedReportType, summary, aging, cashFlow, brokers, pipeline, dateRange])

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
    <ClientLayout clientName={clientName} clientId={clientId}>
      <div className="client-reports-page w-full min-w-0 space-y-3">
        <div
          className="client-reports-chrome client-page-toolbar px-3 py-2 border rounded-xl w-full"
          style={{ borderColor: c.border, backgroundColor: c.card }}
        >
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2">
            <div
              className="client-segmented-control client-reports-segmented"
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

            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 shrink-0">
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
              <button type="button" onClick={handleExportCSV} className="dashboard-btn-secondary dashboard-btn-compact shrink-0">
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
            </div>
          </div>
        </div>

        <section
          className="client-stat-strip client-reports-stat-strip grid grid-cols-2 lg:grid-cols-4 border rounded-xl overflow-hidden w-full"
          style={{ borderColor: c.border }}
        >
          {selectedReportType === 'overview' && (
            <>
              <StatStripCell label="Open A/R" value={formatCurrency(summary.open_ar)} icon={DollarSign} bg={c.stat.blue} iconColor={c.info} />
              <StatStripCell label="DSO" value={summary.dso !== null ? `${summary.dso}d` : '—'} icon={Clock} bg={c.stat.amber} iconColor={c.warning} />
              <StatStripCell label="Collected" value={formatCurrency(summary.collected)} icon={TrendingUp} bg={c.stat.green} iconColor={c.success} />
              <StatStripCell label="Collection rate" value={`${summary.collection_rate.toFixed(0)}%`} icon={BarChart3} bg={c.stat.slate} iconColor={c.secondary} />
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
          <InsightStrip insights={insights} />
        )}

        {selectedReportType === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 w-full">
            <div className="lg:col-span-5">
              <DashboardPanel title="Invoiced vs collected" compact interactive={false}>
                <CashFlowChart data={cashFlow} compact />
              </DashboardPanel>
            </div>
            <div className="lg:col-span-3">
              <DashboardPanel title="DSO & period" compact interactive={false}>
                <DsoRing dso={summary.dso} compact />
                <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                  <MiniKpi label="Invoiced" value={formatCurrency(summary.invoiced)} />
                  <MiniKpi label="Collected" value={formatCurrency(summary.collected)} accent={c.success} />
                  <MiniKpi
                    label="Outstanding"
                    value={formatCurrency(Math.max(0, summary.invoiced - summary.collected))}
                    accent={c.warning}
                  />
                  <MiniKpi
                    label="Overdue"
                    value={formatCurrency(aging.overdue_amount)}
                    accent={c.error}
                  />
                </div>
              </DashboardPanel>
            </div>
            <div className="lg:col-span-4">
              <DashboardPanel
                title="Open A/R"
                compact
                interactive
                actionLabel="Aging A/R"
                onAction={() => navigate('/client/collections')}
              >
                <AgingARChart aging={aging.aging_ar} compact />
                <div className="px-3 pb-3 space-y-2">
                  {aging.buckets
                    .filter((b) => b.amount > 0)
                    .slice(0, 4)
                    .map((bucket, i) => (
                      <ReportBarRow
                        key={bucket.id}
                        label={`${bucket.label}d`}
                        value={bucket.amount}
                        max={maxAgingAmount}
                        color={bucketColors[i % bucketColors.length]}
                        display={formatCurrency(bucket.amount)}
                      />
                    ))}
                </div>
              </DashboardPanel>
            </div>
          </div>
        )}

        {/* ── Overview Row 2 — Broker spotlight | Pipeline snapshot | Payment behavior ── */}
        {selectedReportType === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 w-full">

            {/* Broker spotlight */}
            <DashboardPanel
              title="Brokers"
              compact
              interactive
              actionLabel="Full scorecard"
              onAction={() => setSelectedReportType('brokers')}
            >
              <div className="p-3 space-y-2.5">
                {brokers.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: c.secondary }}>
                    No broker activity in this range
                  </p>
                ) : (
                  brokers.slice(0, 4).map((broker, i) => (
                    <ReportBarRow
                      key={broker.broker_name}
                      label={broker.broker_name}
                      value={broker.open_ar}
                      max={maxBrokerAr}
                      color={bucketColors[i % bucketColors.length]}
                      display={formatCurrency(broker.open_ar)}
                      sub={
                        broker.avg_days_to_pay !== null
                          ? `avg ${broker.avg_days_to_pay}d · ${broker.share_of_ar.toFixed(0)}% of A/R`
                          : `${broker.share_of_ar.toFixed(0)}% of open A/R`
                      }
                    />
                  ))
                )}
              </div>
            </DashboardPanel>

            {/* Pipeline snapshot */}
            <DashboardPanel
              title="Pipeline"
              compact
              interactive
              actionLabel="View invoices"
              onAction={() => navigate('/client/invoices')}
            >
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <MiniKpi label="Pending" value={String(pipeline.pending)} />
                  <MiniKpi label="On hold" value={String(pipeline.on_hold)} accent={pipeline.on_hold > 0 ? c.warning : undefined} />
                  <MiniKpi label="Approval rate" value={`${pipeline.approval_rate.toFixed(0)}%`} accent={pipeline.approval_rate >= 80 ? c.success : c.warning} />
                  <MiniKpi
                    label="Open disputes"
                    value={String(pipeline.open_dispute_count)}
                    accent={pipeline.open_dispute_count > 0 ? c.error : undefined}
                  />
                </div>
                {pipeline.avg_days_to_approve !== null && (
                  <p className="text-[11px]" style={{ color: c.secondary }}>
                    Avg approve time: <span className="font-semibold" style={{ color: c.primary }}>{pipeline.avg_days_to_approve}d</span>
                  </p>
                )}
                {pipeline.submitted === 0 && (
                  <p className="text-xs text-center" style={{ color: c.secondary }}>
                    No invoices submitted in range
                  </p>
                )}
              </div>
            </DashboardPanel>

            {/* Payment behavior */}
            <DashboardPanel
              title="Payment behavior"
              compact
              interactive
              actionLabel="Cash flow"
              onAction={() => setSelectedReportType('cashflow')}
            >
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <MiniKpi
                    label="On-time"
                    value={paymentLag.sample_size > 0 ? `${paymentLag.on_time_pct.toFixed(0)}%` : '—'}
                    accent={c.success}
                  />
                  <MiniKpi
                    label="Late"
                    value={paymentLag.sample_size > 0 ? `${paymentLag.late_pct.toFixed(0)}%` : '—'}
                    accent={paymentLag.late_pct > 0 ? c.error : undefined}
                  />
                </div>
                {paymentLag.avg_days !== null && (
                  <p className="text-[11px]" style={{ color: c.secondary }}>
                    Avg lag: <span className="font-semibold" style={{ color: c.primary }}>{paymentLag.avg_days}d</span>
                    {' past expected pay'}
                  </p>
                )}
                {paymentMethods.length > 0 ? (
                  <div className="space-y-2">
                    {paymentMethods.map((method) => (
                      <ReportBarRow
                        key={method.method}
                        label={method.method}
                        value={method.amount}
                        max={Math.max(...paymentMethods.map((m) => m.amount), 1)}
                        color={c.info}
                        display={formatCurrency(method.amount)}
                        sub={`${method.count} pmt`}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-center py-1" style={{ color: c.secondary }}>
                    No confirmed payments in range
                  </p>
                )}
              </div>
            </DashboardPanel>

          </div>
        )}

        {/* ── Overview Row 3 — Collections trend | Invoices needing attention ── */}
        {selectedReportType === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 w-full">

            {/* Collections trend */}
            <div className="lg:col-span-7">
              <DashboardPanel title="Collections trend" compact interactive={false}>
                <PaymentTrendsChart payments={clientPayments} compact />
              </DashboardPanel>
            </div>

            {/* Invoices needing attention */}
            <div className="lg:col-span-5">
              <DashboardPanel
                title="Needs attention"
                compact
                interactive
                actionLabel="All invoices"
                onAction={() => navigate('/client/invoices')}
              >
                {attentionInvoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center mb-2"
                      style={{ backgroundColor: c.stat.green, color: c.success }}
                    >
                      <Activity className="w-4 h-4" />
                    </div>
                    <p className="text-sm font-medium" style={{ color: c.primary }}>All clear</p>
                    <p className="text-xs mt-0.5" style={{ color: c.secondary }}>No invoices require attention</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="dashboard-table dashboard-table--compact">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Broker</th>
                          <th className="text-right">Amount</th>
                          <th>Status</th>
                          <th className="text-center w-8"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {attentionInvoices.map((invoice) => {
                          const statusClass =
                            invoice.isOverdue ? 'status-pill status-pill--overdue'
                            : invoice.status === 'hold' ? 'status-pill status-pill--hold'
                            : 'status-pill status-pill--pending'
                          const statusLabel =
                            invoice.isOverdue ? `${invoice.daysOutstanding}d overdue`
                            : invoice.status === 'hold' ? 'On Hold'
                            : 'Pending'
                          return (
                            <tr key={invoice.id}>
                              <td className="font-semibold">{invoice.invoice_number}</td>
                              <td className="truncate max-w-[120px]" style={{ color: c.secondary }}>
                                {invoice.broker_name}
                              </td>
                              <td className="text-right tabular-nums font-medium">
                                {formatCurrency(invoice.amount)}
                              </td>
                              <td>
                                <span className={`${statusClass} status-pill--compact`}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(`/client/invoices?highlight_invoice=${invoice.id}`)
                                  }
                                  className="p-1 rounded transition-opacity hover:opacity-70"
                                  style={{ color: c.info }}
                                  title="View invoice"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </DashboardPanel>
            </div>

          </div>
        )}

        {selectedReportType === 'aging' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 w-full">
            <DashboardPanel
              title="A/R distribution"
              compact
              interactive
              actionLabel="View invoices"
              onAction={() => navigate('/client/collections')}
            >
              <AgingARChart aging={aging.aging_ar} compact />
            </DashboardPanel>
            <DashboardPanel title="Bucket detail" compact interactive={false}>
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
          </div>
        )}

        {selectedReportType === 'cashflow' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 w-full">
            <div className="lg:col-span-6">
              <DashboardPanel title="Cash flow" compact interactive={false}>
                <CashFlowChart data={cashFlow} compact />
              </DashboardPanel>
            </div>
            <div className="lg:col-span-6">
              <DashboardPanel title="Collection forecast" compact interactive={false}>
                <CashCollectionForecast
                  invoices={clientInvoices}
                  payments={clientPayments}
                  compact
                />
              </DashboardPanel>
            </div>
            <div className="lg:col-span-12">
              <DashboardPanel title="Payment behavior" compact interactive={false}>
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
            </div>
            <div className="lg:col-span-12">
              <DashboardPanel title="Collections trend" compact interactive={false}>
                <PaymentTrendsChart payments={clientPayments} compact />
              </DashboardPanel>
            </div>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 w-full">
            <DashboardPanel title="Submission funnel" compact interactive={false}>
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

            <DashboardPanel title="Processing health" compact interactive={false}>
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
          </div>
        )}
      </div>
    </ClientLayout>
  )
}
