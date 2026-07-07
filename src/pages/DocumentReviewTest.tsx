import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  FileText,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import DocumentReviewDebugPanel from '../components/client/DocumentReviewDebugPanel'
import AnalysisProgressMessage from '../components/client/AnalysisProgressMessage'
import PageClassificationPanel from '../components/client/PageClassificationPanel'
import DocumentFieldTrainingSection from '../components/client/DocumentFieldTrainingSection'
import SavedTrainingLibrary from '../components/client/SavedTrainingLibrary'
import { isAIReviewEnabled, reviewDocumentFile } from '../services/documentReviewService'
import { useReviewTimeEstimate } from '../utils/estimateReviewTime'
import { DocumentReviewResult } from '../types/documentReview'
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_COLORS,
  DocumentCategory,
  getCategoryLabel,
} from '../utils/documentCategories'
import { useToast } from '../components/ui/ToastProvider'

interface TestDocument {
  id: string
  file: File
  name: string
  size: number
  status: 'pending' | 'reviewing' | 'done' | 'error'
  aiResult?: DocumentReviewResult
  userCategory?: DocumentCategory
  error?: string
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`
}

function CategoryBadge({ category }: { category: DocumentCategory }) {
  const colors = DOCUMENT_CATEGORY_COLORS[category]
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {getCategoryLabel(category)}
    </span>
  )
}

export default function DocumentReviewTest() {
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [documents, setDocuments] = useState<TestDocument[]>([])
  const [isClassifying, setIsClassifying] = useState(false)
  const [trainingLibraryKey, setTrainingLibraryKey] = useState(0)

  const classifyDocument = useCallback(async (doc: TestDocument) => {
    setDocuments((prev) =>
      prev.map((item) =>
        item.id === doc.id ? { ...item, status: 'reviewing', error: undefined } : item
      )
    )

    try {
      const result = await reviewDocumentFile(doc.file, doc.id)
      setDocuments((prev) =>
        prev.map((item) =>
          item.id === doc.id
            ? {
                ...item,
                status: 'done',
                aiResult: result,
                userCategory: result.extraction.documentType,
              }
            : item
        )
      )
    } catch (error) {
      setDocuments((prev) =>
        prev.map((item) =>
          item.id === doc.id
            ? {
                ...item,
                status: 'error',
                error: error instanceof Error ? error.message : 'Classification failed',
              }
            : item
        )
      )
    }
  }, [])

  const classifyAll = useCallback(
    async (docs: TestDocument[]) => {
      if (!isAIReviewEnabled()) {
        showToast('Add VITE_OPENAI_API_KEY to your .env file first.', 'error')
        return
      }

      setIsClassifying(true)
      for (const doc of docs) {
        await classifyDocument(doc)
      }
      setIsClassifying(false)
    },
    [classifyDocument]
  )

  const addFiles = async (files: FileList | File[]) => {
    const newDocs: TestDocument[] = Array.from(files).map((file) => ({
      id: `test-${Date.now()}-${Math.random()}`,
      file,
      name: file.name,
      size: file.size,
      status: 'pending',
    }))

    setDocuments((prev) => [...prev, ...newDocs])

    if (isAIReviewEnabled()) {
      setIsClassifying(true)
      for (const doc of newDocs) {
        await classifyDocument(doc)
      }
      setIsClassifying(false)
    }
  }

  const handleUserCategoryChange = (docId: string, category: DocumentCategory) => {
    setDocuments((prev) =>
      prev.map((item) => (item.id === docId ? { ...item, userCategory: category } : item))
    )
  }

  const removeDocument = (docId: string) => {
    setDocuments((prev) => prev.filter((item) => item.id !== docId))
  }

  const clearAll = () => setDocuments([])

  const updateDocumentResult = (docId: string, aiResult: DocumentReviewResult) => {
    setDocuments((prev) =>
      prev.map((item) => (item.id === docId ? { ...item, aiResult } : item))
    )
  }

  const doneCount = documents.filter((doc) => doc.status === 'done').length
  const matchCount = documents.filter(
    (doc) =>
      doc.status === 'done' &&
      doc.aiResult &&
      doc.userCategory === doc.aiResult.extraction.documentType
  ).length

  const reviewingFiles = documents
    .filter((doc) => doc.status === 'reviewing')
    .map((doc) => doc.file)
  const batchReviewEstimate = useReviewTimeEstimate(
    isClassifying ? documents.map((doc) => doc.file) : reviewingFiles
  )

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f8f9fa' }}>
      <header
        className="border-b px-6 py-4 flex items-center justify-between"
        style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}
      >
        <div className="flex items-center gap-3">
          <Link
            to="/admin/dashboard"
            className="p-2 rounded transition-colors hover:bg-gray-100"
            style={{ color: '#819291' }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2" style={{ color: '#113543' }}>
              <Sparkles className="w-5 h-5" style={{ color: '#C2A558' }} />
              AI Document Classifier — Test Lab
            </h1>
            <p className="text-xs mt-0.5" style={{ color: '#819291' }}>
              Upload multi-page packets — AI maps each page (invoice skipped, blank marked), extracts rate con fields, and asks when uncertain
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => classifyAll(documents.filter((d) => d.status !== 'reviewing'))}
            disabled={documents.length === 0 || isClassifying || !isAIReviewEnabled()}
            className="px-3 py-1.5 text-xs font-medium text-white rounded disabled:opacity-50"
            style={{ backgroundColor: '#113543' }}
          >
            {isClassifying
              ? batchReviewEstimate
                ? `Classifying... (${batchReviewEstimate})`
                : 'Classifying...'
              : 'Re-classify All'}
          </button>
          <button
            onClick={clearAll}
            disabled={documents.length === 0 || isClassifying}
            className="px-3 py-1.5 text-xs font-medium rounded border disabled:opacity-50"
            style={{ borderColor: '#819291', color: '#113543' }}
          >
            Clear All
          </button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-6 space-y-6">
        {!isAIReviewEnabled() && (
          <div
            className="rounded-lg border p-4 flex items-start gap-3"
            style={{ backgroundColor: '#FFF8E1', borderColor: '#C2A558' }}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#C2A558' }} />
            <div className="text-sm" style={{ color: '#113543' }}>
              Add <code className="font-mono text-xs">VITE_OPENAI_API_KEY</code> to your{' '}
              <code className="font-mono text-xs">.env</code> file and restart the dev server.
            </div>
          </div>
        )}

        {doneCount > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-4" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
              <div className="text-xs font-medium" style={{ color: '#819291' }}>Classified</div>
              <div className="text-2xl font-bold" style={{ color: '#113543' }}>{doneCount}</div>
            </div>
            <div className="rounded-lg border p-4" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
              <div className="text-xs font-medium" style={{ color: '#819291' }}>AI matches your label</div>
              <div className="text-2xl font-bold" style={{ color: '#2E7D32' }}>{matchCount}</div>
            </div>
            <div className="rounded-lg border p-4" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
              <div className="text-xs font-medium" style={{ color: '#819291' }}>Corrected by you</div>
              <div className="text-2xl font-bold" style={{ color: '#C2A558' }}>
                {doneCount - matchCount}
              </div>
            </div>
          </div>
        )}

        <SavedTrainingLibrary
          refreshKey={trainingLibraryKey}
          onDeleted={() => setTrainingLibraryKey((key) => key + 1)}
        />

        <div
          className="rounded-lg border-2 border-dashed p-10 text-center transition-colors cursor-pointer"
          style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}
          onDragOver={(e) => {
            e.preventDefault()
            e.currentTarget.style.borderColor = '#C2A558'
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.currentTarget.style.borderColor = '#819291'
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.currentTarget.style.borderColor = '#819291'
            if (e.dataTransfer.files.length > 0) {
              addFiles(e.dataTransfer.files)
            }
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: '#819291' }} />
          <p className="text-sm font-medium" style={{ color: '#113543' }}>
            Drop documents here or click to upload
          </p>
          <p className="text-xs mt-1" style={{ color: '#819291' }}>
            PDF, JPG, PNG — auto-classified on upload
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                addFiles(e.target.files)
                e.target.value = ''
              }
            }}
          />
        </div>

        {documents.length > 0 && (
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}>
            {isClassifying && (
              <div className="px-4 py-3 border-b" style={{ borderColor: '#819291', backgroundColor: '#FFFBF0' }}>
                <AnalysisProgressMessage
                  files={documents.map((doc) => doc.file)}
                  message="Classifying uploaded documents..."
                />
              </div>
            )}
            <div
              className="px-4 py-3 border-b text-xs font-semibold uppercase tracking-wide grid grid-cols-12 gap-2"
              style={{ borderColor: '#819291', color: '#819291', backgroundColor: '#f8f9fa' }}
            >
              <div className="col-span-3">File</div>
              <div className="col-span-2">AI Detected</div>
              <div className="col-span-1">Conf.</div>
              <div className="col-span-2">Model</div>
              <div className="col-span-3">Your Category</div>
              <div className="col-span-1"></div>
            </div>

            <div className="divide-y" style={{ borderColor: '#819291' }}>
              {documents.map((doc) => {
                const aiCategory = doc.aiResult?.extraction.documentType
                const userCat = doc.userCategory ?? aiCategory ?? 'other'
                const isMatch = doc.status === 'done' && aiCategory === userCat

                return (
                  <div
                    key={doc.id}
                    className="px-4 py-3 grid grid-cols-12 gap-2 items-center text-sm"
                  >
                    <div className="col-span-3 flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 flex-shrink-0" style={{ color: '#819291' }} />
                      <div className="min-w-0">
                        <div className="truncate font-medium" style={{ color: '#113543' }}>
                          {doc.name}
                        </div>
                        <div className="text-xs" style={{ color: '#819291' }}>
                          {formatFileSize(doc.size)}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-2">
                      {doc.status === 'reviewing' && (
                        <AnalysisProgressMessage files={[doc.file]} compact />
                      )}
                      {doc.status === 'error' && (
                        <span className="text-xs" style={{ color: '#991B1B' }}>
                          Failed
                        </span>
                      )}
                      {doc.status === 'done' && aiCategory && <CategoryBadge category={aiCategory} />}
                      {doc.status === 'pending' && (
                        <span className="text-xs" style={{ color: '#819291' }}>Pending</span>
                      )}
                    </div>

                    <div className="col-span-1 text-xs font-medium" style={{ color: '#113543' }}>
                      {doc.aiResult
                        ? `${Math.round(doc.aiResult.extraction.confidence * 100)}%`
                        : '—'}
                    </div>

                    <div className="col-span-2 text-xs" style={{ color: '#819291' }}>
                      {doc.aiResult ? (
                        <>
                          {doc.aiResult.modelUsed}
                          {doc.aiResult.upgradedFromMini ? ' ↑' : ''}
                        </>
                      ) : (
                        '—'
                      )}
                    </div>

                    <div className="col-span-3 flex items-center gap-2">
                      <select
                        value={userCat}
                        onChange={(e) =>
                          handleUserCategoryChange(doc.id, e.target.value as DocumentCategory)
                        }
                        disabled={doc.status === 'reviewing'}
                        className="w-full px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-2"
                        style={{ borderColor: '#819291', color: '#113543' }}
                      >
                        {DOCUMENT_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {getCategoryLabel(cat)}
                          </option>
                        ))}
                      </select>
                      {doc.status === 'done' &&
                        (isMatch ? (
                          <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#2E7D32' }} />
                        ) : (
                          <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#C2A558' }} />
                        ))}
                    </div>

                    <div className="col-span-1 flex justify-end">
                      <button
                        onClick={() => removeDocument(doc.id)}
                        className="p-1 rounded hover:bg-red-50"
                        style={{ color: '#819291' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {doc.error && (
                      <div className="col-span-12 text-xs mt-1" style={{ color: '#991B1B' }}>
                        {doc.error}
                      </div>
                    )}

                    {doc.aiResult?.extraction.pageClassifications && (
                      <div className="col-span-12">
                        <PageClassificationPanel pages={doc.aiResult.extraction.pageClassifications} />
                      </div>
                    )}

                    {doc.aiResult && (
                      <div className="col-span-12">
                        <DocumentFieldTrainingSection
                          documentId={doc.id}
                          fileName={doc.name}
                          aiResult={doc.aiResult}
                          onAiResultChange={(result) => updateDocumentResult(doc.id, result)}
                          onTrainingSaved={() => setTrainingLibraryKey((key) => key + 1)}
                        />
                      </div>
                    )}

                    {doc.aiResult && (
                      <div className="col-span-12">
                        <DocumentReviewDebugPanel result={doc.aiResult} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {documents.length === 0 && (
          <p className="text-center text-sm" style={{ color: '#819291' }}>
            No documents yet. Upload a rate con, BOL, POD, or lumper receipt to test classification.
          </p>
        )}
      </main>
    </div>
  )
}
