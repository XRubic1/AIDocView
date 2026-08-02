import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, BarChart3, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import { formatCurrency, formatDate } from '../../../utils/format'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../../../utils/paymentVariance'

export interface MonthChartBucket {
  key: string
  label: string
  invoiced: number
  collected: number
}

export type MonthSheetMode = 'collected' | 'invoiced'

type InvoicePayState = 'paid' | 'unpaid' | 'confirm'

/** Paid / unpaid / awaiting confirmation for an invoice row. */
function getInvoicePayState(invoice: Invoice, payments: Payment[]): InvoicePayState {
  if (invoice.status === 'paid') return 'paid'
  if (
    payments.some(
      (p) => p.invoice_id === invoice.id && p.status === 'awaiting_receipt'
    )
  ) {
    return 'confirm'
  }
  const balance = getInvoiceOpenArBalance(invoice, payments)
  if (balance <= AMOUNT_EPSILON) return 'paid'
  return 'unpaid'
}

function payStateLabel(state: InvoicePayState): string {
  if (state === 'paid') return 'Paid'
  if (state === 'confirm') return 'Confirm payment'
  return 'Open'
}

interface MobileMonthCollectionsSheetProps {
  months: MonthChartBucket[]
  initialMonthKey: string
  payments: Payment[]
  invoices: Invoice[]
  initialMode?: MonthSheetMode
  onClose: () => void
  onMonthChange?: (month: MonthChartBucket) => void
  onGoToReports: () => void
  onViewPayments: () => void
  onViewInvoices: () => void
  onPaymentClick: (paymentId: string) => void
  onInvoiceClick: (invoiceId: string) => void
}

/** Human-readable month title from `YYYY-MM` key. */
function monthTitle(key: string, fallback: string): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return fallback
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function paymentsForMonth(payments: Payment[], key: string): Payment[] {
  return payments
    .filter(
      (p) =>
        p.status === 'confirmed' &&
        typeof p.received_date === 'string' &&
        p.received_date.slice(0, 7) === key
    )
    .sort(
      (a, b) =>
        new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
    )
}

function invoicesForMonth(
  invoices: Invoice[],
  payments: Payment[],
  key: string
): Invoice[] {
  const payRank: Record<InvoicePayState, number> = {
    confirm: 0,
    unpaid: 1,
    paid: 2,
  }

  return invoices
    .filter(
      (inv) =>
        typeof inv.invoice_date === 'string' &&
        inv.invoice_date.slice(0, 7) === key
    )
    .sort((a, b) => {
      const rankA = payRank[getInvoicePayState(a, payments)]
      const rankB = payRank[getInvoicePayState(b, payments)]
      if (rankA !== rankB) return rankA - rankB
      return new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()
    })
}

/**
 * Invoice Management bottom sheet — swipe / chevrons across months,
 * Collected vs Invoiced lists.
 */
export default function MobileMonthCollectionsSheet({
  months,
  initialMonthKey,
  payments,
  invoices,
  initialMode = 'collected',
  onClose,
  onMonthChange,
  onGoToReports,
  onViewPayments,
  onViewInvoices,
  onPaymentClick,
  onInvoiceClick,
}: MobileMonthCollectionsSheetProps) {
  const titleId = useId()
  const pagerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<MonthSheetMode>(initialMode)
  const startIndex = Math.max(
    0,
    months.findIndex((m) => m.key === initialMonthKey)
  )
  const [activeIndex, setActiveIndex] = useState(startIndex)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const lockAxis = useRef<'x' | 'y' | null>(null)
  const dragXRef = useRef(0)
  const activeIndexRef = useRef(activeIndex)
  const monthsLenRef = useRef(months.length)
  activeIndexRef.current = activeIndex
  monthsLenRef.current = months.length

  const setDrag = useCallback((x: number) => {
    dragXRef.current = x
    setDragX(x)
  }, [])

  const activeMonth = months[activeIndex] ?? months[0]
  const showingCollected = mode === 'collected'

  const monthPayments = useMemo(
    () => (activeMonth ? paymentsForMonth(payments, activeMonth.key) : []),
    [payments, activeMonth]
  )
  const monthInvoices = useMemo(
    () => (activeMonth ? invoicesForMonth(invoices, payments, activeMonth.key) : []),
    [invoices, payments, activeMonth]
  )

  useEffect(() => {
    setMode(initialMode)
  }, [initialMode, initialMonthKey])

  const goToMonth = useCallback(
    (index: number) => {
      if (index < 0 || index >= months.length) return
      setActiveIndex(index)
      dragXRef.current = 0
      setDragX(0)
      setIsDragging(false)
      onMonthChange?.(months[index])
    },
    [months, onMonthChange]
  )

  const goToMonthRef = useRef(goToMonth)
  goToMonthRef.current = goToMonth

  /** Native non-passive touch listeners so horizontal swipe can win on mobile. */
  useEffect(() => {
    const el = pagerRef.current
    if (!el) return

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      touchStartX.current = t.clientX
      touchStartY.current = t.clientY
      lockAxis.current = null
      setDrag(0)
      setIsDragging(true)
    }

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      const dx = t.clientX - touchStartX.current
      const dy = t.clientY - touchStartY.current

      if (lockAxis.current == null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        lockAxis.current = Math.abs(dx) > Math.abs(dy) * 1.1 ? 'x' : 'y'
        if (lockAxis.current === 'y') {
          setIsDragging(false)
          setDrag(0)
          return
        }
      }

      if (lockAxis.current !== 'x') return

      // Keep the page from scrolling vertically while we page months
      e.preventDefault()

      const idx = activeIndexRef.current
      const len = monthsLenRef.current
      const atStart = idx <= 0 && dx > 0
      const atEnd = idx >= len - 1 && dx < 0
      setDrag(atStart || atEnd ? dx * 0.28 : dx)
    }

    const onEnd = () => {
      if (lockAxis.current !== 'x') {
        setIsDragging(false)
        setDrag(0)
        lockAxis.current = null
        return
      }

      const threshold = 48
      const dx = dragXRef.current
      const idx = activeIndexRef.current
      const len = monthsLenRef.current

      if (dx <= -threshold && idx < len - 1) {
        goToMonthRef.current(idx + 1)
      } else if (dx >= threshold && idx > 0) {
        goToMonthRef.current(idx - 1)
      } else {
        setDrag(0)
        setIsDragging(false)
      }
      lockAxis.current = null
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)

    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [setDrag])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goToMonth(activeIndexRef.current - 1)
      if (e.key === 'ArrowRight') goToMonth(activeIndexRef.current + 1)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, goToMonth])

  const requestClose = () => {
    setVisible(false)
    window.setTimeout(onClose, 280)
  }

  if (!activeMonth) return null

  const title = monthTitle(activeMonth.key, activeMonth.label)
  const canGoPrev = activeIndex > 0
  const canGoNext = activeIndex < months.length - 1

  const trackStyle: CSSProperties = {
    transform: `translate3d(calc(${-activeIndex * 100}% + ${dragX}px), 0, 0)`,
    transition: isDragging ? 'none' : 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
  }

  return createPortal(
    <div
      className={`cd-month-sheet-root${visible ? ' is-visible' : ''}`}
      role="presentation"
    >
      <button
        type="button"
        className="cd-month-sheet__backdrop"
        aria-label="Close month details"
        onClick={requestClose}
      />
      <button
        type="button"
        className="cd-month-sheet__close"
        aria-label="Close"
        onClick={requestClose}
      >
        <X size={18} strokeWidth={2.5} aria-hidden />
      </button>
      <div
        className="cd-month-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="cd-month-sheet__handle" aria-hidden />

        <header className="cd-month-sheet__header">
          <p className="cd-month-sheet__eyebrow">Invoice management</p>

          <div className="cd-month-sheet__nav-row">
            <button
              type="button"
              className="cd-month-sheet__nav"
              aria-label="Previous month"
              disabled={!canGoPrev}
              onClick={() => goToMonth(activeIndex - 1)}
            >
              <ChevronLeft size={22} strokeWidth={2.25} aria-hidden />
            </button>
            <div className="cd-month-sheet__header-copy">
              <h2 id={titleId} className="cd-month-sheet__title">
                {title}
              </h2>
              <p className="cd-month-sheet__pager-hint">
                {activeIndex + 1} of {months.length}
              </p>
            </div>
            <button
              type="button"
              className="cd-month-sheet__nav"
              aria-label="Next month"
              disabled={!canGoNext}
              onClick={() => goToMonth(activeIndex + 1)}
            >
              <ChevronRight size={22} strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        </header>

        <div ref={pagerRef} className="cd-month-sheet__pager">
          <div className="cd-month-sheet__track" style={trackStyle}>
            {months.map((month) => {
              const isActive = month.key === activeMonth.key
              const pagePayments = isActive
                ? monthPayments
                : paymentsForMonth(payments, month.key)
              const pageInvoices = isActive
                ? monthInvoices
                : invoicesForMonth(invoices, payments, month.key)

              return (
                <section key={month.key} className="cd-month-sheet__page">
                  <div
                    className="cd-month-sheet__summary"
                    role="tablist"
                    aria-label="Show collected or invoiced"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={showingCollected}
                      tabIndex={isActive ? 0 : -1}
                      className={`cd-month-sheet__stat${
                        showingCollected ? ' is-active is-collected' : ''
                      }`}
                      onClick={() => setMode('collected')}
                    >
                      <span className="cd-month-sheet__stat-label">Collected</span>
                      <span className="cd-month-sheet__stat-value tabular-nums">
                        {formatCurrency(month.collected)}
                      </span>
                      <span className="cd-month-sheet__stat-meta">
                        {pagePayments.length} payment
                        {pagePayments.length === 1 ? '' : 's'}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!showingCollected}
                      tabIndex={isActive ? 0 : -1}
                      className={`cd-month-sheet__stat${
                        !showingCollected ? ' is-active is-invoiced' : ''
                      }`}
                      onClick={() => setMode('invoiced')}
                    >
                      <span className="cd-month-sheet__stat-label">Invoiced</span>
                      <span className="cd-month-sheet__stat-value tabular-nums">
                        {formatCurrency(month.invoiced)}
                      </span>
                      <span className="cd-month-sheet__stat-meta">
                        {pageInvoices.length} invoice
                        {pageInvoices.length === 1 ? '' : 's'}
                      </span>
                    </button>
                  </div>

                  <div className="cd-month-sheet__list" role="tabpanel">
                    {showingCollected ? (
                      pagePayments.length === 0 ? (
                        <p className="cd-month-sheet__empty">
                          No confirmed collections this month.
                        </p>
                      ) : (
                        <ul className="cd-month-sheet__items">
                          {pagePayments.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                className="cd-month-sheet__item"
                                tabIndex={isActive ? 0 : -1}
                                onClick={() => onPaymentClick(p.id)}
                              >
                                <span className="cd-month-sheet__item-copy">
                                  <span className="cd-month-sheet__item-title">
                                    {p.broker_name || 'Broker'}
                                  </span>
                                  <span className="cd-month-sheet__item-meta">
                                    {p.invoice_number}
                                    {p.received_date
                                      ? ` · ${formatDate(p.received_date)}`
                                      : ''}
                                  </span>
                                </span>
                                <span className="cd-month-sheet__item-amount tabular-nums">
                                  {formatCurrency(p.amount)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )
                    ) : pageInvoices.length === 0 ? (
                      <p className="cd-month-sheet__empty">No invoices this month.</p>
                    ) : (
                      <ul className="cd-month-sheet__items">
                        {pageInvoices.map((inv) => {
                          const payState = getInvoicePayState(inv, payments)
                          return (
                          <li key={inv.id}>
                            <button
                              type="button"
                              className="cd-month-sheet__item"
                              tabIndex={isActive ? 0 : -1}
                              onClick={() => onInvoiceClick(inv.id)}
                            >
                              <span className="cd-month-sheet__item-copy">
                                <span className="cd-month-sheet__item-title">
                                  {inv.broker_name || 'Broker'}
                                </span>
                                <span className="cd-month-sheet__item-meta">
                                  {inv.invoice_number}
                                  {inv.invoice_date
                                    ? ` · ${formatDate(inv.invoice_date)}`
                                    : ''}
                                </span>
                              </span>
                              <span className="cd-month-sheet__item-end">
                                <span
                                  className={`cd-month-sheet__pay-pill is-${payState}`}
                                >
                                  {payStateLabel(payState)}
                                </span>
                                <span className="cd-month-sheet__item-amount is-invoiced tabular-nums">
                                  {formatCurrency(inv.amount)}
                                </span>
                              </span>
                            </button>
                          </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>

        <footer className="cd-month-sheet__footer">
          <button
            type="button"
            className="cd-month-sheet__btn is-secondary"
            onClick={showingCollected ? onViewPayments : onViewInvoices}
          >
            {showingCollected ? 'View payments' : 'View invoices'}
            <ArrowRight size={14} strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            className="cd-month-sheet__btn is-primary"
            onClick={onGoToReports}
          >
            <BarChart3 size={15} strokeWidth={2.25} aria-hidden />
            Go to reports
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
