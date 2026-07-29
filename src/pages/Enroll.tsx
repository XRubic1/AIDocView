import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Truck,
} from 'lucide-react'
import '../styles/credyxMarketing.css'
import { useRevealOnScroll } from '../hooks/useRevealOnScroll'
import { useEnrollForm } from '../hooks/useEnrollForm'
import { SERVICE_PLANS } from '../config/servicePlans'
import { EnrollHeader } from '../components/enroll/EnrollHeader'
import { PlanCard } from '../components/enroll/PlanCard'
import { EnrollField, enrollInputClass } from '../components/enroll/EnrollField'

// ── Static content ──

const HERO_STATS = [
  { value: 'Minutes', label: 'Invoice turnaround' },
  { value: '100%', label: 'A/R transparency' },
  { value: '1–50', label: 'Trucks supported' },
]

const WORKFLOW_STEPS = [
  {
    title: 'Submit your loads',
    description: 'Upload delivery documents — POD, BOL, rate confirmations — to our portal.',
  },
  {
    title: 'We bill the brokers',
    description: 'Automated invoicing sends professional invoices to brokers within minutes.',
  },
  {
    title: 'We track & collect',
    description: 'We follow up with brokers, track payment status, and resolve deductions.',
  },
  {
    title: 'You get paid',
    description: 'Watch payments and A/R status update in real time from your dashboard.',
  },
]

const BENEFITS = [
  {
    icon: Truck,
    title: 'No employees needed',
    description: 'Skip payroll, training, and turnover. Our team handles everything from day one.',
  },
  {
    icon: Clock,
    title: 'Lightning fast',
    description: 'Invoices processed in minutes, with professional broker follow-up built in.',
  },
  {
    icon: FileText,
    title: 'Complete visibility',
    description: 'A real-time dashboard tracking every invoice, payment, and outstanding dollar.',
  },
  {
    icon: DollarSign,
    title: 'Works with factoring',
    description: 'We integrate with your factoring company or handle direct billing — your choice.',
  },
]

const COVERAGE = [
  'Invoice creation and billing',
  'Broker invoicing and verification',
  'Collections and A/R follow-up',
  'Payment status tracking',
  'Deduction monitoring (lumper, TONU)',
  'POD / BOL verification',
  'Paperwork corrections',
  'Secure document storage',
  'Clear A/R reporting',
]

const FLEET_SIZE_OPTIONS = ['1-5', '6-10', '11-25', '26-50', '50+']

/** Public enrollment / marketing page for Credyx A/R Solutions. */
export default function Enroll() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  useRevealOnScroll(rootRef)

  const {
    step,
    setStep,
    selectedTier,
    setSelectedTier,
    formData,
    updateField,
    isSubmitting,
    submitted,
    error,
    submit,
  } = useEnrollForm()

  const scrollToForm = () => {
    document.getElementById('enroll-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div ref={rootRef} className="credyx-page">
      <EnrollHeader />

      {/* ── Hero ── */}
      <section className="cx-hero">
        <div className="cx-hero-photo" aria-hidden>
          <img src="/credyx-hero-truck.jpg" alt="" />
        </div>
        <div className="cx-mesh" aria-hidden />
        <div className="cx-hero-inner">
          <p className="cx-badge hero-enter hero-enter-1">Back-office for trucking companies</p>
          <h1 className="cx-hero-headline hero-enter hero-enter-2">
            You haul. We handle
            <br />
            <span className="accent">the paperwork.</span>
          </h1>
          <p className="cx-hero-sub hero-enter hero-enter-3">
            Professional billing and collections for carriers running 1 to 50 trucks.{' '}
            <strong>Get paid faster without hiring a back office.</strong> We work alongside
            your factoring company or handle everything directly.
          </p>
          <div className="cx-hero-buttons hero-enter hero-enter-4">
            <button className="cx-btn-primary" onClick={scrollToForm}>
              Enroll now
              <ArrowRight size={17} />
            </button>
            <button className="cx-btn-secondary" onClick={() => navigate('/tour')}>
              See the product
            </button>
          </div>

          <div className="cx-hero-stats hero-enter hero-enter-5">
            {HERO_STATS.map((stat) => (
              <div key={stat.label} className="cx-hero-stat">
                <div className="cx-hero-stat-num">{stat.value}</div>
                <div className="cx-hero-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workflow ── */}
      <section className="cx-section bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal">
            <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
              The process
            </p>
            <h2 className="cx-section-title">Four steps. Zero paperwork stress.</h2>
            <p className="cx-section-sub">
              From the moment your driver delivers to the moment money hits your account, we
              run the entire billing cycle.
            </p>
          </div>
          <div className="cx-card-grid reveal">
            {WORKFLOW_STEPS.map((item, index) => (
              <div key={item.title} className="cx-card">
                <div className="cx-card-num">{index + 1}</div>
                <h3 className="cx-card-title">{item.title}</h3>
                <p className="cx-card-desc">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ── */}
      <section className="cx-section surface bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal">
            <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
              Why Credyx
            </p>
            <h2 className="cx-section-title">Built for carriers, not accountants.</h2>
            <p className="cx-section-sub">
              Everything a billing department does — without hiring one.
            </p>
          </div>
          <div className="cx-card-grid reveal">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title} className="cx-card">
                <div className="cx-card-icon">
                  <benefit.icon size={20} />
                </div>
                <h3 className="cx-card-title">{benefit.title}</h3>
                <p className="cx-card-desc">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Coverage checklist ── */}
      <section className="cx-section bordered">
        <div className="cx-section-inner">
          <div className="cx-section-head centered reveal">
            <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
              Scope of service
            </p>
            <h2 className="cx-section-title">What we handle for you</h2>
            <p className="cx-section-sub">Focus on hauling freight. We&apos;ll run the back office.</p>
          </div>
          <div className="cx-coverage reveal">
            {COVERAGE.map((item) => (
              <div key={item} className="cx-coverage-item">
                <Check size={16} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Enrollment ── */}
      <section id="enroll-form" className="cx-section surface bordered">
        <div className="cx-section-inner">
          <div className="cx-enroll-shell">
            <div className="cx-section-head centered reveal" style={{ margin: '0 auto 48px' }}>
              <p className="cx-eyebrow" style={{ justifyContent: 'center', width: '100%' }}>
                Enrollment
              </p>
              <h2 className="cx-section-title">Ready to get started?</h2>
              <p className="cx-section-sub">
                Two minutes to apply. We&apos;ll contact you within 24 hours.
              </p>
            </div>

            {submitted ? (
              <div className="cx-success success-pop">
                <CheckCircle2 size={52} className="cx-success-icon" />
                <h3 className="cx-success-title">Application received</h3>
                <p className="cx-success-body">
                  Your application is under review. We&apos;ll email you when your account is
                  activated.
                </p>
              </div>
            ) : (
              <div className="reveal">
                <div className="cx-stepper">
                  <div className={`cx-stepper-item ${step === 1 ? 'active' : 'done'}`}>
                    <span className="cx-stepper-num">
                      {step > 1 ? <Check size={12} strokeWidth={3} /> : '1'}
                    </span>
                    Choose plan
                  </div>
                  <div className="cx-stepper-line" />
                  <div className={`cx-stepper-item ${step === 2 ? 'active' : ''}`}>
                    <span className="cx-stepper-num">2</span>
                    Your details
                  </div>
                </div>

                {step === 1 ? (
                  <div key="step-1" className="step-enter">
                    <div className="cx-plans">
                      {SERVICE_PLANS.map((plan) => (
                        <PlanCard
                          key={plan.id}
                          plan={plan}
                          selected={selectedTier === plan.tier}
                          onSelect={() => setSelectedTier(plan.tier)}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="cx-btn-primary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => setStep(2)}
                    >
                      Continue with {selectedTier === 'managed' ? 'Managed' : 'Self-Service'}
                      <ArrowRight size={17} />
                    </button>
                  </div>
                ) : (
                  <form key="step-2" onSubmit={submit} className="cx-form-card step-enter">
                    <button type="button" className="cx-back-link" onClick={() => setStep(1)}>
                      <ArrowLeft size={14} />
                      Change plan
                    </button>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                      <EnrollField label="Company name">
                        <input
                          type="text"
                          required
                          value={formData.companyName}
                          onChange={(e) => updateField('companyName', e.target.value)}
                          className={enrollInputClass}
                          placeholder="Acme Trucking LLC"
                        />
                      </EnrollField>

                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <EnrollField label="Contact person">
                          <input
                            type="text"
                            required
                            value={formData.contactPerson}
                            onChange={(e) => updateField('contactPerson', e.target.value)}
                            className={enrollInputClass}
                            placeholder="Jane Smith"
                          />
                        </EnrollField>
                        <EnrollField label="Phone number">
                          <input
                            type="tel"
                            required
                            value={formData.phone}
                            onChange={(e) => updateField('phone', e.target.value)}
                            className={enrollInputClass}
                            placeholder="(555) 123-4567"
                          />
                        </EnrollField>
                      </div>

                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <EnrollField label="Email address">
                          <input
                            type="email"
                            required
                            value={formData.email}
                            onChange={(e) => updateField('email', e.target.value)}
                            className={enrollInputClass}
                            placeholder="you@company.com"
                          />
                        </EnrollField>
                        <EnrollField label="Fleet size">
                          <select
                            required
                            value={formData.fleetSize}
                            onChange={(e) => updateField('fleetSize', e.target.value)}
                            className={enrollInputClass}
                          >
                            <option value="">Select fleet size</option>
                            {FLEET_SIZE_OPTIONS.map((size) => (
                              <option key={size} value={size}>
                                {size} trucks
                              </option>
                            ))}
                          </select>
                        </EnrollField>
                      </div>

                      {error && <p className="cx-form-error">{error}</p>}

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="cx-btn-primary"
                        style={{ width: '100%', justifyContent: 'center' }}
                      >
                        {isSubmitting ? (
                          <>
                            <span className="cx-spinner" />
                            Submitting…
                          </>
                        ) : (
                          <>
                            Submit application
                            <ArrowRight size={17} />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="cx-footer">
        <div className="cx-footer-brand">
          Cred<span>yx</span>
        </div>
        <div className="cx-footer-links">
          <button type="button" className="cx-footer-link" onClick={() => navigate('/privacy')}>
            Privacy
          </button>
          <button type="button" className="cx-footer-link" onClick={() => navigate('/terms')}>
            Terms
          </button>
        </div>
        <div className="cx-footer-copy">
          © {new Date().getFullYear()} Credyx A/R Solutions. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
