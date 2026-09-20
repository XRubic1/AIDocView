import { requireSupabase, isSupabaseConfigured } from '../lib/supabase'
import { sendTransactionalEmail } from './emailService'
import { getRuntimeEnvString } from '../platform/runtimeEnv'
import { detectDeviceType, resolveVisitorGeo } from './websiteAnalytics'

export interface WaitlistSignupInput {
  companyName: string
  contactName: string
  email: string
  phone?: string
  fleetSize: string
  hearAbout?: string
  notes?: string
}

export interface WaitlistSignupResult {
  id: string
  /** True when this email was already on the waitlist. */
  alreadySignedUp: boolean
}

function getAdminAlertEmail(): string {
  return getRuntimeEnvString('VITE_ADMIN_ALERT_EMAIL') ?? 'admin@credyx.com'
}

/** Persist a waitlist lead and best-effort notify ops via email. */
export async function submitWaitlistSignup(
  input: WaitlistSignupInput
): Promise<WaitlistSignupResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('Waitlist is not configured. Missing Supabase environment variables.')
  }

  const supabase = requireSupabase()
  const email = input.email.trim().toLowerCase()
  const companyName = input.companyName.trim()
  const contactName = input.contactName.trim()
  const fleetSize = input.fleetSize.trim()
  const phone = input.phone?.trim() || null
  const hearAbout = input.hearAbout?.trim() || null
  const notes = input.notes?.trim() || null

  if (!companyName || !contactName || !email || !fleetSize) {
    throw new Error('Please fill in all required fields.')
  }

  // Capture visitor context so admin can mark same-IP sessions as Joined.
  const geo = await resolveVisitorGeo()
  const deviceType = detectDeviceType()

  const row = {
    company_name: companyName,
    contact_name: contactName,
    email,
    phone,
    fleet_size: fleetSize,
    hear_about: hearAbout,
    notes,
    ip_address: geo.ip_address,
    region: geo.region,
    device_type: deviceType,
  }

  // Insert without `.select()` — anon has INSERT but no SELECT policy (admin-only reads).
  // PostgREST RETURNING would fail RLS with "new row violates row-level security policy".
  const { error } = await supabase.from('waitlist_signups').insert(row)

  // Unique email conflict → treat as success (already on the list).
  if (error) {
    const isDuplicate =
      error.code === '23505' ||
      /duplicate|unique/i.test(error.message ?? '')

    if (isDuplicate) {
      return { id: 'existing', alreadySignedUp: true }
    }

    throw new Error(error.message || 'Failed to join waitlist.')
  }

  // Welcome the joiner + alert ops — do not fail the signup if email delivery is down.
  void sendTransactionalEmail('waitlist_welcome', email, {
    contactName,
    companyName,
  })

  void sendTransactionalEmail('waitlist_signup_alert', getAdminAlertEmail(), {
    companyName,
    contactName,
    email,
    phone: phone ?? '—',
    fleetSize,
    hearAbout: hearAbout ?? '—',
    notes: notes ?? '—',
  })

  return { id: crypto.randomUUID(), alreadySignedUp: false }
}
