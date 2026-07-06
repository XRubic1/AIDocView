import type { Broker } from '../../types/broker'

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
  created_at?: string
  updated_at?: string
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
  }
}
