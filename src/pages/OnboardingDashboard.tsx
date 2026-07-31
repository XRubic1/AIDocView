/**
 * OnboardingDashboard — welcome + spotlight tour, then usage unlocks.
 * Reuses Open Balance, Actions, charts, Account overview; no ticker / coming-due / detail cols.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import DashboardActionTable from '../components/client/dashboard/DashboardActionTable'
import { DashboardChartsPanel } from '../components/client/dashboard/DashboardSparkCharts'
import OpenBalanceCard from '../components/client/dashboard/OpenBalanceCard'
import AccountGrowthCard from '../components/client/dashboard/AccountGrowthCard'
import OnboardingIntro from '../components/client/dashboard/OnboardingIntro'
import OnboardingTourOverlay from '../components/client/dashboard/OnboardingTourOverlay'
import SubmitTourOffer from '../components/client/dashboard/SubmitTourOffer'
import {
  buildActiveTourSteps,
  revealedTargetsThrough,
  type OnboardTargetId,
} from '../components/client/dashboard/onboardingTourSteps'
import { useClientDemoSnapshot } from '../hooks/useClientDemoSnapshot'
import { useClientSession } from '../hooks/useClientSession'
import { isInvoiceOverdue, isOpenArInvoice } from '../utils/invoiceAging'
import { mapClientVisibleInvoices } from '../utils/clientInvoiceView'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../utils/paymentVariance'
import { formatCurrency } from '../utils/format'
import {
  getOnboardingDashboardPrefs,
  setOnboardingDashboardPrefs,
  REPLAY_ONBOARDING_TOUR_EVENT,
  type OnboardingDashboardPrefs,
} from '../utils/onboardingDashboardPrefs'
import {
  chromeStageFromTour,
  pathsForDashboardTourStep,
  useOnboardingChrome,
} from '../context/OnboardingChromeContext'
import '../styles/clientDashboard.css'

type Phase = 'welcome' | 'tour' | 'submitOffer' | 'done'

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function patchPrefs(
  clientId: string,
  patch: Partial<OnboardingDashboardPrefs>,
  setPrefs: (p: OnboardingDashboardPrefs) => void
): OnboardingDashboardPrefs {
  const next = setOnboardingDashboardPrefs(clientId, patch)
  setPrefs(next)
  return next
}

export default function OnboardingDashboard() {
  const { clientId, clientName } = useClientSession()
  const { setChrome, resetChrome, startSubmitTour, revealNavPaths } = useOnboardingChrome()
  const { invoices: rawInvoices, payments, dashboard, loading } = useClientDemoSnapshot()
  const invoices = useMemo(() => mapClientVisibleInvoices(rawInvoices), [rawInvoices])

  const [prefs, setPrefs] = useState<OnboardingDashboardPrefs>(() =>
    getOnboardingDashboardPrefs(clientId || '')
  )
  const [phase, setPhase] = useState<Phase>(() =>
    getOnboardingDashboardPrefs(clientId || '').hasSeenTour ? 'done' : 'welcome'
  )
  const [stepIndex, setStepIndex] = useState(0)
  /** Targets that just appeared this session (for entrance animation). */
  const [justRevealed, setJustRevealed] = useState<Partial<Record<OnboardTargetId, boolean>>>({})
  const [replayKey, setReplayKey] = useState(0)

  const restartTour = useCallback(() => {
    const next = getOnboardingDashboardPrefs(clientId || '')
    setPrefs(next)
    setPhase(next.hasSeenTour ? 'done' : 'welcome')
    setStepIndex(0)
    setJustRevealed({})
    setReplayKey((k) => k + 1)
  }, [clientId])

  useEffect(() => {
    if (!clientId) return
    restartTour()
  }, [clientId, restartTour])

  useEffect(() => {
    const onReplay = () => restartTour()
    window.addEventListener(REPLAY_ONBOARDING_TOUR_EVENT, onReplay)
    return () => window.removeEventListener(REPLAY_ONBOARDING_TOUR_EVENT, onReplay)
  }, [restartTour])

  useEffect(() => {
    return () => resetChrome()
  }, [resetChrome])

  const { onTimeAmount, overdueAmount, onTimeCount, overdueCount } = useMemo(() => {
    let onTime = 0
    let overdue = 0
    let onTimeN = 0
    let overdueN = 0
    for (const inv of invoices) {
      if (!isOpenArInvoice(inv)) continue
      const balance = getInvoiceOpenArBalance(inv, payments)
      if (balance <= AMOUNT_EPSILON) continue
      if (isInvoiceOverdue(inv)) {
        overdue += balance
        overdueN += 1
      } else {
        onTime += balance
        onTimeN += 1
      }
    }
    return {
      onTimeAmount: onTime,
      overdueAmount: overdue,
      onTimeCount: onTimeN,
      overdueCount: overdueN,
    }
  }, [invoices, payments])

  const recentCollections = useMemo(() => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    const last30 = payments
      .filter((p) => p.status === 'confirmed' && new Date(p.received_date) >= thirtyDaysAgo)
      .reduce((sum, p) => sum + p.amount, 0)

    const prev30 = payments
      .filter(
        (p) =>
          p.status === 'confirmed' &&
          new Date(p.received_date) >= sixtyDaysAgo &&
          new Date(p.received_date) < thirtyDaysAgo
      )
      .reduce((sum, p) => sum + p.amount, 0)

    let trend: 'up' | 'down' | 'flat' = 'flat'
    if (last30 > prev30 * 1.05) trend = 'up'
    else if (last30 < prev30 * 0.95) trend = 'down'

    return { amount: last30, period: 'last 30 days', trend }
  }, [payments])

  const statusChips = useMemo(() => {
    const heldInvoices = invoices.filter((inv) => inv.status === 'hold')
    const heldAmount = heldInvoices.reduce(
      (sum, inv) => sum + getInvoiceOpenArBalance(inv, payments),
      0
    )

    const overdueInvoices = invoices.filter((inv) => isInvoiceOverdue(inv) && isOpenArInvoice(inv))
    const overdueAmt = overdueInvoices.reduce(
      (sum, inv) => sum + getInvoiceOpenArBalance(inv, payments),
      0
    )

    const awaitingInvoices = invoices.filter(
      (inv) => inv.status === 'approved' && isOpenArInvoice(inv) && !isInvoiceOverdue(inv)
    )
    const awaitingAmount = awaitingInvoices.reduce(
      (sum, inv) => sum + getInvoiceOpenArBalance(inv, payments),
      0
    )

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const paid30d = payments.filter(
      (p) => p.status === 'confirmed' && new Date(p.received_date) >= thirtyDaysAgo
    )
    const paid30dAmount = paid30d.reduce((sum, p) => sum + p.amount, 0)

    return [
      {
        key: 'held',
        label: 'Held',
        value: formatCurrency(heldAmount),
        count: heldInvoices.length,
        tone: 'warn' as const,
        navigateTo: '/client/invoices?status=hold',
      },
      {
        key: 'overdue',
        label: 'Overdue',
        value: formatCurrency(overdueAmt),
        count: overdueInvoices.length,
        tone: 'danger' as const,
        navigateTo: '/client/invoices?status=overdue',
      },
      {
        key: 'awaiting',
        label: 'Awaiting',
        value: formatCurrency(awaitingAmount),
        count: awaitingInvoices.length,
        tone: 'info' as const,
        navigateTo: '/client/invoices?status=approved',
      },
      {
        key: 'paid30d',
        label: 'Paid 30d',
        value: formatCurrency(paid30dAmount),
        count: paid30d.length,
        tone: 'success' as const,
        navigateTo: '/client/payments',
      },
    ]
  }, [invoices, payments])

  const openInvoiceCount = useMemo(() => {
    let n = 0
    for (const inv of invoices) {
      if (!isOpenArInvoice(inv)) continue
      if (getInvoiceOpenArBalance(inv, payments) <= AMOUNT_EPSILON) continue
      n += 1
    }
    return n
  }, [invoices, payments])

  const brokersWithPaymentHistory = useMemo(() => {
    const names = new Set<string>()
    for (const p of payments) {
      if (p.status !== 'confirmed' && p.status !== 'awaiting_receipt') continue
      const name = (p.broker_name || '').trim()
      if (name) names.add(name)
    }
    return names.size
  }, [payments])

  const hasFullMonthActivity = useMemo(() => {
    const now = new Date()
    let oldest: Date | null = null
    for (const inv of invoices) {
      const d = new Date(inv.invoice_date)
      if (Number.isNaN(d.getTime())) continue
      if (!oldest || d < oldest) oldest = d
    }
    for (const p of payments) {
      const d = new Date(p.received_date)
      if (Number.isNaN(d.getTime())) continue
      if (!oldest || d < oldest) oldest = d
    }
    if (!oldest) return false
    return daysBetween(oldest, now) >= 30
  }, [invoices, payments])

  const unlockActions = openInvoiceCount > 5
  const unlockBrokerRisk = unlockActions && brokersWithPaymentHistory >= 2
  const unlockAccountOverview = hasFullMonthActivity

  const tourSteps = useMemo(
    () =>
      buildActiveTourSteps({
        actions: unlockActions,
        brokerRisk: unlockBrokerRisk,
        accountOverview: unlockAccountOverview,
      }),
    [unlockActions, unlockBrokerRisk, unlockAccountOverview]
  )

  // Tour steps exclude welcome for spotlight overlay index after start.
  const spotlightSteps = useMemo(
    () => tourSteps.filter((s) => s.id !== 'welcome'),
    [tourSteps]
  )

  // Progressive sidebar / topbar unlock tied to tour progress.
  useEffect(() => {
    // Welcome intro + submit-offer bridge: hide full chrome (navbar + topbar).
    if (phase === 'welcome' || phase === 'submitOffer') {
      setChrome({ progressive: true, stage: 'welcome' })
      return
    }
    const stepId =
      phase === 'tour'
        ? spotlightSteps[stepIndex]?.id ?? null
        : phase === 'done'
          ? 'done'
          : null
    const stage = chromeStageFromTour(
      phase === 'done' ? 'done' : 'tour',
      stepId
    )
    setChrome({
      progressive: phase !== 'done',
      stage: phase === 'done' ? 'full' : stage,
    })
    if (phase === 'tour' && stepId) {
      revealNavPaths(pathsForDashboardTourStep(stepId))
    }
  }, [phase, stepIndex, spotlightSteps, setChrome, revealNavPaths])

  const completeTour = useCallback(() => {
    if (!clientId) {
      setPhase('done')
      return
    }
    const nextPrefs = patchPrefs(
      clientId,
      {
        hasSeenTour: true,
        hasSeenOnboardingReveal: true,
        ...(unlockActions ? { hasSeenActionsReveal: true } : {}),
        ...(unlockBrokerRisk ? { hasSeenBrokerRiskReveal: true } : {}),
        ...(unlockAccountOverview ? { hasSeenAccountOverviewReveal: true } : {}),
      },
      setPrefs
    )
    setJustRevealed({})
    // Offer submit tour once after dashboard tour, if not already seen.
    if (!nextPrefs.hasSeenSubmitTour) {
      setPhase('submitOffer')
      return
    }
    setPhase('done')
  }, [clientId, unlockActions, unlockBrokerRisk, unlockAccountOverview])

  const dismissSubmitOffer = () => {
    if (clientId) {
      patchPrefs(clientId, { hasSeenSubmitTour: true }, setPrefs)
    }
    setPhase('done')
  }

  const beginSubmitTour = () => {
    if (clientId) {
      patchPrefs(clientId, { hasSeenSubmitTour: true }, setPrefs)
    }
    setPhase('done')
    startSubmitTour()
  }

  /** After About → dashboard spotlight tour (navbar begins unlocking). */
  const beginPortalTour = () => {
    setPhase('tour')
    setStepIndex(0)
    const first = spotlightSteps[0]
    if (first?.target) {
      setJustRevealed({ [first.target]: true })
    }
  }

  const markReveal = (target: OnboardTargetId | null) => {
    if (!target) return
    setJustRevealed((s) => ({ ...s, [target]: true }))
  }

  const goNext = () => {
    if (stepIndex >= spotlightSteps.length - 1) {
      completeTour()
      return
    }
    const next = stepIndex + 1
    setStepIndex(next)
    markReveal(spotlightSteps[next]?.target ?? null)
  }

  const goBack = () => {
    if (stepIndex <= 0) return
    setStepIndex((i) => i - 1)
  }

  // Visibility: during tour, show targets revealed through current step; after done, show all core + unlocks.
  const revealed = useMemo(() => {
    if (phase === 'done' || phase === 'submitOffer') {
      return new Set<OnboardTargetId>([
        'openBalance',
        'donut',
        'stats',
        'aging',
        'charts',
        ...(unlockActions ? (['actions'] as OnboardTargetId[]) : []),
        ...(unlockBrokerRisk ? (['brokerRisk'] as OnboardTargetId[]) : []),
        ...(unlockAccountOverview ? (['accountOverview'] as OnboardTargetId[]) : []),
      ])
    }
    if (phase === 'welcome') {
      return new Set<OnboardTargetId>()
    }
    return revealedTargetsThrough(spotlightSteps, stepIndex)
  }, [
    phase,
    stepIndex,
    spotlightSteps,
    unlockActions,
    unlockBrokerRisk,
    unlockAccountOverview,
  ])

  const show = (id: OnboardTargetId) => revealed.has(id)
  const revealClass = (id: OnboardTargetId) =>
    justRevealed[id] && phase === 'tour' ? 'cd-onboard-reveal' : undefined

  // Post-tour usage unlocks — one-time entrance when a section newly unlocks later.
  useEffect(() => {
    if (loading || !clientId || phase !== 'done') return

    if (unlockActions && !prefs.hasSeenActionsReveal) {
      setJustRevealed((s) => ({ ...s, actions: true }))
      patchPrefs(clientId, { hasSeenActionsReveal: true }, setPrefs)
    }
    if (unlockBrokerRisk && !prefs.hasSeenBrokerRiskReveal) {
      setJustRevealed((s) => ({ ...s, brokerRisk: true }))
      patchPrefs(clientId, { hasSeenBrokerRiskReveal: true }, setPrefs)
    }
    if (unlockAccountOverview && !prefs.hasSeenAccountOverviewReveal) {
      setJustRevealed((s) => ({ ...s, accountOverview: true }))
      patchPrefs(clientId, { hasSeenAccountOverviewReveal: true }, setPrefs)
    }
  }, [
    loading,
    clientId,
    phase,
    unlockActions,
    unlockBrokerRisk,
    unlockAccountOverview,
    prefs.hasSeenActionsReveal,
    prefs.hasSeenBrokerRiskReveal,
    prefs.hasSeenAccountOverviewReveal,
  ])

  const currentSpotlight = spotlightSteps[stepIndex]
  const showOpenBalanceShell = show('openBalance') || show('donut') || show('stats') || show('aging')

  const isImmersive = phase === 'welcome' || phase === 'submitOffer'

  return (
    <div
      className={`client-dashboard cd-onboarding-dashboard${isImmersive ? ' is-welcome' : ''}`}
      key={replayKey}
    >
      <div className="client-dashboard__bg" aria-hidden>
        <div className="client-dashboard__waves" />
        <div className="client-dashboard__waves client-dashboard__waves--slow" />
        <div className="client-dashboard__glow" />
      </div>

      <div className="client-dashboard__content">
        <div className="client-dashboard__body">
          {/* Hide body chrome under welcome so waves + copy read cleanly */}
          <div
            className={`client-dashboard__body-inner${isImmersive ? ' is-welcome-hidden' : ''}`}
            aria-hidden={isImmersive}
          >
          <aside className="client-dashboard__rail" aria-label="Account summary">
            {showOpenBalanceShell ? (
              <div
                className={`cd-onboard-section${
                  revealClass('openBalance') ? ` ${revealClass('openBalance')}` : ''
                }`}
              >
                <OpenBalanceCard
                  amount={dashboard.summary.total_ar}
                  onTimeAmount={show('donut') ? onTimeAmount : undefined}
                  overdueAmount={show('donut') ? overdueAmount : undefined}
                  onTimeCount={show('donut') ? onTimeCount : undefined}
                  overdueCount={show('donut') ? overdueCount : undefined}
                  recentCollections={show('openBalance') ? recentCollections : undefined}
                  statusChips={show('stats') ? statusChips : []}
                  aging={show('aging') ? dashboard.aging_ar : undefined}
                  statsClassName={revealClass('stats')}
                  agingClassName={revealClass('aging')}
                  loading={loading}
                />
              </div>
            ) : (
              <div className="cd-onboard-placeholder" aria-hidden />
            )}

            {show('accountOverview') && unlockAccountOverview ? (
              <div
                className={`cd-onboard-section${
                  revealClass('accountOverview') ? ` ${revealClass('accountOverview')}` : ''
                }`}
                data-onboard-target="accountOverview"
              >
                <AccountGrowthCard
                  invoices={invoices}
                  payments={payments}
                  loading={loading}
                />
              </div>
            ) : null}
          </aside>

          {show('actions') && unlockActions ? (
            <div
              className={`cd-onboard-actions-wrap${
                revealClass('actions') ? ` ${revealClass('actions')}` : ''
              }`}
              data-onboard-target="actions"
            >
              <DashboardActionTable
                invoices={invoices}
                payments={payments}
                showBrokerRisk={show('brokerRisk') && unlockBrokerRisk}
                brokerRiskClassName={
                  show('brokerRisk') && unlockBrokerRisk
                    ? `cd-onboard-broker${revealClass('brokerRisk') ? ` ${revealClass('brokerRisk')}` : ''}`
                    : undefined
                }
              />
            </div>
          ) : null}

          {show('charts') ? (
            <div
              className={`cd-onboard-charts-wrap${
                revealClass('charts') ? ` ${revealClass('charts')}` : ''
              }`}
              data-onboard-target="charts"
            >
              <DashboardChartsPanel invoices={invoices} payments={payments} />
            </div>
          ) : null}
          </div>
        </div>
      </div>

      {phase === 'welcome' ? (
        <OnboardingIntro
          carrierName={clientName}
          onContinueToPortal={beginPortalTour}
          onSkip={completeTour}
        />
      ) : null}

      {phase === 'submitOffer' ? (
        <SubmitTourOffer onStart={beginSubmitTour} onSkip={dismissSubmitOffer} />
      ) : null}

      {phase === 'tour' && currentSpotlight ? (
        <OnboardingTourOverlay
          step={currentSpotlight}
          stepIndex={stepIndex}
          stepCount={spotlightSteps.length}
          onNext={goNext}
          onBack={goBack}
          onSkip={completeTour}
        />
      ) : null}
    </div>
  )
}
