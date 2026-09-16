import { afterEach, describe, expect, it } from 'vitest'
import { hydrateBrokers } from '../data/mockBrokers'
import {
  findBrokerByEmailDomain,
  findBrokerByName,
  matchBrokerByName,
  rematchPendingDraftBroker,
} from './brokerResolve'
import type { CredyxInvoiceDraft } from '../types/credyxBatch'

afterEach(() => {
  hydrateBrokers([])
})

describe('matchBrokerByName with email domain', () => {
  it('prefers directory debtor that owns the paperwork domain', () => {
    hydrateBrokers([
      {
        id: 'broker-werner',
        name: 'WERNER ENTERPRISES INC',
        emails: [{ email: 'ap@werner.com', category: 'accounting' }],
      },
    ])

    const matched = matchBrokerByName('Werner Logistics', 'werner.com')
    expect(matched.broker_id).toBe('broker-werner')
    expect(matched.broker_name).toBe('WERNER ENTERPRISES INC')
    expect(matched.pending_new).toBeUndefined()
  })

  it('falls back to unique brand token when names differ', () => {
    hydrateBrokers([
      {
        id: 'broker-werner',
        name: 'WERNER ENTERPRISES INC',
        email: 'billing@werner.com',
      },
    ])

    const matched = matchBrokerByName('Werner Logistics')
    expect(matched.broker_id).toBe('broker-werner')
    expect(matched.broker_name).toBe('WERNER ENTERPRISES INC')
  })

  it('stays pending when brand token is ambiguous', () => {
    hydrateBrokers([
      { id: 'a', name: 'WERNER ENTERPRISES INC' },
      { id: 'b', name: 'WERNER BROKERAGE GROUP' },
    ])

    const matched = matchBrokerByName('Werner Logistics')
    expect(matched.broker_id).toBe('')
    expect(matched.pending_new).toBe(true)
  })
})

describe('findBrokerByEmailDomain', () => {
  it('matches normalized domains from broker emails', () => {
    hydrateBrokers([
      {
        id: 'broker-werner',
        name: 'WERNER ENTERPRISES INC',
        emails: [{ email: 'AP@Werner.com', category: 'accounting' }],
      },
    ])
    expect(findBrokerByEmailDomain('WERNER.COM')?.id).toBe('broker-werner')
    expect(findBrokerByName('Werner Logistics')?.id).toBe('broker-werner')
  })
})

describe('rematchPendingDraftBroker', () => {
  it('links pending drafts using fingerprint emailDomain', () => {
    hydrateBrokers([
      {
        id: 'broker-werner',
        name: 'WERNER ENTERPRISES INC',
        emails: [{ email: 'ap@werner.com', category: 'accounting' }],
      },
    ])

    const draft: CredyxInvoiceDraft = {
      draftId: 'd1',
      groupId: 'g1',
      invoice_number: '003',
      load_number: '2004515639',
      broker_name: 'Werner Logistics',
      broker_id: '',
      amount: 2312.67,
      invoice_date: '2026-09-16',
      rate_missing: false,
      confirmed: true,
      document_doc_ids: [],
      fingerprints: {
        rateCons: [
          {
            docId: 'rc1',
            fileName: 'rc.pdf',
            kind: 'rate_confirmation',
            confidence: 0.9,
            loadNumbers: ['2004515639'],
            broker: 'Werner Logistics',
            emailDomain: 'werner.com',
          },
        ],
        bols: [],
      },
    }

    const next = rematchPendingDraftBroker(draft)
    expect(next.broker_id).toBe('broker-werner')
    expect(next.broker_name).toBe('WERNER ENTERPRISES INC')
  })
})
