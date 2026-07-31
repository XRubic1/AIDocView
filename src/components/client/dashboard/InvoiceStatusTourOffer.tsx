/**
 * Bridge offer after submit / batch tour — invite the next follow-on walkthrough.
 */
type InvoiceStatusTourOfferProps = {
  kind?: 'batch' | 'invoice'
  onStart: () => void
  onSkip: () => void
}

export default function InvoiceStatusTourOffer({
  kind = 'invoice',
  onStart,
  onSkip,
}: InvoiceStatusTourOfferProps) {
  const isBatch = kind === 'batch'

  return (
    <div
      className="cd-onboard-welcome cd-onboard-submit-offer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cd-onboard-status-offer-title"
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
          id="cd-onboard-status-offer-title"
          className="cd-onboard-welcome__title cd-onboard-welcome__anim cd-onboard-welcome__anim--2"
        >
          {isBatch ? (
            <>
              <span className="cd-onboard-welcome__slide">Where your paperwork</span>
              <span className="cd-onboard-welcome__slide cd-onboard-welcome__slide--accent cx-hand-underline cx-hand-underline--draw">
                becomes a batch
              </span>
            </>
          ) : (
            <>
              <span className="cd-onboard-welcome__slide">Where your invoices</span>
              <span className="cd-onboard-welcome__slide cd-onboard-welcome__slide--accent cx-hand-underline cx-hand-underline--draw">
                show up
              </span>
            </>
          )}
        </h1>
        <p className="cd-onboard-welcome__subtitle cd-onboard-welcome__anim cd-onboard-welcome__anim--3">
          {isBatch
            ? 'See Batches in the sidebar, open a demo batch, and walk through status, invoice count, amount, and outcome.'
            : 'Open the invoice, see Hold when there’s an issue, find PPW sent when paperwork goes to the broker, then confirm payment when funds arrive.'}
        </p>
        <div className="cd-onboard-welcome__actions">
          <button
            type="button"
            className="cd-onboard-welcome__primary cd-onboard-welcome__primary--pulse"
            onClick={onStart}
          >
            Show me
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
