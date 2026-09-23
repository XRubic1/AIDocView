/**
 * Client Dashboard V3 — waitlist-branded, chart-first home.
 * Tabs swap Cash collected ↔ Overdue / On hold / Broker risk.
 * PC: fit-to-viewport (density scales with monitor height/width).
 * Routed at /client/dashboard-v3.
 */
import { useMemo, useRef, useState } from 'react'
import HeroCashBand from '../components/client/dashboard-v3/HeroCashBand'
import CashCollectedPanel from '../components/client/dashboard-v3/CashCollectedPanel'
import DashboardWorkPanel, {
  type DashboardMainTab,
} from '../components/client/dashboard-v3/DashboardWorkPanel'
import type { KpiTrend } from '../components/client/dashboard-v2/KpiStatRow'
import MobileEmptyDashboard from '../components/client/dashboard/MobileEmptyDashboard'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import {
  DASHBOARD_PHONE_MAX_WIDTH,
  useIsBelowWidth,
  useIsMobileViewport,
} from '../hooks/useIsMobileViewport'
import { isInvoiceOverdue, isOpenArInvoice } from '../utils/invoiceAging'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../utils/paymentVariance'
import { formatCurrency } from '../utils/format'
import {
  buildComingDueWindows,
  buildConfirmedPaidWindows,
} from '../utils/clientCashWindows'
import {
  computeAttentionActions,
  computeConfirmPaymentActions,
} from '../utils/clientActivityMetrics'
import { useClientSession } from '../hooks/useClientSession'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { buildClientBrokerDirectory } from '../utils/clientBrokers'
import '../styles/clientDashboardV3.css'

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

export default function ClientDashboardV3() {
  const {
    invoices: rawInvoices,
    payments,
    batches,
    dashboard,
    loading,
  } = useClientDemoSnapshot()
  const invoices = useMemo(() => mapClientVisibleInvoices(rawInvoices), [rawInvoices])
  const dashboardRef = useRef<HTMLDivElement>(null)
  const isWindowPhone = useIsMobileViewport()
  const isPanePhone = useIsBelowWidth(dashboardRef, DASHBOARD_PHONE_MAX_WIDTH)
  const isPhoneViewport = isWindowPhone || isPanePhone
  const [mainTab, setMainTab] = useState<DashboardMainTab>('cash')
  const { clientId } = useClientSession()
  const tenantRevision = useTenantDataRevision()

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

  const comingDue = useMemo(
    () => buildComingDueWindows(invoices, payments),
    [invoices, payments]
  )
  const comingDue30 = comingDue.next30

  const paidRecent = useMemo(
    () => buildConfirmedPaidWindows(invoices, payments),
    [invoices, payments]
  )

  const actionCounts = useMemo(() => {
    const confirms = computeConfirmPaymentActions(payments)
    const attention = computeAttentionActions({ invoices, payments })
    let held = 0
    let overdue = 0
    for (const a of attention) {
      if (a.type === 'held_invoice') held += 1
      else if (a.type === 'overdue_invoice') overdue += 1
    }
    return {
      confirm: confirms.length,
      held,
      overdue,
      total: confirms.length + attention.length,
    }
  }, [invoices, payments])

  const brokerRiskCount = useMemo(() => {
    void tenantRevision
    if (!clientId) return 0
    const directory = buildClientBrokerDirectory(clientId, invoices, payments)
    return directory.filter((b) => {
      if (!b.has_worked_with_client) return false
      const riskLevel = b.risk?.risk_level ?? null
      const flagged = riskLevel === 'medium' || riskLevel === 'high'
      const note = b.carrier_notes?.trim() || b.risk?.review_note?.trim()
      return flagged || Boolean(note)
    }).length
  }, [clientId, invoices, payments, tenantRevision])

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

      if (dueDay < thirtyDaysAgo) overduePrior += balance
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

  const awaySummary = useMemo(() => {
    const daysAway = 2
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

  const selectTab = (tab: DashboardMainTab) => {
    setMainTab((prev) => (prev === tab && tab !== 'cash' ? 'cash' : tab))
  }

  return (
    <div
      ref={dashboardRef}
      className={isPhoneViewport ? 'client-dashboard-phone-shell' : 'client-dashboard-v3'}
    >
      {isPhoneViewport ? (
        <MobileEmptyDashboard />
      ) : (
        <div className="client-dashboard-v3__frame">
          <div className="client-dashboard-v3__mesh" aria-hidden />

          <div className="client-dashboard-v3__inner">
            {awaySummary ? (
              <header className="cdv3-status">
                <p className="cdv3-status__away">{awaySummary}</p>
              </header>
            ) : null}

            <HeroCashBand
              openBalance={dashboard.summary.total_ar}
              openTrend={kpiTrends.open}
              overdueAmount={overdueAmount}
              overdueCount={overdueCount}
              overdueTrend={kpiTrends.overdue}
              comingDueAmount={comingDue30.amount}
              comingDueCount={comingDue30.count}
              confirmedPayAmount={paidRecent.next30.amount}
              confirmedPayCount={paidRecent.next30.count}
              loading={loading}
            />

            <div className="cdv3-shortcuts" role="tablist" aria-label="Dashboard panels">
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === 'cash'}
                className={`cdv3-shortcut${mainTab === 'cash' ? ' is-active' : ''}`}
                onClick={() => setMainTab('cash')}
              >
                Cash
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === 'overdue'}
                className={`cdv3-shortcut is-danger${mainTab === 'overdue' ? ' is-active' : ''}`}
                onClick={() => selectTab('overdue')}
              >
                Overdue
                {actionCounts.overdue > 0 ? (
                  <span className="tabular-nums">{actionCounts.overdue}</span>
                ) : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === 'held'}
                className={`cdv3-shortcut is-warn${mainTab === 'held' ? ' is-active' : ''}`}
                onClick={() => selectTab('held')}
              >
                On hold
                {actionCounts.held > 0 ? (
                  <span className="tabular-nums">{actionCounts.held}</span>
                ) : null}
              </button>
              {actionCounts.confirm > 0 ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={mainTab === 'confirm'}
                  className={`cdv3-shortcut is-info${mainTab === 'confirm' ? ' is-active' : ''}`}
                  onClick={() => selectTab('confirm')}
                >
                  Confirm pay
                  <span className="tabular-nums">{actionCounts.confirm}</span>
                </button>
              ) : null}
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === 'broker'}
                className={`cdv3-shortcut is-muted${mainTab === 'broker' ? ' is-active' : ''}`}
                onClick={() => selectTab('broker')}
              >
                Broker risk
                {brokerRiskCount > 0 ? (
                  <span className="tabular-nums">{brokerRiskCount}</span>
                ) : null}
              </button>
            </div>

            {mainTab === 'cash' ? (
              <CashCollectedPanel
                invoices={invoices}
                payments={payments}
                aging={dashboard.aging_ar}
                loading={loading}
              />
            ) : (
              <DashboardWorkPanel
                tab={mainTab}
                invoices={invoices}
                payments={payments}
                loading={loading}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
