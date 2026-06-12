import { mockClients } from '../data/mockClients'
import { createDefaultBilling } from '../config/servicePlans'
import type { Client, ServiceTier } from '../types/client'

const STORAGE_KEY = 'credyx_clients'
const REGISTRY_VERSION_KEY = 'credyx_clients_version'
const REGISTRY_VERSION = '2'

let clientsCache: Client[] | null = null

function seedClients(): Client[] {
  return mockClients.map((client) => {
    const tier: ServiceTier =
      client.id === 'client-2'
        ? 'managed'
        : client.service_tier ?? 'self_service'

    const billing = client.billing ?? {
      ...createDefaultBilling(tier),
      subscription_status: client.status === 'active' ? 'active' : 'trial',
      storage_used_bytes:
        client.id === 'client-1' ? 2.4 * 1024 * 1024 * 1024 : 1.1 * 1024 * 1024 * 1024,
    }

    return {
      ...client,
      service_tier: tier,
      billing,
    }
  })
}

function loadFromStorage(): Client[] | null {
  try {
    const version = localStorage.getItem(REGISTRY_VERSION_KEY)
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw || version !== REGISTRY_VERSION) return null
    return JSON.parse(raw) as Client[]
  } catch {
    return null
  }
}

function persist(clients: Client[]): void {
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
  if (!stored) persist(clientsCache)
  return clientsCache
}

export function getAllClients(): Client[] {
  return [...ensureLoaded()]
}

export function getClientById(id: string): Client | undefined {
  return ensureLoaded().find((c) => c.id === id)
}

export function getClientByEmail(email: string): Client | undefined {
  const normalized = email.trim().toLowerCase()
  return ensureLoaded().find((c) => c.email?.toLowerCase() === normalized)
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

export function createClient(input: CreateClientInput): Client {
  const clients = ensureLoaded()
  const tier = input.service_tier
  const client: Client = {
    id: `client-${Date.now()}`,
    name: input.name,
    contact_person: input.contact_person,
    email: input.email,
    phone: input.phone,
    fleet_size: input.fleet_size,
    status: input.status ?? 'pending',
    service_tier: tier,
    billing: createDefaultBilling(tier),
  }
  clientsCache = [client, ...clients]
  persist(clientsCache)
  return client
}

export function updateClient(id: string, patch: Partial<Client>): Client | undefined {
  const clients = ensureLoaded()
  const index = clients.findIndex((c) => c.id === id)
  if (index < 0) return undefined

  const updated = { ...clients[index], ...patch, id }
  const next = [...clients]
  next[index] = updated
  clientsCache = next
  persist(clientsCache)
  return updated
}

export function updateClientTier(id: string, tier: ServiceTier): Client | undefined {
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
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(REGISTRY_VERSION_KEY)
  } catch {
    /* ignore */
  }
}

export const CLIENT_ID_STORAGE_KEY = 'clientId'
