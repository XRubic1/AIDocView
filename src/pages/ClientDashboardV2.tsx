/**
 * Client Dashboard V2 — calm home (light + dark).
 * Answers: How much am I owed? → Is anything wrong? → What should I do?
 * Primary client dashboard (routed at /client/dashboard).
 */
import { useMemo } from 'react'
import SimpleWelcomeBar from '../components/client/dashboard-v2/SimpleWelcomeBar'
import PriorityActionCard, {
  type PriorityRecommendation,
} from '../components/client/dashboard-v2/PriorityActionCard'
import KpiStatRow, {
  type KpiStat,
  type KpiTrend,
} from '../components/client/dashboard-v2/KpiStatRow'
import SimpleActionsList from '../components/client/dashboard-v2/SimpleActionsList'
import SimpleBrokerRiskPanel from '../components/client/dashboard-v2/SimpleBrokerRiskPanel'
import ArTrendPanel from '../components/client/dashboard-v2/ArTrendPanel'
import DashboardListSwipe from '../components/client/dashboard-v2/DashboardListSwipe'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useIsMobileViewport } from '../hooks/useIsMobileViewport'
import { isInvoiceOverdue, isOpenArInvoice } from '../utils/invoiceAging'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../utils/paymentVariance'
import { formatCurrency } from '../utils/format'
import {
  buildComingDueWindows,
  buildConfirmedPaidWindows,
} from '../utils/clientCashWindows'
import '../styles/clientDashboardV2.css'

/** Compare current vs prior with a ±5% deadband. */
function trendFromChange(current: number, previous: number): KpiTrend {
  if (previous <= AMOUNT_EPSILON && current <= AMOUNT_EPSILON) return 'flat'
  if (previous <= AMOUNT_EPSILON) return current > AMOUNT_EPSILON ? 'up' : 'flat'
  if (current > previous * 1.05) return 'up'
  if (current < previous * 0.95) return 'down'
  return 'flat'
}

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export default function ClientDashboardV2() {
  const {
    invoices: rawInvoices,
    payments,
    batches,
    dashboard,
    clientName,
    loading,
  } = useClientDemoSnapshot()
  const invoices = useMemo(() => mapClientVisibleInvoices(rawInvoices), [rawInvoices])
  const isPhoneViewport = useIsMobileViewport()

  /** Overdue open A/R total + count. */
  const { overdueAmount, overdueCount } = useMemo(() => {
    let amount = 0
    let count = 0
    for (const inv of invoices) {
      if (!isOpenArInvoice(inv) || !isInvoiceOverdue(inv)) continue
      const balance = getInvoiceOpenArBalance(inv, payments)
      if (balance <= AMOUNT_EPSILON) continue
      amount += balance
      count += 1
    }
    return { overdueAmount: amount, overdueCount: count }
  }, [invoices, payments])

  /** Expected cash in the next 7 / 14 / 30 days (approved/hold, not confirmed). */
  const comingDue = useMemo(
    () => buildComingDueWindows(invoices, payments),
    [invoices, payments]
  )
  const comingDue30 = comingDue.next30

  /** Confirmed pay-date invoices in the last 7 / 14 / 30 days. */
  const paidRecent = useMemo(
    () => buildConfirmedPaidWindows(invoices, payments),
    [invoices, payments]
  )

  /**
   * Period comparisons for KPI trend arrows.
   * Open Balance: estimate 30d-ago open from net invoiced − collected.
   * Overdue: open A/R that was already past due 30 days ago.
   * Coming due: expected pay that fell in the prior 30-day window.
   * Confirmed pay: Will Pay dates in the prior 30-day window.
   */
  const kpiTrends = useMemo(() => {
    const now = new Date()
    const today = startOfDayMs(now)
    const dayMs = 24 * 60 * 60 * 1000
    const thirtyDaysAgo = today - 30 * dayMs

    let invoiced30 = 0
    let collected30 = 0
    let overduePrior = 0
    let comingDuePrior = 0
    let confirmedPayPrior = 0

    for (const inv of invoices) {
      const invDay = startOfDayMs(new Date(inv.invoice_date))
      if (invDay >= thirtyDaysAgo && invDay < today) {
        invoiced30 += inv.amount
      }

      if (!isOpenArInvoice(inv)) continue
      const balance = getInvoiceOpenArBalance(inv, payments)
      if (balance <= AMOUNT_EPSILON) continue

      if (inv.collection_status === 'W/P' && inv.collection_date) {
        const payDay = startOfDayMs(new Date(inv.collection_date))
        if (!Number.isNaN(payDay) && payDay >= thirtyDaysAgo && payDay < today) {
          confirmedPayPrior += balance
        }
      }

      const dueRaw = inv.due_date
      if (!dueRaw) continue
      const dueDay = startOfDayMs(new Date(dueRaw))
      if (Number.isNaN(dueDay)) continue

      // Would already have been overdue 30 days ago
      if (dueDay < thirtyDaysAgo) overduePrior += balance
      // Was coming due (by due date) in the prior 30-day window
      if (dueDay >= thirtyDaysAgo && dueDay < today && inv.collection_status !== 'W/P') {
        comingDuePrior += balance
      }
    }

    for (const p of payments) {
      if (p.status !== 'confirmed') continue
      const received = startOfDayMs(new Date(p.received_date))
      if (received >= thirtyDaysAgo && received < today) collected30 += p.amount
    }

    const openNow = dashboard.summary.total_ar
    const openPrior = Math.max(0, openNow - invoiced30 + collected30)

    return {
      open: trendFromChange(openNow, openPrior),
      overdue: trendFromChange(overdueAmount, overduePrior),
      coming: trendFromChange(comingDue30.amount, comingDuePrior),
      paid: trendFromChange(paidRecent.next30.amount, confirmedPayPrior),
    }
  }, [
    invoices,
    payments,
    dashboard.summary.total_ar,
    overdueAmount,
    comingDue30.amount,
    paidRecent.next30.amount,
  ])

  /** Compact “since you were away” line for the header. */
  const awaySummary = useMemo(() => {
    const daysAway: number = 2 // TODO: track actual last login
    const cutoff = new Date(Date.now() - daysAway * 24 * 60 * 60 * 1000)

    const recentPayments = payments.filter(
      (p) => p.status === 'confirmed' && new Date(p.received_date) >= cutoff
    )
    const recentPaymentsAmount = recentPayments.reduce((sum, p) => sum + p.amount, 0)
    const newHolds = invoices.filter(
      (inv) =>
        inv.status === 'hold' && inv.updated_at && new Date(inv.updated_at) >= cutoff
    ).length
    const recentBatches = batches.filter((b) => new Date(b.submitted_at) >= cutoff).length

    const parts: string[] = []
    if (recentPayments.length > 0) {
      parts.push(
        `${recentPayments.length} payment${recentPayments.length === 1 ? '' : 's'} in (${formatCurrency(recentPaymentsAmount)})`
      )
    }
    if (newHolds > 0) {
      parts.push(`${newHolds} new hold${newHolds === 1 ? '' : 's'}`)
    }
    if (recentBatches > 0) {
      parts.push(`${recentBatches} batch${recentBatches === 1 ? '' : 'es'} processed`)
    }

    const when = daysAway <= 1 ? 'yesterday' : `the last ${daysAway} days`
    if (parts.length === 0) return ''
    return `Since ${when}: ${parts.join(' · ')}`
  }, [invoices, payments, batches])

  /** Ranked recommendations with view-all + Ask AI prompts. */
  const recommendations = useMemo((): PriorityRecommendation[] => {
    const recs: PriorityRecommendation[] = []

    const awaitingConfirm = payments.filter((p) => p.status === 'awaiting_receipt')
    if (awaitingConfirm.length > 0) {
      const first = awaitingConfirm[0]
      const confirmTotal = awaitingConfirm.reduce((s, p) => s + p.amount, 0)
      recs.push({
        id: 'confirm-payment',
        title: `Confirm payment for Invoice ${first.invoice_number}`,
        reason:
          awaitingConfirm.length === 1
            ? `Closes ${formatCurrency(first.amount)} in open A/R once you confirm receipt.`
            : `${awaitingConfirm.length} payments await confirmation · ${formatCurrency(confirmTotal)} total.`,
        action: awaitingConfirm.length > 1 ? 'Review payments' : 'Confirm now',
        navigateTo: `/client/payments?status=awaiting_receipt&paymentId=${encodeURIComponent(first.id)}`,
        icon: 'check',
        impactAmount: first.amount,
        meta: [
          first.broker_name || 'Broker',
          awaitingConfirm.length > 1 ? `${awaitingConfirm.length} waiting` : 'Receipt due',
        ],
        tone: 'success',
        viewAllLabel:
          awaitingConfirm.length > 1
            ? `View all ${awaitingConfirm.length} to confirm`
            : undefined,
        viewAllTo:
          awaitingConfirm.length > 1
            ? '/client/payments?status=awaiting_receipt'
            : undefined,
        askAiPrompt: `I need to confirm receipt for Invoice ${first.invoice_number} (${formatCurrency(first.amount)}, ${first.broker_name || 'broker'}). Walk me through what to check before I confirm.`,
      })
    }

    const holds = invoices
      .filter((inv) => inv.status === 'hold' && isOpenArInvoice(inv))
      .sort((a, b) => new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime())

    if (holds.length > 0) {
      const oldest = holds[0]
      const daysSinceInvoice = Math.floor(
        (Date.now() - new Date(oldest.invoice_date).getTime()) / (1000 * 60 * 60 * 24)
      )
      const holdBalance = getInvoiceOpenArBalance(oldest, payments)
      const holdTotal = holds.reduce((s, inv) => s + getInvoiceOpenArBalance(inv, payments), 0)
      recs.push({
        id: 'oldest-hold',
        title: `Clear hold on Invoice ${oldest.invoice_number}`,
        reason:
          holds.length === 1
            ? `On hold for ${daysSinceInvoice} days — still in open A/R until released.`
            : `Oldest of ${holds.length} holds (${formatCurrency(holdTotal)} open). Aging ${daysSinceInvoice} days.`,
        action: 'View hold',
        navigateTo: `/client/invoices?invoiceId=${oldest.id}`,
        icon: 'alert',
        impactAmount: holdBalance > AMOUNT_EPSILON ? holdBalance : oldest.amount,
        meta: [
          oldest.broker_name || 'Broker',
          `${daysSinceInvoice}d on hold`,
          holds.length > 1 ? `${holds.length} holds` : 'Needs docs',
        ],
        tone: daysSinceInvoice > 30 ? 'danger' : 'warn',
        viewAllLabel: holds.length > 1 ? `View all ${holds.length} holds` : undefined,
        viewAllTo: holds.length > 1 ? '/client/invoices?status=hold' : undefined,
        askAiPrompt: `Invoice ${oldest.invoice_number} is on hold with ${oldest.broker_name || 'the broker'} (${formatCurrency(holdBalance > AMOUNT_EPSILON ? holdBalance : oldest.amount)}). What docs or next steps usually clear this?`,
      })
    }

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
        ? Math.floor((Date.now() - new Date(expected).getTime()) / (1000 * 60 * 60 * 24))
        : 0
      recs.push({
        id: 'overdue-followup',
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
        viewAllLabel:
          overdueInvoices.length > 1
            ? `View all ${overdueInvoices.length} overdue`
            : undefined,
        viewAllTo:
          overdueInvoices.length > 1 ? '/client/invoices?status=overdue' : undefined,
        askAiPrompt: `Invoice ${oldest.invoice_number} is ${daysOverdue} days overdue (${formatCurrency(getInvoiceOpenArBalance(oldest, payments))}, ${oldest.broker_name || 'broker'}). Suggest a follow-up plan.`,
      })
    }

    const pendingBatches = batches.filter(
      (b) => b.status === 'draft' || b.status === 'documents_uploaded'
    )
    if (pendingBatches.length > 0) {
      const batch = pendingBatches[0]
      recs.push({
        id: 'upload-docs',
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
        viewAllLabel:
          pendingBatches.length > 1
            ? `View all ${pendingBatches.length} batches`
            : undefined,
        viewAllTo: pendingBatches.length > 1 ? '/client/batches' : undefined,
        askAiPrompt: `I have Batch #${batch.batch_number} waiting on paperwork. What documents do I typically need to submit so Credyx can verify?`,
      })
    }

    return recs.sort((a, b) => {
      const rank = (r: PriorityRecommendation) => {
        if (r.id === 'oldest-hold' && r.tone === 'danger') return 0
        if (r.id === 'confirm-payment') return 1
        if (r.id === 'oldest-hold') return 2
        if (r.id === 'overdue-followup') return 3
        return 4
      }
      return rank(a) - rank(b)
    })
  }, [invoices, payments, batches])

  const kpiStats = useMemo((): KpiStat[] => {
    const comingBucket = comingDue.next30
    const paidBucket = paidRecent.next30

    return [
      {
        key: 'open',
        label: 'Open Balance',
        amount: dashboard.summary.total_ar,
        navigateTo: '/client/invoices',
        tone: 'neutral',
        trend: kpiTrends.open,
      },
      {
        key: 'overdue',
        label: 'Overdue',
        amount: overdueAmount,
        sub: overdueCount > 0 ? String(overdueCount) : undefined,
        navigateTo: '/client/invoices?status=overdue',
        tone: overdueCount > 0 ? 'danger' : 'neutral',
        trend: kpiTrends.overdue,
      },
      {
        key: 'coming',
        label: 'Coming due',
        amount: comingBucket.amount,
        sub: comingBucket.count > 0 ? String(comingBucket.count) : undefined,
        navigateTo: '/client/invoices?status=approved',
        tone: 'neutral',
        trend: kpiTrends.coming,
      },
      {
        key: 'paid',
        label: 'Confirmed pay',
        amount: paidBucket.amount,
        sub: paidBucket.count > 0 ? String(paidBucket.count) : undefined,
        navigateTo: '/client/invoices',
        tone: 'success',
        trend: kpiTrends.paid,
      },
    ]
  }, [
    dashboard.summary.total_ar,
    overdueAmount,
    overdueCount,
    comingDue,
    paidRecent,
    kpiTrends,
  ])

  return (
    <div className="client-dashboard-v2">
      {/* Frame grows with content so the wave bg covers the full scroll height */}
      <div className="client-dashboard-v2__frame">
        <div className="client-dashboard-v2__bg" aria-hidden>
          <div className="client-dashboard-v2__waves" />
          <div className="client-dashboard-v2__waves client-dashboard-v2__waves--slow" />
          <div className="client-dashboard-v2__glow" />
        </div>

        <div className="client-dashboard-v2__inner">
          {!isPhoneViewport ? (
            <SimpleWelcomeBar
              carrierName={clientName || 'Carrier'}
              awaySummary={awaySummary}
              loading={loading}
            />
          ) : null}

          <PriorityActionCard
            recommendations={recommendations}
            loading={loading}
            swipeable={isPhoneViewport}
          />

          <KpiStatRow stats={kpiStats} loading={loading} />

          <div className="client-dashboard-v2__body">
            {isPhoneViewport ? (
              <DashboardListSwipe>
                <SimpleBrokerRiskPanel
                  invoices={invoices}
                  payments={payments}
                  loading={loading}
                />
                <SimpleActionsList invoices={invoices} payments={payments} loading={loading} />
              </DashboardListSwipe>
            ) : (
              <>
                <SimpleBrokerRiskPanel
                  invoices={invoices}
                  payments={payments}
                  loading={loading}
                />
                <SimpleActionsList invoices={invoices} payments={payments} loading={loading} />
              </>
            )}
            <ArTrendPanel
              invoices={invoices}
              payments={payments}
              aging={dashboard.aging_ar}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
