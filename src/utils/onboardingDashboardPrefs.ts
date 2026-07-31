/**
 * Onboarding dashboard reveal / unlock prefs — per-client localStorage.
 * Mirrors the client notification prefs pattern (keyed by clientId).
 */

const storageKey = (clientId: string) => `credyx-onboarding-dashboard:${clientId}`

/** CustomEvent name — ClientLayout dispatches; OnboardingDashboard listens. */
export const REPLAY_ONBOARDING_TOUR_EVENT = 'credyx:replay-onboarding-tour'

export type OnboardingDashboardPrefs = {
  /**
   * Welcome + spotlight tour completed (or skipped).
   * Also mirrored onto hasSeenOnboardingReveal for older readers.
   */
  hasSeenTour: boolean
  /** Legacy: first-login staged reveal completed. Kept in sync with hasSeenTour. */
  hasSeenOnboardingReveal: boolean
  /** Fade-in for Actions list already played. */
  hasSeenActionsReveal: boolean
  /** Fade-in for Broker risk already played. */
  hasSeenBrokerRiskReveal: boolean
  /** Fade-in for Account overview already played. */
  hasSeenAccountOverviewReveal: boolean
  /** “How to submit invoices” follow-on tour completed. */
  hasSeenSubmitTour: boolean
  /** Batches follow-on tour completed. */
  hasSeenBatchTour: boolean
  /** Invoice status follow-on tour completed. */
  hasSeenInvoiceStatusTour: boolean
}

export const DEFAULT_ONBOARDING_DASHBOARD_PREFS: OnboardingDashboardPrefs = {
  hasSeenTour: false,
  hasSeenOnboardingReveal: false,
  hasSeenActionsReveal: false,
  hasSeenBrokerRiskReveal: false,
  hasSeenAccountOverviewReveal: false,
  hasSeenSubmitTour: false,
  hasSeenBatchTour: false,
  hasSeenInvoiceStatusTour: false,
}

/** Normalize older localStorage payloads that only had hasSeenOnboardingReveal. */
function normalizePrefs(
  parsed: Partial<OnboardingDashboardPrefs>
): OnboardingDashboardPrefs {
  const merged = { ...DEFAULT_ONBOARDING_DASHBOARD_PREFS, ...parsed }
  // Either flag means the tour/reveal already ran.
  const seen = Boolean(merged.hasSeenTour || merged.hasSeenOnboardingReveal)
  return {
    ...merged,
    hasSeenTour: seen,
    hasSeenOnboardingReveal: seen,
  }
}

/** Read onboarding prefs for a client; returns defaults on missing/invalid data. */
export function getOnboardingDashboardPrefs(clientId: string): OnboardingDashboardPrefs {
  if (typeof window === 'undefined' || !clientId) {
    return { ...DEFAULT_ONBOARDING_DASHBOARD_PREFS }
  }
  try {
    const raw = localStorage.getItem(storageKey(clientId))
    if (!raw) return { ...DEFAULT_ONBOARDING_DASHBOARD_PREFS }
    const parsed = JSON.parse(raw) as Partial<OnboardingDashboardPrefs>
    return normalizePrefs(parsed)
  } catch {
    return { ...DEFAULT_ONBOARDING_DASHBOARD_PREFS }
  }
}

/** Persist partial onboarding prefs for a client. */
export function setOnboardingDashboardPrefs(
  clientId: string,
  patch: Partial<OnboardingDashboardPrefs>
): OnboardingDashboardPrefs {
  const next = normalizePrefs({ ...getOnboardingDashboardPrefs(clientId), ...patch })
  // Keep legacy + new flags aligned when either is patched.
  if (patch.hasSeenTour !== undefined || patch.hasSeenOnboardingReveal !== undefined) {
    const seen = Boolean(next.hasSeenTour || next.hasSeenOnboardingReveal)
    next.hasSeenTour = seen
    next.hasSeenOnboardingReveal = seen
  }
  if (typeof window !== 'undefined' && clientId) {
    try {
      localStorage.setItem(storageKey(clientId), JSON.stringify(next))
    } catch {
      /* ignore quota / private mode */
    }
  }
  return next
}

/** Clear all onboarding prefs so the welcome + tour can run again. */
export function resetOnboardingDashboardPrefs(clientId: string): OnboardingDashboardPrefs {
  const next = { ...DEFAULT_ONBOARDING_DASHBOARD_PREFS }
  if (typeof window !== 'undefined' && clientId) {
    try {
      localStorage.setItem(storageKey(clientId), JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  return next
}

/** Notify OnboardingDashboard to restart the tour (same-tab). */
export function dispatchReplayOnboardingTour(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(REPLAY_ONBOARDING_TOUR_EVENT))
}
