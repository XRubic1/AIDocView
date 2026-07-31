/**
 * Welcome → About intro: thank-you exits, about copy enters.
 * Plain language for carriers — not corporate brochure speak.
 */
import { useEffect, useState } from 'react'

type OnboardingIntroProps = {
  carrierName?: string
  onContinueToPortal: () => void
  onSkip: () => void
}

type Panel = 'welcome' | 'about'

const EXIT_MS = 420
/** White Credyx mark for the dark welcome screen. */
const WELCOME_LOGO_SRC = '/credyx-logo-white-cred-no-bg.png'

export default function OnboardingIntro({
  carrierName,
  onContinueToPortal,
  onSkip,
}: OnboardingIntroProps) {
  const [panel, setPanel] = useState<Panel>('welcome')
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (!exiting) return
    const t = window.setTimeout(() => {
      setPanel('about')
      setExiting(false)
    }, EXIT_MS)
    return () => window.clearTimeout(t)
  }, [exiting])

  const goToAbout = () => {
    if (panel !== 'welcome' || exiting) return
    setExiting(true)
  }

  return (
    <div
      className="cd-onboard-welcome cd-onboard-intro"
      role="dialog"
      aria-modal="true"
      aria-labelledby={
        panel === 'about' ? 'cd-onboard-about-title' : 'cd-onboard-welcome-title'
      }
    >
      <div className="cd-onboard-welcome__waves" aria-hidden>
        <div className="cd-onboard-welcome__wave cd-onboard-welcome__wave--a" />
        <div className="cd-onboard-welcome__wave cd-onboard-welcome__wave--b" />
        <div className="cd-onboard-welcome__wave cd-onboard-welcome__wave--c" />
      </div>

      <div className="cd-onboard-intro__stage-wrap">
        {panel === 'welcome' || exiting ? (
          <div
            className={`cd-onboard-welcome__stage cd-onboard-intro__copy${
              exiting ? ' is-exit' : ' is-enter'
            }`}
            key="welcome"
            aria-hidden={exiting}
          >
            <div className="cd-onboard-intro__brand cd-onboard-welcome__anim cd-onboard-welcome__anim--1">
              <img
                src={WELCOME_LOGO_SRC}
                alt="Credyx"
                className="cd-onboard-intro__logo"
                width={280}
                height={72}
                decoding="async"
              />
              <p className="cd-onboard-intro__tagline">A/R SOLUTIONS</p>
            </div>

            <p className="cd-onboard-welcome__eyebrow cd-onboard-welcome__anim cd-onboard-welcome__anim--1">
              {carrierName?.trim() ? carrierName.trim() : 'Demo'}
            </p>

            <h1
              id="cd-onboard-welcome-title"
              className="cd-onboard-welcome__title cd-onboard-welcome__anim cd-onboard-welcome__anim--2"
            >
              <span className="cd-onboard-welcome__slide">Thank you for visiting</span>
              <span className="cd-onboard-welcome__slide cd-onboard-welcome__slide--accent cx-hand-underline cx-hand-underline--draw">
                our Demo
              </span>
            </h1>

            <p className="cd-onboard-welcome__subtitle cd-onboard-welcome__anim cd-onboard-welcome__anim--3">
              Your back office, in one portal. We’ll show you around — one piece at a time.
            </p>

            <div className="cd-onboard-welcome__actions">
              <button
                type="button"
                className="cd-onboard-welcome__primary cd-onboard-welcome__primary--pulse"
                onClick={goToAbout}
                disabled={exiting}
              >
                Start Tour
              </button>
              <button
                type="button"
                className="cd-onboard-welcome__secondary cd-onboard-welcome__anim cd-onboard-welcome__anim--skip"
                onClick={onSkip}
                disabled={exiting}
              >
                Skip for now
              </button>
            </div>

            <p className="cd-onboard-welcome__footnote cd-onboard-welcome__anim cd-onboard-welcome__anim--5">
              Credyx · Paid on time
            </p>
          </div>
        ) : null}

        {panel === 'about' ? (
          <div
            className="cd-onboard-welcome__stage cd-onboard-intro__copy is-enter"
            key="about"
          >
            <p className="cd-onboard-welcome__eyebrow cd-onboard-welcome__anim cd-onboard-welcome__anim--1">
              Who we are
            </p>

            <h1
              id="cd-onboard-about-title"
              className="cd-onboard-welcome__title cd-onboard-welcome__anim cd-onboard-welcome__anim--2"
            >
              <span className="cd-onboard-welcome__slide">You drive.</span>
              <span className="cd-onboard-welcome__slide cd-onboard-welcome__slide--accent cx-hand-underline cx-hand-underline--draw">
                We handle the paperwork.
              </span>
            </h1>

            <p className="cd-onboard-about__mission cd-onboard-welcome__anim cd-onboard-welcome__anim--3">
              Focus on the road. We’ll handle the rest.
            </p>

            <p className="cd-onboard-welcome__subtitle cd-onboard-welcome__anim cd-onboard-welcome__anim--3">
              Send us your load docs. We check them, invoice the broker, and follow up — so you don’t
              have to chase payments. You’ll always see where each invoice stands, through paid on
              time.
            </p>

            <p className="cd-onboard-about__web cd-onboard-welcome__anim cd-onboard-welcome__anim--3">
              More about us at{' '}
              <a
                href="https://credyx.com"
                target="_blank"
                rel="noopener noreferrer"
                className="cd-onboard-about__link"
              >
                credyx.com
              </a>
            </p>

            <div className="cd-onboard-welcome__actions">
              <button
                type="button"
                className="cd-onboard-welcome__primary cd-onboard-welcome__primary--pulse"
                onClick={onContinueToPortal}
              >
                Show me the portal
              </button>
              <button
                type="button"
                className="cd-onboard-welcome__secondary cd-onboard-welcome__anim cd-onboard-welcome__anim--skip"
                onClick={onSkip}
              >
                Skip for now
              </button>
            </div>

            <p className="cd-onboard-welcome__footnote cd-onboard-welcome__anim cd-onboard-welcome__anim--5">
              Credyx · Paid on time
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
