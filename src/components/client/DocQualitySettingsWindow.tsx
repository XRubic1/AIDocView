import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Crop, RotateCcw, Save, SlidersHorizontal, X } from 'lucide-react'
import {
  DEFAULT_DOC_PAGE_QUALITY,
  type DocPageQuality,
  isDefaultDocPageQuality,
} from '../../utils/docPageQuality'

type DocQualitySettingsWindowProps = {
  open: boolean
  title?: string
  quality: DocPageQuality
  onChange: (next: DocPageQuality) => void
  onClose: () => void
  onAutoCrop: () => void
  autoCropBusy?: boolean
  /** Persist current settings for this Credyx viewer (local only). */
  onSave?: (quality: DocPageQuality) => void
  /** Clear saved preference and reset to defaults. */
  onResetSaved?: () => void
  /** Optional anchor — defaults to centered floating panel. */
  style?: CSSProperties
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <label className="doc-quality-win__row">
      <span className="doc-quality-win__label">
        {label}
        <span className="doc-quality-win__value">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

/**
 * Floating Credyx-only window for BOL/page quality + crop.
 * Optional Save keeps prefs in local storage (never sent to carrier/broker).
 */
export default function DocQualitySettingsWindow({
  open,
  title = 'Page quality',
  quality,
  onChange,
  onClose,
  onAutoCrop,
  autoCropBusy = false,
  onSave,
  onResetSaved,
  style,
}: DocQualitySettingsWindowProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [saveFlash, setSaveFlash] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) setSaveFlash(false)
  }, [open])

  if (!open) return null

  const patch = (partial: Partial<DocPageQuality>) =>
    onChange({ ...quality, ...partial })

  const patchCrop = (key: keyof DocPageQuality['crop'], value: number) =>
    onChange({
      ...quality,
      crop: { ...quality.crop, [key]: value },
    })

  const handleReset = () => {
    onChange({ ...DEFAULT_DOC_PAGE_QUALITY, crop: { ...DEFAULT_DOC_PAGE_QUALITY.crop } })
    onResetSaved?.()
    setSaveFlash(false)
  }

  const handleSave = () => {
    onSave?.(quality)
    setSaveFlash(true)
    window.setTimeout(() => setSaveFlash(false), 1600)
  }

  return createPortal(
    <div className="doc-quality-win" role="dialog" aria-label={title} style={style}>
      <header className="doc-quality-win__head" ref={panelRef}>
        <span className="doc-quality-win__title">
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden />
          {title}
        </span>
        <button
          type="button"
          className="doc-quality-win__icon-btn"
          onClick={onClose}
          aria-label="Close quality settings"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </header>

      <p className="doc-quality-win__hint">
        {onSave
          ? 'Credyx view only — Save remembers these filters on this browser. Never sent to carrier/broker.'
          : 'Temporary view only — not saved or sent to the carrier/broker.'}
      </p>

      <div className="doc-quality-win__body">
        <SliderRow
          label="Brightness"
          value={quality.brightness}
          min={0.55}
          max={1.75}
          step={0.01}
          display={`${Math.round(quality.brightness * 100)}%`}
          onChange={(brightness) => patch({ brightness })}
        />
        <SliderRow
          label="Contrast"
          value={quality.contrast}
          min={0.55}
          max={2.1}
          step={0.01}
          display={`${Math.round(quality.contrast * 100)}%`}
          onChange={(contrast) => patch({ contrast })}
        />
        <SliderRow
          label="Darker blacks"
          value={quality.darkerBlacks}
          min={0}
          max={1}
          step={0.01}
          display={`${Math.round(quality.darkerBlacks * 100)}%`}
          onChange={(darkerBlacks) => patch({ darkerBlacks })}
        />

        <label className="doc-quality-win__check">
          <input
            type="checkbox"
            checked={quality.blackAndWhite}
            onChange={(e) => patch({ blackAndWhite: e.target.checked })}
          />
          Black &amp; white
        </label>

        <div className="doc-quality-win__section">
          <div className="doc-quality-win__section-head">
            <Crop className="w-3 h-3" aria-hidden />
            Crop
          </div>
          <div className="doc-quality-win__crop-grid">
            {(
              [
                ['top', 'Top'],
                ['bottom', 'Bottom'],
                ['left', 'Left'],
                ['right', 'Right'],
              ] as const
            ).map(([key, label]) => (
              <SliderRow
                key={key}
                label={label}
                value={quality.crop[key]}
                min={0}
                max={40}
                step={0.5}
                display={`${quality.crop[key]}%`}
                onChange={(v) => patchCrop(key, v)}
              />
            ))}
          </div>
          <button
            type="button"
            className="doc-quality-win__btn"
            onClick={onAutoCrop}
            disabled={autoCropBusy}
          >
            {autoCropBusy ? 'Detecting…' : 'Auto-crop page'}
          </button>
        </div>
      </div>

      <footer className="doc-quality-win__foot">
        <button
          type="button"
          className="doc-quality-win__btn doc-quality-win__btn--ghost"
          disabled={isDefaultDocPageQuality(quality)}
          onClick={handleReset}
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
        {onSave ? (
          <button
            type="button"
            className={`doc-quality-win__btn${saveFlash ? ' doc-quality-win__btn--saved' : ''}`}
            onClick={handleSave}
          >
            <Save className="w-3 h-3" />
            {saveFlash ? 'Saved' : 'Save'}
          </button>
        ) : null}
        <button type="button" className="doc-quality-win__btn" onClick={onClose}>
          Done
        </button>
      </footer>
    </div>,
    document.body
  )
}
