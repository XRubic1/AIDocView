-- Welcome email sent to carriers when they join the waitlist.
INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'waitlist_welcome',
  'Waitlist — thank you',
  'Sent automatically to the carrier when they join the Credyx waitlist.',
  'carrier',
  'contactName, companyName',
  'You''re on the Credyx waitlist',
  $html$<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  <p>Hi {{contactName}},</p>
  <p>Thank you for joining the <strong>Credyx</strong> waitlist for <strong>{{companyName}}</strong>.</p>
  <p>Founding access is reserved — we&apos;ll reach out when onboarding opens and keep you updated on next steps.</p>
  <p style="color:#475569;font-size:14px;">Your back office, in one portal. Paid on time.</p>
  <p style="margin-top:24px;">— The Credyx team<br/><span style="color:#64748b;font-size:13px;">Credyx A/R Solutions</span></p>
</div>$html$
)
ON CONFLICT (id) DO NOTHING;
