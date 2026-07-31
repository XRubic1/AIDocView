/**
 * Bridge after dashboard tour — invite the submit-invoices follow-on tour.
 */
type SubmitTourOfferProps = {
  onStart: () => void
  onSkip: () => void
}

export default function SubmitTourOffer({ onStart, onSkip }: SubmitTourOfferProps) {
  return (
    <div
      className="cd-onboard-welcome cd-onboard-submit-offer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cd-onboard-submit-offer-title"
    >
      <div className="cd-onboard-welcome__waves" aria-hidden>
        <div className="cd-onboard-welcome__wave cd-onboard-welcome__wave--a" />
        <div className="cd-onboard-welcome__wave cd-onboard-welcome__wave--b" />
      </div>

      <div className="cd-onboard-welcome__stage">
        <p className="cd-onboard-welcome__eyebrow cd-onboard-welcome__anim cd-onboard-welcome__anim--1">
          Next up
        </p>
        <h1
          id="cd-onboard-submit-offer-title"
          className="cd-onboard-welcome__title cd-onboard-welcome__anim cd-onboard-welcome__anim--2"
        >
          <span className="cd-onboard-welcome__slide">How to submit</span>
          <span className="cd-onboard-welcome__slide cd-onboard-welcome__slide--accent cx-hand-underline cx-hand-underline--draw">
            invoices
          </span>
        </h1>
        <p className="cd-onboard-welcome__subtitle cd-onboard-welcome__anim cd-onboard-welcome__anim--3">
          We’ll show you where to upload load paperwork so Credyx can invoice your brokers.
        </p>
        <div className="cd-onboard-welcome__actions">
          <button
            type="button"
            className="cd-onboard-welcome__primary cd-onboard-welcome__primary--pulse"
            onClick={onStart}
          >
            Start submit tour
          </button>
          <button
            type="button"
            className="cd-onboard-welcome__secondary cd-onboard-welcome__anim cd-onboard-welcome__anim--skip"
            onClick={onSkip}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
