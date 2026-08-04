import { useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatDate } from '../../utils/format'

type DatePresetId = 'all' | '30d' | '90d' | 'ytd' | 'custom'

type MobilePaymentDateRangeSheetProps = {
  /** Sheet eyebrow — e.g. Payments / Invoices. */
  eyebrow?: string
  activeValue: DatePresetId
  dateFrom: string
  dateTo: string
  onApplyPreset: (preset: 'all' | '30d' | '90d' | 'ytd') => void
  onChangeFrom: (value: string) => void
  onChangeTo: (value: string) => void
  onClose: () => void
}

const PRESETS: { id: DatePresetId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'ytd', label: 'YTD' },
  { id: 'custom', label: 'Custom' },
]

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** Local YYYY-MM-DD from a Date (avoids UTC shift). */
function toIsoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse YYYY-MM-DD as local midnight. */
function parseIsoLocal(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1)
}

function monthTitle(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function compareIso(a: string, b: string): number {
  return a.localeCompare(b)
}

/**
 * Mobile date-range sheet — presets first; calendar only for Custom.
 */
export default function MobilePaymentDateRangeSheet({
  eyebrow = 'Payments',
  activeValue,
  dateFrom,
  dateTo,
  onApplyPreset,
  onChangeFrom,
  onChangeTo,
  onClose,
}: MobilePaymentDateRangeSheetProps) {
  const titleId = useId()
  const [visible, setVisible] = useState(false)
  /** Calendar is only shown after the user chooses Custom. */
  const [customOpen, setCustomOpen] = useState(activeValue === 'custom')
  /** When true, next calendar tap sets the start and clears the end. */
  const [pickingStart, setPickingStart] = useState(!dateFrom || Boolean(dateFrom && dateTo))
  const [viewMonth, setViewMonth] = useState(() => {
    const anchor = parseIsoLocal(dateTo || dateFrom || '') ?? new Date()
    return startOfMonth(anchor)
  })

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close helper is stable for this mount
  }, [])

  /** Animate out, then unmount via parent onClose. */
  const requestClose = () => {
    setVisible(false)
    window.setTimeout(onClose, 280)
  }

  const selectPreset = (id: DatePresetId) => {
    if (id === 'custom') {
      setCustomOpen(true)
      setPickingStart(!dateFrom || Boolean(dateFrom && dateTo))
      const anchor = parseIsoLocal(dateTo || dateFrom || '')
      if (anchor) setViewMonth(startOfMonth(anchor))
      return
    }
    setCustomOpen(false)
    onApplyPreset(id)
    requestClose()
  }

  /** Hide the calendar and return to preset chips only. */
  const closeCustomCalendar = () => {
    setCustomOpen(false)
  }

  /** First tap = start, second tap = end (swaps if needed). */
  const onDayClick = (iso: string) => {
    if (pickingStart || !dateFrom || (dateFrom && dateTo)) {
      onChangeFrom(iso)
      onChangeTo('')
      setPickingStart(false)
      return
    }

    if (compareIso(iso, dateFrom) < 0) {
      onChangeTo(dateFrom)
      onChangeFrom(iso)
    } else {
      onChangeTo(iso)
    }
    setPickingStart(true)
  }

  const cells = useMemo(() => {
    const first = startOfMonth(viewMonth)
    const startPad = first.getDay()
    const daysInMonth = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth() + 1,
      0
    ).getDate()

    const grid: { iso: string; day: number; inMonth: boolean }[] = []
    for (let i = 0; i < startPad; i += 1) {
      grid.push({ iso: '', day: 0, inMonth: false })
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day)
      grid.push({ iso: toIsoLocal(d), day, inMonth: true })
    }
    while (grid.length % 7 !== 0) {
      grid.push({ iso: '', day: 0, inMonth: false })
    }
    return grid
  }, [viewMonth])

  const rangeLabel = useMemo(() => {
    if (dateFrom && dateTo) return `${formatDate(dateFrom)} – ${formatDate(dateTo)}`
    if (dateFrom) return `${formatDate(dateFrom)} → pick end`
    return 'Tap start, then end'
  }, [dateFrom, dateTo])

  const chipSelected = customOpen ? 'custom' : activeValue

  const portalTarget =
    typeof document !== 'undefined'
      ? document.querySelector('.client-portal') ?? document.body
      : null

  if (!portalTarget) return null

  return createPortal(
    <div
      className={`mobile-payments-date-sheet-root${visible ? ' is-visible' : ''}`}
      role="presentation"
    >
      <button
        type="button"
        className="mobile-payments-date-sheet__backdrop"
        aria-label="Close date range"
        onClick={requestClose}
      />
      <div
        className={`mobile-payments-date-sheet${customOpen ? ' is-custom' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="mobile-payments-date-sheet__header">
          <div className="mobile-payments-date-sheet__header-copy">
            <p className="mobile-payments-date-sheet__eyebrow">{eyebrow}</p>
            <h2 id={titleId} className="mobile-payments-date-sheet__title">
              Date range
            </h2>
          </div>
          <button
            type="button"
            className="mobile-payments-date-sheet__close"
            aria-label="Close filter"
            onClick={requestClose}
          >
            <X size={18} strokeWidth={2.5} aria-hidden />
          </button>
        </header>

        <div className="mobile-payments-date-sheet__body">
          <div
            className="mobile-payments-date-sheet__presets"
            role="listbox"
            aria-label="Date presets"
          >
            {PRESETS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={chipSelected === option.id}
                className={`mobile-payments-date-sheet__chip${
                  chipSelected === option.id ? ' is-selected' : ''
                }`}
                onClick={() => selectPreset(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {customOpen ? (
            <div
              className="mobile-payments-date-sheet__calendar"
              aria-label="Custom range calendar"
            >
              <div className="mobile-payments-date-sheet__cal-nav">
                <div className="mobile-payments-date-sheet__cal-nav-main">
                  <button
                    type="button"
                    className="mobile-payments-date-sheet__cal-nav-btn"
                    aria-label="Previous month"
                    onClick={() => setViewMonth((m) => addMonths(m, -1))}
                  >
                    <ChevronLeft size={16} strokeWidth={2.25} aria-hidden />
                  </button>
                  <p className="mobile-payments-date-sheet__cal-title">
                    {monthTitle(viewMonth)}
                  </p>
                  <button
                    type="button"
                    className="mobile-payments-date-sheet__cal-nav-btn"
                    aria-label="Next month"
                    onClick={() => setViewMonth((m) => addMonths(m, 1))}
                  >
                    <ChevronRight size={16} strokeWidth={2.25} aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  className="mobile-payments-date-sheet__cal-dismiss"
                  aria-label="Close custom calendar"
                  onClick={closeCustomCalendar}
                >
                  <X size={14} strokeWidth={2.5} aria-hidden />
                </button>
              </div>

              <div className="mobile-payments-date-sheet__weekdays" aria-hidden>
                {WEEKDAYS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>

              <div className="mobile-payments-date-sheet__grid" role="grid">
                {cells.map((cell, idx) => {
                  if (!cell.inMonth) {
                    return (
                      <span
                        key={`pad-${idx}`}
                        className="mobile-payments-date-sheet__day is-empty"
                      />
                    )
                  }

                  const isStart = Boolean(dateFrom && cell.iso === dateFrom)
                  const isEnd = Boolean(dateTo && cell.iso === dateTo)
                  const inRange =
                    Boolean(dateFrom && dateTo) &&
                    compareIso(cell.iso, dateFrom) >= 0 &&
                    compareIso(cell.iso, dateTo) <= 0
                  const col = idx % 7
                  const isWeekStart = col === 0
                  const isWeekEnd = col === 6

                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      className={[
                        'mobile-payments-date-sheet__day',
                        inRange ? 'is-in-range' : '',
                        isStart ? 'is-start' : '',
                        isEnd ? 'is-end' : '',
                        isWeekStart ? 'is-week-start' : '',
                        isWeekEnd ? 'is-week-end' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onDayClick(cell.iso)}
                      aria-label={cell.iso}
                      aria-pressed={isStart || isEnd}
                    >
                      <span className="mobile-payments-date-sheet__day-num">
                        {cell.day}
                      </span>
                    </button>
                  )
                })}
              </div>

              <p className="mobile-payments-date-sheet__range-hint">{rangeLabel}</p>
            </div>
          ) : null}
        </div>

        <footer className="mobile-payments-date-sheet__footer">
          {customOpen ? (
            <button
              type="button"
              className="mobile-payments-date-sheet__apply"
              onClick={requestClose}
              disabled={Boolean(dateFrom) && !dateTo}
            >
              Apply
            </button>
          ) : (
            <button
              type="button"
              className="mobile-payments-date-sheet__apply is-secondary"
              onClick={requestClose}
            >
              Done
            </button>
          )}
        </footer>

        <div className="mobile-payments-date-sheet__handle" aria-hidden />
      </div>
    </div>,
    portalTarget
  )
}
