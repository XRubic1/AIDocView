/**
 * Client dashboard — first glance: Open Balance, Actions, one trend chart.
 * Previous version archived as `ClientDashboardLegacy.tsx`.
 */
import { useMemo } from 'react'
import DashboardActionTable from '../components/client/dashboard/DashboardActionTable'
import { DashboardChartsPanel } from '../components/client/dashboard/DashboardSparkCharts'
import OpenBalanceCard from '../components/client/dashboard/OpenBalanceCard'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { isInvoiceOverdue, isOpenArInvoice } from '../utils/invoiceAging'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../utils/paymentVariance'
import { formatCurrency } from '../utils/format'
import '../styles/clientDashboard.css'

export default function ClientDashboard() {
  const {
    invoices: rawInvoices,
    payments,
    dashboard,
    clientName,
    loading,
  } = useClientDemoSnapshot()
  const invoices = useMemo(() => mapClientVisibleInvoices(rawInvoices), [rawInvoices])

  /** On-time + overdue open A/R — same basis as Open Balance (reconciles). */
  const { onTimeAmount, overdueAmount } = useMemo(() => {
    let onTime = 0
    let overdue = 0
    for (const inv of invoices) {
      if (!isOpenArInvoice(inv)) continue
      const balance = getInvoiceOpenArBalance(inv, payments)
      if (balance <= AMOUNT_EPSILON) continue
      if (isInvoiceOverdue(inv)) overdue += balance
      else onTime += balance
    }
    return { onTimeAmount: onTime, overdueAmount: overdue }
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

  return (
    <div className="client-dashboard">
      <div className="client-dashboard__bg" aria-hidden>
        <div className="client-dashboard__waves" />
        <div className="client-dashboard__waves client-dashboard__waves--slow" />
        <div className="client-dashboard__glow" />
      </div>

      <div className="client-dashboard__content">
        <div className="client-dashboard__body">
          <div className="client-dashboard__main" aria-label="Dashboard">
            <div className="client-dashboard__top">
              <OpenBalanceCard
                amount={dashboard.summary.total_ar}
                onTimeAmount={onTimeAmount}
                overdueAmount={overdueAmount}
                accountName={clientName}
                aging={dashboard.aging_ar}
                statusChips={statusChips}
                recentCollections={recentCollections}
                loading={loading}
              />
            </div>

            <div className="client-dashboard__mid">
              <DashboardActionTable invoices={invoices} payments={payments} />
            </div>
          </div>

          <DashboardChartsPanel invoices={invoices} payments={payments} />
        </div>
      </div>
    </div>
  )
}
