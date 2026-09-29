import { describe, expect, it } from 'vitest'
import {
  invoicePatchFromPaperwork,
  overlayPacketOnFileChecks,
  snapshotAfterPacketResolve,
  snapshotHasResolvablePacketIssues,
} from './packetOnFileReview'
import type { InvoiceAiReviewSnapshot } from '../types/invoiceAiReview'
import type { LoadCheckRow } from './loadReviewSummary'

function row(partial: Partial<LoadCheckRow> & Pick<LoadCheckRow, 'id' | 'label' | 'status'>): LoadCheckRow {
  return {
    summary: partial.summary ?? '',
    ...partial,
  }
}

describe('packetOnFileReview', () => {
  it('flags load, amount, and carrier when paperwork disagrees with the packet on file', () => {
    const checks = overlayPacketOnFileChecks(
      [
        row({ id: 'req_bol', label: 'BOL', status: 'ok' }),
        row({ id: 'req_stops', label: 'Stops', status: 'ok' }),
      ],
      {
        loadNumber: '91111978568',
        amount: 390,
        brokerName: 'Traffix',
        carrierName: 'Credyx AR Solutions',
      },
      {
        loadNumber: 'T01633053',
        amount: 1300,
        brokerName: 'Traffix',
        carrierName: 'A&M Transport LLC',
      }
    )
    expect(checks.find((c) => c.id === 'req_load')?.status).toBe('issue')
    expect(checks.find((c) => c.id === 'req_amount')?.status).toBe('issue')
    expect(checks.find((c) => c.id === 'req_broker')?.status).toBe('ok')
    expect(checks.find((c) => c.id === 'req_carrier')?.status).toBe('issue')
    expect(checks.find((c) => c.id === 'req_carrier')?.summary).toMatch(/does not match/i)
    expect(checks.map((c) => c.id)).toEqual([
      'req_load',
      'req_broker',
      'req_amount',
      'req_bol',
      'req_stops',
      'req_carrier',
      'req_page_count',
    ])
  })

  it('passes carrier when paperwork matches the account on file', () => {
    const checks = overlayPacketOnFileChecks(
      [],
      { carrierName: 'Demo Carrier LLC' },
      { carrierName: 'Demo Carrier LLC' }
    )
    expect(checks.find((c) => c.id === 'req_carrier')?.status).toBe('ok')
  })

  it('fails carrier when account is on file but RC has no carrier name', () => {
    const checks = overlayPacketOnFileChecks(
      [],
      { carrierName: 'Demo Carrier LLC' },
      { carrierName: undefined }
    )
    const carrier = checks.find((c) => c.id === 'req_carrier')
    expect(carrier?.status).toBe('issue')
    expect(carrier?.summary).toMatch(/not found on the rate confirmation/i)
  })

  it('copies paperwork load, amount, and broker but never the carrier', () => {
    const patch = invoicePatchFromPaperwork({
      loadNumber: 'T01633053',
      amount: 1300,
      brokerName: 'Traffix',
      carrierName: 'A&M Transport LLC',
    })
    expect(patch.load_number).toBe('T01633053')
    expect(patch.amount).toBe(1300)
    expect(patch.broker_name).toBeTruthy()
    expect(patch).not.toHaveProperty('client_name')
  })

  it('re-scores snapshot after resolve and keeps carrier mismatch until names align', () => {
    const snapshot: InvoiceAiReviewSnapshot = {
      headline: 'Needs additional work',
      detail: 'fail',
      ready: false,
      passCount: 0,
      requiredTotal: 4,
      requiredAll: overlayPacketOnFileChecks([], {
        loadNumber: '91111978568',
        amount: 390,
        brokerName: 'Traffix',
        carrierName: 'Credyx AR Solutions',
      }, {
        loadNumber: 'T01633053',
        amount: 1300,
        brokerName: 'Traffix',
        carrierName: 'A&M Transport LLC',
      }),
      requiredFailed: [],
      requiredPassed: [],
      additional: [],
      issues: [],
      warnings: [],
      paperwork: {
        loadNumber: 'T01633053',
        amount: 1300,
        brokerName: 'Traffix',
        carrierName: 'A&M Transport LLC',
      },
    }
    expect(snapshotHasResolvablePacketIssues(snapshot)).toBe(true)
    const next = snapshotAfterPacketResolve(snapshot, {
      loadNumber: 'T01633053',
      amount: 1300,
      brokerName: 'Traffix',
      carrierName: 'Credyx AR Solutions',
    })
    expect(next.requiredAll.find((c) => c.id === 'req_load')?.status).toBe('ok')
    expect(next.requiredAll.find((c) => c.id === 'req_amount')?.status).toBe('ok')
    // Carrier on file still differs from paperwork — stays failed.
    expect(next.requiredAll.find((c) => c.id === 'req_carrier')?.status).toBe('issue')
  })
})
