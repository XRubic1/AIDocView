-- Client welcome template (Settings → Email). Do not overwrite a customized body.

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'client_invite',
  'Client welcome',
  'Sent when admin activates a carrier or clicks Send welcome. Includes fee %, website, Credyx contact, and password setup.',
  'carrier',
  'contactName, clientName, feeTermsLabel, feePercentage, websiteUrl, portalLink, contactEmail, setupLink, inviteLink, ctaLabel, companyLogoHtml',
  'Welcome to Credyx — your account is active',
  $html$<p>Hi {{contactName}},</p>
<p>Your Credyx account for <strong>{{clientName}}</strong> is active.</p>
<p>Collection fee: <strong>{{feeTermsLabel}}</strong></p>
<p>Website: <a href="{{websiteUrl}}">{{websiteUrl}}</a></p>
<p>Questions: <a href="mailto:{{contactEmail}}">{{contactEmail}}</a></p>
<p><a href="{{setupLink}}">{{ctaLabel}}</a></p>
<p>Portal: <a href="{{portalLink}}">{{portalLink}}</a></p>
<p>Credyx · Paid on time</p>$html$
)
ON CONFLICT (id) DO NOTHING;

UPDATE email_templates
SET
  subject = 'Welcome to Credyx — your account is active',
  body_html = $html$<p>Hi {{contactName}},</p>
<p>Your Credyx account for <strong>{{clientName}}</strong> is active.</p>
<p>Collection fee: <strong>{{feeTermsLabel}}</strong></p>
<p>Website: <a href="{{websiteUrl}}">{{websiteUrl}}</a></p>
<p>Questions: <a href="mailto:{{contactEmail}}">{{contactEmail}}</a></p>
<p><a href="{{setupLink}}">{{ctaLabel}}</a></p>
<p>Portal: <a href="{{portalLink}}">{{portalLink}}</a></p>
<p>Credyx · Paid on time</p>$html$
WHERE id = 'client_invite'
  AND body_html LIKE '%Set your password and sign in%';

UPDATE email_templates
SET
  name = 'Client welcome',
  description = 'Sent when admin activates a carrier or clicks Send welcome. Includes fee %, website, Credyx contact, and password setup.',
  placeholders = 'contactName, clientName, feeTermsLabel, feePercentage, websiteUrl, portalLink, contactEmail, setupLink, inviteLink, ctaLabel, companyLogoHtml'
WHERE id = 'client_invite';
