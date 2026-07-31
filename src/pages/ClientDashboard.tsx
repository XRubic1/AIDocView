/**
 * Client dashboard — first glance: Open Balance, Actions, one trend chart.
 * Previous version archived as `ClientDashboardLegacy.tsx`.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardActionTable from '../components/client/dashboard/DashboardActionTable'
import { DashboardChartsPanel } from '../components/client/dashboard/DashboardSparkCharts'
import OpenBalanceCard from '../components/client/dashboard/OpenBalanceCard'
import WelcomeHeader from '../components/client/dashboard/WelcomeHeader'
import AIActivitySummary from '../components/client/dashboard/AIActivitySummary'
import AIRecommendations from '../components/client/dashboard/AIRecommendations'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import { isInvoiceOverdue, isOpenArInvoice } from '../utils/invoiceAging'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../utils/paymentVariance'
import { formatCurrency } from '../utils/format'
import '../styles/clientDashboard.css'

export default function ClientDashboard() {
  const {
    invoices: rawInvoices,
    payments,
    batches,
    dashboard,
    clientName,
    loading,
  } = useClientDemoSnapshot()
  const invoices = useMemo(() => mapClientVisibleInvoices(rawInvoices), [rawInvoices])
  const { capabilities } = useClientCapabilities()
  const navigate = useNavigate()

  /** On-time + overdue open A/R — same basis as Open Balance (reconciles). */
  const { onTimeAmount, overdueAmount, onTimeCount, overdueCount } = useMemo(() => {
    let onTime = 0
    let overdue = 0
    let onTimeN = 0
    let overdueN = 0
    for (const inv of invoices) {
      if (!isOpenArInvoice(inv)) continue
      const balance = getInvoiceOpenArBalance(inv, payments)
      if (balance <= AMOUNT_EPSILON) continue
      if (isInvoiceOverdue(inv)) {
        overdue += balance
        overdueN += 1
      } else {
        onTime += balance
        onTimeN += 1
      }
    }
    return {
      onTimeAmount: onTime,
      overdueAmount: overdue,
      onTimeCount: onTimeN,
      overdueCount: overdueN,
    }
  }, [invoices, payments])

  /** Status stat chips for Open Balance card. */
  const statusChips = useMemo(() => {
    const heldCount = invoices.filter((inv) => inv.status === 'hold' && isOpenArInvoice(inv)).length
    const heldAmount = invoices
      .filter((inv) => inv.status === 'hold' && isOpenArInvoice(inv))
      .reduce((sum, inv) => sum + getInvoiceOpenArBalance(inv, payments), 0)

    const overdueInvoices = invoices.filter((inv) => isInvoiceOverdue(inv) && isOpenArInvoice(inv))
    const overdueCount = overdueInvoices.length
    const overdueAmt = overdueInvoices.reduce(
      (sum, inv) => sum + getInvoiceOpenArBalance(inv, payments),
      0
    )

    const awaitingCount = invoices.filter(
      (inv) => inv.status === 'approved' && isOpenArInvoice(inv) && !isInvoiceOverdue(inv)
    ).length
    const awaitingAmount = invoices
      .filter((inv) => inv.status === 'approved' && isOpenArInvoice(inv) && !isInvoiceOverdue(inv))
      .reduce((sum, inv) => sum + getInvoiceOpenArBalance(inv, payments), 0)

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const paid30dCount = payments.filter(
      (p) => p.status === 'confirmed' && new Date(p.received_date) >= thirtyDaysAgo
    ).length
    const paid30dAmount = payments
      .filter((p) => p.status === 'confirmed' && new Date(p.received_date) >= thirtyDaysAgo)
      .reduce((sum, p) => sum + p.amount, 0)

    return [
      {
        key: 'held',
        label: 'Held',
        value: formatCurrency(heldAmount),
        count: heldCount,
        tone: 'warn' as const,
        navigateTo: '/client/invoices?status=hold',
      },
      {
        key: 'overdue',
        label: 'Overdue',
        value: formatCurrency(overdueAmt),
        count: overdueCount,
        tone: 'danger' as const,
        navigateTo: '/client/invoices?status=overdue',
      },
      {
        key: 'awaiting',
        label: 'Awaiting',
        value: formatCurrency(awaitingAmount),
        count: awaitingCount,
        tone: 'info' as const,
        navigateTo: '/client/invoices?status=approved',
      },
      {
        key: 'paid30d',
        label: 'Paid 30d',
        value: formatCurrency(paid30dAmount),
        count: paid30dCount,
        tone: 'success' as const,
        navigateTo: '/client/payments',
      },
    ]
  }, [invoices, payments])

  /** Recent collections context. */
  const recentCollections = useMemo(() => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    const last30 = payments
      .filter((p) => p.status === 'confirmed' && new Date(p.received_date) >= thirtyDaysAgo)
      .reduce((sum, p) => sum + p.amount, 0)

    const prev30 = payments
      .filter(
        (p) =>
          p.status === 'confirmed' &&
          new Date(p.received_date) >= sixtyDaysAgo &&
          new Date(p.received_date) < thirtyDaysAgo
      )
      .reduce((sum, p) => sum + p.amount, 0)

    let trend: 'up' | 'down' | 'flat' = 'flat'
    if (last30 > prev30 * 1.05) trend = 'up'
    else if (last30 < prev30 * 0.95) trend = 'down'

    return { amount: last30, period: 'last 30 days', trend }
  }, [payments])

  /** AI activity summary (what happened since last login). */
  const activitySummary = useMemo(() => {
    const daysSinceLastLogin = 2 // TODO: Track actual last login
    const now = new Date()
    const cutoff = new Date(now.getTime() - daysSinceLastLogin * 24 * 60 * 60 * 1000)

    const recentPayments = payments.filter(
      (p) => p.status === 'confirmed' && new Date(p.received_date) >= cutoff
    )
    const recentPaymentsAmount = recentPayments.reduce((sum, p) => sum + p.amount, 0)

    const recentBatches = batches.filter((b) => new Date(b.submitted_at) >= cutoff)

    const newApproved = invoices.filter(
      (inv) =>
        inv.status === 'approved' &&
        inv.updated_at &&
        new Date(inv.updated_at) >= cutoff
    ).length

    const newHolds = invoices.filter(
      (inv) =>
        inv.status === 'hold' &&
        inv.updated_at &&
        new Date(inv.updated_at) >= cutoff
    ).length

    const activities = []

    if (recentPayments.length > 0) {
      activities.push({
        type: 'payment' as const,
        label: `${recentPayments.length} payments received`,
        detail: `(${formatCurrency(recentPaymentsAmount)})`,
        icon: 'payment' as const,
        tone: 'success' as const,
      })
    }

    if (recentBatches.length > 0) {
      const totalInvoices = recentBatches.reduce((sum, b) => sum + (b.total_invoices || 0), 0)
      activities.push({
        type: 'batch' as const,
        label: `Batch #${recentBatches[0].batch_number} processed`,
        detail: `(${totalInvoices} invoices)`,
        icon: 'batch' as const,
        tone: 'info' as const,
      })
    }

    if (newApproved > 0) {
      activities.push({
        type: 'status_change' as const,
        label: `${newApproved} invoices moved to approved`,
        detail: '',
        icon: 'change' as const,
        tone: 'success' as const,
      })
    }

    if (newHolds > 0) {
      activities.push({
        type: 'hold' as const,
        label: `${newHolds} new hold${newHolds > 1 ? 's' : ''} need attention`,
        detail: '',
        icon: 'alert' as const,
        tone: 'warn' as const,
      })
    }

    return { activities, daysSinceLastLogin }
  }, [invoices, payments, batches])

  /** AI recommendations (what to do next). */
  const recommendations = useMemo(() => {
    const recs = []

    // Confirm payments (quick wins)
    const awaitingConfirm = payments.filter((p) => p.status === 'awaiting_receipt')
    if (awaitingConfirm.length > 0) {
      const firstPayment = awaitingConfirm[0]
      recs.push({
        id: 'confirm-payment',
        priority: 1,
        title: `Confirm payment for Invoice ${firstPayment.invoice_number}`,
        reason: `Closes ${formatCurrency(firstPayment.amount)} quickly`,
        action: 'Confirm now',
        navigateTo: `/client/payments?status=awaiting_receipt&paymentId=${encodeURIComponent(firstPayment.id)}`,
        icon: 'check' as const,
      })
    }

    // Oldest hold
    const holds = invoices
      .filter((inv) => inv.status === 'hold' && isOpenArInvoice(inv))
      .sort((a, b) => new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime())
    
    if (holds.length > 0) {
      const oldestHold = holds[0]
      const daysSinceInvoice = Math.floor(
        (new Date().getTime() - new Date(oldestHold.invoice_date).getTime()) / (1000 * 60 * 60 * 24)
      )
      recs.push({
        id: 'oldest-hold',
        priority: 2,
        title: `Follow up on Invoice ${oldestHold.invoice_number} hold`,
        reason: `Aging ${daysSinceInvoice} days`,
        action: 'View details',
        navigateTo: `/client/invoices?invoiceId=${oldestHold.id}`,
        icon: 'alert' as const,
      })
    }

    // Pending upload (if applicable)
    const pendingBatches = batches.filter(
      (b) => b.status === 'draft' || b.status === 'documents_uploaded'
    )
    if (pendingBatches.length > 0) {
      recs.push({
        id: 'upload-docs',
        priority: 3,
        title: `Upload docs for Batch #${pendingBatches[0].batch_number}`,
        reason: 'Waiting on you',
        action: 'Upload now',
        navigateTo: `/client/batches?tab=create`,
        icon: 'upload' as const,
      })
    }

    return recs.sort((a, b) => a.priority - b.priority)
  }, [invoices, payments, batches])

  return (
    <div className="client-dashboard">
      <div className="client-dashboard__bg" aria-hidden>
        <div className="client-dashboard__waves" />
        <div className="client-dashboard__waves client-dashboard__waves--slow" />
        <div className="client-dashboard__glow" />
      </div>

      <div className="client-dashboard__content">
        <div className="client-dashboard__header-zone">
          <WelcomeHeader
            carrierName={clientName}
            loading={loading}
            onUpload={
              capabilities.canUseAiUpload ? () => navigate('/client/batches?tab=create') : undefined
            }
            onPostPayment={capabilities.canPostPayment ? () => navigate('/client/payments') : undefined}
            onViewReport={() => navigate('/client/reports')}
            onAskAI={() => navigate('/client/assistant')}
            canUpload={capabilities.canUseAiUpload}
            canPostPayment={capabilities.canPostPayment}
          />

          <AIActivitySummary
            activities={activitySummary.activities}
            daysSinceLastLogin={activitySummary.daysSinceLastLogin}
            loading={loading}
          />
        </div>

        <div className="client-dashboard__body">
          <aside className="client-dashboard__rail" aria-label="Account summary">
            <OpenBalanceCard
              amount={dashboard.summary.total_ar}
              onTimeAmount={onTimeAmount}
              overdueAmount={overdueAmount}
              onTimeCount={onTimeCount}
              overdueCount={overdueCount}
              aging={dashboard.aging_ar}
              statusChips={statusChips}
              recentCollections={recentCollections}
              loading={loading}
            />
            <div className="client-dashboard__recommendations">
              <AIRecommendations recommendations={recommendations} loading={loading} />
            </div>
          </aside>

          <div className="client-dashboard__mid" aria-label="Actions">
            <DashboardActionTable invoices={invoices} payments={payments} />
          </div>

          <DashboardChartsPanel invoices={invoices} payments={payments} />
        </div>
      </div>
    </div>
  )
}
