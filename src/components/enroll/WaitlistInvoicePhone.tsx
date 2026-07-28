import { CheckCircle2 } from 'lucide-react'

const INVOICE_STEPS = [
  { label: 'Submitted', state: 'done' as const },
  { label: 'Verified', state: 'done' as const },
  { label: 'Invoiced', state: 'done' as const },
  { label: 'Paid', state: 'done' as const },
]

/**
 * Polished mobile invoice preview for waitlist marketing.
 * Demo data: Net-30 timeline, clean activity (Client / Credyx), 4-step progress.
 */
export function WaitlistInvoicePhone() {
  return (
    <div className="cx-phone" aria-label="Credyx mobile invoice preview">
      <div className="cx-phone-notch" aria-hidden />
      <div className="cx-phone-screen">
        <header className="cx-phone-topbar">
          <span className="cx-phone-back" aria-hidden>
            ‹
          </span>
          <span className="cx-phone-top-title">Invoice details</span>
          <span className="cx-phone-paid">Paid</span>
        </header>

        <div className="cx-phone-page">
          <div className="cx-phone-title-row">
            <div>
              <h3 className="cx-phone-heading">INV-1256 · Load 7729</h3>
              <p className="cx-phone-broker">Demo Broker Logistics</p>
            </div>
          </div>

          {/* Submitted → Verified → Invoiced → Paid */}
          <div className="cx-phone-steps" aria-label="Invoice progress">
            {INVOICE_STEPS.map((step, index) => (
              <div key={step.label} style={{ display: 'contents' }}>
                {index > 0 && <span className="cx-phone-step-line done" aria-hidden />}
                <div className={`cx-phone-step ${step.state}`}>
                  <span className="cx-phone-step-dot">
                    <CheckCircle2 size={10} strokeWidth={2.5} />
                  </span>
                  <span className="cx-phone-step-label">{step.label}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="cx-phone-mint">
            <div className="cx-phone-metrics">
              <div className="cx-phone-metric">
                <span>Invoice total</span>
                <strong>$4,350.00</strong>
              </div>
              <div className="cx-phone-metric">
                <span>Confirmed</span>
                <strong>$4,350.00</strong>
              </div>
              <div className="cx-phone-metric">
                <span>Balance</span>
                <strong>$0.00</strong>
              </div>
            </div>

            <div className="cx-phone-dates">
              <div className="cx-phone-date">
                <span>Invoice date</span>
                <strong>06/28/2026</strong>
              </div>
              <div className="cx-phone-date">
                <span>Pay date</span>
                <strong>07/25/2026</strong>
              </div>
              <div className="cx-phone-date">
                <span>Age</span>
                <strong>30d</strong>
              </div>
              <div className="cx-phone-date">
                <span>Due date</span>
                <strong>07/28/2026</strong>
              </div>
            </div>
          </div>

          <div className="cx-phone-activity">
            <div className="cx-phone-tabs">
              <span className="active">All</span>
              <span>Activity</span>
              <span>Payments</span>
            </div>

            <ul className="cx-phone-feed">
              <li>
                <span className="dot green" />
                <div>
                  <strong>Payment confirmation</strong>
                  <p>Paid in full — $4,350.00 · Client</p>
                </div>
                <time>07/25</time>
              </li>
              <li>
                <span className="dot blue" />
                <div>
                  <strong>Payment posted</strong>
                  <p>Invoice closed · Credyx</p>
                </div>
                <time>07/25</time>
              </li>
              <li>
                <span className="dot green" />
                <div>
                  <strong>Status paid</strong>
                  <p>Payment confirmed · Credyx</p>
                </div>
                <time>07/25</time>
              </li>
            </ul>
          </div>
        </div>

        <footer className="cx-phone-footer">
          <button type="button" className="primary" tabIndex={-1}>
            Post payment
          </button>
          <button type="button" className="ghost" tabIndex={-1}>
            Docs
          </button>
        </footer>

        <div className="cx-phone-chip">
          <CheckCircle2 size={14} />
          Paid on time
        </div>
      </div>
    </div>
  )
}
