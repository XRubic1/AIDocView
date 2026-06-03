import { useEffect } from 'react'
import { X } from 'lucide-react'
import DocumentFieldTrainingSection from '../../client/DocumentFieldTrainingSection'
import { DocumentReviewResult } from '../../../types/documentReview'
import { ff } from './factorFoxTheme'

interface TeachAiModalProps {
  doc: DocumentReviewResult | null
  onClose: () => void
  onDocChange: (updated: DocumentReviewResult) => void
}

/** Full-screen modal for correcting fields and saving training data. */
export default function TeachAiModal({ doc, onClose, onDocChange }: TeachAiModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (!doc) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col"
      style={{ backgroundColor: ff.mainBg }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="teach-ai-modal-title"
    >
      <header
        className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b"
        style={{ borderColor: ff.border, backgroundColor: ff.mainBg }}
      >
        <div className="min-w-0">
          <h2 id="teach-ai-modal-title" className="text-lg font-bold" style={{ color: ff.text }}>
            Teach AI
          </h2>
          <p className="text-sm truncate" style={{ color: ff.textMuted }}>
            {doc.fileName} — correct fields, mark regions, save training
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 p-2 rounded-lg engine-hover-surface transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" style={{ color: ff.textMuted }} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-[1600px] mx-auto w-full">
          <DocumentFieldTrainingSection
            documentId={doc.documentId}
            fileName={doc.fileName}
            aiResult={doc}
            onAiResultChange={onDocChange}
          />
        </div>
      </div>
    </div>
  )
}
