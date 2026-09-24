/**
 * Blueprint Wait wake cron — advances due waiting runs without a browser tab.
 *
 * Auth: `x-cron-secret: $OPS_CRON_SECRET` or admin JWT.
 * Schedule (suggested): every 15–60 min via Supabase Schedules / pg_cron.
 *
 * Handles invoice / broker / batch subjects: leave Wait → When / Then-do / Done /
 * next Wait. Then-do: invoice notes + broker payment/follow-up emails (Resend).
 * Complex client-only actions (risk mark UI, custom channels) are skipped with a note.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

type NodeData = {
  kind?: string
  label?: string
  checkId?: string
  whenMatch?: 'yes' | 'no'
  waitUntilId?: string
  days?: string
  actionId?: string
  actionIds?: string[]
  actionConfigs?: Record<string, { message?: string; channel?: string }>
  fieldKey?: string
}

type FlowNode = {
  id: string
  data: NodeData
}

type FlowEdge = {
  id?: string
  source: string
  target: string
}

type RunRow = {
  id: string
  subject: string
  subject_id: string | null
  subject_label: string
  client_label: string
  blueprint_id: string
  blueprint_name: string
  status: string
  current_step: string
  current_node_id: string | null
  wait_until: string | null
  started_at: string
  updated_at: string
}

function parseDays(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function daysFromNow(days: number, now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function addDaysToYmd(ymd: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0, 0)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

function atLocalNine(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim())
  if (!m) return new Date().toISOString()
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0, 0).toISOString()
}

function clampWake(iso: string, now: Date): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t) || t <= now.getTime()) return now.toISOString()
  return iso
}

function getActionIds(data: NodeData): string[] {
  if (Array.isArray(data.actionIds) && data.actionIds.length > 0) {
    return data.actionIds.filter(Boolean)
  }
  if (data.actionId) return [data.actionId]
  return []
}

function isWhen(data: NodeData): boolean {
  return data.kind === 'if' || data.kind === 'elseif'
}

function isBranchTrue(data: NodeData): boolean {
  return data.kind === 'branch_true'
}

function isBranchFalse(data: NodeData): boolean {
  return data.kind === 'branch_false'
}

function whenPasses(data: NodeData, raw: boolean): boolean {
  return data.whenMatch === 'no' ? !raw : raw
}

function nextNodes(fromId: string, nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return edges
    .filter((e) => e.source === fromId)
    .map((e) => byId.get(e.target))
    .filter((n): n is FlowNode => !!n)
}

function nextAfterWhen(
  fromId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  matched: boolean
): FlowNode | null {
  const outs = nextNodes(fromId, nodes, edges)
  const trueCard = outs.find((n) => isBranchTrue(n.data))
  const falseCard = outs.find((n) => isBranchFalse(n.data))
  if (trueCard || falseCard) {
    if (matched && trueCard) return trueCard
    if (!matched && falseCard) return falseCard
    if (matched) return outs.find((n) => !isBranchFalse(n.data)) ?? outs[0] ?? null
    return falseCard ?? null
  }
  if (!matched) return null
  return outs[0] ?? null
}

function evaluateInvoiceWhen(checkId: string | undefined, invoice: Record<string, unknown>): boolean {
  if (!checkId) return false
  if (checkId === 'on_hold') return invoice.status === 'hold'
  if (checkId === 'payment_posted') return invoice.status === 'paid'
  if (checkId === 'broker_replied' || checkId === 'no_reply') return false
  return (
    invoice.status === 'approved' ||
    invoice.status === 'pending' ||
    invoice.status === 'review' ||
    invoice.status === 'hold'
  )
}

function resolveInvoiceWait(
  node: FlowNode,
  invoice: Record<string, unknown>,
  broker: Record<string, unknown> | undefined,
  now: Date
): { waitUntil: string; detail: string } {
  const id = node.data.waitUntilId || 'pause_days'
  const D = parseDays(node.data.days, id === 'after_last_email' ? 5 : 15)

  if (id === 'pause_days' || !id) {
    const amount = parseDays(node.data.days, 3)
    const unit = String(node.data.waitUnit || 'days')
    if (unit === 'minutes' || unit === 'hours') {
      const ms = unit === 'minutes' ? amount * 60_000 : amount * 3_600_000
      return {
        waitUntil: clampWake(new Date(now.getTime() + ms).toISOString(), now),
        detail: `Wait ${amount}${unit === 'minutes' ? 'm' : 'h'} from step`,
      }
    }
    return {
      waitUntil: clampWake(daysFromNow(amount, now), now),
      detail: `Wait ${amount}d from step`,
    }
  }

  if (id === 'net_plus_late') {
    const net = Number(broker?.payment_terms_days)
    const terms = Number.isFinite(net) && net > 0 ? Math.floor(net) : 0
    const base = String(invoice.invoice_date ?? '').trim()
    if (!base) return { waitUntil: clampWake(daysFromNow(D, now), now), detail: 'pause fallback' }
    const target = addDaysToYmd(base, terms + D)
    if (!target) return { waitUntil: clampWake(daysFromNow(D, now), now), detail: 'pause fallback' }
    return {
      waitUntil: clampWake(atLocalNine(target), now),
      detail: `invoice + Net ${terms} + ${D}`,
    }
  }

  if (id === 'due_plus_late') {
    const due = String(invoice.due_date || invoice.expected_payment_date || '').trim()
    if (!due) return { waitUntil: clampWake(daysFromNow(D, now), now), detail: 'pause fallback' }
    const target = addDaysToYmd(due, D)
    if (!target) return { waitUntil: clampWake(daysFromNow(D, now), now), detail: 'pause fallback' }
    return { waitUntil: clampWake(atLocalNine(target), now), detail: `due + ${D}` }
  }

  if (id === 'after_last_email') {
    const life = (invoice.email_lifecycle ?? {}) as {
      payment?: { firstAskedAt?: string; secondAskedAt?: string }
      paperwork?: { firstAskedAt?: string; secondAskedAt?: string }
    }
    const stamp =
      life.payment?.secondAskedAt ||
      life.payment?.firstAskedAt ||
      life.paperwork?.secondAskedAt ||
      life.paperwork?.firstAskedAt
    if (!stamp) {
      return { waitUntil: clampWake(daysFromNow(D, now), now), detail: 'no chase — pause' }
    }
    const d = new Date(stamp)
    d.setDate(d.getDate() + D)
    d.setHours(9, 0, 0, 0)
    return { waitUntil: clampWake(d.toISOString(), now), detail: `after chase + ${D}` }
  }

  return { waitUntil: clampWake(daysFromNow(parseDays(node.data.days, 3), now), now), detail: 'pause' }
}

function resolveSimpleWait(node: FlowNode, now: Date, fallbackDays: number): string {
  return clampWake(daysFromNow(parseDays(node.data.days, fallbackDays), now), now)
}

function brokerEmail(broker: Record<string, unknown> | undefined): string {
  if (!broker) return ''
  const emails = broker.emails as Array<{ email?: string; category?: string }> | undefined
  const accounting = emails?.find((e) => e.category === 'accounting')?.email
  return String(accounting || emails?.[0]?.email || broker.email || '').trim()
}

async function sendTemplate(
  admin: ReturnType<typeof createClient>,
  templateId: string,
  to: string,
  data: Record<string, string>
): Promise<boolean> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey || !to) return false
  const { data: row } = await admin
    .from('email_templates')
    .select('subject, body_html')
    .eq('id', templateId)
    .maybeSingle()
  let subject = String(row?.subject ?? templateId)
  let html = String(row?.body_html ?? `<p>${templateId}</p>`)
  for (const [k, v] of Object.entries(data)) {
    subject = subject.replaceAll(`{{${k}}}`, v)
    html = html.replaceAll(`{{${k}}}`, v)
  }
  const from =
    Deno.env.get('RESEND_FROM_BROKER') ||
    Deno.env.get('RESEND_FROM_EMAIL') ||
    'Credyx <ops@credyx.net>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
  return res.ok
}

async function appendInvoiceNote(
  admin: ReturnType<typeof createClient>,
  invoice: Record<string, unknown>,
  note: string
): Promise<void> {
  const history = Array.isArray(invoice.notes_history) ? [...(invoice.notes_history as unknown[])] : []
  const now = new Date().toISOString()
  history.push({
    id: `note-${crypto.randomUUID()}`,
    note,
    created_by: 'Credyx Blueprint',
    created_at: now,
    type: 'note',
    visibility: 'internal',
  })
  await admin
    .from('invoices')
    .update({ notes_history: history, updated_at: now })
    .eq('id', invoice.id)
  invoice.notes_history = history
}

async function updateRun(
  admin: ReturnType<typeof createClient>,
  run: RunRow,
  patch: Partial<RunRow>
): Promise<void> {
  const next = { ...run, ...patch, updated_at: new Date().toISOString() }
  await admin.from('blueprint_runs').upsert(next, { onConflict: 'id' })
  Object.assign(run, next)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const cronSecret = Deno.env.get('OPS_CRON_SECRET')
    const providedCron = req.headers.get('x-cron-secret')
    const authHeader = req.headers.get('Authorization')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    let authorized = false
    if (cronSecret && providedCron && providedCron === cronSecret) {
      authorized = true
    } else if (authHeader) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userData, error: userError } = await userClient.auth.getUser()
      if (!userError && userData.user?.app_metadata?.role === 'admin') {
        authorized = true
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!serviceKey) {
      return new Response(JSON.stringify({ error: 'Service role not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const now = new Date()
    const nowIso = now.toISOString()

    let limit = 40
    try {
      const body = await req.json()
      if (body && typeof body.limit === 'number' && body.limit > 0) {
        limit = Math.min(100, Math.floor(body.limit))
      }
    } catch {
      /* empty body ok */
    }

    const { data: dueRuns, error: dueErr } = await admin
      .from('blueprint_runs')
      .select('*')
      .eq('status', 'waiting')
      .not('wait_until', 'is', null)
      .lte('wait_until', nowIso)
      .order('wait_until', { ascending: true })
      .limit(limit)

    if (dueErr) {
      return new Response(JSON.stringify({ error: dueErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let advanced = 0
    const details: string[] = []

    for (const raw of dueRuns ?? []) {
      const run = raw as RunRow
      if (!run.subject_id) continue

      const { data: bp } = await admin
        .from('blueprints')
        .select('id, name, nodes, edges')
        .eq('id', run.blueprint_id)
        .maybeSingle()
      if (!bp) {
        details.push(`${run.id}: missing blueprint`)
        continue
      }

      const nodes = (Array.isArray(bp.nodes) ? bp.nodes : []) as FlowNode[]
      const edges = (Array.isArray(bp.edges) ? bp.edges : []) as FlowEdge[]
      const byId = new Map(nodes.map((n) => [n.id, n]))
      let current = run.current_node_id ? byId.get(run.current_node_id) : null
      if (!current || current.data.kind !== 'wait') {
        current = nodes.find((n) => n.data.kind === 'wait') ?? null
      }
      if (!current) {
        details.push(`${run.id}: no Wait node`)
        continue
      }

      // Leave the Wait that is due
      let next = nextNodes(current.id, nodes, edges)[0] ?? null
      if (!next) {
        await updateRun(admin, run, {
          status: 'stopped',
          current_step: 'Stopped · no next step after Wait',
          wait_until: null,
        })
        advanced += 1
        details.push(`${run.id}: stopped (no next)`)
        continue
      }

      let invoice: Record<string, unknown> | null = null
      let broker: Record<string, unknown> | undefined
      if (run.subject === 'invoice') {
        const { data: inv } = await admin.from('invoices').select('*').eq('id', run.subject_id).maybeSingle()
        invoice = inv as Record<string, unknown> | null
        if (!invoice) {
          details.push(`${run.id}: invoice missing`)
          continue
        }
        const { data: bro } = await admin
          .from('brokers')
          .select('*')
          .eq('id', String(invoice.broker_id ?? ''))
          .maybeSingle()
        broker = (bro as Record<string, unknown>) || undefined
      }

      let guard = 0
      current = next
      const runDetails: string[] = []

      while (current && guard < 40) {
        guard += 1
        const data = current.data

        if (data.kind === 'wait') {
          let waitUntil: string
          let detail: string
          if (run.subject === 'invoice' && invoice) {
            const r = resolveInvoiceWait(current, invoice, broker, now)
            waitUntil = r.waitUntil
            detail = r.detail
          } else {
            waitUntil = resolveSimpleWait(current, now, run.subject === 'batch' ? 1 : 3)
            detail = 'pause from step'
          }
          await updateRun(admin, run, {
            status: 'waiting',
            current_node_id: current.id,
            current_step: `Wait until · ${data.label || data.waitUntilId || 'clock'}`,
            wait_until: waitUntil,
            blueprint_name: String(bp.name ?? run.blueprint_name),
          })
          runDetails.push(`Waiting: ${detail}`)
          break
        }

        if (isWhen(data)) {
          let raw = false
          if (run.subject === 'invoice' && invoice) {
            raw = evaluateInvoiceWhen(data.checkId, invoice)
          }
          const ok = whenPasses(data, raw)
          const after = nextAfterWhen(current.id, nodes, edges, ok)
          if (!ok) {
            await updateRun(admin, run, {
              status: 'waiting',
              current_node_id: current.id,
              current_step: `Waiting · ${data.label || data.checkId || 'When'}`,
              wait_until: null,
            })
            runDetails.push('Parked at When')
            break
          }
          if (!after) {
            await updateRun(admin, run, {
              status: 'completed',
              current_node_id: current.id,
              current_step: 'Done',
              wait_until: null,
            })
            runDetails.push('When → Done')
            break
          }
          current = after
          continue
        }

        if (data.kind === 'action') {
          await updateRun(admin, run, {
            status: 'active',
            current_node_id: current.id,
            current_step: `Then do · ${data.label || 'tasks'}`,
            wait_until: null,
          })
          const ids = getActionIds(data)
          const tag = `(Blueprint: ${run.blueprint_name || bp.name})`
          for (const actionId of ids) {
            if (run.subject === 'invoice' && invoice) {
              if (
                actionId === 'add_note' ||
                actionId === 'notify_carrier' ||
                actionId === 'will_pay' ||
                actionId === 'call_back'
              ) {
                const msg =
                  data.actionConfigs?.[actionId]?.message?.trim() ||
                  `Blueprint action: ${actionId}`
                await appendInvoiceNote(admin, invoice, `${msg}\n\n${tag}`)
                runDetails.push(`note:${actionId}`)
              } else if (
                actionId === 'email_payment_status' ||
                actionId === 'email_followup'
              ) {
                const to = brokerEmail(broker)
                const templateId =
                  actionId === 'email_followup'
                    ? 'broker_payment_status_followup'
                    : 'broker_payment_status_inquiry'
                const ok = await sendTemplate(admin, templateId, to, {
                  brokerName: String(broker?.name ?? invoice.broker_name ?? ''),
                  invoiceNumber: String(invoice.invoice_number ?? ''),
                  loadNumber: String(invoice.load_number ?? 'N/A'),
                  amount: String(invoice.amount ?? ''),
                  clientName: String(invoice.client_name ?? ''),
                  extraNote: data.actionConfigs?.[actionId]?.message?.trim() || '',
                })
                await appendInvoiceNote(
                  admin,
                  invoice,
                  ok
                    ? `${actionId}: emailed ${to}.\n\n${tag}`
                    : `${actionId}: email skipped/failed.\n\n${tag}`
                )
                runDetails.push(ok ? `email:${actionId}` : `email-fail:${actionId}`)
              } else {
                await appendInvoiceNote(
                  admin,
                  invoice,
                  `Server wake skipped action "${actionId}" (client-only).\n\n${tag}`
                )
                runDetails.push(`skip:${actionId}`)
              }
            } else {
              runDetails.push(`action:${actionId}`)
            }
          }
          const after = nextNodes(current.id, nodes, edges)[0] ?? null
          if (!after) {
            await updateRun(admin, run, {
              status: 'completed',
              current_step: 'Done · after Then do',
              wait_until: null,
            })
            runDetails.push('Done')
            break
          }
          current = after
          continue
        }

        if (data.kind === 'stop') {
          await updateRun(admin, run, {
            status: 'completed',
            current_node_id: current.id,
            current_step: 'Done',
            wait_until: null,
          })
          runDetails.push('Done')
          break
        }

        // Start / branch / other — step forward
        const after = nextNodes(current.id, nodes, edges)[0] ?? null
        if (!after) {
          await updateRun(admin, run, {
            status: 'completed',
            current_step: 'Done',
            wait_until: null,
          })
          break
        }
        current = after
      }

      advanced += 1
      details.push(`${run.id}: ${runDetails.join('; ') || 'advanced'}`)
    }

    return new Response(
      JSON.stringify({ ok: true, advanced, scanned: (dueRuns ?? []).length, details }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
