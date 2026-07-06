import { createDefaultBilling } from '../config/servicePlans'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { clientRowToClient, clientToRow } from './supabase/clientMappers'
import { pickAvailableBatchCode } from '../utils/clientBatchCode'
import type { Client, ServiceTier } from '../types/client'

const STORAGE_KEY = 'credyx_clients'
const REGISTRY_VERSION_KEY = 'credyx_clients_version'
const REGISTRY_VERSION = '3'

let clientsCache: Client[] | null = null
let hydratePromise: Promise<void> | null = null

function seedClients(): Client[] {
  return []
}

function loadFromStorage(): Client[] | null {
  if (isSupabaseConfigured()) return null
  try {
    const version = localStorage.getItem(REGISTRY_VERSION_KEY)
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw || version !== REGISTRY_VERSION) return null
    const clients = JSON.parse(raw) as Client[]
    return clients.map((client) =>
      client.service_tier === 'self_service' && client.status === 'pending'
        ? { ...client, status: 'active' as const }
        : client
    )
  } catch {
    return null
  }
}

function persistLocal(clients: Client[]): void {
  if (isSupabaseConfigured()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clients))
    localStorage.setItem(REGISTRY_VERSION_KEY, REGISTRY_VERSION)
  } catch {
    /* ignore */
  }
}

function ensureLoaded(): Client[] {
  if (clientsCache) return clientsCache
  const stored = loadFromStorage()
  clientsCache = stored ?? seedClients()
  if (!stored && !isSupabaseConfigured()) persistLocal(clientsCache)
  return clientsCache
}

async function insertClientRow(client: Client): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.from('clients').insert(clientToRow(client))
  if (error) {
    console.error('[clientRegistry] Supabase insert failed:', error.message)
    throw new Error(error.message)
  }
}

async function updateClientRow(client: Client): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.from('clients').update(clientToRow(client)).eq('id', client.id)
  if (error) {
    console.error('[clientRegistry] Supabase update failed:', error.message)
    throw new Error(error.message)
  }
}

/** Load all clients from Supabase into the in-memory cache. */
export async function hydrateClientRegistry(): Promise<void> {
  if (hydratePromise) return hydratePromise

  hydratePromise = (async () => {
    const supabase = getSupabase()
    if (!supabase) {
      ensureLoaded()
      return
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[clientRegistry] Supabase fetch failed:', error.message)
      ensureLoaded()
      return
    }

    clientsCache = (data ?? []).map((row) => clientRowToClient(row))
  })()

  try {
    await hydratePromise
  } finally {
    hydratePromise = null
  }
}

export function getAllClients(): Client[] {
  return [...ensureLoaded()]
}

function takenBatchCodes(excludeClientId?: string): Set<string> {
  return new Set(
    ensureLoaded()
      .filter((c) => c.id !== excludeClientId && c.batch_code)
      .map((c) => c.batch_code!.toUpperCase())
  )
}

/** Return client's 4-letter batch code, assigning one on first use if missing. */
export function ensureClientBatchCode(clientId: string): string {
  const client = getClientById(clientId)
  if (!client) return 'XXXX'
  if (client.batch_code) return client.batch_code.toUpperCase()

  const batch_code = pickAvailableBatchCode(client.name, takenBatchCodes(clientId))
  const updated = { ...client, batch_code }
  const list = ensureLoaded()
  const index = list.findIndex((c) => c.id === clientId)
  if (index >= 0) {
    const next = [...list]
    next[index] = updated
    clientsCache = next
    if (isSupabaseConfigured()) {
      void updateClientRow(updated).catch(console.error)
    } else {
      persistLocal(next)
    }
  }

  return batch_code
}

export function getClientById(id: string): Client | undefined {
  return ensureLoaded().find((c) => c.id === id)
}

export function getClientByEmail(email: string): Client | undefined {
  const normalized = email.trim().toLowerCase()
  return ensureLoaded().find((c) => c.email?.toLowerCase() === normalized)
}

/** Fetch a single client from Supabase (used when cache may be empty). */
export async function fetchClientById(id: string): Promise<Client | null> {
  const cached = getClientById(id)
  if (cached) return cached

  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null

  const client = clientRowToClient(data)
  const list = ensureLoaded()
  const index = list.findIndex((c) => c.id === client.id)
  if (index >= 0) {
    list[index] = client
  } else {
    clientsCache = [client, ...list]
  }
  return client
}

/** Fetch client by email from Supabase (login / enroll flows). */
export async function fetchClientByEmail(email: string): Promise<Client | undefined> {
  await hydrateClientRegistry()
  const cached = getClientByEmail(email)
  if (cached) return cached

  const supabase = getSupabase()
  if (!supabase) return undefined

  const trimmed = email.trim()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .ilike('email', trimmed)
    .maybeSingle()

  if (error || !data) return undefined

  const client = clientRowToClient(data)
  clientsCache = [client, ...ensureLoaded().filter((c) => c.id !== client.id)]
  return client
}

export interface CreateClientInput {
  name: string
  contact_person?: string
  email?: string
  phone?: string
  fleet_size?: string
  service_tier: ServiceTier
  status?: Client['status']
}

export async function createClient(input: CreateClientInput): Promise<Client> {
  const tier = input.service_tier
  const defaultStatus: Client['status'] = tier === 'self_service' ? 'active' : 'pending'
  const batch_code = pickAvailableBatchCode(input.name, takenBatchCodes())
  const client: Client = {
    id: `client-${Date.now()}`,
    name: input.name,
    contact_person: input.contact_person,
    email: input.email,
    phone: input.phone,
    fleet_size: input.fleet_size,
    status: input.status ?? defaultStatus,
    service_tier: tier,
    billing: createDefaultBilling(tier),
    batch_code,
  }

  if (isSupabaseConfigured()) {
    await insertClientRow(client)
  } else {
    const clients = ensureLoaded()
    clientsCache = [client, ...clients]
    persistLocal(clientsCache)
  }

  clientsCache = [client, ...ensureLoaded().filter((c) => c.id !== client.id)]
  return client
}

export async function updateClient(
  id: string,
  patch: Partial<Client>
): Promise<Client | undefined> {
  const clients = ensureLoaded()
  const index = clients.findIndex((c) => c.id === id)
  if (index < 0) return undefined

  const updated = { ...clients[index], ...patch, id }
  const next = [...clients]
  next[index] = updated
  clientsCache = next

  if (isSupabaseConfigured()) {
    await updateClientRow(updated)
  } else {
    persistLocal(next)
  }

  return updated
}

export async function updateClientTier(id: string, tier: ServiceTier): Promise<Client | undefined> {
  const client = getClientById(id)
  if (!client) return undefined

  const planBilling = createDefaultBilling(tier)
  return updateClient(id, {
    service_tier: tier,
    billing: {
      ...client.billing,
      ...planBilling,
      subscription_status: client.billing?.subscription_status ?? 'active',
      storage_used_bytes: client.billing?.storage_used_bytes ?? 0,
      enrolled_at: client.billing?.enrolled_at ?? planBilling.enrolled_at,
    },
  })
}

export function resetClientRegistry(): void {
  clientsCache = null
  hydratePromise = null
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(REGISTRY_VERSION_KEY)
  } catch {
    /* ignore */
  }
}

export const CLIENT_ID_STORAGE_KEY = 'clientId'
