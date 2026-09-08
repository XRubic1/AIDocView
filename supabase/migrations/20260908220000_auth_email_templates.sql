-- Auth emails editable in Settings → Email (sent by auth-send-email hook).
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_audience_check;
ALTER TABLE email_templates ADD CONSTRAINT email_templates_audience_check
  CHECK (audience IN ('broker', 'carrier', 'admin', 'system', 'auth'));

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_signup',
  'Auth — confirm signup',
  'Supabase sends this when a carrier registers. Confirm email so they can sign in.',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, site_url, redirect_to, new_email, old_email',
  'Confirm your Credyx email',
  $html$<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  {{companyLogoHtml}}
  <p style="margin:16px 0 0 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Credyx</p>
  <h1 style="font-size:20px;margin:8px 0 12px;line-height:1.3;">Confirm your email</h1>
  <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">Hi {{contactName}}, thanks for creating a Credyx account for {{email}}. Confirm this address to finish signing up.</p>
  
  <p style="margin:24px 0 0 0;"><a href="{{confirmation_url}}" style="display:inline-block;background:#1684FE;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Confirm email</a></p>
<p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">{{confirmation_url}}</p>
  <p style="margin:28px 0 0 0;font-size:13px;color:#64748b;">— The Credyx team<br/>A/R Solutions</p>
</div>$html$
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_invite',
  'Auth — invite',
  'Supabase user invite (accept invitation / set password).',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, site_url, redirect_to, new_email, old_email',
  'You’re invited to Credyx',
  $html$<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  {{companyLogoHtml}}
  <p style="margin:16px 0 0 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Credyx</p>
  <h1 style="font-size:20px;margin:8px 0 12px;line-height:1.3;">You’re invited</h1>
  <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">Hi {{contactName}}, you’ve been invited to the Credyx portal. Open the link below to accept and set your password.</p>
  
  <p style="margin:24px 0 0 0;"><a href="{{confirmation_url}}" style="display:inline-block;background:#1684FE;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Accept invitation</a></p>
<p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">{{confirmation_url}}</p>
  <p style="margin:28px 0 0 0;font-size:13px;color:#64748b;">— The Credyx team<br/>A/R Solutions</p>
</div>$html$
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_magiclink',
  'Auth — magic link',
  'Passwordless sign-in link from Supabase.',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, site_url, redirect_to, new_email, old_email',
  'Your Credyx sign-in link',
  $html$<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  {{companyLogoHtml}}
  <p style="margin:16px 0 0 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Credyx</p>
  <h1 style="font-size:20px;margin:8px 0 12px;line-height:1.3;">Sign in to Credyx</h1>
  <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">Hi {{contactName}}, use this one-time link to sign in. It expires shortly.</p>
  
  <p style="margin:24px 0 0 0;"><a href="{{confirmation_url}}" style="display:inline-block;background:#1684FE;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Sign in</a></p>
<p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">{{confirmation_url}}</p>
  <p style="margin:28px 0 0 0;font-size:13px;color:#64748b;">— The Credyx team<br/>A/R Solutions</p>
</div>$html$
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_recovery',
  'Auth — password reset',
  'Sent when someone requests a password reset (Forgot password).',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, site_url, redirect_to, new_email, old_email',
  'Reset your Credyx password',
  $html$<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  {{companyLogoHtml}}
  <p style="margin:16px 0 0 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Credyx</p>
  <h1 style="font-size:20px;margin:8px 0 12px;line-height:1.3;">Reset your password</h1>
  <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">Hi {{contactName}}, we received a request to reset the password for {{email}}. If you didn’t ask for this, you can ignore this email.</p>
  
  <p style="margin:24px 0 0 0;"><a href="{{confirmation_url}}" style="display:inline-block;background:#1684FE;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Choose a new password</a></p>
<p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">{{confirmation_url}}</p>
  <p style="margin:28px 0 0 0;font-size:13px;color:#64748b;">— The Credyx team<br/>A/R Solutions</p>
</div>$html$
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_email_change',
  'Auth — confirm email change',
  'Confirm a new email address (and current address when secure email change is on).',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, site_url, redirect_to, new_email, old_email',
  'Confirm your Credyx email change',
  $html$<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  {{companyLogoHtml}}
  <p style="margin:16px 0 0 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Credyx</p>
  <h1 style="font-size:20px;margin:8px 0 12px;line-height:1.3;">Confirm email change</h1>
  <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">Hi {{contactName}}, confirm this change for {{email}}. New address: {{new_email}}.</p>
  
  <p style="margin:24px 0 0 0;"><a href="{{confirmation_url}}" style="display:inline-block;background:#1684FE;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Confirm email change</a></p>
<p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">{{confirmation_url}}</p>
  <p style="margin:28px 0 0 0;font-size:13px;color:#64748b;">— The Credyx team<br/>A/R Solutions</p>
</div>$html$
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_email_otp',
  'Auth — email code',
  'One-time code (OTP) when Supabase sends type “email”.',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, site_url, redirect_to, new_email, old_email',
  'Your Credyx code: {{token}}',
  $html$<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  {{companyLogoHtml}}
  <p style="margin:16px 0 0 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Credyx</p>
  <h1 style="font-size:20px;margin:8px 0 12px;line-height:1.3;">Your verification code</h1>
  <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">Hi {{contactName}}, use this code to continue. It expires shortly.</p>
  <p style="margin:16px 0 0 0;font-size:28px;letter-spacing:0.2em;font-weight:700;color:#0f172a;">{{token}}</p>
  
  <p style="margin:28px 0 0 0;font-size:13px;color:#64748b;">— The Credyx team<br/>A/R Solutions</p>
</div>$html$
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_reauthentication',
  'Auth — reauthentication code',
  'Code to confirm a sensitive action (change password while signed in, etc.).',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, site_url, redirect_to, new_email, old_email',
  'Your Credyx verification code: {{token}}',
  $html$<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  {{companyLogoHtml}}
  <p style="margin:16px 0 0 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Credyx</p>
  <h1 style="font-size:20px;margin:8px 0 12px;line-height:1.3;">Verify it’s you</h1>
  <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">Hi {{contactName}}, use this code to confirm this action. It expires shortly.</p>
  <p style="margin:16px 0 0 0;font-size:28px;letter-spacing:0.2em;font-weight:700;color:#0f172a;">{{token}}</p>
  
  <p style="margin:28px 0 0 0;font-size:13px;color:#64748b;">— The Credyx team<br/>A/R Solutions</p>
</div>$html$
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_password_changed',
  'Auth — password changed',
  'Notice after the account password was changed.',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, site_url, redirect_to, new_email, old_email',
  'Your Credyx password was changed',
  $html$<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  {{companyLogoHtml}}
  <p style="margin:16px 0 0 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Credyx</p>
  <h1 style="font-size:20px;margin:8px 0 12px;line-height:1.3;">Password changed</h1>
  <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">Hi {{contactName}}, the password for {{email}} was just changed. If this wasn’t you, reset your password right away and contact Credyx.</p>
  
  
  <p style="margin:28px 0 0 0;font-size:13px;color:#64748b;">— The Credyx team<br/>A/R Solutions</p>
</div>$html$
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_email_changed',
  'Auth — email changed',
  'Notice after the account email was changed.',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, site_url, redirect_to, new_email, old_email',
  'Your Credyx email was changed',
  $html$<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  {{companyLogoHtml}}
  <p style="margin:16px 0 0 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Credyx</p>
  <h1 style="font-size:20px;margin:8px 0 12px;line-height:1.3;">Email changed</h1>
  <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">Hi {{contactName}}, the email on this Credyx account was changed from {{old_email}} to {{new_email}}. If this wasn’t you, contact Credyx.</p>
  
  
  <p style="margin:28px 0 0 0;font-size:13px;color:#64748b;">— The Credyx team<br/>A/R Solutions</p>
</div>$html$
)
ON CONFLICT (id) DO NOTHING;

