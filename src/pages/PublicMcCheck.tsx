import { FormEvent, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import '../styles/credyxMarketing.css'
import '../styles/credyxMcCheck.css'
import { MarketingHeader } from '../components/enroll/MarketingHeader'
import { lookupBrokerSnapshotByMc } from '../services/brokerSnapshotService'
import {
  findPublicMcVisitor,
  registerPublicMcVisitor,
  touchPublicMcVisitor,
} from '../services/publicMcVisitorService'
import { trackWebsiteEvent } from '../services/websiteAnalytics'
import { assessCarrierMcGate } from '../utils/publicMcCarrierGate'
import {
  clearPublicMcAccess,
  clearPublicMcWelcome,
  formatCarrierMcLabel,
  readPublicMcAccess,
  writePublicMcAccess,
  type PublicMcAccess,
} from '../utils/publicMcAccess'
import ClientMcLookup from './ClientMcLookup'

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

function welcomeWords(name: string | null | undefined, fallbackMc: string): string[] {
  const cleaned = (name || '').trim()
  if (cleaned) return cleaned.split(/\s+/).filter(Boolean)
  return [fallbackMc]
}

/** Public /MC — gate, welcome overlay, carrier bar, broker lookup. */
export default function PublicMcCheck() {
  const [access, setAccess] = useState<PublicMcAccess | null>(() => {
    const stored = readPublicMcAccess()
    if (!stored) return null
    // Don't auto-show welcome on session restore.
    return { ...stored, showWelcome: false }
  })
  const [mcInput, setMcInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErr, setFieldErr] = useState(false)
  const [welcomeOn, setWelcomeOn] = useState(false)
  const [barPop, setBarPop] = useState(false)
  const welcomeTimer = useRef<number | null>(null)

  useEffect(() => {
    const stored = readPublicMcAccess()
    if (!stored?.mcDigits) return
    void findPublicMcVisitor(stored.mcDigits)
      .then((known) => {
        if (!known) return
        const next: PublicMcAccess = {
          ...stored,
          visitorId: known.visitorId,
          companyName: known.companyName ?? stored.companyName,
          showWelcome: false,
        }
        writePublicMcAccess(next)
        setAccess(next)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    return () => {
      if (welcomeTimer.current != null) window.clearTimeout(welcomeTimer.current)
    }
  }, [])

  function finishWelcome() {
    if (welcomeTimer.current != null) {
      window.clearTimeout(welcomeTimer.current)
      welcomeTimer.current = null
    }
    setWelcomeOn(false)
    clearPublicMcWelcome()
    setAccess((current) => (current ? { ...current, showWelcome: false } : current))
    setBarPop(true)
  }

  function startWelcome(next: PublicMcAccess) {
    writePublicMcAccess(next)
    setAccess(next)
    if (!next.showWelcome) {
      setBarPop(true)
      return
    }
    setWelcomeOn(true)
    welcomeTimer.current = window.setTimeout(finishWelcome, 3000)
  }

  async function unlock(event?: FormEvent) {
    event?.preventDefault()
    const mcDigits = digitsOnly(mcInput)
    setFieldErr(false)
    if (mcDigits.length < 4) {
      setError('Enter your carrier MC number.')
      setFieldErr(true)
      return
    }

    setLoading(true)
    setError(null)
    try {
      // Always verify the MC is a real carrier before unlock.
      const summary = await lookupBrokerSnapshotByMc(mcDigits, { fresh: true })
      const gate = assessCarrierMcGate(summary)
      if (!gate.ok) {
        setError(gate.message)
        setFieldErr(true)
        trackWebsiteEvent('form_error', `mc_access_${gate.reason}`, { mc: mcDigits })
        return
      }

      // Known visitor: reuse stored company name (no name re-fetch needed).
      const returning = await touchPublicMcVisitor(mcDigits)
      if (returning) {
        const next: PublicMcAccess = {
          visitorId: returning.visitorId,
          mcDigits: returning.mcDigits,
          companyName: returning.companyName || summary.name?.trim() || null,
          unlockedAt: new Date().toISOString(),
          showWelcome: false,
        }
        startWelcome(next)
        trackWebsiteEvent('form_success', 'mc_access_returning', {
          mc: mcDigits,
          company: next.companyName ?? '',
        })
        return
      }

      const registered = await registerPublicMcVisitor(mcDigits, summary.name?.trim() || null)
      const next: PublicMcAccess = {
        visitorId: registered.visitorId,
        mcDigits: registered.mcDigits,
        companyName: registered.companyName,
        unlockedAt: new Date().toISOString(),
        showWelcome: registered.isNew,
      }
      startWelcome(next)
      trackWebsiteEvent('form_success', 'mc_access_unlocked', {
        mc: mcDigits,
        company: next.companyName ?? '',
        is_new: registered.isNew,
      })
    } catch {
      setError('Lookup failed. Try again in a moment.')
      setFieldErr(true)
      trackWebsiteEvent('form_error', 'mc_access_lookup_failed')
    } finally {
      setLoading(false)
    }
  }

  function changeCarrier() {
    if (welcomeTimer.current != null) window.clearTimeout(welcomeTimer.current)
    clearPublicMcAccess()
    setAccess(null)
    setWelcomeOn(false)
    setBarPop(false)
    setMcInput('')
    setError(null)
    setFieldErr(false)
    trackWebsiteEvent('nav_click', 'mc_access_change')
  }

  const mcLabel = access ? formatCarrierMcLabel(access.mcDigits) : ''
  const words = welcomeWords(access?.companyName, mcLabel)
  const showApp = Boolean(access) && !welcomeOn

  return (
    <div className="credyx-page credyx-page--waitlist credyx-page--mc-check credyx-mc flex h-screen flex-col">
      <MarketingHeader />
      <main className="min-h-0 flex-1 overflow-y-auto">
        {!access ? (
          <section className="credyx-mc-gate">
            <form className="credyx-mc-gate__card" onSubmit={(event) => void unlock(event)} noValidate>
              <p className="credyx-mc-eyebrow">Credyx MC Check</p>
              <h1 className="credyx-mc-gate__title">
                Enter your <b>carrier MC</b>
              </h1>
              <p className="credyx-mc-gate__copy">
                Confirm your motor carrier number to unlock free broker lookups.
              </p>
              <label className={`credyx-mc-fld${fieldErr ? ' credyx-mc-fld--err' : ''}`}>
                <span>MC</span>
                <input
                  value={mcInput}
                  onChange={(event) => {
                    setMcInput(event.target.value)
                    setFieldErr(false)
                    setError(null)
                  }}
                  placeholder="Carrier MC number"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  disabled={loading}
                  aria-label="Your carrier MC number"
                />
              </label>
              <div className="credyx-mc-gate__error" aria-live="polite">
                {error || ''}
              </div>
              <button type="submit" className="credyx-mc-btn credyx-mc-gate__submit" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {loading ? 'Checking…' : 'Continue'}
              </button>
            </form>
          </section>
        ) : null}

        {showApp && access ? (
          <>
            <div className="credyx-mc-cbar">
              <div className="credyx-mc-cbar__inner">
                <div className={`credyx-mc-who${barPop ? ' credyx-mc-who--pop' : ''}`}>
                  <span className="credyx-mc-av" aria-hidden>
                    <svg viewBox="0 0 24 24">
                      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                    </svg>
                  </span>
                  <div className="credyx-mc-who__meta">
                    <b>{mcLabel}</b>
                    {access.companyName ? (
                      <span>{access.companyName.toUpperCase()}</span>
                    ) : null}
                  </div>
                </div>
                <button type="button" className="credyx-mc-chg" onClick={changeCarrier}>
                  Change MC
                </button>
              </div>
            </div>
            <ClientMcLookup introduce visitorMcDigits={access.mcDigits} />
          </>
        ) : null}
      </main>

      <div
        className={`credyx-mc-wl${welcomeOn ? ' credyx-mc-wl--on' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome"
        onClick={finishWelcome}
      >
        <div>
          <svg className="credyx-mc-ring" viewBox="0 0 96 96" aria-hidden>
            <circle cx="48" cy="48" r="34" transform="rotate(-90 48 48)" />
            <path d="M34 49l10 10 19-21" />
          </svg>
          <div className="credyx-mc-wl__eyebrow">Welcome</div>
          <div className="credyx-mc-wl__name">
            {words.map((word, index) => (
              <span key={`${word}-${index}`} style={{ ['--i' as string]: index }}>
                {word}
              </span>
            ))}
          </div>
          <div className="credyx-mc-wl__sub">Your free broker lookups are unlocked.</div>
        </div>
      </div>
    </div>
  )
}
