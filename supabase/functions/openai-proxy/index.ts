import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-auth',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError(401, 'Unauthorized', 'Missing Bearer token')
    }

    const jwt = authHeader.slice('Bearer '.length).trim()
    if (!jwt) {
      return jsonError(401, 'Unauthorized', 'Empty Bearer token')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnon =
      Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? ''
    if (!supabaseUrl || !supabaseAnon) {
      return jsonError(500, 'Supabase env missing on Edge Function')
    }

    const supabase = createClient(supabaseUrl, supabaseAnon)
    // Pass JWT explicitly — more reliable than only setting global headers.
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !userData.user) {
      return jsonError(401, 'Unauthorized', userError?.message ?? 'Invalid session')
    }

    if (!isAllowedUser(userData.user)) {
      return jsonError(
        403,
        'Forbidden',
        'User needs app_metadata.role=admin or app_metadata.client_id'
      )
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      return jsonError(500, 'OpenAI not configured', 'Set OPENAI_API_KEY secret')
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonError(400, 'Invalid JSON body')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const text = await response.text()
    // Always return OpenAI body; keep status so the client can show real errors.
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
