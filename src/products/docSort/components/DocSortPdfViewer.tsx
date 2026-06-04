import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'

interface DocSortPdfViewerProps {
  file: File
  fileName: string
  meta?: string
  onClose: () => void
}

/** Full-height PDF preview for DocSort (no AIDocView review dependency). */
export default function DocSortPdfViewer({ file, fileName, meta, onClose }: DocSortPdfViewerProps) {
  const pdfUrl = useMemo(() => URL.createObjectURL(file), [file])

  useEffect(() => {
    return () => URL.revokeObjectURL(pdfUrl)
  }, [pdfUrl])

  return (
    <aside className="doc-sort-viewer" aria-label="Document preview">
      <div className="doc-sort-viewer-head">
        <div className="min-w-0">
          <div className="doc-sort-viewer-title">{fileName}</div>
          {meta && <div className="doc-sort-viewer-meta">{meta}</div>}
        </div>
        <button type="button" className="doc-sort-icon-btn" onClick={onClose} aria-label="Close preview">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="doc-sort-viewer-body">
        <iframe title={fileName} src={pdfUrl} className="doc-sort-viewer-frame" />
      </div>
    </aside>
  )
}
