import type { ServicePlan } from '../types/billing'
import type { ServiceTier } from '../types/client'

const GB = 1024 * 1024 * 1024

export const SERVICE_PLANS: ServicePlan[] = [
  {
    id: 'diy',
    tier: 'self_service',
    name: 'Self-Service',
    tagline: 'You run your A/R — we provide the platform',
    app_fee_monthly: 99,
    storage_quota_bytes: 10 * GB,
    features: [
      'Full client portal access',
      'AI + manual batch submission',
      'Document vault & invoice tools',
      'Reports, collections & payments',
      '10 GB storage included',
    ],
  },
  {
    id: 'managed',
    tier: 'managed',
    name: 'Managed',
    tagline: 'Credyx handles operations — you stay in control',
    app_fee_monthly: 99,
    storage_quota_bytes: 10 * GB,
    service_fee_monthly: 299,
    features: [
      'Everything in Self-Service portal (view)',
      'Credyx processes batches & collections',
      'Simplified document handoff',
      'Dedicated ops support',
      '10 GB storage included',
    ],
  },
]

export function getPlanById(planId: string): ServicePlan | undefined {
  return SERVICE_PLANS.find((p) => p.id === planId)
}

export function getPlanForTier(tier: ServiceTier): ServicePlan {
  return SERVICE_PLANS.find((p) => p.tier === tier) ?? SERVICE_PLANS[0]
}

export function formatStorage(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export function createDefaultBilling(tier: ServiceTier): import('../types/client').ClientBilling {
  const plan = getPlanForTier(tier)
  return {
    plan_id: plan.id,
    subscription_status: 'trial',
    storage_used_bytes: 0,
    storage_quota_bytes: plan.storage_quota_bytes,
    app_fee_monthly: plan.app_fee_monthly,
    service_fee_monthly: plan.service_fee_monthly,
    enrolled_at: new Date().toISOString(),
  }
}
