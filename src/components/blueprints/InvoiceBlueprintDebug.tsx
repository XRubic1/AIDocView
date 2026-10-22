import { useCallback, useEffect, useState } from 'react'
import type { Invoice } from '../../types/invoice'
import {
  advanceInvoiceRun,
  debugInvoiceBlueprint,
  tickBlueprintRuns,
  type BlueprintDebugSnapshot,
} from './blueprintRunner'
import { BLUEPRINT_RUNS_CHANGED_EVENT } from './blueprintRuns'

function fmt(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="inv-bp__run-row">
      <span className="inv-bp__muted">{k}</span>
      <span className="inv-bp__value" style={{ textAlign: 'right', wordBreak: 'break-word' }}>
        {v}
      </span>
    </div>
  )
}

/** Why is this invoice's blueprint moving, or not? Everything the runner sees, in one place. */
export default function InvoiceBlueprintDebug({ invoice }: { invoice: Invoice }) {
  const [open, setOpen] = useState(true)
  const [snap, setSnap] = useState<BlueprintDebugSnapshot | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [confirmAdvance, setConfirmAdvance] = useState(false)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(() => setSnap(debugInvoiceBlueprint(invoice.id)), [invoice.id])

  useEffect(() => {
    if (!open) return
    refresh()
    window.addEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, refresh)
    const id = window.setInterval(refresh, 15_000)
    return () => {
      window.removeEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, refresh)
      window.clearInterval(id)
    }
  }, [open, refresh])

  const runCheck = async () => {
    setBusy('check')
    setLog([])
    try {
      const { advanced, logs } = await tickBlueprintRuns('Credyx Blueprint')
      setLog([
        `Check finished: ${advanced} run${advanced === 1 ? '' : 's'} advanced.`,
        ...logs.map((l) => `${l.ok ? '✓' : '✗'} ${l.detail}`),
      ])
    } catch (err) {
      setLog([`Check failed: ${err instanceof Error ? err.message : String(err)}`])
    } finally {
      setBusy(null)
      refresh()
    }
  }

  const forceAdvance = async () => {
    setConfirmAdvance(false)
    setBusy('advance')
    setLog([])
    try {
      const r = await advanceInvoiceRun(invoice.id, { manual: true, forceWake: true })
      setLog([`${r.ok ? '✓' : '✗'} ${r.detail}`])
    } catch (err) {
      setLog([`Advance failed: ${err instanceof Error ? err.message : String(err)}`])
    } finally {
      setBusy(null)
      refresh()
    }
  }

  const copy = async () => {
    if (!snap) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(snap, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setLog(['Could not copy — open the raw data below and copy it by hand.'])
    }
  }

  const run = snap?.run as Record<string, unknown> | null | undefined
  const inv = snap?.invoice as Record<string, unknown> | undefined

  return (
    <section className="inv-bp__card">
      <button
        type="button"
        className="inv-bp__card-head inv-bp__card-head--row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer' }}
      >
        <span>Debug</span>
        <span className="inv-bp__muted">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && snap ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <div>
            <p className="inv-bp__sub-head">What the next check will do</p>
            <div className="inv-bp__verdict">
              {snap.verdict.map((line, i) => (
                <p key={line} className={i === 0 ? 'is-main' : undefined}>
                  {line}
                </p>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="inv-bp__btn" onClick={refresh} disabled={Boolean(busy)}>
              Refresh
            </button>
            <button type="button" className="inv-bp__btn" onClick={() => void runCheck()} disabled={Boolean(busy)}>
              {busy === 'check' ? 'Checking…' : 'Run check now'}
            </button>
            {confirmAdvance ? (
              <>
                <button type="button" className="inv-bp__btn" onClick={() => void forceAdvance()}>
                  Yes, advance (skips the wait)
                </button>
                <button type="button" className="inv-bp__btn" onClick={() => setConfirmAdvance(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="inv-bp__btn"
                onClick={() => setConfirmAdvance(true)}
                disabled={Boolean(busy) || !run}
              >
                {busy === 'advance' ? 'Advancing…' : 'Force advance'}
              </button>
            )}
            <button type="button" className="inv-bp__btn" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy debug JSON'}
            </button>
          </div>
          {confirmAdvance ? (
            <p className="inv-bp__meta">
              Moves the run past its current Wait right now. Email steps after it will send.
            </p>
          ) : null}
          {log.length > 0 ? (
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre>
          ) : null}

          <div>
            <p className="inv-bp__meta" style={{ fontWeight: 700, marginBottom: 4 }}>Runner</p>
            <Row k="Live runner" v={snap.runnerEnabled ? 'ON' : 'OFF'} />
            <Row k="Server (Supabase)" v={snap.serverConfigured ? 'configured' : 'not configured'} />
            <Row k="Now" v={fmt(snap.generatedAt)} />
            <Row k="Last auto check" v={fmt(snap.lastAutoTickAt)} />
          </div>

          <div>
            <p className="inv-bp__meta" style={{ fontWeight: 700, marginBottom: 4 }}>Invoice facts</p>
            <Row k="Status" v={String(inv?.status ?? '—')} />
            <Row k="Paperwork sent" v={inv?.ppwSent ? `yes · ${fmt(inv?.ppwSentAt)}` : 'no'} />
            <Row k="Paperwork status" v={String(inv?.paperworkStatus ?? '—')} />
            <Row k="Last broker reply" v={String(inv?.lastReplyStatus ?? '—')} />
            <Row
              k="Will pay"
              v={inv?.collectionStatus ? `${String(inv.collectionStatus)} ${String(inv.collectionDate ?? '')}` : '—'}
            />
          </div>

          <div>
            <p className="inv-bp__meta" style={{ fontWeight: 700, marginBottom: 4 }}>Run</p>
            {run ? (
              <>
                <Row k="Status" v={String(run.status)} />
                <Row k="Blueprint" v={String(run.blueprintName)} />
                <Row k="Current node" v={String(run.currentNodeId ?? '—')} />
                <Row k="Current step" v={String(run.currentStep ?? '—')} />
                <Row k="Wake time" v={fmt(run.waitUntil)} />
                <Row k="Started" v={fmt(run.startedAt)} />
                <Row k="Updated" v={fmt(run.updatedAt)} />
              </>
            ) : (
              <p className="inv-bp__meta">No run.</p>
            )}
          </div>

          <div>
            <p className="inv-bp__meta" style={{ fontWeight: 700, marginBottom: 4 }}>
              Blueprint path ({snap.steps.length} steps)
            </p>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5 }}>
              {snap.steps.map((s) => (
                <li key={s.id} style={{ fontWeight: s.isCurrent ? 700 : 400 }}>
                  {s.isCurrent ? '▶ ' : ''}
                  [{s.kind}] {s.label}
                  {s.whenPasses != null ? ` — condition ${s.whenPasses ? 'TRUE' : 'false'}` : ''}
                  {s.kind === 'wait'
                    ? ` — ${String(s.config.days ?? '?')} ${String(s.config.waitUnit ?? 'days')} (${String(
                        s.config.waitUntilId ?? 'pause_days'
                      )})`
                    : ''}
                  {s.waitResolves
                    ? 'error' in s.waitResolves
                      ? ` — resolve error: ${s.waitResolves.error}`
                      : ` — resolves to ${fmt(s.waitResolves.waitUntil)} (${s.waitResolves.inMinutes} min from now)`
                    : ''}
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="inv-bp__meta" style={{ fontWeight: 700, marginBottom: 4 }}>Recent history</p>
            {snap.recentHistory.length === 0 ? (
              <p className="inv-bp__meta">Nothing recorded.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5 }}>
                {[...snap.recentHistory].reverse().map((ev, i) => (
                  <li key={i}>
                    {fmt(ev.at)} · {String(ev.kind)} · {String(ev.title)}
                    {ev.completedNodeId ? ` (finished ${String(ev.completedNodeId)})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <details>
            <summary className="inv-bp__meta" style={{ cursor: 'pointer' }}>Raw data</summary>
            <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(snap, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  )
}
