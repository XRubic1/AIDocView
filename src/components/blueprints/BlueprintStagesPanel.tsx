/**
 * Blueprints → Stages. One blueprint per invoice stage, in a fixed order.
 * Same rule as the server cron: supabase/functions/_shared/invoiceStages.ts
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, PauseCircle, Save } from 'lucide-react'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import { mockInvoices } from '../../data/mockInvoices'
import { hasPpwBeenSent } from '../../utils/ppwSent'
import { listSavedBlueprints } from './blueprintStore'
import { listStoredBlueprintRuns } from './blueprintRuns'
import { BLUEPRINT_STAGES_CHANGED_EVENT, getStageConfig } from './blueprintStagesConfig'
import { saveBlueprintStages } from '../../services/platformSettingsService'
import { useToast } from '../ui/ToastProvider'
import {
  INVOICE_STAGE_LABELS,
  invoiceStageOf,
  type HoldResumeMode,
  type InvoiceStage,
  type InvoiceStageConfig,
  type InvoiceStageWithBlueprint,
} from '../../../supabase/functions/_shared/invoiceStages'

const STAGE_RULE: Record<InvoiceStage, string> = {
  packet: 'Approved, paperwork not sent to the broker yet',
  paperwork: 'Paperwork sent, broker has not confirmed it',
  payment: 'Paperwork confirmed, waiting on payment',
  hold: 'Invoice is on hold. Takes over from any stage above',
  closed: 'Paid, written off, rejected, or force closed',
}

const STAGE_HINT: Partial<Record<InvoiceStage, string>> = {
  packet: 'Leave empty if packets go out by hand or on Process.',
}

const FLOW: InvoiceStageWithBlueprint[] = ['packet', 'paperwork', 'payment']

function isInvoiceBlueprint(bp: SavedBlueprint): boolean {
  const start = bp.nodes.find((n) => n.data.kind === 'trigger')
  const subject = start?.data.triggerSubject
  return subject !== 'brokers' && subject !== 'batches'
}

function stageOfInvoice(inv: (typeof mockInvoices)[number]): InvoiceStage | null {
  return invoiceStageOf({
    status: inv.status,
    paperworkStatus: inv.email_lifecycle?.paperwork_status ?? null,
    ppwSent: hasPpwBeenSent(inv),
  })
}

/**
 * First-time defaults: for each stage, the blueprint most invoices in that stage
 * are running today. Packet starts empty so turning stages on never sends packets.
 */
function suggestConfig(): InvoiceStageConfig {
  const stageById = new Map(mockInvoices.map((inv) => [inv.id, stageOfInvoice(inv)]))
  const counts: Record<string, Map<string, number>> = {}
  for (const run of listStoredBlueprintRuns()) {
    if (run.subject !== 'invoice' || !run.subjectId) continue
    if (run.status !== 'waiting' && run.status !== 'active') continue
    const stage = stageById.get(run.subjectId)
    if (!stage || stage === 'closed' || stage === 'packet') continue
    const m = (counts[stage] ??= new Map())
    m.set(run.blueprintId, (m.get(run.blueprintId) ?? 0) + 1)
  }
  const top = (stage: string, fallback: string) => {
    const m = counts[stage]
    if (!m || m.size === 0) return fallback
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  return {
    enabled: false,
    blueprints: {
      paperwork: top('paperwork', 'bp-standard-paperwork-chase'),
      payment: top('payment', 'bp-standard-payment-chase'),
      hold: top('hold', 'bp-standard-hold-notice'),
    },
    holdResume: 'resume',
  }
}

export default function BlueprintStagesPanel() {
  const { showToast } = useToast()
  const [saved, setSaved] = useState(() => getStageConfig())
  const [draft, setDraft] = useState<InvoiceStageConfig>(() => getStageConfig() ?? suggestConfig())
  const [busy, setBusy] = useState(false)
  const blueprints = useMemo(
    () =>
      listSavedBlueprints()
        .filter(isInvoiceBlueprint)
        .sort((a, b) => a.name.localeCompare(b.name)),
    []
  )
  const known = useMemo(() => new Set(blueprints.map((b) => b.id)), [blueprints])

  useEffect(() => {
    const sync = () => setSaved(getStageConfig())
    window.addEventListener(BLUEPRINT_STAGES_CHANGED_EVENT, sync)
    return () => window.removeEventListener(BLUEPRINT_STAGES_CHANGED_EVENT, sync)
  }, [])

  const stageCounts = useMemo(() => {
    const out: Partial<Record<InvoiceStage, number>> = {}
    for (const inv of mockInvoices) {
      const stage = stageOfInvoice(inv)
      if (stage) out[stage] = (out[stage] ?? 0) + 1
    }
    return out
  }, [])

  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)

  const setStageBlueprint = (stage: InvoiceStageWithBlueprint, id: string) => {
    setDraft((d) => {
      const next = { ...d.blueprints }
      if (id) next[stage] = id
      else delete next[stage]
      return { ...d, blueprints: next }
    })
  }

  const handleSave = async () => {
    setBusy(true)
    try {
      await saveBlueprintStages(draft)
      setSaved(getStageConfig())
      showToast(
        draft.enabled
          ? 'Stages saved. Invoices now follow the stage order.'
          : 'Stages saved. They stay off until you turn them on.',
        'success'
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save stages.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const picker = (stage: InvoiceStageWithBlueprint) => {
    const value = draft.blueprints[stage] ?? ''
    return (
      <select
        id={`bp-stage-${stage}`}
        className="bp-stages__select"
        value={value}
        onChange={(e) => setStageBlueprint(stage, e.target.value)}
        aria-label={`Blueprint for ${INVOICE_STAGE_LABELS[stage]}`}
      >
        <option value="">Nothing runs</option>
        {value && !known.has(value) ? (
          <option value={value}>Missing blueprint ({value})</option>
        ) : null}
        {blueprints.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    )
  }

  const row = (stage: InvoiceStage, body: ReactNode) => (
    <div key={stage} className={`bp-stages__row bp-stages__row--${stage}`}>
      <div className="bp-stages__stage">
        <div className="bp-stages__name">
          {INVOICE_STAGE_LABELS[stage]}
          <span className="bp-stages__count">{stageCounts[stage] ?? 0} invoices</span>
        </div>
        <p className="bp-stages__rule">{STAGE_RULE[stage]}</p>
      </div>
      <div className="bp-stages__pick">
        {body}
        {STAGE_HINT[stage] ? <p className="bp-stages__hint">{STAGE_HINT[stage]}</p> : null}
      </div>
    </div>
  )

  return (
    <div className="bp-stages">
      <div className="bp-stages__head">
        <div className="bp-stages__intro">
          <h2>Invoice stages</h2>
          <p>
            Every open invoice is in one stage at a time, and each stage runs one blueprint. When
            the invoice moves on, its old chase stops and the next one starts.
          </p>
        </div>
        <div className="bp-stages__actions">
          <label className={`admin-blueprints__runner${draft.enabled ? ' admin-blueprints__runner--on' : ''}`}>
            <input
              id="bp-stages-enabled"
              type="checkbox"
              role="switch"
              checked={draft.enabled}
              onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
            />
            <span className="admin-blueprints__runner-track" aria-hidden>
              <span className="admin-blueprints__runner-thumb" />
            </span>
            <span className="admin-blueprints__runner-text">
              Use stages {draft.enabled ? 'on' : 'off'}
            </span>
          </label>
          <button
            type="button"
            className="admin-blueprints__btn admin-blueprints__btn--primary"
            onClick={() => void handleSave()}
            disabled={busy || (!dirty && saved !== null)}
          >
            <Save size={14} aria-hidden />
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {!saved?.enabled ? (
        <div className="bp-stages__notice" role="status">
          {saved
            ? 'Stages are saved but turned off. Blueprints are still picked by priority and “then start”.'
            : 'Stages are not set up yet. The picks below are what your invoices run today. Check them, turn stages on, and save.'}
        </div>
      ) : null}

      <section className="bp-stages__group" aria-label="Main flow">
        <h3 className="bp-stages__group-title">Main flow</h3>
        {FLOW.map((stage, i) => (
          <div key={stage}>
            {row(stage, picker(stage))}
            {i < FLOW.length - 1 ? (
              <div className="bp-stages__arrow" aria-hidden>
                <ArrowRight size={14} />
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <section className="bp-stages__group" aria-label="Interruption">
        <h3 className="bp-stages__group-title">
          <PauseCircle size={14} aria-hidden />
          Interruption
        </h3>
        {row(
          'hold',
          <>
            {picker('hold')}
            <fieldset className="bp-stages__resume">
              <legend>When the hold is removed</legend>
              {(
                [
                  ['resume', 'Resume the paused chase where it left off'],
                  ['restart', 'Start that chase over from the beginning'],
                ] as [HoldResumeMode, string][]
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="bp-hold-resume"
                    value={value}
                    checked={draft.holdResume === value}
                    onChange={() => setDraft((d) => ({ ...d, holdResume: value }))}
                  />
                  {label}
                </label>
              ))}
              <p className="bp-stages__hint">
                If paperwork was confirmed during the hold, the invoice goes to Payment instead.
              </p>
            </fieldset>
          </>
        )}
      </section>

      <section className="bp-stages__group" aria-label="End">
        <h3 className="bp-stages__group-title">End</h3>
        {row('closed', <p className="bp-stages__fixed">Stops every stage chase. Nothing new starts.</p>)}
      </section>

      <p className="bp-stages__foot">
        Side blueprints (broker replies, ops alerts, disputes, rate checks) keep running on their own
        and are not stopped by a stage change. Pending and in-review invoices have no stage until they
        are approved or their paperwork goes out.
      </p>
    </div>
  )
}
