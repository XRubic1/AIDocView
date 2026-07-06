import { describe, expect, it } from 'vitest'
import { buildAiReasoningLog } from './buildAiReasoningLog'
import { DocumentReviewResult } from '../types/documentReview'

function minimalDoc(overrides: Partial<DocumentReviewResult> = {}): DocumentReviewResult {
  return {
    documentId: 'doc-1',
    fileName: '14503.pdf',
    modelUsed: 'gpt-4.1',
    upgradedFromMini: false,
    extraction: {
      documentType: 'mixed',
      pageClassifications: [
        { pageNumber: 1, pageType: 'invoice', confidence: 0.99, isLegible: true, skipped: false },
        { pageNumber: 2, pageType: 'bill_of_lading', confidence: 0.99, isLegible: true, skipped: false },
      ],
      bolAudit: {
        destination_match: 'PASS',
        legibility: 'PASS',
        page_count: 'PASS',
        signatures: {
          carrier: 'PRESENT',
          shipper: 'PRESENT',
          receiver: 'PRESENT',
          receiver_date: 'PRESENT',
          receiver_authenticity: 'NONE',
          shipper_authenticity: 'NONE',
          carrier_authenticity: 'NONE',
          receiver_localization: {
            page: 2,
            x: 0.1,
            y: 0.8,
            w: 0.2,
            h: 0.05,
            description: 'ink signature in lower left consignee box',
            mark_kind: 'ink_signature',
          },
        },
        overall: 'APPROVED',
        flags: [],
      },
    },
    debugLog: {
      image: {
        previewDataUrl: 'data:image/png;base64,abc',
        sourceType: 'pdf_page',
        pageNumber: 1,
        totalPages: 2,
        imageWidth: 100,
        imageHeight: 100,
        fileName: '14503.pdf',
        fileSize: 1000,
        mimeType: 'application/pdf',
      },
      attempts: [
        {
          model: 'gpt-4.1',
          confidence: 0.99,
          usedForResult: true,
          reviewedAt: '2026-01-01T00:00:00.000Z',
          promptKind: 'page_classify',
          rawResponse: {
            pages: [
              { page_number: 1, doc_type: 'invoice', confidence: 0.99 },
              { page_number: 2, doc_type: 'bill_of_lading', confidence: 0.99 },
            ],
          },
        },
        {
          model: 'gpt-4.1',
          confidence: 0.9,
          usedForResult: true,
          reviewedAt: '2026-01-01T00:00:00.000Z',
          promptKind: 'bol_validator',
          rawResponse: {
            bol_audit: {
              signatures: { receiver: 'PRESENT', receiver_date: 'PRESENT' },
              destination_notes: 'Consignee matches rate con.',
              flags: [],
            },
          },
        },
        {
          model: 'gpt-4.1',
          confidence: 0.85,
          usedForResult: true,
          reviewedAt: '2026-01-01T00:00:00.000Z',
          promptKind: 'bol_signature_crop_verify',
          rawResponse: {
            crop_content: 'handwritten_signature',
            localization: {
              page: 2,
              description: 'ink signature in lower left consignee box',
            },
          },
        },
      ],
      promptNote: 'Test',
    },
    ...overrides,
  }
}

describe('buildAiReasoningLog', () => {
  it('builds readable steps from debug attempts', () => {
    const entries = buildAiReasoningLog(minimalDoc())
    expect(entries.length).toBeGreaterThanOrEqual(3)
    expect(entries[0].step).toMatch(/classification/i)
    expect(entries[0].lookedAt).toMatch(/page/)
    expect(entries.some((entry) => entry.step.includes('BOL audit'))).toBe(true)
    expect(entries.some((entry) => entry.thought.includes('Receiver signature: PRESENT'))).toBe(true)
    expect(entries.some((entry) => entry.thought.includes('ink signature'))).toBe(true)
  })
})
