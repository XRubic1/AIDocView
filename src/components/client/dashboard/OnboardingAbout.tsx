/**
 * Short “about Credyx” beat after the welcome bubble transition.
 */
type OnboardingAboutProps = {
  onContinue: () => void
  onSkip: () => void
}

export default function OnboardingAbout({ onContinue, onSkip }: OnboardingAboutProps) {
  return (
    <div
      className="cd-onboard-welcome cd-onboard-about"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cd-onboard-about-title"
    >
      <div className="cd-onboard-welcome__waves" aria-hidden>
        <div className="cd-onboard-welcome__wave cd-onboard-welcome__wave--a" />
        <div className="cd-onboard-welcome__wave cd-onboard-welcome__wave--b" />
      </div>

      <div className="cd-onboard-welcome__stage">
        <p className="cd-onboard-welcome__eyebrow cd-onboard-welcome__anim cd-onboard-welcome__anim--1">
          About Credyx
        </p>

        <h1
          id="cd-onboard-about-title"
          className="cd-onboard-welcome__title cd-onboard-welcome__anim cd-onboard-welcome__anim--2"
        >
          <span className="cd-onboard-welcome__slide">Your back office,</span>
          <span className="cd-onboard-welcome__slide cd-onboard-welcome__slide--accent cx-hand-underline cx-hand-underline--draw">
            in one portal
          </span>
        </h1>

        <p className="cd-onboard-about__mission cd-onboard-welcome__anim cd-onboard-welcome__anim--3">
          Empowering truckers.
          <br />
          Simplifying payments.
          <br />
          Driving success.
        </p>

        <p className="cd-onboard-welcome__subtitle cd-onboard-welcome__anim cd-onboard-welcome__anim--3">
          Credyx is A/R and back-office for carriers — we verify your paperwork, invoice brokers,
          follow up, and keep you updated through paid on time. Not factoring. Not cash advances.
        </p>

        <p className="cd-onboard-about__web cd-onboard-welcome__anim cd-onboard-welcome__anim--3">
          Learn more at{' '}
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
            onClick={onContinue}
          >
            Continue to portal
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
    </div>
  )
}
