import { describe, expect, it } from 'vitest'
import type { BatchDocumentReviewResult, DocumentReviewResult } from '../types/documentReview'
import { buildStructuredLoadReview } from './loadReviewSummary'

function doc(
  partial: Partial<DocumentReviewResult> & {
    documentId: string
    fileName: string
    extraction: DocumentReviewResult['extraction']
  }
): DocumentReviewResult {
  return {
    modelUsed: 'test',
    upgradedFromMini: false,
    ...partial,
  }
}

describe('buildStructuredLoadReview packet BOL', () => {
  it('counts a sibling BOL attachment when the rate con PDF has none', () => {
    const rateCon = doc({
      documentId: 'rc-1',
      fileName: 'RateConf_2004515639.pdf',
      extraction: {
        documentType: 'rate_confirmation',
        rateConParse: {
          load_number: '2004515639',
          broker_name: 'Werner Logistics',
          carrier_name: 'MISHKA TRANS COMPANY LLC',
          rate_total: 2312.67,
          destinations: [{ city: 'Casa Grande', state: 'AZ' }],
        },
        rateConFields: {
          rate: { value: 2312.67, confidence: 1 },
          drop: { value: 'Casa Grande, AZ', confidence: 1 },
        },
      },
    })
    const bol = doc({
      documentId: 'bol-1',
      fileName: '055d4834-bol.jpg',
      extraction: {
        documentType: 'bill_of_lading',
        bolAudit: {
          ship_to: 'Casa Grande, AZ',
          ship_from: 'Dallas, TX',
          destination_match: 'PASS',
          signatures: { receiver: 'PRESENT', driver: 'PRESENT', shipper: 'PRESENT' },
        },
      },
    })

    const batch: BatchDocumentReviewResult = {
      documents: [rateCon, bol],
      overallStatus: 'NEEDS_REVIEW',
      crossValidation: {
        overall: 'NEEDS_REVIEW',
        load_number: { status: 'MATCH', details: 'ok' },
        broker: { status: 'MATCH', details: 'ok' },
        amount: { status: 'MATCH', details: 'ok' },
        carrier: { status: 'MATCH', details: 'ok' },
        multi_stop_coverage: { status: 'COMPLETE', details: 'ok' },
        flags: [],
      },
      multiInvoice: {
        invoiceCount: 0,
        verifications: [],
        overall: 'NONE',
        flags: [],
        multiLoadUpload: false,
        distinctLoadNumbers: ['2004515639'],
        primaryAcceptedCount: 0,
        primaryLoadIncomplete: false,
      },
    }

    const structured = buildStructuredLoadReview(rateCon, batch, {
      packet: {
        loadNumber: '2004515639',
        amount: 2312.67,
        brokerName: 'Werner Logistics',
        carrierName: 'MISHKA TRANS COMPANY LLC',
      },
    })

    const bolCheck = structured.requiredAll.find((c) => c.id === 'req_bol')
    expect(bolCheck?.status).not.toBe('missing')
    expect(bolCheck?.documentValue).toMatch(/Present/i)
    expect(bolCheck?.summary).not.toMatch(/not found in this PDF/i)
  })
})
