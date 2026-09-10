import type { Client } from '../types/client'
import type { ClientBill, PeriodBilledInvoice } from '../types/billing'
import { formatCurrency } from '../utils/format'
import { escapeHtml } from '../utils/emailTemplateRender'
import {
  buildCompanyLogoFallbackHtml,
  buildInlineCompanyLogoHtml,
  loadCompanyLogoAttachment,
} from '../utils/emailCompanyLogo'
import { CARRIER_BILLING_INVOICE_BODY_HTML } from '../config/emailLayouts'
import { getEmailTemplate } from './emailTemplateService'
import { sendTransactionalEmail } from './emailService'
import { getPeriodBilledInvoices, parseBillingPeriod, recordBillEmailSent } from './arBillingService'

function lineItemsHtml(bill: ClientBill): string {
  if (bill.line_items.length === 0) {
    return `<p style="margin:0;font-size:13px;color:#64748b;">No charges.</p>`
  }
  const rows = bill.line_items
    .map(
      (li) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;">${escapeHtml(li.description)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:600;text-align:right;color:${li.amount < 0 ? '#047857' : '#0f172a'};">${escapeHtml(formatCurrency(li.amount))}</td>
</tr>`
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`
}

function invoiceRowsHtml(rows: PeriodBilledInvoice[]): string {
  if (rows.length === 0) {
    return `<p style="margin:0;font-size:13px;color:#64748b;">No loads collected or closed this period.</p>`
  }
  const body = rows
    .map((row) => {
      const mark = row.closedByCredyx ? 'Closed by Credyx' : 'Paid'
      const load = row.loadNumber ? ` · Load ${row.loadNumber}` : ''
      return `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;">${escapeHtml(row.invoiceNumber)}${escapeHtml(load)}<br/><span style="font-size:12px;color:#64748b;">${escapeHtml(row.brokerName)} · ${escapeHtml(mark)}</span></td>
  <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;color:#0f172a;">${escapeHtml(formatCurrency(row.collectedAmount || row.invoiceAmount))}</td>
</tr>`
    })
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>`
}

function periodLabelFromKey(period: string): string {
  const parsed = parseBillingPeriod(period)
  return new Date(parsed.year, parsed.month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Email the issued Credyx invoice to the carrier with an admin-entered payment URL.
 */
export async function sendCarrierBillingInvoiceEmail(input: {
  client: Client
  bill: ClientBill
  to: string
  paymentUrl: string
  collectedVolume: number
  feeTermsLabel: string
  message?: string
}): Promise<{ ok: boolean; error?: string }> {
  const to = input.to.trim()
  if (!to || !to.includes('@')) {
    return { ok: false, error: 'Enter a valid carrier email' }
  }

  const logo = await loadCompanyLogoAttachment()
  const billedInvoices = getPeriodBilledInvoices(
    input.client.id,
    parseBillingPeriod(input.bill.period)
  )
  const message = input.message?.trim()
  const data: Record<string, string> = {
    companyLogoHtml: logo ? buildInlineCompanyLogoHtml() : buildCompanyLogoFallbackHtml(),
    contactName: input.client.contact_person || 'there',
    clientName: input.client.name,
    periodLabel: periodLabelFromKey(input.bill.period),
    amountDue: formatCurrency(input.bill.amount),
    dueDate: input.bill.due_at.slice(0, 10),
    feeTermsLabel: input.feeTermsLabel,
    collectedVolume: formatCurrency(input.collectedVolume),
    lineItemsHtml: lineItemsHtml(input.bill),
    invoiceRowsHtml: invoiceRowsHtml(billedInvoices),
    paymentUrl: input.paymentUrl,
    ctaLabel: 'Pay invoice',
    messageHtml: message
      ? `<p style="margin:12px 0 0 0;font-size:14px;line-height:1.55;color:#475569;white-space:pre-wrap;">${escapeHtml(message)}</p>`
      : '',
  }

  // Use client_invite as the wire template so older send-email deploys accept the
  // request; subject/HTML are always the Credyx billing invoice layout.
  let subject = 'Credyx invoice — {{periodLabel}} · {{amountDue}}'
  let html = CARRIER_BILLING_INVOICE_BODY_HTML
  try {
    const row = await getEmailTemplate('carrier_billing_invoice')
    if (row.subject) subject = row.subject
    if (row.body_html) html = row.body_html
  } catch {
    /* built-in layout */
  }

  const result = await sendTransactionalEmail('client_invite', to, data, {
    attachments: logo ? [logo] : undefined,
    overrideSubject: subject,
    overrideHtml: html,
  })
  if (!result.ok) {
    return { ok: false, error: result.error ?? 'Send failed' }
  }

  await recordBillEmailSent(input.bill.id, { to, paymentUrl: input.paymentUrl })
  return { ok: true }
}
