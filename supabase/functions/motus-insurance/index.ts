import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  authorityIdsFromCarrier,
  buildMotusReport,
  parseMotusQuery,
  type MotusQuery,
} from '../../../src/utils/motusInsurance.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MOTUS = 'https://motus.dot.gov/api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { ok: false, status: 401, error: 'Sign in as an admin to run this test.' }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  })
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { ok: false, status: 401, error: 'Sign in as an admin to run this test.' }
  if (data.user.app_metadata?.role !== 'admin') {
    return { ok: false, status: 403, error: 'This test is limited to admins.' }
  }
  return { ok: true }
}

async function getJson(url: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    const text = await response.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
    }
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

function motusFailed(result: { ok: boolean; status: number }): boolean {
  return !result.ok && result.status !== 404 && result.status !== 400
}

async function getJsonRetry(url: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  let result = await getJson(url)
  for (let attempt = 1; attempt < 3 && motusFailed(result); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 600 * attempt))
    result = await getJson(url)
  }
  return result
}

async function dotForDocket(prefix: string, number: string): Promise<string | null> {
  const where = encodeURIComponent(`docket_number='${prefix}${number}'`)
  const url = `https://data.transportation.gov/resource/c5y8-a4uz.json?$select=usdot_number&$where=${where}&$limit=1`
  const result = await getJsonRetry(url)
  const row = Array.isArray(result.data) ? result.data[0] : null
  const dot = row && typeof row === 'object' ? String((row as { usdot_number?: string }).usdot_number ?? '') : ''
  const digits = dot.replace(/\D/g, '')
  return digits || null
}

async function resolveDot(query: MotusQuery): Promise<string | null> {
  if (query.kind === 'docket') return dotForDocket(query.prefix, query.number)
  const direct = await getJsonRetry(`${MOTUS}/carriers/${query.dot}`)
  if (direct.ok && direct.data && typeof direct.data === 'object') return query.dot
  return dotForDocket('MC', query.dot)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const admin = await requireAdmin(req)
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status)

    const payload = (await req.json().catch(() => ({}))) as { query?: string }
    const query = parseMotusQuery(String(payload.query ?? ''))
    if (!query) {
      return jsonResponse({ error: 'Enter a DOT number, an MC number, or a MOTUS account link.' }, 400)
    }

    const dot = await resolveDot(query)
    if (!dot) return jsonResponse({ error: 'No MOTUS account found for that number.' }, 404)

    const carrier = await getJsonRetry(`${MOTUS}/carriers/${dot}`)
    if (motusFailed(carrier)) return jsonResponse({ error: 'MOTUS lookup failed' }, 502)
    if (!carrier.ok || !carrier.data || typeof carrier.data !== 'object') {
      return jsonResponse({ error: 'No MOTUS account found for that number.' }, 404)
    }

    const ids = authorityIdsFromCarrier(carrier.data)
    let viewFailed = false
    const authorities = await Promise.all(
      ids.map(async (id) => {
        const [detail, minimumBipd] = await Promise.all([
          getJsonRetry(`${MOTUS}/regulatedEntity/oa/${id}/getOAPublicView`),
          getJsonRetry(`${MOTUS}/filings/minimum-bipd/${id}`),
        ])
        if (!detail.ok) viewFailed = true
        return {
          detail: detail.ok ? detail.data : null,
          minimumBipd: minimumBipd.ok ? minimumBipd.data : null,
        }
      })
    )

    const report = buildMotusReport({
      dotNumber: dot,
      carrier: carrier.data,
      authorities,
    })
    if (!report.authorities.length) {
      if (viewFailed) return jsonResponse({ error: 'MOTUS lookup failed' }, 502)
      return jsonResponse({ error: 'MOTUS has this DOT, but no operating authority was on the account.' }, 404)
    }
    return jsonResponse(report)
  } catch {
    return jsonResponse({ error: 'MOTUS lookup failed' }, 500)
  }
})
