-- Carrier document-issue email template (admin-editable; send-email reads email_templates).
INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'carrier_document_issue',
  'Carrier — document issue',
  'Sent from the admin dashboard when paperwork is missing or unclear. Edit the layout here; fill issues when sending.',
  'carrier',
  'companyLogoHtml, contactName, clientName, invoiceNumber, loadNumber, brokerName, issueList, issueListHtml, message, messageHtml, portalLink, ctaLabel',
  'Action needed — invoice {{invoiceNumber}} · Load {{loadNumber}}',
  $html$<p>Hi {{contactName}},</p>
<p>We need the items below for invoice {{invoiceNumber}} (load {{loadNumber}}).</p>
{{issueListHtml}}
{{messageHtml}}
<p><a href="{{portalLink}}">{{ctaLabel}}</a></p>$html$
)
ON CONFLICT (id) DO NOTHING;
