import type { Client, ClientBilling, ClientNotificationPreferences, ServiceTier } from '../../types/client'

/** Row shape for public.clients */
export interface ClientRow {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  fax: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  mc_number: string | null
  dot_number: string | null
  remittance_info: string | null
  bank_name: string | null
  account_number: string | null
  routing_number: string | null
  remittance_updated_at: string | null
  notes: string | null
  status: 'active' | 'inactive' | 'pending' | 'suspended'
  service_tier: ServiceTier
  fleet_size: string | null
  batch_code: string | null
  factoring: boolean
  ar_rate_override: number | null
  reimbursement_balance: number | null
  billing: ClientBilling | null
  fee_terms: Client['fee_terms'] | null
  notification_prefs: ClientNotificationPreferences | null
  created_at?: string
  updated_at?: string
}

export function clientRowToClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    contact_person: row.contact_person ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    fax: row.fax ?? undefined,
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    zip: row.zip ?? undefined,
    mc_number: row.mc_number ?? undefined,
    dot_number: row.dot_number ?? undefined,
    remittance_info: row.remittance_info ?? undefined,
    bank_name: row.bank_name ?? undefined,
    account_number: row.account_number ?? undefined,
    routing_number: row.routing_number ?? undefined,
    remittance_updated_at: row.remittance_updated_at ?? undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    service_tier: row.service_tier,
    fleet_size: row.fleet_size ?? undefined,
    batch_code: row.batch_code ?? undefined,
    factoring: row.factoring ?? false,
    ar_rate_override: row.ar_rate_override ?? undefined,
    reimbursement_balance: row.reimbursement_balance != null ? Number(row.reimbursement_balance) : undefined,
    billing: row.billing ?? undefined,
    fee_terms: row.fee_terms ?? undefined,
    notification_prefs: row.notification_prefs ?? undefined,
  }
}

export function clientToRow(client: Client): ClientRow {
  return {
    id: client.id,
    name: client.name,
    contact_person: client.contact_person ?? null,
    email: client.email ?? null,
    phone: client.phone ?? null,
    fax: client.fax ?? null,
    address: client.address ?? null,
    city: client.city ?? null,
    state: client.state ?? null,
    zip: client.zip ?? null,
    mc_number: client.mc_number ?? null,
    dot_number: client.dot_number ?? null,
    remittance_info: client.remittance_info ?? null,
    bank_name: client.bank_name ?? null,
    account_number: client.account_number ?? null,
    routing_number: client.routing_number ?? null,
    remittance_updated_at: client.remittance_updated_at ?? null,
    notes: client.notes ?? null,
    status: client.status ?? 'pending',
    service_tier: client.service_tier ?? 'self_service',
    fleet_size: client.fleet_size ?? null,
    batch_code: client.batch_code ?? null,
    factoring: client.factoring ?? false,
    ar_rate_override: client.ar_rate_override ?? null,
    reimbursement_balance: client.reimbursement_balance ?? 0,
    billing: client.billing ?? null,
    fee_terms: client.fee_terms ?? null,
    notification_prefs: client.notification_prefs ?? null,
  }
}
