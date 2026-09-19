import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { EnrollField, enrollInputClass } from './EnrollField'
import { submitWaitlistSignup } from '../../services/waitlistService'
import { trackWebsiteEvent } from '../../services/websiteAnalytics'

const FLEET_SIZE_OPTIONS = ['1-5', '6-10', '11-25', '26-50', '50+'] as const

const HEAR_ABOUT_OPTIONS = [
  'Instagram',
  'Referral',
  'Google search',
  'Industry event',
  'Other',
] as const

interface WaitlistFormData {
  companyName: string
  contactName: string
  email: string
  phone: string
  fleetSize: string
  hearAbout: string
  notes: string
}

const EMPTY_FORM: WaitlistFormData = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  fleetSize: '',
  hearAbout: '',
  notes: '',
}

/** Single-step demo-request form — persists leads to waitlist_signups. */
export function WaitlistForm() {
  const [formData, setFormData] = useState<WaitlistFormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const updateField = <K extends keyof WaitlistFormData>(key: K, value: WaitlistFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    if (error) setError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const companyName = formData.companyName.trim()
    const contactName = formData.contactName.trim()
    const email = formData.email.trim()
    const fleetSize = formData.fleetSize

    if (!companyName || !contactName || !email || !fleetSize) {
      setError('Please fill in all required fields.')
      trackWebsiteEvent('form_error', 'validation')
      return
    }

    trackWebsiteEvent('form_submit', 'waitlist_form')
    setIsSubmitting(true)
    setError(null)

    try {
      await submitWaitlistSignup({
        companyName,
        contactName,
        email,
        phone: formData.phone,
        fleetSize,
        hearAbout: formData.hearAbout,
        notes: formData.notes,
      })
      trackWebsiteEvent('form_success', 'waitlist_form')
      setSubmitted(true)
    } catch (err) {
      trackWebsiteEvent('form_error', 'submit_failed')
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong scheduling your demo. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="cx-success cx-success--waitlist success-pop">
        <CheckCircle2 size={44} className="cx-success-icon" />
        <h3 className="cx-success-title">Demo request received</h3>
        <p className="cx-success-body">
          We&apos;ll reach out shortly to book your demo.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="cx-form-card cx-form-card--join" noValidate>
      <div className="cx-waitlist-fields">
        <div className="cx-waitlist-grid">
          <EnrollField label="Company name">
            <input
              type="text"
              required
              autoComplete="organization"
              value={formData.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
              className={enrollInputClass}
              placeholder="Acme Trucking LLC"
              disabled={isSubmitting}
            />
          </EnrollField>
          <EnrollField label="Contact name">
            <input
              type="text"
              required
              autoComplete="name"
              value={formData.contactName}
              onChange={(e) => updateField('contactName', e.target.value)}
              className={enrollInputClass}
              placeholder="Jane Smith"
              disabled={isSubmitting}
            />
          </EnrollField>
          <EnrollField label="Email">
            <input
              type="email"
              required
              autoComplete="email"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              className={enrollInputClass}
              placeholder="you@company.com"
              disabled={isSubmitting}
            />
          </EnrollField>
          <EnrollField label="Phone" required={false}>
            <input
              type="tel"
              autoComplete="tel"
              value={formData.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              className={enrollInputClass}
              placeholder="(555) 123-4567"
              disabled={isSubmitting}
            />
          </EnrollField>
          <EnrollField label="Fleet size">
            <select
              required
              value={formData.fleetSize}
              onChange={(e) => updateField('fleetSize', e.target.value)}
              className={enrollInputClass}
              disabled={isSubmitting}
            >
              <option value="">Select fleet size</option>
              {FLEET_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} trucks
                </option>
              ))}
            </select>
          </EnrollField>
          <EnrollField label="How did you hear about us?" required={false}>
            <select
              value={formData.hearAbout}
              onChange={(e) => updateField('hearAbout', e.target.value)}
              className={enrollInputClass}
              disabled={isSubmitting}
            >
              <option value="">Select an option</option>
              {HEAR_ABOUT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </EnrollField>
        </div>

        <EnrollField label="Notes" required={false}>
          <textarea
            rows={2}
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            className={enrollInputClass}
            placeholder="Anything we should know?"
            disabled={isSubmitting}
          />
        </EnrollField>

        {error && <p className="cx-form-error">{error}</p>}

        <button type="submit" className="cx-btn-primary cx-waitlist-submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              Schedule Demo
              <ArrowRight size={16} />
            </>
          )}
        </button>

        <p className="cx-form-privacy">
          We&apos;ll only use your email to contact you about Credyx. See our{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </form>
  )
}
