import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Search, Shield, X } from 'lucide-react'
import { lookupBrokerSnapshotByMc } from '../../services/brokerSnapshotService'
import type { BrokerSnapshotSummary } from '../../types/brokerSnapshot'
import { normalizeMcQuery } from '../../utils/clientBrokers'
import { useClientTheme } from '../../theme/ThemeContext'
import BrokerSnapshotSummaryView from './BrokerSnapshotSummaryView'

interface McLookupModalProps {
  open?: boolean
  /** Dialog overlay, or a full page/tab panel. */
  variant?: 'dialog' | 'page'
  /** Prefill MC when opening (e.g. from search bar). */
  initialMc?: string
  /** Run the lookup immediately when the panel opens with initialMc. */
  autoLookup?: boolean
  onClose?: () => void
  /** Optional jump to the MC Logs tab (page variant). */
  onOpenLogs?: () => void
}

/**
 * MC Check — authority / insurance lookup from BrokerSnapshot.
 * Dialog overlay (admin) or full page/tab panel (carrier).
 */
export default function McLookupModal({
  open = true,
  variant = 'dialog',
  initialMc = '',
  autoLookup = false,
  onClose,
  onOpenLogs,
}: McLookupModalProps) {
  const c = useClientTheme()
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [mcInput, setMcInput] = useState(initialMc)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<BrokerSnapshotSummary | null>(null)
  const isPage = variant === 'page'

  useEffect(() => {
    if (!open) return
    setMcInput(initialMc)
    setError(null)
    setSummary(null)
    setLoading(false)
    const t = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open, initialMc])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const runLookup = async (raw?: string) => {
    const normalized = normalizeMcQuery(raw ?? mcInput)
    if (!normalized || normalized.replace(/\D/g, '').length < 4) {
      setError('Enter a valid MC number (at least 4 digits).')
      setSummary(null)
      return
    }

    setLoading(true)
    setError(null)
    setSummary(null)
    setMcInput(normalized)

    try {
      const data = await lookupBrokerSnapshotByMc(normalized)
      setSummary(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !autoLookup) return
    const normalized = normalizeMcQuery(initialMc)
    if (!normalized || normalized.replace(/\D/g, '').length < 4) return
    void runLookup(normalized)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open/autoLookup trigger
  }, [open, autoLookup, initialMc])

  if (!open) return null

  const panel = (
    <div
      className={
        isPage
          ? 'mc-lookup-modal mc-lookup-workspace--page flex flex-col w-full min-h-0 flex-1 overflow-hidden'
          : 'mc-lookup-modal client-modal flex flex-col w-full max-w-4xl overflow-hidden'
      }
      role={isPage ? 'region' : 'dialog'}
      aria-modal={isPage ? undefined : true}
      aria-labelledby={titleId}
      onClick={isPage ? undefined : (e) => e.stopPropagation()}
    >
      <header
        className="mc-lookup-modal__top shrink-0 px-3 py-2.5 border-b flex flex-wrap items-center gap-2"
        style={{ borderColor: c.border }}
      >
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <Shield className="w-4 h-4 shrink-0" style={{ color: c.info }} />
          <h2
            id={titleId}
            className="text-sm font-bold whitespace-nowrap"
            style={{ color: c.primary }}
          >
            MC Check
          </h2>
        </div>

        <div className="relative flex-1 min-w-[180px]">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: c.secondary }}
          />
          <input
            ref={inputRef}
            type="text"
            value={mcInput}
            onChange={(e) => setMcInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void runLookup()
              }
            }}
            placeholder="MC number…"
            className="client-input w-full pl-8"
            style={{ height: 34, fontSize: 13 }}
            aria-label="MC number"
          />
        </div>

        <button
          type="button"
          onClick={() => void runLookup()}
          disabled={loading}
          className="dashboard-btn-primary text-xs py-1.5 px-3 shrink-0 inline-flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {loading ? 'Looking up…' : 'Look up'}
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:opacity-80 shrink-0"
            aria-label="Close"
            style={{ color: c.secondary }}
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </header>

      <div className="mc-lookup-modal__body px-3 py-3 overflow-y-auto flex-1 min-h-0">
        {!loading && !error && !summary && (
          <div className="space-y-3">
            <div
              className="flex items-center justify-center gap-2 py-8 text-xs"
              style={{ color: c.secondary }}
            >
              <Shield className="w-4 h-4 opacity-50" style={{ color: c.info }} />
              Enter an MC to verify authority, insurance, and company details.
            </div>
            {onOpenLogs ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={onOpenLogs}
                  className="dashboard-btn-secondary text-xs py-1.5 px-3"
                >
                  Open MC Logs
                </button>
              </div>
            ) : null}
          </div>
        )}

        {loading && (
          <div
            className="flex items-center justify-center gap-2 py-8 text-xs"
            style={{ color: c.secondary }}
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            Fetching BrokerSnapshot…
          </div>
        )}

        {error && (
          <div
            className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs"
            style={{ backgroundColor: c.stat.amber, color: c.primary }}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} />
            {error}
          </div>
        )}

        {!loading && summary && <BrokerSnapshotSummaryView summary={summary} />}
      </div>
    </div>
  )

  if (isPage) return panel

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 client-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      {panel}
    </div>
  )
}
