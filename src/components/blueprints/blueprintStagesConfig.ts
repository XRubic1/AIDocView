/**
 * Invoice stage settings (Blueprints → Stages). Source of truth:
 * platform_settings.blueprint_stages — mirrored to localStorage for pre-hydrate reads.
 */
import {
  activeStageConfig,
  normalizeStageConfig,
  type InvoiceStageConfig,
} from '../../../supabase/functions/_shared/invoiceStages'

const STORAGE_KEY = 'credyx.blueprint_stages.v1'
export const BLUEPRINT_STAGES_CHANGED_EVENT = 'credyx:blueprint-stages-changed'

let cache: InvoiceStageConfig | null | undefined

function readLocal(): InvoiceStageConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeStageConfig(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/** Saved settings (on or off), or null when never set up. */
export function getStageConfig(): InvoiceStageConfig | null {
  if (cache === undefined) cache = readLocal()
  return cache
}

/** Settings to route with — null while stages are off or not set up. */
export function getActiveStageConfig(): InvoiceStageConfig | null {
  return activeStageConfig(getStageConfig())
}

/** Replace the in-memory settings (hydrate / save). Does not write Supabase. */
export function applyStageConfig(next: unknown): void {
  cache = normalizeStageConfig(next)
  try {
    if (cache) localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore quota */
  }
  try {
    window.dispatchEvent(new CustomEvent(BLUEPRINT_STAGES_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}
