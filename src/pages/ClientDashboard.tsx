/**
 * Client dashboard — first glance: Open Balance, Actions, one trend chart.
 * Previous version archived as `ClientDashboardLegacy.tsx`.
 * Phones use `MobileEmptyDashboard` (card-stack home from the same A/R snapshot).
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardActionTable from '../components/client/dashboard/DashboardActionTable'
import { DashboardChartsPanel } from '../components/client/dashboard/DashboardSparkCharts'
import OpenBalanceCard from '../components/client/dashboard/OpenBalanceCard'
import AccountGrowthCard from '../components/client/dashboard/AccountGrowthCard'
import WelcomeHeader from '../components/client/dashboard/WelcomeHeader'
import AIActivitySummary from '../components/client/dashboard/AIActivitySummary'
import AIRecommendations from '../components/client/dashboard/AIRecommendations'
import MobileEmptyDashboard from '../components/client/dashboard/MobileEmptyDashboard'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import { useIsMobileViewport } from '../hooks/useIsMobileViewport'
import { isInvoiceOverdue, isOpenArInvoice } from '../utils/invoiceAging'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../utils/paymentVariance'
import {
  getAwaitingReceiptPayments,
  getReceiptConfirmationDaysLeft,
  isReceiptConfirmationOverdue,
} from '../utils/paymentStatus'
import { formatCurrency } from '../utils/format'
import '../styles/clientDashboard.css'

export default function ClientDashboard() {
  const isPhoneViewport = useIsMobileViewport()
  if (isPhoneViewport) {
    return <MobileEmptyDashboard />
  }
  return <ClientDashboardDesktop />
}

function ClientDashboardDesktop() {
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

  /** Coming due totals + expected-cash invoice list (next 30 days, filterable). */
  const { comingDue, cashForecast } = useMemo(() => {
    const startOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

    const today = startOfDay(new Date())
    const dayMs = 24 * 60 * 60 * 1000
    const end7 = today + 7 * dayMs
    const end14 = today + 14 * dayMs
    const end30 = today + 30 * dayMs

    let amount7 = 0
    let count7 = 0
    let amount14 = 0
    let count14 = 0
    let amount30 = 0
    let count30 = 0

    const forecastItems: Array<{
      id: string
      invoiceNumber: string
      brokerName: string
      amount: number
      expectedDate: string
      daysOut: number
    }> = []

    for (const inv of invoices) {
      if (inv.status !== 'approved' && inv.status !== 'hold') continue
      const balance = getInvoiceOpenArBalance(inv, payments)
      if (balance <= AMOUNT_EPSILON) continue

      const raw = inv.expected_payment_date || inv.due_date
      if (!raw) continue
      const expected = startOfDay(new Date(raw))
      if (Number.isNaN(expected)) continue
      // Only future / today — overdue already past expected date
      if (expected < today) continue

      if (expected <= end30) {
        amount30 += balance
        count30 += 1
        forecastItems.push({
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          brokerName: inv.broker_name || '—',
          amount: balance,
          expectedDate: raw,
          daysOut: Math.round((expected - today) / dayMs),
        })
      }
      if (expected <= end14) {
        amount14 += balance
        count14 += 1
      }
      if (expected <= end7) {
        amount7 += balance
        count7 += 1
      }
    }

    forecastItems.sort((a, b) => {
      if (a.daysOut !== b.daysOut) return a.daysOut - b.daysOut
      return b.amount - a.amount
    })

    return {
      comingDue: {
        next7: { amount: amount7, count: count7 },
        next14: { amount: amount14, count: count14 },
        next30: { amount: amount30, count: count30 },
      },
      cashForecast: forecastItems,
    }
  }, [invoices, payments])

  /** Top open invoices for Open Balance detail column. */
  const topOpenInvoices = useMemo(() => {
    const openRows: Array<{
      id: string
      invoiceNumber: string
      brokerName: string
      amount: number
      meta: string
    }> = []

    for (const inv of invoices) {
      if (!isOpenArInvoice(inv)) continue
      const balance = getInvoiceOpenArBalance(inv, payments)
      if (balance <= AMOUNT_EPSILON) continue

      openRows.push({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        brokerName: inv.broker_name || '—',
        amount: balance,
        meta: isInvoiceOverdue(inv) ? 'Overdue' : 'Open',
      })
    }

    openRows.sort((a, b) => b.amount - a.amount)
    return openRows.slice(0, 3)
  }, [invoices, payments])

  /** Payments awaiting client confirmation — soonest auto-confirm first. */
  const confirmPayments = useMemo(() => {
    return getAwaitingReceiptPayments(payments)
      .map((p) => {
        const daysLeft = getReceiptConfirmationDaysLeft(p)
        const overdue = isReceiptConfirmationOverdue(p)
        return {
          id: p.id,
          invoiceNumber: p.invoice_number,
          brokerName: p.broker_name || '—',
          amount: p.amount,
          daysLeft,
          meta: overdue
            ? 'Auto-confirm soon'
            : daysLeft != null
              ? `${daysLeft}d until auto-confirm`
              : 'Awaiting confirm',
          sortKey: overdue ? -1 : daysLeft ?? 999,
        }
      })
      .sort((a, b) => a.sortKey - b.sortKey || b.amount - a.amount)
      .slice(0, 3)
      .map(({ id, invoiceNumber, brokerName, amount, daysLeft, meta }) => ({
        id,
        invoiceNumber,
        brokerName,
        amount,
        daysLeft,
        meta,
      }))
  }, [payments])

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
    const recs: Array<{
      id: string
      priority: number
      title: string
      reason: string
      action: string
      navigateTo: string
      icon: 'check' | 'alert' | 'upload' | 'idea'
      impactAmount?: number
      meta?: string[]
      tone?: 'info' | 'warn' | 'danger' | 'success'
    }> = []

    // Confirm payments (quick wins)
    const awaitingConfirm = payments.filter((p) => p.status === 'awaiting_receipt')
    if (awaitingConfirm.length > 0) {
      const firstPayment = awaitingConfirm[0]
      const confirmTotal = awaitingConfirm.reduce((s, p) => s + p.amount, 0)
      recs.push({
        id: 'confirm-payment',
        priority: 1,
        title: `Confirm payment for Invoice ${firstPayment.invoice_number}`,
        reason:
          awaitingConfirm.length === 1
            ? `Closes ${formatCurrency(firstPayment.amount)} in open A/R once you confirm receipt.`
            : `${awaitingConfirm.length} payments await confirmation · ${formatCurrency(confirmTotal)} total.`,
        action: awaitingConfirm.length > 1 ? 'Review payments' : 'Confirm now',
        navigateTo: `/client/payments?status=awaiting_receipt&paymentId=${encodeURIComponent(firstPayment.id)}`,
        icon: 'check',
        impactAmount: firstPayment.amount,
        meta: [
          firstPayment.broker_name || 'Broker',
          awaitingConfirm.length > 1 ? `${awaitingConfirm.length} waiting` : 'Receipt due',
        ].filter(Boolean),
        tone: 'success',
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
      const holdBalance = getInvoiceOpenArBalance(oldestHold, payments)
      const holdTotal = holds.reduce((s, inv) => s + getInvoiceOpenArBalance(inv, payments), 0)
      recs.push({
        id: 'oldest-hold',
        priority: daysSinceInvoice > 30 ? 0 : 2,
        title: `Clear hold on Invoice ${oldestHold.invoice_number}`,
        reason:
          holds.length === 1
            ? `On hold for ${daysSinceInvoice} days — resolve docs or dispute so it can invoice.`
            : `Oldest of ${holds.length} holds (${formatCurrency(holdTotal)} open). Aging ${daysSinceInvoice} days.`,
        action: 'View hold',
        navigateTo: `/client/invoices?invoiceId=${oldestHold.id}`,
        icon: 'alert',
        impactAmount: holdBalance > AMOUNT_EPSILON ? holdBalance : oldestHold.amount,
        meta: [
          oldestHold.broker_name || 'Broker',
          `${daysSinceInvoice}d on hold`,
          holds.length > 1 ? `${holds.length} holds` : 'Needs docs',
        ],
        tone: daysSinceInvoice > 30 ? 'danger' : 'warn',
      })
    }

    // Overdue open A/R follow-up
    const overdueInvoices = invoices
      .filter((inv) => isOpenArInvoice(inv) && isInvoiceOverdue(inv))
      .sort((a, b) => {
        const aDate = a.expected_payment_date || a.due_date || a.invoice_date
        const bDate = b.expected_payment_date || b.due_date || b.invoice_date
        return new Date(aDate).getTime() - new Date(bDate).getTime()
      })

    if (overdueInvoices.length > 0) {
      const oldest = overdueInvoices[0]
      const overdueTotal = overdueInvoices.reduce(
        (s, inv) => s + getInvoiceOpenArBalance(inv, payments),
        0
      )
      const expected = oldest.expected_payment_date || oldest.due_date
      const daysOverdue = expected
        ? Math.floor(
            (new Date().getTime() - new Date(expected).getTime()) / (1000 * 60 * 60 * 24)
          )
        : 0
      recs.push({
        id: 'overdue-followup',
        priority: 2,
        title: `Follow up on overdue Invoice ${oldest.invoice_number}`,
        reason:
          overdueInvoices.length === 1
            ? `${daysOverdue} days past expected pay — check broker status.`
            : `${overdueInvoices.length} overdue invoices · ${formatCurrency(overdueTotal)} open.`,
        action: 'Open invoice',
        navigateTo: `/client/invoices?invoiceId=${oldest.id}`,
        icon: 'alert',
        impactAmount: getInvoiceOpenArBalance(oldest, payments),
        meta: [
          oldest.broker_name || 'Broker',
          daysOverdue > 0 ? `${daysOverdue}d overdue` : 'Overdue',
          overdueInvoices.length > 1 ? `${overdueInvoices.length} total` : 'Past due',
        ],
        tone: daysOverdue > 30 ? 'danger' : 'warn',
      })
    }

    // Pending upload (if applicable)
    const pendingBatches = batches.filter(
      (b) => b.status === 'draft' || b.status === 'documents_uploaded'
    )
    if (pendingBatches.length > 0) {
      const batch = pendingBatches[0]
      recs.push({
        id: 'upload-docs',
        priority: 3,
        title: `Finish Batch #${batch.batch_number}`,
        reason:
          pendingBatches.length === 1
            ? 'Draft batch is waiting on paperwork before Credyx can verify.'
            : `${pendingBatches.length} batches need docs or submission.`,
        action: 'Continue upload',
        navigateTo: `/client/batches?tab=create`,
        icon: 'upload',
        meta: [
          batch.status === 'draft' ? 'Draft' : 'Docs uploaded',
          pendingBatches.length > 1 ? `${pendingBatches.length} batches` : 'In progress',
        ],
        tone: 'info',
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

          <AIRecommendations recommendations={recommendations} loading={loading} />

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
              comingDue={comingDue}
              cashForecast={cashForecast}
              topOpenInvoices={topOpenInvoices}
              confirmPayments={confirmPayments}
              loading={loading}
            />
            <AccountGrowthCard invoices={invoices} payments={payments} loading={loading} />
          </aside>

          <DashboardActionTable invoices={invoices} payments={payments} />

          <DashboardChartsPanel invoices={invoices} payments={payments} />
        </div>
      </div>
    </div>
  )
}
