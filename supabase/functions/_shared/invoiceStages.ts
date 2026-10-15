/**
 * Invoice stages — one fixed order decides which blueprint owns an invoice.
 *
 * Shared by the browser runner (src/components/blueprints) and the server cron
 * (blueprintEngine.ts). Keep this file free of imports so both can load it.
 *
 * Order (first match wins):
 *   closed    paid / written off / rejected / force closed
 *   hold      status is hold — other stage chases pause, the hold blueprint runs
 *   payment   paperwork confirmed (email_lifecycle.paperwork_status = good)
 *   paperwork paperwork sent to the broker, not confirmed yet
 *   packet    approved, paperwork not sent yet
 *   (none)    pending / review before paperwork — nothing runs, runs are left alone
 */

export type InvoiceStage = 'packet' | 'paperwork' | 'payment' | 'hold' | 'closed'

/** Stages that can point at a blueprint (Closed always stops everything). */
export type InvoiceStageWithBlueprint = Exclude<InvoiceStage, 'closed'>

export const INVOICE_STAGE_ORDER: InvoiceStage[] = [
  'packet',
  'paperwork',
  'payment',
  'hold',
  'closed',
]

export const INVOICE_STAGE_LABELS: Record<InvoiceStage, string> = {
  packet: 'Packet',
  paperwork: 'Paperwork',
  payment: 'Payment',
  hold: 'On hold',
  closed: 'Closed',
}

export const BLUEPRINT_STAGES_SETTINGS_KEY = 'blueprint_stages'

export type HoldResumeMode = 'resume' | 'restart'

export interface InvoiceStageConfig {
  /** Off = old matching (priority + "then start") keeps running. */
  enabled: boolean
  blueprints: Partial<Record<InvoiceStageWithBlueprint, string>>
  /** When a hold is removed: continue the paused chase, or start it over. */
  holdResume: HoldResumeMode
}

export const CLOSED_INVOICE_STATUSES = [
  'paid',
  'rejected',
  'written_off',
  'write_off_pending',
  'force_closed',
]

export interface InvoiceStageFacts {
  status: string
  /** email_lifecycle.paperwork_status */
  paperworkStatus?: string | null
  /** At least one paperwork send to the broker went out. */
  ppwSent: boolean
}

export function invoiceStageOf(facts: InvoiceStageFacts): InvoiceStage | null {
  const status = String(facts.status ?? '')
  if (CLOSED_INVOICE_STATUSES.includes(status)) return 'closed'
  if (status === 'hold') return 'hold'
  if (facts.paperworkStatus === 'good') return 'payment'
  if (facts.ppwSent) return 'paperwork'
  if (status === 'approved') return 'packet'
  return null
}

export function normalizeStageConfig(raw: unknown): InvoiceStageConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<InvoiceStageConfig>
  const blueprints: InvoiceStageConfig['blueprints'] = {}
  const src = (value.blueprints ?? {}) as Record<string, unknown>
  for (const stage of ['packet', 'paperwork', 'payment', 'hold'] as const) {
    const id = typeof src[stage] === 'string' ? (src[stage] as string).trim() : ''
    if (id) blueprints[stage] = id
  }
  return {
    enabled: value.enabled === true,
    blueprints,
    holdResume: value.holdResume === 'restart' ? 'restart' : 'resume',
  }
}

/** Config that should drive routing, or null when stages are off. */
export function activeStageConfig(raw: unknown): InvoiceStageConfig | null {
  const config = normalizeStageConfig(raw)
  return config && config.enabled ? config : null
}

export function stageBlueprintIds(config: InvoiceStageConfig): Set<string> {
  return new Set(Object.values(config.blueprints).filter((id): id is string => !!id))
}

/** Step-line markers so both engines recognise what the stage logic did. */
export const HOLD_PAUSE_PREFIX = 'Paused · on hold · '
export const STAGE_STOP_PREFIX = 'Stopped · stage · '
export const STAGE_ENDED_PREFIX = 'Ended · left stage · '

/** Stops that should not block the same blueprint from starting again. */
const RESTARTABLE_STEP_PREFIXES = [
  STAGE_STOP_PREFIX,
  STAGE_ENDED_PREFIX,
  // Older automatic stops (before stages) — these chases were cut off by a hold.
  'Stopped · switching',
  'Stopped · hold cleared',
  'Stopped · restarting',
  'Stopped · PPW sent',
]

export type StageRunStatus = 'waiting' | 'active' | 'paused' | 'completed' | 'stopped'

export interface StageRun {
  id: string
  blueprintId: string
  status: StageRunStatus
  currentStep: string
}

export interface StagePlan {
  stage: InvoiceStage | null
  targetBlueprintId: string | null
  /** Set status paused, step → HOLD_PAUSE_PREFIX + step. Keep node + wake time. */
  pause: StageRun[]
  /** Set status waiting, step → the step before the pause. */
  resume: StageRun[]
  /** Set status stopped with this step line, clear wake time. */
  stop: { run: StageRun; step: string }[]
  /** Finished runs from a stage the invoice left — rewrite step so they can start again later. */
  retire: { run: StageRun; step: string }[]
  /** Start a new run on targetBlueprintId (after applying the lists above). */
  enroll: boolean
}

export function isHoldPaused(run: Pick<StageRun, 'status' | 'currentStep'>): boolean {
  return run.status === 'paused' && run.currentStep.startsWith(HOLD_PAUSE_PREFIX)
}

export function stepBeforeHoldPause(step: string): string {
  return step.startsWith(HOLD_PAUSE_PREFIX) ? step.slice(HOLD_PAUSE_PREFIX.length) : step
}

function isLive(run: StageRun): boolean {
  return run.status === 'waiting' || run.status === 'active' || run.status === 'paused'
}

function isRestartable(run: StageRun): boolean {
  return RESTARTABLE_STEP_PREFIXES.some((p) => run.currentStep.startsWith(p))
}

/**
 * Decide what to do with one invoice's runs. Pure — the caller applies the plan.
 * Only runs on blueprints picked for a stage are touched; side blueprints
 * (broker replies, ops alerts, disputes…) are left alone.
 */
export function planInvoiceStage(
  facts: InvoiceStageFacts,
  runs: StageRun[],
  config: InvoiceStageConfig
): StagePlan {
  const stage = invoiceStageOf(facts)
  const target =
    stage && stage !== 'closed' ? config.blueprints[stage] ?? null : null
  const plan: StagePlan = {
    stage,
    targetBlueprintId: target,
    pause: [],
    resume: [],
    stop: [],
    retire: [],
    enroll: false,
  }
  if (!stage) return plan

  const managed = stageBlueprintIds(config)
  const mine = runs.filter((r) => managed.has(r.blueprintId))
  const label = INVOICE_STAGE_LABELS[stage]
  let targetLive = false

  for (const run of mine.filter(isLive)) {
    if (stage === 'closed') {
      plan.stop.push({ run, step: `${STAGE_STOP_PREFIX}invoice closed` })
      continue
    }
    if (stage === 'hold') {
      if (run.blueprintId === target) {
        targetLive = true
      } else if (run.status !== 'paused') {
        plan.pause.push(run)
      }
      continue
    }
    if (run.blueprintId === target) {
      if (isHoldPaused(run)) {
        if (config.holdResume === 'resume') {
          plan.resume.push(run)
          targetLive = true
        } else {
          plan.stop.push({ run, step: `${STAGE_STOP_PREFIX}starting over after hold` })
        }
      } else {
        targetLive = true
      }
      continue
    }
    plan.stop.push({
      run,
      step: `${STAGE_STOP_PREFIX}${isHoldPaused(run) ? 'hold removed, ' : ''}moved to ${label}`,
    })
  }

  for (const run of stage === 'closed' ? [] : mine) {
    if (run.status !== 'completed' && run.status !== 'stopped') continue
    if (run.blueprintId === target) continue
    if (run.currentStep.startsWith(STAGE_ENDED_PREFIX)) continue
    if (run.currentStep.startsWith(STAGE_STOP_PREFIX)) continue
    plan.retire.push({ run, step: `${STAGE_ENDED_PREFIX}${run.currentStep}` })
  }

  if (target && !targetLive) {
    const blocked = mine.some(
      (r) =>
        r.blueprintId === target &&
        (r.status === 'completed' || r.status === 'stopped') &&
        !isRestartable(r)
    )
    plan.enroll = !blocked
  }
  return plan
}
