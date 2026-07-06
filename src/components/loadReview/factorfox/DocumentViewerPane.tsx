import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, EyeOff, FileText } from 'lucide-react'
import { DocumentReviewResult } from '../../../types/documentReview'
import { getAiReviewRegionsForPage } from '../../../utils/aiReviewRegions'
import { ff } from './factorFoxTheme'
import ReviewImageOverlays from './ReviewImageOverlays'

interface DocumentViewerPaneProps {
  doc: DocumentReviewResult | null
  file?: File | null
  className?: string
  /** Show dashed AI source-region boxes when the model returned them. */
  showAiHighlights?: boolean
}

/** Inline document preview — pages or PDF embed, with optional AI region overlays. */
export default function DocumentViewerPane({
  doc,
  file,
  className = '',
  showAiHighlights: showAiHighlightsProp,
}: DocumentViewerPaneProps) {
  const pages = useMemo(() => {
    if (!doc) return []
    const imgs = doc.debugLog.images ?? [doc.debugLog.image]
    return imgs.filter((img) => img.previewDataUrl)
  }, [doc])

  const [pageIndex, setPageIndex] = useState(0)
  const [highlightsEnabled, setHighlightsEnabled] = useState(true)

  const pdfUrl = useMemo(() => {
    if (!file || file.type !== 'application/pdf') return null
    return URL.createObjectURL(file)
  }, [file])

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    }
  }, [pdfUrl])

  useEffect(() => {
    setPageIndex(0)
  }, [doc?.documentId])

  const current = pages[pageIndex]
  const pageRegions = useMemo(
    () => (doc && current ? getAiReviewRegionsForPage(doc, current.pageNumber) : []),
    [doc, current]
  )
  const hasAiRegions = useMemo(() => {
    if (!doc) return false
    return pages.some((page) => getAiReviewRegionsForPage(doc, page.pageNumber).length > 0)
  }, [doc, pages])

  const showHighlights =
    (showAiHighlightsProp ?? highlightsEnabled) && hasAiRegions && pageRegions.length > 0

  if (!doc) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full min-h-[200px] rounded-xl border border-dashed ${className}`}
        style={{ borderColor: ff.borderLight, backgroundColor: ff.bg2 }}
      >
        <FileText className="w-10 h-10 mb-2" style={{ color: ff.textSubtle }} />
        <p className="text-sm" style={{ color: ff.textMuted }}>
          No document selected
        </p>
      </div>
    )
  }

  const usePdfEmbed = pages.length === 0 && pdfUrl

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {(pages.length > 1 || hasAiRegions) && (
        <div
          className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b"
          style={{ borderColor: ff.border, backgroundColor: ff.bg3 }}
        >
          {pages.length > 1 ? (
            <span className="text-xs font-medium" style={{ color: ff.textMuted, fontFamily: ff.fontMono }}>
              Page {pageIndex + 1} of {pages.length}
            </span>
          ) : (
            <span className="text-xs" style={{ color: ff.textMuted, fontFamily: ff.fontMono }}>
              Document preview
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {hasAiRegions && showAiHighlightsProp !== false && (
              <button
                type="button"
                onClick={() => setHighlightsEnabled((enabled) => !enabled)}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider border transition-opacity hover:opacity-90"
                style={{
                  fontFamily: ff.fontMono,
                  color: showHighlights ? ff.accent : ff.textMuted,
                  borderColor: showHighlights ? ff.accentBorder : ff.border,
                  backgroundColor: showHighlights ? ff.accentDim : 'transparent',
                }}
                title="Toggle AI source-region highlights"
              >
                {showHighlights ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                AI highlights
                {pageRegions.length > 0 ? ` (${pageRegions.length})` : ''}
              </button>
            )}

            {pages.length > 1 && (
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((i) => i - 1)}
                  className="p-1.5 rounded engine-hover-surface disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" style={{ color: ff.text }} />
                </button>
                <button
                  type="button"
                  disabled={pageIndex >= pages.length - 1}
                  onClick={() => setPageIndex((i) => i + 1)}
                  className="p-1.5 rounded engine-hover-surface disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" style={{ color: ff.text }} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className="flex-1 min-h-0 flex items-center justify-center p-3 relative overflow-auto"
        style={{ backgroundColor: ff.canvasBg }}
      >
        {usePdfEmbed ? (
          <iframe
            title={doc.fileName}
            src={pdfUrl}
            className="w-full h-full min-h-[320px] rounded-lg border"
            style={{ borderColor: ff.border, backgroundColor: '#fff' }}
          />
        ) : current ? (
          <div className="relative inline-block max-w-full max-h-full">
            <img
              src={current.previewDataUrl}
              alt={`Page ${current.pageNumber}`}
              className="block max-w-full max-h-[min(72vh,720px)] w-auto h-auto rounded-lg"
            />
            {showHighlights ? <ReviewImageOverlays regions={pageRegions} /> : null}
          </div>
        ) : (
          <p className="text-sm" style={{ color: ff.textMuted }}>
            No preview available
          </p>
        )}
      </div>

      {hasAiRegions && showHighlights && pageRegions.length > 0 && (
        <div
          className="flex-shrink-0 px-3 py-2 border-t text-[10px]"
          style={{ borderColor: ff.border, backgroundColor: ff.bg2, color: ff.textMuted, fontFamily: ff.fontMono }}
        >
          <span style={{ color: ff.accent }}>Lime</span> = rate con field ·{' '}
          <span style={{ color: ff.green }}>Green</span> = BOL signature area
        </div>
      )}

      {pages.length > 1 && (
        <div
          className="flex-shrink-0 flex gap-2 px-3 py-2 overflow-x-auto border-t"
          style={{ borderColor: ff.border, backgroundColor: ff.bg2 }}
        >
          {pages.map((img, i) => {
            const regionCount = getAiReviewRegionsForPage(doc, img.pageNumber).length
            return (
              <button
                key={img.pageNumber}
                type="button"
                onClick={() => setPageIndex(i)}
                className="flex-shrink-0 rounded overflow-hidden border-2 transition-all relative"
                style={{
                  borderColor: i === pageIndex ? ff.accent : 'transparent',
                  opacity: i === pageIndex ? 1 : 0.6,
                }}
              >
                <img src={img.previewDataUrl} alt={`Page ${img.pageNumber}`} className="h-12 w-auto object-cover" />
                {regionCount > 0 && (
                  <span
                    className="absolute bottom-0.5 right-0.5 text-[8px] font-bold px-1 rounded"
                    style={{ backgroundColor: ff.accent, color: ff.onPrimary }}
                  >
                    {regionCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
