import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import {
  Upload,
  Search,
  Eye,
  Trash2,
  FileText,
  FolderOpen,
  Plus,
  X,
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Shield,
  Filter,
} from 'lucide-react'
import DocumentViewer from '../components/DocumentViewer'
import ClientSortableHeader from '../components/client/ClientSortableHeader'
import ClientListTd from '../components/client/ClientListTd'
import { useClientSession } from '../hooks/useClientSession'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import {
  addClientDocument,
  getClientDocumentFile,
  getClientDocuments,
  removeClientDocument,
  updateClientDocument,
} from '../services/clientDocumentService'
import { ClientDocument, ClientDocumentCategory } from '../types/clientDocument'
import { formatDate, formatFileSize } from '../utils/format'
import { useClientTheme } from '../theme/ThemeContext'
import {
  getInitialListPageSize,
  PAGE_SIZE_OPTIONS,
  type SortDir,
} from '../utils/clientListPage'

type CategoryFilter = 'all' | ClientDocumentCategory

type DocumentSortField =
  | 'name'
  | 'category'
  | 'file_name'
  | 'size'
  | 'uploaded_at'
  | 'expires_at'
  | 'uploaded_by'

interface PendingUpload {
  id: string
  file: File
}

const CATEGORY_LABELS: Record<ClientDocumentCategory, string> = {
  broker: 'Broker',
  compliance: 'Compliance',
  other: 'Other',
}

function isReminderDueSoon(expiresAt?: string): boolean {
  if (!expiresAt) return false
  const daysUntil = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return daysUntil <= 45 && daysUntil >= 0
}

function isReminderPast(expiresAt?: string): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < Date.now()
}


function getExpiresSortValue(expiresAt?: string): number {
  if (!expiresAt) return Number.MAX_SAFE_INTEGER
  return new Date(expiresAt).getTime()
}

export default function ClientDocuments() {
  const c = useClientTheme()
  const { clientId, clientName } = useClientSession()
  const { capabilities } = useClientCapabilities()
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [viewingDoc, setViewingDoc] = useState<ClientDocument | null>(null)
  const [viewingFile, setViewingFile] = useState<File | undefined>(undefined)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [reminderEditId, setReminderEditId] = useState<string | null>(null)
  const [reminderEditValue, setReminderEditValue] = useState('')

  useEffect(() => {
    if (!viewingDoc) {
      setViewingFile(undefined)
      return
    }
    let cancelled = false
    void getClientDocumentFile(viewingDoc.id).then((file) => {
      if (!cancelled) setViewingFile(file)
    })
    return () => {
      cancelled = true
    }
  }, [viewingDoc])
  const [pageSize, setPageSize] = useState<number>(getInitialListPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<DocumentSortField>('uploaded_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [uploadCategory, setUploadCategory] = useState<ClientDocumentCategory>('broker')
  const [uploadName, setUploadName] = useState('')
  const [uploadReminder, setUploadReminder] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingUpload[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const documents = useMemo(
    () => getClientDocuments(clientId),
    [clientId, refreshKey]
  )

  const counts = useMemo(
    () => ({
      all: documents.length,
      broker: documents.filter((d) => d.category === 'broker').length,
      compliance: documents.filter((d) => d.category === 'compliance').length,
      other: documents.filter((d) => d.category === 'other').length,
      dueSoon: documents.filter(
        (d) => isReminderDueSoon(d.expires_at) && !isReminderPast(d.expires_at)
      ).length,
      expired: documents.filter((d) => isReminderPast(d.expires_at)).length,
    }),
    [documents]
  )

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const term = searchTerm.toLowerCase()
      const matchesSearch =
        doc.name.toLowerCase().includes(term) ||
        doc.file_name.toLowerCase().includes(term) ||
        doc.uploaded_by.toLowerCase().includes(term)
      const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter
      return matchesSearch && matchesCategory
    })
  }, [documents, searchTerm, categoryFilter])

  const sortedDocuments = useMemo(() => {
    const sorted = [...filteredDocuments]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'category':
          cmp = a.category.localeCompare(b.category)
          break
        case 'file_name':
          cmp = a.file_name.localeCompare(b.file_name, undefined, { numeric: true })
          break
        case 'size':
          cmp = a.size - b.size
          break
        case 'uploaded_at':
          cmp = new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime()
          break
        case 'expires_at':
          cmp = getExpiresSortValue(a.expires_at) - getExpiresSortValue(b.expires_at)
          break
        case 'uploaded_by':
          cmp = a.uploaded_by.localeCompare(b.uploaded_by)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredDocuments, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedDocuments.length / pageSize))

  const paginatedDocuments = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedDocuments.slice(start, start + pageSize)
  }, [sortedDocuments, currentPage, pageSize])

  const pageStart = sortedDocuments.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, sortedDocuments.length)

  const handleSort = useCallback(
    (field: DocumentSortField) => {
      if (sortField === field) {
        setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        const defaultDesc = field === 'size' || field === 'uploaded_at' || field === 'expires_at'
        setSortDir(defaultDesc ? 'desc' : 'asc')
      }
    },
    [sortField]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, categoryFilter, pageSize, sortField, sortDir])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const resetUploadForm = () => {
    setPendingFiles([])
    setUploadName('')
    setUploadReminder('')
    setUploadCategory('broker')
    setUploadError(null)
  }

  const openUploadModal = () => {
    resetUploadForm()
    setShowUploadModal(true)
  }

  const closeUploadModal = () => {
    setShowUploadModal(false)
    resetUploadForm()
  }

  const addPendingFiles = (files: FileList | File[]) => {
    const next = Array.from(files).map((file) => ({
      id: `pending-${Date.now()}-${Math.random()}`,
      file,
    }))
    setPendingFiles((prev) => [...prev, ...next])
    if (!uploadName.trim() && next.length === 1) {
      setUploadName(next[0].file.name.replace(/\.[^.]+$/, ''))
    }
    setUploadError(null)
  }

  const handleSaveUploads = async () => {
    if (pendingFiles.length === 0) {
      setUploadError('Add at least one file.')
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      for (let index = 0; index < pendingFiles.length; index++) {
        const pending = pendingFiles[index]
        const name =
          uploadName.trim() ||
          pending.file.name.replace(/\.[^.]+$/, '') ||
          pending.file.name

        await addClientDocument(clientId, {
          name: pendingFiles.length === 1 ? name : `${name} ${index + 1}`,
          file: pending.file,
          category: uploadCategory,
          document_type: 'general',
          expires_at: uploadReminder || undefined,
          uploaded_by: clientName,
        })
      }

      setRefreshKey((k) => k + 1)
      closeUploadModal()
    } catch (error) {
      console.error('Upload failed:', error)
      setUploadError('Could not save. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (documentId: string) => {
    await removeClientDocument(documentId)
    setDeleteConfirmId(null)
    setRefreshKey((k) => k + 1)
  }

  const openReminderEdit = (doc: ClientDocument) => {
    setReminderEditId(doc.id)
    setReminderEditValue(doc.expires_at ? doc.expires_at.split('T')[0] : '')
  }

  const saveReminderEdit = async () => {
    if (!reminderEditId) return
    await updateClientDocument(reminderEditId, {
      expires_at: reminderEditValue || undefined,
    })
    setReminderEditId(null)
    setReminderEditValue('')
    setRefreshKey((k) => k + 1)
  }

  const viewerDocuments = viewingDoc
    ? [
        {
          id: viewingDoc.id,
          name: viewingDoc.file_name,
          file: viewingFile,
          type: viewingDoc.mime_type,
          size: viewingDoc.size,
        },
      ]
    : []

  const inputCompactStyle = {
    backgroundColor: c.card,
    height: 34,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 13,
  } as const

  const categoryFilters = [
    { key: 'all' as const, label: 'All' },
    { key: 'broker' as const, label: 'Broker' },
    { key: 'compliance' as const, label: 'Compliance' },
    { key: 'other' as const, label: 'Other' },
  ] as const

  return (
    <>
      <div className="client-documents-page overflow-hidden flex flex-col min-h-0">
            <section
              className="client-stat-strip grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b shrink-0"
              style={{ borderColor: c.border }}
            >
              <div
                className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b sm:border-b-0"
                style={{ backgroundColor: c.stat.blue, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    Total documents
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                  {counts.all}
                </span>
              </div>
              <div
                className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b sm:border-b-0"
                style={{ backgroundColor: c.stat.green, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: c.success }} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    Broker
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                  {counts.broker}
                </span>
              </div>
              <div
                className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0"
                style={{ backgroundColor: c.stat.amber, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Shield className="w-3.5 h-3.5 shrink-0" style={{ color: c.warning }} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    Compliance
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
                  {counts.compliance}
                </span>
              </div>
              <div
                className="flex items-center justify-between gap-2 px-4 py-2.5"
                style={{ backgroundColor: counts.dueSoon + counts.expired > 0 ? c.stat.red : c.stat.blue, borderColor: c.border }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: counts.expired > 0 ? c.error : c.warning }} />
                  <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                    Reminders due
                  </span>
                </div>
                <span
                  className="text-lg font-bold tabular-nums shrink-0"
                  style={{ color: counts.expired > 0 ? c.error : c.primary }}
                >
                  {counts.dueSoon + counts.expired}
                </span>
              </div>
            </section>

            <div
              className="client-page-toolbar px-4 py-2 border-b shrink-0"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-2">
                <div className="flex-1 relative min-w-0">
                  <Search
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                    style={{ color: c.secondary }}
                  />
                  <input
                    type="text"
                    placeholder="Search by name, file, or uploader..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="client-input pl-8 w-full"
                    style={inputCompactStyle}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Filter className="w-3.5 h-3.5 hidden sm:block" style={{ color: c.secondary }} />
                  {categoryFilters.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategoryFilter(key)}
                      className={`batch-filter-pill ${categoryFilter === key ? 'batch-filter-pill--active' : ''}`}
                    >
                      {label}
                      <span className="batch-filter-pill__count">{counts[key]}</span>
                    </button>
                  ))}
                  {capabilities.canUploadVault && (
                    <button
                      type="button"
                      onClick={openUploadModal}
                      className="dashboard-btn-primary ml-auto lg:ml-0"
                    >
                      <Plus className="w-4 h-4" />
                      Upload
                    </button>
                  )}
                </div>
              </div>
            </div>

            {sortedDocuments.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-center py-6 px-4">
                <div>
                  <FolderOpen className="w-10 h-10 mx-auto mb-3" style={{ color: c.mutedLight }} />
                  <p className="text-base font-medium mb-1" style={{ color: c.primary }}>
                    {documents.length === 0 ? 'No documents yet' : 'No matches'}
                  </p>
                  <p className="text-sm mb-4" style={{ color: c.secondary }}>
                    {documents.length === 0
                      ? 'Upload broker packets, compliance files, and other records.'
                      : 'Try adjusting your search or folder filter.'}
                  </p>
                  {documents.length === 0 && capabilities.canUploadVault && (
                    <button
                      type="button"
                      onClick={openUploadModal}
                      className="dashboard-btn-primary"
                    >
                      <Upload className="w-4 h-4" />
                      Upload
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="client-table-scroll client-table-scroll--mobile-stack flex-1 min-h-0 overflow-y-auto overflow-x-auto">
                  <table className="dashboard-table dashboard-table--compact">
                    <thead>
                      <tr>
                        <ClientSortableHeader
                          field="name"
                          label="Name"
                          sortField={sortField}
                          sortDir={sortDir}
                          onSort={handleSort}
                        />
                        <ClientSortableHeader
                          field="category"
                          label="Folder"
                          sortField={sortField}
                          sortDir={sortDir}
                          onSort={handleSort}
                        />
                        <ClientSortableHeader
                          field="file_name"
                          label="File"
                          sortField={sortField}
                          sortDir={sortDir}
                          onSort={handleSort}
                        />
                        <ClientSortableHeader
                          field="size"
                          label="Size"
                          sortField={sortField}
                          sortDir={sortDir}
                          onSort={handleSort}
                          className="text-right"
                          align="right"
                        />
                        <ClientSortableHeader
                          field="uploaded_at"
                          label="Uploaded"
                          sortField={sortField}
                          sortDir={sortDir}
                          onSort={handleSort}
                        />
                        <ClientSortableHeader
                          field="expires_at"
                          label="Reminder"
                          sortField={sortField}
                          sortDir={sortDir}
                          onSort={handleSort}
                        />
                        <ClientSortableHeader
                          field="uploaded_by"
                          label="Uploaded by"
                          sortField={sortField}
                          sortDir={sortDir}
                          onSort={handleSort}
                        />
                        <th className="text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedDocuments.map((doc) => {
                        const past = isReminderPast(doc.expires_at)
                        const soon = isReminderDueSoon(doc.expires_at)

                        return (
                          <tr key={doc.id}>
                            <ClientListTd variant="primary" className="font-semibold max-w-[180px]">
                              <span className="truncate block">{doc.name}</span>
                            </ClientListTd>
                            <ClientListTd variant="meta" className="truncate">
                              <span className="client-list-meta-short">
                                {CATEGORY_LABELS[doc.category]}
                              </span>
                              <span className="client-list-meta-full">
                                {CATEGORY_LABELS[doc.category]}
                              </span>
                            </ClientListTd>
                            <ClientListTd variant="desktop" label="File" className="truncate max-w-[200px]" style={{ color: c.secondary }}>
                              {doc.file_name}
                            </ClientListTd>
                            <ClientListTd variant="amount" className="text-right tabular-nums" style={{ color: c.secondary }}>
                              {formatFileSize(doc.size)}
                            </ClientListTd>
                            <ClientListTd variant="desktop" label="Uploaded" style={{ color: c.secondary }}>
                              {formatDate(doc.uploaded_at)}
                            </ClientListTd>
                            <ClientListTd variant="status">
                              {reminderEditId === doc.id ? (
                                <div className="inline-flex items-center gap-1.5 flex-wrap">
                                  <input
                                    type="date"
                                    value={reminderEditValue}
                                    onChange={(e) => setReminderEditValue(e.target.value)}
                                    className="client-input text-xs py-1"
                                    style={{ height: 30, fontSize: 12 }}
                                  />
                                  <button
                                    type="button"
                                    onClick={saveReminderEdit}
                                    className="text-xs font-medium"
                                    style={{ color: c.info }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setReminderEditId(null)}
                                    className="text-xs"
                                    style={{ color: c.secondary }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : doc.expires_at ? (
                                <button
                                  type="button"
                                  onClick={() => openReminderEdit(doc)}
                                  className={`inline-flex items-center status-pill ${
                                    past
                                      ? 'status-pill--hold'
                                      : soon
                                        ? 'status-pill--pending'
                                        : ''
                                  }`}
                                  style={
                                    past
                                      ? { color: c.error, borderColor: `${c.error}33` }
                                      : soon
                                        ? { color: c.warning, borderColor: `${c.warning}33` }
                                        : undefined
                                  }
                                >
                                  {formatDate(doc.expires_at)}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openReminderEdit(doc)}
                                  className="text-xs font-medium hover:underline"
                                  style={{ color: c.secondary }}
                                >
                                  Set reminder
                                </button>
                              )}
                            </ClientListTd>
                            <ClientListTd variant="desktop" label="Uploaded by" className="truncate max-w-[140px]" style={{ color: c.secondary }}>
                              {doc.uploaded_by}
                            </ClientListTd>
                            <ClientListTd variant="actions" className="text-center">
                              <div className="inline-flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openReminderEdit(doc)}
                                  className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
                                  style={{ color: c.secondary }}
                                  title="Reminder date"
                                >
                                  <Calendar className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setViewingDoc(doc)}
                                  className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
                                  style={{ color: c.info }}
                                  title="View"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                {capabilities.canUploadVault && (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(doc.id)}
                                    className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                                    style={{ color: c.error }}
                                    title="Remove"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </ClientListTd>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div
                  className="client-page-footer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-t shrink-0"
                  style={{ borderColor: c.border, backgroundColor: c.card }}
                >
                  <p className="text-xs font-medium" style={{ color: c.secondary }}>
                    Showing {pageStart}–{pageEnd} of {sortedDocuments.length}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: c.secondary }}>
                      Rows
                      <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="client-input"
                        style={{
                          backgroundColor: c.card,
                          height: 30,
                          paddingTop: 4,
                          paddingBottom: 4,
                          fontSize: 12,
                          width: 64,
                        }}
                      >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="table-page-btn"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-medium px-2 tabular-nums" style={{ color: c.primary }}>
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                        className="table-page-btn"
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
      </div>

      {viewingDoc && (
        <DocumentViewer
          isOpen={!!viewingDoc}
          onClose={() => setViewingDoc(null)}
          documents={viewerDocuments}
          title={viewingDoc.name}
        />
      )}

      {showUploadModal && (
        <div
          className="invoice-dispute-modal-overlay"
          onClick={closeUploadModal}
          role="presentation"
        >
          <div
            className="invoice-dispute-modal doc-vault-upload-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="upload-doc-title"
          >
            <div className="invoice-dispute-modal-header">
              <h3 id="upload-doc-title" className="text-base font-semibold" style={{ color: c.primary }}>
                Upload document
              </h3>
              <button
                type="button"
                onClick={closeUploadModal}
                className="p-1.5 rounded-lg hover:bg-slate-100"
                style={{ color: c.secondary }}
                aria-label="Close"
                disabled={isUploading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="invoice-dispute-modal-body space-y-4">
              <div>
                <label className="client-label">Name</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="Document name"
                  className="client-input w-full"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="client-label">Reminder date (optional)</label>
                  <input
                    type="date"
                    value={uploadReminder}
                    onChange={(e) => setUploadReminder(e.target.value)}
                    className="client-input w-full"
                  />
                </div>
                <div>
                  <label className="client-label">Folder</label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as ClientDocumentCategory)}
                    className="client-input w-full"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="client-label">File</label>
                <div
                  className="doc-vault-dropzone"
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.add('doc-vault-dropzone--active')
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.remove('doc-vault-dropzone--active')
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.remove('doc-vault-dropzone--active')
                    if (e.dataTransfer.files.length > 0) {
                      addPendingFiles(e.dataTransfer.files)
                    }
                  }}
                >
                  <Upload className="w-8 h-8 mb-2" style={{ color: c.secondary }} />
                  <p className="text-sm" style={{ color: c.secondary }}>
                    Drop files or{' '}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="font-medium underline-offset-2 hover:underline"
                      style={{ color: c.info }}
                    >
                      browse
                    </button>
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        addPendingFiles(e.target.files)
                        e.target.value = ''
                      }
                    }}
                  />
                </div>

                {pendingFiles.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {pendingFiles.map((pending) => (
                      <li key={pending.id} className="doc-vault-pending-item">
                        <span className="text-sm truncate flex-1" style={{ color: c.primary }}>
                          {pending.file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingFiles((prev) => prev.filter((p) => p.id !== pending.id))
                          }
                          className="p-1 rounded hover:bg-slate-100 shrink-0"
                          style={{ color: c.secondary }}
                          aria-label="Remove file"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {uploadError && (
                  <div className="flex items-center gap-2 mt-3 text-sm" style={{ color: c.error }}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {uploadError}
                  </div>
                )}
              </div>
            </div>

            <div className="invoice-dispute-modal-footer">
              <button
                type="button"
                onClick={closeUploadModal}
                className="dashboard-btn-secondary"
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveUploads}
                disabled={pendingFiles.length === 0 || isUploading}
                className="dashboard-btn-primary"
              >
                {isUploading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div
          className="invoice-dispute-modal-overlay"
          onClick={() => setDeleteConfirmId(null)}
          role="presentation"
        >
          <div
            className="invoice-dispute-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="delete-doc-title"
          >
            <div className="invoice-dispute-modal-header">
              <h3 id="delete-doc-title" className="text-base font-semibold" style={{ color: c.primary }}>
                Remove document?
              </h3>
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100"
                style={{ color: c.secondary }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="invoice-dispute-modal-footer">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="dashboard-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmId)}
                className="dashboard-btn-primary"
                style={{ backgroundColor: c.error }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
