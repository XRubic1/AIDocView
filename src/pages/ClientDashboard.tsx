import { useState, useMemo, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { formatCurrency, formatDate } from '../utils/format'
import {
  DollarSign,
  Upload,
  Plus,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
} from 'lucide-react'
import { computeOpenArMonthlyTrend } from '../utils/openArTrend'
import SimpleUploadModal from '../components/client/SimpleUploadModal'
import AgingARChart from '../components/client/AgingARChart'
import PaymentTrendsChart from '../components/client/PaymentTrendsChart'
import CollectionForecastKpiCard from '../components/client/CollectionForecastKpiCard'
import DashboardPanel from '../components/client/dashboard/DashboardPanel'
import ActivityMetricsRow from '../components/client/dashboard/ActivityMetricsRow'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import { computeRequiredActions } from '../utils/clientActivityMetrics'
import { useClientTheme } from '../theme/ThemeContext'
import { useClientSession } from '../hooks/useClientSession'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useCountUp } from '../hooks/useCountUp'
import RefreshIndicator from '../components/ui/RefreshIndicator'
import DataStaleBanner from '../components/ui/DataStaleBanner'
import { SkeletonRows } from '../components/ui/Skeleton'

type InvoiceStatus = 'pending' | 'approved' | 'hold' | 'overdue'

function StatusPill({ status }: { status: InvoiceStatus | string }) {
  const normalized = status === 'hold' ? 'hold' : status
  const classMap: Record<string, string> = {
    pending: 'status-pill status-pill--pending',
    approved: 'status-pill status-pill--approved',
    hold: 'status-pill status-pill--hold',
    overdue: 'status-pill status-pill--overdue',
  }
  const labels: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    hold: 'On Hold',
    overdue: 'Overdue',
  }
  return (
    <span className={classMap[normalized] || classMap.pending}>
      {labels[normalized] || status}
    </span>
  )
}

function getTimelineDotClass(type: string) {
  if (type === 'confirm_payment') return 'timeline-dot timeline-dot--hold'
  if (type === 'held_invoice') return 'timeline-dot timeline-dot--hold'
  if (type === 'overdue_invoice') return 'timeline-dot timeline-dot--overdue'
  if (type.includes('payment')) return 'timeline-dot timeline-dot--payment'
  if (type.includes('hold')) return 'timeline-dot timeline-dot--hold'
  if (type.includes('upload') || type.includes('document')) return 'timeline-dot timeline-dot--upload'
  return 'timeline-dot timeline-dot--default'
}

function getRequiredActionTypeLabel(type: string) {
  if (type === 'confirm_payment') return 'Confirm'
  if (type === 'held_invoice') return 'Held'
  if (type === 'overdue_invoice') return 'Overdue'
  return 'Action'
}

export default function ClientDashboard() {
  const c = useClientTheme()
  const { clientId, clientName } = useClientSession()
  const {
    dashboard: data,
    invoices: rawInvoices,
    payments: clientPayments,
    batches: clientBatches,
    isInitialLoad,
    isRefreshing,
    staleError,
    dismissStaleError,
  } = useClientDemoSnapshot()
  const clientInvoices = useMemo(() => mapClientVisibleInvoices(rawInvoices), [rawInvoices])
  const { capabilities, tier } = useClientCapabilities()
  const navigate = useNavigate()
  const [showSimpleUpload, setShowSimpleUpload] = useState(false)

  const totalArAnimated = useCountUp(data.summary.total_ar, { decimals: 2 })
  const arSparklineGradientId = useId().replace(/:/g, '')

  /** Open A/R month-ends from invoice + payment history (sparkline + MoM %). */
  const openArTrend = useMemo(
    () => computeOpenArMonthlyTrend(clientInvoices, clientPayments, 6),
    [clientInvoices, clientPayments]
  )

  const arMomLabel = useMemo(() => {
    const pct = openArTrend.momPct
    if (pct == null || !Number.isFinite(pct)) return 'No prior month'
    const rounded = Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1)
    const sign = pct > 0 ? '+' : ''
    return `${sign}${rounded}% vs last month`
  }, [openArTrend.momPct])

  const arMomRising = (openArTrend.momPct ?? 0) > 0.05
  const arMomFalling = (openArTrend.momPct ?? 0) < -0.05

  const recentPayments = useMemo(
    () =>
      [...clientPayments]
        .sort((a, b) => new Date(b.received_date).getTime() - new Date(a.received_date).getTime())
        .slice(0, 5),
    [clientPayments]
  )

  const requiredActions = useMemo(
    () =>
      computeRequiredActions(
        { invoices: clientInvoices, payments: clientPayments },
        { includePaymentConfirmation: capabilities.canConfirmPaymentReceipt, limit: 8 }
      ),
    [clientInvoices, clientPayments, capabilities.canConfirmPaymentReceipt]
  )

  const handleSimpleUploadComplete = (files: File[]) => {
    navigate(`/client/batches?tab=create&mode=ai`, { state: { initialFiles: files } })
  }

  return (
    <>
      {staleError && <DataStaleBanner message={staleError} onDismiss={dismissStaleError} />}
      <RefreshIndicator visible={isRefreshing} />
      {isInitialLoad ? (
        <div className="space-y-2 p-1">
          <SkeletonRows rows={4} rowClassName="h-24" />
        </div>
      ) : (
      <div>
        {/* Page header — greeting zone (not a card) */}
        <header className="dashboard-page-header flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pt-2 pb-5 mb-3">
          <div className="min-w-0">
            <h1
              className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight"
              style={{ color: c.primary }}
            >
              Welcome Back, {clientName}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {capabilities.canUseAiUpload && (
              <button
                type="button"
                onClick={() => setShowSimpleUpload(true)}
                className="dashboard-btn-secondary dashboard-btn-compact"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload
              </button>
            )}
            {capabilities.canCreateBatch && (
              <button
                type="button"
                onClick={() => navigate('/client/batches?tab=create')}
                className="dashboard-btn-secondary dashboard-btn-compact"
              >
                <Plus className="w-3.5 h-3.5" />
                Batch
              </button>
            )}
            {!capabilities.canCreateBatch && capabilities.canSubmitDocHandoff && (
              <button
                type="button"
                onClick={() => navigate('/client/batches?tab=create')}
                className="dashboard-btn-secondary dashboard-btn-compact"
              >
                <Upload className="w-3.5 h-3.5" />
                Send documents
              </button>
            )}
            {capabilities.canPostPayment && (
              <button
                type="button"
                onClick={() => navigate('/client/payments')}
                className="dashboard-btn-secondary dashboard-btn-compact"
              >
                <DollarSign className="w-3.5 h-3.5" />
                Post payment
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/client/reports')}
              className="dashboard-btn-secondary dashboard-btn-compact"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Report
            </button>
          </div>
        </header>

        <div className="space-y-2">
        {/* Row 2 — Compact A/R + forecast KPI strip */}
        <section className="dashboard-section-enter dashboard-section-enter--1 grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-2">
          <div className="dashboard-card dashboard-kpi-hero p-0 overflow-hidden flex min-h-[68px]">
            <div className="payment-kpi-card total-ar-kpi-card">
              <div className="payment-kpi-card__body" style={{ cursor: 'default' }}>
                <p className="payment-kpi-card__title" style={{ color: c.secondary }}>
                  Total A/R
                </p>
                <p className="payment-kpi-card__value tabular-nums" style={{ color: c.primary }}>
                  {formatCurrency(totalArAnimated)}
                </p>
                <p
                  className="payment-kpi-card__subtitle inline-flex items-center gap-1"
                  style={{
                    color: arMomFalling
                      ? c.success
                      : arMomRising
                        ? c.warning
                        : c.mutedLight,
                  }}
                  title="Change in open A/R vs prior month-end"
                >
                  {arMomRising ? (
                    <ArrowUpRight className="w-3 h-3" aria-hidden />
                  ) : arMomFalling ? (
                    <ArrowDownRight className="w-3 h-3" aria-hidden />
                  ) : null}
                  {arMomLabel}
                </p>
              </div>
              <div className="payment-kpi-card__sparkline" aria-hidden>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={openArTrend.points}
                    margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id={arSparklineGradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c.accent} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke={c.accent}
                      strokeWidth={2}
                      fill={`url(#${arSparklineGradientId})`}
                      dot={false}
                      isAnimationActive
                      animationDuration={600}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="dashboard-card dashboard-kpi-companion p-0 overflow-hidden flex min-h-[68px]">
            <CollectionForecastKpiCard
              invoices={clientInvoices}
              payments={clientPayments}
              onOpenReport={() => navigate('/client/reports')}
            />
          </div>
        </section>

        {/* Row 3 — Today's activity (last 7 days + standing held/overdue) */}
        <section
          className={`dashboard-section-enter dashboard-section-enter--2 grid grid-cols-2 gap-2 ${
            tier === 'managed' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
          }`}
        >
          <ActivityMetricsRow
            invoices={clientInvoices}
            payments={clientPayments}
            batches={clientBatches}
            clientId={clientId}
            onNavigate={(path) => navigate(path)}
          />
        </section>

        {/* Row 4 — Analytics */}
        <section className="dashboard-section-enter dashboard-section-enter--4 grid grid-cols-1 xl:grid-cols-2 gap-2">
          <DashboardPanel title="Aging A/R" compact interactive={false}>
            <AgingARChart aging={data.aging_ar} />
          </DashboardPanel>
          <DashboardPanel title="Payment Trends" compact interactive={false}>
            <PaymentTrendsChart payments={clientPayments} invoices={clientInvoices} />
          </DashboardPanel>
        </section>

        {/* Row 6 — Recent activity */}
        <section className="dashboard-section-enter dashboard-section-enter--5 grid grid-cols-1 xl:grid-cols-2 gap-2">
          <DashboardPanel
            title="Recent Payments"
            compact
            actionLabel="View all"
            onAction={() => navigate('/client/payments')}
            interactive={false}
          >
            <div className="overflow-x-auto">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Debtor</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="dashboard-empty-state">
                          <DollarSign className="dashboard-empty-state__icon" aria-hidden />
                          <p className="dashboard-empty-state__title">No recent payments</p>
                          <p className="dashboard-empty-state__help">
                            Posted and confirmed payments will appear here
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    recentPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="font-semibold">{payment.invoice_number}</td>
                        <td style={{ color: c.secondary }}>{payment.broker_name}</td>
                        <td style={{ color: c.secondary }}>{formatDate(payment.received_date)}</td>
                        <td className="tabular-nums">{formatCurrency(payment.amount)}</td>
                        <td>
                          <StatusPill
                            status={payment.status === 'confirmed' ? 'approved' : 'pending'}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </DashboardPanel>

          <DashboardPanel title="Required Actions" compact interactive={false}>
            <div className="overflow-x-auto">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Detail</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {requiredActions.length === 0 ? (
                    <tr>
                      <td colSpan={3}>
                        <div className="dashboard-empty-state">
                          <Activity className="dashboard-empty-state__icon" aria-hidden />
                          <p className="dashboard-empty-state__title">No required actions</p>
                          <p className="dashboard-empty-state__help">
                            Payment confirmations, held invoices, and overdue items will appear here
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    requiredActions.map((action) => (
                      <tr
                        key={action.id}
                        className="dashboard-table-row--clickable"
                        onClick={() => navigate(action.navigateTo)}
                      >
                        <td>
                          <span className="inline-flex items-center gap-2 min-w-0">
                            <span
                              className={`${getTimelineDotClass(action.type)} timeline-dot--inline`}
                              aria-hidden
                            />
                            <span className="font-semibold truncate">{action.label}</span>
                          </span>
                        </td>
                        <td style={{ color: c.secondary }} className="truncate">
                          {action.detail}
                        </td>
                        <td>
                          <span
                            className={
                              action.type === 'overdue_invoice'
                                ? 'status-pill status-pill--overdue'
                                : action.type === 'confirm_payment'
                                  ? 'status-pill status-pill--pending'
                                  : 'status-pill status-pill--hold'
                            }
                          >
                            {getRequiredActionTypeLabel(action.type)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </DashboardPanel>
        </section>
        </div>
      </div>
      )}

      <SimpleUploadModal
        isOpen={showSimpleUpload}
        onClose={() => setShowSimpleUpload(false)}
        onUploadComplete={handleSimpleUploadComplete}
        clientId={clientId}
        clientName={clientName}
      />
    </>
  )
}
