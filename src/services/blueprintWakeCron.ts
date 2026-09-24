/**
 * Invoke server blueprint Wait wake (edge) or fall back to local tick.
 */
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { hydrateBlueprintsFromSupabase } from './supabase/blueprintPersist'

export type BlueprintWakeResult = {
  advanced: number
  source: 'server' | 'local'
  details?: string[]
}

/** Call edge `blueprint-wake-cron` with the signed-in admin session. */
export async function invokeBlueprintWakeCron(
  limit = 40
): Promise<BlueprintWakeResult | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase.functions.invoke('blueprint-wake-cron', {
    body: { limit },
  })
  if (error) {
    console.warn('[blueprintWakeCron] invoke failed', error.message)
    return null
  }
  const advanced = Number((data as { advanced?: number } | null)?.advanced ?? 0)
  const details = (data as { details?: string[] } | null)?.details
  try {
    await hydrateBlueprintsFromSupabase()
  } catch (err) {
    console.warn('[blueprintWakeCron] re-hydrate failed', err)
  }
  return {
    advanced: Number.isFinite(advanced) ? advanced : 0,
    source: 'server',
    details,
  }
}
