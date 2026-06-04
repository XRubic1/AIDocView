import { useState } from 'react'
import { Eye, FolderDown, Receipt } from 'lucide-react'
import type { DocSortFingerprint, DocSortLoadGroup, DocSortResult } from '../types'
import { buildInvoiceDraftFromGroup } from '../services/docSortInvoice'
import { downloadFullBinderZip, downloadLoadBinderPdf } from '../services/docSortBinder'
import type { GeneratedInvoiceRef } from '../services/docSortBinderMerge'
import { formatExtractedRate, primaryRateCon } from '../utils/formatRate'
import DocSortAiDisclaimer from './DocSortAiDisclaimer'
import DocSortInvoiceModal from './DocSortInvoiceModal'
import type { InvoicePDFInput } from '../../../utils/generateInvoicePDF'

interface DocSortResultsProps {
  result: DocSortResult
  fileById: Map<string, File>
  selectedDocId: string | null
  onViewDoc: (doc: DocSortFingerprint) => void
}

function docMeta(doc: DocSortFingerprint): string {
  const loads = doc.loadNumbers.length > 0 ? doc.loadNumbers.join(' · ') : '—'
  const lane = [doc.pickup, doc.delivery].filter(Boolean).join(' → ')
  const rate = formatExtractedRate(doc)
  const ratePart = rate ? ` · AI rate ${rate} (verify)` : ''
  return `Load ${loads}${lane ? ` · ${lane}` : ''}${doc.broker ? ` · ${doc.broker}` : ''}${ratePart}`
}

function DocRow({
  doc,
  active,
  onView,
}: {
  doc: DocSortFingerprint
  active: boolean
  onView: () => void
}) {
  const kindLabel =
    doc.kind === 'rate_confirmation' ? 'Rate con' : doc.kind === 'bill_of_lading' ? 'BOL' : 'Other'

  return (
    <div className={`doc-sort-doc${active ? ' active' : ''}`}>
      <div className="doc-sort-doc-main">
        <span className={`doc-sort-kind ${doc.kind}`}>{kindLabel}</span>
        <div className="doc-sort-doc-name" title={`${doc.fileName} — ${docMeta(doc)}`}>
          {doc.fileName}
        </div>
        <div className="doc-sort-doc-detail">{docMeta(doc)}</div>
      </div>
      <button type="button" className="doc-sort-btn-ghost doc-sort-btn-view" onClick={onView}>
        <Eye className="w-3.5 h-3.5" />
        View
      </button>
    </div>
  )
}

function LoadGroupCard({
  group,
  selectedDocId,
  onViewDoc,
  onInvoice,
  onBinder,
  busy,
  invoiceNumber,
}: {
  group: DocSortLoadGroup
  selectedDocId: string | null
  onViewDoc: (doc: DocSortFingerprint) => void
  onInvoice: () => void
  onBinder: () => void
  busy: boolean
  invoiceNumber?: string
}) {
  const rateLabel = formatExtractedRate(primaryRateCon(group))

  return (
    <article className="doc-sort-group">
      <div className="doc-sort-group-head">
        <div>
          <div className="doc-sort-group-load">Load {group.label}</div>
          <div className="doc-sort-group-meta">
            {group.rateCons.length} rate con · {group.bols.length} BOL · {group.matchReason}
            {rateLabel && (
              <>
                {' '}
                · <span className="doc-sort-ai-rate">AI rate {rateLabel} — verify</span>
              </>
            )}
            {invoiceNumber && (
              <>
                {' '}
                · Invoice {invoiceNumber}
              </>
            )}
          </div>
        </div>
        <div className="doc-sort-group-actions">
          <button type="button" className="doc-sort-btn-ghost" disabled={busy} onClick={onInvoice}>
            <Receipt className="w-3.5 h-3.5" />
            Invoice
          </button>
          <button type="button" className="doc-sort-btn-secondary" disabled={busy} onClick={onBinder}>
            <FolderDown className="w-3.5 h-3.5" />
            Binder
          </button>
        </div>
      </div>
      <div className="doc-sort-group-body">
        <div className="doc-sort-col">
          <div className="doc-sort-col-head">Rate confirmation</div>
          {group.rateCons.map((doc) => (
            <DocRow
              key={doc.docId}
              doc={doc}
              active={selectedDocId === doc.docId}
              onView={() => onViewDoc(doc)}
            />
          ))}
        </div>
        <div className="doc-sort-col">
          <div className="doc-sort-col-head">Bill of lading</div>
          {group.bols.length === 0 ? (
            <p className="doc-sort-empty-col">No BOL matched to this load</p>
          ) : (
            group.bols.map((doc) => (
              <DocRow
                key={doc.docId}
                doc={doc}
                active={selectedDocId === doc.docId}
                onView={() => onViewDoc(doc)}
              />
            ))
          )}
        </div>
      </div>
    </article>
  )
}

/** Sorted loads with view, invoice, and binder actions. */
export default function DocSortResults({
  result,
  fileById,
  selectedDocId,
  onViewDoc,
}: DocSortResultsProps) {
  const [busy, setBusy] = useState(false)
  const [invoiceGroup, setInvoiceGroup] = useState<DocSortLoadGroup | null>(null)
  const [invoiceDraft, setInvoiceDraft] = useState<InvoicePDFInput | null>(null)
  const [lastInvoiceByGroup, setLastInvoiceByGroup] = useState<Map<string, GeneratedInvoiceRef>>(new Map())

  const matchedBols = result.groups.reduce((n, g) => n + g.bols.length, 0)

  const openInvoice = (group: DocSortLoadGroup) => {
    setInvoiceDraft(buildInvoiceDraftFromGroup(group))
    setInvoiceGroup(group)
  }

  const handleBinder = async (group: DocSortLoadGroup) => {
    setBusy(true)
    try {
      const invoice = lastInvoiceByGroup.get(group.groupId)
      await downloadLoadBinderPdf(group, fileById, invoice)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Binder download failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleFullBinder = async () => {
    setBusy(true)
    try {
      await downloadFullBinderZip(result, fileById, lastInvoiceByGroup)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Binder download failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="doc-sort-results" aria-label="Sort results">
        <div className="doc-sort-results-toolbar">
          <div>
            <h2>Sorted loads</h2>
            <div className="doc-sort-stats">
              {result.groups.length} load{result.groups.length === 1 ? '' : 's'} · {matchedBols} BOL
              {matchedBols === 1 ? '' : 's'} · {result.totalDocuments} files · Binder PDF uses load # or invoice #
            </div>
          </div>
          <button
            type="button"
            className="doc-sort-btn-primary"
            disabled={busy || result.totalDocuments === 0}
            onClick={handleFullBinder}
          >
            <FolderDown className="w-4 h-4" />
            All binders (ZIP)
          </button>
        </div>

        <DocSortAiDisclaimer variant="compact" />

        <div className="doc-sort-results-scroll">
          {result.groups.map((group) => (
            <LoadGroupCard
              key={group.groupId}
              group={group}
              selectedDocId={selectedDocId}
              onViewDoc={onViewDoc}
              onInvoice={() => openInvoice(group)}
              onBinder={() => handleBinder(group)}
              busy={busy}
              invoiceNumber={lastInvoiceByGroup.get(group.groupId)?.invoiceNumber}
            />
          ))}

          {(result.unmatchedRateCons.length > 0 ||
            result.unmatchedBols.length > 0 ||
            result.otherDocuments.length > 0) && (
            <div className="doc-sort-unmatched">
              {result.unmatchedRateCons.length > 0 && (
                <div className="doc-sort-unmatched-col">
                  <h3>Unmatched RC</h3>
                  <div className="doc-sort-unmatched-scroll">
                    {result.unmatchedRateCons.map((doc) => (
                      <DocRow
                        key={doc.docId}
                        doc={doc}
                        active={selectedDocId === doc.docId}
                        onView={() => onViewDoc(doc)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {result.unmatchedBols.length > 0 && (
                <div className="doc-sort-unmatched-col">
                  <h3>Unmatched BOL</h3>
                  <div className="doc-sort-unmatched-scroll">
                    {result.unmatchedBols.map((doc) => (
                      <DocRow
                        key={doc.docId}
                        doc={doc}
                        active={selectedDocId === doc.docId}
                        onView={() => onViewDoc(doc)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {result.otherDocuments.length > 0 && (
                <div className="doc-sort-unmatched-col">
                  <h3>Other</h3>
                  <div className="doc-sort-unmatched-scroll">
                    {result.otherDocuments.map((doc) => (
                      <DocRow
                        key={doc.docId}
                        doc={doc}
                        active={selectedDocId === doc.docId}
                        onView={() => onViewDoc(doc)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {invoiceGroup && invoiceDraft && (
        <DocSortInvoiceModal
          loadLabel={invoiceGroup.label}
          group={invoiceGroup}
          draft={invoiceDraft}
          onClose={() => {
            setInvoiceGroup(null)
            setInvoiceDraft(null)
          }}
          onGenerated={(file, invoiceNumber) => {
            setLastInvoiceByGroup((prev) =>
              new Map(prev).set(invoiceGroup.groupId, { file, invoiceNumber })
            )
          }}
        />
      )}
    </>
  )
}
