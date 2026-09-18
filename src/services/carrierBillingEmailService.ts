import type { Client } from '../types/client'
import type { ClientBill } from '../types/billing'
import { formatCurrency } from '../utils/format'
import { escapeHtml } from '../utils/emailTemplateRender'
import {
  buildCompanyLogoFallbackHtml,
  buildInlineCompanyLogoHtml,
  loadCompanyLogoAttachment,
} from '../utils/emailCompanyLogo'
import { CARRIER_BILLING_INVOICE_BODY_HTML } from '../config/emailLayouts'
import { getEmailTemplate } from './emailTemplateService'
import { fileToEmailAttachment, sendTransactionalEmail } from './emailService'
import { getPeriodBilledInvoices, parseBillingPeriod, recordBillEmailSent } from './arBillingService'
import { generateCarrierBillingPdf } from '../utils/generateCarrierBillingPdf'

function periodLabelFromKey(period: string): string {
  const parsed = parseBillingPeriod(period)
  return new Date(parsed.year, parsed.month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function formatDueDateLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Email the issued Credyx invoice to the carrier.
 * Body stays short (amount + due date); full details go in the attached PDF.
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
  const dueDate = formatDueDateLabel(input.bill.due_at)

  const data: Record<string, string> = {
    companyLogoHtml: logo ? buildInlineCompanyLogoHtml() : buildCompanyLogoFallbackHtml(),
    contactName: input.client.contact_person || 'there',
    clientName: input.client.name,
    periodLabel: periodLabelFromKey(input.bill.period),
    amountDue: formatCurrency(input.bill.amount),
    dueDate,
    feeTermsLabel: input.feeTermsLabel,
    collectedVolume: formatCurrency(input.collectedVolume),
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
    // Prefer DB HTML only when it matches the slim template (no per-load tables).
    const dbHtml = row.body_html?.trim()
    if (
      dbHtml &&
      !dbHtml.includes('{{invoiceRowsHtml}}') &&
      !dbHtml.includes('{{lineItemsHtml}}')
    ) {
      html = dbHtml
    }
  } catch {
    /* built-in layout */
  }

  const attachments = logo ? [logo] : []
  try {
    const pdfFile = await generateCarrierBillingPdf({
      client: input.client,
      bill: input.bill,
      feeTermsLabel: input.feeTermsLabel,
      collectedVolume: input.collectedVolume,
      billedInvoices,
      paymentUrl: input.paymentUrl,
    })
    attachments.push(await fileToEmailAttachment(pdfFile, pdfFile.name))
  } catch (err) {
    console.warn('[sendCarrierBillingInvoiceEmail] PDF attach failed', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not generate invoice PDF',
    }
  }

  const result = await sendTransactionalEmail('client_invite', to, data, {
    attachments,
    overrideSubject: subject,
    overrideHtml: html,
  })
  if (!result.ok) {
    return { ok: false, error: result.error ?? 'Send failed' }
  }

  await recordBillEmailSent(input.bill.id, { to, paymentUrl: input.paymentUrl })
  return { ok: true }
}
