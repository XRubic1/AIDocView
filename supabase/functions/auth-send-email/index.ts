/**
 * Supabase Auth Send Email Hook (must stay under Auth’s ~5s timeout).
 * No heavy esm.sh clients — REST + Resend fetch only.
 *
 * Deploy: npx.cmd supabase functions deploy auth-send-email --no-verify-jwt --project-ref ptjwykrnwejrwslmqzcz
 * Hook URL: https://<ref>.supabase.co/functions/v1/auth-send-email
 * Secrets: SEND_EMAIL_HOOK_SECRET, RESEND_API_KEY
 */
const AUTH_ACTION_TO_TEMPLATE: Record<string, string> = {
  signup: 'auth_signup',
  invite: 'auth_invite',
  magiclink: 'auth_magiclink',
  recovery: 'auth_recovery',
  email_change: 'auth_email_change',
  email: 'auth_email_otp',
  reauthentication: 'auth_reauthentication',
  password_changed_notification: 'auth_password_changed',
  email_changed_notification: 'auth_email_changed',
}

type AuthUser = {
  email?: string
  new_email?: string
  user_metadata?: Record<string, unknown>
}

type AuthEmailData = {
  token?: string
  token_hash?: string
  token_new?: string
  token_hash_new?: string
  redirect_to?: string
  email_action_type?: string
  site_url?: string
  old_email?: string
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderTemplateString(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const raw = data[key] ?? ''
    if (key.endsWith('Html') || key === 'confirmation_url' || key === 'inviteLink') return raw
    return escapeHtml(raw)
  })
}

function contactName(user: AuthUser): string {
  const meta = user.user_metadata ?? {}
  const fromMeta = [meta.contact_name, meta.full_name, meta.name].find(
    (v) => typeof v === 'string' && v.trim()
  ) as string | undefined
  if (fromMeta?.trim()) return fromMeta.trim()
  return (user.email ?? '').split('@')[0] || 'there'
}

function confirmationUrl(tokenHash: string, type: string, redirectTo: string, siteUrl: string): string {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '')
  const base = supabaseUrl || (siteUrl || '').replace(/\/$/, '')
  // Prefer app origin for redirect so recovery lands on setup-password, not the API host.
  const site = (Deno.env.get('SITE_URL') || siteUrl || '').replace(/\/$/, '')
  const safeRedirect =
    redirectTo?.trim() ||
    (site ? `${site}/client/setup-password` : base)
  const params = new URLSearchParams({
    token: tokenHash,
    type,
    redirect_to: safeRedirect,
  })
  return `${base}/auth/v1/verify?${params.toString()}`
}

const AUTH_CTA_LABELS: Record<string, string> = {
  auth_signup: 'Confirm email',
  auth_invite: 'Accept invitation',
  auth_magiclink: 'Sign in',
  auth_recovery: 'Choose a new password',
  auth_email_change: 'Confirm email change',
  auth_email_otp: 'Continue',
  auth_reauthentication: 'Continue',
}

const AUTH_FALLBACK: Record<string, { subject: string; eyebrow: string; headline: string; intro: string }> = {
  auth_signup: {
    subject: 'Confirm your Credyx email',
    eyebrow: 'Account',
    headline: 'Confirm your email',
    intro:
      'Hi {{contactName}}, thanks for creating a Credyx account for {{email}}. Confirm this address to finish signing up.',
  },
  auth_invite: {
    subject: 'You’re invited to Credyx',
    eyebrow: 'Invitation',
    headline: 'You’re invited',
    intro:
      'Hi {{contactName}}, you’ve been invited to the Credyx portal. Open the button below to accept and set your password.',
  },
  auth_magiclink: {
    subject: 'Your Credyx sign-in link',
    eyebrow: 'Sign in',
    headline: 'Sign in to Credyx',
    intro: 'Hi {{contactName}}, use this one-time link to sign in. It expires shortly.',
  },
  auth_recovery: {
    subject: 'Reset your Credyx password',
    eyebrow: 'Password',
    headline: 'Reset your password',
    intro:
      'Hi {{contactName}}, we received a request to reset the password for {{email}}. If you didn’t ask for this, you can ignore this email.',
  },
  auth_email_change: {
    subject: 'Confirm your Credyx email change',
    eyebrow: 'Account',
    headline: 'Confirm email change',
    intro: 'Hi {{contactName}}, confirm this change for {{email}}. New address: {{new_email}}.',
  },
  auth_email_otp: {
    subject: 'Your Credyx code: {{token}}',
    eyebrow: 'Verification',
    headline: 'Your verification code',
    intro: 'Hi {{contactName}}, use this code to continue. It expires shortly.',
  },
  auth_reauthentication: {
    subject: 'Your Credyx verification code: {{token}}',
    eyebrow: 'Verification',
    headline: 'Verify it’s you',
    intro: 'Hi {{contactName}}, use this code to confirm this action. It expires shortly.',
  },
  auth_password_changed: {
    subject: 'Your Credyx password was changed',
    eyebrow: 'Security',
    headline: 'Password changed',
    intro:
      'Hi {{contactName}}, the password for {{email}} was just changed. If this wasn’t you, reset your password right away and contact Credyx.',
  },
  auth_email_changed: {
    subject: 'Your Credyx email was changed',
    eyebrow: 'Security',
    headline: 'Email changed',
    intro:
      'Hi {{contactName}}, the email on this Credyx account was changed from {{old_email}} to {{new_email}}. If this wasn’t you, contact Credyx.',
  },
}

function defaultLogoHtml(): string {
  // Hosted on the public site; SITE_URL (app host) may not serve static assets.
  const origin = (Deno.env.get('EMAIL_ASSET_ORIGIN') || 'https://credyx.net').replace(/\/$/, '')
  return `<img src="${origin}/credyx-logo-white-cred-no-bg.png" alt="Credyx" width="148" style="display:block;border:0;outline:none;text-decoration:none;max-width:148px;height:auto;" />`
}

function buildAuthCtaHtml(url: string, label: string): string {
  const href = url.trim()
  if (!href || !label) return ''
  const safeHref = escapeHtml(href)
  const safeLabel = escapeHtml(label)
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px 0;">
  <tr>
    <td align="left" style="border-radius:8px;background-color:#1684FE;">
      <a href="${safeHref}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${safeLabel}</a>
    </td>
  </tr>
</table>
<p style="margin:12px 0 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">
  Or paste this link:<br/>${safeHref}
</p>`
}

function buildAuthOtpHtml(token: string): string {
  const code = token.trim()
  if (!code) return ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 4px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
  <tr>
    <td style="padding:20px 18px;text-align:center;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;">Your verification code</p>
      <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:0.28em;color:#0f172a;font-family:Consolas,Courier New,monospace;">${escapeHtml(code)}</p>
    </td>
  </tr>
</table>`
}

function wrapAuthEmail(eyebrow: string, headline: string, intro: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background-color:#0f172a;padding:22px 28px;">
              {{companyLogoHtml}}
              <p style="margin:14px 0 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">${escapeHtml(eyebrow)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
              <p style="margin:0 0 10px 0;font-size:20px;font-weight:600;line-height:1.35;color:#0f172a;">${escapeHtml(headline)}</p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">${intro}</p>
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
              <p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">A/R Solutions. If you didn’t request this, you can ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function templateData(
  user: AuthUser,
  emailData: AuthEmailData,
  opts: { confirmation_url: string; token: string; email: string; templateId: string }
): Record<string, string> {
  const confirmation_url = opts.confirmation_url
  const token = opts.token
  return {
    companyLogoHtml: defaultLogoHtml(),
    contactName: contactName(user),
    email: opts.email,
    confirmation_url,
    token,
    ctaHtml: buildAuthCtaHtml(confirmation_url, AUTH_CTA_LABELS[opts.templateId] ?? ''),
    otpHtml: buildAuthOtpHtml(token),
    site_url: emailData.site_url ?? '',
    redirect_to: emailData.redirect_to ?? '',
    new_email: user.new_email ?? '',
    old_email: emailData.old_email ?? user.email ?? '',
  }
}

function fallbackEmail(templateId: string, data: Record<string, string>): { subject: string; html: string } {
  const copy = AUTH_FALLBACK[templateId] ?? AUTH_FALLBACK.auth_recovery
  return {
    subject: renderTemplateString(copy.subject, data),
    html: renderTemplateString(wrapAuthEmail(copy.eyebrow, copy.headline, copy.intro), data),
  }
}

/** Auth dashboard secret is `v1,whsec_<base64>`. */
function decodeHookSecret(raw: string): Uint8Array {
  const trimmed = raw.trim().replace(/^v1,/, '')
  const b64 = trimmed.startsWith('whsec_') ? trimmed.slice('whsec_'.length) : trimmed
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function verifyStandardWebhook(payload: string, headers: Headers, secretBytes: Uint8Array): Promise<void> {
  const id = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signatureHeader = headers.get('webhook-signature')
  if (!id || !timestamp || !signatureHeader) {
    throw new Error('Missing webhook signature headers')
  }

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) throw new Error('Invalid webhook timestamp')
  const skew = Math.abs(Date.now() / 1000 - ts)
  if (skew > 300) throw new Error('Webhook timestamp too old')

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const signed = encoder.encode(`${id}.${timestamp}.${payload}`)
  const expectedList = signatureHeader.split(' ').map((part) => part.trim()).filter(Boolean)

  for (const item of expectedList) {
    const sig = item.startsWith('v1,') ? item.slice(3) : item
    const sigBytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0))
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, signed)
    if (ok) return
  }
  throw new Error('Invalid webhook signature')
}

async function loadTemplate(id: string): Promise<{ subject: string; body_html: string } | null> {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return null
  try {
    const res = await fetch(
      `${url}/rest/v1/email_templates?id=eq.${encodeURIComponent(id)}&select=subject,body_html`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    )
    if (!res.ok) return null
    const rows = (await res.json()) as Array<{ subject?: string; body_html?: string }>
    const row = rows[0]
    if (row?.subject && row?.body_html) return { subject: row.subject, body_html: row.body_html }
  } catch (err) {
    console.warn('[auth-send-email] template load failed', err)
  }
  return null
}

async function sendResend(to: string, subject: string, html: string): Promise<void> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from =
    Deno.env.get('RESEND_FROM_CARRIER')?.trim() ||
    Deno.env.get('RESEND_FROM_EMAIL')?.trim() ||
    'Credyx <onboarding@resend.dev>'
  if (!resendKey) {
    throw new Error('RESEND_API_KEY is not set on auth-send-email')
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
  if (!res.ok) {
    throw new Error((await res.text()) || 'Resend rejected the send')
  }
}

async function sendAuthTemplate(templateId: string, to: string, data: Record<string, string>): Promise<void> {
  const row = await loadTemplate(templateId)
  const rendered = row
    ? {
        subject: renderTemplateString(row.subject, data),
        html: renderTemplateString(row.body_html, data),
      }
    : fallbackEmail(templateId, data)
  await sendResend(to, rendered.subject, rendered.html)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Content-Type': 'application/json' } })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: { message: 'not allowed' } }, 400)
  }

  console.log('[auth-send-email] invoked')

  const secretRaw = Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? ''
  if (!secretRaw) {
    return jsonResponse({ error: { message: 'SEND_EMAIL_HOOK_SECRET is not set' } }, 500)
  }

  const payload = await req.text()

  try {
    await verifyStandardWebhook(payload, req.headers, decodeHookSecret(secretRaw))
    const event = JSON.parse(payload) as {
      user?: AuthUser
      email_data?: AuthEmailData
      email?: AuthEmailData
    }
    const user = event.user ?? {}
    const emailData = event.email_data ?? event.email ?? {}
    const action = emailData.email_action_type ?? ''
    const templateId = AUTH_ACTION_TO_TEMPLATE[action]
    if (!templateId) {
      console.warn('[auth-send-email] unmapped action', action)
      return jsonResponse({})
    }

    const redirectTo = emailData.redirect_to ?? ''
    const siteUrl = emailData.site_url ?? ''

    if (action === 'email_change' && emailData.token_hash_new && user.email && user.new_email) {
      await sendAuthTemplate(
        templateId,
        user.email,
        templateData(user, emailData, {
          confirmation_url: confirmationUrl(emailData.token_hash_new, action, redirectTo, siteUrl),
          token: emailData.token ?? '',
          email: user.email,
          templateId,
        })
      )
      await sendAuthTemplate(
        templateId,
        user.new_email,
        templateData(user, emailData, {
          confirmation_url: confirmationUrl(emailData.token_hash ?? '', action, redirectTo, siteUrl),
          token: emailData.token_new ?? '',
          email: user.new_email,
          templateId,
        })
      )
    } else {
      const to = user.email
      if (!to) throw new Error('Auth hook payload missing user.email')
      await sendAuthTemplate(
        templateId,
        to,
        templateData(user, emailData, {
          confirmation_url: confirmationUrl(emailData.token_hash ?? '', action, redirectTo, siteUrl),
          token: emailData.token ?? '',
          email: to,
          templateId,
        })
      )
    }

    return jsonResponse({})
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Hook failed'
    console.error('[auth-send-email]', message)
    const unauthorized = /webhook|signature|timestamp/i.test(message)
    return jsonResponse({ error: { http_code: unauthorized ? 401 : 500, message } }, unauthorized ? 401 : 500)
  }
})
