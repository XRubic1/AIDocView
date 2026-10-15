/**
 * Ops alerts (intake, verification, doc split) send from the Standard ops alert
 * blueprint. Settings no longer gates these.
 */
import { sendTransactionalEmail } from '../../services/emailService'
import type { EmailTemplateId } from '../../config/emailTemplateDefaults'
import { getAllBatches } from '../../data/mockBatches'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import { STANDARD_OPS_ALERT } from '../../../supabase/functions/_shared/standardBlueprints'
import type { BlueprintActionTaskConfig } from './blueprintActionSetup'
import { getSavedBlueprint } from './blueprintStore'
import { getActionIds } from './blueprintSubject'
import { upsertBlueprintRun } from './blueprintRuns'

const DEFAULT_OPS = 'ops@credyx.net'

function opsConfig(): BlueprintActionTaskConfig {
  const saved = getSavedBlueprint(STANDARD_OPS_ALERT.id)
  const nodes = (saved?.nodes ?? STANDARD_OPS_ALERT.nodes) as SavedBlueprint['nodes']
  for (const node of nodes) {
    if (node.data.kind !== 'action') continue
    for (const id of getActionIds(node.data)) {
      if (id !== 'email_ops_alert') continue
      const cfg = node.data.actionConfigs?.[id]
      if (cfg) return cfg
    }
  }
  return {
    message: '',
    channel: 'email',
    templateId: 'credyx_batch_error',
    fromEmail: DEFAULT_OPS,
    fromEmails: [DEFAULT_OPS],
  }
}

export async function sendBlueprintOpsAlert(opts: {
  batchNumber: string
  clientName?: string
  issueMessage: string
  scope: string
}): Promise<{ ok: boolean; error?: string }> {
  const config = opsConfig()
  const templateId = config.templateId?.trim() || 'credyx_batch_error'
  const to = config.fromEmails?.[0]?.trim() || config.fromEmail?.trim() || DEFAULT_OPS
  const result = await sendTransactionalEmail(templateId as EmailTemplateId, to, {
    batchNumber: opts.batchNumber,
    clientName: opts.clientName ?? '',
    issueMessage: opts.issueMessage,
    scope: opts.scope,
  })

  const batch = getAllBatches().find((b) => b.batch_number === opts.batchNumber)
  if (batch) {
    const now = new Date().toISOString()
    const bp = getSavedBlueprint(STANDARD_OPS_ALERT.id)
    upsertBlueprintRun({
      id: `run-ops-${batch.id}-${opts.scope}`,
      subject: 'batch',
      subjectId: batch.id,
      subjectLabel: batch.batch_number,
      clientLabel: batch.client_name,
      blueprintId: STANDARD_OPS_ALERT.id,
      blueprintName: bp?.name ?? STANDARD_OPS_ALERT.name,
      status: result.ok ? 'completed' : 'stopped',
      currentStep: result.ok ? 'Done · ops alert' : 'Stopped · ops alert',
      currentNodeId: 'n-done',
      waitUntil: null,
      startedAt: now,
      updatedAt: now,
    }, {
      historyEvent: {
        kind: result.ok ? 'completed' : 'stopped',
        title: 'Ops alert',
        detail: `${opts.scope}: ${opts.issueMessage}`,
      },
    })
  }

  return result
}
