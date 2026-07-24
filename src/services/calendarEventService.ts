/**
 * Create shared calendar events and optionally email + notify both parties.
 */

import type { SharedCalendarEvent, SharedCalendarEventCreator } from '../data/sharedCalendarEvents'
import { upsertSharedCalendarEvent } from '../data/sharedCalendarEvents'
import { sendTransactionalEmail } from './emailService'
import { addNotification } from '../data/mockNotifications'
import { notifyAdminCalendarEvent } from './adminNotificationService'
import { getRuntimeEnvString } from '../platform/runtimeEnv'

export type CreateSharedCalendarEventInput = Omit<
  SharedCalendarEvent,
  'id' | 'createdAt' | 'emailRequested'
> & {
  id?: string
  /** Send calendar notice emails to client + admin. */
  sendEmail?: boolean
  /** Client portal email. */
  clientEmail?: string
}

export type CreateSharedCalendarEventResult = {
  event: SharedCalendarEvent
  email: {
    client?: { ok: boolean; error?: string; stub?: boolean }
    admin?: { ok: boolean; error?: string; stub?: boolean }
  }
}

function getAdminAlertEmail(): string {
  return getRuntimeEnvString('VITE_ADMIN_ALERT_EMAIL') ?? 'admin@credyx.com'
}

function formatWhenLabel(event: SharedCalendarEvent): string {
  const [y, m, d] = event.dueDate.split('-').map(Number)
  if (!y || !m || !d) return event.dueLabel || event.dueDate
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function buildEmailData(event: SharedCalendarEvent, recipientRole: 'client' | 'admin') {
  const meetingBlock = event.meetingUrl
    ? `<p><strong>Join:</strong> <a href="${event.meetingUrl}">${event.meetingUrl}</a></p>`
    : '<p><em>No meeting link provided.</em></p>'
  const message =
    event.emailMessage?.trim() ||
    event.detail ||
    'A calendar event was added in Credyx.'

  return {
    recipientRole,
    clientName: event.clientName,
    eventTitle: event.title,
    eventType: event.type.replace(/_/g, ' '),
    whenLabel: formatWhenLabel(event),
    brokerName: event.brokerName || '—',
    invoiceNumber: event.invoiceNumber || '—',
    message,
    meetingUrl: event.meetingUrl ?? '',
    meetingBlock,
    portalLink:
      recipientRole === 'client'
        ? `${window.location.origin}/client/assistant`
        : `${window.location.origin}/clients`,
  }
}

/**
 * Persist a shared event, push in-app bells, and optionally email both parties.
 */
export async function createSharedCalendarEvent(
  input: CreateSharedCalendarEventInput
): Promise<CreateSharedCalendarEventResult> {
  const createdBy: SharedCalendarEventCreator = input.createdBy
  const event: SharedCalendarEvent = {
    ...input,
    id: input.id ?? `shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    emailRequested: Boolean(input.sendEmail),
  }

  upsertSharedCalendarEvent(event)

  const when = formatWhenLabel(event)
  const meetingHint = event.meetingUrl ? ' · Meeting link included' : ''

  addNotification(
    event.clientId,
    {
      type: 'system_alert',
      title: createdBy === 'admin' ? 'Credyx added a calendar event' : 'Calendar event added',
      message: `${event.title} — ${when}${meetingHint}`,
      link: '/client/assistant',
      link_label: 'Open calendar',
      metadata: {
        calendar_event_id: event.id,
        event_type: event.type,
      },
    },
    { skipPreferenceCheck: true }
  )

  notifyAdminCalendarEvent({
    clientId: event.clientId,
    clientName: event.clientName,
    eventTitle: event.title,
    whenLabel: when,
    createdBy,
    meetingUrl: event.meetingUrl,
  })

  const emailResult: CreateSharedCalendarEventResult['email'] = {}

  if (input.sendEmail) {
    const clientTo = input.clientEmail?.trim()
    if (clientTo) {
      emailResult.client = await sendTransactionalEmail(
        'calendar_event_notice',
        clientTo,
        buildEmailData(event, 'client')
      )
    } else {
      emailResult.client = { ok: false, error: 'Client has no email on file' }
    }

    emailResult.admin = await sendTransactionalEmail(
      'calendar_event_notice',
      getAdminAlertEmail(),
      buildEmailData(event, 'admin')
    )
  }

  return { event, email: emailResult }
}
