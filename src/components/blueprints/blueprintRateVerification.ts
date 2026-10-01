/**
 * Rate verification blueprint: read the broker reply, post a note, set OK or Hold.
 */
import type { Invoice } from '../../types/invoice'
import type { SavedBlueprint } from '../../types/blueprintGraph'
import { getSavedBlueprint } from './blueprintStore'
import { getActionIds } from './blueprintSubject'
import { upsertBlueprintRun } from './blueprintRuns'
import { getInvoiceById } from '../../data/mockInvoices'
import { addAdminInvoiceNote } from '../../services/adminInvoiceNoteActions'
import { persistInvoiceLifecycle } from '../../services/emailLifecycleService'
import { notifyAdminBlueprintIssue } from '../../services/adminNotificationService'
import { approveAdminInvoice, holdAdminInvoice } from '../../services/adminInvoiceActions'
import {
  STANDARD_RATE_VERIFICATION,
} from '../../../supabase/functions/_shared/standardBlueprints'
import type { RateVerificationReading } from '../../../supabase/functions/_shared/rateVerificationReply'

function graph(): SavedBlueprint {
  return (getSavedBlueprint(STANDARD_RATE_VERIFICATION.id) ??
    STANDARD_RATE_VERIFICATION) as SavedBlueprint
}

export async function runRateVerificationBlueprint(
  invoice: Invoice,
  reading: RateVerificationReading
): Promise<{ ok: boolean; detail: string }> {
  const bp = graph()
  const details: string[] = []
  let applied = false

  const apply = async () => {
    if (reading.outcome === 'ok') {
      approveAdminInvoice(invoice.id, 'Credyx')
      addAdminInvoiceNote(invoice.id, reading.summary, 'Credyx', { visibility: 'internal' })
      const current = getInvoiceById(invoice.id) ?? invoice
      await persistInvoiceLifecycle(invoice.id, {
        ...(current.email_lifecycle ?? {}),
        paperwork_status: 'good',
        last_reply_status: 'confirmed',
      })
      const { startPaymentChaseAfterConfirm } = await import('./blueprintRunner')
      const chase = await startPaymentChaseAfterConfirm(invoice.id)
      details.push(chase.detail)
      details.push('Marked OK')
    } else if (reading.outcome === 'hold') {
      holdAdminInvoice(invoice.id, reading.summary, 'Credyx')
      details.push('Placed on Hold')
      notifyAdminBlueprintIssue({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        code: 'paperwork-issue',
        title: 'Rate check needs attention',
        message: reading.summary,
        blueprintName: bp.name,
        brokerName: invoice.broker_name,
      })
    } else {
      addAdminInvoiceNote(invoice.id, reading.summary, 'Credyx', { visibility: 'internal' })
      details.push('Reply needs a look')
      notifyAdminBlueprintIssue({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        code: 'reply-unclear',
        title: 'Rate check could not be read',
        message: reading.summary,
        blueprintName: bp.name,
        brokerName: invoice.broker_name,
      })
    }
    applied = true
  }

  for (const node of bp.nodes) {
    if (node.data.kind !== 'action') continue
    for (const actionId of getActionIds(node.data)) {
      if (actionId === 'apply_rate_verification') {
        await apply()
        continue
      }
      if (actionId === 'add_note') {
        const cfg = node.data.actionConfigs?.[actionId]
        const extra = cfg?.message?.trim()
        const body = extra ? `${extra}\n${reading.summary}` : reading.summary
        addAdminInvoiceNote(invoice.id, body, 'Credyx', {
          visibility: 'internal',
        })
        details.push('Note posted')
      }
    }
  }

  if (!applied) await apply()

  const now = new Date().toISOString()
  const title =
    reading.outcome === 'ok'
      ? 'Rate confirmed'
      : reading.outcome === 'hold'
        ? 'Rate check on hold'
        : 'Rate check unclear'
  upsertBlueprintRun(
    {
      id: `run-rate-${invoice.id}-${Date.now()}`,
      subject: 'invoice',
      subjectId: invoice.id,
      subjectLabel: invoice.invoice_number,
      clientLabel: invoice.client_name,
      blueprintId: bp.id,
      blueprintName: bp.name,
      status: 'completed',
      currentStep: `Done · ${reading.outcome}`,
      currentNodeId: 'n-done',
      waitUntil: null,
      startedAt: now,
      updatedAt: now,
    },
    {
      historyEvent: {
        kind: 'completed',
        title,
        detail: reading.summary,
      },
    }
  )

  return { ok: true, detail: details.join(' · ') }
}
