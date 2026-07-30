/**
 * Client dashboard — rebuild shell with resizable charts panel on the right.
 * Previous version archived as `ClientDashboardLegacy.tsx`.
 */
import { useMemo } from 'react'
import CurrentRingChart from '../components/client/dashboard/CurrentRingChart'
import DashboardAgingCard from '../components/client/dashboard/DashboardAgingCard'
import DashboardAttentionList from '../components/client/dashboard/DashboardAttentionList'
import DashboardAttentionSummary from '../components/client/dashboard/DashboardAttentionSummary'
import DashboardConfirmList from '../components/client/dashboard/DashboardConfirmList'
import { DashboardChartsPanel } from '../components/client/dashboard/DashboardSparkCharts'
import DashboardStatusTiles, {
  type DashboardStatusTile,
} from '../components/client/dashboard/DashboardStatusTiles'
import OpenBalanceCard from '../components/client/dashboard/OpenBalanceCard'
import OverdueRingChart from '../components/client/dashboard/OverdueRingChart'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { computeAttentionSummary } from '../utils/clientActivityMetrics'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import { formatCurrency } from '../utils/format'
import '../styles/clientDashboard.css'

const DAY_MS = 1000 * 60 * 60 * 24

export default function ClientDashboard() {
  const {
    invoices: rawInvoices,
    payments,
    dashboard,
    clientName,
    loading,
  } = useClientDemoSnapshot()
  const invoices = useMemo(() => mapClientVisibleInvoices(rawInvoices), [rawInvoices])

  const attentionSummary = useMemo(
    () => computeAttentionSummary({ invoices, payments }),
    [invoices, payments]
  )

  const paid30d = useMemo(() => {
    const cutoff = Date.now() - 30 * DAY_MS
    return payments
      .filter(
        (p) =>
          p.status === 'confirmed' &&
          Number.isFinite(new Date(p.received_date).getTime()) &&
          new Date(p.received_date).getTime() >= cutoff
      )
      .reduce((sum, p) => sum + p.amount, 0)
  }, [payments])

  const statusTiles = useMemo((): DashboardStatusTile[] => {
    const { heldCount, overdueCount, confirmCount } = attentionSummary
    return [
      {
        key: 'held',
        label: 'Held',
        value: String(heldCount),
        tone: heldCount > 0 ? 'warn' : 'neutral',
        active: heldCount > 0,
        navigateTo: '/client/invoices?status=hold',
      },
      {
        key: 'overdue',
        label: 'Overdue',
        value: String(overdueCount),
        tone: overdueCount > 0 ? 'danger' : 'neutral',
        active: overdueCount > 0,
        navigateTo: '/client/invoices?status=overdue',
      },
      {
        key: 'awaiting',
        label: 'Awaiting',
        value: String(confirmCount),
        tone: confirmCount > 0 ? 'info' : 'neutral',
        active: confirmCount > 0,
        navigateTo: '/client/payments?status=awaiting_receipt',
      },
      {
        key: 'paid30d',
        label: 'Paid (30d)',
        value: formatCurrency(paid30d),
        tone: paid30d > 0 ? 'success' : 'neutral',
        active: paid30d > 0,
        navigateTo: '/client/payments',
      },
    ]
  }, [attentionSummary, paid30d])

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
                accountName={clientName}
                loading={loading}
              />
              <div className="client-dashboard__rings" aria-label="Open A/R health">
                <CurrentRingChart invoices={invoices} payments={payments} />
                <OverdueRingChart invoices={invoices} payments={payments} />
              </div>
            </div>

            <div className="client-dashboard__bottom">
              <div className="client-dashboard__bottom-stack">
                <DashboardStatusTiles tiles={statusTiles} />
                <DashboardAgingCard aging={dashboard.aging_ar} />
              </div>
            </div>
          </div>

          <div className="client-dashboard__side">
            <div className="client-dashboard__attention-slot">
              <DashboardAttentionList invoices={invoices} payments={payments} />
              <DashboardConfirmList payments={payments} />
              <DashboardAttentionSummary invoices={invoices} payments={payments} />
            </div>
            <DashboardChartsPanel invoices={invoices} payments={payments} />
          </div>
        </div>
      </div>
    </div>
  )
}
