/**
 * Morning staff digest: email today's Credyx calendar tasks to ops.
 * Pulled from derived chase/collections events + shared calendar events due today.
 */

import type { Invoice } from '../types/invoice'
import type { Broker } from '../types/broker'
import type { SharedCalendarEvent } from '../data/sharedCalendarEvents'
import { getAllSharedCalendarEvents } from '../data/sharedCalendarEvents'
import { deriveAdminCalendarEvents } from '../utils/deriveAdminCalendarEvents'
import { applyAssistantCompletions } from '../utils/assistantTaskStore'
import { sendTransactionalEmail } from './emailService'
import { getRuntimeEnvString } from '../platform/runtimeEnv'
import {
  appendOpsJobRun,
  updateOpsJobRun,
} from '../data/brokerRiskStore'
import type { OpsJobRun } from '../types/opsJob'

const LAST_SENT_KEY = 'credyx:staff-calendar-digest-last-sent'

export type StaffDigestTask = {
  id: string
  title: string
  dueDate: string
  brokerName: string
  invoiceNumber: string
  clientName: string
  detail: string
  amountLabel?: string
  type: string
}

export type SendStaffCalendarDigestResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  taskCount: number
  email?: { ok: boolean; error?: string; stub?: boolean; id?: string }
  run?: OpsJobRun
}

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getAdminAlertEmail(): string {
  return getRuntimeEnvString('VITE_ADMIN_ALERT_EMAIL') ?? 'admin@credyx.com'
}

function readLastSentKey(): string | null {
  try {
    return localStorage.getItem(LAST_SENT_KEY)
  } catch {
    return null
  }
}

function writeLastSentKey(dateKey: string): void {
  try {
    localStorage.setItem(LAST_SENT_KEY, dateKey)
  } catch {
    /* ignore quota */
  }
}

function formatWhenLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return dateKey
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Escape HTML for digest list rows. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Build pending tasks due on asOf from live A/R + shared calendar.
 */
export function buildStaffCalendarDigestTasks(
  invoices: Invoice[],
  brokers: Broker[],
  asOf = new Date(),
  sharedEvents?: SharedCalendarEvent[]
): StaffDigestTask[] {
  const today = toDateKey(asOf)
  const derived = deriveAdminCalendarEvents(invoices, brokers, asOf).filter(
    (e) => e.status === 'pending' && e.dueDate === today
  )

  const shared = applyAssistantCompletions(sharedEvents ?? getAllSharedCalendarEvents()).filter(
    (e) => e.status === 'pending' && e.dueDate === today
  )

  const byId = new Map<string, StaffDigestTask>()

  for (const e of derived) {
    const parts = e.brokerName.split(' · ')
    byId.set(e.id, {
      id: e.id,
      title: e.title,
      dueDate: e.dueDate,
      brokerName: parts[0] ?? e.brokerName,
      invoiceNumber: e.invoiceNumber,
      clientName: parts[1] ?? '',
      detail: e.detail,
      amountLabel: e.amountLabel,
      type: e.type,
    })
  }

  for (const e of shared) {
    if (byId.has(e.id)) continue
    byId.set(e.id, {
      id: e.id,
      title: e.title,
      dueDate: e.dueDate,
      brokerName: e.brokerName || '—',
      invoiceNumber: e.invoiceNumber || '—',
      clientName: e.clientName || '',
      detail: e.detail || '',
      amountLabel: e.amountLabel,
      type: e.type,
    })
  }

  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title))
}

function buildTaskListHtml(tasks: StaffDigestTask[]): string {
  if (tasks.length === 0) {
    return '<p style="color:#64748b;">Nothing due today — nice work.</p>'
  }

  const rows = tasks
    .map((t) => {
      const meta = [
        t.clientName ? escapeHtml(t.clientName) : '',
        t.brokerName && t.brokerName !== '—' ? escapeHtml(t.brokerName) : '',
        t.invoiceNumber && t.invoiceNumber !== '—'
          ? `#${escapeHtml(t.invoiceNumber)}`
          : '',
        t.amountLabel ? escapeHtml(t.amountLabel) : '',
      ]
        .filter(Boolean)
        .join(' · ')

      return `<li style="margin:0 0 12px;padding-bottom:12px;border-bottom:1px solid #e2e8f0;">
  <strong style="color:#0f172a;">${escapeHtml(t.title)}</strong>
  ${meta ? `<div style="font-size:13px;color:#475569;margin-top:2px;">${meta}</div>` : ''}
  ${t.detail ? `<div style="font-size:13px;color:#64748b;margin-top:4px;">${escapeHtml(t.detail)}</div>` : ''}
</li>`
    })
    .join('\n')

  return `<ol style="padding-left:18px;margin:0;">${rows}</ol>`
}

function newJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Email today's calendar tasks to the admin alert address.
 * Skips if already sent for today unless force is true.
 */
export async function sendStaffCalendarDigest(args: {
  invoices: Invoice[]
  brokers: Broker[]
  asOf?: Date
  force?: boolean
  toEmail?: string
}): Promise<SendStaffCalendarDigestResult> {
  const asOf = args.asOf ?? new Date()
  const today = toDateKey(asOf)
  const startedAt = new Date().toISOString()

  const run: OpsJobRun = {
    id: newJobId(),
    kind: 'due_action_notifier',
    status: 'running',
    started_at: startedAt,
    finished_at: null,
    success_count: 0,
    fail_count: 0,
    skipped_count: 0,
    detail: { dateKey: today },
    error_message: null,
  }
  appendOpsJobRun(run)

  if (!args.force && readLastSentKey() === today) {
    const finished = updateOpsJobRun(run.id, {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      skipped_count: 1,
      detail: { dateKey: today, reason: 'already_sent_today' },
    })
    return {
      ok: true,
      skipped: true,
      reason: 'Already sent today’s digest',
      taskCount: 0,
      run: finished ?? run,
    }
  }

  const tasks = buildStaffCalendarDigestTasks(args.invoices, args.brokers, asOf)
  const to = (args.toEmail?.trim() || getAdminAlertEmail()).trim()
  const whenLabel = formatWhenLabel(today)
  const portalLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/admin/calendar`
      : 'https://app.credyx.com/admin/calendar'

  const email = await sendTransactionalEmail('staff_calendar_digest', to, {
    whenLabel,
    taskCount: String(tasks.length),
    taskListHtml: buildTaskListHtml(tasks),
    portalLink,
    recipientName: 'team',
  })

  if (!email.ok) {
    const finished = updateOpsJobRun(run.id, {
      status: 'failed',
      finished_at: new Date().toISOString(),
      fail_count: 1,
      detail: { dateKey: today, taskCount: tasks.length, error: email.error },
      error_message: email.error ?? 'Send failed',
    })
    return { ok: false, taskCount: tasks.length, email, run: finished ?? run, reason: email.error }
  }

  writeLastSentKey(today)
  const finished = updateOpsJobRun(run.id, {
    status: 'succeeded',
    finished_at: new Date().toISOString(),
    success_count: 1,
    detail: { dateKey: today, taskCount: tasks.length, to },
  })

  return { ok: true, taskCount: tasks.length, email, run: finished ?? run }
}
