/**
 * Shared HTML pieces for Credyx Auth emails (signup, reset, OTP, etc.).
 * Table layout for Outlook / Gmail. Placeholders filled at send time.
 */

export const AUTH_EMAIL_PLACEHOLDERS =
  'companyLogoHtml, contactName, email, confirmation_url, token, ctaHtml, otpHtml, site_url, redirect_to, new_email, old_email'

export const AUTH_CTA_LABELS: Record<string, string> = {
  auth_signup: 'Confirm email',
  auth_invite: 'Accept invitation',
  auth_magiclink: 'Sign in',
  auth_recovery: 'Choose a new password',
  auth_email_change: 'Confirm email change',
  auth_email_otp: 'Continue',
  auth_reauthentication: 'Continue',
}

/** Navy-header wordmark when no hosted logo is available. */
export function authWordmarkHtml(): string {
  return `<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:0.02em;line-height:1;">
  <span style="color:#ffffff;">Cred</span><span style="color:#1684FE;">yx</span>
</div>`
}

/** Blue button + muted fallback URL. Empty when there is no link. */
export function buildAuthCtaHtml(url: string | undefined, label: string): string {
  const href = (url ?? '').trim()
  if (!href || !label) return ''
  const safeHref = escapeAttr(href)
  const safeLabel = escapeAttr(label)
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px 0;">
  <tr>
    <td align="left" style="border-radius:8px;background-color:#1684FE;">
      <a href="${safeHref}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${safeLabel}</a>
    </td>
  </tr>
</table>
<p style="margin:12px 0 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">
  Or paste this link:<br/>${escapeAttr(href)}
</p>`
}

/** Large code box. Empty when there is no OTP. */
export function buildAuthOtpHtml(token: string | undefined): string {
  const code = (token ?? '').trim()
  if (!code) return ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 4px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
  <tr>
    <td style="padding:20px 18px;text-align:center;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;">Your verification code</p>
      <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:0.28em;color:#0f172a;font-family:Consolas,Courier New,monospace;">${escapeAttr(code)}</p>
    </td>
  </tr>
</table>`
}

export function enrichAuthEmailFields(
  templateId: string,
  data: Record<string, string>,
  logoHtml?: string
): Record<string, string> {
  const next = { ...data }
  if (!next.companyLogoHtml) next.companyLogoHtml = logoHtml || authWordmarkHtml()
  const label = AUTH_CTA_LABELS[templateId] ?? ''
  next.ctaHtml = buildAuthCtaHtml(next.confirmation_url, label)
  next.otpHtml = buildAuthOtpHtml(next.token)
  if (!next.contactName) next.contactName = 'there'
  return next
}

/**
 * Branded Auth email shell. {{companyLogoHtml}}, {{ctaHtml}}, {{otpHtml}} filled at send time.
 */
export function buildAuthEmailBodyHtml(opts: {
  eyebrow: string
  headline: string
  intro: string
  extraHtml?: string
}): string {
  const extra = opts.extraHtml ?? ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeAttr(opts.headline)}</title>
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
                ${escapeAttr(opts.eyebrow)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">
                ${escapeAttr(opts.headline)}
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                ${opts.intro}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              {{ctaHtml}}
              {{otpHtml}}
              ${extra}
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
</html>`
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
