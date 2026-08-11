import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Banknote, BadgeCheck } from 'lucide-react'
import { useCountUp } from '../../../hooks/useCountUp'
import { formatCurrency, formatDate } from '../../../utils/format'
import DonutRing from './DonutRing'
import CompactAgingBar from './CompactAgingBar'
import StatusStatChips from './StatusStatChips'

type StatusStatChip = {
  key: string
  label: string
  value: string
  count: number
  tone: 'neutral' | 'warn' | 'danger' | 'success' | 'info'
  navigateTo: string
}

type ComingDueBucket = {
  amount: number
  count: number
}

type CashForecastItem = {
  id: string
  invoiceNumber: string
  brokerName: string
  amount: number
  expectedDate: string
  daysOut: number
}

type PaidInvoiceItem = {
  id: string
  invoiceNumber: string
  brokerName: string
  amount: number
  payDate: string
  daysOut: number
}

type DetailListItem = {
  id: string
  invoiceNumber: string
  brokerName: string
  amount: number
  meta: string
}

type ConfirmPaymentItem = DetailListItem & {
  daysLeft: number | null
}

type CashFilter = '7' | '14' | '30'
type DuePane = 'coming' | 'paid'

type OpenBalanceCardProps = {
  /** Open A/R amount to display. */
  amount: number
  onTimeAmount?: number
  overdueAmount?: number
  onTimeCount?: number
  overdueCount?: number
  aging?: {
    '1_15': number
    '16_30': number
    '31_45': number
    '46_60': number
    '61_90': number
    over_91: number
    total: number
  }
  statusChips?: StatusStatChip[]
  recentCollections?: {
    amount: number
    period: string
    trend?: 'up' | 'down' | 'flat'
  }
  comingDue?: {
    next7: ComingDueBucket
    next14: ComingDueBucket
    next30: ComingDueBucket
  }
  cashForecast?: CashForecastItem[]
  paidRecent?: {
    next7: ComingDueBucket
    next14: ComingDueBucket
    next30: ComingDueBucket
  }
  paidInvoices?: PaidInvoiceItem[]
  topOpenInvoices?: DetailListItem[]
  /** Payments awaiting client receipt confirmation. */
  confirmPayments?: ConfirmPaymentItem[]
  loading?: boolean
  /** Optional class on status chips section (onboarding reveal). */
  statsClassName?: string
  /** Optional class on aging section (onboarding reveal). */
  agingClassName?: string
}

const CASH_FILTERS: { id: CashFilter; label: string; maxDays: number }[] = [
  { id: '7', label: '7d', maxDays: 7 },
  { id: '14', label: '14d', maxDays: 14 },
  { id: '30', label: '30d', maxDays: 30 },
]

const DETAIL_ROW_LIMIT = 3

type DetailRowProps = {
  invoiceNumber: string
  brokerName: string
  amount: number
  meta: string
  metaTone?: 'warn'
  onOpen: () => void
}

/** Compact invoice row for a detail column. */
function DetailRow({ invoiceNumber, brokerName, amount, meta, metaTone, onOpen }: DetailRowProps) {
  return (
    <button
      type="button"
      className="cd-detail-col__row"
      onClick={onOpen}
      title={`${invoiceNumber} · ${brokerName}`}
    >
      <span className="cd-detail-col__inv">{invoiceNumber}</span>
      <span className="cd-detail-col__broker">{brokerName}</span>
      <span
        className={`cd-detail-col__meta tabular-nums${metaTone === 'warn' ? ' is-warn' : ''}`}
      >
        {meta}
      </span>
      <span className="cd-detail-col__amt tabular-nums">{formatCurrency(amount)}</span>
    </button>
  )
}

/**
 * Left-rail Open Balance card.
 * Under Aging: Coming due / Confirmed pay | Top open | Payment confirmation.
 */
export default function OpenBalanceCard({
  amount,
  onTimeAmount,
  overdueAmount,
  onTimeCount,
  overdueCount,
  aging,
  statusChips = [],
  recentCollections,
  comingDue,
  cashForecast = [],
  paidRecent,
  paidInvoices = [],
  topOpenInvoices = [],
  confirmPayments = [],
  loading = false,
  statsClassName,
  agingClassName,
}: OpenBalanceCardProps) {
  const navigate = useNavigate()
  const cardRef = useRef<HTMLElement>(null)
  const [cashFilter, setCashFilter] = useState<CashFilter>('7')
  const [duePane, setDuePane] = useState<DuePane>('coming')
  const animated = useCountUp(loading ? 0 : amount, { decimals: 2, duration: 900 })
  const showSplit =
    !loading &&
    typeof onTimeAmount === 'number' &&
    typeof overdueAmount === 'number'

  const showDetailColumns =
    !loading &&
    (cashForecast.length > 0 ||
      paidInvoices.length > 0 ||
      topOpenInvoices.length > 0 ||
      confirmPayments.length > 0)

  const cashRows = useMemo(() => {
    const maxDays = CASH_FILTERS.find((f) => f.id === cashFilter)?.maxDays ?? 7
    return cashForecast.filter((item) => item.daysOut <= maxDays).slice(0, DETAIL_ROW_LIMIT)
  }, [cashForecast, cashFilter])

  const paidRows = useMemo(() => {
    const maxDays = CASH_FILTERS.find((f) => f.id === cashFilter)?.maxDays ?? 7
    return paidInvoices.filter((item) => item.daysOut <= maxDays).slice(0, DETAIL_ROW_LIMIT)
  }, [paidInvoices, cashFilter])

  const topOpenRows = useMemo(
    () => topOpenInvoices.slice(0, DETAIL_ROW_LIMIT),
    [topOpenInvoices]
  )
  const confirmRows = useMemo(
    () => confirmPayments.slice(0, DETAIL_ROW_LIMIT),
    [confirmPayments]
  )

  const paidBuckets = paidRecent ?? {
    next7: { amount: 0, count: 0 },
    next14: { amount: 0, count: 0 },
    next30: { amount: 0, count: 0 },
  }
  const isPaidPane = duePane === 'paid'
  const dueStripBuckets = isPaidPane
    ? [
        {
          label: '7d',
          amount: paidBuckets.next7.amount,
          count: paidBuckets.next7.count,
          href: '/client/invoices',
          title: `${paidBuckets.next7.count} invoices with confirmed pay date in the next 7 days`,
        },
        {
          label: '14d',
          amount: paidBuckets.next14.amount,
          count: paidBuckets.next14.count,
          href: '/client/invoices',
          title: `${paidBuckets.next14.count} invoices with confirmed pay date in the next 14 days`,
        },
        {
          label: '30d',
          amount: paidBuckets.next30.amount,
          count: paidBuckets.next30.count,
          href: '/client/invoices',
          title: `${paidBuckets.next30.count} invoices with confirmed pay date in the next 30 days`,
        },
      ]
    : comingDue
      ? [
          {
            label: '7d',
            amount: comingDue.next7.amount,
            count: comingDue.next7.count,
            href: '/client/invoices',
            title: `${comingDue.next7.count} invoices expected in 7 days (not yet confirmed)`,
          },
          {
            label: '14d',
            amount: comingDue.next14.amount,
            count: comingDue.next14.count,
            href: '/client/invoices',
            title: `${comingDue.next14.count} invoices expected in 14 days (not yet confirmed)`,
          },
          {
            label: '30d',
            amount: comingDue.next30.amount,
            count: comingDue.next30.count,
            href: '/client/invoices',
            title: `${comingDue.next30.count} invoices expected in 30 days (not yet confirmed)`,
          },
        ]
      : []

  const openInvoice = (id: string) => {
    navigate(`/client/invoices?invoiceId=${encodeURIComponent(id)}`)
  }

  const openPaymentConfirm = (paymentId: string) => {
    navigate(
      `/client/payments?status=awaiting_receipt&paymentId=${encodeURIComponent(paymentId)}`
    )
  }

  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const updateTight = () => {
      el.classList.remove('is-tight')
      const overflows = el.scrollHeight > el.clientHeight + 1
      el.classList.toggle('is-tight', overflows)
    }

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(updateTight)
    })
    ro.observe(el)
    updateTight()

    return () => ro.disconnect()
  }, [
    loading,
    amount,
    aging,
    statusChips,
    recentCollections,
    comingDue,
    cashForecast,
    paidRecent,
    paidInvoices,
    topOpenInvoices,
    confirmPayments,
    cashFilter,
    duePane,
    onTimeAmount,
    overdueAmount,
  ])

  return (
    <article
      ref={cardRef}
      className={`cd-open-balance cd-open-balance--expanded${loading ? ' is-loading' : ''}`}
      aria-label="Open Balance"
    >
      <div className="cd-open-balance__wash" aria-hidden />

      <div className="cd-open-balance__hero">
        <div className="cd-open-balance__hero-text" data-onboard-target="openBalance">
          <p className="cd-open-balance__label">Open Balance</p>
          <p className="cd-open-balance__amount tabular-nums">
            {loading ? '—' : formatCurrency(animated)}
          </p>
          {recentCollections && !loading ? (
            <div className="cd-open-balance__context">
              <span className="cd-open-balance__context-text">
                {formatCurrency(recentCollections.amount)} collected in {recentCollections.period}
              </span>
              {recentCollections.trend === 'up' ? (
                <span className="cd-open-balance__context-icon is-up" aria-label="Trending up">
                  ↑
                </span>
              ) : recentCollections.trend === 'down' ? (
                <span className="cd-open-balance__context-icon is-down" aria-label="Trending down">
                  ↓
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {showSplit && onTimeAmount != null && overdueAmount != null ? (
          <div className="cd-open-balance__donut" data-onboard-target="donut">
            <DonutRing
              onTimeAmount={onTimeAmount}
              overdueAmount={overdueAmount}
              totalAmount={amount}
              onTimeCount={onTimeCount}
              overdueCount={overdueCount}
              loading={loading}
            />
          </div>
        ) : null}
      </div>

      {statusChips.length > 0 ? (
        <div
          className={`cd-open-balance__stats${statsClassName ? ` ${statsClassName}` : ''}`}
          data-onboard-target="stats"
        >
          <StatusStatChips chips={statusChips} loading={loading} />
        </div>
      ) : null}

      {(comingDue || paidRecent) && !loading ? (
        <div className="cd-open-balance__coming-due">
          <div className="cd-coming-due__tabs" role="tablist" aria-label="Due vs confirmed paid">
            <button
              type="button"
              role="tab"
              aria-selected={!isPaidPane}
              className={`cd-coming-due__tab${!isPaidPane ? ' is-active' : ''}`}
              onClick={() => setDuePane('coming')}
            >
              <CalendarClock size={10} strokeWidth={2.25} aria-hidden />
              Coming due
            </button>
            <span className="cd-coming-due__tab-pipe" aria-hidden>
              |
            </span>
            <button
              type="button"
              role="tab"
              aria-selected={isPaidPane}
              className={`cd-coming-due__tab is-paid${isPaidPane ? ' is-active' : ''}`}
              onClick={() => setDuePane('paid')}
            >
              <BadgeCheck size={10} strokeWidth={2.25} aria-hidden />
              Paid
            </button>
          </div>
          <div className="cd-coming-due__grid">
            {dueStripBuckets.map((bucket) => (
              <button
                key={bucket.label}
                type="button"
                className={`cd-coming-due__item${isPaidPane ? ' is-paid' : ''}`}
                onClick={() => navigate(bucket.href)}
                title={bucket.title}
              >
                <span className="cd-coming-due__label">{bucket.label}</span>
                <span className="cd-coming-due__value tabular-nums">
                  {formatCurrency(bucket.amount)}
                </span>
                <span className="cd-coming-due__count tabular-nums">{bucket.count}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {aging ? (
        <div
          className={`cd-open-balance__aging${agingClassName ? ` ${agingClassName}` : ''}`}
          data-onboard-target="aging"
        >
          <CompactAgingBar aging={aging} loading={loading} />
        </div>
      ) : null}

      {showDetailColumns ? (
        <div className="cd-open-balance__detail-cols" aria-label="Open Balance details">
          <section
            className="cd-detail-col"
            aria-label={isPaidPane ? 'Confirmed pay' : 'Expected payment'}
          >
            <header className="cd-detail-col__head">
              <h3 className="cd-detail-col__title">
                {isPaidPane ? (
                  <BadgeCheck size={11} strokeWidth={2.25} aria-hidden />
                ) : (
                  <Banknote size={11} strokeWidth={2.25} aria-hidden />
                )}
                {isPaidPane ? 'Confirmed pay' : 'Expected payment'}
              </h3>
              <span className="cd-detail-col__pipe" aria-hidden>
                |
              </span>
              <div
                className="cd-detail-col__filters"
                role="tablist"
                aria-label={isPaidPane ? 'Confirmed pay window' : 'Expected payment window'}
              >
                {CASH_FILTERS.map((f, idx) => (
                  <span key={f.id} className="cd-detail-col__filter-wrap">
                    {idx > 0 ? (
                      <span className="cd-detail-col__pipe" aria-hidden>
                        |
                      </span>
                    ) : null}
                    <button
                      type="button"
                      role="tab"
                      aria-selected={cashFilter === f.id}
                      className={`cd-detail-col__filter${cashFilter === f.id ? ' is-active' : ''}`}
                      onClick={() => setCashFilter(f.id)}
                    >
                      {f.label}
                    </button>
                  </span>
                ))}
              </div>
            </header>
            {isPaidPane ? (
              paidRows.length === 0 ? (
                <p className="cd-detail-col__empty">No confirmed pay dates</p>
              ) : (
                <ul className="cd-detail-col__rows">
                  {paidRows.map((item) => (
                    <li key={item.id}>
                      <DetailRow
                        invoiceNumber={item.invoiceNumber}
                        brokerName={item.brokerName}
                        amount={item.amount}
                        meta={formatDate(item.payDate)}
                        onOpen={() => openInvoice(item.id)}
                      />
                    </li>
                  ))}
                </ul>
              )
            ) : cashRows.length === 0 ? (
              <p className="cd-detail-col__empty">None in this window</p>
            ) : (
              <ul className="cd-detail-col__rows">
                {cashRows.map((item) => (
                  <li key={item.id}>
                    <DetailRow
                      invoiceNumber={item.invoiceNumber}
                      brokerName={item.brokerName}
                      amount={item.amount}
                      meta={formatDate(item.expectedDate)}
                      onOpen={() => openInvoice(item.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <span className="cd-detail-cols__sep" aria-hidden>
            |
          </span>

          <section className="cd-detail-col" aria-label="Top open invoices">
            <header className="cd-detail-col__head">
              <h3 className="cd-detail-col__title">Top open</h3>
            </header>
            {topOpenRows.length === 0 ? (
              <p className="cd-detail-col__empty">No open invoices</p>
            ) : (
              <ul className="cd-detail-col__rows">
                {topOpenRows.map((item) => (
                  <li key={item.id}>
                    <DetailRow
                      invoiceNumber={item.invoiceNumber}
                      brokerName={item.brokerName}
                      amount={item.amount}
                      meta={item.meta}
                      onOpen={() => openInvoice(item.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <span className="cd-detail-cols__sep" aria-hidden>
            |
          </span>

          <section className="cd-detail-col" aria-label="Payment confirmation">
            <header className="cd-detail-col__head">
              <h3 className="cd-detail-col__title">
                <BadgeCheck size={11} strokeWidth={2.25} aria-hidden />
                Payment confirmation
              </h3>
            </header>
            {confirmRows.length === 0 ? (
              <p className="cd-detail-col__empty">Nothing to confirm</p>
            ) : (
              <ul className="cd-detail-col__rows">
                {confirmRows.map((item) => (
                  <li key={item.id}>
                    <DetailRow
                      invoiceNumber={item.invoiceNumber}
                      brokerName={item.brokerName}
                      amount={item.amount}
                      meta={item.meta}
                      metaTone={
                        item.daysLeft != null && item.daysLeft <= 3 ? 'warn' : undefined
                      }
                      onOpen={() => openPaymentConfirm(item.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </article>
  )
}
