import { useState, useEffect, useRef } from 'react'
import { formatCurrency } from '../../utils/format'
import { formatDate } from '../../utils/format'
import { X, Check, AlertCircle, Phone, Mail, FileText, User, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download, Printer, Edit2, Save, Upload, Trash2, GripVertical } from 'lucide-react'
import { Invoice } from '../../types/invoice'
import ContactBrokerModal from '../brokers/ContactBrokerModal'
import { mockBrokers } from '../../data/mockBrokers'
import { getAllClients, getClientById } from '../../services/clientRegistry'
import jsPDF from 'jspdf'
import { generateInvoicePDFFile } from '../../utils/generateInvoicePDF'
import { addBatchFile, getBatchFile } from '../../data/batchFileStore'
import { updateInvoice, getInvoiceById } from '../../data/mockInvoices'
import { approveAdminInvoice, holdAdminInvoice } from '../../services/adminInvoiceActions'
import {
  saveInvoiceDocuments,
  updateInvoiceDocumentMetadata,
} from '../../services/supabase/tenantPersist'
import {
  invoiceDocumentsMissingFromStore,
  resolveInvoiceDocumentsAsync,
} from '../../utils/resolveInvoiceDocuments'

function docIdsFromDocuments(docs: Document[]): string[] {
  return docs.map((d) => d.id).filter((id) => !id.startsWith('invoice-pdf-'))
}

function invoiceDocumentCount(invoice: Invoice, docIds: string[]): number {
  const invPdfKey = invoice.doc_sort_group_id
    ? `invoice-pdf-${invoice.doc_sort_group_id}`
    : null
  const hasInvPdf =
    !!invPdfKey &&
    !!(
      (invoice.batch_id && getBatchFile(invoice.batch_id, invPdfKey)) ||
      invoice.document_storage_paths?.[invPdfKey]
    )
  return docIds.length + (hasInvPdf ? 1 : 0)
}

interface Document {
  id: string
  name: string
  type: string
  size: number
  file?: File
}

interface AdminInvoiceDetailViewProps {
  invoice: Invoice | null
  onClose: () => void
  onApprove?: (invoiceId: string) => void
  onHold?: (invoiceId: string) => void
  onContactBroker?: (invoiceId: string) => void
  invoiceList?: Invoice[] // Optional invoice list for three-panel layout
  onInvoiceSelect?: (invoice: Invoice) => void // Callback when invoice is selected from list
  stage?: 'ready_to_post' | 'verification' | 'approval' // Stage of the batch workflow
  isCollectionsView?: boolean // Whether this is opened from Collections view
}

export default function AdminInvoiceDetailView({
  invoice,
  onClose,
  onApprove,
  onHold,
  onContactBroker,
  invoiceList,
  onInvoiceSelect,
  stage,
  isCollectionsView = false,
}: AdminInvoiceDetailViewProps) {
  // Local state for invoice to handle updates and trigger re-renders
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(invoice)
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Update local invoice when prop changes
  useEffect(() => {
    setCurrentInvoice(invoice)
  }, [invoice])
  
  const [showContactBrokerModal, setShowContactBrokerModal] = useState(false)
  const [showContactCarrierModal, setShowContactCarrierModal] = useState(false)
  const [currentDocumentIndex, setCurrentDocumentIndex] = useState(0)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailRecipient, setEmailRecipient] = useState('')
  const [selectedEmailIndex, setSelectedEmailIndex] = useState<number | null>(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [documents, setDocuments] = useState<Document[]>([])
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [documentUrls, setDocumentUrls] = useState<Map<string, string>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedInvoice, setEditedInvoice] = useState({
    invoice_number: invoice?.invoice_number || '',
    load_number: invoice?.load_number || '',
    invoice_date: invoice?.invoice_date || '',
    amount: invoice?.amount || 0,
    broker_id: invoice?.broker_id || '',
    broker_name: invoice?.broker_name || '',
  })
  const [newNote, setNewNote] = useState('')
  const [brokerSearchTerm, setBrokerSearchTerm] = useState('')
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false)
  const [clientSearchTerm, setClientSearchTerm] = useState('')
  const [showClientSuggestions, setShowClientSuggestions] = useState(false)
  const [isCarrierExpanded, setIsCarrierExpanded] = useState(false)
  const [collectionDate, setCollectionDate] = useState(invoice?.collection_date || '')
  const [collectionStatus, setCollectionStatus] = useState<'C/B' | 'W/P' | ''>(invoice?.collection_status || '')
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  const [bulkNote, setBulkNote] = useState('')
  const [bulkCollectionDate, setBulkCollectionDate] = useState('')
  const [bulkCollectionStatus, setBulkCollectionStatus] = useState<'C/B' | 'W/P' | ''>('')
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<'Email' | 'Phone' | 'Web' | ''>((invoice?.verification_status as 'Email' | 'Phone' | 'Web' | undefined) || '')
  const [contactPersons, setContactPersons] = useState<string[]>(invoice?.contact_persons || ['John Smith', 'Sarah Johnson', 'Mike Davis', 'Emily Wilson'])
  const [selectedContactPerson, setSelectedContactPerson] = useState<string>(invoice?.selected_contact_person || '')
  const [newContactPerson, setNewContactPerson] = useState('')
  const [showAddContact, setShowAddContact] = useState(false)
  const [closeNote, setCloseNote] = useState('')
  const [closeAmount, setCloseAmount] = useState<number>(invoice?.amount || 0)
  const [closeType, setCloseType] = useState<'Force Close' | 'Write Off' | 'Paid' | ''>('')
  const [isUploadingDocs, setIsUploadingDocs] = useState(false)
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false)

  // Update collection fields when invoice changes
  useEffect(() => {
    if (currentInvoice) {
      setCollectionDate(currentInvoice.collection_date || '')
      setCollectionStatus(currentInvoice.collection_status || '')
      setVerificationStatus((currentInvoice as any).verification_status || '')
      setContactPersons((currentInvoice as any).contact_persons || ['John Smith', 'Sarah Johnson', 'Mike Davis', 'Emily Wilson'])
      setSelectedContactPerson((currentInvoice as any).selected_contact_person || '')
      setCloseAmount(currentInvoice.amount || 0)
      setCloseNote('')
      setCloseType('')
    }
  }, [currentInvoice])

  const handlePostCollectionInfo = () => {
    if (!currentInvoice) return
    
    if (!collectionStatus) {
      alert('Please select a status (C/B or W/P)')
      return
    }
    
    if (!collectionDate) {
      alert('Please select a date')
      return
    }
    
    // Update invoice with collection information
    if (currentInvoice) {
      const updated = updateInvoice(currentInvoice.id, {
        collection_date: collectionDate,
        collection_status: collectionStatus as 'C/B' | 'W/P',
      })
      if (updated) {
        setCurrentInvoice(updated)
        setRefreshKey((prev) => prev + 1)
      }
    }
    
    // In a real implementation, this would make an API call to save the collection info
    console.log('Collection info posted:', {
      invoice_id: invoice.id,
      collection_date: collectionDate,
      collection_status: collectionStatus,
    })
    
    alert('Collection information posted successfully')
  }

  const handleCloseInvoice = () => {
    if (!invoice) return
    
    if (!closeType) {
      alert('Please select a close type')
      return
    }
    
    if (!closeNote.trim()) {
      alert('Please enter a note explaining why you are closing this invoice')
      return
    }
    
    if (!closeAmount || closeAmount <= 0) {
      alert('Please enter a valid amount')
      return
    }
    
    if (!invoice.notes_history) {
      invoice.notes_history = []
    }
    
    const amountDifference = invoice.amount - closeAmount
    let amountNote = ''
    let statusNote = ''
    
    if (closeType === 'Paid') {
      amountNote = closeAmount === invoice.amount
        ? `Paid in full: $${closeAmount.toFixed(2)}`
        : `Paid: $${closeAmount.toFixed(2)}${amountDifference !== 0 ? ` (${amountDifference > 0 ? 'short paid' : 'overpaid'} by $${Math.abs(amountDifference).toFixed(2)})` : ''}`
      statusNote = 'Invoice marked as paid'
    } else if (closeType === 'Write Off') {
      amountNote = `Written off after short pay: received $${closeAmount.toFixed(2)} (balance $${Math.abs(amountDifference).toFixed(2)} not billed)`
      statusNote = 'Invoice written off — no collection fee'
    } else {
      amountNote = amountDifference > 0
        ? `Force closed — uncollectable balance $${Math.abs(amountDifference).toFixed(2)} (collected $${closeAmount.toFixed(2)})`
        : `Force closed — uncollectable for full amount $${closeAmount.toFixed(2)}`
      statusNote = 'Invoice force closed — collection fee applies'
    }

    const nextStatus =
      closeType === 'Paid' ? 'paid' : closeType === 'Write Off' ? 'written_off' : 'force_closed'
    const notes_history = [...(invoice.notes_history ?? [])]
    notes_history.push({
      id: `note-${Date.now()}`,
      note: `${statusNote}: ${amountNote}. ${closeNote}`,
      created_by: 'Admin User',
      created_at: new Date().toISOString(),
      type: 'note',
    })

    const updated = updateInvoice(invoice.id, {
      status: nextStatus,
      notes_history,
      paid_amount: closeType === 'Paid' || closeType === 'Write Off' ? closeAmount : invoice.paid_amount,
    })
    if (updated) {
      setCurrentInvoice(updated)
    }
    
    // Clear the close fields
    setCloseNote('')
    setCloseAmount(invoice.amount || 0)
    setCloseType('')
    
    // In a real implementation, this would make an API call to close the invoice
    console.log('Invoice closed:', {
      invoice_id: invoice.id,
      close_type: closeType,
      close_amount: closeAmount,
      original_amount: invoice.amount,
      close_note: closeNote,
    })
    
    alert('Invoice closed successfully')
    
    // Optionally close the detail view or refresh
    // onClose?.()
  }

  if (!currentInvoice) return null

  const broker = mockBrokers.find((b) => b.id === currentInvoice.broker_id)
  const client = getClientById(currentInvoice.client_id)
  
  const filteredBrokers = brokerSearchTerm
    ? mockBrokers.filter((b) =>
        b.name.toLowerCase().includes(brokerSearchTerm.toLowerCase())
      )
    : mockBrokers

  const filteredClients = clientSearchTerm
    ? getAllClients().filter((c) =>
        c.name.toLowerCase().includes(clientSearchTerm.toLowerCase())
      )
    : getAllClients()

  const getStatusBadge = (status: string) => {
    if (status === 'approved') {
      return (
        <span
          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: '#819291', color: '#FFFFFF' }}
        >
          <Check className="w-3 h-3 mr-0.5" />
          Approved
        </span>
      )
    } else if (status === 'hold') {
      return (
        <span
          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
        >
          <AlertCircle className="w-3 h-3 mr-0.5" />
          On Hold
        </span>
      )
    } else {
      return (
        <span
          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
        >
          Pending
        </span>
      )
    }
  }

  // Load documents from memory or Supabase storage
  useEffect(() => {
    if (!currentInvoice) {
      setDocuments([])
      return
    }

    let cancelled = false
    void resolveInvoiceDocumentsAsync(currentInvoice).then((storeDocs) => {
      if (!cancelled) {
        setDocuments(storeDocs)
        setCurrentDocumentIndex(0)
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    currentInvoice?.id,
    currentInvoice?.batch_id,
    currentInvoice?.document_doc_ids,
    currentInvoice?.document_storage_paths,
    refreshKey,
  ])

  // Update invoice documents_count when documents change
  useEffect(() => {
    if (currentInvoice && documents.length !== currentInvoice.documents_count) {
      currentInvoice.documents_count = documents.length
      if (invoice) {
      invoice.documents_count = documents.length
    }
      setCurrentInvoice({ ...currentInvoice })
    }
  }, [documents.length, currentInvoice])

  // Generate object URLs for uploaded files
  useEffect(() => {
    const urls = new Map<string, string>()
    
    documents.forEach((doc) => {
      if (doc.file) {
        const url = URL.createObjectURL(doc.file)
        urls.set(doc.id, url)
      }
    })
    
    setDocumentUrls(urls)
    
    // Cleanup function to revoke URLs when component unmounts or documents change
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [documents])

  const currentDocument = documents[currentDocumentIndex]

  const handlePreviousDocument = () => {
    if (currentDocumentIndex > 0) {
      setCurrentDocumentIndex(currentDocumentIndex - 1)
    }
  }

  const handleNextDocument = () => {
    if (currentDocumentIndex < documents.length - 1) {
      setCurrentDocumentIndex(currentDocumentIndex + 1)
    }
  }

  const getFileType = (name: string) => {
    const extension = name.split('.').pop()?.toLowerCase()
    if (['pdf'].includes(extension || '')) return 'pdf'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) return 'image'
    if (['doc', 'docx'].includes(extension || '')) return 'document'
    return 'other'
  }


  const handleDownload = async () => {
    if (!currentDocument) return
    
    if (currentDocument.file && documentUrls.has(currentDocument.id)) {
      // Download the actual file
      const url = documentUrls.get(currentDocument.id)!
      const link = document.createElement('a')
      link.href = url
      link.download = currentDocument.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else {
      // Mock download for documents without files
      alert(`Downloading ${currentDocument.name}`)
    }
  }

  const handlePrint = async () => {
    if (!currentDocument) return
    
    if (currentDocument.file && documentUrls.has(currentDocument.id)) {
      // Open print dialog for the document
      const url = documentUrls.get(currentDocument.id)!
      const printWindow = window.open(url, '_blank')
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print()
        }
      }
    } else {
      // Mock print for documents without files
      alert(`Printing ${currentDocument.name}`)
    }
  }

  const handleSendEmail = () => {
    setShowEmailModal(true)
    // Pre-fill recipient if broker has emails
    if (broker?.emails && broker.emails.length > 0) {
      // Default to first paperwork email, or first email if no paperwork email
      const paperworkEmail = broker.emails.find(e => e.category === 'paperwork')
      if (paperworkEmail) {
        setEmailRecipient(paperworkEmail.email)
        setSelectedEmailIndex(broker.emails.indexOf(paperworkEmail))
      } else {
        setEmailRecipient(broker.emails[0].email)
        setSelectedEmailIndex(0)
      }
    } else if (broker?.email) {
      // Fallback to legacy email field
      setEmailRecipient(broker.email)
      setSelectedEmailIndex(null)
    }
    // Pre-fill subject
    setEmailSubject(`Invoice ${currentInvoice.invoice_number} - Documents`)
    // Pre-fill message
    setEmailMessage(`Please find attached all documents for Invoice ${currentInvoice.invoice_number}.\n\nThank you.`)
  }

  const handleEmailSubmit = () => {
    if (!emailRecipient.trim()) {
      alert('Please enter a recipient email address')
      return
    }
    if (!currentInvoice) return

    // In real implementation, this would send the email with all documents attached
    console.log('Sending email to:', emailRecipient)
    console.log('Subject:', emailSubject)
    console.log('Message:', emailMessage)
    console.log('Attachments:', documents.map(d => d.name))
    
    // Create document send record
    const sendRecord = {
      email_address: emailRecipient,
      sent_at: new Date().toISOString(),
      sent_by: 'Admin User', // In real app, get from auth context
      status: 'delivered' as const,
      documents_sent: documents.map(d => d.name),
    }

    // Add to invoice's document_send_history
    if (!currentInvoice.document_send_history) {
      currentInvoice.document_send_history = []
    }
    currentInvoice.document_send_history.push(sendRecord)

    // Update invoice state
    setCurrentInvoice({ ...currentInvoice })

    // Log audit event
    const { logAuditEvent } = require('../../utils/auditLogger')
    logAuditEvent(
      'document_sent',
      'invoice',
      currentInvoice.id,
      currentInvoice.invoice_number,
      `Paperwork manually sent to ${emailRecipient} for invoice ${currentInvoice.invoice_number}`,
      'user-1', // In real app, get from auth context
      'Admin User',
      'Admin',
      undefined,
      {
        broker_id: currentInvoice.broker_id,
        broker_name: currentInvoice.broker_name,
        broker_email: emailRecipient,
        documents_sent: documents.map(d => d.name),
        automatic: false,
        manual: true,
      },
      'info',
      true
    )
    
    // Show success message
    alert(`Email sent successfully to ${emailRecipient}`)
    setShowEmailModal(false)
    setEmailRecipient('')
    setSelectedEmailIndex(null)
    setEmailSubject('')
    setEmailMessage('')
  }

  const handleContactBroker = () => {
    onContactBroker?.(invoice.id)
    setShowContactBrokerModal(true)
  }

  const handleContactCarrier = () => {
    setShowContactCarrierModal(true)
  }

  const handleEdit = () => {
    setIsEditing(true)
    setBrokerSearchTerm('')
  }

  const handleSave = () => {
    // Validate broker is set when in ready_to_post stage
    if (isBrokerRequired && !editedInvoice.broker_id) {
      alert('A broker must be assigned to this invoice before saving. Please select a broker.')
      return
    }
    
    // Update invoice with edited values
    invoice.invoice_number = editedInvoice.invoice_number
    invoice.load_number = editedInvoice.load_number
    invoice.invoice_date = editedInvoice.invoice_date
    invoice.amount = editedInvoice.amount
    invoice.broker_id = editedInvoice.broker_id
    invoice.broker_name = editedInvoice.broker_name
    
    setIsEditing(false)
    // In real implementation, this would save to the backend
    console.log('Invoice updated:', invoice)
  }

  const handleCancelEdit = () => {
    // Reset to original values
    setEditedInvoice({
      invoice_number: invoice.invoice_number || '',
      load_number: invoice.load_number || '',
      invoice_date: invoice.invoice_date || '',
      amount: invoice.amount || 0,
      broker_id: invoice.broker_id || '',
      broker_name: invoice.broker_name || '',
    })
    setIsEditing(false)
    setBrokerSearchTerm('')
    setShowBrokerSuggestions(false)
    setClientSearchTerm('')
    setShowClientSuggestions(false)
  }

  const handleBrokerSelect = (selectedBroker: typeof mockBrokers[0]) => {
    setEditedInvoice({
      ...editedInvoice,
      broker_id: selectedBroker.id,
      broker_name: selectedBroker.name,
    })
    setBrokerSearchTerm(selectedBroker.name)
    setShowBrokerSuggestions(false)
  }

  const handleAddNote = () => {
    if (!currentInvoice) return
    
    // In verification stage, combine verification info and note
    let noteText = ''
    
    if (stage === 'verification') {
      // Build verification note from verification information
      const verificationParts: string[] = []
      
      if (verificationStatus) {
        verificationParts.push(`Verified via: ${verificationStatus}`)
      }
      
      if (selectedContactPerson) {
        verificationParts.push(`Contact: ${selectedContactPerson}`)
      }
      
      if (newNote.trim()) {
        verificationParts.push(`Note: ${newNote.trim()}`)
      }
      
      // Only add note if there's at least verification info or a note
      if (verificationParts.length === 0) {
        alert('Please enter verification information or a note')
      return
    }
    
      noteText = verificationParts.join(' | ')
      
      // Update invoice verification fields
      const updatedInvoice = {
        ...currentInvoice,
        verification_status: verificationStatus || undefined,
        selected_contact_person: selectedContactPerson || undefined,
        contact_persons: contactPersons.length > 0 ? contactPersons : undefined,
      }
      
      // Add note to invoice notes history
      const updatedNotesHistory = [...(updatedInvoice.notes_history || [])]
      updatedNotesHistory.push({
      id: `note-${Date.now()}`,
        note: noteText,
        created_by: 'Admin User',
      created_at: new Date().toISOString(),
      type: 'note',
    })
    
    // Update notes field
      const updatedNotes = updatedInvoice.notes
        ? `${updatedInvoice.notes}\n${noteText}`
        : noteText
      
      // Update the invoice with all changes
      const finalInvoice = {
        ...updatedInvoice,
        notes_history: updatedNotesHistory,
        notes: updatedNotes,
      }

      const saved = updateInvoice(currentInvoice.id, {
        verification_status: finalInvoice.verification_status,
        selected_contact_person: finalInvoice.selected_contact_person,
        contact_persons: finalInvoice.contact_persons,
        notes_history: finalInvoice.notes_history,
        notes: finalInvoice.notes,
      })

      setCurrentInvoice(saved ?? finalInvoice)
      if (invoice && saved) {
        Object.assign(invoice, saved)
      }

      setRefreshKey((prev) => prev + 1)
      setNewNote('')

      console.log('Verification note added to invoice:', currentInvoice.id)
    } else {
      // Regular note for non-verification stages
      if (!newNote.trim()) {
        alert('Please enter a note')
        return
      }
      noteText = newNote.trim()
      
      // Add note to invoice notes history
      const updatedNotesHistory = [...(currentInvoice.notes_history || [])]
      updatedNotesHistory.push({
        id: `note-${Date.now()}`,
        note: noteText,
        created_by: 'Admin User',
        created_at: new Date().toISOString(),
        type: 'note',
      })
      
      // Update notes field
      const updatedNotes = currentInvoice.notes
        ? `${currentInvoice.notes}\n${noteText}`
        : noteText
      
      // Update the invoice
      const finalInvoice = {
        ...currentInvoice,
        notes_history: updatedNotesHistory,
        notes: updatedNotes,
      }

      const saved = updateInvoice(currentInvoice.id, {
        notes_history: finalInvoice.notes_history,
        notes: finalInvoice.notes,
      })

      setCurrentInvoice(saved ?? finalInvoice)
      if (invoice && saved) {
        Object.assign(invoice, saved)
      }

      setRefreshKey((prev) => prev + 1)
      setNewNote('')

      console.log('Note added to invoice:', currentInvoice.id)
    }
  }

  const handleRemoveNote = (noteId: string) => {
    if (!currentInvoice) return

    const updatedNotesHistory = (currentInvoice.notes_history || []).filter((n) => n.id !== noteId)
    const updatedNotes = updatedNotesHistory.length > 0
      ? updatedNotesHistory.map((n) => n.note).join('\n')
      : undefined

    const finalInvoice = {
      ...currentInvoice,
      notes_history: updatedNotesHistory.length > 0 ? updatedNotesHistory : undefined,
      notes: updatedNotes,
    }

    const saved = updateInvoice(currentInvoice.id, {
      notes_history: updatedNotesHistory.length > 0 ? updatedNotesHistory : undefined,
      notes: updatedNotes,
    })

    setCurrentInvoice(saved ?? finalInvoice)
    if (invoice && saved) {
      Object.assign(invoice, saved)
    }
    setRefreshKey((prev) => prev + 1)
  }

  // Bulk operations handlers
  const handleBulkAddNote = () => {
    if (!bulkNote.trim()) {
      alert('Please enter a note')
      return
    }
    
    if (selectedInvoiceIds.size === 0) {
      alert('Please select at least one invoice')
      return
    }
    
    const selectedInvoices = invoiceList!.filter(inv => selectedInvoiceIds.has(inv.id))
    
    selectedInvoices.forEach((inv) => {
      const updatedNotesHistory = [...(inv.notes_history ?? [])]
      updatedNotesHistory.push({
        id: `note-${Date.now()}-${inv.id}`,
        note: bulkNote,
        created_by: 'Admin User',
        created_at: new Date().toISOString(),
        type: 'note',
      })

      const updatedNotes = inv.notes ? `${inv.notes}\n${bulkNote}` : bulkNote
      updateInvoice(inv.id, {
        notes_history: updatedNotesHistory,
        notes: updatedNotes,
      })
    })

    setBulkNote('')
    setRefreshKey((prev) => prev + 1)
    console.log(`Note added to ${selectedInvoices.length} invoice(s)`)
  }

  const handleBulkApprove = () => {
    if (selectedInvoiceIds.size === 0) {
      alert('Please select at least one invoice')
      return
    }
    
    const selectedInvoices = invoiceList!.filter(inv => selectedInvoiceIds.has(inv.id))
    
    selectedInvoices.forEach((inv) => {
      approveAdminInvoice(inv.id)
      onApprove?.(inv.id)
    })
    
    console.log(`Approved ${selectedInvoices.length} invoice(s)`)
    setSelectedInvoiceIds(new Set())
    // In real implementation, this would save to the backend
  }

  const handleBulkHold = () => {
    if (selectedInvoiceIds.size === 0) {
      alert('Please select at least one invoice')
      return
    }
    
    const selectedInvoices = invoiceList!.filter(inv => selectedInvoiceIds.has(inv.id))
    
    selectedInvoices.forEach((inv) => {
      holdAdminInvoice(inv.id)
      onHold?.(inv.id)
    })
    
    console.log(`Placed ${selectedInvoices.length} invoice(s) on hold`)
    setSelectedInvoiceIds(new Set())
    // In real implementation, this would save to the backend
  }

  const handleBulkPostCollectionInfo = () => {
    if (selectedInvoiceIds.size === 0) {
      alert('Please select at least one invoice')
      return
    }
    
    if (!bulkCollectionStatus) {
      alert('Please select a status (C/B or W/P)')
      return
    }
    
    if (!bulkCollectionDate) {
      alert('Please select a date')
      return
    }
    
    const selectedInvoices = invoiceList!.filter(inv => selectedInvoiceIds.has(inv.id))
    
    selectedInvoices.forEach(inv => {
      inv.collection_date = bulkCollectionDate
      inv.collection_status = bulkCollectionStatus as 'C/B' | 'W/P'
    })
    
    console.log(`Collection info posted for ${selectedInvoices.length} invoice(s)`)
    setBulkCollectionDate('')
    setBulkCollectionStatus('')
    setSelectedInvoiceIds(new Set())
    // In real implementation, this would save to the backend
  }

  // Check if file is an image
  const isImageFile = (file: File): boolean => {
    const imageTypes = ['image/png', 'image/jpeg', 'image/jpg']
    return imageTypes.includes(file.type.toLowerCase())
  }

  // Convert image file to PDF
  const convertImageToPDF = async (imageFile: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const pdf = new jsPDF('p', 'mm', 'a4')
          const imgWidth = img.width
          const imgHeight = img.height
          const pdfWidth = pdf.internal.pageSize.getWidth()
          const pdfHeight = (imgHeight * pdfWidth) / imgWidth
          
          // If image is taller than one page, split it
          if (pdfHeight > pdf.internal.pageSize.getHeight()) {
            const pageHeight = pdf.internal.pageSize.getHeight()
            let heightLeft = pdfHeight
            let position = 0
            
            pdf.addImage(img.src, 'PNG', 0, position, pdfWidth, pdfHeight)
            heightLeft -= pageHeight
            
            while (heightLeft > 0) {
              position = heightLeft - pdfHeight
              pdf.addPage()
              pdf.addImage(img.src, 'PNG', 0, position, pdfWidth, pdfHeight)
              heightLeft -= pageHeight
            }
          } else {
            pdf.addImage(img.src, 'PNG', 0, 0, pdfWidth, pdfHeight)
          }
          
          const pdfBlob = pdf.output('blob')
          const pdfFileName = imageFile.name.replace(/\.(png|jpeg|jpg)$/i, '.pdf')
          const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' })
          resolve(pdfFile)
        }
        img.onerror = reject
        img.src = e.target?.result as string
      }
      reader.onerror = reject
      reader.readAsDataURL(imageFile)
    })
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const fileArray = Array.from(files)
    const processedDocuments: Document[] = []

    for (const file of fileArray) {
      if (isImageFile(file)) {
        try {
          // Convert image to PDF
          const pdfFile = await convertImageToPDF(file)
          processedDocuments.push({
            id: `doc-${Date.now()}-${Math.random()}`,
            name: pdfFile.name,
            type: 'application/pdf',
            size: pdfFile.size,
            file: pdfFile,
          })
        } catch (error) {
          console.error('Error converting image to PDF:', error)
          // Fallback to original file if conversion fails
          processedDocuments.push({
            id: `doc-${Date.now()}-${Math.random()}`,
            name: file.name,
            type: file.type || 'application/pdf',
            size: file.size,
            file: file,
          })
        }
      } else {
        // For PDFs and other files, add as-is (or convert DOC/DOCX if needed)
        // For now, we'll add them as-is since DOC/DOCX conversion requires additional libraries
        processedDocuments.push({
          id: `doc-${Date.now()}-${Math.random()}`,
          name: file.name,
          type: file.type || 'application/pdf',
          size: file.size,
          file: file,
        })
      }
    }

    if (!currentInvoice?.batch_id) {
      alert('This invoice has no batch — documents cannot be saved.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setIsUploadingDocs(true)
    try {
      const filesByDocId = new Map<string, File>()
      const newDocIds = [...(currentInvoice.document_doc_ids ?? [])]

      processedDocuments.forEach((doc) => {
        if (doc.file) {
          addBatchFile(currentInvoice.batch_id!, doc.id, doc.file)
          filesByDocId.set(doc.id, doc.file)
          if (!newDocIds.includes(doc.id)) {
            newDocIds.push(doc.id)
          }
        }
      })

      const nextCount = invoiceDocumentCount(currentInvoice, newDocIds)
      const saved = await saveInvoiceDocuments(
        currentInvoice,
        filesByDocId,
        newDocIds,
        nextCount
      )

      setDocuments((prev) => {
        const updated = [...prev, ...processedDocuments]
        if (updated.length > 0) {
          setCurrentDocumentIndex(updated.length - processedDocuments.length)
        }
        return updated
      })
      setCurrentInvoice(saved)
      if (invoice) {
        Object.assign(invoice, saved)
      }
      setRefreshKey((k) => k + 1)
    } catch (error) {
      console.error('Failed to save documents:', error)
      alert(error instanceof Error ? error.message : 'Failed to save documents')
    } finally {
      setIsUploadingDocs(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const formatAddressOnly = (
    entity: { address?: string; city?: string; state?: string; zip?: string }
  ) => {
    return [entity.address, [entity.city, entity.state, entity.zip].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join('\n')
  }

  const handleCreateInvoice = async () => {
    if (!currentInvoice) return

    if (!currentInvoice.invoice_number?.trim()) {
      alert('Invoice number is required to create an invoice document.')
      return
    }

    if (!currentInvoice.broker_name?.trim()) {
      alert('Broker is required to create an invoice document.')
      return
    }

    if (!currentInvoice.amount || currentInvoice.amount <= 0) {
      alert('A valid invoice amount is required to create an invoice document.')
      return
    }

    setIsCreatingInvoice(true)

    try {
      const brokerData = mockBrokers.find((b) => b.id === currentInvoice.broker_id)
      const clientData = getClientById(currentInvoice.client_id)

      const clientName = currentInvoice.client_name || clientData?.name || 'Client'

      const pdfFile = await generateInvoicePDFFile({
        invoiceNumber: currentInvoice.invoice_number,
        invoiceDate: currentInvoice.invoice_date || new Date().toISOString().split('T')[0],
        invoiceAmount: currentInvoice.amount,
        loadNumber: currentInvoice.load_number,
        brokerName: currentInvoice.broker_name,
        brokerAddress: brokerData ? formatAddressOnly(brokerData) : undefined,
        carrierName: clientName,
        clientName,
        clientAddressLines: clientData ? formatAddressOnly(clientData) : undefined,
        routingType: 'ACH',
        bankName: clientData?.bank_name,
        accountNumber: clientData?.account_number,
        routingNumber: clientData?.routing_number,
      })

      const newDocument: Document = {
        id: `doc-invoice-${Date.now()}`,
        name: pdfFile.name,
        type: 'application/pdf',
        size: pdfFile.size,
        file: pdfFile,
      }

      if (!currentInvoice.batch_id) {
        alert('This invoice has no batch — document cannot be saved.')
        return
      }

      addBatchFile(currentInvoice.batch_id, newDocument.id, pdfFile)
      const newDocIds = [...(currentInvoice.document_doc_ids ?? []), newDocument.id]
      const nextCount = invoiceDocumentCount(currentInvoice, newDocIds)
      const filesByDocId = new Map([[newDocument.id, pdfFile]])

      const saved = await saveInvoiceDocuments(
        currentInvoice,
        filesByDocId,
        newDocIds,
        nextCount
      )

      setDocuments((prev) => {
        const updated = [...prev, newDocument]
        setCurrentDocumentIndex(updated.length - 1)
        return updated
      })
      setCurrentInvoice(saved)
      if (invoice) {
        Object.assign(invoice, saved)
      }
      setRefreshKey((k) => k + 1)
    } catch (error) {
      console.error('Failed to create invoice PDF:', error)
      alert('Failed to create invoice PDF. Please try again.')
    } finally {
      setIsCreatingInvoice(false)
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    if (!currentInvoice?.batch_id) return
    if (!window.confirm('Are you sure you want to delete this document?')) return

    const newDocs = documents.filter((doc) => doc.id !== docId)
    const newDocIds = docIdsFromDocuments(newDocs)
    const nextCount = invoiceDocumentCount(currentInvoice, newDocIds)

    try {
      const saved = await updateInvoiceDocumentMetadata(
        currentInvoice,
        newDocIds,
        nextCount,
        [docId]
      )

      if (currentDocumentIndex >= newDocs.length && newDocs.length > 0) {
        setCurrentDocumentIndex(newDocs.length - 1)
      } else if (newDocs.length === 0) {
        setCurrentDocumentIndex(0)
      }

      setDocuments(newDocs)
      setCurrentInvoice(saved)
      if (invoice) {
        Object.assign(invoice, saved)
      }
      setRefreshKey((k) => k + 1)
    } catch (error) {
      console.error('Failed to delete document:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete document')
    }
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex || !currentInvoice?.batch_id) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    const newDocuments = [...documents]
    const draggedDoc = newDocuments[draggedIndex]
    newDocuments.splice(draggedIndex, 1)
    newDocuments.splice(dropIndex, 0, draggedDoc)

    setDocuments(newDocuments)
    setCurrentDocumentIndex(dropIndex)
    setDraggedIndex(null)
    setDragOverIndex(null)

    const newDocIds = docIdsFromDocuments(newDocuments)
    const nextCount = invoiceDocumentCount(currentInvoice, newDocIds)
    void updateInvoiceDocumentMetadata(currentInvoice, newDocIds, nextCount)
      .then((saved) => {
        setCurrentInvoice(saved)
        if (invoice) {
          Object.assign(invoice, saved)
        }
      })
      .catch((error) => {
        console.error('Failed to save document order:', error)
      })
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  // Determine if we should show three-panel layout (when invoiceList is provided)
  const showThreePanel = invoiceList && invoiceList.length > 0

  // Handle double-click to cycle through statuses (disabled in ready_to_post stage)
  const handleDoubleClickStatusChange = (inv: Invoice) => {
    // Don't allow status changes in ready_to_post stage
    if (stage === 'ready_to_post') {
      return
    }
    
    // Cycle through statuses: pending -> approved -> hold -> approved
    if (inv.status === 'pending' || !inv.status) {
      approveAdminInvoice(inv.id)
      onApprove?.(inv.id)
      setRefreshKey((k) => k + 1)
      if (currentInvoice?.id === inv.id) {
        const updated = getInvoiceById(inv.id)
        if (updated) {
          setCurrentInvoice({ ...updated })
          onInvoiceSelect?.({ ...updated })
        }
      }
      return
    }
    if (inv.status === 'approved') {
      holdAdminInvoice(inv.id)
      onHold?.(inv.id)
      setRefreshKey((k) => k + 1)
      if (currentInvoice?.id === inv.id) {
        const updated = getInvoiceById(inv.id)
        if (updated) {
          setCurrentInvoice({ ...updated })
          onInvoiceSelect?.({ ...updated })
        }
      }
      return
    }
    if (inv.status === 'hold') {
      approveAdminInvoice(inv.id)
      onApprove?.(inv.id)
      setRefreshKey((k) => k + 1)
      if (currentInvoice?.id === inv.id) {
        const updated = getInvoiceById(inv.id)
        if (updated) {
          setCurrentInvoice({ ...updated })
          onInvoiceSelect?.({ ...updated })
        }
      }
      return
    }
    return
  }
  
  // Check if broker is required but not set (for ready_to_post stage)
  const isBrokerRequired = stage === 'ready_to_post'
  const isBrokerMissing = isBrokerRequired && !currentInvoice?.broker_id

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Split View Container */}
      <div className="flex h-full">
        {/* Left Panel: Invoice List (only shown when invoiceList is provided) */}
        {showThreePanel && (
          <div
            className="w-[15%] border-r overflow-y-auto"
            style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}
          >
            <div
              className="px-2 py-1.5 border-b sticky top-0"
              style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}
            >
              <h3 className="text-[11px] font-semibold" style={{ color: '#113543' }}>
                Invoices ({invoiceList!.length})
              </h3>
            </div>
            <div className="divide-y" style={{ borderColor: '#819291' }}>
              {invoiceList!.map((inv, index) => {
                const isSelected = selectedInvoiceIds.has(inv.id)
                const isSingleSelected = invoice?.id === inv.id && selectedInvoiceIds.size === 0
                return (
                <button
                  key={inv.id}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      // CTRL+Click (or CMD+Click on Mac) to change status
                      e.preventDefault()
                      e.stopPropagation()
                      handleDoubleClickStatusChange(inv)
                      } else if (e.altKey) {
                        // Alt+Click for multi-select/range selection
                        e.preventDefault()
                        e.stopPropagation()
                        const newSelected = new Set(selectedInvoiceIds)
                        const currentIndex = index
                        
                        // Handle Alt+Click for range selection
                        if (lastSelectedIndex !== null && lastSelectedIndex !== currentIndex) {
                          const startIndex = Math.min(lastSelectedIndex, currentIndex)
                          const endIndex = Math.max(lastSelectedIndex, currentIndex)
                          
                          // Select all invoices in the range
                          for (let i = startIndex; i <= endIndex; i++) {
                            newSelected.add(invoiceList![i].id)
                          }
                    } else {
                          // Toggle single invoice selection
                          if (isSelected) {
                            newSelected.delete(inv.id)
                          } else {
                            newSelected.add(inv.id)
                          }
                        }
                        
                        setSelectedInvoiceIds(newSelected)
                        setLastSelectedIndex(currentIndex)
                      } else {
                        // Regular click to select invoice - clear multi-select and select single
                        setSelectedInvoiceIds(new Set())
                        setLastSelectedIndex(null)
                      onInvoiceSelect?.(inv)
                    }
                  }}
                  className="w-full text-left px-2 py-1 transition-colors"
                  style={{
                      backgroundColor: isSingleSelected ? '#f0f0f0' : isSelected ? '#FFF8E1' : '#FFFFFF',
                    color: '#113543',
                  }}
                  onMouseEnter={(e) => {
                      if (!isSingleSelected && !isSelected) {
                      e.currentTarget.style.backgroundColor = '#f8f9fa'
                      } else if (isSelected) {
                        e.currentTarget.style.backgroundColor = '#FFECB3'
                    }
                  }}
                  onMouseLeave={(e) => {
                      if (!isSingleSelected && !isSelected) {
                      e.currentTarget.style.backgroundColor = '#FFFFFF'
                      } else if (isSelected) {
                        e.currentTarget.style.backgroundColor = '#FFF8E1'
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium truncate leading-tight">{inv.invoice_number}</div>
                      <div className="text-[10px] truncate leading-tight" style={{ color: '#819291' }}>
                        {inv.broker_name}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-[10px] font-medium leading-tight" style={{ color: '#113543' }}>
                        {formatCurrency(inv.amount)}
                      </div>
                      {inv.status === 'approved' ? (
                        <span
                          className="inline-flex items-center px-1 py-px text-[9px] font-medium mt-0.5"
                          style={{ backgroundColor: '#819291', color: '#FFFFFF' }}
                        >
                          <Check className="w-2 h-2 mr-0.5" />
                          OK
                        </span>
                      ) : inv.status === 'hold' ? (
                        <span
                          className="inline-flex items-center px-1 py-px text-[9px] font-medium mt-0.5"
                          style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
                        >
                          Hold
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center px-1 py-px text-[9px] font-medium mt-0.5"
                          style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
                        >
                          Pend
                        </span>
                      )}
                    </div>
                  </div>
                  {isCollectionsView && inv.collection_status && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span
                        className="inline-flex items-center px-1 py-px text-[9px] font-medium"
                        style={{
                          backgroundColor: inv.collection_status === 'W/P' ? '#819291' : '#C2A558',
                          color: '#FFFFFF',
                        }}
                      >
                        {inv.collection_status}
                      </span>
                      {inv.collection_date && (
                        <span className="text-[9px]" style={{ color: '#819291' }}>
                          {formatDate(inv.collection_date)}
                        </span>
                      )}
                    </div>
                  )}
                </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Middle Panel: Invoice Details */}
        <div
          className={showThreePanel ? 'w-[40%] border-r overflow-y-auto' : 'w-1/2 overflow-y-auto'}
          style={{ backgroundColor: '#FFFFFF', borderColor: showThreePanel ? '#819291' : 'transparent' }}
        >
          {/* Header */}
          <div
            className="sticky top-0 border-b z-10"
            style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}
          >
            <div className="px-4 py-2 flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold" style={{ color: '#113543' }}>
                  {selectedInvoiceIds.size > 0 ? `Selected (${selectedInvoiceIds.size})` : 'Invoice Details'}
                </h2>
                {selectedInvoiceIds.size === 0 && currentInvoice && getStatusBadge(currentInvoice.status)}
              </div>
              {selectedInvoiceIds.size === 0 && currentInvoice && (
              <p className="text-xs mt-0.5 truncate" style={{ color: '#819291' }}>
                  {currentInvoice.invoice_number}
                  {currentInvoice.broker_name ? ` · ${currentInvoice.broker_name}` : ''}
                  {currentInvoice.amount ? ` · ${formatCurrency(currentInvoice.amount)}` : ''}
              </p>
              )}
              {selectedInvoiceIds.size > 0 && (
                <button
                  onClick={() => setSelectedInvoiceIds(new Set())}
                  className="text-xs mt-1 underline"
                  style={{ color: '#819291' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#113543'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#819291'
                  }}
                >
                  Clear Selection
                </button>
              )}
            </div>
            <div className="flex items-center space-x-1 flex-shrink-0">
              {!isEditing ? (
                <button
                  onClick={handleEdit}
                  className="flex items-center space-x-1 px-2 py-1 text-xs font-medium transition-colors"
                  style={{ color: '#113543', backgroundColor: '#f8f9fa' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f0f0f0'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8f9fa'
                  }}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    className="flex items-center space-x-1 px-2 py-1 text-xs font-medium text-white transition-colors"
                    style={{ backgroundColor: '#819291' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#6b7a7a'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#819291'
                    }}
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-2 py-1 text-xs font-medium transition-colors border rounded"
                    style={{
                      color: '#113543',
                      backgroundColor: '#FFFFFF',
                      borderColor: '#819291',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f8f9fa'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#FFFFFF'
                    }}
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="p-1.5 transition-colors"
                style={{ color: '#819291' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#113543'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#819291'
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            </div>

            {/* Verification Information — always pinned at top of details panel */}
            {selectedInvoiceIds.size === 0 && currentInvoice && (
              stage === 'verification' ||
              currentInvoice.verification_status ||
              currentInvoice.selected_contact_person
            ) && (
              <div
                className="px-4 py-2 border-t"
                style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}
              >
                <h3 className="text-xs font-semibold mb-2" style={{ color: '#113543' }}>
                  Verification Information
                </h3>
                {stage === 'verification' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5" style={{ color: '#819291' }}>
                        How was the invoice verified?
                      </label>
                      <select
                        value={verificationStatus}
                        onChange={(e) => {
                          const value = e.target.value as 'Email' | 'Phone' | 'Web' | ''
                          setVerificationStatus(value)
                          if (invoice) {
                            (invoice as any).verification_status = value
                          }
                        }}
                        className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-2"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                      >
                        <option value="">Select method</option>
                        <option value="Email">Email</option>
                        <option value="Phone">Phone</option>
                        <option value="Web">Web</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5" style={{ color: '#819291' }}>
                        Who did you speak to?
                      </label>
                      <div className="flex items-center gap-1">
                        <select
                          value={selectedContactPerson}
                          onChange={(e) => {
                            const value = e.target.value
                            setSelectedContactPerson(value)
                            if (invoice) {
                              (invoice as any).selected_contact_person = value
                            }
                          }}
                          className="flex-1 min-w-0 px-2 py-1 border rounded text-xs focus:outline-none focus:ring-2"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                        >
                          <option value="">Select contact</option>
                          {contactPersons.map((person) => (
                            <option key={person} value={person}>
                              {person}
                            </option>
                          ))}
                        </select>
                        {!showAddContact ? (
                          <button
                            onClick={() => setShowAddContact(true)}
                            className="px-2 py-1 text-[10px] font-medium text-white whitespace-nowrap"
                            style={{ backgroundColor: '#C2A558' }}
                          >
                            Add
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <input
                              type="text"
                              value={newContactPerson}
                              onChange={(e) => setNewContactPerson(e.target.value)}
                              placeholder="Name"
                              className="flex-1 min-w-0 px-2 py-1 border rounded text-xs"
                              style={{ borderColor: '#819291', color: '#113543', backgroundColor: '#FFFFFF' }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newContactPerson.trim()) {
                                  if (!contactPersons.includes(newContactPerson.trim())) {
                                    const updated = [...contactPersons, newContactPerson.trim()]
                                    setContactPersons(updated)
                                    if (invoice) {
                                      (invoice as any).contact_persons = updated
                                    }
                                  }
                                  setSelectedContactPerson(newContactPerson.trim())
                                  if (invoice) {
                                    (invoice as any).selected_contact_person = newContactPerson.trim()
                                  }
                                  setNewContactPerson('')
                                  setShowAddContact(false)
                                } else if (e.key === 'Escape') {
                                  setNewContactPerson('')
                                  setShowAddContact(false)
                                }
                              }}
                              autoFocus
                            />
                            <button
                              onClick={() => {
                                if (newContactPerson.trim()) {
                                  if (!contactPersons.includes(newContactPerson.trim())) {
                                    const updated = [...contactPersons, newContactPerson.trim()]
                                    setContactPersons(updated)
                                    if (invoice) {
                                      (invoice as any).contact_persons = updated
                                    }
                                  }
                                  setSelectedContactPerson(newContactPerson.trim())
                                  if (invoice) {
                                    (invoice as any).selected_contact_person = newContactPerson.trim()
                                  }
                                }
                                setNewContactPerson('')
                                setShowAddContact(false)
                              }}
                              className="px-1.5 py-1 text-[10px] font-medium text-white"
                              style={{ backgroundColor: '#819291' }}
                            >
                              OK
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {currentInvoice.verification_status && (
                      <div className="flex gap-2">
                        <span style={{ color: '#819291' }}>Verified via:</span>
                        <span className="font-medium" style={{ color: '#113543' }}>
                          {currentInvoice.verification_status}
                        </span>
                      </div>
                    )}
                    {currentInvoice.selected_contact_person && (
                      <div className="flex gap-2">
                        <span style={{ color: '#819291' }}>Contact:</span>
                        <span className="font-medium" style={{ color: '#113543' }}>
                          {currentInvoice.selected_contact_person}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons — always pinned at top */}
            {selectedInvoiceIds.size === 0 && invoice && currentInvoice && (
              <div
                className="px-4 py-1.5 border-t flex flex-wrap items-center gap-1.5"
                style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}
              >
                {invoice.broker_id && (
                  <button
                    onClick={handleContactBroker}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-white transition-colors"
                    style={{ backgroundColor: '#C2A558' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#b89547'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#C2A558'
                    }}
                  >
                    <Phone className="w-3 h-3" />
                    <span>Contact Broker</span>
                  </button>
                )}
                {client && (
                  <button
                    onClick={handleContactCarrier}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-white transition-colors"
                    style={{ backgroundColor: '#C2A558' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#b89547'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#C2A558'
                    }}
                  >
                    <Phone className="w-3 h-3" />
                    <span>Contact Carrier</span>
                  </button>
                )}
                {stage !== 'ready_to_post' && onApprove && (
                  <button
                    onClick={() => {
                      const updated = approveAdminInvoice(invoice.id)
                      onApprove?.(invoice.id)
                      if (updated) {
                        setCurrentInvoice(updated)
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-white transition-colors"
                    style={{
                      backgroundColor: invoice.status === 'approved' ? '#6b7a7a' : '#819291',
                      opacity: invoice.status === 'approved' ? 0.7 : 1,
                    }}
                    disabled={invoice.status === 'approved'}
                    onMouseEnter={(e) => {
                      if (invoice.status !== 'approved') {
                        e.currentTarget.style.backgroundColor = '#6b7a7a'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (invoice.status !== 'approved') {
                        e.currentTarget.style.backgroundColor = '#819291'
                      }
                    }}
                  >
                    <Check className="w-3 h-3" />
                    <span>Approve</span>
                  </button>
                )}
                {stage !== 'ready_to_post' && onHold && (
                  <button
                    onClick={() => {
                      const updated = holdAdminInvoice(invoice.id)
                      onHold?.(invoice.id)
                      if (updated) {
                        setCurrentInvoice(updated)
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-white transition-colors"
                    style={{
                      backgroundColor: invoice.status === 'hold' ? '#b89547' : '#C2A558',
                      opacity: invoice.status === 'hold' ? 0.7 : 1,
                    }}
                    disabled={invoice.status === 'hold'}
                    onMouseEnter={(e) => {
                      if (invoice.status !== 'hold') {
                        e.currentTarget.style.backgroundColor = '#b89547'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (invoice.status !== 'hold') {
                        e.currentTarget.style.backgroundColor = '#C2A558'
                      }
                    }}
                  >
                    <AlertCircle className="w-3 h-3" />
                    <span>Place on Hold</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-3 space-y-3">
            {selectedInvoiceIds.size > 0 ? (
              /* Multi-Select View */
              <>
                {/* Selected Invoices List */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                    Selected Invoices
                  </label>
                  <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-3" style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}>
                    {invoiceList!.filter(inv => selectedInvoiceIds.has(inv.id)).map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between p-2 border rounded" style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}>
                        <div>
                          <div className="text-sm font-medium" style={{ color: '#113543' }}>{inv.invoice_number}</div>
                          <div className="text-xs" style={{ color: '#819291' }}>{inv.broker_name} • {formatCurrency(inv.amount)}</div>
                        </div>
                        <button
                          onClick={() => {
                            const newSelected = new Set(selectedInvoiceIds)
                            newSelected.delete(inv.id)
                            setSelectedInvoiceIds(newSelected)
                          }}
                          className="p-1"
                          style={{ color: '#819291' }}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Note Section */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                    Add Note to All Selected
                  </label>
                  <textarea
                    value={bulkNote}
                    onChange={(e) => setBulkNote(e.target.value)}
                    placeholder="Add a note to all selected invoices..."
                    className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                    style={{
                      borderColor: '#819291',
                      color: '#113543',
                      backgroundColor: '#FFFFFF',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#C2A558'
                      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#819291'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                    rows={4}
                  />
                  <button
                    onClick={handleBulkAddNote}
                    className="mt-2 px-4 py-2 text-sm font-medium text-white transition-colors"
                    style={{ backgroundColor: '#C2A558' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#b89547'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#C2A558'
                    }}
                  >
                    Add Note to All
                  </button>
                </div>

                {/* Verification Stage: Approve/Hold Buttons */}
                {stage === 'verification' && (
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleBulkApprove}
                      className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
                      style={{ backgroundColor: '#819291' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#6b7a7a'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#819291'
                      }}
                    >
                      <Check className="w-4 h-4" />
                      <span>Approve All</span>
                    </button>
                    <button
                      onClick={handleBulkHold}
                      className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
                      style={{ backgroundColor: '#C2A558' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#b89547'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#C2A558'
                      }}
                    >
                      <AlertCircle className="w-4 h-4" />
                      <span>Place All on Hold</span>
                    </button>
                  </div>
                )}

                {/* Collections View: Collection Information */}
                {isCollectionsView && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4" style={{ color: '#113543' }}>
                      Collection Information
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                          Status <span style={{ color: '#C2A558' }}>*</span>
                        </label>
                        <select
                          value={bulkCollectionStatus}
                          onChange={(e) => setBulkCollectionStatus(e.target.value as 'C/B' | 'W/P' | '')}
                          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#819291'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                        >
                          <option value="">Select Status</option>
                          <option value="C/B">C/B - Call Back</option>
                          <option value="W/P">W/P - Will Pay</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                          Date <span style={{ color: '#C2A558' }}>*</span>
                        </label>
                        <input
                          type="date"
                          value={bulkCollectionDate}
                          onChange={(e) => setBulkCollectionDate(e.target.value)}
                          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#819291'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                        />
                      </div>
                      <button
                        onClick={handleBulkPostCollectionInfo}
                        className="px-4 py-2 text-sm font-medium text-white transition-colors"
                        style={{ backgroundColor: '#819291' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#6b7a7a'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#819291'
                        }}
                      >
                        Post Collection Info to All
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : invoice ? (
              /* Single Invoice View */
              <>
            {/* Invoice Information */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold" style={{ color: '#113543' }}>
                Invoice Information
              </h3>
              
              <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                <div>
                  <label className="block text-[10px] font-medium mb-0.5" style={{ color: '#819291' }}>
                    Invoice Number
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedInvoice.invoice_number}
                      onChange={(e) => setEditedInvoice({ ...editedInvoice, invoice_number: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-2"
                      style={{
                        borderColor: '#819291',
                        color: '#113543',
                        backgroundColor: '#FFFFFF',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#C2A558'
                        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#819291'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                  ) : (
                    <div className="text-xs font-medium" style={{ color: '#113543' }}>
                      {currentInvoice.invoice_number}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-0.5" style={{ color: '#819291' }}>
                    Load Number
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedInvoice.load_number}
                      onChange={(e) => setEditedInvoice({ ...editedInvoice, load_number: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-2"
                      style={{
                        borderColor: '#819291',
                        color: '#113543',
                        backgroundColor: '#FFFFFF',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#C2A558'
                        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#819291'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                  ) : (
                    <div className="text-xs font-medium" style={{ color: '#113543' }}>
                      {currentInvoice.load_number || '-'}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-0.5" style={{ color: '#819291' }}>
                    Invoice Date
                  </label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editedInvoice.invoice_date}
                      onChange={(e) => setEditedInvoice({ ...editedInvoice, invoice_date: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-2"
                      style={{
                        borderColor: '#819291',
                        color: '#113543',
                        backgroundColor: '#FFFFFF',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#C2A558'
                        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#819291'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                  ) : (
                    <div className="text-xs font-medium" style={{ color: '#113543' }}>
                      {formatDate(currentInvoice.invoice_date)}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-0.5" style={{ color: '#819291' }}>
                    Due Date
                  </label>
                  <div className="text-xs font-medium" style={{ color: '#113543' }}>
                    {formatDate(currentInvoice.due_date)}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-0.5" style={{ color: '#819291' }}>
                    Expected Payment
                  </label>
                  <div className="text-xs font-medium" style={{ color: '#113543' }}>
                    {formatDate(currentInvoice.expected_payment_date)}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-0.5" style={{ color: '#819291' }}>
                    {currentInvoice.days_since_expected !== undefined && currentInvoice.days_since_expected > 0 ? 'Overdue' : 'Due In'}
                  </label>
                  <div 
                    className="text-xs font-medium"
                    style={{ 
                      color: currentInvoice.days_since_expected !== undefined && currentInvoice.days_since_expected > 0 ? '#dc2626' : '#113543' 
                    }}
                  >
                    {currentInvoice.days_since_expected !== undefined ? (
                      currentInvoice.days_since_expected > 0
                        ? `${currentInvoice.days_since_expected} days overdue`
                        : currentInvoice.days_since_expected === 0
                        ? 'Due today'
                        : `Due in ${Math.abs(currentInvoice.days_since_expected)} days`
                    ) : 'N/A'}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-0.5" style={{ color: '#819291' }}>
                    Amount
                  </label>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editedInvoice.amount}
                      onChange={(e) => setEditedInvoice({ ...editedInvoice, amount: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-2"
                      style={{
                        borderColor: '#819291',
                        color: '#113543',
                        backgroundColor: '#FFFFFF',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#C2A558'
                        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#819291'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                  ) : (
                    <div className="text-xs font-medium" style={{ color: '#113543' }}>
                      {formatCurrency(invoice.amount)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Broker Information */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: '#113543' }}>
                Broker Information
              </h3>
                {isBrokerRequired && (
                  <span className="text-xs font-medium" style={{ color: '#C2A558' }}>
                    Required
                  </span>
                )}
              </div>
              
              {/* Warning banner when broker is missing in ready_to_post stage */}
              {isBrokerMissing && (
                <div
                  className="p-3 rounded border"
                  style={{
                    backgroundColor: '#FFF4E6',
                    borderColor: '#C2A558',
                  }}
                >
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#C2A558' }} />
                    <div>
                      <div className="text-sm font-medium" style={{ color: '#113543' }}>
                        Broker Required
                      </div>
                      <div className="text-xs mt-1" style={{ color: '#819291' }}>
                        A broker must be assigned to this invoice before it can proceed to verification. Please edit the invoice and select a broker.
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                <div className="relative">
                  <label className="block text-[10px] font-medium mb-0.5" style={{ color: '#819291' }}>
                    Broker Name
                    {isBrokerRequired && (
                      <span className="ml-1" style={{ color: '#C2A558' }}>*</span>
                    )}
                  </label>
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={brokerSearchTerm || editedInvoice.broker_name}
                        onChange={(e) => {
                          setBrokerSearchTerm(e.target.value)
                          setShowBrokerSuggestions(e.target.value.length > 0)
                          if (!e.target.value) {
                            setEditedInvoice({ ...editedInvoice, broker_id: '', broker_name: '' })
                          }
                        }}
                        placeholder={isBrokerRequired ? "Search or type broker name (Required)" : "Search or type broker name"}
                        className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                        style={{
                          borderColor: isBrokerRequired && !editedInvoice.broker_id ? '#C2A558' : '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                        }}
                        onBlur={(e) => {
                          setTimeout(() => setShowBrokerSuggestions(false), 200)
                          e.currentTarget.style.borderColor = isBrokerRequired && !editedInvoice.broker_id ? '#C2A558' : '#819291'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      />
                      {showBrokerSuggestions && filteredBrokers.length > 0 && (
                        <div
                          className="absolute z-10 w-full mt-1 border rounded shadow-lg max-h-48 overflow-y-auto"
                          style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}
                        >
                          {filteredBrokers.map((b) => (
                            <button
                              key={b.id}
                              onClick={() => handleBrokerSelect(b)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors"
                              style={{ color: '#113543' }}
                            >
                              {b.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm font-medium" style={{ color: currentInvoice.broker_name ? '#113543' : (isBrokerMissing ? '#C2A558' : '#819291') }}>
                      {currentInvoice.broker_name || (isBrokerMissing ? 'Not Assigned - Required' : '-')}
                    </div>
                  )}
                  {isBrokerMissing && !isEditing && (
                    <button
                      onClick={handleEdit}
                      className="mt-2 text-xs font-medium transition-colors"
                      style={{ color: '#C2A558' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#b89547'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#C2A558'
                      }}
                    >
                      Click to assign broker
                    </button>
                  )}
                      </div>
                  {(broker?.phone || (isEditing && editedInvoice.broker_id)) && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#819291' }}>
                        Phone
                      </label>
                      <div className="text-sm font-medium" style={{ color: '#113543' }}>
                        {broker?.phone || '-'}
                      </div>
                    </div>
                  )}
                  {(broker?.email || (isEditing && editedInvoice.broker_id)) && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#819291' }}>
                        Email
                      </label>
                      <div className="text-sm font-medium" style={{ color: '#113543' }}>
                        {broker?.email || '-'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

            {/* Carrier Information */}
            {client && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: '#113543' }}>
                  Carrier Information
                </h3>
                  <button
                    onClick={() => setIsCarrierExpanded(!isCarrierExpanded)}
                    className="flex items-center space-x-1 px-2 py-1 text-sm transition-colors"
                    style={{ color: '#819291' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#113543'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#819291'
                    }}
                  >
                    <span>{isCarrierExpanded ? 'Collapse' : 'Expand'}</span>
                    {isCarrierExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {isCarrierExpanded && (
                <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                  <div className="relative">
                    <label className="block text-xs font-medium mb-1" style={{ color: '#819291' }}>
                      Carrier Name
                    </label>
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={clientSearchTerm || invoice.client_name}
                          onChange={(e) => {
                            setClientSearchTerm(e.target.value)
                            setShowClientSuggestions(e.target.value.length > 0)
                            if (!e.target.value) {
                              // Reset client if search is cleared
                              invoice.client_id = ''
                              invoice.client_name = ''
                            }
                          }}
                          placeholder="Search or type carrier name"
                          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                          }}
                          onBlur={(e) => {
                            setTimeout(() => setShowClientSuggestions(false), 200)
                            e.currentTarget.style.borderColor = '#819291'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                        />
                        {showClientSuggestions && filteredClients.length > 0 && (
                          <div
                            className="absolute z-10 w-full mt-1 border rounded shadow-lg max-h-48 overflow-y-auto"
                            style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}
                          >
                            {filteredClients.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => {
                                  invoice.client_id = c.id
                                  invoice.client_name = c.name
                                  setClientSearchTerm(c.name)
                                  setShowClientSuggestions(false)
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors"
                                style={{ color: '#113543' }}
                              >
                                {c.name}
                              </button>
                            ))}
                    </div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm font-medium" style={{ color: '#113543' }}>
                        {currentInvoice.client_name || '-'}
                    </div>
                  )}
                  </div>
                  {client.phone && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#819291' }}>
                        Phone
                      </label>
                      <div className="text-sm font-medium" style={{ color: '#113543' }}>
                        {client.phone}
                      </div>
                    </div>
                  )}
                  {client.email && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#819291' }}>
                        Email
                      </label>
                      <div className="text-sm font-medium" style={{ color: '#113543' }}>
                        {client.email}
                      </div>
                    </div>
                  )}
                  </div>
                )}
              </div>
            )}

            {/* Collections View - Payment/Callback Information */}
            {isCollectionsView && (
              <>
                <div className="space-y-4 border-t pt-4" style={{ borderColor: '#819291' }}>
                  <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                    Collection Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#819291' }}>
                        Status
                      </label>
                      <select
                        value={collectionStatus}
                        onChange={(e) => {
                          const value = e.target.value as 'C/B' | 'W/P' | ''
                          setCollectionStatus(value)
                        }}
                        className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      >
                        <option value="">Select Status</option>
                        <option value="C/B">C/B - Call Back</option>
                        <option value="W/P">W/P - Will Pay</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#819291' }}>
                        Date
                      </label>
                      <input
                        type="date"
                        value={collectionDate}
                        onChange={(e) => {
                          setCollectionDate(e.target.value)
                        }}
                        className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handlePostCollectionInfo}
                      className="px-4 py-2 text-sm font-medium text-white transition-colors"
                      style={{ backgroundColor: '#819291' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#6b7a7a'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#819291'
                      }}
                    >
                      Post
                    </button>
                  </div>
                </div>

                {/* Close Invoice Section (Collections View Only) */}
                {invoice.status !== 'force_closed' &&
                  invoice.status !== 'written_off' &&
                  invoice.status !== 'paid' && (
                  <div className="space-y-4 border-t pt-4" style={{ borderColor: '#819291' }}>
                    <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                      Close Invoice
                    </h3>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                        Close Type <span style={{ color: '#C2A558' }}>*</span>
                      </label>
                      <select
                        value={closeType}
                        onChange={(e) => {
                          const value = e.target.value as 'Force Close' | 'Write Off' | 'Paid' | ''
                          setCloseType(value)
                          if (value === 'Write Off' && closeAmount >= invoice.amount) {
                            setCloseAmount(invoice.amount * 0.9)
                          } else if (value === 'Force Close') {
                            setCloseAmount(0)
                          } else if (value === 'Paid' && closeAmount < invoice.amount) {
                            setCloseAmount(invoice.amount)
                          }
                        }}
                        className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                        style={{
                          borderColor: !closeType ? '#C2A558' : '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = !closeType ? '#C2A558' : '#819291'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      >
                        <option value="">Select close type</option>
                        <option value="Force Close">Force Close (uncollectable — fee applies)</option>
                        <option value="Write Off">Write Off (short paid — no fee)</option>
                        <option value="Paid">Paid</option>
                      </select>
                      {!closeType && (
                        <p className="text-xs mt-1" style={{ color: '#C2A558' }}>
                          Please select a close type
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                          Invoice Amount
                        </label>
                        <div className="px-3 py-2 border rounded text-sm" style={{
                          borderColor: '#819291',
                          color: '#819291',
                          backgroundColor: '#F5F5F5',
                        }}>
                          ${invoice.amount.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                          Close Amount <span style={{ color: '#C2A558' }}>*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={closeAmount}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0
                            setCloseAmount(value)
                          }}
                          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                          style={{
                            borderColor: !closeAmount || closeAmount <= 0 ? '#C2A558' : '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = (!closeAmount || closeAmount <= 0) ? '#C2A558' : '#819291'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                        />
                        {closeAmount !== invoice.amount && (
                          <p className="text-xs mt-1" style={{ color: closeAmount < invoice.amount ? '#C2A558' : '#819291' }}>
                            {closeAmount < invoice.amount 
                              ? `Short paid by $${(invoice.amount - closeAmount).toFixed(2)}`
                              : `Overpaid by $${(closeAmount - invoice.amount).toFixed(2)}`
                            }
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                        Reason for closing <span style={{ color: '#C2A558' }}>*</span>
                      </label>
                      <textarea
                        value={closeNote}
                        onChange={(e) => setCloseNote(e.target.value)}
                        placeholder="Enter a note explaining why you are closing this invoice..."
                        rows={4}
                        className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                        style={{
                          borderColor: !closeNote.trim() ? '#C2A558' : '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = !closeNote.trim() ? '#C2A558' : '#819291'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      />
                      {!closeNote.trim() && (
                        <p className="text-xs mt-1" style={{ color: '#C2A558' }}>
                          A note is required to close the invoice
                        </p>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={handleCloseInvoice}
                        className="px-4 py-2 text-sm font-medium text-white transition-colors"
                        style={{ 
                          backgroundColor: '#C2A558',
                          opacity: (!closeType || !closeNote.trim() || !closeAmount || closeAmount <= 0) ? 0.6 : 1,
                          cursor: (!closeType || !closeNote.trim() || !closeAmount || closeAmount <= 0) ? 'not-allowed' : 'pointer',
                        }}
                        disabled={!closeType || !closeNote.trim() || !closeAmount || closeAmount <= 0}
                        onMouseEnter={(e) => {
                          if (closeType && closeNote.trim() && closeAmount && closeAmount > 0) {
                            e.currentTarget.style.backgroundColor = '#b89547'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (closeType && closeNote.trim() && closeAmount && closeAmount > 0) {
                            e.currentTarget.style.backgroundColor = '#C2A558'
                          }
                        }}
                      >
                        Close Invoice
                      </button>
                    </div>
                  </div>
                )}

                {/* Show closed status if invoice is already closed */}
                {(currentInvoice.status === 'force_closed' ||
                  currentInvoice.status === 'written_off' ||
                  currentInvoice.status === 'paid') && (
                  <div className="space-y-4 border-t pt-4" style={{ borderColor: '#819291' }}>
                    <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                      Invoice Status
                    </h3>
                    <div
                      className="px-3 py-2 rounded text-sm font-medium"
                      style={{
                        backgroundColor:
                          currentInvoice.status === 'paid'
                            ? '#E8F5E9'
                            : currentInvoice.status === 'written_off'
                              ? '#F3F4F6'
                              : '#FFF3E0',
                        color:
                          currentInvoice.status === 'paid'
                            ? '#2E7D32'
                            : currentInvoice.status === 'written_off'
                              ? '#4B5563'
                              : '#E65100',
                      }}
                    >
                      {currentInvoice.status === 'paid'
                        ? 'Invoice is Paid'
                        : currentInvoice.status === 'written_off'
                          ? 'Invoice Written Off — no collection fee'
                          : 'Invoice Force Closed — collection fee applies'}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Notes */}
            <div>
              <label className="block text-[10px] font-medium mb-0.5" style={{ color: '#113543' }}>
                {stage === 'verification' ? 'Verification Note' : 'Notes'}
              </label>
              <div className="flex items-end gap-1.5">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={stage === 'verification' ? 'Verification note...' : 'Add a note...'}
                  className="flex-1 min-w-0 px-2 py-1 border rounded text-[11px] focus:outline-none focus:ring-2"
                  style={{
                    borderColor: '#819291',
                    color: '#113543',
                    backgroundColor: '#FFFFFF',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#C2A558'
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#819291'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                  rows={2}
                />
                <button
                  onClick={handleAddNote}
                  className="px-2 py-1 text-[10px] font-medium text-white whitespace-nowrap transition-colors"
                  style={{ backgroundColor: '#C2A558' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#b89547'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#C2A558'
                  }}
                >
                  {stage === 'verification' ? 'Add' : 'Add Note'}
                </button>
              </div>

              {currentInvoice.notes_history && currentInvoice.notes_history.length > 0 && (
                <div className="mt-1.5 max-h-28 overflow-y-auto space-y-1">
                  {currentInvoice.notes_history
                    .slice()
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((noteItem) => (
                      <div
                        key={noteItem.id}
                        className="flex items-start gap-1 px-1.5 py-1 border rounded"
                        style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium truncate" style={{ color: '#113543' }}>
                              {noteItem.created_by}
                            </span>
                            <span className="text-[10px] flex-shrink-0" style={{ color: '#819291' }}>
                              {formatDate(noteItem.created_at)}
                            </span>
                          </div>
                          <p className="text-[11px] leading-snug mt-0.5" style={{ color: '#113543' }}>
                            {noteItem.note}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveNote(noteItem.id)}
                          className="p-0.5 flex-shrink-0 transition-colors"
                          style={{ color: '#819291' }}
                          title="Remove note"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#C2A558'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#819291'
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Document Send History */}
            {currentInvoice.document_send_history && currentInvoice.document_send_history.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                  Paperwork Sent History
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {currentInvoice.document_send_history
                    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
                    .map((sendRecord, index) => (
                      <div
                        key={index}
                        className="p-3 border rounded"
                        style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center space-x-2">
                            <Mail className="w-4 h-4" style={{ color: '#819291' }} />
                            <span className="text-xs font-medium" style={{ color: '#113543' }}>
                              {sendRecord.email_address}
                            </span>
                          </div>
                          <span className="text-xs" style={{ color: '#819291' }}>
                            {formatDate(sendRecord.sent_at)}
                          </span>
                        </div>
                        {sendRecord.sent_by && (
                          <div className="text-xs mt-1" style={{ color: '#819291' }}>
                            Sent by: {sendRecord.sent_by}
                          </div>
                        )}
                        {sendRecord.documents_sent && sendRecord.documents_sent.length > 0 && (
                          <div className="text-xs mt-1" style={{ color: '#819291' }}>
                            Documents: {sendRecord.documents_sent.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}


              </>
            ) : (
              <div className="text-center py-12" style={{ color: '#819291' }}>
                <p>Select an invoice to view details</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Document View (only shown for single invoice) */}
        {selectedInvoiceIds.size === 0 && invoice && (
        <div
          className={showThreePanel ? 'w-[45%] overflow-hidden' : 'w-1/2 border-l overflow-hidden'}
          style={{ backgroundColor: '#FFFFFF', borderColor: showThreePanel ? 'transparent' : '#819291' }}
        >
          <div className="h-full flex flex-col">
            {/* Header */}
            <div
              className="border-b px-4 py-3 flex items-center justify-between gap-3"
              style={{ borderColor: '#819291' }}
            >
              <h3 className="text-base font-semibold flex-shrink-0" style={{ color: '#113543' }}>
                Documents
              </h3>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  onClick={handleCreateInvoice}
                  disabled={isCreatingInvoice}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#113543' }}
                  onMouseEnter={(e) => {
                    if (!isCreatingInvoice) {
                      e.currentTarget.style.backgroundColor = '#0d2832'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCreatingInvoice) {
                      e.currentTarget.style.backgroundColor = '#113543'
                    }
                  }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{isCreatingInvoice ? 'Creating...' : 'Create Invoice'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingDocs || isCreatingInvoice}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#C2A558' }}
                  onMouseEnter={(e) => {
                    if (!isUploadingDocs && !isCreatingInvoice) {
                      e.currentTarget.style.backgroundColor = '#b89547'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#C2A558'
                  }}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploadingDocs ? 'Saving…' : 'Upload'}</span>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {/* Document Viewer - Inline */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {documents.length > 0 ? (
                <>
                  {/* Document Navigation */}
                  {documents.length > 1 && (
                    <div
                      className="flex items-center justify-between p-4 border-b"
                      style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}
                    >
                      <button
                        onClick={handlePreviousDocument}
                        disabled={currentDocumentIndex === 0}
                        className="flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          color: currentDocumentIndex === 0 ? '#819291' : '#113543',
                          border: '1px solid #819291',
                          backgroundColor: '#FFFFFF',
                        }}
                        onMouseEnter={(e) => {
                          if (currentDocumentIndex > 0) {
                            e.currentTarget.style.borderColor = '#C2A558'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (currentDocumentIndex > 0) {
                            e.currentTarget.style.borderColor = '#819291'
                          }
                        }}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Previous</span>
                      </button>

                      <div className="flex items-center space-x-2 flex-1 justify-center overflow-x-auto px-2">
                        {documents.map((doc, idx) => (
                          <div
                            key={doc.id}
                            draggable
                            onDragStart={() => handleDragStart(idx)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, idx)}
                            onDragEnd={handleDragEnd}
                            className="flex items-center space-x-1"
                            style={{
                              opacity: draggedIndex === idx ? 0.5 : 1,
                              borderTop: dragOverIndex === idx ? '2px solid #C2A558' : 'none',
                              borderBottom: dragOverIndex === idx ? '2px solid #C2A558' : 'none',
                            }}
                          >
                            <GripVertical 
                              className="w-3 h-3 cursor-move" 
                              style={{ color: '#819291' }}
                            />
                            <button
                              onClick={() => setCurrentDocumentIndex(idx)}
                              className="px-3 py-1 text-xs font-medium rounded transition-colors flex items-center space-x-1"
                              style={{
                                backgroundColor: idx === currentDocumentIndex ? '#113543' : '#FFFFFF',
                                color: idx === currentDocumentIndex ? '#FFFFFF' : '#113543',
                                border: '1px solid #819291',
                              }}
                              onMouseEnter={(e) => {
                                if (idx !== currentDocumentIndex) {
                                  e.currentTarget.style.backgroundColor = '#f8f9fa'
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (idx !== currentDocumentIndex) {
                                  e.currentTarget.style.backgroundColor = '#FFFFFF'
                                }
                              }}
                            >
                              <FileText className="w-3 h-3" />
                              <span>{doc.name.length > 12 ? doc.name.substring(0, 12) + '...' : doc.name}</span>
                            </button>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={handleNextDocument}
                        disabled={currentDocumentIndex === documents.length - 1}
                        className="flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          color: currentDocumentIndex === documents.length - 1 ? '#819291' : '#113543',
                          border: '1px solid #819291',
                          backgroundColor: '#FFFFFF',
                        }}
                        onMouseEnter={(e) => {
                          if (currentDocumentIndex < documents.length - 1) {
                            e.currentTarget.style.borderColor = '#C2A558'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (currentDocumentIndex < documents.length - 1) {
                            e.currentTarget.style.borderColor = '#819291'
                          }
                        }}
                      >
                        <span>Next</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Document Counter */}
                  <div className="px-6 py-2 border-b flex items-center justify-between" style={{ borderColor: '#819291' }}>
                    <div className="text-sm" style={{ color: '#819291' }}>
                      {currentDocumentIndex + 1} of {documents.length}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleDownload}
                        className="p-2 transition-colors"
                        style={{ color: '#819291' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#113543'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#819291'
                        }}
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (currentDocument) {
                            handleDeleteDocument(currentDocument.id)
                          }
                        }}
                        className="p-2 transition-colors"
                        style={{ color: '#819291' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#dc2626'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#819291'
                        }}
                        title="Delete Current Document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handlePrint}
                        className="p-2 transition-colors"
                        style={{ color: '#819291' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#113543'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#819291'
                        }}
                        title="Print"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleSendEmail}
                        className="p-2 transition-colors"
                        style={{ color: '#819291' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#113543'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#819291'
                        }}
                        title="Send All Documents via Email"
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Document Preview */}
                  <div className="flex-1 overflow-auto p-6" style={{ backgroundColor: '#f8f9fa' }}>
                    {currentDocument ? (
                      <div className="flex items-center justify-center h-full w-full">
                        {currentDocument.file && documentUrls.has(currentDocument.id) ? (
                          <>
                            {getFileType(currentDocument.name) === 'pdf' ? (
                              <iframe
                                src={documentUrls.get(currentDocument.id)}
                                className="w-full h-full border-0"
                                style={{ minHeight: '500px' }}
                                title={currentDocument.name}
                              />
                            ) : getFileType(currentDocument.name) === 'image' ? (
                              <div className="flex items-center justify-center w-full h-full">
                                <img
                                  src={documentUrls.get(currentDocument.id)}
                                  alt={currentDocument.name}
                                  className="max-w-full max-h-full object-contain"
                                  style={{ maxHeight: 'calc(100vh - 300px)' }}
                                />
                              </div>
                            ) : (
                              <div className="text-center w-full">
                                <FileText className="w-24 h-24 mx-auto mb-4" style={{ color: '#819291' }} />
                                <p className="text-sm font-medium mb-2" style={{ color: '#113543' }}>
                                  {currentDocument.name}
                                </p>
                                <p className="text-xs mb-4" style={{ color: '#819291' }}>
                                  Preview not available for this file type
                                </p>
                                <button
                                  onClick={handleDownload}
                                  className="px-4 py-2 text-sm font-medium text-white transition-colors"
                                  style={{ backgroundColor: '#819291' }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#6b7a7a'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#819291'
                                  }}
                                >
                                  Download to View
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-center">
                            <FileText className="w-24 h-24 mx-auto mb-4" style={{ color: '#819291' }} />
                            <p className="text-sm font-medium mb-2" style={{ color: '#113543' }}>
                              {currentDocument.name}
                            </p>
                            <p className="text-xs" style={{ color: '#819291' }}>
                              Document preview not available
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <FileText className="w-16 h-16 mx-auto mb-4" style={{ color: '#819291' }} />
                          <p className="text-sm" style={{ color: '#819291' }}>
                            No document selected
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full px-6">
                  <div className="text-center max-w-sm">
                    <FileText className="w-16 h-16 mx-auto mb-4" style={{ color: '#819291' }} />
                    {currentInvoice && invoiceDocumentsMissingFromStore(currentInvoice) ? (
                      <>
                        <p className="text-sm font-medium mb-1" style={{ color: '#113543' }}>
                          Documents not loaded
                        </p>
                        <p className="text-xs" style={{ color: '#819291' }}>
                          Files are stored in memory during this session. Refreshing the page clears
                          them — use Upload to re-attach, or re-create the batch.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm" style={{ color: '#819291' }}>
                        No documents available. Upload PDFs or run AI batch upload with paperwork
                        attached.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Contact Broker Modal */}
      {showContactBrokerModal && broker && (
        <ContactBrokerModal
          broker={broker}
          invoiceNumber={invoice.invoice_number}
          onClose={() => setShowContactBrokerModal(false)}
          onCall={() => {
            console.log('Calling broker for invoice:', invoice.id)
          }}
          onEmail={() => {
            console.log('Emailing broker for invoice:', invoice.id)
          }}
        />
      )}

      {/* Contact Carrier Modal */}
      {showContactCarrierModal && client && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="relative rounded-lg shadow-xl max-w-2xl w-full"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <div
                className="sticky top-0 border-b px-6 py-4 flex items-center justify-between"
                style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}
              >
                <div>
                  <h2 className="text-xl font-bold" style={{ color: '#113543' }}>
                    Contact Carrier
                  </h2>
                  {invoice.invoice_number && (
                    <p className="text-sm mt-1" style={{ color: '#819291' }}>
                      Invoice: {invoice.invoice_number}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowContactCarrierModal(false)}
                  className="p-2 transition-colors"
                  style={{ color: '#819291' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>
                    {client.name}
                  </h3>
                </div>

                <div className="space-y-4">
                  {client.phone && (
                    <div
                      className="flex items-center justify-between p-4 border rounded"
                      style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}
                    >
                      <div className="flex items-center space-x-3">
                        <Phone className="w-5 h-5" style={{ color: '#819291' }} />
                        <div>
                          <div className="text-sm font-medium" style={{ color: '#113543' }}>
                            Phone
                          </div>
                          <div className="text-lg font-semibold" style={{ color: '#113543' }}>
                            {client.phone}
                          </div>
                        </div>
                      </div>
                      <a
                        href={`tel:${client.phone}`}
                        className="px-4 py-2 text-sm font-medium text-white transition-colors"
                        style={{ backgroundColor: '#C2A558' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#b89547'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#C2A558'
                        }}
                      >
                        Call
                      </a>
                    </div>
                  )}

                  {client.email && (
                    <div
                      className="flex items-center justify-between p-4 border rounded"
                      style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}
                    >
                      <div className="flex items-center space-x-3">
                        <Mail className="w-5 h-5" style={{ color: '#819291' }} />
                        <div>
                          <div className="text-sm font-medium" style={{ color: '#113543' }}>
                            Email
                          </div>
                          <div className="text-lg font-semibold" style={{ color: '#113543' }}>
                            {client.email}
                          </div>
                        </div>
                      </div>
                      <a
                        href={`mailto:${client.email}${invoice.invoice_number ? `?subject=Invoice ${invoice.invoice_number}` : ''}`}
                        className="px-4 py-2 text-sm font-medium text-white transition-colors"
                        style={{ backgroundColor: '#C2A558' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#b89547'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#C2A558'
                        }}
                      >
                        Email
                      </a>
                    </div>
                  )}

                  {client.address && (
                    <div
                      className="p-4 border rounded"
                      style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}
                    >
                      <div className="flex items-start space-x-3">
                        <User className="w-5 h-5 mt-0.5" style={{ color: '#819291' }} />
                        <div>
                          <div className="text-sm font-medium mb-1" style={{ color: '#113543' }}>
                            Address
                          </div>
                          <div className="text-sm" style={{ color: '#113543' }}>
                            {client.address}
                            {client.city && `, ${client.city}`}
                            {client.state && `, ${client.state}`}
                            {client.zip && ` ${client.zip}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-[70] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="relative rounded-lg shadow-xl max-w-2xl w-full"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <div
                className="sticky top-0 border-b px-6 py-4 flex items-center justify-between"
                style={{ borderColor: '#819291', backgroundColor: '#FFFFFF' }}
              >
                <div>
                  <h2 className="text-xl font-bold" style={{ color: '#113543' }}>
                    Send Documents via Email
                  </h2>
                  <p className="text-sm mt-1" style={{ color: '#819291' }}>
                    Invoice {invoice.invoice_number}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowEmailModal(false)
                    setEmailRecipient('')
                    setEmailSubject('')
                    setEmailMessage('')
                  }}
                  className="p-2 transition-colors"
                  style={{ color: '#819291' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Documents to Send */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                    Documents to Send ({documents.length})
                  </label>
                  <div
                    className="p-3 border rounded max-h-32 overflow-y-auto"
                    style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}
                  >
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center space-x-2 mb-2 last:mb-0">
                        <FileText className="w-4 h-4" style={{ color: '#819291' }} />
                        <span className="text-sm" style={{ color: '#113543' }}>
                          {doc.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recipient Email */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                    Recipient Email <span style={{ color: '#C2A558' }}>*</span>
                  </label>
                  {broker?.emails && broker.emails.length > 0 ? (
                    <select
                      value={selectedEmailIndex !== null ? selectedEmailIndex.toString() : ''}
                      onChange={(e) => {
                        const index = parseInt(e.target.value)
                        setSelectedEmailIndex(index)
                        setEmailRecipient(broker.emails![index].email)
                      }}
                      className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                      style={{
                        borderColor: '#819291',
                        color: '#113543',
                        backgroundColor: '#FFFFFF',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#C2A558'
                        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#819291'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      {broker.emails.map((emailItem, index) => (
                        <option key={index} value={index.toString()}>
                          {emailItem.email} ({emailItem.category})
                        </option>
                      ))}
                    </select>
                  ) : (
                  <input
                    type="email"
                    value={emailRecipient}
                    onChange={(e) => setEmailRecipient(e.target.value)}
                    placeholder="recipient@example.com"
                    className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                    style={{
                      borderColor: '#819291',
                      color: '#113543',
                      backgroundColor: '#FFFFFF',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#C2A558'
                      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#819291'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  )}
                </div>

                {/* Email Subject */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                    Subject
                  </label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Email subject"
                    className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                    style={{
                      borderColor: '#819291',
                      color: '#113543',
                      backgroundColor: '#FFFFFF',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#C2A558'
                      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#819291'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>

                {/* Email Message */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                    Message
                  </label>
                  <textarea
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    placeholder="Email message..."
                    className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                    style={{
                      borderColor: '#819291',
                      color: '#113543',
                      backgroundColor: '#FFFFFF',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#C2A558'
                      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#819291'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                    rows={5}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-3 pt-4 border-t" style={{ borderColor: '#819291' }}>
                  <button
                    onClick={() => {
                      setShowEmailModal(false)
                      setEmailRecipient('')
                      setEmailSubject('')
                      setEmailMessage('')
                    }}
                    className="px-4 py-2 text-sm font-medium transition-colors border rounded"
                    style={{
                      color: '#113543',
                      backgroundColor: '#FFFFFF',
                      borderColor: '#819291',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f8f9fa'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#FFFFFF'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEmailSubmit}
                    className="px-4 py-2 text-sm font-medium text-white transition-colors"
                    style={{ backgroundColor: '#C2A558' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#b89547'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#C2A558'
                    }}
                  >
                    Send Email
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

