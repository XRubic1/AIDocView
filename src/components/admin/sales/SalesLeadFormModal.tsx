import { useState } from 'react'
import type {
  ManualSalesLeadInput,
  SalesLead,
  SalesLeadStatus,
} from '../../../services/salesLeadService'
import type { SalesChaseGrade } from '../../../utils/salesLeadRating'

const STATUS_OPTIONS: { value: SalesLeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'researching', label: 'Researching' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'replied', label: 'Replied' },
  { value: 'converted', label: 'Converted' },
  { value: 'declined', label: 'Declined' },
  { value: 'skipped', label: 'Skipped' },
]

const GRADE_OPTIONS: (SalesChaseGrade | 'auto')[] = ['auto', 'A', 'B', 'C', 'D', 'F']

function fromLead(lead: SalesLead): ManualSalesLeadInput {
  const mcDigits = lead.mc_digits.startsWith('DOT:') || lead.mc_digits.startsWith('MANUAL:') ? '' : lead.mc_digits
  return {
    company_name: lead.company_name ?? '',
    mc: mcDigits,
    dot: lead.dot_number != null ? String(lead.dot_number) : '',
    officer: lead.officer ?? '',
    contact_email: lead.contact_email ?? '',
    contact_phone: lead.contact_phone ?? '',
    phy_address: lead.phy_address ?? '',
    operating_status: lead.operating_status ?? '',
    years_in_business: lead.years_in_business != null ? String(lead.years_in_business) : '',
    total_trucks: String(lead.total_trucks ?? lead.total_power_units ?? ''),
    total_drivers: lead.total_drivers != null ? String(lead.total_drivers) : '',
    status: lead.status,
    notes: lead.notes ?? '',
    // Keep a hand-set grade; otherwise re-grade from the figures.
    grade: /set by hand/i.test(lead.grade_why) ? lead.chase_grade : 'auto',
  }
}

const EMPTY: ManualSalesLeadInput = {
  company_name: '',
  mc: '',
  dot: '',
  officer: '',
  contact_email: '',
  contact_phone: '',
  phy_address: '',
  operating_status: '',
  years_in_business: '',
  total_trucks: '',
  total_drivers: '',
  status: 'new',
  notes: '',
  grade: 'auto',
}

/** Add a lead by hand, or edit any lead's details. */
export default function SalesLeadFormModal({
  lead,
  prefill,
  saving,
  onCancel,
  onSave,
}: {
  /** Present when editing. */
  lead: SalesLead | null
  /** Starting values when adding (e.g. the MC typed in the lookup box). */
  prefill?: Partial<ManualSalesLeadInput>
  saving: boolean
  onCancel: () => void
  onSave: (input: ManualSalesLeadInput) => void
}) {
  const [form, setForm] = useState<ManualSalesLeadInput>(() =>
    lead ? fromLead(lead) : { ...EMPTY, ...prefill }
  )
  const set = <K extends keyof ManualSalesLeadInput>(key: K, value: ManualSalesLeadInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const emailInvalid =
    form.contact_email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim())
  const canSave = form.company_name.trim() !== '' && !emailInvalid && !saving

  const text = (key: keyof ManualSalesLeadInput, label: string, placeholder = '', type = 'text') => (
    <label className="sl-field">
      <span className="sl-field__label">{label}</span>
      <input
        className={`sl-input${key === 'contact_email' && emailInvalid ? ' is-invalid' : ''}`}
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        min={type === 'number' ? 0 : undefined}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        placeholder={placeholder}
      />
    </label>
  )

  return (
    <div className="sl-overlay" role="presentation" onClick={() => !saving && onCancel()}>
      <form
        className="sl-modal sl-modal--form"
        role="dialog"
        aria-modal
        aria-label={lead ? 'Edit lead' : 'Add lead by hand'}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (canSave) onSave(form)
        }}
      >
        <div>
          <h2>{lead ? 'Edit lead' : 'Add lead by hand'}</h2>
          <p className="sl-muted">
            {lead
              ? 'Update any details. Changes are saved to this lead.'
              : 'For carriers you found yourself. Only the company name is required.'}
          </p>
        </div>

        <div className="sl-form-scroll">
          <fieldset className="sl-fieldset">
            <legend>Company</legend>
            <label className="sl-field sl-span-2">
              <span className="sl-field__label">
                Company name <span className="sl-required">required</span>
              </span>
              <input
                autoFocus
                className="sl-input"
                value={form.company_name}
                onChange={(e) => set('company_name', e.target.value)}
                placeholder="e.g. Northline Logistics LLC"
              />
            </label>
            {text('mc', 'MC number', 'e.g. 123456')}
            {text('dot', 'DOT number', 'e.g. 3415544')}
            {text('operating_status', 'Operating status', 'e.g. Authorized for Property')}
            {text('phy_address', 'Address', 'Street, city, state')}
          </fieldset>

          <fieldset className="sl-fieldset">
            <legend>Contact</legend>
            {text('officer', 'Contact name', 'e.g. Maria Lopez')}
            {text('contact_phone', 'Phone', '(555) 123-4567', 'tel')}
            <label className="sl-field sl-span-2">
              <span className="sl-field__label">Email</span>
              <input
                className={`sl-input${emailInvalid ? ' is-invalid' : ''}`}
                type="email"
                value={form.contact_email}
                onChange={(e) => set('contact_email', e.target.value)}
                placeholder="dispatch@company.com"
              />
              {emailInvalid ? <span className="sl-field__error">Enter a valid email address.</span> : null}
            </label>
          </fieldset>

          <fieldset className="sl-fieldset sl-fieldset--3">
            <legend>Fleet</legend>
            {text('total_trucks', 'Trucks', '0', 'number')}
            {text('total_drivers', 'Drivers', '0', 'number')}
            {text('years_in_business', 'Years in business', '0', 'number')}
          </fieldset>

          <fieldset className="sl-fieldset">
            <legend>Sales</legend>
            <label className="sl-field">
              <span className="sl-field__label">Grade</span>
              <select
                className="sl-input"
                value={form.grade}
                onChange={(e) => set('grade', e.target.value as ManualSalesLeadInput['grade'])}
              >
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g === 'auto' ? 'Auto (from trucks + years)' : `Grade ${g}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="sl-field">
              <span className="sl-field__label">Status</span>
              <select
                className="sl-input"
                value={form.status}
                onChange={(e) => set('status', e.target.value as SalesLeadStatus)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sl-field sl-span-2">
              <span className="sl-field__label">Notes</span>
              <textarea
                className="sl-input sl-textarea"
                rows={3}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Where you found them, call notes, follow-up date…"
              />
            </label>
          </fieldset>
        </div>

        <div className="sl-modal__actions">
          <button type="button" className="sl-btn" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="sl-btn sl-btn--primary" disabled={!canSave}>
            {saving ? 'Saving…' : lead ? 'Save changes' : 'Add lead'}
          </button>
        </div>
      </form>
    </div>
  )
}
