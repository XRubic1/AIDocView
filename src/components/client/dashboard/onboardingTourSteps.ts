/**
 * Spotlight tour step definitions for the onboarding dashboard.
 */

export type OnboardTargetId =
  | 'openBalance'
  | 'donut'
  | 'stats'
  | 'aging'
  | 'charts'
  | 'actions'
  | 'brokerRisk'
  | 'accountOverview'

export type OnboardTourStepId =
  | 'welcome'
  | OnboardTargetId
  | 'done'

export type OnboardTourStep = {
  id: OnboardTourStepId
  /** Spotlight target; null for welcome/done full-screen steps. */
  target: OnboardTargetId | null
  title: string
  body: string
  /** Section must be visible/unlocked for this step to appear in the active tour. */
  requires?: 'actions' | 'brokerRisk' | 'accountOverview'
}

/** Ordered tour steps (welcome first; unlock-gated steps filtered at runtime). */
export const ONBOARD_TOUR_STEPS: OnboardTourStep[] = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to Credyx',
    body: 'Your back office, in one portal. We’ll walk through your A/R dashboard one piece at a time.',
  },
  {
    id: 'openBalance',
    target: 'openBalance',
    title: 'Open Balance',
    body: 'Your total open A/R and what was collected in the last 30 days — the pulse of what’s outstanding.',
  },
  {
    id: 'donut',
    target: 'donut',
    title: 'On-time vs overdue',
    body: 'A quick split of open balance that is still on time versus past due.',
  },
  {
    id: 'stats',
    target: 'stats',
    title: 'Status breakdown',
    body: 'Held, overdue, awaiting, and recently paid amounts at a glance.',
  },
  {
    id: 'aging',
    target: 'aging',
    title: 'Aging A/R',
    body: 'This shows invoices by how long they’ve been outstanding.',
  },
  {
    id: 'charts',
    target: 'charts',
    title: 'Invoiced & collected',
    body: 'Trends for what you’ve invoiced versus what’s been collected — plus an upcoming forecast.',
  },
  {
    id: 'actions',
    target: 'actions',
    title: 'Actions',
    body: 'Items that need your attention — holds, overdue invoices, and payment confirms.',
    requires: 'actions',
  },
  {
    id: 'brokerRisk',
    target: 'brokerRisk',
    title: 'Broker risk',
    body: 'How your brokers tend to pay — reliable, watch list, or slow.',
    requires: 'brokerRisk',
  },
  {
    id: 'accountOverview',
    target: 'accountOverview',
    title: 'Account overview',
    body: 'Collected vs invoiced over the last week, month, or year — your collection rate over time.',
    requires: 'accountOverview',
  },
]

export type TourUnlockFlags = {
  actions: boolean
  brokerRisk: boolean
  accountOverview: boolean
}

/** Filter gated steps that aren’t unlocked yet. */
export function buildActiveTourSteps(unlocks: TourUnlockFlags): OnboardTourStep[] {
  return ONBOARD_TOUR_STEPS.filter((step) => {
    if (!step.requires) return true
    return unlocks[step.requires]
  })
}

/** Which dashboard pieces should be visible for the current tour index (inclusive). */
export function revealedTargetsThrough(
  steps: OnboardTourStep[],
  stepIndex: number
): Set<OnboardTargetId> {
  const revealed = new Set<OnboardTargetId>()
  for (let i = 0; i <= stepIndex && i < steps.length; i += 1) {
    const t = steps[i]?.target
    if (t) revealed.add(t)
  }
  return revealed
}
