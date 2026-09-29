/**
 * Process-time PPW. Uses the Standard paperwork packet blueprint Then-do
 * (attachments included). The old Settings PPW toggle does not gate this.
 */
import type { Invoice } from '../../types/invoice'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import { STANDARD_BROKER_PACKET } from '../../../supabase/functions/_shared/standardBlueprints'
import type { BlueprintActionTaskConfig } from './blueprintActionSetup'
import { executeBlueprintThenDo } from './blueprintRunnerActions'
import { getSavedBlueprint } from './blueprintStore'
import { getActionIds } from './blueprintSubject'
import { upsertBlueprintRun } from './blueprintRuns'
import { hasPpwBeenSent } from '../../utils/ppwSent'

export type PacketSendDetail = {
  invoiceId: string
  invoiceNumber: string
  brokerEmail: string
  success: boolean
  error?: string
  skipped?: boolean
}

function packetConfig(): BlueprintActionTaskConfig {
  const saved = getSavedBlueprint(STANDARD_BROKER_PACKET.id)
  const nodes = (saved?.nodes ?? STANDARD_BROKER_PACKET.nodes) as SavedBlueprint['nodes']
  for (const node of nodes) {
    if (node.data.kind !== 'action') continue
    for (const id of getActionIds(node.data)) {
      if (id !== 'email_broker_packet') continue
      const cfg = node.data.actionConfigs?.[id]
      if (cfg) return cfg
    }
  }
  return {
    message: '',
    channel: 'email',
    templateId: 'broker_packet',
    fromEmail: 'system@credyx.net',
    fromEmails: ['system@credyx.net'],
  }
}

/** PPW leaves from the mailbox that receives broker replies. */
function packetFrom(config: BlueprintActionTaskConfig): BlueprintActionTaskConfig {
  const from = config.fromEmail?.trim().toLowerCase() ?? ''
  if (from && from !== 'billing@credyx.net') return config
  return {
    ...config,
    fromEmail: 'system@credyx.net',
    fromEmails: ['system@credyx.net'],
  }
}

function rememberPacketRun(invoice: Invoice, detail: string, ok: boolean): void {
  const now = new Date().toISOString()
  const bp = getSavedBlueprint(STANDARD_BROKER_PACKET.id)
  upsertBlueprintRun({
    id: `run-ppw-${invoice.id}`,
    subject: 'invoice',
    subjectId: invoice.id,
    subjectLabel: invoice.invoice_number,
    clientLabel: invoice.client_name,
    blueprintId: STANDARD_BROKER_PACKET.id,
    blueprintName: bp?.name ?? STANDARD_BROKER_PACKET.name,
    status: ok ? 'completed' : 'stopped',
    currentStep: ok ? 'Done · paperwork packet' : 'Stopped · paperwork packet',
    currentNodeId: 'n-done',
    waitUntil: null,
    startedAt: now,
    updatedAt: now,
  }, {
    historyEvent: {
      kind: ok ? 'completed' : 'stopped',
      title: ok ? 'Paperwork packet sent' : 'Paperwork packet failed',
      detail,
    },
  })
}

export async function sendBrokerPacketsFromBlueprint(
  invoices: Invoice[],
  opts: { sentBy: string; forceResend?: boolean }
): Promise<{ success: number; failed: number; skipped: number; details: PacketSendDetail[] }> {
  const results = { success: 0, failed: 0, skipped: 0, details: [] as PacketSendDetail[] }
  const config = packetFrom(packetConfig())
  const blueprintName =
    getSavedBlueprint(STANDARD_BROKER_PACKET.id)?.name ?? STANDARD_BROKER_PACKET.name

  for (const invoice of invoices) {
    if (!opts.forceResend && hasPpwBeenSent(invoice)) {
      results.skipped += 1
      results.details.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        brokerEmail: '—',
        success: true,
        skipped: true,
      })
      continue
    }
    const sent = await executeBlueprintThenDo({
      invoiceId: invoice.id,
      actionId: 'email_broker_packet',
      blueprintName,
      config,
      authorName: opts.sentBy,
      skipIfAlreadySent: !opts.forceResend,
    })
    rememberPacketRun(invoice, sent.detail, sent.ok && !sent.skipped)
    if (sent.skipped) {
      results.skipped += 1
      results.details.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        brokerEmail: '—',
        success: true,
        skipped: true,
        error: sent.detail,
      })
    } else if (sent.ok) {
      results.success += 1
      results.details.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        brokerEmail: 'broker',
        success: true,
      })
    } else {
      results.failed += 1
      results.details.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        brokerEmail: 'broker',
        success: false,
        error: sent.detail,
      })
    }
  }
  return results
}
