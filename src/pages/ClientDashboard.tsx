import { useState, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { mockClientDashboardData } from '../data/mockClientDashboard'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import {
  mockClientReportInvoices,
  mockClientReportPayments,
} from '../data/mockClientReports'
import { formatCurrency, formatDate } from '../utils/format'
import {
  DollarSign,
  FileText,
  Clock,
  AlertCircle,
  CheckCircle,
  Upload,
  Plus,
  BarChart3,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react'
import ClientLayout from '../components/ClientLayout'
import SimpleUploadModal from '../components/client/SimpleUploadModal'
import AgingARChart from '../components/client/AgingARChart'
import PaymentTrendsChart from '../components/client/PaymentTrendsChart'
import CollectionForecastKpiCard from '../components/client/CollectionForecastKpiCard'
import DashboardPanel from '../components/client/dashboard/DashboardPanel'
import { enrichInvoices } from '../utils/invoiceAging'
import { useClientTheme } from '../theme/ThemeContext'
import { useClientSession } from '../hooks/useClientSession'
import { useClientCapabilities } from '../hooks/useClientCapabilities'

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

interface CompactMetricProps {
  label: string
  value: number
  icon: ReactNode
  bg: string
  color: string
}

function CompactMetricCard({ label, value, icon, bg, color }: CompactMetricProps) {
  const c = useClientTheme()
  return (
    <div
      className="dashboard-card dashboard-metric-secondary"
      style={{ backgroundColor: bg }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span style={{ color }}>{icon}</span>
        <span className="text-sm font-medium truncate" style={{ color: c.secondary }}>
          {label}
        </span>
      </div>
      <span className="text-xl font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
        {value}
      </span>
    </div>
  )
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
  const [data] = useState(mockClientDashboardData)
  const { clientId, clientName } = useClientSession()
  const { capabilities, tier } = useClientCapabilities()
  const navigate = useNavigate()
  const [showSimpleUpload, setShowSimpleUpload] = useState(false)

  const clientInvoices = useMemo(() => {
    const base = mockInvoices.filter((inv) => inv.client_id === clientId)
    if (clientId !== 'client-1') return base
    const baseIds = new Set(base.map((inv) => inv.id))
    const supplemental = mockClientReportInvoices.filter((inv) => !baseIds.has(inv.id))
    return [...base, ...supplemental]
  }, [clientId])

  const clientPayments = useMemo(() => {
    const ids = new Set(clientInvoices.map((inv) => inv.id))
    const base = mockPayments.filter((p) => ids.has(p.invoice_id))
    if (clientId !== 'client-1') return base
    const baseIds = new Set(base.map((p) => p.id))
    const supplemental = mockClientReportPayments.filter(
      (p) => ids.has(p.invoice_id) && !baseIds.has(p.id)
    )
    return [...base, ...supplemental]
  }, [clientInvoices, clientId])

  const attentionInvoices = useMemo(() => {
    return enrichInvoices(mockInvoices.filter((inv) => inv.client_id === clientId))
      .filter(
        (inv) =>
          inv.isOverdue ||
          inv.status === 'hold' ||
          inv.status === 'pending'
      )
      .sort((a, b) => {
        const severityOrder = (inv: (typeof a)) => {
          if (inv.isForceCloseEligible) return 0
          if (inv.overdueSeverity === 'critical') return 1
          if (inv.overdueSeverity === 'urgent') return 2
          if (inv.isOverdue) return 3
          if (inv.status === 'hold') return 4
          return 5
        }
        const pa = severityOrder(a)
        const pb = severityOrder(b)
        if (pa !== pb) return pa - pb
        return b.daysOutstanding - a.daysOutstanding
      })
      .slice(0, 6)
  }, [clientId])

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
      <div className="space-y-4">
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
        <section className="dashboard-card p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
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

        {/* Row 2 — Primary metrics */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="dashboard-card dashboard-card-interactive dashboard-metric-primary">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: c.secondary }}>
                  Total A/R
                </p>
                <p
                  className="text-[28px] font-bold tabular-nums mt-1 leading-none"
                  style={{ color: c.primary }}
                >
                  {formatCurrency(data.summary.total_ar)}
                </p>
                <div
                  className="inline-flex items-center gap-1 mt-2 text-xs font-medium"
                  style={{ color: c.success }}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  +12% vs last month
                </div>
              </div>
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: c.accentLight, color: c.info }}
              >
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="dashboard-card dashboard-card-interactive p-0 overflow-hidden flex min-h-[88px]">
            <CollectionForecastKpiCard
              invoices={clientInvoices}
              payments={clientPayments}
              onOpenReport={() => navigate('/client/reports')}
            />
          </div>
        </section>

        {/* Row 3 — Compact secondary metrics */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CompactMetricCard
            label="Pending"
            value={data.summary.pending_invoices}
            icon={<Clock className="w-4 h-4" />}
            bg={c.stat.blue}
            color={c.info}
          />
          <CompactMetricCard
            label="Approved"
            value={data.summary.approved_invoices}
            icon={<CheckCircle className="w-4 h-4" />}
            bg={c.stat.green}
            color={c.success}
          />
          <CompactMetricCard
            label="On Hold"
            value={data.summary.on_hold_invoices}
            icon={<AlertCircle className="w-4 h-4" />}
            bg={c.stat.amber}
            color={c.warning}
          />
          <CompactMetricCard
            label="Overdue"
            value={data.summary.overdue_invoices}
            icon={<FileText className="w-4 h-4" />}
            bg={c.stat.red}
            color={c.error}
          />
        </section>

        {/* Row 4 — Invoices (above charts — actionable first) */}
        <DashboardPanel
          title="Invoices Requiring Attention"
          compact
          actionLabel="View all"
          onAction={() => navigate('/client/invoices')}
          interactive={false}
        >
          <div className="overflow-x-auto">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Days Outstanding</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {attentionInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6" style={{ color: c.secondary }}>
                      No invoices require attention
                    </td>
                  </tr>
                ) : (
                  attentionInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="font-semibold">{invoice.invoice_number}</td>
                      <td style={{ color: c.secondary }}>{invoice.broker_name}</td>
                      <td className="tabular-nums">{formatCurrency(invoice.amount)}</td>
                      <td className="tabular-nums">{invoice.daysOutstanding}</td>
                      <td>
                        <StatusPill status={invoice.displayStatus} />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/client/invoices?highlight_invoice=${invoice.id}`)
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
                          style={{ color: c.info }}
                        >
                          View
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DashboardPanel>

        {/* Row 5 — Analytics */}
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <DashboardPanel title="Aging A/R" compact interactive={false}>
            <AgingARChart aging={data.aging_ar} />
          </DashboardPanel>
          <DashboardPanel title="Payment Trends" compact interactive={false}>
            <PaymentTrendsChart payments={clientPayments} />
          </DashboardPanel>
        </section>

        {/* Row 6 — Recent activity */}
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                      <td colSpan={5} className="text-center py-6" style={{ color: c.secondary }}>
                        No recent payments
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
                <p className="text-sm text-center py-3" style={{ color: c.secondary }}>
                  No recent activity
                </p>
              ) : (
                <ul>
                  {data.recent_activity.map((activity) => (
                    <li key={activity.id} className="timeline-item">
                      <span className="timeline-dot" />
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
