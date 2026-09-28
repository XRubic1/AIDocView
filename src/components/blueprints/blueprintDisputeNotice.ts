/**
 * Account-dispute notices send from the Standard account dispute blueprint.
 * Settings no longer gates this email.
 */
import { sendTransactionalEmail, type EmailTemplate } from '../../services/emailService'
import { EMAIL_MAILBOXES, displayNameForFromEmail, formatResendFrom } from '../../config/emailMailboxes'
import { defaultPortalLink } from '../../utils/carrierAttentionLink'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import { STANDARD_DISPUTE_NOTICE } from '../../../supabase/functions/_shared/standardBlueprints'
import type { BlueprintActionTaskConfig } from './blueprintActionSetup'
import { resolveFromEmailsList } from './blueprintActionSetup'
import { getSavedBlueprint } from './blueprintStore'
import { getActionIds } from './blueprintSubject'
import { upsertBlueprintRun } from './blueprintRuns'

const BILLING = 'billing@credyx.net'

function disputeConfig(): BlueprintActionTaskConfig {
  const saved = getSavedBlueprint(STANDARD_DISPUTE_NOTICE.id)
  const nodes = (saved?.nodes ?? STANDARD_DISPUTE_NOTICE.nodes) as SavedBlueprint['nodes']
  for (const node of nodes) {
    if (node.data.kind !== 'action') continue
    for (const id of getActionIds(node.data)) {
      if (id !== 'email_carrier_dispute') continue
      const cfg = node.data.actionConfigs?.[id]
      if (cfg) return cfg
    }
  }
  return {
    message: '',
    channel: 'email',
    templateId: 'carrier_dispute_opened',
    fromEmail: BILLING,
    fromEmails: [BILLING],
  }
}

function fromAndCc(config: BlueprintActionTaskConfig): { fromOverride?: string; cc: string[] } {
  const m = EMAIL_MAILBOXES
  const list = resolveFromEmailsList(config, {
    billing: m.billingEmail,
    ops: m.opsEmail,
    admin: m.adminEmail,
    notifications: m.notificationsEmail,
  })
  if (!list.length) return { cc: [] }
  const [fromEmail, ...cc] = list
  return {
    fromOverride: formatResendFrom(displayNameForFromEmail(fromEmail, m), fromEmail),
    cc,
  }
}

export async function sendBlueprintDisputeNotice(opts: {
  clientId: string
  brokerId: string
  clientName: string
  contactName: string
  clientEmail: string
  brokerName: string
  brokerContact: string
  summary: string
}): Promise<{ ok: boolean; error?: string }> {
  const config = disputeConfig()
  const templateId = config.templateId?.trim() || 'carrier_dispute_opened'
  const { fromOverride, cc } = fromAndCc(config)
  const result = await sendTransactionalEmail(
    templateId as EmailTemplate,
    opts.clientEmail,
    {
      contactName: opts.contactName,
      clientName: opts.clientName,
      brokerName: opts.brokerName,
      summary: opts.summary,
      portalLink: `${defaultPortalLink()}/client/brokers`,
      brokerContact: opts.brokerContact,
    },
    { fromOverride, cc }
  )

  const now = new Date().toISOString()
  const bp = getSavedBlueprint(STANDARD_DISPUTE_NOTICE.id)
  upsertBlueprintRun(
    {
      id: `run-dispute-${opts.brokerId}-${opts.clientId}-${Date.now()}`,
      subject: 'broker',
      subjectId: opts.brokerId,
      subjectLabel: opts.brokerName,
      clientLabel: opts.clientName,
      blueprintId: STANDARD_DISPUTE_NOTICE.id,
      blueprintName: bp?.name ?? STANDARD_DISPUTE_NOTICE.name,
      status: result.ok ? 'completed' : 'stopped',
      currentStep: result.ok ? 'Done · dispute notice' : 'Stopped · dispute notice',
      currentNodeId: 'n-done',
      waitUntil: null,
      startedAt: now,
      updatedAt: now,
    },
    {
      historyEvent: {
        kind: result.ok ? 'completed' : 'stopped',
        title: 'Dispute opened',
        detail: `${opts.clientName}: ${opts.summary}`,
      },
    }
  )

  return result
}
