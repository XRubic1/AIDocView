/** Ops job run types for weekly/nightly skeletons. */

export type OpsJobKind =
  | 'broker_risk_weekly'
  | 'invoice_plan_sync'
  | 'due_action_notifier'
  | 'event_reanalysis'

export type OpsJobRunStatus = 'running' | 'succeeded' | 'failed' | 'partial'

export type OpsJobRun = {
  id: string
  kind: OpsJobKind
  status: OpsJobRunStatus
  started_at: string
  finished_at: string | null
  success_count: number
  fail_count: number
  skipped_count: number
  detail: Record<string, unknown>
  error_message: string | null
}
