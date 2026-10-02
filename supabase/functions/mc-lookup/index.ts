import { authorizeLookup } from '../_shared/lookupAuth.ts'
import { runMcCreditSource, type McCreditSource } from '../_shared/mcCreditSources.ts'

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

function normalizeMc(input: string): string {
  return input.replace(/^MC\s*/i, '').replace(/\D/g, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const caller = await authorizeLookup(req)
    if (!caller.ok) return jsonResponse({ error: caller.error }, caller.status)

    const payload = (await req.json().catch(() => ({}))) as { mc?: string; sources?: string }
    const mc = normalizeMc(String(payload.mc ?? ''))
    if (!mc) return jsonResponse({ error: 'Enter an MC number.' }, 400)

    const all: McCreditSource[] = ['compass', 'trufunding', 'factorsnetwork']
    const requested = String(payload.sources ?? 'all')
    const selected =
      requested === 'all' || requested === 'both'
        ? all
        : all.filter((source) => requested.split(',').includes(source))
    if (!selected.length) return jsonResponse({ error: 'No valid sources selected.' }, 400)

    const sources = await Promise.all(selected.map((source) => runMcCreditSource(source, mc)))
    const results = sources.flatMap((source) => (source.ok ? source.results.map(toPublicRecord) : []))
    return jsonResponse({
      mc,
      queriedAt: new Date().toISOString(),
      results,
    })
  } catch {
    return jsonResponse({ error: 'MC lookup failed' }, 500)
  }
})

function toPublicRecord(row: {
  mc: string
  company: string
  dba?: string
  city?: string
  state?: string
  address?: string
  phone?: string
  email?: string | string[]
  creditRating: string
  paydex: string | number
  creditScore: string | number
  noBuy?: string
  warning?: string
  creditNote?: string
  rateDate?: string
  calcInvCount?: {
    all?: string | number
    days90?: string | number
    days60?: string | number
  }
  creditExpireDate?: string
  payFasterPercent?: string | number
  calcDaysToPay?: {
    all?: string | number
    days90?: string | number
    days60?: string | number
  }
}) {
  return {
    mc: row.mc,
    company: row.company,
    dba: row.dba,
    city: row.city,
    state: row.state,
    address: row.address,
    phone: row.phone,
    email: row.email,
    creditRating: row.creditRating,
    paydex: row.paydex,
    creditScore: row.creditScore,
    noBuy: publicNote(row.noBuy),
    warning: publicNote(row.warning),
    creditNote: publicNote(row.creditNote),
    rateDate: row.rateDate,
    creditExpireDate: row.creditExpireDate,
    payFasterPercent: row.payFasterPercent,
    calcDaysToPay: row.calcDaysToPay,
    calcInvCount: row.calcInvCount,
  }
}

function publicNote(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (/factors\s*network|compass|trufunding|location records/i.test(value)) return undefined
  return value
}
