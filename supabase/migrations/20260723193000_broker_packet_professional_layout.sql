-- Professional broker packet email layout
UPDATE email_templates
SET body_html = $html$<!DOCTYPE html>
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
</html>$html$,
    updated_at = now()
WHERE id = 'broker_packet';

