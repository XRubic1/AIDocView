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
import { ArrowRight, CheckCircle2 } from 'lucide-react'
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
} from '../utils/clientCashWindows'
import {
  computeAttentionActions,
  computeConfirmPaymentActions,
} from '../utils/clientActivityMetrics'
import { useClientSession } from '../hooks/useClientSession'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { buildClientBrokerDirectory } from '../utils/clientBrokers'
import '../styles/clientDashboardV3.css'
import '../styles/clientDashboardV3Clean.css'

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

  /** Last-30-day cash received, plus how many invoices still carry a balance. */
  const last30 = useMemo(() => {
    const today = startOfDayMs(new Date())
    const thirtyDaysAgo = today - 30 * 24 * 60 * 60 * 1000
    let paid = 0
    let paidCount = 0
    let openCount = 0
    for (const inv of invoices) {
      if (isOpenArInvoice(inv) && getInvoiceOpenArBalance(inv, payments) > AMOUNT_EPSILON) openCount += 1
    }
    for (const p of payments) {
      if (p.status !== 'confirmed') continue
      const day = startOfDayMs(new Date(p.received_date))
      if (day >= thirtyDaysAgo && day <= today) {
        paid += p.amount
        paidCount += 1
      }
    }
    return { paid, paidCount, openCount }
  }, [invoices, payments])

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

  /** Plain-language to-do list for the status line. */
  const needsYou = useMemo(() => {
    const items: { tab: DashboardMainTab; label: string }[] = []
    if (actionCounts.confirm > 0) {
      items.push({
        tab: 'confirm',
        label: `Confirm ${actionCounts.confirm} payment${actionCounts.confirm === 1 ? '' : 's'}`,
      })
    }
    if (actionCounts.held > 0) {
      items.push({
        tab: 'held',
        label: `${actionCounts.held} invoice${actionCounts.held === 1 ? '' : 's'} on hold`,
      })
    }
    if (actionCounts.overdue > 0) {
      items.push({ tab: 'overdue', label: `${actionCounts.overdue} overdue` })
    }
    return items
  }, [actionCounts])

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

          <div className="client-dashboard-v3__inner">
            {!loading ? (
              <header className={`cdv3-status${needsYou.length > 0 ? ' is-action' : ' is-clear'}`}>
                {needsYou.length > 0 ? (
                  <>
                    <span className="cdv3-status__title">
                      {actionCounts.total} thing{actionCounts.total === 1 ? '' : 's'} need
                      {actionCounts.total === 1 ? 's' : ''} you
                    </span>
                    <span className="cdv3-status__items">
                      {needsYou.map((item) => (
                        <button
                          key={item.tab}
                          type="button"
                          className="cdv3-status__link"
                          onClick={() => setMainTab(item.tab)}
                        >
                          {item.label}
                          <ArrowRight size={14} aria-hidden />
                        </button>
                      ))}
                    </span>
                  </>
                ) : (
                  <span className="cdv3-status__title">
                    <CheckCircle2 size={18} aria-hidden />
                    You&apos;re all set. Nothing needs you right now.
                  </span>
                )}
                {awaySummary ? <span className="cdv3-status__away">{awaySummary}</span> : null}
              </header>
            ) : null}

            <HeroCashBand
              openBalance={dashboard.summary.total_ar}
              openCount={last30.openCount}
              expectedAmount={comingDue30.amount}
              expectedCount={comingDue30.count}
              paidAmount={last30.paid}
              paidCount={last30.paidCount}
              overdueAmount={overdueAmount}
              overdueCount={overdueCount}
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
                {brokerRiskCount > 0
                  ? `${brokerRiskCount} broker${brokerRiskCount === 1 ? '' : 's'} to watch`
                  : 'Broker risk'}
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
