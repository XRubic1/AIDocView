/**
 * Network-wide broker payment insight: one broker across all carriers.
 */
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'
import type { Broker } from '../types/broker'
import { normalizeBrokerNameKey } from './brokerRiskPolicy'
import {
  computeBrokerPaymentHistory,
  fillMonthSeries,
  type BrokerMonthHistory,
  type BrokerPaymentHistory,
  type BrokerYearHistory,
} from './brokerPaymentHistory'

export type BrokerPayTrend = 'faster' | 'slower' | 'steady' | 'thin'

export interface BrokerCarrierPaySlice {
  clientId: string
  clientName: string
  paidAmount: number
  paidCount: number
  avgDaysToPay: number | null
  openAr: number
  invoiceCount: number
  holdCount: number
  disputeCount: number
  pausedInvoiceCount: number
  pausedShare: number
  pausedOpenAr: number
  /** One carrier holds most of this broker's paused loads. */
  isBlockedOutlier: boolean
}

export interface NetworkBrokerPaymentInsight {
  brokerKey: string
  brokerName: string
  brokerId: string
  paymentTermsDays: number | null
  history: BrokerPaymentHistory
  monthsFilled: BrokerMonthHistory[]
  years: BrokerYearHistory[]
  carrierCount: number
  carriers: BrokerCarrierPaySlice[]
  last3AvgDays: number | null
  prior3AvgDays: number | null
  trend: BrokerPayTrend
  outlierCarriers: BrokerCarrierPaySlice[]
}

function avgDays(months: BrokerMonthHistory[]): number | null {
  const days = months
    .filter((m) => m.avgDaysToPay != null && m.paidCount > 0)
    .map((m) => m.avgDaysToPay as number)
  if (days.length === 0) return null
  return Math.round(days.reduce((a, b) => a + b, 0) / days.length)
}

function trendFromWindows(
  last3: number | null,
  prior3: number | null,
  sampleCount: number
): BrokerPayTrend {
  if (sampleCount < 4 || last3 == null || prior3 == null) return 'thin'
  const delta = last3 - prior3
  if (delta >= 4) return 'slower'
  if (delta <= -4) return 'faster'
  return 'steady'
}

/**
 * Roll confirmed payments up by broker name across the whole book.
 * Same broker on 150 carriers becomes one insight row.
 */
export function computeNetworkBrokerPaymentInsights(
  invoices: Invoice[],
  payments: Payment[],
  brokers: Broker[]
): NetworkBrokerPaymentInsight[] {
  const catalogByKey = new Map<string, Broker>()
  for (const broker of brokers) {
    const key = normalizeBrokerNameKey(broker.name)
    if (!catalogByKey.has(key)) catalogByKey.set(key, broker)
  }

  const keys = new Set<string>()
  for (const inv of invoices) {
    const key = normalizeBrokerNameKey(inv.broker_name || inv.broker_id)
    if (key) keys.add(key)
  }

  const insights: NetworkBrokerPaymentInsight[] = []

  for (const brokerKey of keys) {
    const catalog = catalogByKey.get(brokerKey)
    const brokerInvoices = invoices.filter(
      (inv) => normalizeBrokerNameKey(inv.broker_name || inv.broker_id) === brokerKey
    )
    if (brokerInvoices.length === 0) continue

    const nameCounts = new Map<string, number>()
    for (const inv of brokerInvoices) {
      const name = inv.broker_name.trim() || catalog?.name || brokerKey
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
    }
    const brokerName =
      catalog?.name ??
      [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      brokerKey
    const brokerId = catalog?.id ?? brokerInvoices[0]?.broker_id ?? brokerKey
    const terms = catalog?.payment_terms_days ?? null

    const history = computeBrokerPaymentHistory(brokerId, payments, brokerInvoices, {
      paymentTermsDays: terms,
      brokerName,
    })
    const monthsFilled = fillMonthSeries(history.months, 18)
    const last3 = avgDays(monthsFilled.slice(0, 3))
    const prior3 = avgDays(monthsFilled.slice(3, 6))
    const recentSample = monthsFilled.slice(0, 6).reduce((n, m) => n + m.paidCount, 0)

    const carrierMap = new Map<string, Invoice[]>()
    for (const inv of brokerInvoices) {
      const list = carrierMap.get(inv.client_id) ?? []
      list.push(inv)
      carrierMap.set(inv.client_id, list)
    }

    const carriers: BrokerCarrierPaySlice[] = [...carrierMap.entries()]
      .map(([clientId, list]) => {
        const slice = computeBrokerPaymentHistory(brokerId, payments, list, {
          paymentTermsDays: terms,
          brokerName,
        })
        return {
          clientId,
          clientName: list[0]?.client_name || clientId,
          paidAmount: slice.lifetimePaid,
          paidCount: slice.lifetimeCount,
          avgDaysToPay: slice.avgDaysToPay,
          openAr: slice.openAr,
          invoiceCount: slice.invoiceCount,
          holdCount: slice.holdCount,
          disputeCount: slice.disputeCount,
          pausedInvoiceCount: slice.pausedInvoiceCount,
          pausedShare: slice.pausedInvoiceShare,
          pausedOpenAr: slice.pausedOpenAr,
          isBlockedOutlier:
            slice.invoiceCount >= 8 && slice.pausedInvoiceShare >= 0.5,
        }
      })
      .sort((a, b) => {
        if (Number(b.isBlockedOutlier) - Number(a.isBlockedOutlier) !== 0) {
          return Number(b.isBlockedOutlier) - Number(a.isBlockedOutlier)
        }
        if (b.pausedShare !== a.pausedShare) return b.pausedShare - a.pausedShare
        return b.openAr - a.openAr || b.paidAmount - a.paidAmount
      })

    const outlierCarriers = carriers.filter((c) => c.isBlockedOutlier)

    insights.push({
      brokerKey,
      brokerName,
      brokerId,
      paymentTermsDays: terms,
      history,
      monthsFilled,
      years: history.years,
      carrierCount: carriers.length,
      carriers,
      last3AvgDays: last3,
      prior3AvgDays: prior3,
      trend: trendFromWindows(last3, prior3, recentSample),
      outlierCarriers,
    })
  }

  return insights.sort((a, b) => {
    const outlierDiff = b.outlierCarriers.length - a.outlierCarriers.length
    if (outlierDiff !== 0) return outlierDiff
    const pausedDiff = b.history.pausedInvoiceShare - a.history.pausedInvoiceShare
    if (pausedDiff !== 0) return pausedDiff
    const trendRank = { slower: 0, thin: 1, steady: 2, faster: 3 }
    const tr = trendRank[a.trend] - trendRank[b.trend]
    if (tr !== 0) return tr
    if (b.history.openAr !== a.history.openAr) return b.history.openAr - a.history.openAr
    return b.history.lifetimePaid - a.history.lifetimePaid
  })
}
