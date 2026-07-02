import { describe, expect, it, vi } from 'vitest'
import { BolAudit } from '../types/documentPipeline'
import { DocumentReviewResult } from '../types/documentReview'
import { applyFailClosedApprovalGate } from './failClosedApprovalGate'

function baseBolAudit(overrides: Partial<BolAudit> = {}): BolAudit {
  return {
    destination_match: 'PASS',
    legibility: 'PASS',
    page_count: 'PASS',
    signatures: {
      carrier: 'PRESENT',
      shipper: 'PRESENT',
      receiver: 'PRESENT',
      receiver_date: 'PRESENT',
    },
    overall: 'APPROVED',
    flags: ['Receiver signature visible in consignee box'],
    ...overrides,
  }
}

function makeDocument(overrides: Partial<DocumentReviewResult> = {}): DocumentReviewResult {
  return {
    documentId: 'doc-1',
    fileName: 'packet.pdf',
    modelUsed: 'gpt-test',
    upgradedFromMini: false,
    extraction: {
      documentType: 'bill_of_lading',
      hasSignature: true,
      confidence: 0.9,
      fieldsFound: [],
      pageClassifications: [
        {
          pageNumber: 1,
          pageType: 'bill_of_lading',
          isBlank: false,
          isLegible: true,
          confidence: 0.95,
        },
      ],
        bolAudit: baseBolAudit({
          signatures: {
            carrier: 'PRESENT',
            shipper: 'PRESENT',
            receiver: 'PRESENT',
            receiver_date: 'PRESENT',
            receiver_localization: {
              page: 1,
              x: 0.6,
              y: 0.8,
              w: 0.15,
              h: 0.04,
              description: 'ink signature in consignee box',
              mark_kind: 'ink_signature',
            },
          },
        }),
    },
    debugLog: {
      image: {
        previewDataUrl: '',
        sourceType: 'pdf_page',
        pageNumber: 1,
        totalPages: 1,
        imageWidth: 100,
        imageHeight: 100,
        fileName: 'packet.pdf',
        fileSize: 1,
        mimeType: 'application/pdf',
      },
      attempts: [],
      promptNote: '',
    },
    ...overrides,
  }
}

describe('applyFailClosedApprovalGate', () => {
  it('downgrades APPROVED when a POD page was never audited', () => {
    const doc = makeDocument({
      extraction: {
        documentType: 'proof_of_delivery',
        hasSignature: false,
        confidence: 0.8,
        fieldsFound: [],
        pageClassifications: [
          {
            pageNumber: 2,
            pageType: 'proof_of_delivery',
            isBlank: false,
            isLegible: true,
            confidence: 0.92,
          },
        ],
      },
    })

    const result = applyFailClosedApprovalGate({
      reviewDocuments: [doc],
      proposedOverall: 'APPROVED',
    })

    expect(result.overall).toBe('NEEDS_REVIEW')
    expect(result.invariantFailures.some((msg) => /never audited/i.test(msg))).toBe(true)
    expect(result.invariantFailures.some((msg) => /page 2/i.test(msg))).toBe(true)
  })

  it('downgrades APPROVED when review was truncated by cost cap', () => {
    const doc = makeDocument({ costCapExceeded: true, costCapMessage: 'Spend cap reached.' })

    const result = applyFailClosedApprovalGate({
      reviewDocuments: [doc],
      proposedOverall: 'APPROVED',
    })

    expect(result.overall).toBe('NEEDS_REVIEW')
    expect(result.invariantFailures.some((msg) => /cost cap/i.test(msg))).toBe(true)
  })

  it('downgrades APPROVED when receiver signature is UNCLEAR', () => {
    const doc = makeDocument({
      extraction: {
        documentType: 'bill_of_lading',
        hasSignature: false,
        confidence: 0.8,
        fieldsFound: [],
        pageClassifications: [
          {
            pageNumber: 1,
            pageType: 'bill_of_lading',
            isBlank: false,
            isLegible: true,
            confidence: 0.9,
          },
        ],
        bolAudit: baseBolAudit({
          signatures: {
            carrier: 'PRESENT',
            shipper: 'PRESENT',
            receiver: 'UNCLEAR',
            receiver_date: 'MISSING',
          },
        }),
      },
    })

    const result = applyFailClosedApprovalGate({
      reviewDocuments: [doc],
      proposedOverall: 'APPROVED',
    })

    expect(result.overall).toBe('NEEDS_REVIEW')
    expect(result.invariantFailures.some((msg) => /unclear/i.test(msg))).toBe(true)
  })

  it('rejects PASS_BY_RULE receiver without substitute evidence', () => {
    const doc = makeDocument({
      extraction: {
        documentType: 'bill_of_lading',
        hasSignature: true,
        confidence: 0.8,
        fieldsFound: [],
        pageClassifications: [
          {
            pageNumber: 1,
            pageType: 'bill_of_lading',
            isBlank: false,
            isLegible: true,
            confidence: 0.9,
          },
        ],
        bolAudit: baseBolAudit({
          signatures: {
            carrier: 'PRESENT',
            shipper: 'PRESENT',
            receiver: 'PASS_BY_RULE',
            receiver_date: 'PRESENT',
            rule_applied: 'Walmart load — accept without receiver signature',
          },
          flags: [],
        }),
      },
    })

    const result = applyFailClosedApprovalGate({
      reviewDocuments: [doc],
      proposedOverall: 'APPROVED',
    })

    expect(result.overall).toBe('NEEDS_REVIEW')
    expect(result.invariantFailures.some((msg) => /substitute evidence/i.test(msg))).toBe(true)
  })

  it('passes APPROVED when all invariants are satisfied', () => {
    const doc = makeDocument()

    const result = applyFailClosedApprovalGate({
      reviewDocuments: [doc],
      proposedOverall: 'APPROVED',
    })

    expect(result.overall).toBe('APPROVED')
    expect(result.invariantFailures).toHaveLength(0)
  })

  it('does not upgrade a REJECTED verdict', () => {
    const doc = makeDocument({ costCapExceeded: true })

    const result = applyFailClosedApprovalGate({
      reviewDocuments: [doc],
      proposedOverall: 'REJECTED',
    })

    expect(result.overall).toBe('REJECTED')
    expect(result.invariantFailures).toHaveLength(0)
  })
})

describe('finalizeBolAudit rules fence', () => {
  it('waives receiver date but does not create receiver signature from rules', async () => {
    vi.resetModules()
    vi.doMock('./reviewRulesEngine', () => ({
      shouldMergeBolSignaturesSingleDelivery: () => false,
      shouldPassBolCoreAddressMatch: () => false,
      shouldRelaxReceiverDateSingleDelivery: () => true,
      shouldSanitizeBolPacketPageConfusion: () => true,
      shouldUseBolCarrierSigRelaxation: () => false,
      shouldUseBolZipOnlyRelaxation: () => false,
    }))

    const { finalizeBolAudit } = await import('./bolAuditSanitizer')

    const withDateWaived = finalizeBolAudit(
      baseBolAudit({
        signatures: {
          carrier: 'MISSING',
          shipper: 'MISSING',
          receiver: 'PRESENT',
          receiver_date: 'MISSING',
          receiver_localization: {
            page: 1,
            x: 0.6,
            y: 0.8,
            w: 0.15,
            h: 0.04,
            description: 'ink signature in consignee box',
            mark_kind: 'ink_signature',
          },
        },
        flags: ['Receiver signature visible in consignee signature area'],
      }),
      { destinations: [{ city: 'Dallas', state: 'TX' }] }
    )

    expect(withDateWaived.signatures.receiver).toBe('PRESENT')
    expect(withDateWaived.signatures.receiver_date).toBe('PASS_BY_RULE')
    expect(withDateWaived.signatures.applied_rules?.some((r) => r.field === 'receiver_date')).toBe(
      true
    )

    const blocked = finalizeBolAudit(
      baseBolAudit({
        signatures: {
          carrier: 'MISSING',
          shipper: 'MISSING',
          receiver: 'PASS_BY_RULE',
          receiver_date: 'MISSING',
          rule_applied: 'Accept without signature',
        },
        flags: [],
      }),
      { destinations: [{ city: 'Dallas', state: 'TX' }] }
    )

    expect(blocked.signatures.receiver).toBe('MISSING')
    expect(blocked.flags.some((flag) => /substitute evidence/i.test(flag))).toBe(true)
  })
})
