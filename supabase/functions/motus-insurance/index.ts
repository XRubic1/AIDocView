import { authorizeLookup } from '../_shared/lookupAuth.ts'
import { fetchMotusReport } from '../_shared/motusLookup.ts'
import { parseMotusQuery } from '../../../src/utils/motusInsurance.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const caller = await authorizeLookup(req)
    if (!caller.ok) return jsonResponse({ error: caller.error }, caller.status)

    const payload = (await req.json().catch(() => ({}))) as { query?: string }
    const query = parseMotusQuery(String(payload.query ?? ''))
    if (!query) {
      return jsonResponse({ error: 'Enter a DOT number, an MC number, or a MOTUS account link.' }, 400)
    }

    const result = await fetchMotusReport(query)
    if (!result.ok) return jsonResponse({ error: result.error }, result.status)
    return jsonResponse(result.report)
  } catch {
    return jsonResponse({ error: 'MOTUS lookup failed' }, 500)
  }
})
