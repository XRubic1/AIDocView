import type { EmailAttachment } from '../services/emailService'

/**
 * Soft budget for broker packet doc attachments (base64 chars).
 * Leaves headroom under the edge ~35MB guard for the inline logo.
 */
export const BROKER_PACKET_PART_BUDGET_CHARS = 32 * 1024 * 1024

export interface NamedAttachment {
  name: string
  attachment: EmailAttachment
}

export interface AttachmentPart {
  names: string[]
  attachments: EmailAttachment[]
  /** Approximate base64 payload size for this part (docs only). */
  charSize: number
}

/** Measure attachment payload the same way the edge function does. */
export function attachmentPayloadChars(attachment: EmailAttachment): number {
  return (attachment.content?.length ?? 0) + (attachment.filename?.length ?? 0)
}

/**
 * Pack named attachments into parts that each fit under maxChars.
 * Returns an error if a single file exceeds the budget (cannot split one file).
 */
export function partitionAttachmentsBySize(
  items: NamedAttachment[],
  maxChars: number = BROKER_PACKET_PART_BUDGET_CHARS
): { parts: AttachmentPart[] } | { error: string } {
  if (items.length === 0) {
    return { error: 'No attachments to send' }
  }

  for (const item of items) {
    const size = attachmentPayloadChars(item.attachment)
    if (size > maxChars) {
      return {
        error: `File “${item.name}” is too large for one email (~${Math.round(size / (1024 * 1024))}MB). Compress it or split the PDF, then retry.`,
      }
    }
  }

  const parts: AttachmentPart[] = []
  let current: AttachmentPart = { names: [], attachments: [], charSize: 0 }

  const pushCurrent = () => {
    if (current.attachments.length === 0) return
    parts.push(current)
    current = { names: [], attachments: [], charSize: 0 }
  }

  for (const item of items) {
    const size = attachmentPayloadChars(item.attachment)
    if (current.attachments.length > 0 && current.charSize + size > maxChars) {
      pushCurrent()
    }
    current.names.push(item.name)
    current.attachments.push(item.attachment)
    current.charSize += size
  }
  pushCurrent()

  return { parts }
}

/** Subject suffix like " (Part 1 of 2)" — empty when only one part. */
export function brokerPacketPartSuffix(partNumber: number, partTotal: number): string {
  if (partTotal <= 1) return ''
  return ` (Part ${partNumber} of ${partTotal})`
}

/** HTML callout explaining a multi-part send (empty when single part). */
export function brokerPacketPartNoteHtml(partNumber: number, partTotal: number): string {
  if (partTotal <= 1) return ''
  return `<div style="margin:14px 0 0 0;padding:12px 14px;background-color:#eff6ff;border:1px solid #93c5fd;border-radius:8px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#1d4ed8;">Split packet</p>
  <p style="margin:0;font-size:13px;line-height:1.45;color:#1e3a8a;">
    This paperwork was sent in <strong>${partTotal} emails</strong> because of attachment size.
    This is <strong>Part ${partNumber} of ${partTotal}</strong> — please keep all parts together.
  </p>
</div>`
}
