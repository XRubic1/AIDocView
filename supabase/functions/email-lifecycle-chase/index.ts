/**
 * Two-track email chase (paperwork then payment). Cron or admin with OPS_CRON_SECRET.
 * Skips Resend when the broker is no-email on that track and opens a staff review instead.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

type Clock = {
  firstAskDays: number
  actionNeededAfterFirst: boolean
  actionNeededAfterFirstDays: number
  secondFollowupDays: number
  needsAttentionAfterSecondDays: number
}

const DEFAULT_PW: Clock = {
  firstAskDays: 3,
  actionNeededAfterFirst: true,
  actionNeededAfterFirstDays: 2,
  secondFollowupDays: 5,
  needsAttentionAfterSecondDays: 3,
}

const DEFAULT_PAY: Clock = {
  firstAskDays: 15,
  actionNeededAfterFirst: false,
  actionNeededAfterFirstDays: 3,
  secondFollowupDays: 3,
  needsAttentionAfterSecondDays: 5,
}

function daysBetween(fromIso: string | undefined, nowMs: number): number | null {
  if (!fromIso) return null
  const t = Date.parse(fromIso)
  if (!Number.isFinite(t)) return null
  return Math.floor((nowMs - t) / (1000 * 60 * 60 * 24))
}

function mergeClock(base: Clock, override?: Partial<Clock>, paymentInquiry?: number): Clock {
  return {
    firstAskDays: override?.firstAskDays ?? paymentInquiry ?? base.firstAskDays,
    actionNeededAfterFirst: override?.actionNeededAfterFirst ?? base.actionNeededAfterFirst,
    actionNeededAfterFirstDays:
      override?.actionNeededAfterFirstDays ?? base.actionNeededAfterFirstDays,
    secondFollowupDays: override?.secondFollowupDays ?? base.secondFollowupDays,
    needsAttentionAfterSecondDays:
      override?.needsAttentionAfterSecondDays ?? base.needsAttentionAfterSecondDays,
  }
}

function brokerToEmail(broker: { email?: string | null; emails?: Array<{ email?: string }> | null } | undefined): string {
  if (!broker) return ''
  const list = broker.emails ?? []
  return list[0]?.email || broker.email || ''
}

async function sendTemplate(
  admin: ReturnType<typeof createClient>,
  templateId: string,
  to: string,
  data: Record<string, string>
): Promise<void> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey || !to) return
  const { data: row } = await admin.from('email_templates').select('subject, body_html').eq('id', templateId).maybeSingle()
  let subject = String(row?.subject ?? templateId)
  let html = ensureCredyxEmailShell(String(row?.body_html ?? `<p>${templateId}</p>`), templateId)
  if (!data.companyLogoHtml) {
    data = {
      ...data,
      companyLogoHtml: `<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:0.02em;line-height:1;"><span style="color:#ffffff;">Cred</span><span style="color:#1684FE;">yx</span></div>`,
    }
  }
  for (const [k, v] of Object.entries(data)) {
    subject = subject.replaceAll(`{{${k}}}`, v)
    html = html.replaceAll(`{{${k}}}`, v)
  }
  const from = Deno.env.get('RESEND_FROM_BROKER') || Deno.env.get('RESEND_FROM_EMAIL') || 'Credyx <ops@credyx.net>'
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
}

function isFullEmailDocument(html: string): boolean {
  const t = html.trim().toLowerCase()
  return t.startsWith('<!doctype') || t.startsWith('<html')
}

const EMAIL_SHELL_EYEBROW: Record<string, string> = {
  broker_payment_status_inquiry: 'Collections',
  broker_payment_status_followup: 'Collections',
  broker_paperwork_status_inquiry: 'Paperwork',
  broker_paperwork_status_followup: 'Paperwork',
}

function ensureCredyxEmailShell(bodyHtml: string, templateId?: string): string {
  if (isFullEmailDocument(bodyHtml)) return bodyHtml
  const eyebrow = (templateId && EMAIL_SHELL_EYEBROW[templateId]) || 'Credyx'
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${eyebrow}</title></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
<tr><td style="background-color:#0f172a;padding:22px 28px;">{{companyLogoHtml}}
<p style="margin:14px 0 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">${eyebrow}</p></td></tr>
<tr><td style="padding:28px 28px 24px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#475569;">${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#334155;">Credyx · Paid on time</p>
<p style="margin:0;font-size:11px;line-height:1.45;color:#64748b;">A/R Solutions. If you received this in error, please delete it and notify ops@credyx.net.</p>
</td></tr>
</table></td></tr></table>
</body></html>`
}

function ppwSentAt(invoice: Record<string, unknown>): string | undefined {
  const history = invoice.document_send_history as Array<{ sent_at?: string; status?: string }> | null
  const ok = history?.find((h) => h.status === 'delivered' || h.status === 'sent')
  return ok?.sent_at
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const cronSecret = Deno.env.get('OPS_CRON_SECRET')
    const providedCron = req.headers.get('x-cron-secret')
    if (!cronSecret || providedCron !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const admin = createClient(supabaseUrl, serviceKey)
    const nowMs = Date.now()
    const now = new Date().toISOString()

    const { data: settingsRow } = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'email_lifecycle')
      .maybeSingle()
    const settings = (settingsRow?.value ?? {}) as {
      paperwork?: Clock
      payment?: Clock
      rules?: Record<string, { enabled?: boolean }>
    }
    const paperworkClock = { ...DEFAULT_PW, ...(settings.paperwork ?? {}) }
    const paymentClock = { ...DEFAULT_PAY, ...(settings.payment ?? {}) }

    const { data: invoices } = await admin
      .from('invoices')
      .select('id, status, broker_id, client_id, invoice_number, load_number, client_name, broker_name, amount, email_lifecycle, document_send_history, collections_needs_attention, due_date, expected_payment_date')
    const { data: brokers } = await admin.from('brokers').select('id, name, email, emails, email_lifecycle, payment_status_inquiry_days, paperwork_status_check_days')

    const brokerById = new Map((brokers ?? []).map((b) => [b.id, b]))
    let sent = 0
    let actions = 0

    for (const invoice of invoices ?? []) {
      if (
        ['paid', 'written_off', 'force_closed', 'write_off_pending', 'pending', 'hold'].includes(
          invoice.status
        )
      ) {
        continue
      }
      const broker = brokerById.get(invoice.broker_id)
      const life = (invoice.email_lifecycle ?? { paperwork_status: 'unknown' }) as Record<string, unknown>
      const accept = (broker?.email_lifecycle as { accept?: { paperworkStatus?: boolean; paymentStatus?: boolean } } | undefined)
        ?.accept
      const paperworkGood = life.paperwork_status === 'good'
      const pwState = (life.paperwork ?? {}) as Record<string, string>
      const payState = (life.payment ?? {}) as Record<string, string>

      const queueCall = async (track: 'paperwork' | 'payment', kind: string) => {
        actions += 1
        await admin.from('email_review_items').insert({
          id: `review-${crypto.randomUUID()}`,
          invoice_id: invoice.id,
          broker_id: invoice.broker_id,
          client_id: invoice.client_id,
          status: 'pending_review',
          classification: track === 'paperwork' ? 'non_response_paperwork' : 'non_response_payment',
          proposed_actions: ['staff_call'],
          summary: kind,
          body_text: '',
          invoice_number: invoice.invoice_number,
          load_number: invoice.load_number,
          created_at: now,
        })
      }

      if (!paperworkGood) {
        const started = pwState.startedAt || ppwSentAt(invoice)
        if (!started) continue
        const clock = mergeClock(
          paperworkClock,
          (broker?.email_lifecycle as { paperwork?: Partial<Clock> } | undefined)?.paperwork,
          typeof broker?.paperwork_status_check_days === 'number' ? broker.paperwork_status_check_days : undefined
        )
        const firstAt = pwState.firstAskedAt
        const inbound = pwState.lastInboundAt
        if (!firstAt && (daysBetween(started, nowMs) ?? 0) >= clock.firstAskDays) {
          if (accept?.paperworkStatus === false) {
            await queueCall('paperwork', 'First paperwork follow-up: call broker (no email).')
          } else {
            sent += 1
            await sendTemplate(admin, 'broker_paperwork_status_inquiry', brokerToEmail(broker), {
              brokerName: String(broker?.name ?? invoice.broker_name),
              invoiceNumber: invoice.invoice_number,
              loadNumber: invoice.load_number || 'N/A',
              clientName: invoice.client_name,
            })
          }
          const nextLife = {
            ...life,
            paperwork: { ...pwState, startedAt: started, firstAskedAt: now, lastAskChannel: accept?.paperworkStatus === false ? 'phone' : 'email' },
          }
          await admin.from('invoices').update({ email_lifecycle: nextLife }).eq('id', invoice.id)
          continue
        }
        if (firstAt && !inbound) {
          const daysSinceFirst = daysBetween(firstAt, nowMs) ?? 0
          if (clock.actionNeededAfterFirst && daysSinceFirst >= clock.actionNeededAfterFirstDays && !pwState.actionNeededAt) {
            await queueCall('paperwork', 'Action needed: no paperwork reply after first ask.')
            await admin
              .from('invoices')
              .update({
                email_lifecycle: { ...life, paperwork: { ...pwState, actionNeededAt: now } },
              })
              .eq('id', invoice.id)
          }
          if (!pwState.secondAskedAt && clock.secondFollowupDays > 0 && daysSinceFirst >= clock.secondFollowupDays) {
            if (accept?.paperworkStatus === false) {
              await queueCall('paperwork', 'Second paperwork follow-up: call broker.')
            } else {
              sent += 1
              await sendTemplate(admin, 'broker_paperwork_status_followup', brokerToEmail(broker), {
                brokerName: String(broker?.name ?? invoice.broker_name),
                invoiceNumber: invoice.invoice_number,
                loadNumber: invoice.load_number || 'N/A',
              })
            }
            await admin
              .from('invoices')
              .update({
                email_lifecycle: {
                  ...life,
                  paperwork: { ...pwState, secondAskedAt: now, lastAskChannel: accept?.paperworkStatus === false ? 'phone' : 'email' },
                },
              })
              .eq('id', invoice.id)
            continue
          }
          if (
            pwState.secondAskedAt &&
            (daysBetween(pwState.secondAskedAt, nowMs) ?? 0) >= clock.needsAttentionAfterSecondDays &&
            !pwState.needsAttentionAt
          ) {
            await queueCall('paperwork', 'Needs attention: no paperwork reply after second follow-up.')
            await admin
              .from('invoices')
              .update({
                email_lifecycle: { ...life, paperwork: { ...pwState, needsAttentionAt: now } },
                collections_needs_attention: true,
              })
              .eq('id', invoice.id)
          }
        }
        continue
      }

      // Blueprint owns payment chase — skip payment track (paperwork already handled)
      if (life.blueprint_owns_chase === true) {
        continue
      }

      const dueYmd = (invoice.due_date || invoice.expected_payment_date) as string | undefined
      if (dueYmd) {
        const dueMs = Date.parse(`${dueYmd}T12:00:00`)
        if (Number.isFinite(dueMs) && dueMs > nowMs) continue
      }

      const payStart = payState.startedAt || now
      const pClock = mergeClock(
        paymentClock,
        (broker?.email_lifecycle as { payment?: Partial<Clock> } | undefined)?.payment,
        typeof broker?.payment_status_inquiry_days === 'number' ? broker.payment_status_inquiry_days : undefined
      )
      if (!payState.startedAt) {
        await admin
          .from('invoices')
          .update({ email_lifecycle: { ...life, payment: { ...payState, startedAt: now } } })
          .eq('id', invoice.id)
        continue
      }
      if (!payState.firstAskedAt && (daysBetween(payStart, nowMs) ?? 0) >= pClock.firstAskDays) {
        if (accept?.paymentStatus === false) {
          await queueCall('payment', 'First payment follow-up: call broker (no email).')
        } else {
          sent += 1
          await sendTemplate(admin, 'broker_payment_status_inquiry', brokerToEmail(broker), {
            brokerName: String(broker?.name ?? invoice.broker_name),
            invoiceNumber: invoice.invoice_number,
            loadNumber: invoice.load_number || 'N/A',
            amount: String(invoice.amount ?? ''),
          })
        }
        await admin
          .from('invoices')
          .update({
            email_lifecycle: {
              ...life,
              payment: { ...payState, firstAskedAt: now, lastAskChannel: accept?.paymentStatus === false ? 'phone' : 'email' },
            },
            collections_last_inquiry_at: now,
          })
          .eq('id', invoice.id)
        continue
      }
      if (payState.firstAskedAt && !payState.lastInboundAt) {
        const daysSinceFirst = daysBetween(payState.firstAskedAt, nowMs) ?? 0
        if (pClock.actionNeededAfterFirst && daysSinceFirst >= pClock.actionNeededAfterFirstDays && !payState.actionNeededAt) {
          await queueCall('payment', 'Action needed: no payment reply after first ask.')
          await admin
            .from('invoices')
            .update({ email_lifecycle: { ...life, payment: { ...payState, actionNeededAt: now } } })
            .eq('id', invoice.id)
        }
        if (!payState.secondAskedAt && pClock.secondFollowupDays > 0 && daysSinceFirst >= pClock.secondFollowupDays) {
          if (accept?.paymentStatus === false) {
            await queueCall('payment', 'Second payment follow-up: call broker.')
          } else {
            sent += 1
            await sendTemplate(admin, 'broker_payment_status_followup', brokerToEmail(broker), {
              brokerName: String(broker?.name ?? invoice.broker_name),
              invoiceNumber: invoice.invoice_number,
            })
          }
          await admin
            .from('invoices')
            .update({
              email_lifecycle: { ...life, payment: { ...payState, secondAskedAt: now } },
              collections_followup_at: now,
            })
            .eq('id', invoice.id)
        }
        if (
          payState.secondAskedAt &&
          (daysBetween(payState.secondAskedAt, nowMs) ?? 0) >= pClock.needsAttentionAfterSecondDays &&
          !payState.needsAttentionAt
        ) {
          await queueCall('payment', 'Needs attention: no payment reply after second follow-up.')
          await admin
            .from('invoices')
            .update({
              email_lifecycle: { ...life, payment: { ...payState, needsAttentionAt: now } },
              collections_needs_attention: true,
            })
            .eq('id', invoice.id)
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, actions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
