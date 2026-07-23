import { describe, expect, it } from 'vitest'
import {
  formatFeeTermsLabel,
  feeAmountForPayment,
  isBatchFeeLocked,
  snapshotFeeTermsFromClient,
} from './feeTermsLock'
import type { Client } from '../types/client'

describe('feeTermsLock', () => {
  it('snapshots trial mode from client subscription', () => {
    const client = {
      id: 'c1',
      name: 'Carrier',
      fee_terms: { fee_type: 'percentage', fee_percentage: 1 },
      billing: {
        plan_id: 'p',
        subscription_status: 'trial',
        storage_used_bytes: 0,
        storage_quota_bytes: 1,
        app_fee_monthly: 99,
        enrolled_at: '2026-01-01',
      },
    } as Client

    const snap = snapshotFeeTermsFromClient(client)
    expect(snap?.billing_mode).toBe('trial')
    expect(snap?.fee_percentage).toBe(1)
    expect(formatFeeTermsLabel(snap)).toBe('Trial (waived)')
    expect(feeAmountForPayment(1000, snap)).toBe(0)
  })

  it('charges percentage when billable', () => {
    const snap = snapshotFeeTermsFromClient({
      id: 'c1',
      name: 'Carrier',
      fee_terms: { fee_type: 'percentage', fee_percentage: 1.25 },
      billing: {
        plan_id: 'p',
        subscription_status: 'active',
        storage_used_bytes: 0,
        storage_quota_bytes: 1,
        app_fee_monthly: 99,
        enrolled_at: '2026-01-01',
      },
    } as Client)
    expect(feeAmountForPayment(1000, snap)).toBe(12.5)
    expect(formatFeeTermsLabel(snap)).toBe('1.25%')
  })

  it('locks fees only after the batch is processed', () => {
    expect(isBatchFeeLocked({ status: 'ready_to_post' })).toBe(false)
    expect(isBatchFeeLocked({ status: 'verification' })).toBe(false)
    expect(isBatchFeeLocked({ status: 'submitted' })).toBe(true)
    expect(isBatchFeeLocked({ status: 'processing' })).toBe(true)
  })
})
