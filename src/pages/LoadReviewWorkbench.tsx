import { useCallback, useRef, useState } from 'react'

import { AlertCircle, Play, Save } from 'lucide-react'

import EngineLayout from '../components/engine/EngineLayout'

import FactorFoxUploadZone from '../components/loadReview/factorfox/FactorFoxUploadZone'

import FactorFoxExcelPanel from '../components/loadReview/factorfox/FactorFoxExcelPanel'

import InvoiceReviewQueue from '../components/loadReview/factorfox/InvoiceReviewQueue'

import EngineBatchHeader from '../components/loadReview/factorfox/EngineBatchHeader'
import { summarizeBatchStatuses } from '../utils/perInvoiceStatus'

import LoadInspector, { InspectorTab } from '../components/loadReview/factorfox/LoadInspector'


import { recomputeBatchReview } from '../utils/recomputeBatchReview'

import { ff } from '../components/loadReview/factorfox/factorFoxTheme'

import { InvoiceReviewJob } from '../types/invoiceReviewJob'

import { isAIReviewEnabled } from '../config/aiReview'

import { reviewUploadedDocuments } from '../services/documentReviewService'


import { BatchDocumentReviewResult, DocumentReviewResult } from '../types/documentReview'

import { LoadSheetRow, ParsedLoadSheet } from '../types/loadSheet'

import { parseLoadSheetFile, isLoadSheetFile } from '../utils/loadSheetParser'

import { saveLoadReview } from '../utils/loadHistoryStore'

import { getReviewPageCount } from '../utils/fileToReviewImage'



const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.tif,.tiff,image/*,application/pdf'



interface UploadedDoc {

  id: string

  file: File

  name: string

  pageCount?: number

}



/** Split-panel workbench: queue on the left, tabbed inspector on the right. */

export default function LoadReviewWorkbench() {

  const docInputRef = useRef<HTMLInputElement>(null)

  const [documents, setDocuments] = useState<UploadedDoc[]>([])

  const [loadSheet, setLoadSheet] = useState<ParsedLoadSheet | null>(null)

  const [selectedRow, setSelectedRow] = useState<LoadSheetRow | null>(null)

  const [excelError, setExcelError] = useState<string | null>(null)

  const [isParsingExcel, setIsParsingExcel] = useState(false)

  const [batchResult, setBatchResult] = useState<BatchDocumentReviewResult | null>(null)

  const [isReviewing, setIsReviewing] = useState(false)

  const [reviewError, setReviewError] = useState<string | null>(null)

  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('summary')

  const [reviewedDocs, setReviewedDocs] = useState<DocumentReviewResult[]>([])

  const [invoiceJobs, setInvoiceJobs] = useState<Record<string, InvoiceReviewJob>>({})

  const completedReviewCount = Object.values(invoiceJobs).filter(

    (j) => j.status === 'complete'

  ).length



  const activeDoc =

    reviewedDocs.find((d) => d.fileName === selectedFileName) ??

    batchResult?.documents.find((d) => d.fileName === selectedFileName) ??

    null



  const activeFile = documents.find((d) => d.name === selectedFileName)?.file ?? null



  const selectLoad = (fileName: string, tab: InspectorTab = 'summary') => {

    setSelectedFileName(fileName)

    setInspectorTab(tab)

    const matched = batchResult?.multiInvoice?.verifications.find(

      (v) => v.unit.fileName === fileName

    )?.excelMatch?.row

    if (matched) setSelectedRow(matched)

  }



  const addDocuments = useCallback(async (files: FileList | File[]) => {

    const docFiles = Array.from(files).filter((file) => !isLoadSheetFile(file))

    if (docFiles.length === 0) return



    const newDocs: UploadedDoc[] = await Promise.all(

      docFiles.map(async (file) => {

        let pageCount = 1

        try {

          pageCount = await getReviewPageCount(file)

        } catch {

          pageCount = 1

        }

        return {

          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,

          file,

          name: file.name,

          pageCount,

        }

      })

    )



    setDocuments((prev) => [...prev, ...newDocs])

    setInvoiceJobs((prev) => {

      const next = { ...prev }

      newDocs.forEach((doc) => {

        next[doc.id] = {

          docId: doc.id,

          fileName: doc.name,

          status: 'queued',

          progress: 0,

          stepLabel: 'Ready — run review',

        }

      })

      return next

    })

    setBatchResult(null)

    setReviewError(null)

    if (newDocs.length === 1 && !selectedFileName) {

      setSelectedFileName(newDocs[0].name)

      setInspectorTab('documents')

    }

  }, [selectedFileName])



  const handleExcelUpload = async (file: File) => {

    setIsParsingExcel(true)

    setExcelError(null)

    try {

      const parsed = await parseLoadSheetFile(file)

      setLoadSheet(parsed)

      setSelectedRow(null)

      setReviewedDocs((docs) => {

        setBatchResult((batch) =>

          batch && docs.length

            ? recomputeBatchReview(docs, batch, undefined, parsed.rows, parsed.fileName)

            : batch

        )

        return docs

      })

    } catch (error) {

      setExcelError(error instanceof Error ? error.message : 'Failed to parse Excel file.')

      setLoadSheet(null)

      setSelectedRow(null)

    } finally {

      setIsParsingExcel(false)

    }

  }



  const runFullLoadReview = async () => {

    if (documents.length === 0) {

      setReviewError('Upload at least one document.')

      return

    }

    if (!isAIReviewEnabled()) {

      setReviewError('Add VITE_OPENAI_API_KEY to your .env file.')

      return

    }

    const tokenCheck = await import('../utils/estimateReviewTokens').then((m) =>
      m.estimateReviewTokensForUploads(
        documents.map((doc) => ({
          file: doc.file,
          pageCount: doc.pageCount,
          fileName: doc.name,
        }))
      )
    )

    if (tokenCheck.maxConcurrentBeforeLimit === 0) {
      setReviewError(tokenCheck.runSummary)
      return
    }



    setIsReviewing(true)

    setReviewError(null)

    setBatchResult(null)

    setSavedMessage(null)



    const initialJobs: Record<string, InvoiceReviewJob> = {}

    documents.forEach((doc) => {

      initialJobs[doc.id] = {

        docId: doc.id,

        fileName: doc.name,

        status: 'queued',

        progress: 0,

        stepLabel: 'Queued',

      }

    })

    setInvoiceJobs(initialJobs)



    try {

      const result = await reviewUploadedDocuments(

        documents.map((doc) => ({ id: doc.id, name: doc.name, file: doc.file })),

        {

          excelRows: loadSheet?.rows,
          excelFileName: loadSheet?.fileName,
          excelDetectedColumns: loadSheet?.detectedColumns,

          excelRow: selectedRow ?? undefined,

          onDocumentProgress: (event) => {

            setInvoiceJobs((prev) => ({

              ...prev,

              [event.docId]: {

                docId: event.docId,

                fileName: event.fileName,

                status:

                  event.status === 'reviewing'

                    ? 'reviewing'

                    : event.status === 'error'

                      ? 'error'

                      : 'complete',

                progress: event.progress,

                stepLabel: event.stepLabel,

                error: event.error,

              },

            }))

            if (event.partialDocuments?.length) {

              setReviewedDocs(event.partialDocuments)

              const partialDocs = event.partialDocuments

              setBatchResult((prev) => ({

                documents: partialDocs,

                issues: prev?.issues ?? [],

                warnings: prev?.warnings ?? [],

                reviewedAt: new Date().toISOString(),

                destinationMatch: prev?.destinationMatch ?? null,

                overallConfidence:

                  partialDocs.reduce((sum, r) => sum + r.extraction.confidence, 0) /

                  partialDocs.length,

                crossValidation: prev?.crossValidation,

                auditSummary: prev?.auditSummary,

                excelMatch: prev?.excelMatch,

                multiInvoice: prev?.multiInvoice,

                multiStopBol: prev?.multiStopBol,

                rateConDestination: prev?.rateConDestination,

                bolShipTo: prev?.bolShipTo,

                bolDestination: prev?.bolDestination,

                reviewCost: prev?.reviewCost,

              }))

            }

          },

        }

      )

      setBatchResult(result)

      setReviewedDocs(result.documents)

      const firstInv = result.multiInvoice?.verifications[0]?.unit.fileName

      const firstFile = firstInv ?? result.documents[0]?.fileName ?? null

      if (firstFile) selectLoad(firstFile, 'summary')

      const autoRow =

        result.multiInvoice?.verifications.find((v) => v.excelMatch)?.excelMatch?.row ??

        result.excelMatch?.row

      if (autoRow) setSelectedRow(autoRow)

    } catch (error) {

      setReviewError(error instanceof Error ? error.message : 'Load review failed.')

    } finally {

      setIsReviewing(false)

    }

  }



  const updateDocResult = (documentId: string, updated: DocumentReviewResult) => {

    setReviewedDocs((prev) => {

      const next = prev.map((doc) => (doc.documentId === documentId ? updated : doc))

      setBatchResult((batch) =>

        batch ? recomputeBatchReview(next, batch, selectedRow ?? undefined, loadSheet?.rows, loadSheet?.fileName) : batch

      )

      return next

    })

  }



  const handleExcelRowSelected = (row: LoadSheetRow) => {

    setSelectedRow(row)

    setReviewedDocs((docs) => {

      setBatchResult((batch) =>

        batch && docs.length

          ? recomputeBatchReview(docs, batch, row, loadSheet?.rows, loadSheet?.fileName)

          : batch

      )

      return docs

    })

  }



  const handleSaveHistory = () => {

    if (!batchResult) return

    saveLoadReview({

      result: batchResult,

      excelMatch: batchResult.excelMatch,

      excelFileName: loadSheet?.fileName,

      fileNames: documents.map((doc) => doc.name),

    })

    setSavedMessage('Saved to history.')

  }



  const clearAll = () => {

    setDocuments([])

    setBatchResult(null)

    setReviewedDocs([])

    setInvoiceJobs({})

    setReviewError(null)

    setSavedMessage(null)

    setSelectedFileName(null)

    setInspectorTab('summary')

  }



  const fileNames = documents.map((d) => d.name)
  const rollup =
    batchResult && fileNames.length > 0 ? summarizeBatchStatuses(batchResult, fileNames) : null
  const pendingCount = rollup?.reviewCount ?? (documents.length > 0 && !batchResult ? documents.length : 0)

  const activePageCount = documents.find((d) => d.name === selectedFileName)?.pageCount

  return (
    <EngineLayout
      fillViewport
      reviewQueueCount={pendingCount > 0 ? pendingCount : undefined}
      breadcrumb={
        <>
          <span>Review Engine</span>
          <span className="sep">/</span>
          <span className="active">Queue</span>
          {pendingCount > 0 && (
            <>
              <span className="sep">·</span>
              <span>
                {pendingCount} pending
              </span>
            </>
          )}
        </>
      }
      headerActions={
        <>
          {batchResult && (
            <button
              type="button"
              onClick={handleSaveHistory}
              className="engine-tbtn engine-tbtn-ghost"
            >
              <Save className="w-3 h-3" />
              Save
            </button>
          )}
          <button
            type="button"
            onClick={clearAll}
            disabled={documents.length === 0 || isReviewing}
            className="engine-tbtn engine-tbtn-ghost"
            style={{ marginLeft: 4 }}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={runFullLoadReview}
            disabled={documents.length === 0 || isReviewing || !isAIReviewEnabled()}
            className={`engine-tbtn engine-tbtn-primary ${isReviewing ? 'running' : ''}`}
            style={{ marginLeft: 8 }}
            id="runBtn"
          >
            <Play className={`w-3 h-3 ${isReviewing ? 'animate-spin' : ''}`} />
            {isReviewing ? 'Running…' : 'Run Review'}
          </button>
        </>
      }
    >

      {!isAIReviewEnabled() && (

        <div

          className="flex-shrink-0 mx-4 mt-3 rounded-xl border p-3 flex gap-3"

          style={{ backgroundColor: ff.amberLight, borderColor: ff.amberBorder }}

        >

          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: ff.amber }} />

          <p className="text-sm" style={{ color: ff.text }}>

            Add <code className="text-xs px-1 rounded" style={{ backgroundColor: ff.bg3, color: ff.accent }}>VITE_OPENAI_API_KEY</code> to{' '}

            <code className="text-xs px-1 rounded" style={{ backgroundColor: ff.bg3, color: ff.accent }}>.env</code> and restart.

          </p>

        </div>

      )}



      <div className="engine-workbench flex-1 min-h-0">

        <aside className="engine-workbench-rail">

          <div className="engine-workbench-rail-scroll">

            <EngineBatchHeader
              result={batchResult}
              isReviewing={isReviewing}
              totalInvoices={documents.length}
              completedInvoices={completedReviewCount}
              fileNames={fileNames}
            />



            {reviewError && (

              <div className="rounded-lg px-3 py-2 text-sm flex gap-2" style={{ backgroundColor: ff.redLight, color: ff.red }}>

                <AlertCircle className="w-4 h-4 flex-shrink-0" />

                {reviewError}

              </div>

            )}



            {savedMessage && (

              <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: ff.greenLight, color: ff.green }}>

                {savedMessage}

              </div>

            )}



            {documents.length > 0 ? (

              <InvoiceReviewQueue

                documents={documents}

                jobs={invoiceJobs}

                batchResult={batchResult}

                selectedFileName={selectedFileName}

                onOpenLoad={(fileName) => selectLoad(fileName, batchResult ? 'summary' : 'documents')}
              />

            ) : (

              !isReviewing && (

                <FactorFoxUploadZone

                  inputRef={docInputRef}

                  accept={DOCUMENT_ACCEPT}

                  onFiles={(files) => void addDocuments(files)}

                />

              )

            )}



            {documents.length > 0 && (

              <FactorFoxUploadZone

                inputRef={docInputRef}

                accept={DOCUMENT_ACCEPT}

                onFiles={(files) => void addDocuments(files)}

                compact

                label="Add PDF"
                compact
              />

            )}



            <FactorFoxExcelPanel

              loadSheet={loadSheet}

              selectedRow={selectedRow}

              onFileSelected={handleExcelUpload}

              onRowSelected={handleExcelRowSelected}

              invoiceMatches={batchResult?.multiInvoice?.verifications.map((v) => ({

                fileName: v.unit.fileName,

                loadNumber: v.excelMatch?.row.loadNumber ?? v.unit.invoice.load_number ?? '—',

                status: v.excelMatch?.overall ?? 'NONE',

              }))}

              onClear={() => {

                setLoadSheet(null)

                setSelectedRow(null)

                setExcelError(null)

              }}

              error={excelError}

              isParsing={isParsingExcel}

            />

          </div>

        </aside>



        <section className="engine-workbench-inspector">

          <LoadInspector
            doc={activeDoc}
            file={activeFile}
            pageCount={activePageCount}
            batchResult={batchResult}

            excelFileName={loadSheet?.fileName}

            tab={inspectorTab}

            onTabChange={setInspectorTab}

            onDocChange={(updated) => updateDocResult(updated.documentId, updated)}

            hasReviewResult={Boolean(
              batchResult &&
                activeDoc &&
                batchResult.documents.some((d) => d.documentId === activeDoc.documentId)
            )}

          />

        </section>

      </div>

    </EngineLayout>

  )

}


