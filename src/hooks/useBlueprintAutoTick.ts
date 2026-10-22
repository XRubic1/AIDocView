import { useEffect } from 'react'
import { isBlueprintsRunnerEnabled } from '../config/blueprintsRuntime'
import {
  BLUEPRINT_RUNS_CHANGED_EVENT,
  listBlueprintRuns,
} from '../components/blueprints/blueprintRuns'

/** Safety net: sweep for anything missed. */
const SWEEP_EVERY_MS = 5 * 60 * 1000
const FIRST_SWEEP_MS = 20 * 1000
/** Fire this long after a wake time so the server clock is surely past it. */
const WAKE_SLACK_MS = 3 * 1000
/** setTimeout can't hold more than ~24.8 days; re-plan before that. */
const MAX_TIMER_MS = 6 * 60 * 60 * 1000
const LOCK_KEY = 'credyx:blueprint-auto-tick-at'

/** Only one open admin tab runs a given check, so a step never fires twice. */
function claimTick(windowMs: number): boolean {
  try {
    const last = Number(localStorage.getItem(LOCK_KEY) ?? 0)
    if (Date.now() - last < windowMs) return false
    localStorage.setItem(LOCK_KEY, String(Date.now()))
  } catch {
    /* storage unavailable — tick anyway */
  }
  return true
}

/** Earliest future (or just-passed) wake time among waiting runs. */
function nextWakeAt(): number | null {
  let best: number | null = null
  for (const run of listBlueprintRuns()) {
    if (run.status !== 'waiting' || !run.waitUntil) continue
    const t = new Date(run.waitUntil).getTime()
    if (!Number.isFinite(t)) continue
    if (best == null || t < best) best = t
  }
  return best
}

/**
 * While an admin has the portal open, run each blueprint step at its exact time
 * (a timer is set for the next wake), plus a 5-minute sweep as a safety net.
 * A scheduled `blueprint-wake-cron` does the same with no tab open.
 */
export function useBlueprintAutoTick(): void {
  useEffect(() => {
    let timer: number | undefined
    let running = false

    const tick = async (windowMs: number) => {
      if (running || !isBlueprintsRunnerEnabled() || !claimTick(windowMs)) return
      running = true
      try {
        const { tickBlueprintRuns } = await import('../components/blueprints/blueprintRunner')
        await tickBlueprintRuns('Credyx Blueprint')
      } catch (err) {
        console.warn('[blueprints] auto tick failed', err)
      } finally {
        running = false
        plan()
      }
    }

    const plan = () => {
      window.clearTimeout(timer)
      const wake = nextWakeAt()
      if (wake == null) return
      const delay = Math.min(Math.max(wake - Date.now() + WAKE_SLACK_MS, 1_000), MAX_TIMER_MS)
      // Exact-time ticks only need to avoid double-firing across tabs in the same moment.
      timer = window.setTimeout(() => void tick(15_000), delay)
    }

    plan()
    const onChange = () => plan()
    window.addEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, onChange)
    const first = window.setTimeout(() => void tick(SWEEP_EVERY_MS - 5_000), FIRST_SWEEP_MS)
    const sweep = window.setInterval(() => void tick(SWEEP_EVERY_MS - 5_000), SWEEP_EVERY_MS)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(first)
      window.clearInterval(sweep)
      window.removeEventListener(BLUEPRINT_RUNS_CHANGED_EVENT, onChange)
    }
  }, [])
}
