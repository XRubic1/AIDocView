/**
 * Waitlist → Set up account. Creates (or reuses) the client, links the lead,
 * then emails the carrier: "login ready" + "create your password".
 */
import { useMemo, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { useToast } from '../ui/ToastProvider'
import Spinner from '../ui/Spinner'
import { useClientTheme } from '../../theme/ThemeContext'
import { createClient, getAllClients, updateClient } from '../../services/clientRegistry'
import { provisionClientAuthAccount } from '../../services/clientAuthService'
import {
  markWaitlistLeadConverted,
  type WaitlistLead,
} from '../../services/waitlistAdminService'
import type { Client, ServiceTier } from '../../types/client'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Props = {
  lead: WaitlistLead
  onClose: () => void
  onDone: () => void
}

export default function WaitlistSetupAccountModal({ lead, onClose, onDone }: Props) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const [form, setForm] = useState({
    name: lead.company_name,
    contact: lead.contact_name,
    email: lead.email,
    phone: lead.phone ?? '',
    mc: '',
    dot: '',
    tier: 'managed' as ServiceTier,
    feePct: '',
  })
  const [saving, setSaving] = useState(false)
  const patch = (next: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...next }))

  /** Reuse a client that already has this email instead of creating a duplicate. */
  const existing = useMemo<Client | undefined>(() => {
    const email = form.email.trim().toLowerCase()
    if (lead.client_id) return getAllClients().find((cl) => cl.id === lead.client_id)
    return email ? getAllClients().find((cl) => cl.email?.trim().toLowerCase() === email) : undefined
  }, [form.email, lead.client_id])

  const handleSubmit = async () => {
    const email = form.email.trim().toLowerCase()
    if (!form.name.trim()) return showToast('Company name is required', 'error')
    if (!EMAIL_RE.test(email)) return showToast('Enter a valid email for the login', 'error')
    const fee = form.feePct.trim() ? Number(form.feePct) : null
    if (fee != null && (!Number.isFinite(fee) || fee < 0 || fee > 100)) {
      return showToast('Collection fee must be a percentage between 0 and 100', 'error')
    }

    setSaving(true)
    try {
      const client =
        existing ??
        (await createClient({
          name: form.name.trim(),
          contact_person: form.contact.trim() || undefined,
          email,
          phone: form.phone.trim() || undefined,
          fleet_size: lead.fleet_size,
          service_tier: form.tier,
          status: 'active',
        }))

      const updates: Partial<Client> = {}
      if (existing && existing.status !== 'active') updates.status = 'active'
      if (form.mc.trim()) updates.mc_number = form.mc.trim()
      if (form.dot.trim()) updates.dot_number = form.dot.trim()
      if (fee != null) updates.fee_terms = { fee_type: 'percentage', fee_percentage: fee }
      if (Object.keys(updates).length) await updateClient(client.id, updates)

      await markWaitlistLeadConverted(lead.id, client.id)

      const auth = await provisionClientAuthAccount(client.id, email)
      if (!auth.ok) {
        showToast(`Account created, but the emails did not send: ${auth.error ?? 'unknown error'}`, 'error')
        onDone()
        return
      }
      showToast(`Account ready — login and create-password emails sent to ${email}`, 'success')
      onDone()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not set up the account', 'error')
    } finally {
      setSaving(false)
    }
  }

  const field = (
    label: string,
    key: keyof typeof form,
    opts: { type?: string; placeholder?: string; required?: boolean } = {}
  ) => (
    <label className="block text-xs">
      <span className="font-medium" style={{ color: c.secondary }}>
        {label}
        {opts.required ? ' *' : ''}
      </span>
      <input
        type={opts.type ?? 'text'}
        value={form[key]}
        placeholder={opts.placeholder}
        onChange={(e) => patch({ [key]: e.target.value } as Partial<typeof form>)}
        className="client-input mt-1 w-full text-sm"
        style={{ backgroundColor: c.card, color: c.primary }}
      />
    </label>
  )

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-900/40">
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="waitlist-setup-title"
          className="relative w-full max-w-lg overflow-hidden rounded-xl shadow-xl"
          style={{ backgroundColor: c.card, border: `1px solid ${c.border}` }}
        >
          <div
            className="flex items-start justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: c.border }}
          >
            <div>
              <h2 id="waitlist-setup-title" className="text-lg font-semibold" style={{ color: c.primary }}>
                Set up account
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: c.secondary }}>
                Creates the client and emails them twice: their login details, then a link to create
                a password.
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-1" style={{ color: c.secondary }} aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-3 px-5 py-4">
            {existing ? (
              <p
                className="rounded-lg px-3 py-2 text-xs"
                style={{ backgroundColor: 'rgba(22,132,254,0.08)', color: c.primary }}
              >
                <strong>{existing.name}</strong> already exists with this email. Its login emails will
                be sent and this lead linked to it. No duplicate client is created.
              </p>
            ) : null}
            {field('Company name', 'name', { required: true })}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field('Contact name', 'contact')}
              {field('Phone', 'phone', { type: 'tel' })}
            </div>
            {field('Login email', 'email', { type: 'email', required: true })}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field('MC number', 'mc', { placeholder: 'Optional' })}
              {field('DOT number', 'dot', { placeholder: 'Optional' })}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="font-medium" style={{ color: c.secondary }}>
                  Service
                </span>
                <select
                  value={form.tier}
                  onChange={(e) => patch({ tier: e.target.value as ServiceTier })}
                  disabled={Boolean(existing)}
                  className="client-input mt-1 w-full text-sm"
                  style={{ backgroundColor: c.card, color: c.primary }}
                >
                  <option value="managed">Managed</option>
                  <option value="self_service">Self-service</option>
                </select>
              </label>
              {field('Collection fee %', 'feePct', { type: 'number', placeholder: 'Set later' })}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: c.border }}>
            <button type="button" onClick={onClose} className="dashboard-btn-secondary dashboard-btn-compact">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1.5"
            >
              {saving ? <Spinner className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
              {existing ? 'Send login emails' : 'Create account & send emails'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
