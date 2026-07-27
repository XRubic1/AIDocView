/**
 * Broker risk weekly job — edge skeleton.
 *
 * Schedule (intended): Sunday 12:00 America/Chicago via Supabase scheduled function
 * or external cron hitting this endpoint with a service-role / cron secret.
 *
 * Phase 0: authenticates admin or cron secret, records a job-run ack.
 * Real recompute should call into shared rules/LLM workers once wired to service role.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const runId = `job-${crypto.randomUUID()}`
    const startedAt = new Date().toISOString()

    const { error: insertError } = await admin.from('ops_job_runs').insert({
      id: runId,
      kind: 'broker_risk_weekly',
      status: 'running',
      started_at: startedAt,
      detail: { source: 'edge:broker-risk-weekly', phase: 'skeleton' },
    })

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Phase 0 skeleton: acknowledge the schedule hook. Phase 1 fills broker recompute.
    await admin
      .from('ops_job_runs')
      .update({
        status: 'succeeded',
        finished_at: new Date().toISOString(),
        success_count: 0,
        skipped_count: 0,
        detail: {
          source: 'edge:broker-risk-weekly',
          phase: 'skeleton',
          note: 'Schedule endpoint live. Client-side rules backfill handles profiles until LLM batch is wired.',
        },
      })
      .eq('id', runId)

    return new Response(
      JSON.stringify({
        ok: true,
        runId,
        message: 'broker-risk-weekly skeleton accepted',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Job error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
