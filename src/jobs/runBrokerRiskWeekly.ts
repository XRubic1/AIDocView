import {
  appendOpsJobRun,
  updateOpsJobRun,
} from '../data/brokerRiskStore'
import { ensureBrokerRiskProfile } from '../services/brokerRiskService'
import type { BrokerRiskTrigger } from '../types/brokerRisk'
import type { OpsJobRun } from '../types/opsJob'
import type { ClientBrokerNote, BrokerPayRating } from '../types/clientBroker'
import type { BrokerScoreRow } from '../utils/clientReports'
import type { BrokerTermsPaymentSignals } from '../utils/brokerRiskPolicy'
import type { Invoice } from '../types/invoice'

export type BrokerRiskJobTarget = {
  brokerId: string
  brokerName: string
  mcNumber: string | null
  score: BrokerScoreRow | null
  rating: BrokerPayRating
  notes: ClientBrokerNote[]
  adminNotes?: string | null
  invoices?: Invoice[]
  hasWorked: boolean
  paymentTermsDays?: number | null
  termsSignals?: BrokerTermsPaymentSignals | null
  isNewBroker?: boolean
}

export type RunBrokerRiskWeeklyResult = {
  run: OpsJobRun
  profileIds: string[]
}

function newJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Broker-risk batch (rules-v2).
 * Processes broker-by-broker; failures are counted without aborting the run.
 */
export function runBrokerRiskWeekly(args: {
  clientId: string
  brokers: BrokerRiskJobTarget[]
  trigger?: BrokerRiskTrigger
  force?: boolean
}): RunBrokerRiskWeeklyResult {
  const startedAt = new Date().toISOString()
  const run: OpsJobRun = {
    id: newJobId(),
    kind: 'broker_risk_weekly',
    status: 'running',
    started_at: startedAt,
    finished_at: null,
    success_count: 0,
    fail_count: 0,
    skipped_count: 0,
    detail: { clientId: args.clientId, brokerCount: args.brokers.length },
    error_message: null,
  }
  appendOpsJobRun(run)

  const profileIds: string[] = []
  const errors: string[] = []

  for (const target of args.brokers) {
    try {
      if (!args.force && !target.hasWorked && target.notes.length === 0 && !target.isNewBroker) {
        run.skipped_count += 1
        continue
      }
      const profile = ensureBrokerRiskProfile({
        clientId: args.clientId,
        brokerId: target.brokerId,
        brokerName: target.brokerName,
        mcNumber: target.mcNumber,
        score: target.score,
        rating: target.rating,
        notes: target.notes,
        adminNotes: target.adminNotes,
        invoices: target.invoices,
        hasWorked: target.hasWorked,
        paymentTermsDays: target.paymentTermsDays,
        termsSignals: target.termsSignals,
        isNewBroker: target.isNewBroker,
        force: args.force ?? true,
        trigger: args.trigger ?? 'weekly',
      })
      profileIds.push(profile.id)
      run.success_count += 1
    } catch (err) {
      run.fail_count += 1
      errors.push(
        `${target.brokerName}: ${err instanceof Error ? err.message : 'unknown error'}`
      )
    }
  }

  const status =
    run.fail_count === 0
      ? 'succeeded'
      : run.success_count > 0
        ? 'partial'
        : 'failed'

  const finished = updateOpsJobRun(run.id, {
    status,
    finished_at: new Date().toISOString(),
    success_count: run.success_count,
    fail_count: run.fail_count,
    skipped_count: run.skipped_count,
    detail: { ...run.detail, errors: errors.slice(0, 20) },
    error_message: errors[0] ?? null,
  })

  return { run: finished ?? run, profileIds }
}
