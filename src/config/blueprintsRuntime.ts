/** Feature flag for the parallel invoice blueprint runner (default off). */

const STORAGE_KEY = 'credyx.blueprints_runner.enabled'
const CHANGED_EVENT = 'credyx:blueprints-runner-changed'

export function isBlueprintsRunnerEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setBlueprintsRunnerEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
    window.dispatchEvent(
      new CustomEvent(CHANGED_EVENT, { detail: { enabled } })
    )
  } catch {
    /* ignore */
  }
}

export const BLUEPRINTS_RUNNER_CHANGED_EVENT = CHANGED_EVENT
