import {
  appendOpsJobRun,
  updateOpsJobRun,
} from '../data/brokerRiskStore'
import { ensureInvoiceActionPlan } from '../services/invoiceActionPlanService'
import type { Invoice } from '../types/invoice'
import type { OpsJobRun } from '../types/opsJob'

function newJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const OPEN = new Set(['pending', 'approved', 'hold'])

/**
 * Nightly invoice plan sync skeleton (Phase 0).
 * Ensures every open invoice has a current active plan.
 */
export function runInvoicePlanSync(args: {
  clientId: string
  invoices: Invoice[]
  managedTier?: boolean
  force?: boolean
}): { run: OpsJobRun; planIds: string[] } {
  const startedAt = new Date().toISOString()
  const run: OpsJobRun = {
    id: newJobId(),
    kind: 'invoice_plan_sync',
    status: 'running',
    started_at: startedAt,
    finished_at: null,
    success_count: 0,
    fail_count: 0,
    skipped_count: 0,
    detail: { clientId: args.clientId },
    error_message: null,
  }
  appendOpsJobRun(run)

  const planIds: string[] = []
  const errors: string[] = []
  const open = args.invoices.filter((i) => OPEN.has(i.status))

  for (const invoice of open) {
    try {
      const result = ensureInvoiceActionPlan({
        invoice,
        clientId: args.clientId,
        managedTier: args.managedTier,
        force: args.force,
      })
      if (!result) {
        run.skipped_count += 1
        continue
      }
      planIds.push(result.plan.id)
      run.success_count += 1
    } catch (err) {
      run.fail_count += 1
      errors.push(
        `#${invoice.invoice_number}: ${err instanceof Error ? err.message : 'unknown error'}`
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
    detail: { ...run.detail, openCount: open.length, errors: errors.slice(0, 20) },
    error_message: errors[0] ?? null,
  })

  return { run: finished ?? run, planIds }
}
