-- Carrier monthly billing: optional $99, payment URL, send/resend tracking.

ALTER TABLE client_bills
  ADD COLUMN IF NOT EXISTS include_app_fee BOOLEAN,
  ADD COLUMN IF NOT EXISTS payment_url TEXT,
  ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emailed_to TEXT,
  ADD COLUMN IF NOT EXISTS email_send_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN client_bills.include_app_fee IS 'Whether the $99 platform fee was included on this issued bill.';
COMMENT ON COLUMN client_bills.payment_url IS 'Admin-entered URL sent to the carrier to pay the Credyx invoice.';

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'carrier_billing_invoice',
  'Carrier — monthly invoice',
  'Sent from Billing with the period charges, collected loads, and a payment URL you enter.',
  'carrier',
  'companyLogoHtml, contactName, clientName, periodLabel, amountDue, dueDate, feeTermsLabel, collectedVolume, lineItemsHtml, invoiceRowsHtml, paymentUrl, ctaLabel, messageHtml',
  'Credyx invoice — {{periodLabel}} · {{amountDue}}',
  $html$<p>Hi {{contactName}},</p>
<p>Credyx invoice for <strong>{{clientName}}</strong> — {{periodLabel}}.</p>
<p>Amount due: <strong>{{amountDue}}</strong> (due {{dueDate}}).</p>
{{lineItemsHtml}}
{{invoiceRowsHtml}}
{{messageHtml}}
<p><a href="{{paymentUrl}}">{{ctaLabel}}</a></p>$html$
)
ON CONFLICT (id) DO NOTHING;
