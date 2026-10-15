import { describe, expect, it } from 'vitest'
import {
  HOLD_PAUSE_PREFIX,
  STAGE_ENDED_PREFIX,
  STAGE_STOP_PREFIX,
  invoiceStageOf,
  planInvoiceStage,
  type InvoiceStageConfig,
  type StageRun,
} from '../../../supabase/functions/_shared/invoiceStages'

const config: InvoiceStageConfig = {
  enabled: true,
  blueprints: {
    paperwork: 'bp-paper',
    payment: 'bp-pay',
    hold: 'bp-hold',
  },
  holdResume: 'resume',
}

const paperworkSent = { status: 'approved', paperworkStatus: 'unknown', ppwSent: true }
const onHold = { ...paperworkSent, status: 'hold' }

function run(id: string, blueprintId: string, status: StageRun['status'], currentStep = 'Wait · 3 days'): StageRun {
  return { id, blueprintId, status, currentStep }
}

describe('invoiceStageOf', () => {
  it('follows the fixed order', () => {
    expect(invoiceStageOf({ status: 'paid', paperworkStatus: 'good', ppwSent: true })).toBe('closed')
    expect(invoiceStageOf({ status: 'hold', paperworkStatus: 'good', ppwSent: true })).toBe('hold')
    expect(invoiceStageOf({ status: 'approved', paperworkStatus: 'good', ppwSent: true })).toBe('payment')
    expect(invoiceStageOf(paperworkSent)).toBe('paperwork')
    expect(invoiceStageOf({ status: 'approved', ppwSent: false })).toBe('packet')
    expect(invoiceStageOf({ status: 'pending', ppwSent: false })).toBeNull()
  })
})

describe('planInvoiceStage', () => {
  it('pauses the paperwork chase and starts the hold blueprint when held', () => {
    const paper = run('r1', 'bp-paper', 'waiting')
    const plan = planInvoiceStage(onHold, [paper], config)
    expect(plan.stage).toBe('hold')
    expect(plan.pause).toEqual([paper])
    expect(plan.stop).toEqual([])
    expect(plan.targetBlueprintId).toBe('bp-hold')
    expect(plan.enroll).toBe(true)
  })

  it('does nothing more while the hold is still on', () => {
    const paper = run('r1', 'bp-paper', 'paused', `${HOLD_PAUSE_PREFIX}Wait · 3 days`)
    const hold = run('r2', 'bp-hold', 'waiting')
    const plan = planInvoiceStage(onHold, [paper, hold], config)
    expect(plan.pause).toEqual([])
    expect(plan.stop).toEqual([])
    expect(plan.enroll).toBe(false)
  })

  it('resumes the paused paperwork chase when the hold is removed', () => {
    const paper = run('r1', 'bp-paper', 'paused', `${HOLD_PAUSE_PREFIX}Wait · 3 days`)
    const hold = run('r2', 'bp-hold', 'completed', 'Done')
    const plan = planInvoiceStage(paperworkSent, [paper, hold], config)
    expect(plan.stage).toBe('paperwork')
    expect(plan.resume).toEqual([paper])
    expect(plan.enroll).toBe(false)
    expect(plan.retire).toEqual([{ run: hold, step: `${STAGE_ENDED_PREFIX}Done` }])
  })

  it('stops the hold run when the hold is removed early', () => {
    const paper = run('r1', 'bp-paper', 'paused', `${HOLD_PAUSE_PREFIX}Wait · 3 days`)
    const hold = run('r2', 'bp-hold', 'waiting')
    const plan = planInvoiceStage(paperworkSent, [paper, hold], config)
    expect(plan.stop.map((s) => s.run.id)).toEqual(['r2'])
    expect(plan.resume).toEqual([paper])
  })

  it('goes to payment instead when paperwork was confirmed during the hold', () => {
    const paper = run('r1', 'bp-paper', 'paused', `${HOLD_PAUSE_PREFIX}Wait · 3 days`)
    const plan = planInvoiceStage(
      { status: 'approved', paperworkStatus: 'good', ppwSent: true },
      [paper],
      config
    )
    expect(plan.stage).toBe('payment')
    expect(plan.stop).toEqual([
      { run: paper, step: `${STAGE_STOP_PREFIX}hold removed, moved to Payment` },
    ])
    expect(plan.targetBlueprintId).toBe('bp-pay')
    expect(plan.enroll).toBe(true)
  })

  it('starts the chase over after a hold when set to restart', () => {
    const paper = run('r1', 'bp-paper', 'paused', `${HOLD_PAUSE_PREFIX}Wait · 3 days`)
    const plan = planInvoiceStage(paperworkSent, [paper], { ...config, holdResume: 'restart' })
    expect(plan.resume).toEqual([])
    expect(plan.stop[0].step).toBe(`${STAGE_STOP_PREFIX}starting over after hold`)
    expect(plan.enroll).toBe(true)
  })

  it('restarts a chase the old logic cut off for a hold', () => {
    const paper = run('r1', 'bp-paper', 'stopped', 'Stopped · switching to Invoice Hold')
    const plan = planInvoiceStage(paperworkSent, [paper], config)
    expect(plan.enroll).toBe(true)
  })

  it('does not rerun a chase that already finished in this stage', () => {
    const paper = run('r1', 'bp-paper', 'completed', 'Done')
    const plan = planInvoiceStage(paperworkSent, [paper], config)
    expect(plan.enroll).toBe(false)
  })

  it('runs the hold blueprint again on a second hold', () => {
    const oldHold = run('r2', 'bp-hold', 'completed', `${STAGE_ENDED_PREFIX}Done`)
    const plan = planInvoiceStage(onHold, [oldHold], config)
    expect(plan.enroll).toBe(true)
  })

  it('stops every stage chase when the invoice closes', () => {
    const pay = run('r3', 'bp-pay', 'waiting')
    const plan = planInvoiceStage({ status: 'paid', ppwSent: true }, [pay], config)
    expect(plan.stop).toEqual([{ run: pay, step: `${STAGE_STOP_PREFIX}invoice closed` }])
    expect(plan.enroll).toBe(false)
  })

  it('leaves side blueprints alone', () => {
    const alert = run('r9', 'bp-ops-alert', 'waiting')
    const plan = planInvoiceStage(onHold, [alert], config)
    expect(plan.pause).toEqual([])
    expect(plan.stop).toEqual([])
  })

  it('touches nothing before the invoice reaches a stage', () => {
    const paper = run('r1', 'bp-paper', 'waiting')
    const plan = planInvoiceStage({ status: 'pending', ppwSent: false }, [paper], config)
    expect(plan).toMatchObject({ stage: null, pause: [], stop: [], enroll: false })
  })
})
