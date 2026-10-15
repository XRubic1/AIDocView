import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Layers,
  MessageSquareWarning,
  Paperclip,
  Phone,
  PlusCircle,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import {
  AgingCard,
  ArTrendCard,
  BatchFlowCard,
  CollectionsCard,
  DisputesCard,
  IntakeCard,
  type IntakeItem,
} from '../components/admin/dashboard/AdminDashboardCards'
import { AdminClientsPanel, HEALTH_LABEL } from '../components/admin/dashboard/AdminClientsPanel'
import { getAllBatches } from '../data/mockBatches'
import { mockInvoices } from '../data/mockInvoices'
import { mockPayments } from '../data/mockPayments'
import { markBrokerContactedForCollections } from '../utils/collectionsChase'
import { PendingBatch, CollectionsAlert, AgingAR } from '../types/admin'
import { formatCurrency } from '../utils/format'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useAdminCapabilities } from '../hooks/useAdminCapabilities'
import { getAllClients, getClientById } from '../services/clientRegistry'
import { buildClientWorkSummaries } from '../utils/clientWorkQueue'
import { getAgingArBucketKey, getInvoiceAgeDays, isOpenArInvoice } from '../utils/invoiceAging'
import { listOpenDisputedInvoices } from '../utils/clientInvoiceDisputeStatus'
import { invoiceHasPendingHoldPaperworkReview } from '../utils/holdPaperworkReview'
import { listReceiptDisputedPayments } from '../services/paymentReceiptConfirmationService'
import { buildAdminClientOverview, SETUP_GAP_LABEL, type ClientHealth } from '../utils/adminClientOverview'
import '../styles/adminDashboard.css'

type AttentionPriority = 'high' | 'medium' | 'low'

type AttentionItem = {
  id: string
  kind: 'stale_batch' | 'overdue_invoice' | 'open_dispute' | 'batch_review' | 'broker_call' | 'ppw_review'
  priority: AttentionPriority
  title: string
  detail: string
  href: string
  clientId?: string
}

const ATTENTION_ICON: Record<AttentionItem['kind'], LucideIcon> = {
  stale_batch: Clock,
  overdue_invoice: AlertTriangle,
  open_dispute: MessageSquareWarning,
  batch_review: Layers,
  broker_call: Phone,
  ppw_review: Paperclip,
}

const PRIORITY_RANK: Record<AttentionPriority, number> = { high: 0, medium: 1, low: 2 }

const HEALTH_COLOR: Record<ClientHealth, string> = {
  at_risk: 'var(--adb-danger)',
  watch: '#d97706',
  healthy: 'var(--adb-success)',
  idle: 'var(--adb-faint)',
}

const PENDING_STATUSES = new Set(['ready_to_post', 'verification', 'approval'])

function isChaseable(inv: { status: string; days_since_expected?: number }, minDays: number) {
  return (
    (inv.days_since_expected || 0) >= minDays &&
    inv.status !== 'paid' &&
    inv.status !== 'force_closed' &&
    inv.status !== 'written_off'
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const tenantRevision = useTenantDataRevision()
  const { capabilities } = useAdminCapabilities()
  const [clientFilter, setClientFilter] = useState('')

  // Re-read stores when realtime updates land
  const allClients = useMemo(() => getAllClients(), [tenantRevision])
  const allBatches = useMemo(() => getAllBatches(), [tenantRevision])
  const allInvoices = useMemo(() => [...mockInvoices], [tenantRevision])
  const allPayments = useMemo(() => [...mockPayments], [tenantRevision])

  const clientOptions = useMemo(
    () =>
      allClients
        .map((client) => ({ id: client.id, name: client.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allClients]
  )

  const allPendingBatches = useMemo(
    () => allBatches.filter((b): b is PendingBatch => PENDING_STATUSES.has(b.status)),
    [allBatches]
  )

  const workSummaries = useMemo(
    () => buildClientWorkSummaries({ invoices: allInvoices, batches: allPendingBatches }),
    [allInvoices, allPendingBatches]
  )

  const overview = useMemo(
    () =>
      buildAdminClientOverview({
        clients: allClients,
        invoices: allInvoices,
        payments: allPayments,
        workSummaries,
      }),
    [allClients, allInvoices, allPayments, workSummaries]
  )

  // Everything below scopes to the selected client (or all clients)
  const invoices = useMemo(
    () => (clientFilter ? allInvoices.filter((inv) => inv.client_id === clientFilter) : allInvoices),
    [allInvoices, clientFilter]
  )
  const batches = useMemo(
    () => (clientFilter ? allBatches.filter((b) => b.client_id === clientFilter) : allBatches),
    [allBatches, clientFilter]
  )
  const scopedRows = useMemo(
    () => (clientFilter ? overview.rows.filter((r) => r.clientId === clientFilter) : overview.rows),
    [overview.rows, clientFilter]
  )

  const pendingBatches = useMemo(
    () =>
      batches
        .filter((b): b is PendingBatch => PENDING_STATUSES.has(b.status))
        .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()),
    [batches]
  )

  const receiptDisputedInvoiceIds = useMemo(
    () => new Set(listReceiptDisputedPayments().map((payment) => payment.invoice_id)),
    [tenantRevision]
  )

  const openDisputedRows = useMemo(
    () => listOpenDisputedInvoices(invoices, { receiptDisputedInvoiceIds }),
    [invoices, receiptDisputedInvoiceIds]
  )

  const scopedTotals = useMemo(() => {
    const sum = (pick: (r: (typeof scopedRows)[number]) => number) =>
      scopedRows.reduce((s, r) => s + pick(r), 0)
    const openAr = sum((r) => r.openAr)
    const overdueAr = sum((r) => r.overdueAr)
    return {
      openAr,
      openInvoices: sum((r) => r.openInvoices),
      overdueAr,
      severeAr: sum((r) => r.severeAr),
      collected30d: clientFilter ? sum((r) => r.collected30d) : overview.totals.collected30d,
      clientsWithAr: scopedRows.filter((r) => r.openAr > 0).length,
    }
  }, [scopedRows, clientFilter, overview.totals.collected30d])

  const invoicesOnHold = useMemo(() => invoices.filter((inv) => inv.status === 'hold').length, [invoices])

  const collectionsQueue = useMemo((): CollectionsAlert[] => {
    return invoices
      .filter((inv) => isChaseable(inv, 15))
      .map((inv) => ({
        invoice_id: inv.id,
        inv_number: inv.invoice_number,
        client_id: inv.client_id,
        client_name: inv.client_name,
        broker_name: inv.broker_name,
        amount: inv.amount,
        expected_payment_date: inv.expected_payment_date || inv.due_date || inv.invoice_date,
        days_since_expected: inv.days_since_expected || 0,
        client_response: (inv.broker_contacted ? 'not_received' : 'no_response') as CollectionsAlert['client_response'],
        broker_contacted: inv.broker_contacted || false,
        last_broker_contact: inv.last_broker_contact || null,
      }))
      .sort((a, b) => b.days_since_expected - a.days_since_expected)
      .slice(0, 10)
  }, [invoices])

  const collectionsAlertCount = useMemo(() => invoices.filter((inv) => isChaseable(inv, 15)).length, [invoices])

  const unattachedDocuments = useMemo(
    () => invoices.filter((inv) => !inv.documents_count || inv.documents_count === 0).length,
    [invoices]
  )

  // Force-close rate — managed-tier clients only (self-service has no force-close).
  const forceCloseRate = useMemo(() => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentManaged = invoices.filter((inv) => {
      if (getClientById(inv.client_id)?.service_tier !== 'managed') return false
      const updatedAt = inv.updated_at ? new Date(inv.updated_at) : new Date(inv.created_at)
      return updatedAt >= thirtyDaysAgo
    })
    if (recentManaged.length === 0) return 0
    const forceClosed = recentManaged.filter((inv) => inv.status === 'force_closed').length
    return Math.round((forceClosed / recentManaged.length) * 1000) / 10
  }, [invoices])

  const avgReviewHours = useMemo(() => {
    const reviewed = batches.filter((b) => b.reviewed_at && b.submitted_at)
    if (reviewed.length === 0) return 0
    const totalHours = reviewed.reduce(
      (sum, b) => sum + (new Date(b.reviewed_at!).getTime() - new Date(b.submitted_at).getTime()) / 3_600_000,
      0
    )
    return Math.round((totalHours / reviewed.length) * 10) / 10
  }, [batches])

  const agingAR = useMemo((): AgingAR => {
    const aging: AgingAR = { '1_15': 0, '16_30': 0, '31_45': 0, '46_60': 0, '61_90': 0, over_91: 0, total: 0 }
    invoices.filter(isOpenArInvoice).forEach((inv) => {
      const bucket = getAgingArBucketKey(getInvoiceAgeDays(inv))
      aging[bucket] += inv.amount
      aging.total += inv.amount
    })
    return aging
  }, [invoices])

  const arTrendData = useMemo(() => {
    const data: Array<{ date: string; totalAR: number; collected: number }> = []
    const today = new Date()
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const totalAR = invoices
        .filter((inv) => {
          if (!isOpenArInvoice(inv)) return false
          const approvedDate = inv.approved_at ? new Date(inv.approved_at) : new Date(inv.created_at)
          return approvedDate <= date
        })
        .reduce((sum, inv) => sum + inv.amount, 0)
      const collected = invoices
        .filter((inv) => inv.status === 'paid' && inv.approved_at && new Date(inv.approved_at) <= date)
        .reduce((sum, inv) => sum + inv.amount, 0)
      data.push({ date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), totalAR, collected })
    }
    return data
  }, [invoices])

  const batchPipeline = useMemo(() => {
    const stages = [
      { stage: 'ready_to_post', label: 'Ready to Post', count: 0, totalAmount: 0, avgTimeHours: 0, color: '#F59E0B' },
      { stage: 'verification', label: 'Verification', count: 0, totalAmount: 0, avgTimeHours: 0, color: '#06B6D4' },
      { stage: 'approval', label: 'Approval', count: 0, totalAmount: 0, avgTimeHours: 0, color: '#1684FE' },
      { stage: 'submitted', label: 'Submitted', count: 0, totalAmount: 0, avgTimeHours: 0, color: '#10B981' },
    ]
    const now = Date.now()
    batches.forEach((batch) => {
      const stage = stages.find((s) => s.stage === batch.status)
      if (!stage) return
      const hours = (now - new Date(batch.submitted_at).getTime()) / 3_600_000
      stage.avgTimeHours = (stage.avgTimeHours * stage.count + hours) / (stage.count + 1)
      stage.count += 1
      stage.totalAmount += batch.total_amount
    })
    return stages
  }, [batches])

  const invoicesClosed = useMemo(
    () =>
      invoices.filter(
        (inv) => inv.status === 'paid' || inv.status === 'force_closed' || inv.status === 'written_off'
      ).length,
    [invoices]
  )

  const intakeItems = useMemo((): IntakeItem[] => {
    const enrollments = allClients
      .filter((cl) => cl.status === 'pending' && (!clientFilter || cl.id === clientFilter))
      .map((cl) => ({
        id: `enroll-${cl.id}`,
        kind: 'enrollment' as const,
        title: `${cl.name} enrollment`,
        detail: cl.service_tier === 'managed' ? 'Managed · review and activate' : 'Self-service · review and activate',
        href: '/clients',
      }))
    const handoffs = batches
      .filter((b) => b.upload_mode === 'handoff' && b.status === 'ready_to_post')
      .map((b) => ({
        id: `handoff-${b.id}`,
        kind: 'handoff' as const,
        title: `${b.client_name} doc handoff`,
        detail: `${b.batch_number} · ${b.total_invoices} invoices`,
        href: `/batches?batch=${b.id}`,
      }))
    return [...enrollments, ...handoffs]
  }, [allClients, batches, clientFilter])

  // One ranked "needs attention" list (alerts + today's actions, deduped)
  const attention = useMemo((): AttentionItem[] => {
    const items = new Map<string, AttentionItem>()
    const add = (item: AttentionItem) => {
      if (!items.has(item.id)) items.set(item.id, item)
    }
    const now = Date.now()

    openDisputedRows.forEach((row) => {
      const inv = row.invoice
      add({
        id: `dispute-${inv.id}`,
        kind: 'open_dispute',
        priority: 'high',
        title: `Dispute on ${inv.invoice_number}`,
        detail: `${inv.client_name} · ${row.source === 'receipt' ? 'Receipt' : 'Invoice'} — ${row.reason}`,
        href: `/invoices?invoice=${inv.id}`,
        clientId: inv.client_id,
      })
    })

    invoices.filter((inv) => invoiceHasPendingHoldPaperworkReview(inv)).forEach((inv) => {
      add({
        id: `ppw-${inv.id}`,
        kind: 'ppw_review',
        priority: 'high',
        title: `Review paperwork on ${inv.invoice_number}`,
        detail: `${inv.client_name} uploaded documents — confirm or reject`,
        href: `/invoices?invoice=${inv.id}`,
        clientId: inv.client_id,
      })
    })

    pendingBatches.forEach((batch) => {
      const hours = (now - new Date(batch.submitted_at).getTime()) / 3_600_000
      add({
        id: `batch-${batch.id}`,
        kind: hours > 48 ? 'stale_batch' : 'batch_review',
        priority: hours > 72 ? 'high' : hours > 24 ? 'medium' : 'low',
        title:
          hours > 48
            ? `Batch ${batch.batch_number} waiting ${Math.round(hours)}h`
            : `Review batch ${batch.batch_number}`,
        detail: `${batch.client_name} · ${batch.total_invoices} invoices · ${formatCurrency(batch.total_amount)}`,
        href: `/batches?batch=${batch.id}`,
        clientId: batch.client_id,
      })
    })

    invoices.filter((inv) => isChaseable(inv, 15)).forEach((inv) => {
      const days = inv.days_since_expected || 0
      if (days > 60) {
        add({
          id: `overdue-${inv.id}`,
          kind: 'overdue_invoice',
          priority: days > 90 ? 'high' : 'medium',
          title: `${inv.invoice_number} is ${days} days past expected`,
          detail: `${formatCurrency(inv.amount)} · ${inv.client_name} → ${inv.broker_name}`,
          href: `/collections?invoice=${inv.id}`,
          clientId: inv.client_id,
        })
      } else if (!inv.broker_contacted) {
        add({
          id: `call-${inv.id}`,
          kind: 'broker_call',
          priority: days > 30 ? 'high' : 'medium',
          title: `Chase ${inv.broker_name}`,
          detail: `${inv.invoice_number} · ${days} days past expected · ${inv.client_name}`,
          href: `/collections?invoice=${inv.id}`,
          clientId: inv.client_id,
        })
      }
    })

    return [...items.values()].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  }, [openDisputedRows, invoices, pendingBatches])

  const highAttention = attention.filter((a) => a.priority === 'high').length
  const openWork = scopedRows.reduce((sum, r) => sum + r.workOpen, 0)

  const setupIncomplete = useMemo(
    () => scopedRows.filter((r) => r.setupGaps.length > 0).slice(0, 5),
    [scopedRows]
  )

  const topExposure = useMemo(
    () => [...scopedRows].filter((r) => r.openAr > 0).sort((a, b) => b.openAr - a.openAr).slice(0, 5),
    [scopedRows]
  )

  const collectedDelta = useMemo(() => {
    const prev = overview.totals.collectedPrev30d
    if (clientFilter || prev <= 0) return null
    return Math.round(((overview.totals.collected30d - prev) / prev) * 100)
  }, [overview.totals, clientFilter])

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    []
  )

  const selectedClientName = clientOptions.find((c) => c.id === clientFilter)?.name

  const overduePct = scopedTotals.openAr > 0 ? Math.round((scopedTotals.overdueAr / scopedTotals.openAr) * 100) : 0
  const currentPct = 100 - overduePct
  const severePct = scopedTotals.openAr > 0 ? Math.round((scopedTotals.severeAr / scopedTotals.openAr) * 100) : 0

  const openDisputesView = () => {
    const first = openDisputedRows[0]
    navigate(first ? `/invoices?invoice=${first.invoice.id}` : '/invoices')
  }

  return (
    <div className="admin-dash client-shell-scroll">
      <div className="admin-dash__glow" aria-hidden />
      <div className="admin-dash__inner">
        {/* Header */}
        <header className="adb-head">
          <div>
            <p className="adb-head__eyebrow">{todayLabel}</p>
            <h1 className="adb-head__title">Dashboard</h1>
            <p className="adb-head__sub">
              {selectedClientName ? (
                <>Showing <b>{selectedClientName}</b> only.</>
              ) : attention.length > 0 ? (
                <>
                  {attention.length} item{attention.length === 1 ? '' : 's'} need attention across{' '}
                  {overview.totals.clients} client{overview.totals.clients === 1 ? '' : 's'}
                  {highAttention > 0 ? ` — ${highAttention} high priority` : ''}.
                </>
              ) : openWork > 0 ? (
                <>
                  Nothing urgent · {openWork} open work item{openWork === 1 ? '' : 's'} in the client queue.
                </>
              ) : (
                <>All clear across {overview.totals.clients} clients.</>
              )}
            </p>
          </div>

          <div className="adb-head__tools">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="adb-select"
              aria-label="Filter dashboard by client"
            >
              <option value="">All clients</option>
              {clientOptions.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="adb-pill adb-pill--primary"
              onClick={() => navigate(pendingBatches[0] ? `/batches?batch=${pendingBatches[0].id}` : '/batches')}
            >
              <Layers aria-hidden /> Review batches
              {pendingBatches.length > 0 ? <span className="adb-pill__count">{pendingBatches.length}</span> : null}
            </button>
            <button type="button" className="adb-pill" onClick={() => navigate('/collections')}>
              <Phone aria-hidden /> Collections
              {collectionsAlertCount > 0 ? <span className="adb-pill__count">{collectionsAlertCount}</span> : null}
            </button>
            <button type="button" className="adb-pill" onClick={() => navigate('/invoices')}>
              <Paperclip aria-hidden /> Unattached
              {unattachedDocuments > 0 ? <span className="adb-pill__count">{unattachedDocuments}</span> : null}
            </button>
            <button type="button" className="adb-pill" onClick={() => navigate('/clients')}>
              <PlusCircle aria-hidden /> Client
            </button>
            <button type="button" className="adb-pill" onClick={() => navigate('/brokers')}>
              <Building2 aria-hidden /> Broker
            </button>
            {capabilities.canManageUsers ? (
              <button type="button" className="adb-pill" onClick={() => navigate('/users?add=1')}>
                <UserPlus aria-hidden /> User
              </button>
            ) : null}
          </div>
        </header>

        {/* Hero band */}
        <div className="adb-hero">
          <button type="button" className="adb-card adb-stat adb-stat--hero" onClick={() => navigate('/aging-ar')}>
            <span className="adb-stat__label">
              <Wallet aria-hidden /> Open A/R
            </span>
            <span className="adb-stat__value">{formatCurrency(scopedTotals.openAr)}</span>
            <span className="adb-stat__meta">
              {scopedTotals.openInvoices} open invoice{scopedTotals.openInvoices === 1 ? '' : 's'}
              {clientFilter ? '' : ` · ${scopedTotals.clientsWithAr} client${scopedTotals.clientsWithAr === 1 ? '' : 's'}`}
            </span>
            <span className="adb-stat__bar" aria-hidden>
              <span style={{ width: `${currentPct}%`, background: 'var(--adb-blue)' }} />
              <span style={{ width: `${overduePct - severePct}%`, background: 'var(--adb-warning)' }} />
              <span style={{ width: `${severePct}%`, background: 'var(--adb-danger)' }} />
            </span>
            <span className="adb-stat__legend">
              <span><i style={{ background: 'var(--adb-blue)' }} />0–30d {currentPct}%</span>
              <span><i style={{ background: 'var(--adb-warning)' }} />31–60d {overduePct - severePct}%</span>
              <span><i style={{ background: 'var(--adb-danger)' }} />61d+ {severePct}%</span>
            </span>
          </button>

          <button type="button" className="adb-card adb-stat adb-stat--danger" onClick={() => navigate('/aging-ar')}>
            <span className="adb-stat__label">
              <AlertTriangle aria-hidden /> 31+ days
            </span>
            <span className="adb-stat__value">{formatCurrency(scopedTotals.overdueAr)}</span>
            <span className="adb-stat__meta">{overduePct}% of open A/R</span>
          </button>

          <button type="button" className="adb-card adb-stat adb-stat--success" onClick={() => navigate('/payment-posting')}>
            <span className="adb-stat__label">
              <Banknote aria-hidden /> Collected 30d
            </span>
            <span className="adb-stat__value">{formatCurrency(scopedTotals.collected30d)}</span>
            <span className="adb-stat__meta">
              {collectedDelta === null ? (
                'Posted payments'
              ) : (
                <>
                  <span className={`adb-delta adb-delta--${collectedDelta >= 0 ? 'up' : 'down'}`}>
                    {collectedDelta >= 0 ? '+' : ''}
                    {collectedDelta}%
                  </span>{' '}
                  vs prior 30 days
                </>
              )}
            </span>
          </button>

          <button type="button" className="adb-card adb-stat" onClick={() => navigate('/collections')}>
            <span className="adb-stat__label">
              <Phone aria-hidden /> Collections
            </span>
            <span className="adb-stat__value">{collectionsAlertCount}</span>
            <span className="adb-stat__meta">
              {invoicesOnHold} on hold · {openDisputedRows.length} disputed
            </span>
          </button>

          <button type="button" className="adb-card adb-stat" onClick={() => navigate('/batches')}>
            <span className="adb-stat__label">
              <FileText aria-hidden /> Batches pending
            </span>
            <span className="adb-stat__value">{pendingBatches.length}</span>
            <span className="adb-stat__meta">Avg review {avgReviewHours} hrs</span>
          </button>
        </div>

        {/* Clients + attention */}
        <div className="adb-main">
          <AdminClientsPanel
            rows={scopedRows}
            onOpenClient={(id) => navigate(`/admin/work-queue?client=${encodeURIComponent(id)}`)}
            onViewAll={() => navigate('/clients')}
          />

          <div className="adb-side">
            <section className="adb-card" aria-label="Needs attention">
              <header className="adb-card__head">
                <h2 className="adb-card__title">
                  Needs attention
                  {attention.length > 0 ? (
                    <span className={`adb-card__count${highAttention > 0 ? ' adb-card__count--danger' : ''}`}>
                      {attention.length}
                    </span>
                  ) : null}
                </h2>
                <button type="button" className="adb-card__link" onClick={() => navigate('/admin/work-queue')}>
                  Work queue <ArrowRight size={13} aria-hidden />
                </button>
              </header>
              {attention.length === 0 ? (
                <div className="adb-empty">
                  <CheckCircle2 aria-hidden />
                  <strong>All clear</strong>
                  <span>Nothing urgent right now.</span>
                </div>
              ) : (
                <ul className="adb-attn">
                  {attention.slice(0, 12).map((item) => {
                    const Icon = ATTENTION_ICON[item.kind]
                    return (
                      <li key={item.id}>
                        <button type="button" className="adb-attn__item" onClick={() => navigate(item.href)}>
                          <span className={`adb-attn__icon adb-attn__icon--${item.priority}`}>
                            <Icon aria-hidden />
                          </span>
                          <span className="adb-attn__copy">
                            <span className="adb-attn__title">{item.title}</span>
                            <span className="adb-attn__detail" title={item.detail}>
                              {item.detail}
                            </span>
                          </span>
                          <ChevronRight className="adb-attn__chev" aria-hidden />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="adb-card" aria-label="Client portfolio">
              <header className="adb-card__head">
                <h2 className="adb-card__title">Client portfolio</h2>
              </header>
              <div className="adb-portfolio">
                <div className="adb-health-grid">
                  {(['at_risk', 'watch', 'healthy', 'idle'] as ClientHealth[]).map((h) => (
                    <div key={h} className="adb-health-tile">
                      <b>{scopedRows.filter((r) => r.health === h).length}</b>
                      <span style={{ color: HEALTH_COLOR[h] }}>{HEALTH_LABEL[h]}</span>
                    </div>
                  ))}
                </div>

                <div className="adb-kv">
                  Managed · Self-service
                  <b>
                    {scopedRows.filter((r) => r.tier === 'managed').length} ·{' '}
                    {scopedRows.filter((r) => r.tier !== 'managed').length}
                  </b>
                </div>
                <div className="adb-kv">
                  Force-close rate (30d, managed)
                  <b>{forceCloseRate}%</b>
                </div>
                <div className="adb-kv">
                  Invoices on hold
                  <b>{invoicesOnHold}</b>
                </div>

                {topExposure.length > 0 ? (
                  <>
                    <div className="adb-divider" />
                    <div className="adb-top-exposure">
                      <span className="adb-stat__label">Largest exposure</span>
                      {topExposure.map((row) => (
                        <div key={row.clientId} className="adb-exposure-row">
                          <span title={row.name}>{row.name}</span>
                          <b>{formatCurrency(row.openAr)}</b>
                          <div className="adb-mini-bar">
                            <span
                              style={{
                                width: `${Math.max(3, (row.openAr / (topExposure[0].openAr || 1)) * 100)}%`,
                                background: 'var(--adb-blue)',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}

                {setupIncomplete.length > 0 ? (
                  <>
                    <div className="adb-divider" />
                    <span className="adb-stat__label">Setup incomplete</span>
                    <ul className="adb-setup-list">
                      {setupIncomplete.map((row) => (
                        <li key={row.clientId}>
                          <span title={row.name}>{row.name}</span>
                          <span
                            className="adb-tag adb-tag--warn"
                            title={row.setupGaps.map((g) => SETUP_GAP_LABEL[g]).join(', ')}
                          >
                            {row.setupGaps.length === 1
                              ? SETUP_GAP_LABEL[row.setupGaps[0]]
                              : `${row.setupGaps.length} missing`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </section>
          </div>
        </div>

        {/* Analytics */}
        <p className="adb-section-label">A/R analytics</p>
        <div className="adb-grid-2 adb-grid-2--wide-left">
          <ArTrendCard data={arTrendData} onOpen={() => navigate('/aging-ar')} />
          <AgingCard aging={agingAR} onOpen={() => navigate('/aging-ar')} />
        </div>

        {/* Collections + disputes */}
        <p className="adb-section-label">Collections</p>
        <div className="adb-grid-2">
          <CollectionsCard
            alerts={collectionsQueue}
            onOpenInvoice={(id) => navigate(`/invoices?invoice=${id}`)}
            onCall={(id) => navigate(`/collections?invoice=${id}`)}
            onMarkContacted={(id) => void markBrokerContactedForCollections(id)}
            onViewAll={() => navigate('/collections')}
          />
          <DisputesCard
            rows={openDisputedRows.slice(0, 10)}
            onOpenInvoice={(id) => navigate(`/invoices?invoice=${id}`)}
            onViewAll={openDisputesView}
          />
        </div>

        {/* Operations */}
        <p className="adb-section-label">Operations</p>
        <div className="adb-grid-2">
          <BatchFlowCard
            stages={batchPipeline}
            invoicesOnHold={invoicesOnHold}
            invoicesClosed={invoicesClosed}
            onStageClick={(stage) => navigate(`/batches?stage=${stage}`)}
            onViewAll={() => navigate('/batches')}
          />
          <IntakeCard items={intakeItems} onOpen={(href) => navigate(href)} />
        </div>
      </div>
    </div>
  )
}
