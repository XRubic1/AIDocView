import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Mail, PlayCircle, RotateCcw, StickyNote, X } from 'lucide-react'
import type { Invoice } from '../../types/invoice'
import {
  buildBlueprintDashboard,
  rerunInvoiceBlueprint,
  tickBlueprintRuns,
  type BlueprintDashboard,
  type BlueprintDashboardStep,
} from './blueprintRunner'
import { BLUEPRINT_RUNS_CHANGED_EVENT } from './blueprintRuns'

function when(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function ago(iso?: string | null): string {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 90) return `${mins} min ago`
  if (mins < 2160) return `${Math.round(mins / 60)} h ago`
  return `${Math.round(mins / 1440)} days ago`
}

function inTime(iso?: string): string {
  if (!iso) return ''
  const diff = new Date(iso).getTime() - Date.now()
  const mins = Math.round(Math.abs(diff) / 60_000)
  const span = mins < 1 ? 'now' : mins < 90 ? `${mins} min` : mins < 2160 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} days`
  if (span === 'now') return 'now'
  return diff >= 0 ? `in ${span}` : `${span} overdue`
}

function RunCell({ step }: { step: BlueprintDashboardStep }) {
  if (step.state === 'done') {
    return (
      <span className="bpd-run is-done">
        Ran {when(step.ranAt) || '—'}
      </span>
    )
  }
  if (step.waitingFor && !step.runsAt) {
    return <span className="bpd-run is-wait">Waits for “{step.waitingFor}”</span>
  }
  if (step.runsAt) {
    return (
      <span className={`bpd-run${step.state === 'now' ? ' is-now' : ''}`}>
        {step.state === 'now' ? 'Runs ' : 'Will run '}
        {when(step.runsAt)}
        <em>{inTime(step.runsAt)}</em>
      </span>
    )
  }
  return <span className="bpd-run is-muted">After the step before</span>
}

function YesNo({
  planned,
  done,
  value,
  why,
}: {
  planned: boolean
  done: boolean
  value?: boolean
  why?: string
}) {
  if (!planned) return <span className="bpd-mark is-none">—</span>
  if (!done) return <span className="bpd-mark is-planned">Planned</span>
  if (value === true)
    return (
      <span className="bpd-mark is-yes">
        <Check size={14} strokeWidth={3} aria-hidden /> Yes
      </span>
    )
  if (value === false)
    return (
      <span className="bpd-mark is-no" title={why}>
        <X size={14} strokeWidth={3} aria-hidden /> No
        {why ? <small className="bpd-why">{why}</small> : null}
      </span>
    )
  return (
    <span className="bpd-mark is-none" title="This step ran before results were recorded">
      Not recorded
    </span>
  )
}

/** Super-simple view: each step, when it ran or will run, and whether it sent / noted. */
export default function BlueprintRunDashboard({ invoice }: { invoice: Invoice }) {
  const [data, setData] = useState<BlueprintDashboard>(() => buildBlueprintDashboard(invoice.id))
  const [busy, setBusy] = useState<'check' | 'rerun' | null>(null)
  const [confirmRerun, setConfirmRerun] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(() => setData(buildBlueprintDashboard(invoice.id)), [invoice.id])

  useEffect(() => {
    refresh()
    window.addEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, refresh)
    const id = window.setInterval(refresh, 15_000) // keeps "in 4 min" fresh
    return () => {
      window.removeEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, refresh)
      window.clearInterval(id)
    }
  }, [refresh])

  const runCheck = async () => {
    setBusy('check')
    setMessage(null)
    try {
      const { advanced } = await tickBlueprintRuns('Credyx Blueprint')
      setMessage(advanced > 0 ? `Check done — ${advanced} step${advanced === 1 ? '' : 's'} moved forward.` : 'Check done — nothing was due yet.')
    } catch (err) {
      setMessage(`Check failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
      refresh()
    }
  }

  const rerun = async () => {
    setConfirmRerun(false)
    setBusy('rerun')
    setMessage(null)
    try {
      const log = await rerunInvoiceBlueprint(invoice.id)
      setMessage(log.ok ? 'Restarted from the first step.' : `Could not restart: ${log.detail}`)
    } catch (err) {
      setMessage(`Could not restart: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
      refresh()
    }
  }

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data.snapshot, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setMessage('Could not copy — your browser blocked the clipboard.')
    }
  }

  return (
    <section className="bpd">
      <div className="bpd-top">
        <div className={`bpd-status is-${data.status}`}>
          <span className="bpd-status__dot" aria-hidden />
          {data.statusText}
        </div>
        {data.blueprintName ? <span className="bpd-name">{data.blueprintName}</span> : null}
      </div>

      <div className="bpd-facts">
        <div className="bpd-fact">
          <span className="bpd-fact__label">Will run</span>
          <span className="bpd-fact__value">{data.nextRunText}</span>
          {data.nextRunAt ? <span className="bpd-fact__sub">{when(data.nextRunAt)}</span> : null}
        </div>
        <div className="bpd-fact">
          <span className="bpd-fact__label">Last checked</span>
          <span className="bpd-fact__value">{ago(data.lastCheckedAt) || '—'}</span>
          {data.lastCheckedAt ? <span className="bpd-fact__sub">{when(data.lastCheckedAt)}</span> : null}
        </div>
      </div>

      <div className="bpd-actions">
        <button type="button" className="bpd-btn bpd-btn--primary" onClick={() => void runCheck()} disabled={Boolean(busy)}>
          <PlayCircle size={15} aria-hidden />
          {busy === 'check' ? 'Checking…' : 'Run check now'}
        </button>
        {confirmRerun ? (
          <>
            <button type="button" className="bpd-btn bpd-btn--danger" onClick={() => void rerun()}>
              Yes, restart
            </button>
            <button type="button" className="bpd-btn" onClick={() => setConfirmRerun(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="bpd-btn" onClick={() => setConfirmRerun(true)} disabled={Boolean(busy)}>
            <RotateCcw size={15} aria-hidden />
            {busy === 'rerun' ? 'Restarting…' : 'Rerun'}
          </button>
        )}
        <button type="button" className="bpd-btn" onClick={() => void copyJson()}>
          <Copy size={15} aria-hidden />
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
      </div>
      {confirmRerun ? (
        <p className="bpd-note">Starts again from step 1. Emails in later steps may send again.</p>
      ) : null}
      {message ? <p className="bpd-note">{message}</p> : null}

      {data.steps.length === 0 ? (
        <p className="bpd-note">No blueprint steps to show.</p>
      ) : (
        <div className="bpd-table-wrap">
          <table className="bpd-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Run</th>
                <th>Executed</th>
                <th>
                  <Mail size={13} aria-hidden /> Sent
                </th>
                <th>
                  <StickyNote size={13} aria-hidden /> Note
                </th>
              </tr>
            </thead>
            <tbody>
              {data.steps.map((s) => (
                <tr key={s.id} className={`is-${s.state}`}>
                  <td>
                    <span className="bpd-num">{s.number}</span>
                    <span className="bpd-step">{s.name}</span>
                  </td>
                  <td>
                    <RunCell step={s} />
                  </td>
                  <td>
                    {s.state === 'done' ? (
                      <span className="bpd-mark is-yes" title={s.result || undefined}>
                        <Check size={14} strokeWidth={3} aria-hidden /> Yes
                      </span>
                    ) : s.state === 'now' ? (
                      <span className="bpd-mark is-planned">Now</span>
                    ) : (
                      <span className="bpd-mark is-none">Not yet</span>
                    )}
                  </td>
                  <td>
                    <YesNo planned={s.plansEmail} done={s.state === 'done'} value={s.emailSent} why={s.emailWhy} />
                  </td>
                  <td>
                    <YesNo planned={s.plansNote} done={s.state === 'done'} value={s.noteAdded} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bpd-activity">
        <h4 className="bpd-activity__title">Activity</h4>
        {data.activity.length === 0 ? (
          <p className="bpd-note">Nothing has run yet in this run.</p>
        ) : (
          <ul className="bpd-activity__list">
            {data.activity.map((a) => (
              <li key={a.id}>
                <span className="bpd-activity__when">{when(a.at)}</span>
                <span className="bpd-activity__step">{a.step}</span>
                <span className="bpd-activity__chips">
                  {a.emailSent === true ? <span className="bpd-chip is-yes">Email sent</span> : null}
                  {a.emailSent === false && a.plansEmail ? <span className="bpd-chip is-no">Email not sent</span> : null}
                  {a.noteAdded === true ? <span className="bpd-chip is-yes">Note added</span> : null}
                  {a.noteAdded === false && a.plansNote ? <span className="bpd-chip is-no">No note</span> : null}
                </span>
                {a.detail ? <span className="bpd-activity__detail">{a.detail}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
