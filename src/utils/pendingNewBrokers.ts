import { mockBrokers } from '../data/mockBrokers'
import { mockInvoices } from '../data/mockInvoices'
import type { Broker } from '../types/broker'
import type { Invoice } from '../types/invoice'

export interface PendingBrokerCatalogMatch {
  id: string
  name: string
}

/** Standard Due by for a broker Credyx is adding for the first time. */
export const STANDARD_NEW_BROKER_PAY_TERMS_DAYS = 30

/** Compare broker names ignoring case and extra spaces. Catalog names are stored in caps. */
export function normalizeBrokerNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase()
}

export interface PendingNewBroker {
  /** Name as the carrier submitted it. */
  name: string
  key: string
  invoices: Invoice[]
  clientNames: string[]
  loadCount: number
  totalAmount: number
  /** Name already exists in the directory, but these loads are not linked yet. */
  catalogMatch?: PendingBrokerCatalogMatch
}

/**
 * Carrier loads whose broker is not linked to a directory row.
 * Unknown names need to be reviewed and added. A name that already matches
 * the directory still shows up so those loads can be attached.
 */
export function listPendingNewBrokers(
  invoices: Invoice[] = mockInvoices,
  brokers: Pick<Broker, 'id' | 'name'>[] = mockBrokers
): PendingNewBroker[] {
  const catalogByKey = new Map<string, PendingBrokerCatalogMatch>()
  for (const broker of brokers) {
    const key = normalizeBrokerNameKey(broker.name)
    if (!key || !broker.id || catalogByKey.has(key)) continue
    catalogByKey.set(key, { id: broker.id, name: broker.name })
  }
  const groups = new Map<string, PendingNewBroker>()

  for (const inv of invoices) {
    const raw = inv.broker_name?.trim()
    if (!raw || inv.broker_id?.trim()) continue
    const key = normalizeBrokerNameKey(raw)
    if (!key) continue

    let group = groups.get(key)
    if (!group) {
      group = {
        name: raw,
        key,
        invoices: [],
        clientNames: [],
        loadCount: 0,
        totalAmount: 0,
        catalogMatch: catalogByKey.get(key),
      }
      groups.set(key, group)
    }
    group.invoices.push(inv)
    group.loadCount += 1
    group.totalAmount += Number(inv.amount) || 0
    if (inv.client_name && !group.clientNames.includes(inv.client_name)) {
      group.clientNames.push(inv.client_name)
    }
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}
