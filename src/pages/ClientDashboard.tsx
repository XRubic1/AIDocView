import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatCurrency, formatDate } from '../utils/format'
import {
  DollarSign,
  Upload,
  Plus,
  BarChart3,
  ArrowUpRight,
  Activity,
} from 'lucide-react'
import ClientLayout from '../components/ClientLayout'
import SimpleUploadModal from '../components/client/SimpleUploadModal'
import AgingARChart from '../components/client/AgingARChart'
import PaymentTrendsChart from '../components/client/PaymentTrendsChart'
import CollectionForecastKpiCard from '../components/client/CollectionForecastKpiCard'
import DashboardPanel from '../components/client/dashboard/DashboardPanel'
import ActivityMetricsRow from '../components/client/dashboard/ActivityMetricsRow'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
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

function InlineSparkline({ values, stroke }: { values: number[]; stroke: string }) {
  if (values.length < 2) return null

  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const width = 72
  const height = 22

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const y = height - ((value - min) / range) * (height - 4) - 2
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg className="dashboard-inline-sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

function getTimelineDotClass(type: string) {
  if (type.includes('payment')) return 'timeline-dot timeline-dot--payment'
  if (type.includes('hold')) return 'timeline-dot timeline-dot--hold'
  if (type.includes('upload') || type.includes('document')) return 'timeline-dot timeline-dot--upload'
  return 'timeline-dot timeline-dot--default'
}

function formatRelativeTime(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(iso)
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

  const invoicedSparkline = useMemo(() => {
    const now = new Date()
    const months: number[] = []

    for (let offset = 5; offset >= 0; offset -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      const year = monthDate.getFullYear()
      const month = monthDate.getMonth()
      const total = clientInvoices
        .filter((invoice) => {
          const invoiceDate = new Date(invoice.invoice_date)
          return invoiceDate.getFullYear() === year && invoiceDate.getMonth() === month
        })
        .reduce((sum, invoice) => sum + invoice.amount, 0)
      months.push(total)
    }

    return months
  }, [clientInvoices])

  const recentPayments = useMemo(
    () =>
      [...clientPayments]
        .sort((a, b) => new Date(b.received_date).getTime() - new Date(a.received_date).getTime())
        .slice(0, 5),
    [clientPayments]
  )

  const handleSimpleUploadComplete = (files: File[]) => {
    navigate(`/client/batches?tab=create&mode=ai`, { state: { initialFiles: files } })
  }

  return (
    <ClientLayout clientName={clientName} clientId={clientId}>
      {staleError && <DataStaleBanner message={staleError} onDismiss={dismissStaleError} />}
      <RefreshIndicator visible={isRefreshing} />
      {isInitialLoad ? (
        <div className="space-y-3 p-1">
          <SkeletonRows rows={4} rowClassName="h-24" />
        </div>
      ) : (
      <div className="space-y-3">
        {tier === 'managed' && (
          <section
            className="dashboard-card px-4 py-3 text-sm"
            style={{ backgroundColor: c.stat.amber, color: c.secondary }}
          >
            Your Credyx team handles batch processing and collections. Use{' '}
            <strong>Send documents</strong> to upload paperwork.
          </section>
        )}

        {/* Row 1 — Compact welcome */}
        <section className="dashboard-card px-5 py-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: c.primary }}>
              Welcome Back, {clientName}
            </h1>
            <p className="alert-inline mt-1">
              <span className="alert-inline__danger">
                {data.summary.overdue_invoices} Overdue
              </span>
              <span className="mx-1.5" style={{ color: c.border }}>
                •
              </span>
              <span className="alert-inline__warning">
                {data.summary.on_hold_invoices} On Hold
              </span>
              <span className="mx-1.5" style={{ color: c.border }}>
                •
              </span>
              <span className="alert-inline__info">
                {data.summary.pending_invoices} Pending
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {capabilities.canUseAiUpload && (
              <button
                type="button"
                onClick={() => setShowSimpleUpload(true)}
                className="dashboard-btn-primary"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload
              </button>
            )}
            {capabilities.canCreateBatch && (
              <button
                type="button"
                onClick={() => navigate('/client/batches?tab=create')}
                className="dashboard-btn-secondary"
              >
                <Plus className="w-3.5 h-3.5" />
                Batch
              </button>
            )}
            {!capabilities.canCreateBatch && capabilities.canSubmitDocHandoff && (
              <button
                type="button"
                onClick={() => navigate('/client/batches?tab=create')}
                className="dashboard-btn-primary"
              >
                <Upload className="w-3.5 h-3.5" />
                Send documents
              </button>
            )}
            {capabilities.canPostPayment && (
              <button
                type="button"
                onClick={() => navigate('/client/payments')}
                className="dashboard-btn-secondary"
              >
                <DollarSign className="w-3.5 h-3.5" />
                Post payment
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/client/reports')}
              className="dashboard-btn-secondary"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Report
            </button>
          </div>
        </section>

        {/* Row 2 — Hero KPI */}
        <section className="dashboard-section-enter dashboard-section-enter--1 grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-3">
          <div className="dashboard-card dashboard-kpi-hero">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: c.secondary }}>
                  Total A/R
                </p>
                <p
                  className="dashboard-kpi-hero__value tabular-nums"
                  style={{ color: c.primary }}
                >
                  {formatCurrency(totalArAnimated)}
                </p>
                <div className="dashboard-kpi-hero__footer">
                  <span className="dashboard-kpi-hero__trend" style={{ color: c.success }}>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    +12% vs last month
                  </span>
                  <InlineSparkline values={invoicedSparkline} stroke={c.accent} />
                </div>
              </div>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: c.card, color: c.accent, border: `1px solid ${c.border}` }}
              >
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="dashboard-card dashboard-kpi-companion p-0 overflow-hidden flex min-h-[104px]">
            <CollectionForecastKpiCard
              invoices={clientInvoices}
              payments={clientPayments}
              onOpenReport={() => navigate('/client/reports')}
            />
          </div>
        </section>

        {/* Row 3 — Today's activity (last 7 days + standing held/overdue) */}
        <section className="dashboard-section-enter dashboard-section-enter--2 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ActivityMetricsRow
            invoices={clientInvoices}
            payments={clientPayments}
            batches={clientBatches}
            clientId={clientId}
            onNavigate={(path) => navigate(path)}
          />
        </section>

        {/* Row 4 — Analytics */}
        <section className="dashboard-section-enter dashboard-section-enter--4 grid grid-cols-1 xl:grid-cols-2 gap-3">
          <DashboardPanel title="Aging A/R" compact interactive={false}>
            <AgingARChart aging={data.aging_ar} />
          </DashboardPanel>
          <DashboardPanel title="Payment Trends" compact interactive={false}>
            <PaymentTrendsChart payments={clientPayments} />
          </DashboardPanel>
        </section>

        {/* Row 6 — Recent activity */}
        <section className="dashboard-section-enter dashboard-section-enter--5 grid grid-cols-1 xl:grid-cols-2 gap-3">
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

          <DashboardPanel title="Recent Actions" compact interactive={false}>
            <div className="p-5">
              {data.recent_activity.length === 0 ? (
                <div className="dashboard-empty-state py-4">
                  <Activity className="dashboard-empty-state__icon" aria-hidden />
                  <p className="dashboard-empty-state__title">No recent activity</p>
                  <p className="dashboard-empty-state__help">
                    Payments, approvals, and uploads will show up here
                  </p>
                </div>
              ) : (
                <ul>
                  {data.recent_activity.map((activity) => (
                    <li key={activity.id} className="timeline-item">
                      <span className={getTimelineDotClass(activity.type)} />
                      <p className="text-sm font-medium" style={{ color: c.primary }}>
                        {activity.description}
                      </p>
                      <p className="text-xs font-medium mt-0.5" style={{ color: c.secondary }}>
                        {formatRelativeTime(activity.timestamp)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DashboardPanel>
        </section>
      </div>
      )}

      <SimpleUploadModal
        isOpen={showSimpleUpload}
        onClose={() => setShowSimpleUpload(false)}
        onUploadComplete={handleSimpleUploadComplete}
        clientId={clientId}
        clientName={clientName}
      />
    </ClientLayout>
  )
}
