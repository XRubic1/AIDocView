/** Per-task message / delivery setup for Then-do checklist items (UI only). */

export type BlueprintDeliveryChannel = 'email' | 'app' | 'both'

export type BlueprintTemplateAudience = 'broker' | 'carrier' | 'admin' | 'system'

export type BlueprintActionTaskConfig = {
  message: string
  channel: BlueprintDeliveryChannel
  /** Links to Settings → Templates (`email_templates` id). */
  templateId?: string
}

export type ActionSetupSpec = {
  needsMessage: boolean
  needsChannel: boolean
  /** Offer picker from Settings → Templates. */
  needsTemplate: boolean
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
    templateAudiences: [],
    messageLabel: 'Note text',
    messagePlaceholder: 'What should the note say?',
    defaultChannel: 'app',
  },
  notify_carrier: {
    needsMessage: true,
    needsChannel: true,
    needsTemplate: true,
    templateAudiences: ['carrier'],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional override text if you are not using a template…',
    defaultChannel: 'both',
  },
  email_carrier_batch_processed: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: true,
    templateAudiences: ['carrier'],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional note — default uses the batch processed template…',
    defaultChannel: 'email',
  },
  push_notify: {
    needsMessage: true,
    needsChannel: true,
    needsTemplate: true,
    templateAudiences: ['carrier', 'admin', 'system', 'broker'],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional override if you are not using a template…',
    defaultChannel: 'app',
  },
  email_payment_status: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: true,
    templateAudiences: ['broker'],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional override if you are not using a template…',
    defaultChannel: 'email',
  },
  email_followup: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: true,
    templateAudiences: ['broker'],
    messageLabel: 'Extra note (optional)',
    messagePlaceholder: 'Optional override if you are not using a template…',
    defaultChannel: 'email',
  },
  create_task: {
    needsMessage: true,
    needsChannel: false,
    needsTemplate: false,
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
  return { message: '', channel: setup.defaultChannel, templateId: '' }
}

export function channelLabel(channel: BlueprintDeliveryChannel): string {
  if (channel === 'email') return 'Email only'
  if (channel === 'app') return 'App only'
  return 'Email + app'
}

export function isActionConfigurable(actionId: string): boolean {
  const s = getActionSetup(actionId)
  return s.needsMessage || s.needsChannel || s.needsTemplate
}

/** True when a Then-do task has the content it needs (template and/or message). */
export function isTaskReady(
  actionId: string,
  cfg?: BlueprintActionTaskConfig | null
): boolean {
  const setup = getActionSetup(actionId)
  if (!isActionConfigurable(actionId)) return true
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
