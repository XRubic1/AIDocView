import type { Broker, BrokerPreferredContact } from '../../types/broker'

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
  payment_status_inquiry_days?: number | null
  preferred_contact?: string | null
  created_at?: string
  updated_at?: string
}

function asPreferredContact(v: string | null | undefined): BrokerPreferredContact | undefined {
  if (v === 'email' || v === 'phone' || v === 'either') return v
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
    payment_status_inquiry_days: row.payment_status_inquiry_days ?? undefined,
    preferred_contact: asPreferredContact(row.preferred_contact),
  }
}

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
    payment_status_inquiry_days: broker.payment_status_inquiry_days ?? null,
    preferred_contact: broker.preferred_contact ?? null,
  }
}
