import type { Broker, BrokerPreferredContact, BrokerVerificationType } from '../../types/broker'

export interface BrokerRow {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  emails: Broker['emails'] | null
  phone: string | null
  phones: Broker['phones'] | null
  fax: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  mc_number: string | null
  dot_number: string | null
  notes: string | null
  payment_terms_days: number | null
  paperwork_status_check_days?: number | null
  payment_status_inquiry_days?: number | null
  preferred_contact?: string | null
  verification_type?: string | null
  verification_website_id?: string | null
  is_new?: boolean | null
  carrier_notes?: string | null
  created_at?: string
  updated_at?: string
}

function asPreferredContact(v: string | null | undefined): BrokerPreferredContact | undefined {
  if (v === 'email' || v === 'phone' || v === 'either') return v
  return undefined
}

function asVerificationType(v: string | null | undefined): BrokerVerificationType | undefined {
  if (v === 'email' || v === 'phone' || v === 'web') return v
  return undefined
}

export function brokerRowToBroker(row: BrokerRow): Broker {
  return {
    id: row.id,
    name: row.name,
    contact_person: row.contact_person ?? undefined,
    email: row.email ?? undefined,
    emails: row.emails ?? undefined,
    phone: row.phone ?? undefined,
    phones: row.phones ?? undefined,
    fax: row.fax ?? undefined,
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    zip: row.zip ?? undefined,
    mc_number: row.mc_number ?? undefined,
    dot_number: row.dot_number ?? undefined,
    notes: row.notes ?? undefined,
    payment_terms_days: row.payment_terms_days ?? undefined,
    paperwork_status_check_days: row.paperwork_status_check_days ?? undefined,
    payment_status_inquiry_days: row.payment_status_inquiry_days ?? undefined,
    preferred_contact: asPreferredContact(row.preferred_contact),
    verification_type: asVerificationType(row.verification_type),
    verification_website_id: row.verification_website_id ?? undefined,
    is_new: Boolean(row.is_new),
    carrier_notes: row.carrier_notes ?? undefined,
  }
}

/**
 * Carrier-safe mapper: never includes Broker.notes (internal Credyx warnings).
 * Does include is_new + carrier_notes (Credyx → carrier).
 */
export function brokerRowToPublicBroker(row: BrokerRow): Broker {
  const broker = brokerRowToBroker(row)
  return { ...broker, notes: undefined }
}

/** Columns safe to select for carrier portal hydrate (excludes internal notes). */
export const BROKER_PUBLIC_SELECT =
  'id, name, contact_person, email, emails, phone, phones, fax, address, city, state, zip, mc_number, dot_number, payment_terms_days, paperwork_status_check_days, payment_status_inquiry_days, preferred_contact, verification_type, verification_website_id, is_new, carrier_notes, created_at, updated_at'

export function brokerToRow(broker: Broker): BrokerRow {
  return {
    id: broker.id,
    name: broker.name,
    contact_person: broker.contact_person ?? null,
    email: broker.email ?? null,
    emails: broker.emails ?? null,
    phone: broker.phone ?? null,
    phones: broker.phones ?? null,
    fax: broker.fax ?? null,
    address: broker.address ?? null,
    city: broker.city ?? null,
    state: broker.state ?? null,
    zip: broker.zip ?? null,
    mc_number: broker.mc_number ?? null,
    dot_number: broker.dot_number ?? null,
    notes: broker.notes ?? null,
    payment_terms_days: broker.payment_terms_days ?? null,
    paperwork_status_check_days: broker.paperwork_status_check_days ?? null,
    payment_status_inquiry_days: broker.payment_status_inquiry_days ?? null,
    preferred_contact: broker.preferred_contact ?? null,
    verification_type: broker.verification_type ?? 'email',
    verification_website_id: broker.verification_website_id ?? null,
    is_new: Boolean(broker.is_new),
    carrier_notes: broker.carrier_notes ?? null,
  }
}
