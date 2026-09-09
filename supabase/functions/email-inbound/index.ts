/**
 * Resend inbound webhook → email_messages + pending email_review_items.
 * Staff confirm in Admin Inbox before holds/disputes.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

function classify(subject: string, body: string) {
  const text = `${subject}\n${body}`.toLowerCase()
  if (
    /missing.{0,48}(pod|bol|docs?|paperwork|lumper|scale)|on hold.{0,40}missing|hold due to|incomplete\s+(packet|paperwork)/.test(
      text
    )
  ) {
    return {
      classification: 'missing_docs',
      proposed_actions: ['hold_invoice', 'add_note', 'notify_carrier', 'notify_credyx'],
      summary: 'Broker indicated a hold or missing paperwork.',
    }
  }
  if (/\bclaim\b|cargo claim|freight claim/.test(text)) {
    return {
      classification: 'claim',
      proposed_actions: ['hold_invoice', 'add_note', 'notify_carrier', 'notify_credyx', 'compose_claim_scope'],
      summary: 'Broker mentioned a claim.',
    }
  }
  if (/paperwork\s+(is\s+)?(good|fine|complete|in order|ok)|packet\s+(is\s+)?(good|complete)/.test(text)) {
    return {
      classification: 'paperwork_ok',
      proposed_actions: ['log_paperwork_good', 'add_note'],
      summary: 'Broker indicated paperwork is in order.',
    }
  }
  if (/will pay|check (was )?mailed|ach (was )?sent|paid on|expect(ed)? pay/.test(text)) {
    return {
      classification: 'payment_ok',
      proposed_actions: ['log_payment_ok', 'add_note'],
      summary: 'Broker indicated payment status.',
    }
  }
  if (/short.?pay|not paying|dispute|deduct|refuse/.test(text)) {
    return {
      classification: 'negative',
      proposed_actions: ['hold_invoice', 'add_note', 'notify_carrier', 'notify_credyx'],
      summary: 'Negative language in broker reply.',
    }
  }
  return {
    classification: 'unclear',
    proposed_actions: ['add_note'],
    summary: 'Unclear broker reply — staff must pick.',
  }
}

function pickString(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'email' in (v as Record<string, unknown>)) {
    return String((v as { email?: string }).email ?? '')
  }
  return ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const webhookSecret = Deno.env.get('RESEND_INBOUND_WEBHOOK_SECRET')
    const provided = req.headers.get('x-webhook-secret') || new URL(req.url).searchParams.get('secret')
    if (webhookSecret && provided !== webhookSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = (await req.json()) as Record<string, unknown>
    const data = (payload.data ?? payload.email ?? payload) as Record<string, unknown>
    const from = pickString(data.from) || pickString(data.from_address)
    const subject = String(data.subject ?? '(no subject)')
    const bodyText = String(data.text ?? data.body ?? data.html ?? '')
    const messageId = String(data.message_id ?? data.email_id ?? '')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: 'Service role not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const hay = `${subject} ${bodyText}`
    const invMatch = hay.match(/INV[- ]?([\w-]+)/i)
    let invoice: { id: string; broker_id: string | null; client_id: string; invoice_number: string; load_number: string | null } | null = null
    if (invMatch) {
      const { data: row } = await admin
        .from('invoices')
        .select('id, broker_id, client_id, invoice_number, load_number')
        .ilike('invoice_number', `%${invMatch[1]}%`)
        .limit(1)
        .maybeSingle()
      invoice = row
    }
    if (!invoice) {
      const loadMatch = hay.match(/load[:\s#]+([A-Za-z0-9-]+)/i)
      if (loadMatch) {
        const { data: row } = await admin
          .from('invoices')
          .select('id, broker_id, client_id, invoice_number, load_number')
          .ilike('load_number', loadMatch[1])
          .limit(1)
          .maybeSingle()
        invoice = row
      }
    }

    const classified = classify(subject, bodyText)
    const now = new Date().toISOString()
    let threadId: string | null = null

    if (invoice) {
      const { data: existing } = await admin
        .from('email_threads')
        .select('id')
        .eq('invoice_id', invoice.id)
        .maybeSingle()
      threadId = existing?.id ?? `thread-${crypto.randomUUID()}`
      if (!existing) {
        await admin.from('email_threads').insert({
          id: threadId,
          invoice_id: invoice.id,
          broker_id: invoice.broker_id,
          client_id: invoice.client_id,
          subject,
          created_at: now,
          updated_at: now,
        })
      }
      await admin.from('email_messages').insert({
        id: `msg-${crypto.randomUUID()}`,
        thread_id: threadId,
        direction: 'inbound',
        from_address: from || 'unknown',
        to_address: 'collections@credyx.net',
        subject,
        body_text: bodyText,
        message_id: messageId || null,
        sent_at: now,
      })
    }

    const { error } = await admin.from('email_review_items').insert({
      id: `review-${crypto.randomUUID()}`,
      thread_id: threadId,
      invoice_id: invoice?.id ?? null,
      broker_id: invoice?.broker_id ?? null,
      client_id: invoice?.client_id ?? null,
      status: 'pending_review',
      classification: classified.classification,
      proposed_actions: classified.proposed_actions,
      summary: classified.summary,
      body_text: bodyText,
      from_address: from,
      subject,
      load_number: invoice?.load_number ?? null,
      invoice_number: invoice?.invoice_number ?? null,
      created_at: now,
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, matched: Boolean(invoice) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
