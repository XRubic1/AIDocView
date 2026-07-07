import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type EmailTemplate = 'client_invite' | 'broker_packet' | 'admin_enrollment_alert'

interface SendEmailPayload {
  template: EmailTemplate
  to: string
  data: Record<string, string>
}

function buildEmail(template: EmailTemplate, data: Record<string, string>) {
  switch (template) {
    case 'client_invite':
      return {
        subject: 'Your Credyx client portal is ready',
        html: `<p>Hi ${data.contactName ?? 'there'},</p>
<p>Your Credyx account has been activated. Set your password and sign in:</p>
<p><a href="${data.inviteLink}">Activate your account</a></p>
<p>If you did not request this, you can ignore this email.</p>`,
      }
    case 'broker_packet':
      return {
        subject: `Document packet — ${data.invoiceNumber ?? 'Invoice'}`,
        html: `<p>Please find attached documents for invoice ${data.invoiceNumber ?? ''}.</p>
<p>${data.message ?? ''}</p>`,
      }
    case 'admin_enrollment_alert':
      return {
        subject: `New enrollment — ${data.clientName ?? 'Client'}`,
        html: `<p>A new client enrolled: <strong>${data.clientName}</strong> (${data.email}).</p>
<p>Review in the admin portal.</p>`,
      }
    default:
      throw new Error('Unknown template')
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: userData, error: userError } = await supabase.auth.getUser()
    const role = userData.user?.app_metadata?.role
    const isAdmin = role === 'admin'
    const payload = (await req.json()) as SendEmailPayload

    if (payload.template === 'admin_enrollment_alert') {
      // Enrollment form runs without admin session — allow this template for anon invokes.
    } else if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    } else if (payload.template === 'broker_packet' && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    } else if (!isAdmin && payload.template === 'client_invite') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }

    const resendKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Credyx <onboarding@resend.dev>'

    if (!resendKey) {
      console.log('[send-email] stub — RESEND_API_KEY not configured', payload)
      return new Response(JSON.stringify({ ok: false, stub: true, error: 'Email not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { subject, html } = buildEmail(payload.template, payload.data)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [payload.to],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return new Response(JSON.stringify({ error: errText }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await res.json()
    return new Response(JSON.stringify({ ok: true, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
