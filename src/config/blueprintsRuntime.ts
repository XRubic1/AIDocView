/**
 * Feature flag for the parallel invoice blueprint runner.
 * Source of truth: platform_settings.blueprints_runtime (server-wide).
 * localStorage mirrors for tests / offline before hydrate.
 */

const STORAGE_KEY = 'credyx.blueprints_runner.enabled'
const CHANGED_EVENT = 'credyx:blueprints-runner-changed'

let enabledMem = false
let hydratedFromServer = false

function readLocalMirror(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeLocalMirror(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function emitChanged(enabled: boolean): void {
  try {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { enabled } }))
  } catch {
    /* ignore */
  }
}

/** True when Live runner is on (server value after hydrate; local mirror before). */
export function isBlueprintsRunnerEnabled(): boolean {
  if (hydratedFromServer) return enabledMem
  return readLocalMirror()
}

/**
 * Apply Live runner on/off in-memory (+ local mirror + event).
 * Prefer `saveBlueprintsRunnerEnabled` from platformSettingsService for admin toggles
 * so every admin and Edge cron share the same value.
 */
export function applyBlueprintsRunnerEnabled(enabled: boolean, opts?: { fromServer?: boolean }): void {
  enabledMem = enabled
  if (opts?.fromServer) hydratedFromServer = true
  writeLocalMirror(enabled)
  emitChanged(enabled)
}

/** Sync apply for tests / demos. Does not write Supabase. */
export function setBlueprintsRunnerEnabled(enabled: boolean): void {
  applyBlueprintsRunnerEnabled(enabled)
}

export const BLUEPRINTS_RUNNER_CHANGED_EVENT = CHANGED_EVENT
export const BLUEPRINTS_RUNTIME_SETTINGS_KEY = 'blueprints_runtime'
