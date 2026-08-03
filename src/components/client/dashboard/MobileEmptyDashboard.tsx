import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  AlertCircle,
  Clock,
  Menu,
} from 'lucide-react'
import { useClientDemoSnapshot } from '../../../hooks/useClientDemoSnapshot'
import { useCountUp } from '../../../hooks/useCountUp'
import { mapClientVisibleInvoices } from '../../../utils/clientInvoiceView'
import { isInvoiceOverdue, isOpenArInvoice } from '../../../utils/invoiceAging'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../../../utils/paymentVariance'
import { formatCurrency } from '../../../utils/format'
import BrokerRiskOverview from './BrokerRiskOverview'
import MobileDashboardActions from './MobileDashboardActions'
import MobileMonthCollectionsSheet, {
  type MonthChartBucket,
  type MonthSheetMode,
} from './MobileMonthCollectionsSheet'
import '../../../styles/clientDashboard.css'

/** Swipeable middle panels on the phone home dashboard. */
const MOBILE_PANELS = [
  { id: 'invoices', label: 'Invoices' },
  { id: 'brokers', label: 'Broker Risk' },
  { id: 'actions', label: 'Actions' },
] as const

type MobilePanelId = (typeof MOBILE_PANELS)[number]['id']

/** Build a simple 6-point sparkline path from values (0–1 normalized). */
function sparkPath(values: number[], width = 88, height = 36): string {
  if (values.length === 0) return ''
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = Math.max(max - min, 1)
  return values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width
      const y = height - ((v - min) / span) * (height - 4) - 2
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

/**
 * Phone home dashboard — example-style card stack populated from the same
 * A/R snapshot as the desktop dashboard (open balance, collections, next action).
 */
export default function MobileEmptyDashboard() {
  const navigate = useNavigate()
  const { invoices: rawInvoices, payments, dashboard, loading } =
    useClientDemoSnapshot()
  const invoices = useMemo(() => mapClientVisibleInvoices(rawInvoices), [rawInvoices])
  const [selectedMonth, setSelectedMonth] = useState<MonthChartBucket | null>(null)
  const [monthSheetMode, setMonthSheetMode] = useState<MonthSheetMode>('collected')
  const closeMonthSheet = useCallback(() => setSelectedMonth(null), [])
  const [activePanel, setActivePanel] = useState<MobilePanelId>('invoices')
  const [carouselHeight, setCarouselHeight] = useState<number | undefined>(undefined)
  const carouselRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Partial<Record<MobilePanelId, HTMLElement | null>>>({})

  /** Open month sheet on Collected or Invoiced tab. */
  const openMonthSheet = useCallback((month: MonthChartBucket, mode: MonthSheetMode = 'collected') => {
    setMonthSheetMode(mode)
    setSelectedMonth(month)
  }, [])

  /** Jump carousel to a panel (chip tap). */
  const goToPanel = useCallback((id: MobilePanelId) => {
    const slide = slideRefs.current[id]
    if (!slide) return
    slide.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
    setActivePanel(id)
  }, [])

  /** Lock all panels to the Invoices chart’s natural content height. */
  useEffect(() => {
    const slide = slideRefs.current.invoices
    const carousel = carouselRef.current
    if (!slide || !carousel) return

    const update = () => {
      const card = slide.querySelector('.cd-mobile-chart-card') as HTMLElement | null
      if (!card) return

      // Temporarily unlock height so we measure content, not a prior collapsed lock.
      const locked = carousel.style.height
      carousel.style.height = 'auto'
      const next = Math.ceil(card.getBoundingClientRect().height)
      carousel.style.height = locked

      if (next < 120) return
      setCarouselHeight((prev) => (prev === next ? prev : next))
    }

    // After paint — avoids measuring mid-layout collapse.
    const raf = requestAnimationFrame(update)
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(slide)
    const card = slide.querySelector('.cd-mobile-chart-card')
    if (card) ro?.observe(card)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [loading])

  /** Keep the active chip visible in the chip row. */
  useEffect(() => {
    const chip = document.querySelector(
      `.cd-mobile-chip[aria-selected="true"]`
    ) as HTMLElement | null
    chip?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activePanel])

  /** Sync chips when the user swipes between panels. */
  useEffect(() => {
    const root = carouselRef.current
    if (!root) return

    const slides = MOBILE_PANELS.map((p) => slideRefs.current[p.id]).filter(
      (el): el is HTMLElement => Boolean(el)
    )
    if (slides.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        const id = visible?.target.getAttribute('data-panel-id') as MobilePanelId | null
        if (id) setActivePanel(id)
      },
      { root, threshold: [0.55, 0.7] }
    )

    for (const slide of slides) observer.observe(slide)
    return () => observer.disconnect()
  }, [])

  /** Status totals for chips + collection cards. */
  const metrics = useMemo(() => {
    let heldAmount = 0
    let heldCount = 0
    let overdueAmount = 0
    let overdueCount = 0
    let awaitingAmount = 0
    let awaitingCount = 0

    for (const inv of invoices) {
      if (!isOpenArInvoice(inv)) continue
      const balance = getInvoiceOpenArBalance(inv, payments)
      if (balance <= AMOUNT_EPSILON) continue

      if (inv.status === 'hold') {
        heldAmount += balance
        heldCount += 1
      }
      if (isInvoiceOverdue(inv)) {
        overdueAmount += balance
        overdueCount += 1
      } else if (inv.status === 'approved') {
        awaitingAmount += balance
        awaitingCount += 1
      }
    }

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    const paid30 = payments.filter(
      (p) => p.status === 'confirmed' && new Date(p.received_date) >= thirtyDaysAgo
    )
    const paid30Amount = paid30.reduce((s, p) => s + p.amount, 0)
    const paid30Count = paid30.length

    const prev30Amount = payments
      .filter(
        (p) =>
          p.status === 'confirmed' &&
          new Date(p.received_date) >= sixtyDaysAgo &&
          new Date(p.received_date) < thirtyDaysAgo
      )
      .reduce((s, p) => s + p.amount, 0)

    const collectedDelta =
      prev30Amount > 0.01 ? ((paid30Amount - prev30Amount) / prev30Amount) * 100 : null

    return {
      openAr: dashboard.summary.total_ar,
      heldAmount,
      heldCount,
      overdueAmount,
      overdueCount,
      awaitingAmount,
      awaitingCount,
      paid30Amount,
      paid30Count,
      collectedDelta,
    }
  }, [invoices, payments, dashboard.summary.total_ar])

  /** Count-up open balance once snapshot is ready. */
  const animatedOpenAr = useCountUp(loading ? 0 : metrics.openAr, {
    duration: 900,
    decimals: 2,
  })

  /** Last 6 months — invoiced vs collected chart. */
  const monthlyBars = useMemo(() => {
    const now = new Date()
    const months: Array<{
      key: string
      label: string
      invoiced: number
      collected: number
    }> = []

    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push({
        key,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        invoiced: 0,
        collected: 0,
      })
    }

    const byKey = new Map(months.map((m) => [m.key, m]))

    for (const inv of invoices) {
      const key = inv.invoice_date?.slice(0, 7)
      const bucket = key ? byKey.get(key) : undefined
      if (bucket) bucket.invoiced += inv.amount
    }

    for (const p of payments) {
      if (p.status !== 'confirmed') continue
      const key = p.received_date?.slice(0, 7)
      const bucket = key ? byKey.get(key) : undefined
      if (bucket) bucket.collected += p.amount
    }

    const peak = Math.max(...months.flatMap((m) => [m.invoiced, m.collected]), 1)
    return { months, peak }
  }, [invoices, payments])

  /** Weekly collection spark points for the Collections card. */
  const collectionSpark = useMemo(() => {
    const now = new Date()
    const points: number[] = []
    for (let i = 5; i >= 0; i -= 1) {
      const end = new Date(now)
      end.setDate(end.getDate() - i * 7)
      const start = new Date(end)
      start.setDate(start.getDate() - 7)
      let sum = 0
      for (const p of payments) {
        if (p.status !== 'confirmed') continue
        const t = new Date(p.received_date).getTime()
        if (t >= start.getTime() && t < end.getTime()) sum += p.amount
      }
      points.push(sum)
    }
    return points
  }, [payments])

  /** Payments awaiting client receipt confirmation — shown on hero right. */
  const confirmPanel = useMemo(() => {
    const awaiting = payments.filter((p) => p.status === 'awaiting_receipt')
    if (awaiting.length === 0) return null
    const first = awaiting[0]
    const total = awaiting.reduce((s, p) => s + p.amount, 0)
    return {
      count: awaiting.length,
      total,
      path: `/client/payments?status=awaiting_receipt&paymentId=${encodeURIComponent(first.id)}`,
    }
  }, [payments])

  /** Aging buckets with labels (61+ merges 61–90 and 91+). */
  const agingSummary = useMemo(() => {
    const aging = dashboard.aging_ar
    const current = (aging?.['1_15'] ?? 0) + (aging?.['16_30'] ?? 0)
    const total = aging?.total ?? 0
    const aged = Math.max(0, total - current)
    const buckets = [
      { key: '1_15', label: '0–15', amount: aging?.['1_15'] ?? 0, color: '#1684FE' },
      { key: '16_30', label: '16–30', amount: aging?.['16_30'] ?? 0, color: '#38BDF8' },
      { key: '31_45', label: '31–45', amount: aging?.['31_45'] ?? 0, color: '#FBBF24' },
      { key: '46_60', label: '46–60', amount: aging?.['46_60'] ?? 0, color: '#FB923C' },
      {
        key: '61_plus',
        label: '61+',
        amount: (aging?.['61_90'] ?? 0) + (aging?.over_91 ?? 0),
        color: '#EF4444',
      },
    ]
    return { current, aged, total, buckets }
  }, [dashboard.aging_ar])

  const invoicedShare = useMemo(() => {
    const inv = monthlyBars.months.reduce((s, m) => s + m.invoiced, 0)
    const col = monthlyBars.months.reduce((s, m) => s + m.collected, 0)
    const total = inv + col
    if (total <= 0) return { invoiced: 50, collected: 50 }
    return {
      invoiced: Math.round((inv / total) * 100),
      collected: Math.round((col / total) * 100),
    }
  }, [monthlyBars])

  return (
    <div className="client-dashboard client-dashboard--mobile-home">
      <div className="client-dashboard__bg" aria-hidden>
        <div className="client-dashboard__waves" />
        <div className="client-dashboard__waves client-dashboard__waves--slow" />
        <div className="client-dashboard__glow" />
      </div>

      <div className="client-dashboard__content cd-mobile-home">
          {/* Hero — pinned; panels scroll below */}
          <section
            className={`cd-mobile-hero${loading ? ' is-loading' : ''}`}
            aria-label="Open balance"
          >
            <div className="cd-mobile-hero__bar">
              <button
                type="button"
                className="cd-mobile-hero__menu"
                aria-label="Open menu"
                onClick={() => {
                  window.dispatchEvent(new Event('credyx:open-client-menu'))
                }}
              >
                <Menu size={20} strokeWidth={1.75} aria-hidden />
              </button>
            </div>

            <div className="cd-mobile-hero__main">
              <div className="cd-mobile-hero__copy">
                <p className="cd-mobile-hero__eyebrow">Open Balance</p>
                <h2 className="cd-mobile-hero__title tabular-nums">
                  {loading ? '—' : formatCurrency(animatedOpenAr)}
                </h2>
                <button
                  type="button"
                  className="cd-mobile-hero__cta"
                  disabled={loading}
                  onClick={() => navigate('/client/invoices')}
                >
                  View invoices
                  <ArrowRight size={14} strokeWidth={2.25} aria-hidden />
                </button>
              </div>

              <div className="cd-mobile-hero__side">
                <button
                  type="button"
                  className={`cd-mobile-hero__side-card is-held${
                    !loading && metrics.heldCount === 0 ? ' is-empty' : ''
                  }`}
                  disabled={loading}
                  onClick={() => navigate('/client/invoices?status=hold')}
                  aria-label={`${metrics.heldCount} held invoice${metrics.heldCount === 1 ? '' : 's'}, ${formatCurrency(metrics.heldAmount)}`}
                >
                  <span className="cd-mobile-hero__side-head">
                    <span className="cd-mobile-hero__side-icon" aria-hidden>
                      <AlertCircle size={13} strokeWidth={2.5} />
                    </span>
                    <span className="cd-mobile-hero__side-label">Held</span>
                    <span className="cd-mobile-hero__side-badge tabular-nums">
                      {loading ? '—' : metrics.heldCount}
                    </span>
                  </span>
                  <span className="cd-mobile-hero__side-amount tabular-nums">
                    {loading ? '—' : formatCurrency(metrics.heldAmount)}
                  </span>
                </button>

                <button
                  type="button"
                  className={`cd-mobile-hero__side-card is-pending${
                    !loading && !confirmPanel ? ' is-empty' : ''
                  }`}
                  disabled={loading}
                  onClick={() =>
                    navigate(
                      confirmPanel?.path ?? '/client/payments?status=awaiting_receipt'
                    )
                  }
                  aria-label={
                    confirmPanel
                      ? `${confirmPanel.count} pending payment${confirmPanel.count === 1 ? '' : 's'}, ${formatCurrency(confirmPanel.total)}`
                      : 'No pending payments'
                  }
                >
                  <span className="cd-mobile-hero__side-head">
                    <span className="cd-mobile-hero__side-icon" aria-hidden>
                      <Clock size={13} strokeWidth={2.5} />
                    </span>
                    <span className="cd-mobile-hero__side-label">Pending</span>
                    <span className="cd-mobile-hero__side-badge tabular-nums">
                      {loading ? '—' : confirmPanel?.count ?? 0}
                    </span>
                  </span>
                  <span className="cd-mobile-hero__side-amount tabular-nums">
                    {loading ? '—' : formatCurrency(confirmPanel?.total ?? 0)}
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* Scrollable stack — Open Balance stays pinned above */}
          <div className="cd-mobile-home__scroll">
          {/* Swipeable panels: Invoices → Broker Risk → Actions */}
          <section
            className="cd-mobile-section cd-mobile-section--enter cd-mobile-carousel-section"
            style={{ '--cd-enter-delay': '60ms' } as CSSProperties}
            aria-label="Dashboard panels"
          >
            {/* Panel filters — occupy the old Invoice Management heading row */}
            <div className="cd-mobile-chips" role="tablist" aria-label="Dashboard panel">
              {MOBILE_PANELS.map((panel) => (
                <button
                  key={panel.id}
                  type="button"
                  role="tab"
                  aria-selected={activePanel === panel.id}
                  className={`cd-mobile-chip${activePanel === panel.id ? ' is-active' : ''}`}
                  onClick={() => goToPanel(panel.id)}
                >
                  {panel.label}
                </button>
              ))}
            </div>

            <div
              ref={carouselRef}
              className="cd-mobile-carousel"
              aria-roledescription="carousel"
              style={
                carouselHeight
                  ? ({ height: carouselHeight } as CSSProperties)
                  : undefined
              }
            >
              {/* Invoices */}
              <div
                className="cd-mobile-carousel__slide"
                data-panel-id="invoices"
                role="tabpanel"
                aria-label="Invoices"
                ref={(el) => {
                  slideRefs.current.invoices = el
                }}
              >
                <div className={`cd-mobile-chart-card${loading ? ' is-loading' : ''}`}>
                  <div className="cd-mobile-aging">
                    <div className="cd-mobile-aging__summary">
                      <div className="cd-mobile-aging__item">
                        <span className="cd-mobile-aging__label">Current ≤30d</span>
                        <span className="cd-mobile-aging__value tabular-nums">
                          {loading ? '—' : formatCurrency(agingSummary.current)}
                        </span>
                      </div>
                      <div className="cd-mobile-aging__item is-aged">
                        <span className="cd-mobile-aging__label">31+ days</span>
                        <span className="cd-mobile-aging__value tabular-nums">
                          {loading ? '—' : formatCurrency(agingSummary.aged)}
                        </span>
                      </div>
                    </div>

                    <div className="cd-mobile-aging__track">
                      <div
                        className={`cd-mobile-aging__bar${!loading && agingSummary.total > 0 ? ' is-animate' : ''}`}
                        role="img"
                        aria-label="A/R aging distribution"
                      >
                        {agingSummary.total <= 0 ? (
                          <span className="cd-mobile-aging__bar-empty" />
                        ) : (
                          agingSummary.buckets.map((bucket) =>
                            bucket.amount > 0 ? (
                              <span
                                key={bucket.key}
                                className="cd-mobile-aging__seg"
                                style={{
                                  width: `${(bucket.amount / agingSummary.total) * 100}%`,
                                  background: bucket.color,
                                }}
                                title={`${bucket.label}: ${formatCurrency(bucket.amount)}`}
                              />
                            ) : null
                          )
                        )}
                      </div>
                      <div className="cd-mobile-aging__labels" aria-hidden>
                        {agingSummary.buckets.map((bucket) => (
                          <span key={bucket.key} className="cd-mobile-aging__tick">
                            {bucket.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="cd-mobile-chart-card__body">
                    <div className="cd-mobile-chart-card__legend">
                      <button
                        type="button"
                        className="cd-mobile-legend is-button"
                        onClick={() => {
                          const latest = monthlyBars.months[monthlyBars.months.length - 1]
                          if (latest) openMonthSheet(latest, 'invoiced')
                        }}
                        aria-label="Open latest month invoiced list"
                      >
                        <i className="cd-mobile-legend__dot is-invoiced" aria-hidden />
                        Invoiced {invoicedShare.invoiced}%
                      </button>
                      <button
                        type="button"
                        className="cd-mobile-legend is-button"
                        onClick={() => {
                          const latest = monthlyBars.months[monthlyBars.months.length - 1]
                          if (latest) openMonthSheet(latest, 'collected')
                        }}
                        aria-label="Open latest month collected list"
                      >
                        <i className="cd-mobile-legend__dot is-collected" aria-hidden />
                        Collected {invoicedShare.collected}%
                      </button>
                    </div>

                    <div
                      className="cd-mobile-bars"
                      role="list"
                      aria-label="Invoiced vs collected by month. Select a month for details."
                    >
                      {monthlyBars.months.map((m, index) => {
                        const peak = Math.max(monthlyBars.peak, 1)
                        const invoicedH = Math.max(8, (m.invoiced / peak) * 100)
                        const collectedH = Math.max(8, (m.collected / peak) * 100)
                        const isSelected = selectedMonth?.key === m.key
                        return (
                          <button
                            key={m.key}
                            type="button"
                            role="listitem"
                            className={`cd-mobile-bars__col${isSelected ? ' is-selected' : ''}`}
                            onClick={() => openMonthSheet(m, 'collected')}
                            aria-label={`${m.label}: invoiced ${formatCurrency(m.invoiced)}, collected ${formatCurrency(m.collected)}. Show details.`}
                            aria-pressed={isSelected}
                          >
                            <div className="cd-mobile-bars__track">
                              <div className="cd-mobile-bars__pair">
                                <span
                                  className="cd-mobile-bars__bar is-invoiced"
                                  style={
                                    {
                                      height: `${invoicedH}%`,
                                      '--cd-bar-delay': `${index * 45}ms`,
                                    } as CSSProperties
                                  }
                                />
                                <span
                                  className="cd-mobile-bars__bar is-collected"
                                  style={
                                    {
                                      height: `${collectedH}%`,
                                      '--cd-bar-delay': `${index * 45 + 30}ms`,
                                    } as CSSProperties
                                  }
                                />
                              </div>
                            </div>
                            <span className="cd-mobile-bars__label">{m.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Broker Risk */}
              <div
                className="cd-mobile-carousel__slide"
                data-panel-id="brokers"
                role="tabpanel"
                aria-label="Broker Risk"
                ref={(el) => {
                  slideRefs.current.brokers = el
                }}
              >
                <div className="cd-mobile-section__head cd-mobile-section__head--static">
                  <h3 className="cd-mobile-section__title">Broker Risk</h3>
                  <button
                    type="button"
                    className="cd-mobile-section__link"
                    onClick={() => navigate('/client/brokers')}
                  >
                    View all
                    <ChevronRight size={14} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <div className="cd-mobile-panel-card">
                  <BrokerRiskOverview
                    invoices={invoices}
                    payments={payments}
                    loading={loading}
                    className="cd-broker-risk--mobile-home"
                  />
                </div>
              </div>

              {/* Actions */}
              <div
                className="cd-mobile-carousel__slide"
                data-panel-id="actions"
                role="tabpanel"
                aria-label="Actions"
                ref={(el) => {
                  slideRefs.current.actions = el
                }}
              >
                <div className="cd-mobile-section__head cd-mobile-section__head--static">
                  <h3 className="cd-mobile-section__title">Actions</h3>
                  <button
                    type="button"
                    className="cd-mobile-section__link"
                    onClick={() => navigate('/client/invoices')}
                  >
                    View all
                    <ChevronRight size={14} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <div className="cd-mobile-panel-card">
                  <MobileDashboardActions
                    invoices={invoices}
                    payments={payments}
                    loading={loading}
                  />
                </div>
              </div>
            </div>
          </section>

          {selectedMonth ? (
            <MobileMonthCollectionsSheet
              months={monthlyBars.months}
              initialMonthKey={selectedMonth.key}
              payments={payments}
              invoices={invoices}
              initialMode={monthSheetMode}
              onClose={closeMonthSheet}
              onMonthChange={setSelectedMonth}
              onGoToReports={() => {
                closeMonthSheet()
                navigate('/client/reports')
              }}
              onViewPayments={() => {
                closeMonthSheet()
                navigate('/client/payments')
              }}
              onViewInvoices={() => {
                closeMonthSheet()
                navigate('/client/invoices')
              }}
              onPaymentClick={(paymentId) => {
                closeMonthSheet()
                navigate(
                  `/client/payments?paymentId=${encodeURIComponent(paymentId)}`
                )
              }}
              onInvoiceClick={(invoiceId) => {
                closeMonthSheet()
                navigate(
                  `/client/invoices?highlight_invoice=${encodeURIComponent(invoiceId)}`
                )
              }}
            />
          ) : null}

          {/* Collections */}
          <section
            className="cd-mobile-section cd-mobile-section--enter"
            style={{ '--cd-enter-delay': '120ms' } as CSSProperties}
            aria-labelledby="cd-mobile-collections-title"
          >
            <div className="cd-mobile-section__head cd-mobile-section__head--static">
              <h3 id="cd-mobile-collections-title" className="cd-mobile-section__title">
                Collections
              </h3>
              <button
                type="button"
                className="cd-mobile-section__link"
                onClick={() => navigate('/client/payments')}
              >
                View All
                <ChevronRight size={14} strokeWidth={2} aria-hidden />
              </button>
            </div>

            <div className="cd-mobile-collections">
              <button
                type="button"
                className={`cd-mobile-metric-card is-collected${loading ? ' is-loading' : ''}`}
                onClick={() => navigate('/client/payments')}
              >
                <div className="cd-mobile-metric-card__top">
                  <span className="cd-mobile-metric-card__icon is-success" aria-hidden>
                    <CheckCircle2 size={16} strokeWidth={2.25} />
                  </span>
                  <span className="cd-mobile-metric-card__label">Collected 30d</span>
                </div>
                <div className="cd-mobile-metric-card__row">
                  <div>
                    <p className="cd-mobile-metric-card__value tabular-nums">
                      {loading ? '—' : formatCurrency(metrics.paid30Amount)}
                    </p>
                    <p className="cd-mobile-metric-card__meta">
                      {loading
                        ? '…'
                        : metrics.collectedDelta == null
                          ? `${metrics.paid30Count} payments`
                          : `Total ${metrics.collectedDelta >= 0 ? '+' : ''}${metrics.collectedDelta.toFixed(1)}%`}
                    </p>
                  </div>
                  <div className="cd-mobile-metric-card__spark" aria-hidden>
                    {metrics.collectedDelta != null && metrics.collectedDelta !== 0 ? (
                      <span
                        className={`cd-mobile-metric-card__delta${
                          metrics.collectedDelta > 0 ? ' is-up' : ' is-down'
                        }`}
                      >
                        {metrics.collectedDelta > 0 ? '+' : ''}
                        {metrics.collectedDelta.toFixed(0)}%
                      </span>
                    ) : null}
                    <svg width="88" height="36" viewBox="0 0 88 36" fill="none">
                      <path
                        d={sparkPath(collectionSpark)}
                        stroke="#34d399"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
              </button>

              <button
                type="button"
                className={`cd-mobile-metric-card is-overdue${loading ? ' is-loading' : ''}`}
                onClick={() => navigate('/client/invoices?status=overdue')}
              >
                <div className="cd-mobile-metric-card__top">
                  <span className="cd-mobile-metric-card__icon is-danger" aria-hidden>
                    <AlertCircle size={16} strokeWidth={2.25} />
                  </span>
                  <span className="cd-mobile-metric-card__label">Overdue</span>
                </div>
                <div className="cd-mobile-metric-card__row">
                  <div>
                    <p className="cd-mobile-metric-card__value tabular-nums">
                      {loading ? '—' : formatCurrency(metrics.overdueAmount)}
                    </p>
                    <p className="cd-mobile-metric-card__meta">
                      {loading
                        ? '…'
                        : `${metrics.overdueCount} invoice${metrics.overdueCount === 1 ? '' : 's'}`}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
