/**
 * Professional HTML layouts for Credyx transactional emails.
 * Table-based markup for Outlook / Gmail compatibility.
 */

/** Broker paperwork packet body (placeholders filled at send time). */
export const BROKER_PACKET_BODY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Document packet</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#0f172a;padding:22px 28px;">
              {{companyLogoHtml}}
              <p style="margin:14px 0 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">
                Document packet
              </p>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 8px 0;font-size:18px;font-weight:600;line-height:1.35;color:#0f172a;">
                Paperwork for invoice {{invoiceNumber}}
              </p>
              <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">
                Please find the attached documents for the load below. Retain this packet with your payment records.
              </p>
              {{partNoteHtml}}
            </td>
          </tr>

          <!-- Details card -->
          <tr>
            <td style="padding:16px 28px 8px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Invoice</p>
                    <p style="margin:4px 0 0 0;font-size:15px;font-weight:600;color:#0f172a;">{{invoiceNumber}}</p>
                  </td>
                  <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Load</p>
                    <p style="margin:4px 0 0 0;font-size:15px;font-weight:600;color:#0f172a;">{{loadNumber}}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Broker</p>
                    <p style="margin:4px 0 0 0;font-size:14px;color:#0f172a;">{{brokerName}}</p>
                  </td>
                  <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Carrier</p>
                    <p style="margin:4px 0 0 0;font-size:14px;color:#0f172a;">{{clientName}}</p>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:14px 16px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Attached documents</p>
                    <p style="margin:4px 0 0 0;font-size:13px;line-height:1.45;color:#334155;">{{documentList}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Payment callout -->
          <tr>
            <td style="padding:12px 28px 8px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fffbeb;border:1px solid #f59e0b;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#b45309;">
                      Payment instructions
                    </p>
                    <p style="margin:0;font-size:14px;line-height:1.5;color:#78350f;">
                      {{remittanceMessage}}
                    </p>
                    {{remittanceChangeNoteHtml}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Optional note -->
          <tr>
            <td style="padding:8px 28px 24px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#475569;">
              {{message}}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                This message and attachments are intended for the named broker. If you received this in error, please delete it and notify the sender.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

/** Bulk notice when a carrier’s remittance changes (no bank numbers in body). */
export const BROKER_REMITTANCE_UPDATED_BODY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Remittance update</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background-color:#0f172a;padding:22px 28px;">
              {{companyLogoHtml}}
              <p style="margin:14px 0 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">
                Remittance update
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 8px 0;font-size:18px;font-weight:600;line-height:1.35;color:#0f172a;">
                Remittance updated for {{carrierName}}
              </p>
              <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">
                Effective {{effectiveDate}}, this carrier’s remit-to details have changed. Please update your AP records and verify before processing payment.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 8px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fffbeb;border:1px solid #f59e0b;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0;font-size:14px;line-height:1.5;color:#78350f;">
                      Pay per the remit-to on future invoices from this carrier. Bank verification (voided check or bank letter) is attached when available. Send remittance advice to billing@credyx.net and ops@credyx.net. Credyx does not change payment instructions by email alone.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#475569;">
              {{message}}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                This message and attachments are intended for the named broker. If you received this in error, please delete it and notify the sender.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

/** Default copy for the carrier document-issue email (placeholders filled at send time). */
export const CARRIER_DOCUMENT_ISSUE_COPY = {
  eyebrow: 'Document issue',
  headline: 'Action needed on invoice {{invoiceNumber}}',
  intro:
    'Hi {{contactName}} — we reviewed the paperwork for load {{loadNumber}} and need the items below before we can invoice {{brokerName}}.',
  nextStep:
    'Upload the missing documents in your Credyx portal. We will verify them and keep this invoice moving.',
  ctaLabel: 'Upload documents',
  footer: 'Credyx · Paid on time',
}

export type CarrierDocumentIssueCopy = {
  eyebrow: string
  headline: string
  intro: string
  nextStep: string
  ctaLabel: string
  footer: string
}

/**
 * Branded carrier email layout. Table-based for Outlook / Gmail.
 * {{issueListHtml}}, {{messageHtml}}, {{companyLogoHtml}}, {{portalLink}} are filled at send time.
 */
export function buildCarrierDocumentIssueBodyHtml(
  copy: CarrierDocumentIssueCopy = CARRIER_DOCUMENT_ISSUE_COPY
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Document issue</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background-color:#0f172a;padding:22px 28px;">
              {{companyLogoHtml}}
              <p style="margin:14px 0 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">
                ${copy.eyebrow}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                ${copy.headline}
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                ${copy.intro}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 8px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1684FE;border-radius:8px;">
                <tr>
                  <td style="padding:16px 18px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0 0 10px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1684FE;">
                      What we need
                    </p>
                    {{issueListHtml}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 4px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#475569;">
              {{messageHtml}}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#334155;">
              ${copy.nextStep}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;">
              <a href="{{portalLink}}" style="display:inline-block;background-color:#1684FE;color:#ffffff;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px;">
                {{ctaLabel}}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">${copy.footer}</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                This message is intended for {{clientName}}. If you received it in error, please delete it and notify ops@credyx.net.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export const CARRIER_DOCUMENT_ISSUE_BODY_HTML = buildCarrierDocumentIssueBodyHtml()

/** Welcome email when a carrier account is activated (Settings → Email). */
export const CLIENT_WELCOME_BODY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Welcome to Credyx</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background-color:#0f172a;padding:22px 28px;">
              {{companyLogoHtml}}
              <p style="margin:14px 0 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">
                Welcome
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                Your Credyx account is active
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Hi {{contactName}} — {{clientName}} is set up in Credyx. Your back office is in one portal: submit paperwork, we verify and invoice brokers, and we keep you updated through paid on time.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 8px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Collection fee</p>
                    <p style="margin:4px 0 0 0;font-size:18px;font-weight:700;color:#1684FE;">{{feeTermsLabel}}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Website</p>
                    <p style="margin:4px 0 0 0;font-size:14px;color:#0f172a;"><a href="{{websiteUrl}}" style="color:#1684FE;text-decoration:none;">{{websiteUrl}}</a></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Credyx contact</p>
                    <p style="margin:4px 0 0 0;font-size:14px;color:#0f172a;"><a href="mailto:{{contactEmail}}" style="color:#1684FE;text-decoration:none;">{{contactEmail}}</a></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#334155;">
              Create your password on first sign-in, then use the portal anytime.
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;">
              <a href="{{setupLink}}" style="display:inline-block;background-color:#1684FE;color:#ffffff;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px;">
                {{ctaLabel}}
              </a>
              <p style="margin:14px 0 0 0;font-size:13px;line-height:1.5;color:#64748b;">
                Portal: <a href="{{portalLink}}" style="color:#1684FE;text-decoration:none;">{{portalLink}}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                If you did not expect this email, you can ignore it or write to {{contactEmail}}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

/** Monthly Credyx invoice emailed to the carrier with a payment link. */
export const CARRIER_BILLING_INVOICE_BODY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Credyx invoice</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background-color:#0f172a;padding:22px 28px;">
              {{companyLogoHtml}}
              <p style="margin:14px 0 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">
                Monthly invoice
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                Invoice for {{periodLabel}}
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Hi {{contactName}} — your Credyx invoice for {{clientName}} is ready. Full charge and load details are in the attached PDF.
              </p>
              {{messageHtml}}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 8px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                <tr>
                  <td style="padding:18px 16px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;width:50%;">
                    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Amount due</p>
                    <p style="margin:6px 0 0 0;font-size:26px;font-weight:700;color:#1684FE;">{{amountDue}}</p>
                  </td>
                  <td style="padding:18px 16px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;width:50%;">
                    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Pay by</p>
                    <p style="margin:6px 0 0 0;font-size:18px;font-weight:600;color:#0f172a;">{{dueDate}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;">
              <a href="{{paymentUrl}}" style="display:inline-block;background-color:#1684FE;color:#ffffff;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px;">
                {{ctaLabel}}
              </a>
              <p style="margin:14px 0 0 0;font-size:12px;line-height:1.5;color:#64748b;">
                A PDF invoice with the full breakdown is attached. If the button does not work, open: {{paymentUrl}}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                This invoice is for Credyx services. Questions: billing@credyx.net
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
