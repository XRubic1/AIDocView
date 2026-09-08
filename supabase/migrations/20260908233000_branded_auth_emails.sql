-- Branded Credyx layout for Auth emails (navy header, blue CTA, OTP box).
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_audience_check;
ALTER TABLE email_templates ADD CONSTRAINT email_templates_audience_check
  CHECK (audience IN ('broker', 'carrier', 'admin', 'system', 'auth'));

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_signup',
  'Auth — confirm signup',
  'Supabase sends this when a carrier registers. Confirm email so they can sign in.',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, ctaHtml, otpHtml, site_url, redirect_to, new_email, old_email',
  $b0subj$Confirm your Credyx email$b0subj$,
  $b0html$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Confirm your email</title>
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
                Account
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                Confirm your email
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Hi {{contactName}}, thanks for creating a Credyx account for {{email}}. Confirm this address to finish signing up.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              {{ctaHtml}}
              {{otpHtml}}
              
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                A/R Solutions. If you didn’t request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$b0html$
)
ON CONFLICT (id) DO UPDATE SET
  placeholders = EXCLUDED.placeholders,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_invite',
  'Auth — invite',
  'Supabase user invite (accept invitation / set password).',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, ctaHtml, otpHtml, site_url, redirect_to, new_email, old_email',
  $b1subj$You’re invited to Credyx$b1subj$,
  $b1html$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>You’re invited</title>
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
                Invitation
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                You’re invited
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Hi {{contactName}}, you’ve been invited to the Credyx portal. Open the button below to accept and set your password.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              {{ctaHtml}}
              {{otpHtml}}
              
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                A/R Solutions. If you didn’t request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$b1html$
)
ON CONFLICT (id) DO UPDATE SET
  placeholders = EXCLUDED.placeholders,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_magiclink',
  'Auth — magic link',
  'Passwordless sign-in link from Supabase.',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, ctaHtml, otpHtml, site_url, redirect_to, new_email, old_email',
  $b2subj$Your Credyx sign-in link$b2subj$,
  $b2html$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in to Credyx</title>
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
                Sign in
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                Sign in to Credyx
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Hi {{contactName}}, use this one-time link to sign in. It expires shortly.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              {{ctaHtml}}
              {{otpHtml}}
              
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                A/R Solutions. If you didn’t request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$b2html$
)
ON CONFLICT (id) DO UPDATE SET
  placeholders = EXCLUDED.placeholders,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_recovery',
  'Auth — password reset',
  'Sent when someone requests a password reset (Forgot password).',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, ctaHtml, otpHtml, site_url, redirect_to, new_email, old_email',
  $b3subj$Reset your Credyx password$b3subj$,
  $b3html$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Reset your password</title>
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
                Password
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                Reset your password
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Hi {{contactName}}, we received a request to reset the password for {{email}}. If you didn’t ask for this, you can ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              {{ctaHtml}}
              {{otpHtml}}
              
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                A/R Solutions. If you didn’t request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$b3html$
)
ON CONFLICT (id) DO UPDATE SET
  placeholders = EXCLUDED.placeholders,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_email_change',
  'Auth — confirm email change',
  'Confirm a new email address (and current address when secure email change is on).',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, ctaHtml, otpHtml, site_url, redirect_to, new_email, old_email',
  $b4subj$Confirm your Credyx email change$b4subj$,
  $b4html$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Confirm email change</title>
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
                Account
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                Confirm email change
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Hi {{contactName}}, confirm this change for {{email}}. New address: {{new_email}}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              {{ctaHtml}}
              {{otpHtml}}
              
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                A/R Solutions. If you didn’t request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$b4html$
)
ON CONFLICT (id) DO UPDATE SET
  placeholders = EXCLUDED.placeholders,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_email_otp',
  'Auth — email code',
  'One-time code (OTP) when Supabase sends type “email”.',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, ctaHtml, otpHtml, site_url, redirect_to, new_email, old_email',
  $b5subj$Your Credyx code: {{token}}$b5subj$,
  $b5html$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your verification code</title>
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
                Verification
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                Your verification code
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Hi {{contactName}}, use this code to continue. It expires shortly.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              {{ctaHtml}}
              {{otpHtml}}
              
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                A/R Solutions. If you didn’t request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$b5html$
)
ON CONFLICT (id) DO UPDATE SET
  placeholders = EXCLUDED.placeholders,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_reauthentication',
  'Auth — reauthentication code',
  'Code to confirm a sensitive action (change password while signed in, etc.).',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, ctaHtml, otpHtml, site_url, redirect_to, new_email, old_email',
  $b6subj$Your Credyx verification code: {{token}}$b6subj$,
  $b6html$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Verify it’s you</title>
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
                Verification
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                Verify it’s you
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Hi {{contactName}}, use this code to confirm this action. It expires shortly.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              {{ctaHtml}}
              {{otpHtml}}
              
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                A/R Solutions. If you didn’t request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$b6html$
)
ON CONFLICT (id) DO UPDATE SET
  placeholders = EXCLUDED.placeholders,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_password_changed',
  'Auth — password changed',
  'Notice after the account password was changed.',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, ctaHtml, otpHtml, site_url, redirect_to, new_email, old_email',
  $b7subj$Your Credyx password was changed$b7subj$,
  $b7html$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Password changed</title>
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
                Security
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                Password changed
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Hi {{contactName}}, the password for {{email}} was just changed. If this wasn’t you, reset your password right away and contact Credyx.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              {{ctaHtml}}
              {{otpHtml}}
              
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                A/R Solutions. If you didn’t request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$b7html$
)
ON CONFLICT (id) DO UPDATE SET
  placeholders = EXCLUDED.placeholders,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html;

INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'auth_email_changed',
  'Auth — email changed',
  'Notice after the account email was changed.',
  'auth',
  'companyLogoHtml, contactName, email, confirmation_url, token, ctaHtml, otpHtml, site_url, redirect_to, new_email, old_email',
  $b8subj$Your Credyx email was changed$b8subj$,
  $b8html$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Email changed</title>
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
                Security
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                Email changed
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Hi {{contactName}}, the email on this Credyx account was changed from {{old_email}} to {{new_email}}. If this wasn’t you, contact Credyx.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              {{ctaHtml}}
              {{otpHtml}}
              
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">
                A/R Solutions. If you didn’t request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$b8html$
)
ON CONFLICT (id) DO UPDATE SET
  placeholders = EXCLUDED.placeholders,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html;
