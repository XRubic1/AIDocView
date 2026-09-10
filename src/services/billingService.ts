import { getPlanForTier } from '../config/servicePlans'
import { PLATFORM_APP_FEE_MONTHLY } from '../config/arBillingRates'
import { getClientById } from './clientRegistry'
import {
  computeMonthlyBill,
  currentBillingPeriod,
  getClientBills,
  getBillingStanding,
  getClientCollectedVolume,
} from './arBillingService'
import type { BillingLineItem, BillingSummary } from '../types/billing'
import type { ServiceTier } from '../types/client'

const GB = 1024 * 1024 * 1024

/** Billing summary for client Settings → Plan & Billing. */
export function getClientBillingSummary(clientId: string): BillingSummary | null {
  const client = getClientById(clientId)
  if (!client) return null

  const tier: ServiceTier = client.service_tier ?? 'self_service'
  const plan = getPlanForTier(tier)
  const billing = client.billing
  const storageUsed = billing?.storage_used_bytes ?? 2.1 * GB
  const storageQuota = billing?.storage_quota_bytes ?? plan.storage_quota_bytes
  const trial = billing?.subscription_status === 'trial'
  const period = currentBillingPeriod()
  const collectedVolume = getClientCollectedVolume(clientId, period)

  let computed
  try {
    computed = computeMonthlyBill(clientId, period)
  } catch {
    computed = null
  }

  const includeAppFee = computed?.includeAppFee ?? billing?.include_platform_fee !== false
  const appFee = trial || !includeAppFee ? 0 : PLATFORM_APP_FEE_MONTHLY
  const collectionFee = computed?.arFee ?? 0

  return {
    plan,
    subscription_status: billing?.subscription_status ?? 'active',
    app_fee_monthly: appFee,
    service_fee_monthly: collectionFee,
    total_monthly: appFee + collectionFee,
    usage: {
      storage_used_bytes: storageUsed,
      storage_quota_bytes: storageQuota,
      storage_pct: storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0,
      document_count: Math.round(storageUsed / (2.5 * 1024 * 1024)),
    },
    line_items: billsToLineItems(getClientBills(clientId)),
    collected_volume: collectedVolume,
    rate_pct: computed?.ratePct,
    fee_display: computed?.feeDisplay,
    factoring: client.factoring ?? false,
    billing_standing: getBillingStanding(client),
  }
}

function billsToLineItems(bills: ReturnType<typeof getClientBills>): BillingLineItem[] {
  return bills.flatMap((bill) =>
    bill.line_items.map((li) => ({
      ...li,
      id: `${bill.id}-${li.id}`,
      date: bill.period,
      status:
        bill.status === 'paid'
          ? ('paid' as const)
          : bill.status === 'overdue'
            ? ('overdue' as const)
            : ('pending' as const),
    }))
  )
}
