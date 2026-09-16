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

type CredyxJobAuth = { batchId?: string; jobId?: string }

function stripCredyxMeta(body: unknown): {
  openaiBody: unknown
  jobAuth: CredyxJobAuth | null
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { openaiBody: body, jobAuth: null }
  }
  const record = body as Record<string, unknown>
  const meta = record._credyx
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { openaiBody: body, jobAuth: null }
  }
  const { _credyx: _, ...openaiBody } = record
  const job = meta as Record<string, unknown>
  return {
    openaiBody,
    jobAuth: {
      batchId: typeof job.batchId === 'string' ? job.batchId : undefined,
      jobId: typeof job.jobId === 'string' ? job.jobId : undefined,
    },
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

    const { openaiBody, jobAuth } = stripCredyxMeta(rawBody)

    // 1) Machine / cron secret (edge → OpenAI, no user session).
    const providedSecret = readMachineSecret(req)
    const machineOk =
      Boolean(providedSecret) && expectedMachineSecrets().includes(providedSecret!)

    // 2) Signed-in admin / carrier JWT.
    let userOk = false
    const authHeader = req.headers.get('Authorization')
    if (!machineOk && authHeader?.startsWith('Bearer ') && supabaseUrl && supabaseAnon) {
      const jwt = authHeader.slice('Bearer '.length).trim()
      if (jwt) {
        const supabase = createClient(supabaseUrl, supabaseAnon)
        const { data: userData, error: userError } = await supabase.auth.getUser(jwt)
        if (!userError && userData.user && isAllowedUser(userData.user)) {
          userOk = true
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openaiBody),
    })

    const text = await response.text()
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
