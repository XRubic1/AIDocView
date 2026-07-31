/**
 * Progressive chrome unlock during /client/onboarding tour.
 * Nav items unlock one path at a time as tours introduce them.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ClientNavItem, ClientNavSection } from '../config/clientNav'
import type { OnboardTargetId, OnboardTourStepId } from '../components/client/dashboard/onboardingTourSteps'
import { SUBMIT_INVOICE_TOUR_STEPS } from '../components/client/dashboard/submitInvoiceTourSteps'
import {
  getFollowOnTourSteps,
  type FollowOnTourKind,
} from '../components/client/dashboard/invoiceStatusTourSteps'

/** How far the sidebar / topbar has unlocked during onboarding. */
export type OnboardingChromeStage =
  | 'welcome'
  | 'balance'
  | 'status'
  | 'charts'
  | 'actions'
  | 'brokers'
  | 'full'

/** Canonical nav paths used for progressive unlock. */
export const ONBOARD_NAV = {
  dashboard: '/client/dashboard',
  batches: '/client/batches',
  invoices: '/client/invoices',
  documents: '/client/documents',
  submitDocs: '/client/batches?tab=create',
  collections: '/client/collections',
  brokers: '/client/brokers',
  assistant: '/client/assistant',
  payments: '/client/payments',
  shortPayments: '/client/short-payments',
  reports: '/client/reports',
  settings: '/client/settings',
  tutorials: '/client/tutorials',
  support: 'mailto:support@credyx.com',
} as const

export type OnboardNavPath = (typeof ONBOARD_NAV)[keyof typeof ONBOARD_NAV]

/** Full menu order — used when unlocking remaining items one-by-one. */
export const ALL_ONBOARD_NAV_PATHS: OnboardNavPath[] = [
  ONBOARD_NAV.dashboard,
  ONBOARD_NAV.batches,
  ONBOARD_NAV.invoices,
  ONBOARD_NAV.documents,
  ONBOARD_NAV.submitDocs,
  ONBOARD_NAV.collections,
  ONBOARD_NAV.brokers,
  ONBOARD_NAV.assistant,
  ONBOARD_NAV.payments,
  ONBOARD_NAV.shortPayments,
  ONBOARD_NAV.reports,
  ONBOARD_NAV.tutorials,
  ONBOARD_NAV.settings,
  ONBOARD_NAV.support,
]

type OnboardingChromeContextValue = {
  progressive: boolean
  stage: OnboardingChromeStage
  /** Paths visible in the sidebar while progressive. */
  unlockedNavPaths: string[]
  /** Paths that just appeared (for entrance animation). */
  justRevealedNavPaths: string[]
  setChrome: (next: { progressive: boolean; stage: OnboardingChromeStage }) => void
  /** Merge paths into the unlocked set (keeps prior unlocks). */
  revealNavPaths: (paths: string[]) => void
  /** Clears progressive dashboard chrome only (keeps follow-on tours alive). */
  resetChrome: () => void
  /** Clears progressive chrome + submit/status tours. */
  resetAllOnboardingChrome: () => void
  /** Submit-invoices tour */
  submitTourActive: boolean
  submitTourStepIndex: number
  startSubmitTour: (onComplete?: () => void) => void
  nextSubmitTourStep: () => void
  backSubmitTourStep: () => void
  skipSubmitTour: () => void
  completeSubmitTour: () => void
  /** Follow-on batch / invoice tours */
  statusTourOfferVisible: boolean
  /** Which offer is showing (batch vs invoice). */
  statusTourOfferKind: FollowOnTourKind | null
  showStatusTourOffer: (kind?: FollowOnTourKind) => void
  dismissStatusTourOffer: () => void
  statusTourActive: boolean
  statusTourKind: FollowOnTourKind | null
  statusTourStepIndex: number
  startBatchTour: () => void
  startStatusTour: () => void
  nextStatusTourStep: () => void
  backStatusTourStep: () => void
  skipStatusTour: () => void
  completeStatusTour: () => void
}

const OnboardingChromeContext = createContext<OnboardingChromeContextValue | null>(null)

const noop = () => undefined

const DEFAULT: OnboardingChromeContextValue = {
  progressive: false,
  stage: 'full',
  unlockedNavPaths: [...ALL_ONBOARD_NAV_PATHS],
  justRevealedNavPaths: [],
  setChrome: noop,
  revealNavPaths: noop,
  resetChrome: noop,
  resetAllOnboardingChrome: noop,
  submitTourActive: false,
  submitTourStepIndex: 0,
  startSubmitTour: noop,
  nextSubmitTourStep: noop,
  backSubmitTourStep: noop,
  skipSubmitTour: noop,
  completeSubmitTour: noop,
  statusTourOfferVisible: false,
  statusTourOfferKind: null,
  showStatusTourOffer: noop,
  dismissStatusTourOffer: noop,
  statusTourActive: false,
  statusTourKind: null,
  statusTourStepIndex: 0,
  startBatchTour: noop,
  startStatusTour: noop,
  nextStatusTourStep: noop,
  backStatusTourStep: noop,
  skipStatusTour: noop,
  completeStatusTour: noop,
}

/** Merge unique paths; returns { next, newlyAdded }. */
function mergeNavPaths(
  current: string[],
  incoming: string[]
): { next: string[]; newlyAdded: string[] } {
  const set = new Set(current)
  const newlyAdded: string[] = []
  for (const p of incoming) {
    if (!set.has(p)) {
      set.add(p)
      newlyAdded.push(p)
    }
  }
  return { next: Array.from(set), newlyAdded }
}

/** Paths unlocked at each dashboard chrome stage (cumulative). */
export function pathsForChromeStage(stage: OnboardingChromeStage): string[] {
  switch (stage) {
    case 'welcome':
      return []
    case 'balance':
      return [ONBOARD_NAV.dashboard]
    case 'status':
      return [ONBOARD_NAV.dashboard, ONBOARD_NAV.invoices]
    case 'charts':
      return [ONBOARD_NAV.dashboard, ONBOARD_NAV.invoices, ONBOARD_NAV.reports]
    case 'actions':
      return [
        ONBOARD_NAV.dashboard,
        ONBOARD_NAV.invoices,
        ONBOARD_NAV.reports,
        ONBOARD_NAV.batches,
        ONBOARD_NAV.documents,
      ]
    case 'brokers':
      return [
        ONBOARD_NAV.dashboard,
        ONBOARD_NAV.invoices,
        ONBOARD_NAV.reports,
        ONBOARD_NAV.batches,
        ONBOARD_NAV.documents,
        ONBOARD_NAV.brokers,
        ONBOARD_NAV.collections,
      ]
    case 'full':
    default:
      return [...ALL_ONBOARD_NAV_PATHS]
  }
}

/** Paths revealed when a status-tour step becomes active. */
export function pathsForStatusTourStep(stepId: string): string[] {
  switch (stepId) {
    case 'navInvoices':
    case 'invoicesNav':
      return [ONBOARD_NAV.dashboard, ONBOARD_NAV.invoices, ONBOARD_NAV.batches]
    case 'batchesNav':
    case 'batches':
    case 'openBatch':
    case 'batchCardNumber':
    case 'batchCardStatus':
    case 'batchCardInvoices':
    case 'batchCardAmount':
    case 'batchCardSubmitted':
    case 'batchCardOutcome':
    case 'batchInvoiceList':
      return [ONBOARD_NAV.batches]
    case 'openList':
    case 'openDetail':
    case 'hold':
    case 'ppw':
    case 'paid':
      return [ONBOARD_NAV.invoices]
    case 'awaiting':
    case 'confirm':
      return [ONBOARD_NAV.payments]
    case 'navDocuments':
      return [ONBOARD_NAV.documents]
    case 'navCollections':
      return [ONBOARD_NAV.collections]
    case 'navBrokers':
      return [ONBOARD_NAV.brokers]
    case 'navAssistant':
      return [ONBOARD_NAV.assistant]
    case 'navShortPayments':
      return [ONBOARD_NAV.shortPayments]
    case 'navReports':
      return [ONBOARD_NAV.reports]
    case 'navSettings':
      return [ONBOARD_NAV.settings, ONBOARD_NAV.tutorials, ONBOARD_NAV.support]
    case 'navSubmitDocs':
      return [ONBOARD_NAV.submitDocs]
    default:
      return []
  }
}

/** Paths revealed when a submit-tour step becomes active. */
export function pathsForSubmitTourStep(stepId: string): string[] {
  switch (stepId) {
    case 'uploadBtn':
      return [ONBOARD_NAV.dashboard, ONBOARD_NAV.batches]
    case 'submitNav':
      return [ONBOARD_NAV.submitDocs, ONBOARD_NAV.batches]
    case 'submitPage':
    case 'dropzone':
      return [ONBOARD_NAV.batches, ONBOARD_NAV.submitDocs]
    default:
      return [ONBOARD_NAV.batches]
  }
}

/** Map tour phase + current spotlight target to a chrome unlock stage. */
export function chromeStageFromTour(
  phase: 'welcome' | 'tour' | 'done',
  stepId: OnboardTourStepId | OnboardTargetId | null
): OnboardingChromeStage {
  if (phase === 'welcome') return 'welcome'
  if (phase === 'done') return 'full'

  switch (stepId) {
    case 'openBalance':
    case 'donut':
      return 'balance'
    case 'stats':
      return 'status'
    case 'aging':
      return 'status'
    case 'charts':
      return 'charts'
    case 'actions':
      return 'actions'
    case 'brokerRisk':
      return 'brokers'
    case 'accountOverview':
    case 'done':
      return 'full'
    default:
      return 'balance'
  }
}

/** Extra paths for dashboard spotlight steps (one-by-one beyond stage buckets). */
export function pathsForDashboardTourStep(
  stepId: OnboardTourStepId | OnboardTargetId | null
): string[] {
  switch (stepId) {
    case 'openBalance':
    case 'donut':
      return [ONBOARD_NAV.dashboard]
    case 'stats':
      return [ONBOARD_NAV.invoices]
    case 'aging':
      return [ONBOARD_NAV.collections]
    case 'charts':
      return [ONBOARD_NAV.reports]
    case 'actions':
      return [ONBOARD_NAV.batches]
    case 'brokerRisk':
      return [ONBOARD_NAV.brokers]
    case 'accountOverview':
      return [ONBOARD_NAV.documents]
    default:
      return []
  }
}

const STAGE_RANK: Record<OnboardingChromeStage, number> = {
  welcome: 0,
  balance: 1,
  status: 2,
  charts: 3,
  actions: 4,
  brokers: 5,
  full: 6,
}

/** Filter sidebar to only unlocked nav paths while progressive. */
export function filterNavForOnboardingStage(
  sections: ClientNavSection[],
  stage: OnboardingChromeStage,
  unlockedNavPaths?: string[]
): ClientNavSection[] {
  if (stage === 'full' && (!unlockedNavPaths || unlockedNavPaths.length === 0)) {
    return sections
  }
  if (stage === 'welcome' && (!unlockedNavPaths || unlockedNavPaths.length === 0)) {
    return []
  }

  const allowed = new Set(
    unlockedNavPaths && unlockedNavPaths.length > 0
      ? unlockedNavPaths
      : pathsForChromeStage(stage)
  )

  // full + explicit unlocks still respect the unlock list until tour completes
  if (stage === 'full' && unlockedNavPaths && unlockedNavPaths.length >= ALL_ONBOARD_NAV_PATHS.length) {
    return sections
  }

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => allowed.has(item.path)),
    }))
    .filter((section) => section.items.length > 0)
}

export function showUploadForStage(
  stage: OnboardingChromeStage,
  unlockedNavPaths?: string[]
): boolean {
  if (unlockedNavPaths?.includes(ONBOARD_NAV.batches) || unlockedNavPaths?.includes(ONBOARD_NAV.submitDocs)) {
    return true
  }
  return STAGE_RANK[stage] >= STAGE_RANK.actions
}

export function showAssistantBuddyForStage(
  stage: OnboardingChromeStage,
  unlockedNavPaths?: string[]
): boolean {
  if (unlockedNavPaths?.includes(ONBOARD_NAV.assistant)) return true
  return stage === 'full' && (!unlockedNavPaths || unlockedNavPaths.length >= ALL_ONBOARD_NAV_PATHS.length)
}

export function showNotificationsForStage(
  stage: OnboardingChromeStage,
  unlockedNavPaths?: string[]
): boolean {
  if (unlockedNavPaths?.includes(ONBOARD_NAV.invoices)) return true
  return STAGE_RANK[stage] >= STAGE_RANK.status
}

type CompleteHandler = (() => void) | null

export function OnboardingChromeProvider({ children }: { children: ReactNode }) {
  const [progressive, setProgressive] = useState(false)
  const [stage, setStage] = useState<OnboardingChromeStage>('full')
  const [unlockedNavPaths, setUnlockedNavPaths] = useState<string[]>([...ALL_ONBOARD_NAV_PATHS])
  const [justRevealedNavPaths, setJustRevealedNavPaths] = useState<string[]>([])
  const [submitTourActive, setSubmitTourActive] = useState(false)
  const [submitTourStepIndex, setSubmitTourStepIndex] = useState(0)
  const onSubmitCompleteRef = useRef<CompleteHandler>(null)

  const [statusTourOfferVisible, setStatusTourOfferVisible] = useState(false)
  const [statusTourOfferKind, setStatusTourOfferKind] = useState<FollowOnTourKind | null>(null)
  const [statusTourActive, setStatusTourActive] = useState(false)
  const [statusTourKind, setStatusTourKind] = useState<FollowOnTourKind | null>(null)
  const [statusTourStepIndex, setStatusTourStepIndex] = useState(0)
  const statusTourKindRef = useRef<FollowOnTourKind | null>(null)

  const revealNavPaths = useCallback((paths: string[]) => {
    if (paths.length === 0) return
    setUnlockedNavPaths((prev) => {
      const { next, newlyAdded } = mergeNavPaths(prev, paths)
      if (newlyAdded.length > 0) {
        setJustRevealedNavPaths(newlyAdded)
        window.setTimeout(() => {
          setJustRevealedNavPaths((cur) => cur.filter((p) => !newlyAdded.includes(p)))
        }, 400)
      }
      return next
    })
  }, [])

  const setChrome = useCallback(
    (next: { progressive: boolean; stage: OnboardingChromeStage }) => {
      setProgressive(next.progressive)
      setStage(next.stage)
      if (!next.progressive) {
        if (next.stage === 'full') {
          setUnlockedNavPaths([...ALL_ONBOARD_NAV_PATHS])
          setJustRevealedNavPaths([])
        }
        return
      }
      const stagePaths = pathsForChromeStage(next.stage)
      if (next.stage === 'welcome') {
        setUnlockedNavPaths([])
        setJustRevealedNavPaths([])
        return
      }
      setUnlockedNavPaths((prev) => {
        // Starting (or restarting) the dashboard tour — seed from stage only.
        if (next.stage === 'balance' && prev.length === 0) {
          setJustRevealedNavPaths(stagePaths)
          return stagePaths
        }
        if (next.stage === 'balance' && prev.length > 6) {
          setJustRevealedNavPaths(stagePaths)
          return stagePaths
        }
        const { next: merged, newlyAdded } = mergeNavPaths(prev, stagePaths)
        if (newlyAdded.length) setJustRevealedNavPaths(newlyAdded)
        return merged
      })
    },
    []
  )

  /**
   * Reset progressive dashboard chrome only.
   * Do NOT clear submit/status tours — those continue after leaving /client/onboarding.
   */
  const resetChrome = useCallback(() => {
    setProgressive(false)
    setStage('full')
    // Keep follow-on tour unlocks if those tours are still running.
    setUnlockedNavPaths((prev) =>
      submitTourActive || statusTourActive ? prev : [...ALL_ONBOARD_NAV_PATHS]
    )
    setJustRevealedNavPaths([])
  }, [submitTourActive, statusTourActive])

  /** Hard reset including follow-on tours (e.g. Replay from topbar). */
  const resetAllOnboardingChrome = useCallback(() => {
    setProgressive(false)
    setStage('full')
    setUnlockedNavPaths([...ALL_ONBOARD_NAV_PATHS])
    setJustRevealedNavPaths([])
    setSubmitTourActive(false)
    setSubmitTourStepIndex(0)
    setStatusTourOfferVisible(false)
    setStatusTourOfferKind(null)
    setStatusTourActive(false)
    setStatusTourKind(null)
    statusTourKindRef.current = null
    setStatusTourStepIndex(0)
  }, [])

  const completeSubmitTour = useCallback(() => {
    setSubmitTourActive(false)
    setSubmitTourStepIndex(0)
    // Stay progressive with current unlocks until status tour / offer.
    setProgressive(false)
    setStage('full')
    onSubmitCompleteRef.current?.()
    onSubmitCompleteRef.current = null
  }, [])

  const startSubmitTour = useCallback((onComplete?: () => void) => {
    onSubmitCompleteRef.current = onComplete ?? null
    setStatusTourOfferVisible(false)
    setStatusTourActive(false)
    setSubmitTourActive(true)
    setSubmitTourStepIndex(0)
    setProgressive(true)
    setStage('actions')
    const first = pathsForSubmitTourStep(SUBMIT_INVOICE_TOUR_STEPS[0]?.id ?? 'uploadBtn')
    setUnlockedNavPaths(first)
    setJustRevealedNavPaths(first)
  }, [])

  const nextSubmitTourStep = useCallback(() => {
    setSubmitTourStepIndex((i) => {
      if (i >= SUBMIT_INVOICE_TOUR_STEPS.length - 1) {
        queueMicrotask(() => completeSubmitTour())
        return i
      }
      const nextId = SUBMIT_INVOICE_TOUR_STEPS[i + 1]?.id
      if (nextId) {
        queueMicrotask(() => revealNavPaths(pathsForSubmitTourStep(nextId)))
      }
      return i + 1
    })
  }, [completeSubmitTour, revealNavPaths])

  const backSubmitTourStep = useCallback(() => {
    setSubmitTourStepIndex((i) => Math.max(0, i - 1))
  }, [])

  const skipSubmitTour = useCallback(() => {
    completeSubmitTour()
  }, [completeSubmitTour])

  const showStatusTourOffer = useCallback((kind: FollowOnTourKind = 'batch') => {
    setSubmitTourActive(false)
    setStatusTourActive(false)
    setStatusTourKind(null)
    statusTourKindRef.current = null
    setStatusTourOfferKind(kind)
    setStatusTourOfferVisible(true)
    setProgressive(false)
    setStage('full')
  }, [])

  const dismissStatusTourOffer = useCallback(() => {
    setStatusTourOfferVisible(false)
    setStatusTourOfferKind(null)
    setUnlockedNavPaths([...ALL_ONBOARD_NAV_PATHS])
  }, [])

  const completeStatusTour = useCallback(() => {
    setStatusTourActive(false)
    setStatusTourKind(null)
    statusTourKindRef.current = null
    setStatusTourStepIndex(0)
    setStatusTourOfferVisible(false)
    setStatusTourOfferKind(null)
    setProgressive(false)
    setStage('full')
    setUnlockedNavPaths([...ALL_ONBOARD_NAV_PATHS])
    setJustRevealedNavPaths([])
  }, [])

  const beginFollowOnTour = useCallback((kind: FollowOnTourKind) => {
    const steps = getFollowOnTourSteps(kind)
    setStatusTourOfferVisible(false)
    setStatusTourOfferKind(null)
    setSubmitTourActive(false)
    setStatusTourActive(true)
    setStatusTourKind(kind)
    statusTourKindRef.current = kind
    setStatusTourStepIndex(0)
    setProgressive(true)
    setStage(kind === 'batch' ? 'actions' : 'status')
    const first = pathsForStatusTourStep(steps[0]?.id ?? (kind === 'batch' ? 'batchesNav' : 'invoicesNav'))
    setUnlockedNavPaths(first)
    setJustRevealedNavPaths(first)
  }, [])

  const startBatchTour = useCallback(() => {
    beginFollowOnTour('batch')
  }, [beginFollowOnTour])

  const startStatusTour = useCallback(() => {
    beginFollowOnTour('invoice')
  }, [beginFollowOnTour])

  const nextStatusTourStep = useCallback(() => {
    const kind = statusTourKindRef.current
    if (!kind) return
    const steps = getFollowOnTourSteps(kind)
    setStatusTourStepIndex((i) => {
      if (i >= steps.length - 1) {
        queueMicrotask(() => completeStatusTour())
        return i
      }
      const nextId = steps[i + 1]?.id
      if (nextId) {
        queueMicrotask(() => revealNavPaths(pathsForStatusTourStep(nextId)))
      }
      return i + 1
    })
  }, [completeStatusTour, revealNavPaths])

  const backStatusTourStep = useCallback(() => {
    setStatusTourStepIndex((i) => Math.max(0, i - 1))
  }, [])

  const skipStatusTour = useCallback(() => {
    completeStatusTour()
  }, [completeStatusTour])

  const effectiveStage: OnboardingChromeStage = statusTourActive
    ? stage
    : submitTourActive
      ? STAGE_RANK[stage] < STAGE_RANK.actions
        ? 'actions'
        : stage
      : stage

  const value = useMemo(
    () => ({
      progressive: progressive || submitTourActive || statusTourActive,
      stage: effectiveStage,
      unlockedNavPaths,
      justRevealedNavPaths,
      setChrome,
      revealNavPaths,
      resetChrome,
      resetAllOnboardingChrome,
      submitTourActive,
      submitTourStepIndex,
      startSubmitTour,
      nextSubmitTourStep,
      backSubmitTourStep,
      skipSubmitTour,
      completeSubmitTour,
      statusTourOfferVisible,
      statusTourOfferKind,
      showStatusTourOffer,
      dismissStatusTourOffer,
      statusTourActive,
      statusTourKind,
      statusTourStepIndex,
      startBatchTour,
      startStatusTour,
      nextStatusTourStep,
      backStatusTourStep,
      skipStatusTour,
      completeStatusTour,
    }),
    [
      progressive,
      effectiveStage,
      unlockedNavPaths,
      justRevealedNavPaths,
      setChrome,
      revealNavPaths,
      resetChrome,
      resetAllOnboardingChrome,
      submitTourActive,
      submitTourStepIndex,
      startSubmitTour,
      nextSubmitTourStep,
      backSubmitTourStep,
      skipSubmitTour,
      completeSubmitTour,
      statusTourOfferVisible,
      statusTourOfferKind,
      showStatusTourOffer,
      dismissStatusTourOffer,
      statusTourActive,
      statusTourKind,
      statusTourStepIndex,
      startBatchTour,
      startStatusTour,
      nextStatusTourStep,
      backStatusTourStep,
      skipStatusTour,
      completeStatusTour,
    ]
  )

  return (
    <OnboardingChromeContext.Provider value={value}>{children}</OnboardingChromeContext.Provider>
  )
}

export function useOnboardingChrome(): OnboardingChromeContextValue {
  return useContext(OnboardingChromeContext) ?? DEFAULT
}

export function navItemRevealKey(item: ClientNavItem): string {
  return item.path
}
