import { describe, expect, it, beforeEach } from 'vitest'
import { hydrateClientDocuments, clearClientDocuments } from '../data/mockClientDocuments'
import type { ClientDocument } from '../types/clientDocument'
import {
  assertClientSetupComplete,
  ClientSetupIncompleteError,
  getSetupChecklist,
  isClientSetupComplete,
} from './clientSetupDocuments'

function makeDoc(partial: Partial<ClientDocument> & Pick<ClientDocument, 'document_type'>): ClientDocument {
  return {
    id: partial.id ?? `doc-${partial.document_type}`,
    client_id: partial.client_id ?? 'client-1',
    name: partial.name ?? partial.document_type,
    file_name: partial.file_name ?? `${partial.document_type}.pdf`,
    category: partial.category ?? 'compliance',
    document_type: partial.document_type,
    size: 100,
    mime_type: 'application/pdf',
    uploaded_at: partial.uploaded_at ?? new Date().toISOString(),
    uploaded_by: 'Test',
    approval_status: partial.approval_status ?? 'approved',
    uploaded_by_role: partial.uploaded_by_role ?? 'admin',
  }
}

describe('clientSetupDocuments', () => {
  beforeEach(() => {
    clearClientDocuments()
  })

  it('requires compliance + bank proof for non-factoring clients', () => {
    hydrateClientDocuments([
      makeDoc({ document_type: 'w9' }),
      makeDoc({ document_type: 'coi' }),
      makeDoc({ document_type: 'mc_authority' }),
      makeDoc({ document_type: 'dot_registration' }),
      makeDoc({ document_type: 'voided_check', category: 'broker' }),
    ])

    expect(isClientSetupComplete('client-1', { factoring: false })).toBe(true)
    expect(getSetupChecklist('client-1', { factoring: false })).toHaveLength(5)
  })

  it('requires NOA when factoring is enabled', () => {
    const base = [
      makeDoc({ document_type: 'w9' }),
      makeDoc({ document_type: 'coi' }),
      makeDoc({ document_type: 'mc_authority' }),
      makeDoc({ document_type: 'dot_registration' }),
      makeDoc({ document_type: 'bank_letter', category: 'broker' }),
    ]
    hydrateClientDocuments(base)
    expect(isClientSetupComplete('client-1', { factoring: true })).toBe(false)

    hydrateClientDocuments([
      ...base,
      makeDoc({ document_type: 'noa', category: 'broker' }),
    ])
    expect(isClientSetupComplete('client-1', { factoring: true })).toBe(true)
  })

  it('does not count pending or rejected docs as complete', () => {
    hydrateClientDocuments([
      makeDoc({ document_type: 'w9', approval_status: 'pending', uploaded_by_role: 'client' }),
      makeDoc({ document_type: 'coi' }),
      makeDoc({ document_type: 'mc_authority' }),
      makeDoc({ document_type: 'dot_registration' }),
      makeDoc({ document_type: 'voided_check', category: 'broker' }),
    ])

    expect(isClientSetupComplete('client-1', {})).toBe(false)
    expect(() => assertClientSetupComplete('client-1', {})).toThrow(ClientSetupIncompleteError)
  })

  it('accepts either voided check or bank letter', () => {
    hydrateClientDocuments([
      makeDoc({ document_type: 'w9' }),
      makeDoc({ document_type: 'coi' }),
      makeDoc({ document_type: 'mc_authority' }),
      makeDoc({ document_type: 'dot_registration' }),
      makeDoc({ document_type: 'bank_letter', category: 'broker' }),
    ])
    expect(isClientSetupComplete('client-1', {})).toBe(true)
  })

  it('bypasses vault gate for demo carriers by name', () => {
    clearClientDocuments()
    expect(
      isClientSetupComplete('client-1783356171061', {
        id: 'client-1783356171061',
        name: 'Demo Carrier LLC',
        factoring: false,
      })
    ).toBe(true)
    expect(() =>
      assertClientSetupComplete('client-1783356171061', {
        id: 'client-1783356171061',
        name: 'Demo Carrier LLC',
      })
    ).not.toThrow()
  })
})
