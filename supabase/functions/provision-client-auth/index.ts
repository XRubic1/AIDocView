import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    if (
      key.endsWith('Html') ||
      key === 'inviteLink' ||
      key === 'setupLink' ||
      key === 'confirmation_url'
    ) {
      return raw
    }
    return escapeHtml(raw)
  })
}

function feeTermsLabel(feeTerms: Record<string, unknown> | null | undefined): string {
  if (!feeTerms) return '—'
  if (feeTerms.fee_type === 'flat') {
    return `$${Number(feeTerms.flat_fee_amount ?? 0).toFixed(2)} flat`
  }
  if (feeTerms.fee_percentage == null && !feeTerms.fee_type) return '—'
  return `${feeTerms.fee_percentage ?? 0}%`
}

async function findUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string
): Promise<string | null> {
  const normalized = email.toLowerCase()
  for (let page = 1; page <= 15; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return null
    const found = data.users.find((u) => (u.email ?? '').toLowerCase() === normalized)
    if (found) return found.id
    if (data.users.length < 200) break
  }
  return null
}

/** Generate an invite/recovery link; retry login redirect if setup-password is not allow-listed. */
async function generateSetupLink(
  admin: ReturnType<typeof createClient>,
  email: string,
  type: 'invite' | 'recovery',
  preferredRedirect: string,
  fallbackRedirect: string
): Promise<string | null> {
  for (const redirectTo of [preferredRedirect, fallbackRedirect]) {
    const { data, error } = await admin.auth.admin.generateLink({
      type,
      email,
      options: { redirectTo },
    })
    if (!error && data?.properties?.action_link) return data.properties.action_link
    console.warn('[provision-client-auth] generateLink failed', type, redirectTo, error?.message)
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ ok: false, error: 'Unauthorized' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? ''

    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !userData.user) {
      return json({ ok: false, error: 'Unauthorized' }, 401)
    }
    if (userData.user.app_metadata?.role !== 'admin') {
      return json({ ok: false, error: 'Forbidden' }, 403)
    }

    const { clientId, email, sendEmail = true } = await req.json()
    if (!clientId || !email) {
      return json({ ok: false, error: 'clientId and email required' })
    }

    const { data: clientRow, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id, name, contact_person, email, fee_terms')
      .eq('id', clientId)
      .maybeSingle()

    if (clientError || !clientRow) {
      return json({ ok: false, error: clientError?.message ?? 'Client not found' })
    }

    const { data: existingLinks } = await supabaseAdmin
      .from('client_auth_links')
      .select('user_id')
      .eq('client_id', clientId)
      .limit(1)

    let userId = existingLinks?.[0]?.user_id as string | undefined
    let createdNewUser = false

    if (!userId) {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { must_set_password: true },
      })

      if (createError) {
        userId = (await findUserIdByEmail(supabaseAdmin, email)) ?? undefined
        if (!userId) {
          return json({ ok: false, error: createError.message })
        }
      } else {
        userId = created.user?.id
        createdNewUser = true
      }
    }

    if (!userId) return json({ ok: false, error: 'User id missing' })

    if (!createdNewUser) {
      const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(userId)
      const alreadySignedIn = Boolean(existingUser.user?.last_sign_in_at)
      const alreadyCleared = existingUser.user?.user_metadata?.must_set_password === false
      if (!alreadySignedIn && !alreadyCleared) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: { ...(existingUser.user?.user_metadata ?? {}), must_set_password: true },
        })
      }
    }

    // Admin path: link directly. Do not use credyx_complete_enrollment (15-minute signup window).
    const { error: linkError } = await supabaseAdmin.from('client_auth_links').upsert(
      { user_id: userId, client_id: clientId },
      { onConflict: 'user_id' }
    )
    if (linkError) {
      return json({ ok: false, error: `Could not link account: ${linkError.message}` })
    }

    const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://app.credyx.net').replace(/\/$/, '')
    const portalLink = `${siteUrl}/client/login`
    const setupRedirect = `${siteUrl}/client/setup-password`
    const websiteUrl = Deno.env.get('CREDYX_WEBSITE_URL') ?? 'https://credyx.com'
    const contactEmail = Deno.env.get('CREDYX_CONTACT_EMAIL') ?? 'ops@credyx.net'

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
    const needsPasswordSetup = authUser.user?.user_metadata?.must_set_password === true

    let setupLink = portalLink
    if (needsPasswordSetup) {
      const generated = await generateSetupLink(
        supabaseAdmin,
        email,
        createdNewUser ? 'invite' : 'recovery',
        setupRedirect,
        portalLink
      )
      if (generated) setupLink = generated
    }

    if (sendEmail) {
      const resendKey = Deno.env.get('RESEND_API_KEY')
      if (!resendKey) {
        return json({
          ok: true,
          userId,
          emailed: false,
          error: 'Account is ready, but RESEND_API_KEY is not set on provision-client-auth.',
        })
      }

      const fromEmail =
        Deno.env.get('RESEND_FROM_CARRIER')?.trim() ||
        Deno.env.get('RESEND_FROM_EMAIL') ||
        'Credyx <onboarding@resend.dev>'
      const replyTo = Deno.env.get('RESEND_REPLY_TO_CARRIER')?.trim() || Deno.env.get('RESEND_REPLY_TO')?.trim()

      const placeholders: Record<string, string> = {
        contactName: (clientRow.contact_person as string | null)?.trim() || 'there',
        clientName: (clientRow.name as string) || 'your company',
        feeTermsLabel: feeTermsLabel(clientRow.fee_terms as Record<string, unknown> | null),
        feePercentage: String(
          (clientRow.fee_terms as { fee_percentage?: number } | null)?.fee_percentage ?? ''
        ),
        websiteUrl,
        portalLink,
        contactEmail,
        setupLink,
        inviteLink: setupLink,
        ctaLabel: needsPasswordSetup ? 'Create your password' : 'Sign in to your portal',
        companyLogoHtml: `<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:0.02em;line-height:1;">
  <span style="color:#ffffff;">Cred</span><span style="color:#1684FE;">yx</span>
</div>`,
      }

      const { data: tmpl } = await supabaseAdmin
        .from('email_templates')
        .select('subject, body_html')
        .eq('id', 'client_invite')
        .maybeSingle()

      const subject = renderTemplateString(
        tmpl?.subject ?? 'Welcome to Credyx — your account is active',
        placeholders
      )
      const html = renderTemplateString(
        tmpl?.body_html ??
          `<p>Hi {{contactName}},</p><p>Your Credyx account for <strong>{{clientName}}</strong> is active.</p><p>Collection fee: <strong>{{feeTermsLabel}}</strong></p><p><a href="{{setupLink}}">{{ctaLabel}}</a></p>`,
        placeholders
      )

      const resendBody: Record<string, unknown> = {
        from: fromEmail,
        to: [email],
        subject,
        html,
      }
      if (replyTo) resendBody.reply_to = replyTo

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(resendBody),
      })
      if (!res.ok) {
        const errText = await res.text()
        return json({
          ok: false,
          error: `Account is ready, but the email failed: ${errText.slice(0, 280)}`,
        })
      }
    }

    return json({ ok: true, userId, emailed: Boolean(sendEmail) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Provision failed'
    console.error('[provision-client-auth]', message)
    return json({ ok: false, error: message })
  }
})
