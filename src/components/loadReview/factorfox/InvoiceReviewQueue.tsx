import { BatchDocumentReviewResult } from '../../../types/documentReview'
import { InvoiceReviewJob } from '../../../types/invoiceReviewJob'
import { getPerInvoiceDisplayStatus } from '../../../utils/perInvoiceStatus'
import InvoiceReviewCard from './InvoiceReviewCard'

export interface InvoiceQueueDocument {
  id: string
  name: string
  pageCount?: number
}

interface InvoiceReviewQueueProps {
  documents: InvoiceQueueDocument[]
  jobs: Record<string, InvoiceReviewJob>
  batchResult: BatchDocumentReviewResult | null
  selectedFileName?: string | null
  onOpenLoad?: (fileName: string) => void
}

/** Center-column load list. */
export default function InvoiceReviewQueue({
  documents,
  jobs,
  batchResult,
  selectedFileName,
  onOpenLoad,
}: InvoiceReviewQueueProps) {
  if (documents.length === 0) return null

  return (
    <div className="engine-center-list">
      {documents.map((doc) => {
        const job = jobs[doc.id]
        const reviewed = batchResult?.documents.find((d) => d.documentId === doc.id)
        const verification = batchResult?.multiInvoice?.verifications.find(
          (v) => v.unit.sourceDocumentId === doc.id || v.unit.fileName === doc.name
        )

        const inv = verification?.unit.invoice
        const displayId = inv?.invoice_number ?? doc.name.replace(/\.pdf$/i, '')
        const broker = inv?.broker_name ?? undefined
        const lastStop = reviewed?.extraction.rateConParse?.destinations?.slice(-1)[0]
        const destination =
          lastStop?.name ?? lastStop?.city ?? reviewed?.extraction.rateConParse?.origin?.city ?? undefined

        const hasResult = Boolean(reviewed)
        const displayStatus =
          hasResult && batchResult ? getPerInvoiceDisplayStatus(doc.name, batchResult) : null

        const badge = job?.status === 'error'
          ? { label: 'Failed', tone: 'rejected' as const }
          : job?.status === 'reviewing'
            ? { label: 'Reviewing', tone: 'reviewing' as const }
            : job?.status === 'queued' || !hasResult
              ? { label: 'Queued', tone: 'pending' as const }
              : displayStatus
                ? { label: displayStatus.label, tone: displayStatus.tone }
                : { label: 'Ready', tone: 'pending' as const }

        return (
          <InvoiceReviewCard
            key={doc.id}
            displayId={displayId}
            broker={broker}
            destination={destination}
            badge={badge}
            job={job}
            reviewedDoc={reviewed}
            selected={selectedFileName === doc.name}
            canOpen={Boolean(onOpenLoad)}
            onOpen={() => onOpenLoad?.(doc.name)}
          />
        )
      })}
    </div>
  )
}
