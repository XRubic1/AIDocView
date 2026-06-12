import { getPlanForTier, formatStorage } from '../config/servicePlans'
import { getClientById } from './clientRegistry'
import type { BillingLineItem, BillingSummary } from '../types/billing'
import type { ServiceTier } from '../types/client'

const GB = 1024 * 1024 * 1024

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

/** Mock billing summary for client Settings → Plan & Billing. */
export function getClientBillingSummary(clientId: string): BillingSummary | null {
  const client = getClientById(clientId)
  if (!client) return null

  const tier: ServiceTier = client.service_tier ?? 'self_service'
  const plan = getPlanForTier(tier)
  const billing = client.billing
  const storageUsed = billing?.storage_used_bytes ?? 2.1 * GB
  const storageQuota = billing?.storage_quota_bytes ?? plan.storage_quota_bytes
  const appFee = billing?.app_fee_monthly ?? plan.app_fee_monthly
  const serviceFee = billing?.service_fee_monthly ?? plan.service_fee_monthly ?? 0

  return {
    plan,
    subscription_status: billing?.subscription_status ?? 'active',
    app_fee_monthly: appFee,
    service_fee_monthly: serviceFee,
    total_monthly: appFee + serviceFee,
    usage: {
      storage_used_bytes: storageUsed,
      storage_quota_bytes: storageQuota,
      storage_pct: storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0,
      document_count: Math.round(storageUsed / (2.5 * 1024 * 1024)),
    },
    line_items: getMockInvoices(clientId),
  }
}

export function getMockInvoices(clientId: string): BillingLineItem[] {
  const client = getClientById(clientId)
  const tier = client?.service_tier ?? 'self_service'
  const plan = getPlanForTier(tier)
  const appFee = client?.billing?.app_fee_monthly ?? plan.app_fee_monthly
  const serviceFee = client?.billing?.service_fee_monthly ?? plan.service_fee_monthly ?? 0

  const items: BillingLineItem[] = [
    {
      id: 'inv-1',
      date: daysAgoIso(5),
      description: `${plan.name} — platform subscription`,
      amount: appFee,
      status: 'paid',
    },
    {
      id: 'inv-2',
      date: daysAgoIso(5),
      description: `Storage (${formatStorage(client?.billing?.storage_used_bytes ?? 0)} used)`,
      amount: 0,
      status: 'paid',
    },
  ]

  if (tier === 'managed' && serviceFee > 0) {
    items.push({
      id: 'inv-3',
      date: daysAgoIso(5),
      description: 'Managed service fee',
      amount: serviceFee,
      status: 'paid',
    })
  }

  return items
}
