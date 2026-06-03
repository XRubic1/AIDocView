import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { DocumentReviewResult } from '../../../types/documentReview'
import { ff } from './factorFoxTheme'

interface DocumentViewerModalProps {
  doc: DocumentReviewResult | null
  /** Original upload for PDF iframe fallback. */
  file?: File | null
  onClose: () => void
}

/** Full-screen viewer for reviewed page images or uploaded PDF. */
export default function DocumentViewerModal({ doc, file, onClose }: DocumentViewerModalProps) {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setPageIndex((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setPageIndex((i) => Math.min(pages.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, pages.length])

  if (!doc) return null

  const current = pages[pageIndex]
  const usePdfEmbed = pages.length === 0 && pdfUrl

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ backgroundColor: ff.overlay }}
      role="dialog"
      aria-modal="true"
    >
      <header
        className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.1)' }}
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white truncate">{doc.fileName}</h2>
          {pages.length > 1 && (
            <p className="text-xs text-gray-400">
              Page {pageIndex + 1} of {pages.length}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center min-h-0 p-4 relative">
        {usePdfEmbed ? (
          <iframe
            title={doc.fileName}
            src={pdfUrl}
            className="w-full h-full max-w-5xl rounded-lg bg-white"
          />
        ) : current ? (
          <img
            src={current.previewDataUrl}
            alt={`Page ${current.pageNumber}`}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
        ) : (
          <p className="text-sm text-gray-400">No preview available for this file.</p>
        )}

        {pages.length > 1 && (
          <>
            <button
              type="button"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((i) => i - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              disabled={pageIndex >= pages.length - 1}
              onClick={() => setPageIndex((i) => i + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {pages.length > 1 && (
        <div
          className="flex-shrink-0 flex gap-2 px-4 py-3 overflow-x-auto border-t"
          style={{ borderColor: 'rgba(255,255,255,0.1)' }}
        >
          {pages.map((img, i) => (
            <button
              key={img.pageNumber}
              type="button"
              onClick={() => setPageIndex(i)}
              className="flex-shrink-0 rounded border-2 overflow-hidden transition-all"
              style={{
                borderColor: i === pageIndex ? ff.blue : 'transparent',
                opacity: i === pageIndex ? 1 : 0.65,
              }}
            >
              <img
                src={img.previewDataUrl}
                alt={`Thumb ${img.pageNumber}`}
                className="h-14 w-auto object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
