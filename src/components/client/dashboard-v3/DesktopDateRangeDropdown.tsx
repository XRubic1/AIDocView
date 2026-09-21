import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

type DatePresetId = 'all' | '30d' | '90d' | 'ytd' | 'custom'

type DesktopDateRangeDropdownProps = {
  /** Anchor element — panel positions under this. */
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  activeValue: DatePresetId
  dateFrom: string
  dateTo: string
  onApplyPreset: (preset: 'all' | '30d' | '90d' | 'ytd') => void
  onChangeFrom: (value: string) => void
  onChangeTo: (value: string) => void
  onClose: () => void
  /** Optional label override for “All” (e.g. Last 12 months). */
  allLabel?: string
}

const PRESETS: { id: DatePresetId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'ytd', label: 'YTD' },
  { id: 'custom', label: 'Custom' },
]

/**
 * Desktop date-range dropdown — same presets as the mobile sheet,
 * anchored under a trigger instead of a full-screen bottom sheet.
 */
export default function DesktopDateRangeDropdown({
  anchorRef,
  open,
  activeValue,
  dateFrom,
  dateTo,
  onApplyPreset,
  onChangeFrom,
  onChangeTo,
  onClose,
  allLabel = 'All',
}: DesktopDateRangeDropdownProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [customOpen, setCustomOpen] = useState(activeValue === 'custom')
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setCustomOpen(activeValue === 'custom')
  }, [open, activeValue])

  useEffect(() => {
    if (!open) return

    const updatePos = () => {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const width = Math.max(rect.width, 280)
      let left = rect.left
      if (left + width > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - width - 12)
      }
      setPos({
        top: rect.bottom + 6,
        left,
        width,
      })
    }

    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, onClose, anchorRef])

  if (!open || !pos) return null

  const chipSelected = customOpen ? 'custom' : activeValue

  const selectPreset = (id: DatePresetId) => {
    if (id === 'custom') {
      setCustomOpen(true)
      return
    }
    setCustomOpen(false)
    onApplyPreset(id)
    onClose()
  }

  const portalTarget =
    typeof document !== 'undefined'
      ? document.querySelector('.client-portal') ?? document.body
      : null
  if (!portalTarget) return null

  return createPortal(
    <div
      ref={panelRef}
      className="cdv3-date-dropdown"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      <p id={titleId} className="cdv3-date-dropdown__title">
        Date range
      </p>

      <div className="cdv3-date-dropdown__presets" role="listbox" aria-label="Date presets">
        {PRESETS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={chipSelected === option.id}
            className={`cdv3-date-dropdown__chip${
              chipSelected === option.id ? ' is-selected' : ''
            }`}
            onClick={() => selectPreset(option.id)}
          >
            {option.id === 'all' ? allLabel : option.label}
          </button>
        ))}
      </div>

      {customOpen ? (
        <div className="cdv3-date-dropdown__custom">
          <label className="cdv3-date-dropdown__field">
            <span>From</span>
            <input
              type="date"
              className="client-input"
              value={dateFrom}
              onChange={(e) => onChangeFrom(e.target.value)}
              aria-label="From date"
            />
          </label>
          <label className="cdv3-date-dropdown__field">
            <span>To</span>
            <input
              type="date"
              className="client-input"
              value={dateTo}
              onChange={(e) => onChangeTo(e.target.value)}
              aria-label="To date"
            />
          </label>
          <button
            type="button"
            className="cdv3-date-dropdown__apply"
            onClick={onClose}
            disabled={Boolean(dateFrom) && !dateTo}
          >
            Apply
          </button>
        </div>
      ) : null}
    </div>,
    portalTarget
  )
}
