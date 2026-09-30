import { requireSupabase } from '../lib/supabase'
import type { McCreditRecord, McCreditSearchResponse } from '../types/mcCreditLookup'
import { redactVendorText } from '../utils/mcCreditAssessment'

type RawPayload = {
  mc?: string
  queriedAt?: string
  error?: string
  results?: McCreditRecord[]
  sources?: Array<{ ok?: boolean; error?: string; results?: McCreditRecord[] }>
}

function presentRecord(row: McCreditRecord): McCreditRecord {
  const warning = redactVendorText(row.warning)
  const noBuy = redactVendorText(row.noBuy)
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
    noBuy,
    warning,
    creditNote: redactVendorText(row.creditNote),
    rateDate: row.rateDate,
    creditExpireDate: row.creditExpireDate,
    payFasterPercent: row.payFasterPercent,
    calcDaysToPay: row.calcDaysToPay,
    calcInvCount: row.calcInvCount,
  }
}

/** Broker credit lookup. The response does not name upstream providers. */
export async function lookupMcCredit(mc: string): Promise<McCreditSearchResponse> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.functions.invoke('mc-lookup', {
    body: { mc },
  })

  const payload = data as RawPayload | null
  if (error) {
    throw new Error('MC lookup failed')
  }

  const rows =
    payload?.results ??
    payload?.sources?.flatMap((source) => (source.ok ? source.results ?? [] : [])) ??
    []

  if (!payload?.mc || (!payload.results && !payload.sources)) {
    throw new Error('MC lookup failed')
  }

  return {
    mc: payload.mc,
    queriedAt: payload.queriedAt ?? new Date().toISOString(),
    results: rows.map(presentRecord),
  }
}
