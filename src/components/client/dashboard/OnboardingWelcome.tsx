/**
 * On-dashboard welcome — no dim overlay; waves show through.
 * Thank-you slides in, then Start Tour animates in.
 */
type OnboardingWelcomeProps = {
  carrierName?: string
  onStart: () => void
  onSkip: () => void
}

export default function OnboardingWelcome({
  carrierName,
  onStart,
  onSkip,
}: OnboardingWelcomeProps) {
  return (
    <div
      className="cd-onboard-welcome"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cd-onboard-welcome-title"
    >
      {/* Soft local waves — amplify motion behind the copy */}
      <div className="cd-onboard-welcome__waves" aria-hidden>
        <div className="cd-onboard-welcome__wave cd-onboard-welcome__wave--a" />
        <div className="cd-onboard-welcome__wave cd-onboard-welcome__wave--b" />
        <div className="cd-onboard-welcome__wave cd-onboard-welcome__wave--c" />
      </div>

      <div className="cd-onboard-welcome__stage">
        <p className="cd-onboard-welcome__eyebrow cd-onboard-welcome__anim cd-onboard-welcome__anim--1">
          Credyx · A/R Solutions
          {carrierName?.trim() ? ` · ${carrierName.trim()}` : ''}
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
          Your back office, in one portal. We’ll walk through your dashboard one piece at a time.
        </p>

        <div className="cd-onboard-welcome__actions">
          <button
            type="button"
            className="cd-onboard-welcome__primary cd-onboard-welcome__primary--pulse"
            onClick={onStart}
          >
            Start Tour
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
