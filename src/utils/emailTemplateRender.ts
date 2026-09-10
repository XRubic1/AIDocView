/**
 * Replace {{placeholders}} in a template string.
 * Values are HTML-escaped unless the key ends with Html (e.g. holdSection).
 */
import { enrichAuthEmailFields } from '../config/authEmailHtml'
import { buildCompanyLogoHtml } from './emailCompanyLogo'
import { buildIssueListHtml, buildMessageHtml } from './carrierDocumentIssueEmail'
import { buildCarrierAttentionUrl } from './carrierAttentionLink'

export function renderEmailTemplateString(
  template: string,
  data: Record<string, string>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const raw = data[key] ?? ''
    if (
      key.endsWith('Html') ||
      key === 'holdSection' ||
      key === 'inviteLink' ||
      key === 'setupLink' ||
      key === 'confirmation_url' ||
      key === 'paymentUrl'
    ) {
      return raw
    }
    return escapeHtml(raw)
  })
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Enrich send data for templates that need computed sections
 * (e.g. carrier_batch_processed hold block).
 */
export function enrichEmailTemplateData(
  templateId: string,
  data: Record<string, string>
): Record<string, string> {
  const next = { ...data }

  if (templateId === 'carrier_document_issue') {
    next.issueListHtml = buildIssueListHtml(data.issueList ?? '')
    next.messageHtml = buildMessageHtml(data.message ?? '')
    if (!next.ctaLabel) next.ctaLabel = 'Upload documents'
    if (!next.portalLink) {
      next.portalLink = buildCarrierAttentionUrl(
        next.invoiceNumber
          ? { id: next.invoiceNumber, invoice_number: next.invoiceNumber }
          : undefined
      )
    }
    if (!next.clientName) next.clientName = 'Carrier'
    if (!next.brokerName) next.brokerName = 'the broker'
  }

  if (templateId === 'carrier_billing_invoice') {
    if (!next.ctaLabel) next.ctaLabel = 'Pay invoice'
    if (!next.contactName) next.contactName = 'there'
    if (!next.clientName) next.clientName = 'Carrier'
    if (!next.messageHtml) next.messageHtml = ''
    if (!next.lineItemsHtml) next.lineItemsHtml = ''
    if (!next.invoiceRowsHtml) next.invoiceRowsHtml = ''
  }

  if (templateId === 'carrier_batch_processed') {
    const holdCount = Number(data.holdCount ?? '0')
    next.holdSubjectSuffix =
      holdCount > 0 ? ` — ${holdCount} on hold` : ' — paperwork sent to brokers'
    next.holdSection =
      holdCount > 0
        ? `<p><strong>${escapeHtml(String(holdCount))} invoice(s) on hold:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(data.holdList ?? '')}</pre>`
        : `<p>No invoices were placed on hold.</p>`
  }

  if (templateId === 'credyx_batch_error') {
    next.clientNameSuffix = data.clientName ? ` for ${escapeHtml(data.clientName)}` : ''
  }

  if (templateId === 'broker_payment_status_inquiry' || templateId === 'broker_payment_status_followup') {
    next.brokerName = data.brokerName ? ` ${data.brokerName}` : ''
  }

  if (templateId === 'broker_packet') {
    if (!next.remittanceMessage) {
      next.remittanceMessage =
        'All payments must be sent to the carrier per the remit-to on the attached invoice. Send remittance advice to billing@credyx.net and ops@credyx.net. Credyx does not change payment instructions by email alone.'
    }
    if (!next.message) next.message = ''
    if (!next.partSuffix) next.partSuffix = ''
    if (!next.partNoteHtml) next.partNoteHtml = ''
    if (!next.remittanceChangeNoteHtml) next.remittanceChangeNoteHtml = ''
  }

  if (templateId === 'broker_remittance_updated') {
    if (!next.message) next.message = ''
    if (!next.effectiveDate) next.effectiveDate = new Date().toISOString().slice(0, 10)
    if (!next.carrierName) next.carrierName = 'the carrier'
  }

  if (templateId === 'client_invite') {
    if (!next.websiteUrl) next.websiteUrl = 'https://credyx.com'
    if (!next.contactEmail) next.contactEmail = 'ops@credyx.net'
    if (!next.setupLink) next.setupLink = next.inviteLink || next.portalLink || ''
    if (!next.inviteLink) next.inviteLink = next.setupLink
    if (!next.ctaLabel) next.ctaLabel = 'Create your password'
  }

  if (!next.contactName) next.contactName = 'there'
  if (!next.loadNumber) next.loadNumber = 'N/A'

  if (templateId.startsWith('auth_')) {
    return enrichAuthEmailFields(templateId, next, buildCompanyLogoHtml())
  }

  return next
}
