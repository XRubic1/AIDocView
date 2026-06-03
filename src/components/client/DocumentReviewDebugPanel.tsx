import { ChevronDown, ChevronUp, Eye } from 'lucide-react'
import { useState } from 'react'
import { AI_REVIEW_CONFIG } from '../../config/aiReview'
import { DocumentReviewDebugLog, DocumentReviewResult } from '../../types/documentReview'
import { DocumentCategory, getCategoryLabel } from '../../utils/documentCategories'
import { ff } from '../loadReview/factorfox/factorFoxTheme'

interface DocumentReviewDebugPanelProps {
  result: DocumentReviewResult
  defaultOpen?: boolean
  variant?: 'light' | 'dark'
}

function formatFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    documentType: 'Document type',
    origin: 'Origin',
    destination: 'Destination',
    shipFrom: 'Ship From',
    shipTo: 'Ship To',
    loadNumber: 'Load number',
    rate: 'Rate',
    hasSignature: 'Signature present',
    hasReceiverSignature: 'Receiver signature',
    receivingDate: 'Receiving date',
    signatureNotes: 'Signature notes',
    confidence: 'Review confidence (adjusted)',
    totalPagesInFile: 'Total pages in file',
    pagesReviewed: 'Pages reviewed',
    isFullyLegible: 'All pages legible',
    pageLegibility: 'Page legibility',
    fieldsFound: 'Fields found',
    notes: 'AI notes',
  }
  return labels[key] ?? key
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (key === 'documentType') return getCategoryLabel(String(value) as DocumentCategory)
  if (key === 'confidence' && typeof value === 'number') return `${Math.round(value * 100)}%`
  if (key === 'hasSignature' || key === 'hasReceiverSignature' || key === 'isFullyLegible') {
    return value ? 'Yes' : 'No'
  }
  if (key === 'pageLegibility' && Array.isArray(value)) {
    return value
      .map((page) => {
        const entry = page as { pageNumber: number; isLegible: boolean; notes?: string }
        return `p${entry.pageNumber}: ${entry.isLegible ? 'legible' : 'poor'}${entry.notes ? ` (${entry.notes})` : ''}`
      })
      .join('; ')
  }
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—'
  return String(value)
}

function ImageScopeNote({ log, dark }: { log: DocumentReviewDebugLog; dark?: boolean }) {
  const { image, images } = log
  const totalPages = image.totalPages
  const reviewedCount = images?.length ?? 1

  if (image.sourceType === 'pdf_page' && totalPages > 1 && reviewedCount < totalPages) {
    const cap = AI_REVIEW_CONFIG.MAX_PDF_PAGES
    return (
      <p className="text-xs rounded p-2 border" style={{ backgroundColor: dark ? ff.amberLight : '#FFF8E1', color: dark ? ff.amber : '#113543', borderColor: dark ? ff.amberBorder : 'transparent' }}>
        PDF has {totalPages} pages. AI reviewed {reviewedCount} page(s)
        {cap > 0 ? ` (limit: ${cap} — set VITE_AI_MAX_PDF_PAGES=0 in .env to review all pages).` : '.'}
      </p>
    )
  }

  if (images && images.length > 1) {
    return (
      <p className="text-xs rounded p-2 border" style={{ backgroundColor: dark ? ff.greenLight : '#E8F5E9', color: dark ? ff.green : '#113543', borderColor: dark ? ff.greenBorder : 'transparent' }}>
        Multi-page review: all {images.length} page(s) were classified and sent to the model where
        applicable (rate con, BOL audit, signatures, legibility).
      </p>
    )
  }

  return null
}

export default function DocumentReviewDebugPanel({
  result,
  defaultOpen = false,
  variant = 'light',
}: DocumentReviewDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const { debugLog, extraction } = result
  const dark = variant === 'dark'
  const border = dark ? ff.border : '#819291'
  const headerBg = dark ? ff.bg3 : '#f8f9fa'
  const bodyBg = dark ? ff.mainBg : '#FFFFFF'
  const textPrimary = dark ? ff.text : '#113543'
  const textMuted = dark ? ff.textMuted : '#819291'
  const accent = dark ? ff.accent : '#C2A558'
  const imageBorder = dark ? ff.borderLight : '#819291'
  const imageBg = dark ? ff.bg2 : '#f8f9fa'
  const attemptHighlight = dark ? ff.accentDim : '#FFFBF0'
  const attemptBg = dark ? ff.bg2 : '#f8f9fa'

  const extractedFields: Array<[string, unknown]> = [
    ['documentType', extraction.documentType],
    ['shipFrom', extraction.shipFrom],
    ['shipTo', extraction.shipTo],
    ['origin', extraction.origin],
    ['destination', extraction.destination],
    ['loadNumber', extraction.loadNumber],
    ['rate', extraction.rate],
    ['hasReceiverSignature', extraction.hasReceiverSignature],
    ['receivingDate', extraction.receivingDate],
    ['hasSignature', extraction.hasSignature],
    ['signatureNotes', extraction.signatureNotes],
    ['totalPagesInFile', extraction.totalPagesInFile],
    ['pagesReviewed', extraction.pagesReviewed],
    ['isFullyLegible', extraction.isFullyLegible],
    ['pageLegibility', extraction.pageLegibility],
    ['confidence', extraction.confidence],
    ['fieldsFound', extraction.fieldsFound],
    ['notes', extraction.notes],
  ]

  return (
    <div className="mt-2 rounded border overflow-hidden" style={{ borderColor: border }}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium transition-colors engine-hover-surface"
        style={{ color: textPrimary, backgroundColor: headerBg, fontFamily: dark ? ff.fontMono : undefined, letterSpacing: dark ? '0.06em' : undefined, textTransform: dark ? 'uppercase' : undefined }}
      >
        <span className="inline-flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5" style={{ color: accent }} />
          What the AI saw
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="p-3 space-y-3" style={{ backgroundColor: bodyBg }}>
          <ImageScopeNote log={debugLog} dark={dark} />

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: textMuted, fontFamily: dark ? ff.fontMono : undefined }}>
                {debugLog.images && debugLog.images.length > 1
                  ? `Images sent to model (${debugLog.images.length} pages)`
                  : 'Image sent to model'}
              </div>
              <div className="space-y-2">
                {(debugLog.images ?? [debugLog.image]).map((image) => (
                  <div key={image.pageNumber}>
                    {debugLog.images && debugLog.images.length > 1 && (
                      <div className="text-xs mb-1 font-medium" style={{ color: textPrimary }}>
                        Page {image.pageNumber} of {image.totalPages}
                      </div>
                    )}
                    <div
                      className="rounded border overflow-hidden"
                      style={{ borderColor: imageBorder, backgroundColor: imageBg }}
                    >
                      <img
                        src={image.previewDataUrl}
                        alt={`Preview page ${image.pageNumber} for ${image.fileName}`}
                        className="w-full max-h-48 object-contain"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 space-y-0.5 text-xs" style={{ color: textMuted }}>
                <div>
                  Source:{' '}
                  {debugLog.image.sourceType === 'pdf_page'
                    ? `PDF — ${debugLog.images?.length ?? 1} of ${debugLog.image.totalPages} page(s) reviewed`
                    : 'Image file'}
                </div>
                <div>
                  File: {debugLog.image.fileName} ({Math.round(debugLog.image.fileSize / 1024)} KB)
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#819291' }}>
                Extracted fields (final)
              </div>
              <dl className="rounded border divide-y text-xs" style={{ borderColor: border }}>
                {extractedFields.map(([key, value]) => (
                  <div key={key} className="grid grid-cols-2 gap-2 px-2 py-1.5">
                    <dt style={{ color: textMuted }}>{formatFieldLabel(key)}</dt>
                    <dd className="font-medium break-words" style={{ color: textPrimary }}>
                      {formatFieldValue(key, value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#819291' }}>
              Model attempts
            </div>
            <div className="space-y-2">
              {debugLog.attempts.map((attempt, index) => (
                <div
                  key={`${attempt.model}-${index}`}
                  className="rounded border p-2 text-xs"
                  style={{
                    borderColor: attempt.usedForResult ? (dark ? ff.accentBorder : '#C2A558') : border,
                    backgroundColor: attempt.usedForResult ? attemptHighlight : attemptBg,
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="font-semibold" style={{ color: textPrimary }}>
                      {attempt.model}
                      {attempt.promptKind ? ` · ${attempt.promptKind.replace(/_/g, ' ')}` : ''}
                      {attempt.usedForResult ? ' · used for result' : ' · discarded (low confidence)'}
                    </span>
                    <span style={{ color: textMuted }}>
                      Confidence: {Math.round(attempt.confidence * 100)}%
                    </span>
                  </div>
                  <pre
                    className="overflow-x-auto rounded p-2 text-[11px] leading-relaxed font-mono"
                    style={{ backgroundColor: '#113543', color: '#E8F0F2' }}
                  >
                    {JSON.stringify(attempt.rawResponse, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px]" style={{ color: textMuted }}>
            {debugLog.promptNote}
          </p>
        </div>
      )}
    </div>
  )
}
