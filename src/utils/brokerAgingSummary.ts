import type { Invoice } from '../types/invoice'
import { getInvoiceAgeDays, isOpenArInvoice } from './invoiceAging'

export type BrokerAgingBucketKey = 'd0_15' | 'd16_30' | 'd31_45' | 'd46_60' | 'd61_up'

export const BROKER_AGING_BUCKETS: { key: BrokerAgingBucketKey; label: string }[] = [
  { key: 'd0_15', label: '0–15' },
  { key: 'd16_30', label: '16–30' },
  { key: 'd31_45', label: '31–45' },
  { key: 'd46_60', label: '46–60' },
  { key: 'd61_up', label: '61+' },
]

export type AgingAmountRow = {
  invoiceCount: number
  amounts: Record<BrokerAgingBucketKey, number>
  total: number
  percentOfTotal: number
  avgAgeDays: number
  invoiceIds: string[]
}

export type BrokerAgingRow = AgingAmountRow & {
  brokerId: string
  brokerName: string
}

export type CarrierAgingRow = AgingAmountRow & {
  clientId: string
  clientName: string
  brokers: BrokerAgingRow[]
}

/** Map invoice age (days since invoice date) into summary-aging buckets. */
export function brokerAgingBucketKey(ageDays: number): BrokerAgingBucketKey {
  if (ageDays <= 15) return 'd0_15'
  if (ageDays <= 30) return 'd16_30'
  if (ageDays <= 45) return 'd31_45'
  if (ageDays <= 60) return 'd46_60'
  return 'd61_up'
}

export function emptyAgingAmounts(): Record<BrokerAgingBucketKey, number> {
  return {
    d0_15: 0,
    d16_30: 0,
    d31_45: 0,
    d46_60: 0,
    d61_up: 0,
  }
}

function sumAmounts(
  amounts: Record<BrokerAgingBucketKey, number>
): number {
  return BROKER_AGING_BUCKETS.reduce((sum, bucket) => sum + amounts[bucket.key], 0)
}

function withPercents<T extends { total: number; percentOfTotal: number }>(
  rows: T[],
  grand: number
): T[] {
  for (const row of rows) {
    row.percentOfTotal = grand > 0 ? (row.total / grand) * 100 : 0
  }
  return rows
}

/**
 * Open A/R grouped by broker. Pass a carrier's invoices to get concentration within that carrier.
 */
export function buildBrokerAgingRows(invoices: Invoice[], asOf: Date = new Date()): BrokerAgingRow[] {
  const open = invoices.filter(isOpenArInvoice)
  const byKey = new Map<
    string,
    {
      brokerId: string
      brokerName: string
      amounts: Record<BrokerAgingBucketKey, number>
      ageSum: number
      invoiceIds: string[]
    }
  >()

  for (const invoice of open) {
    const brokerId = invoice.broker_id || `name:${invoice.broker_name}`
    const existing = byKey.get(brokerId)
    const ageDays = getInvoiceAgeDays(invoice, asOf)
    const bucket = brokerAgingBucketKey(ageDays)
    if (existing) {
      existing.amounts[bucket] += invoice.amount
      existing.ageSum += ageDays
      existing.invoiceIds.push(invoice.id)
      continue
    }
    const amounts = emptyAgingAmounts()
    amounts[bucket] = invoice.amount
    byKey.set(brokerId, {
      brokerId: invoice.broker_id || brokerId,
      brokerName: invoice.broker_name,
      amounts,
      ageSum: ageDays,
      invoiceIds: [invoice.id],
    })
  }

  const rows: BrokerAgingRow[] = [...byKey.values()].map((row) => ({
    brokerId: row.brokerId,
    brokerName: row.brokerName,
    invoiceCount: row.invoiceIds.length,
    amounts: row.amounts,
    total: sumAmounts(row.amounts),
    percentOfTotal: 0,
    avgAgeDays: row.invoiceIds.length ? Math.round(row.ageSum / row.invoiceIds.length) : 0,
    invoiceIds: row.invoiceIds,
  }))

  const grand = rows.reduce((sum, row) => sum + row.total, 0)
  return withPercents(rows, grand).sort((a, b) => b.total - a.total)
}

/**
 * Open A/R grouped by carrier (client), with brokers nested as children.
 */
export function buildCarrierAgingRows(invoices: Invoice[], asOf: Date = new Date()): CarrierAgingRow[] {
  const open = invoices.filter(isOpenArInvoice)
  const byClient = new Map<string, Invoice[]>()
  for (const invoice of open) {
    const clientId = invoice.client_id || `name:${invoice.client_name}`
    const list = byClient.get(clientId)
    if (list) list.push(invoice)
    else byClient.set(clientId, [invoice])
  }

  const rows: CarrierAgingRow[] = []
  for (const [clientId, clientInvoices] of byClient) {
    const brokers = buildBrokerAgingRows(clientInvoices, asOf)
    const amounts = emptyAgingAmounts()
    let ageSum = 0
    const invoiceIds: string[] = []
    for (const invoice of clientInvoices) {
      const ageDays = getInvoiceAgeDays(invoice, asOf)
      amounts[brokerAgingBucketKey(ageDays)] += invoice.amount
      ageSum += ageDays
      invoiceIds.push(invoice.id)
    }
    rows.push({
      clientId: clientInvoices[0]?.client_id || clientId,
      clientName: clientInvoices[0]?.client_name || 'Carrier',
      invoiceCount: invoiceIds.length,
      amounts,
      total: sumAmounts(amounts),
      percentOfTotal: 0,
      avgAgeDays: invoiceIds.length ? Math.round(ageSum / invoiceIds.length) : 0,
      invoiceIds,
      brokers,
    })
  }

  const grand = rows.reduce((sum, row) => sum + row.total, 0)
  return withPercents(rows, grand)
}
