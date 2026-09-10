import type { ServicePlan } from '../types/billing'
import type { ServiceTier } from '../types/client'

const GB = 1024 * 1024 * 1024

/**
 * Public + internal service plans.
 * Enrollment offers Full Service only at $0/mo; Self-Service remains for admin/legacy.
 */
export const SERVICE_PLANS: ServicePlan[] = [
  {
    id: 'managed',
    tier: 'managed',
    name: 'Full Service',
    tagline: 'Your back office, in one portal — paid on time',
    app_fee_monthly: 0,
    storage_quota_bytes: 10 * GB,
    features: [
      'Paperwork verified so nothing gets missed',
      'Invoices submitted to brokers (PPW)',
      'Broker follow-up, holds & dispute support',
      'Live A/R status through paid on time',
      '10 GB secure document storage',
    ],
  },
  {
    id: 'diy',
    tier: 'self_service',
    name: 'Self-Service',
    tagline: 'You run your A/R — we provide the platform',
    app_fee_monthly: 0,
    storage_quota_bytes: 10 * GB,
    features: [
      'Full client portal access',
      'AI + manual batch submission',
      'Document vault & invoice tools',
      'Reports, collections & payments',
      '10 GB storage included',
    ],
  },
]

/** Plans shown on the public enroll page (Full Service only). */
export const ENROLL_PLANS: ServicePlan[] = SERVICE_PLANS.filter((p) => p.tier === 'managed')

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
    include_platform_fee: true,
  }
}
