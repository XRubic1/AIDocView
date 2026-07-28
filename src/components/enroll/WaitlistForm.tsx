import { useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { EnrollField, enrollInputClass } from './EnrollField'

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

/** Single-step waitlist signup form (Phase 1 — local success state only). */
export function WaitlistForm() {
  const [formData, setFormData] = useState<WaitlistFormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const updateField = <K extends keyof WaitlistFormData>(key: K, value: WaitlistFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    if (error) setError(null)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const companyName = formData.companyName.trim()
    const contactName = formData.contactName.trim()
    const email = formData.email.trim()
    const fleetSize = formData.fleetSize

    if (!companyName || !contactName || !email || !fleetSize) {
      setError('Please fill in all required fields.')
      return
    }

    // Phase 1: no backend — show success UI only.
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="cx-success cx-success--waitlist success-pop">
        <CheckCircle2 size={44} className="cx-success-icon" />
        <h3 className="cx-success-title">You&apos;re on the list</h3>
        <p className="cx-success-body">
          Founding access is reserved — we&apos;ll reach out when onboarding opens.
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
          <EnrollField label="How did you hear about us?" required={false}>
            <select
              value={formData.hearAbout}
              onChange={(e) => updateField('hearAbout', e.target.value)}
              className={enrollInputClass}
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
          />
        </EnrollField>

        {error && <p className="cx-form-error">{error}</p>}

        <button type="submit" className="cx-btn-primary cx-waitlist-submit">
          Join the waitlist
          <ArrowRight size={16} />
        </button>

        <p className="cx-form-privacy">
          We&apos;ll only use your email to contact you about Credyx.
        </p>
      </div>
    </form>
  )
}
