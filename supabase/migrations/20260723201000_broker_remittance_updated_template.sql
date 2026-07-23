-- Seed broker_remittance_updated template (upsert keeps admin edits if already present).
INSERT INTO public.email_templates (id, name, description, audience, placeholders, subject, body_html, updated_at)
VALUES (
  'broker_remittance_updated',
  'Broker — remittance updated',
  'Bulk notice to brokers when a carrier’s remit-to changes. Attach voided check / bank letter; do not put account numbers in the body.',
  'broker',
  'companyLogoHtml, carrierName, effectiveDate, message, brokerName',
  'Remittance updated — {{carrierName}}',
  $html$<!DOCTYPE html>
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
</html>$html$,
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Refresh broker_packet placeholders to include remittanceChangeNoteHtml (keep existing body if customized).
UPDATE public.email_templates
SET placeholders = 'companyLogoHtml, invoiceNumber, loadNumber, brokerName, clientName, documentList, remittanceMessage, remittanceChangeNoteHtml, message, partSuffix, partNoteHtml',
    updated_at = now()
WHERE id = 'broker_packet';
