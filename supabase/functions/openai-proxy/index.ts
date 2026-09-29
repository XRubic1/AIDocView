import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-auth, x-credyx-ai-secret',
}

/** Admin staff or authenticated carrier portal user. */
function isAllowedUser(user: {
  app_metadata?: Record<string, unknown>
}): boolean {
  const meta = user.app_metadata ?? {}
  if (meta.role === 'admin') return true
  const clientId = meta.client_id
  return typeof clientId === 'string' && clientId.length > 0
}

function jsonError(status: number, error: string, detail?: unknown) {
  return new Response(JSON.stringify({ error, detail: detail ?? null }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function readMachineSecret(req: Request): string | null {
  const header = req.headers.get('x-credyx-ai-secret')?.trim()
  if (header) return header
  return null
}

function expectedMachineSecrets(): string[] {
  return [Deno.env.get('OPS_CRON_SECRET'), Deno.env.get('CREDYX_AI_SECRET')]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
}

type CredyxJobAuth = { batchId?: string; jobId?: string; healthCheck?: boolean }

function stripCredyxMeta(body: unknown): {
  openaiBody: unknown
  jobAuth: CredyxJobAuth | null
  healthCheck: boolean
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { openaiBody: body, jobAuth: null, healthCheck: false }
  }
  const record = body as Record<string, unknown>
  const meta = record._credyx
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { openaiBody: body, jobAuth: null, healthCheck: false }
  }
  const { _credyx: _, ...openaiBody } = record
  const job = meta as Record<string, unknown>
  const healthCheck = job.healthCheck === true
  return {
    openaiBody,
    jobAuth: {
      batchId: typeof job.batchId === 'string' ? job.batchId : undefined,
      jobId: typeof job.jobId === 'string' ? job.jobId : undefined,
      healthCheck,
    },
    healthCheck,
  }
}

/** Allow automated batch pipelines without a human session. */
async function isActiveBatchJob(
  supabaseUrl: string,
  serviceKey: string,
  jobAuth: CredyxJobAuth | null
): Promise<boolean> {
  if (!jobAuth?.batchId || !jobAuth?.jobId || !serviceKey) return false
  try {
    const admin = createClient(supabaseUrl, serviceKey)
    const { data, error } = await admin
      .from('batch_processing_jobs')
      .select('id, status')
      .eq('id', jobAuth.jobId)
      .eq('batch_id', jobAuth.batchId)
      .maybeSingle()
    if (error || !data) return false
    const status = String((data as { status?: string }).status ?? '')
    return status === 'pending' || status === 'running'
  } catch {
    return false
  }
}

function startOfUtcMonth(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString()
}

type AiSettings = {
  aiEnabled?: boolean | null
  limitEnabled?: boolean
  monthlyCapUsd?: number | null
}

/** Enforce platform master switch + per-carrier caps (uploads stay open in the app). */
async function assertAiSpendAllowed(
  supabaseUrl: string,
  serviceKey: string,
  clientId: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!serviceKey) return { ok: true }
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: policy } = await admin.from('ai_policy').select('*').eq('id', 1).maybeSingle()
  const aiEnabled = policy ? (policy as { ai_enabled?: boolean }).ai_enabled !== false : true
  const orgCapRaw = policy
    ? Number((policy as { monthly_spend_cap_usd?: number | null }).monthly_spend_cap_usd)
    : NaN
  const defaultClientCapRaw = policy
    ? Number(
        (policy as { default_client_monthly_cap_usd?: number | null }).default_client_monthly_cap_usd
      )
    : NaN
  const orgCap = Number.isFinite(orgCapRaw) && orgCapRaw > 0 ? orgCapRaw : null
  const defaultClientCap =
    Number.isFinite(defaultClientCapRaw) && defaultClientCapRaw > 0 ? defaultClientCapRaw : null

  if (!aiEnabled) {
    return {
      ok: false,
      message: 'AI processing is turned off platform-wide. Documents can still be uploaded.',
    }
  }

  const since = startOfUtcMonth()
  const { data: orgRows } = await admin
    .from('ai_usage_events')
    .select('estimated_cost_usd')
    .gte('created_at', since)
  const orgSpent = (orgRows ?? []).reduce(
    (sum, row) => sum + Number((row as { estimated_cost_usd?: number }).estimated_cost_usd ?? 0),
    0
  )
  if (orgCap != null && orgSpent >= orgCap) {
    return {
      ok: false,
      message: 'Platform AI monthly spend cap reached. Documents can still be uploaded.',
    }
  }

  if (!clientId) return { ok: true }

  const { data: clientRow } = await admin
    .from('clients')
    .select('ai_settings')
    .eq('id', clientId)
    .maybeSingle()
  const settings = ((clientRow as { ai_settings?: AiSettings } | null)?.ai_settings ??
    {}) as AiSettings

  if (settings.aiEnabled === false) {
    return {
      ok: false,
      message: 'AI processing is disabled for this carrier. Documents can still be uploaded.',
    }
  }

  const clientCap =
    settings.limitEnabled === true
      ? settings.monthlyCapUsd != null && Number(settings.monthlyCapUsd) > 0
        ? Number(settings.monthlyCapUsd)
        : defaultClientCap
      : null

  if (clientCap != null) {
    const { data: clientRows } = await admin
      .from('ai_usage_events')
      .select('estimated_cost_usd')
      .eq('client_id', clientId)
      .gte('created_at', since)
    const spent = (clientRows ?? []).reduce(
      (sum, row) => sum + Number((row as { estimated_cost_usd?: number }).estimated_cost_usd ?? 0),
      0
    )
    if (spent >= clientCap) {
      return {
        ok: false,
        message: 'This carrier hit their AI monthly spend cap. Documents can still be uploaded.',
      }
    }
  }

  return { ok: true }
}

async function resolveClientIdForSpend(
  supabaseUrl: string,
  serviceKey: string,
  userClientId: string | null,
  jobAuth: CredyxJobAuth | null
): Promise<string | null> {
  if (userClientId) return userClientId
  if (!jobAuth?.batchId || !serviceKey) return null
  try {
    const admin = createClient(supabaseUrl, serviceKey)
    const { data } = await admin
      .from('batches')
      .select('client_id')
      .eq('id', jobAuth.batchId)
      .maybeSingle()
    const id = (data as { client_id?: string } | null)?.client_id
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}

function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const pricing: Record<string, { in: number; out: number }> = {
    'gpt-4.1-mini': { in: 0.4, out: 1.6 },
    'gpt-4.1': { in: 2.0, out: 8.0 },
    'gpt-4o-mini': { in: 0.15, out: 0.6 },
    'gpt-4o': { in: 2.5, out: 10.0 },
  }
  const key =
    Object.keys(pricing)
      .filter((k) => model.startsWith(k))
      .sort((a, b) => b.length - a.length)[0] ?? 'gpt-4.1'
  const p = pricing[key] ?? pricing['gpt-4.1']
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out
}

async function recordUsage(
  supabaseUrl: string,
  serviceKey: string,
  clientId: string | null,
  openaiBody: unknown,
  responseText: string
): Promise<void> {
  if (!serviceKey) return
  try {
    const payload = JSON.parse(responseText) as {
      model?: string
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }
    const prompt = payload.usage?.prompt_tokens ?? 0
    const completion = payload.usage?.completion_tokens ?? 0
    const total = payload.usage?.total_tokens ?? prompt + completion
    const model =
      payload.model ||
      (openaiBody && typeof openaiBody === 'object' && typeof (openaiBody as { model?: unknown }).model === 'string'
        ? (openaiBody as { model: string }).model
        : 'gpt-4.1')
    const admin = createClient(supabaseUrl, serviceKey)
    await admin.from('ai_usage_events').insert({
      client_id: clientId,
      feature: 'proxy',
      model,
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: total,
      estimated_cost_usd: estimateCostUsd(model, prompt, completion),
    })
  } catch (err) {
    console.warn('[openai-proxy] usage ledger', err)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      return jsonError(500, 'OpenAI not configured', 'Set OPENAI_API_KEY secret')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnon =
      Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return jsonError(400, 'Invalid JSON body')
    }

    const { openaiBody, jobAuth, healthCheck } = stripCredyxMeta(rawBody)

    // 1) Machine / cron secret (edge → OpenAI, no user session).
    const providedSecret = readMachineSecret(req)
    const machineOk =
      Boolean(providedSecret) && expectedMachineSecrets().includes(providedSecret!)

    // 2) Signed-in admin / carrier JWT.
    let userOk = false
    let userClientId: string | null = null
    const authHeader = req.headers.get('Authorization')
    if (!machineOk && authHeader?.startsWith('Bearer ') && supabaseUrl && supabaseAnon) {
      const jwt = authHeader.slice('Bearer '.length).trim()
      if (jwt) {
        const supabase = createClient(supabaseUrl, supabaseAnon)
        const { data: userData, error: userError } = await supabase.auth.getUser(jwt)
        if (!userError && userData.user && isAllowedUser(userData.user)) {
          userOk = true
          const meta = userData.user.app_metadata ?? {}
          if (typeof meta.client_id === 'string') userClientId = meta.client_id
        }
      }
    }

    // 3) Active batch processing job (browser pipeline after submit / integrations).
    const jobOk =
      !machineOk &&
      !userOk &&
      (await isActiveBatchJob(supabaseUrl, serviceKey, jobAuth))

    if (!machineOk && !userOk && !jobOk) {
      return jsonError(
        401,
        'Unauthorized',
        'Sign in, or run via an active batch processing job / machine secret'
      )
    }

    // Health checks skip spend caps so admins can diagnose OpenAI outages while AI is paused.
    if (!healthCheck) {
      const spendClientId = await resolveClientIdForSpend(
        supabaseUrl,
        serviceKey,
        userClientId,
        jobAuth
      )
      const spendGate = await assertAiSpendAllowed(supabaseUrl, serviceKey, spendClientId)
      if (!spendGate.ok) {
        return jsonError(403, 'AI spend blocked', spendGate.message)
      }
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openaiBody),
    })

    const text = await response.text()
    if (response.ok && !healthCheck) {
      const spendClientId = await resolveClientIdForSpend(
        supabaseUrl,
        serviceKey,
        userClientId,
        jobAuth
      )
      void recordUsage(supabaseUrl, serviceKey, spendClientId, openaiBody, text)
    }

    return new Response(text, {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Proxy error'
    console.error('[openai-proxy]', message)
    return jsonError(500, 'Proxy error', message)
  }
})
