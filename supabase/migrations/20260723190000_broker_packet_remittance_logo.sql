-- Refresh broker_packet defaults: load number, company logo, remittance message.
UPDATE email_templates
SET
  placeholders = 'companyLogoHtml, invoiceNumber, loadNumber, brokerName, clientName, documentList, remittanceMessage, message',
  subject = 'Document packet — {{invoiceNumber}} · Load {{loadNumber}}',
  body_html = $html${{companyLogoHtml}}
<p>Please find attached documents for invoice <strong>{{invoiceNumber}}</strong> (Load <strong>{{loadNumber}}</strong>).</p>
<p>Broker: {{brokerName}} · Carrier: {{clientName}}</p>
<p>Documents: {{documentList}}</p>
<p><strong>Payment:</strong> {{remittanceMessage}}</p>
<p>{{message}}</p>$html$,
  updated_at = now()
WHERE id = 'broker_packet';
