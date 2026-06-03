import DocumentFieldTrainingSection from '../../client/DocumentFieldTrainingSection'
import { DocumentReviewResult } from '../../../types/documentReview'

interface CorrectAiPaneProps {
  doc: DocumentReviewResult
  onDocChange: (updated: DocumentReviewResult) => void
}

/** Full-height Correct AI — document + fields split, fits viewport. */
export default function CorrectAiPane({ doc, onDocChange }: CorrectAiPaneProps) {
  return (
    <div className="engine-correct-panel">
      <div className="engine-correct-hint">
        Field → draw box → fix value · Zoom −/+ or Ctrl+scroll · Save training
      </div>
      <div className="engine-correct-body">
        <DocumentFieldTrainingSection
          documentId={doc.documentId}
          fileName={doc.fileName}
          aiResult={doc}
          onAiResultChange={onDocChange}
          variant="dark"
          engineLayout
        />
      </div>
    </div>
  )
}
