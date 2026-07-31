/**
 * Tutorials hub — replay portal walkthroughs from one place.
 */
import { useNavigate } from 'react-router-dom'
import { BookOpen, LayoutDashboard, Upload, Boxes, FileText, Play } from 'lucide-react'
import { useClientSession } from '../hooks/useClientSession'
import { useClientTheme } from '../theme/ThemeContext'
import { useOnboardingChrome } from '../context/OnboardingChromeContext'
import {
  dispatchReplayOnboardingTour,
  resetOnboardingDashboardPrefs,
  setOnboardingDashboardPrefs,
} from '../utils/onboardingDashboardPrefs'
import { cleanupTourInvoice } from '../utils/onboardingTourInvoice'

type TutorialCard = {
  id: string
  title: string
  body: string
  duration: string
  icon: typeof LayoutDashboard
  cta: string
  onStart: () => void
}

export default function ClientTutorials() {
  const c = useClientTheme()
  const navigate = useNavigate()
  const { clientId } = useClientSession()
  const {
    resetAllOnboardingChrome,
    startSubmitTour,
    startBatchTour,
    startStatusTour,
  } = useOnboardingChrome()

  const startPortalWalkthrough = () => {
    if (clientId) {
      resetOnboardingDashboardPrefs(clientId)
      cleanupTourInvoice(clientId)
    }
    resetAllOnboardingChrome()
    navigate('/client/onboarding')
    window.setTimeout(() => dispatchReplayOnboardingTour(), 0)
  }

  const startSubmitWalkthrough = () => {
    if (clientId) {
      setOnboardingDashboardPrefs(clientId, { hasSeenSubmitTour: true })
      cleanupTourInvoice(clientId)
    }
    resetAllOnboardingChrome()
    navigate('/client/dashboard')
    window.setTimeout(() => startSubmitTour(), 50)
  }

  const startBatchesWalkthrough = () => {
    if (clientId) {
      setOnboardingDashboardPrefs(clientId, { hasSeenBatchTour: true })
      cleanupTourInvoice(clientId)
    }
    resetAllOnboardingChrome()
    navigate('/client/batches?tab=view')
    window.setTimeout(() => startBatchTour(), 50)
  }

  const startInvoiceWalkthrough = () => {
    if (clientId) {
      setOnboardingDashboardPrefs(clientId, { hasSeenInvoiceStatusTour: true })
      cleanupTourInvoice(clientId)
    }
    resetAllOnboardingChrome()
    navigate('/client/invoices?status=approved')
    window.setTimeout(() => startStatusTour(), 50)
  }

  const cards: TutorialCard[] = [
    {
      id: 'portal',
      title: 'Portal walkthrough',
      body: 'Welcome, About Credyx, then a guided tour of Open Balance, status tiles, charts, and actions.',
      duration: '~3 min',
      icon: LayoutDashboard,
      cta: 'Start walkthrough',
      onStart: startPortalWalkthrough,
    },
    {
      id: 'submit',
      title: 'How to submit invoices',
      body: 'Find Upload / Submit docs and drop paperwork so Credyx can invoice your brokers.',
      duration: '~1 min',
      icon: Upload,
      cta: 'Start submit tour',
      onStart: startSubmitWalkthrough,
    },
    {
      id: 'batches',
      title: 'Batches',
      body: 'Where uploaded paperwork becomes a batch — open it and walk through status, invoices, amount, and outcome.',
      duration: '~2 min',
      icon: Boxes,
      cta: 'Start batches tour',
      onStart: startBatchesWalkthrough,
    },
    {
      id: 'invoices',
      title: 'Invoice status',
      body: 'Follow one demo invoice: Open → Hold → PPW sent → confirm payment → Paid.',
      duration: '~3 min',
      icon: FileText,
      cta: 'Start invoice tour',
      onStart: startInvoiceWalkthrough,
    },
  ]

  return (
    <div className="client-tutorials flex flex-col min-h-0 h-full overflow-hidden">
      <header
        className="shrink-0 border-b px-5 py-4 sm:px-6"
        style={{ borderColor: c.border, backgroundColor: c.card }}
      >
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
            style={{ backgroundColor: 'rgba(22, 132, 254, 0.12)', color: c.info }}
          >
            <BookOpen className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight" style={{ color: c.primary }}>
              Tutorials
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: c.secondary }}>
              Short walkthroughs of the portal. Replay anytime — demo data only, nothing is sent to
              brokers.
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6">
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 max-w-6xl">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <li key={card.id}>
                <article
                  className="client-tutorials__card flex h-full flex-col rounded-xl border p-4 sm:p-5"
                  style={{
                    borderColor: c.border,
                    backgroundColor: c.card,
                    boxShadow: c.shadow.card,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
                      style={{ backgroundColor: 'rgba(22, 132, 254, 0.1)', color: '#1684fe' }}
                    >
                      <Icon className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    <span
                      className="text-[0.6875rem] font-semibold uppercase tracking-wide"
                      style={{ color: c.muted }}
                    >
                      {card.duration}
                    </span>
                  </div>

                  <h2
                    className="mt-3 text-base font-semibold tracking-tight"
                    style={{ color: c.primary }}
                  >
                    {card.title}
                  </h2>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed" style={{ color: c.secondary }}>
                    {card.body}
                  </p>

                  <button
                    type="button"
                    onClick={card.onStart}
                    className="dashboard-btn-primary mt-4 inline-flex w-full items-center justify-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" strokeWidth={2} />
                    {card.cta}
                  </button>
                </article>
              </li>
            )
          })}
        </ul>

        <p className="mt-6 text-xs max-w-6xl" style={{ color: c.muted }}>
          Credyx · Paid on time — tutorials use local demo invoices and never change your live A/R.
        </p>
      </div>
    </div>
  )
}
