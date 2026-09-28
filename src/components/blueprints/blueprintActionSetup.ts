/** Per-task message / delivery setup for Then-do checklist items (UI only). */

export type BlueprintDeliveryChannel = 'email' | 'app' | 'both'

export type BlueprintTemplateAudience = 'broker' | 'carrier' | 'admin' | 'system'

/** Which Credyx mailbox Then-do emails send From (legacy key — prefer fromEmail). */
export type BlueprintFromMailbox = 'billing' | 'ops' | 'admin' | 'notifications'

export type BlueprintActionTaskConfig = {
  message: string
  channel: BlueprintDeliveryChannel
  /** Links to Settings → Templates (`email_templates` id). */
  templateId?: string
  /** @deprecated Prefer fromEmails — mailbox key. */
  fromMailbox?: BlueprintFromMailbox | ''
  /** @deprecated Prefer fromEmails[0]. */
  fromEmail?: string
  /**
   * Ordered From/CC list for Then-do email.
   * Index 0 = Resend From; index 1+ = CC.
   */
  fromEmails?: string[]
}

export type ActionSetupSpec = {
  needsMessage: boolean
  needsChannel: boolean
  /** Offer picker from Settings → Templates. */
  needsTemplate: boolean
  /** Offer From mailbox picker (billing / ops / …). */
  needsFrom: boolean
  /** Which template audiences to offer (empty = all non-auth). */
  templateAudiences: BlueprintTemplateAudience[]
  messageLabel: string
  messagePlaceholder: string
  defaultChannel: BlueprintDeliveryChannel
}

const DEFAULT_SETUP: ActionSetupSpec = {
  needsMessage: false,
  needsChannel: false,
  needsTemplate: false,
  needsFrom: false,
  templateAudiences: [],
  messageLabel: 'Details',
  messagePlaceholder: '',
  defaultChannel: 'app',
}

export const ACTION_SETUP: Record<string, ActionSetupSpec> = {
  add_note: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: false,
    needsFrom: false,
    templateAudiences: [],
    messageLabel: 'Note text',
    messagePlaceholder:
      'Paperwork sent to broker via @ "broker-email" - "broker-name", "invoice-number", "load-number"',
    defaultChannel: 'app',
  },
  notify_carrier: {
    needsMessage: true,
    needsChannel: true,
    needsTemplate: true,
    needsFrom: true,
    templateAudiences: ['carrier'],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional override text if you are not using a template…',
    defaultChannel: 'both',
  },
  email_carrier_batch_processed: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: true,
    needsFrom: true,
    templateAudiences: ['carrier'],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional note — default uses the batch processed template…',
    defaultChannel: 'email',
  },
  push_notify: {
    needsMessage: true,
    needsChannel: true,
    needsTemplate: true,
    needsFrom: false,
    templateAudiences: ['carrier', 'admin', 'system', 'broker'],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional override if you are not using a template…',
    defaultChannel: 'app',
  },
  email_broker_packet: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: false,
    needsFrom: true,
    templateAudiences: ['broker'],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional note included with the paperwork packet…',
    defaultChannel: 'email',
  },
  email_carrier_dispute: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: true,
    needsFrom: true,
    templateAudiences: ['carrier'],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional note — default uses the dispute opened template…',
    defaultChannel: 'email',
  },
  apply_broker_reply: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: false,
    needsFrom: false,
    templateAudiences: [],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional note stored with the broker reply…',
    defaultChannel: 'app',
  },
  email_ops_alert: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: true,
    needsFrom: true,
    templateAudiences: ['admin', 'system'],
    messageLabel: 'Issue details',
    messagePlaceholder: 'What should ops see…',
    defaultChannel: 'email',
  },
  email_payment_status: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: true,
    needsFrom: true,
    templateAudiences: ['broker'],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional override if you are not using a template…',
    defaultChannel: 'email',
  },
  email_followup: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: true,
    needsFrom: true,
    templateAudiences: ['broker'],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional override if you are not using a template…',
    defaultChannel: 'email',
  },
  create_task: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: false,
    needsFrom: false,
    templateAudiences: [],
    messageLabel: 'Task details',
    messagePlaceholder: 'What should the staff task say?',
    defaultChannel: 'app',
  },
}

export function getActionSetup(actionId: string): ActionSetupSpec {
  return ACTION_SETUP[actionId] ?? DEFAULT_SETUP
}

export function defaultTaskConfig(actionId: string): BlueprintActionTaskConfig {
  const setup = getActionSetup(actionId)
  const billing = 'billing@credyx.net'
  return {
    message: '',
    channel: setup.defaultChannel,
    templateId:
      actionId === 'email_broker_packet'
        ? 'broker_packet'
        : actionId === 'email_carrier_dispute'
          ? 'carrier_dispute_opened'
          : '',
    fromMailbox: setup.needsFrom ? 'billing' : '',
    fromEmail: setup.needsFrom ? billing : '',
    fromEmails: setup.needsFrom ? [billing] : [],
  }
}

export function channelLabel(channel: BlueprintDeliveryChannel): string {
  if (channel === 'email') return 'Email only'
  if (channel === 'app') return 'App only'
  return 'Email + app'
}

export function isActionConfigurable(actionId: string): boolean {
  const s = getActionSetup(actionId)
  return s.needsMessage || s.needsChannel || s.needsTemplate || s.needsFrom
}

/** True when a Then-do task has the content it needs (template and/or message). */
export function isTaskReady(
  actionId: string,
  cfg?: BlueprintActionTaskConfig | null
): boolean {
  const setup = getActionSetup(actionId)
  if (!isActionConfigurable(actionId)) return true
  // Packet send is ready with From alone (message optional).
  if (actionId === 'email_broker_packet') return true
  const config = cfg ?? defaultTaskConfig(actionId)
  if (setup.needsTemplate && config.templateId?.trim()) return true
  if (setup.needsMessage && config.message.trim()) return true
  if (!setup.needsMessage && !setup.needsTemplate) return true
  return false
}

/** Short hint for dry-run / UI when a task is incomplete. */
export function taskSetupHint(actionId: string): string {
  const setup = getActionSetup(actionId)
  if (setup.needsTemplate && setup.needsMessage) {
    return 'Needs a template or message'
  }
  if (setup.needsTemplate) return 'Needs a template'
  if (setup.needsMessage) return 'Needs a message'
  return 'Not set up'
}

export const FROM_MAILBOX_OPTIONS: {
  id: BlueprintFromMailbox
  label: string
}[] = [
  { id: 'billing', label: 'Billing (broker / chase)' },
  { id: 'ops', label: 'Ops (carrier)' },
  { id: 'admin', label: 'Admin alerts' },
  { id: 'notifications', label: 'Notifications' },
]

/** Resolve legacy fromMailbox → email using current Settings addresses. */
export function emailFromMailboxKey(
  mailbox: BlueprintFromMailbox | '' | undefined,
  billing = 'billing@credyx.net',
  ops = 'ops@credyx.net',
  admin = 'ops@credyx.net',
  notifications = 'notifications@credyx.net'
): string {
  if (mailbox === 'ops') return ops
  if (mailbox === 'admin') return admin || ops
  if (mailbox === 'notifications') return notifications
  if (mailbox === 'billing' || !mailbox) return billing
  return billing
}

/** Ordered From + CC list from task config (legacy fields supported). */
export function resolveFromEmailsList(
  config: {
    fromEmails?: string[]
    fromEmail?: string
    fromMailbox?: BlueprintFromMailbox | ''
  } | null | undefined,
  fallbacks?: {
    billing?: string
    ops?: string
    admin?: string
    notifications?: string
  }
): string[] {
  const billing = fallbacks?.billing ?? 'billing@credyx.net'
  const ops = fallbacks?.ops ?? 'ops@credyx.net'
  const admin = fallbacks?.admin ?? ops
  const notifications = fallbacks?.notifications ?? 'notifications@credyx.net'

  if (config?.fromEmails?.length) {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of config.fromEmails) {
      const e = raw.trim().toLowerCase()
      if (!e || seen.has(e)) continue
      seen.add(e)
      out.push(e)
    }
    if (out.length) return out
  }
  const single =
    config?.fromEmail?.trim().toLowerCase() ||
    emailFromMailboxKey(config?.fromMailbox, billing, ops, admin, notifications)
  return single ? [single] : [billing]
}

export function fromRoleLabel(index: number): string {
  if (index === 0) return 'From'
  return `CC ${index}`
}
