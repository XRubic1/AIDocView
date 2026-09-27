/**
 * Legacy chase entrypoint. The clock ladder now runs as blueprint graphs
 * inside `runBlueprintServerTick` (same engine as blueprint-wake-cron).
 * Keeping this function means an existing email-lifecycle-chase schedule
 * still chases brokers after the cutover.
 *
 * Auth: `x-cron-secret: $OPS_CRON_SECRET`
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
    if (!cronSecret || providedCron !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: 'Service role not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const result = await runBlueprintServerTick(admin, { limit: 40 })
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
