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
 * Under Aging: Expected payment | Top open | Payment confirmation.
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
  topOpenInvoices = [],
  confirmPayments = [],
  loading = false,
  statsClassName,
  agingClassName,
}: OpenBalanceCardProps) {
  const navigate = useNavigate()
  const cardRef = useRef<HTMLElement>(null)
  const [cashFilter, setCashFilter] = useState<CashFilter>('7')
  const animated = useCountUp(loading ? 0 : amount, { decimals: 2, duration: 900 })
  const showSplit =
    !loading &&
    typeof onTimeAmount === 'number' &&
    typeof overdueAmount === 'number'

  const showDetailColumns =
    !loading &&
    (cashForecast.length > 0 || topOpenInvoices.length > 0 || confirmPayments.length > 0)

  const cashRows = useMemo(() => {
    const maxDays = CASH_FILTERS.find((f) => f.id === cashFilter)?.maxDays ?? 7
    return cashForecast.filter((item) => item.daysOut <= maxDays).slice(0, DETAIL_ROW_LIMIT)
  }, [cashForecast, cashFilter])

  const topOpenRows = useMemo(
    () => topOpenInvoices.slice(0, DETAIL_ROW_LIMIT),
    [topOpenInvoices]
  )
  const confirmRows = useMemo(
    () => confirmPayments.slice(0, DETAIL_ROW_LIMIT),
    [confirmPayments]
  )

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
    topOpenInvoices,
    confirmPayments,
    cashFilter,
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

      {comingDue && !loading ? (
        <div className="cd-open-balance__coming-due">
          <span className="cd-coming-due__title">
            <CalendarClock size={10} strokeWidth={2.25} aria-hidden />
            Coming due
          </span>
          <div className="cd-coming-due__grid">
            <button
              type="button"
              className="cd-coming-due__item"
              onClick={() => navigate('/client/invoices')}
              title={`${comingDue.next7.count} invoices expected in 7 days`}
            >
              <span className="cd-coming-due__label">7d</span>
              <span className="cd-coming-due__value tabular-nums">
                {formatCurrency(comingDue.next7.amount)}
              </span>
              <span className="cd-coming-due__count tabular-nums">{comingDue.next7.count}</span>
            </button>
            <button
              type="button"
              className="cd-coming-due__item"
              onClick={() => navigate('/client/invoices')}
              title={`${comingDue.next14.count} invoices expected in 14 days`}
            >
              <span className="cd-coming-due__label">14d</span>
              <span className="cd-coming-due__value tabular-nums">
                {formatCurrency(comingDue.next14.amount)}
              </span>
              <span className="cd-coming-due__count tabular-nums">{comingDue.next14.count}</span>
            </button>
            <button
              type="button"
              className="cd-coming-due__item"
              onClick={() => navigate('/client/invoices')}
              title={`${comingDue.next30.count} invoices expected in 30 days`}
            >
              <span className="cd-coming-due__label">30d</span>
              <span className="cd-coming-due__value tabular-nums">
                {formatCurrency(comingDue.next30.amount)}
              </span>
              <span className="cd-coming-due__count tabular-nums">{comingDue.next30.count}</span>
            </button>
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
          <section className="cd-detail-col" aria-label="Expected payment">
            <header className="cd-detail-col__head">
              <h3 className="cd-detail-col__title">
                <Banknote size={11} strokeWidth={2.25} aria-hidden />
                Expected payment
              </h3>
              <span className="cd-detail-col__pipe" aria-hidden>
                |
              </span>
              <div className="cd-detail-col__filters" role="tablist" aria-label="Expected payment window">
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
            {cashRows.length === 0 ? (
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
