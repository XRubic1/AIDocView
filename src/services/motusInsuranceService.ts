import { requireSupabase } from '../lib/supabase'
import type { MotusInsuranceReport } from '../utils/motusInsurance'

/** Admin test: public MOTUS authority and insurance for a DOT, MC, or account link. */
export async function lookupMotusInsurance(query: string): Promise<MotusInsuranceReport> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.functions.invoke('motus-insurance', {
    body: { query },
  })

  const payload = data as (MotusInsuranceReport & { error?: string }) | null
  if (payload?.error) throw new Error(payload.error)
  if (error || !payload?.dotNumber) throw new Error('MOTUS lookup failed')
  return payload
}
