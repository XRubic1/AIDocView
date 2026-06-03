import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { DocumentReviewResult } from '../../../types/documentReview'
import { ff } from './factorFoxTheme'

interface DocumentViewerPaneProps {
  doc: DocumentReviewResult | null
  file?: File | null
  className?: string
}

/** Inline document preview — pages or PDF embed, no modal. */
export default function DocumentViewerPane({ doc, file, className = '' }: DocumentViewerPaneProps) {
  const pages = useMemo(() => {
    if (!doc) return []
    const imgs = doc.debugLog.images ?? [doc.debugLog.image]
    return imgs.filter((img) => img.previewDataUrl)
  }, [doc])

  const [pageIndex, setPageIndex] = useState(0)

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

  const current = pages[pageIndex]
  const usePdfEmbed = pages.length === 0 && pdfUrl

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {pages.length > 1 && (
        <div
          className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b"
          style={{ borderColor: ff.border, backgroundColor: ff.bg3 }}
        >
          <span className="text-xs font-medium" style={{ color: ff.textMuted, fontFamily: ff.fontMono }}>
            Page {pageIndex + 1} of {pages.length}
          </span>
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
        </div>
      )}

      <div
        className="flex-1 min-h-0 flex items-center justify-center p-3 relative overflow-auto"
        style={{ backgroundColor: ff.canvasBg }}
      >
        {usePdfEmbed ? (
          <iframe title={doc.fileName} src={pdfUrl} className="w-full h-full min-h-[320px] rounded-lg border" style={{ borderColor: ff.border, backgroundColor: '#fff' }} />
        ) : current ? (
          <img
            src={current.previewDataUrl}
            alt={`Page ${current.pageNumber}`}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        ) : (
          <p className="text-sm" style={{ color: ff.textMuted }}>
            No preview available
          </p>
        )}
      </div>

      {pages.length > 1 && (
        <div
          className="flex-shrink-0 flex gap-2 px-3 py-2 overflow-x-auto border-t"
          style={{ borderColor: ff.border, backgroundColor: ff.bg2 }}
        >
          {pages.map((img, i) => (
            <button
              key={img.pageNumber}
              type="button"
              onClick={() => setPageIndex(i)}
              className="flex-shrink-0 rounded overflow-hidden border-2 transition-all"
              style={{
                borderColor: i === pageIndex ? ff.accent : 'transparent',
                opacity: i === pageIndex ? 1 : 0.6,
              }}
            >
              <img src={img.previewDataUrl} alt={`Page ${img.pageNumber}`} className="h-12 w-auto object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
