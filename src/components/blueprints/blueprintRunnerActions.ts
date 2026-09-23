/**
 * Then-do → existing note / status helpers only.
 * Broker chase emails stay on the old email-lifecycle path.
 */
import {
  addAdminInvoiceNote,
  postInvoiceStatusNote,
  type InvoiceStatusNoteKind,
} from '../../services/adminInvoiceNoteActions'
import type { BlueprintActionTaskConfig } from './blueprintActionSetup'
import { defaultTaskConfig } from './blueprintActionSetup'
import { lookupActionById } from './blueprintCatalog'

export type BlueprintActionResult = {
  actionId: string
  ok: boolean
  skipped?: boolean
  detail: string
}

const STATUS_KIND_BY_ACTION: Partial<Record<string, InvoiceStatusNoteKind>> = {
  will_pay: 'will_pay',
  call_back: 'call_back',
  payment_confirmed: 'payment_confirmed',
  ppw_confirmed: 'ppw_confirmed',
  set_due_date: 'set_due_date',
}

/** Actions owned by old chase — never send from blueprints in phase 1. */
const CHASE_EMAIL_ACTIONS = new Set([
  'email_payment_status',
  'email_followup',
])

function withBlueprintTag(body: string, blueprintName: string): string {
  const tag = `(Blueprint: ${blueprintName})`
  const trimmed = body.trim()
  if (!trimmed) return tag
  if (trimmed.includes(tag)) return trimmed
  return `${trimmed}\n\n${tag}`
}

/**
 * Execute one Then-do task via notes/status only.
 * Skips broker chase emails (old system owns those).
 */
export function executeBlueprintThenDo(input: {
  invoiceId: string
  actionId: string
  blueprintName: string
  config?: BlueprintActionTaskConfig
  authorName?: string
}): BlueprintActionResult {
  const author = input.authorName?.trim() || 'Credyx Blueprint'
  const cfg = input.config ?? defaultTaskConfig(input.actionId)
  const action = lookupActionById(input.actionId)
  const label = action?.defaultTitle ?? input.actionId

  if (CHASE_EMAIL_ACTIONS.has(input.actionId)) {
    return {
      actionId: input.actionId,
      ok: true,
      skipped: true,
      detail: `${label}: skipped — broker chase email stays on Run chase / email lifecycle.`,
    }
  }

  const statusKind = STATUS_KIND_BY_ACTION[input.actionId]
  if (statusKind) {
    const updated = postInvoiceStatusNote(input.invoiceId, {
      kind: statusKind,
      authorName: author,
      extraNote: withBlueprintTag(cfg.message || '', input.blueprintName),
    })
    return {
      actionId: input.actionId,
      ok: Boolean(updated),
      detail: updated
        ? `${label}: status note posted.`
        : `${label}: could not post status note.`,
    }
  }

  if (
    input.actionId === 'add_note' ||
    input.actionId === 'notify_carrier' ||
    input.actionId === 'create_task' ||
    input.actionId === 'mark_urgent' ||
    input.actionId === 'push_notify'
  ) {
    const visibility =
      input.actionId === 'notify_carrier' || input.actionId === 'add_note'
        ? ('client' as const)
        : ('internal' as const)
    const fallback =
      input.actionId === 'notify_carrier'
        ? 'Update from Credyx on your invoice.'
        : input.actionId === 'mark_urgent'
          ? 'Marked urgent for Credyx follow-up.'
          : input.actionId === 'create_task'
            ? 'Staff task from blueprint.'
            : action?.cardLine ?? label
    const body = withBlueprintTag(cfg.message?.trim() || fallback, input.blueprintName)
    const updated = addAdminInvoiceNote(input.invoiceId, body, author, { visibility })
    return {
      actionId: input.actionId,
      ok: Boolean(updated),
      detail: updated
        ? `${label}: note added (${visibility}).`
        : `${label}: could not add note.`,
    }
  }

  return {
    actionId: input.actionId,
    ok: true,
    skipped: true,
    detail: `${label}: skipped — not mapped in phase 1 (notes/status only).`,
  }
}
