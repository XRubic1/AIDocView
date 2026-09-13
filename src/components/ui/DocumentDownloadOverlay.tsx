import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import './documentDownloadOverlay.css'

export interface DocumentDownloadOverlayProps {
  /** When true, the blurry download overlay is visible. */
  open: boolean
  /** 0–100 progress. Omit for an indeterminate sliding bar. */
  progress?: number
  title?: string
  subtitle?: string
  /** `absolute` covers the parent (viewer pane). `fixed` covers the viewport. */
  variant?: 'absolute' | 'fixed'
  fileName?: string
}

/**
 * Animated progress while a document body downloads from storage.
 * Prefer wrapping a `position: relative` viewer pane with variant="absolute".
 */
export default function DocumentDownloadOverlay({
  open,
  progress,
  title = 'Downloading document',
  subtitle = 'Fetching the file so you can review it…',
  variant = 'absolute',
  fileName,
}: DocumentDownloadOverlayProps) {
  const [displayProgress, setDisplayProgress] = useState(0)
  const indeterminate = progress == null

  // Ease the bar toward the reported value (or a soft indeterminate climb).
  useEffect(() => {
    if (!open) {
      setDisplayProgress(0)
      return
    }

    if (!indeterminate) {
      setDisplayProgress((prev) => Math.max(prev, Math.min(100, progress)))
      return
    }

    setDisplayProgress((prev) => (prev < 8 ? 8 : prev))
    const timer = window.setInterval(() => {
      setDisplayProgress((prev) => {
        if (prev >= 90) return prev
        return Math.min(90, prev + 2 + Math.random() * 4)
      })
    }, 220)
    return () => window.clearInterval(timer)
  }, [open, progress, indeterminate])

  if (!open) return null

  const pct = Math.round(Math.max(0, Math.min(100, displayProgress)))
  const width = indeterminate
    ? undefined
    : `${Math.max(6, Math.min(100, displayProgress))}%`

  return (
    <div
      className={`doc-download-overlay doc-download-overlay--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={title}
    >
      <div className="doc-download-overlay__backdrop" aria-hidden />
      <div className="doc-download-overlay__card">
        <div className="doc-download-overlay__icon-wrap" aria-hidden>
          <span className="doc-download-overlay__icon-ring" />
          <span className="doc-download-overlay__icon-ring doc-download-overlay__icon-ring--delay" />
          <div className="doc-download-overlay__icon">
            <Download className="doc-download-overlay__icon-svg" strokeWidth={2.25} />
          </div>
        </div>

        <div className="doc-download-overlay__copy">
          <p className="doc-download-overlay__title">{title}</p>
          {fileName ? (
            <p className="doc-download-overlay__file" title={fileName}>
              {fileName}
            </p>
          ) : null}
          <p className="doc-download-overlay__subtitle">{subtitle}</p>
        </div>

        <div className="doc-download-overlay__progress">
          <div
            className={`doc-download-overlay__track${
              indeterminate ? ' doc-download-overlay__track--indeterminate' : ''
            }`}
          >
            <span
              className="doc-download-overlay__bar"
              style={indeterminate ? undefined : { width }}
            />
          </div>
          <div className="doc-download-overlay__meta">
            <span className="doc-download-overlay__meta-label">
              {indeterminate ? 'Working' : 'Progress'}
            </span>
            <span className="doc-download-overlay__pct">
              {indeterminate ? '…' : `${pct}%`}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Soft progress climb while an async download is in flight. */
export function useDocumentDownloadProgress(active: boolean): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!active) {
      setProgress(0)
      return
    }
    setProgress(10)
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 92) return prev
        return Math.min(92, prev + 3 + Math.random() * 5)
      })
    }, 180)
    return () => window.clearInterval(timer)
  }, [active])

  return progress
}
