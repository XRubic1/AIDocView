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
