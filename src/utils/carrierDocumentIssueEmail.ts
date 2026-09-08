import { buildCompanyLogoFallbackHtml, buildCompanyLogoHtml } from './emailCompanyLogo'
import { buildCarrierAttentionUrl } from './carrierAttentionLink'
import type { Invoice } from '../types/invoice'
import type { Client } from '../types/client'

export { defaultPortalLink } from './carrierAttentionLink'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** One issue per line; leading bullets are stripped. */
export function parseIssueLines(issueList: string): string[] {
  return issueList
    .split(/\n/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
}

/** Outlook-safe list markup for carrier document-issue emails. */
export function buildIssueListHtml(issueList: string): string {
  const items = parseIssueLines(issueList)
  if (items.length === 0) {
    return `<p style="margin:0;font-size:14px;color:#64748b;">No items listed yet.</p>`
  }

  return items
    .map((item, index) => {
      const border = index === items.length - 1 ? 'none' : '1px solid #e2e8f0'
      return `<p style="margin:0;padding:8px 0;border-bottom:${border};font-size:14px;line-height:1.45;color:#0f172a;">
  <span style="display:inline-block;width:8px;height:8px;border-radius:99px;background-color:#1684FE;margin-right:8px;vertical-align:middle;"></span>
  ${escapeHtml(item)}
</p>`
    })
    .join('')
}

/** Optional note under the issue list (plain text → HTML). */
export function buildMessageHtml(message: string): string {
  const trimmed = message.trim()
  if (!trimmed) return ''
  return `<p style="margin:12px 0 0 0;font-size:14px;line-height:1.55;color:#475569;white-space:pre-wrap;">${escapeHtml(trimmed)}</p>`
}

export function previewCompanyLogoHtml(): string {
  if (typeof window !== 'undefined') {
    return buildCompanyLogoHtml({ origin: window.location.origin, width: 168 })
  }
  return buildCompanyLogoFallbackHtml()
}

export interface CarrierIssueEmailFields {
  contactName: string
  clientName: string
  invoiceNumber: string
  loadNumber: string
  brokerName: string
  issueList: string
  message: string
  portalLink: string
  ctaLabel: string
}

export function sampleCarrierIssueFields(): CarrierIssueEmailFields {
  return {
    contactName: 'Alex',
    clientName: 'Northline Transport',
    invoiceNumber: 'INV-10428',
    loadNumber: 'LD-8831',
    brokerName: 'Summit Freight Brokers',
    issueList: 'Signed POD (delivery copy)\nRate confirmation matching load LD-8831\nClearer BOL photo — last page is cut off',
    message: 'Reply to this email if a document was already sent and we should re-check the packet.',
    portalLink: buildCarrierAttentionUrl({
      id: 'sample',
      invoice_number: 'INV-10428',
    }),
    ctaLabel: 'Upload documents',
  }
}

export function fieldsFromInvoice(
  invoice: Invoice,
  client?: Client | null
): CarrierIssueEmailFields {
  const hold = invoice.hold_reason?.trim()
  return {
    contactName: client?.contact_person?.trim() || 'there',
    clientName: client?.name || invoice.client_name || 'Carrier',
    invoiceNumber: invoice.invoice_number || '',
    loadNumber: invoice.load_number || 'N/A',
    brokerName: invoice.broker_name || 'the broker',
    issueList: hold || 'Missing or unclear paperwork',
    message: '',
    portalLink: buildCarrierAttentionUrl(invoice),
    ctaLabel: 'Upload documents',
  }
}

/** Template data map passed to send-email / local preview. */
export function toTemplateData(fields: CarrierIssueEmailFields): Record<string, string> {
  return {
    contactName: fields.contactName,
    clientName: fields.clientName,
    invoiceNumber: fields.invoiceNumber,
    loadNumber: fields.loadNumber,
    brokerName: fields.brokerName,
    issueList: fields.issueList,
    message: fields.message,
    portalLink: fields.portalLink,
    ctaLabel: fields.ctaLabel,
    companyLogoHtml: previewCompanyLogoHtml(),
  }
}
