/**
 * Blueprint runner cron — enrolls chase graphs and advances due Waits
 * without an open admin tab.
 *
 * Auth: `x-cron-secret: $OPS_CRON_SECRET` or admin JWT.
 * Schedule (suggested): every 15–60 min.
 *
 * Reply reading is not evaluated. Broker replied / no reply stay parked.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runBlueprintServerTick } from '../_shared/blueprintEngine.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
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
    let limit = 40
    try {
      const body = await req.json()
      if (body && typeof body.limit === 'number' && body.limit > 0) {
        limit = Math.min(80, Math.floor(body.limit))
      }
    } catch {
      /* empty body ok */
    }

    const result = await runBlueprintServerTick(admin, { limit })
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
