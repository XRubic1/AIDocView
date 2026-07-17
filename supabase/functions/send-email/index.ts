import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type EmailTemplate =
  | 'client_invite'
  | 'broker_packet'
  | 'admin_enrollment_alert'
  | 'credyx_batch_error'
  | 'carrier_batch_verified'
  | 'carrier_batch_holds'
  | 'broker_payment_status_inquiry'
  | 'broker_payment_status_followup'

interface SendEmailPayload {
  template: EmailTemplate
  to: string
  data: Record<string, string>
}

/** Templates that may be invoked without an admin session (system / ops). */
const PUBLIC_TEMPLATES = new Set<EmailTemplate>(['admin_enrollment_alert'])

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
<p>Broker: ${data.brokerName ?? ''} · Carrier: ${data.clientName ?? ''}</p>
<p>${data.documentList ? `Documents: ${data.documentList}` : ''}</p>
<p>${data.message ?? ''}</p>`,
      }
    case 'admin_enrollment_alert':
      return {
        subject: `New enrollment — ${data.clientName ?? 'Client'}`,
        html: `<p>A new client enrolled: <strong>${data.clientName}</strong> (${data.email}).</p>
<p>Review in the admin portal.</p>`,
      }
    case 'credyx_batch_error':
      return {
        subject: `Batch error — ${data.batchNumber ?? 'unknown'} (${data.scope ?? 'process'})`,
        html: `<p>There was an error with batch <strong>${data.batchNumber ?? ''}</strong>${data.clientName ? ` for ${data.clientName}` : ''}.</p>
<p><strong>Scope:</strong> ${data.scope ?? 'process'}</p>
<pre style="white-space:pre-wrap;font-family:sans-serif">${data.issueMessage ?? 'No details'}</pre>
<p>Please review in the Credyx admin portal (Batches → AI / Ready to Post / Verification).</p>`,
      }
    case 'carrier_batch_verified':
      return {
        subject: `Batch ${data.batchNumber ?? ''} verified — no issues found`,
        html: `<p>All invoices in batch <strong>${data.batchNumber ?? ''}</strong> were verified successfully (${data.invoiceCount ?? ''} invoices). No issues were detected.</p>
<p><strong>Paperwork sent to brokers:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif">${data.ppwSummary ?? 'See portal for details.'}</pre>
<p>This is an automatic email. Full details are available in your client portal.</p>`,
      }
    case 'carrier_batch_holds':
      return {
        subject: `Batch ${data.batchNumber ?? ''} — ${data.holdCount ?? ''} invoice(s) on hold`,
        html: `<p>One or more invoices in batch <strong>${data.batchNumber ?? ''}</strong> were placed on hold after verification.</p>
<pre style="white-space:pre-wrap;font-family:sans-serif">${data.holdList ?? ''}</pre>
<p>This is an automatic email. Full details and next steps are available in your client portal.</p>`,
      }
    case 'broker_payment_status_inquiry':
      return {
        subject: `Payment status inquiry — Invoice ${data.invoiceNumber ?? ''}`,
        html: `<p>Hello${data.brokerName ? ` ${data.brokerName}` : ''},</p>
<p>Please provide the payment status for invoice <strong>${data.invoiceNumber ?? ''}</strong> (Load ${data.loadNumber ?? 'N/A'}, Amount ${data.amount ?? ''}).</p>
<p>Reply to this email with the expected payment date or status.</p>
<p>— Credyx Collections</p>`,
      }
    case 'broker_payment_status_followup':
      return {
        subject: `Follow-up: Payment status — Invoice ${data.invoiceNumber ?? ''}`,
        html: `<p>Hello${data.brokerName ? ` ${data.brokerName}` : ''},</p>
<p>We have not received a response regarding invoice <strong>${data.invoiceNumber ?? ''}</strong>. Please reply with payment status.</p>
<p>— Credyx Collections</p>`,
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

    if (PUBLIC_TEMPLATES.has(payload.template)) {
      // allowed without admin
    } else if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    } else if (
      !isAdmin &&
      payload.template !== 'client_invite' &&
      !payload.template.startsWith('carrier_')
    ) {
      // Carrier outcome emails may be triggered in client session context in future;
      // for now require admin for most templates except invite.
      if (payload.template === 'broker_packet' || payload.template.startsWith('broker_') || payload.template.startsWith('credyx_')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
      }
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
