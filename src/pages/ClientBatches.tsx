import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { mockClientDashboardData } from '../data/mockClientDashboard'
import { getAllBatches } from '../data/mockBatches'
import { mockBrokers } from '../data/mockBrokers'
import { getInvoicesByBatchId } from '../data/mockInvoices'
import BatchAiUploadFlow from '../components/client/BatchAiUploadFlow'
import { submitManualBatch } from '../services/credyx/submitManualBatch'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/format'
import { FileText, Calendar, DollarSign, Plus, Trash2, Upload, X, Eye } from 'lucide-react'
import { generateInvoice } from '../../pdfTemplate'
import jsPDF from 'jspdf'
import DocumentViewer from '../components/DocumentViewer'
import ClientLayout from '../components/ClientLayout'
import DocumentReviewResults from '../components/client/DocumentReviewResults'
import InvoiceDetailWorkspace from '../components/client/InvoiceDetailWorkspace'
import { Invoice, InvoiceDispute, InvoiceNote } from '../types/invoice'
import {
  addClientInvoiceNote,
  openClientInvoiceDispute,
  markClientInvoiceAsPaid,
  buildPaymentConfirmationNote,
  getDisputeReasonLabel,
  type ClientMarkPaidOptions,
} from '../services/clientInvoiceActions'
import { getInvoiceById } from '../data/mockInvoices'
import { isAIReviewEnabled, reviewUploadedDocuments } from '../services/documentReviewService'
import { BatchDocumentReviewResult } from '../types/documentReview'
import { clientTheme as c } from '../theme/clientTheme'

type ClientBatchRow = {
  id: string
  batch_number: string
  total_invoices: number
  total_amount: number
  submitted_at: string
  status: string
  reviewed_at: string | null
  upload_mode?: string
}

interface InvoiceDocument {
  id: string
  name: string
  file: File
  size: number
}

interface InvoiceFormData {
  invoice_number: string
  load_number: string
  broker_name: string
  broker_address: string
  amount: string
  invoice_date: string
  notes: string
  documents?: InvoiceDocument[]
}

function formInvoiceToInvoice(
  form: InvoiceFormData,
  batchId: string,
  index: number,
  clientId: string,
  clientName: string,
  batchNumber?: string
): Invoice {
  return {
    id: `batch-form-${batchId}-${index}`,
    invoice_number: form.invoice_number,
    client_id: clientId,
    client_name: clientName,
    broker_id: '',
    broker_name: form.broker_name,
    amount: parseFloat(form.amount || '0'),
    invoice_date: form.invoice_date || new Date().toISOString().split('T')[0],
    due_date: '',
    expected_payment_date: '',
    status: 'pending',
    load_number: form.load_number,
    batch_id: batchId,
    batch_number: batchNumber,
    created_at: new Date().toISOString(),
    notes: form.notes,
    documents_count: form.documents?.length || 0,
  }
}

function mergeInvoiceExtras(invoice: Invoice, extras?: Partial<Invoice>): Invoice {
  if (!extras) return invoice
  return {
    ...invoice,
    notes_history: extras.notes_history ?? invoice.notes_history,
    disputes: extras.disputes ?? invoice.disputes,
  }
}

export default function ClientBatches() {
  const [data] = useState(mockClientDashboardData)
  const [batches, setBatches] = useState<ClientBatchRow[]>([])
  const [createSubMode, setCreateSubMode] = useState<'choose' | 'ai' | 'manual'>('choose')
  const [dashboardAiFiles, setDashboardAiFiles] = useState<File[] | undefined>(undefined)

  const refreshBatches = useCallback(() => {
    const rows = getAllBatches()
      .filter((b) => b.client_id === data.client_id)
      .map((b) => ({
        id: b.id,
        batch_number: b.batch_number,
        total_invoices: b.total_invoices,
        total_amount: b.total_amount,
        submitted_at: b.submitted_at,
        status: b.status,
        reviewed_at: b.reviewed_at ?? null,
        upload_mode: b.upload_mode,
      }))
    setBatches(rows)
  }, [data.client_id])

  useEffect(() => {
    refreshBatches()
  }, [refreshBatches])

  const [selectedBatch, setSelectedBatch] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [highlightedBatchId, setHighlightedBatchId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'create' | 'view'>(() => {
    // Check URL parameter for tab
    const tabParam = searchParams.get('tab')
    return tabParam === 'create' ? 'create' : 'view'
  })
  const [currentBatchInvoices, setCurrentBatchInvoices] = useState<InvoiceFormData[]>([])
  const [invoiceFormData, setInvoiceFormData] = useState<InvoiceFormData>({
    invoice_number: '',
    load_number: '',
    broker_name: '',
    broker_address: '',
    amount: '',
    invoice_date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  // Auto-generate invoice number when form is ready or when invoices change
  useEffect(() => {
    if (!invoiceFormData.invoice_number && currentBatchInvoices.length === 0) {
      const year = new Date().getFullYear()
      setInvoiceFormData((prev) => ({
        ...prev,
        invoice_number: `INV-${year}-001`,
      }))
    }
  }, [currentBatchInvoices.length])

  useEffect(() => {
    const mode = searchParams.get('mode')
    const state = location.state as { initialFiles?: File[] } | null
    if (mode === 'ai') {
      setActiveTab('create')
      setCreateSubMode('ai')
      if (state?.initialFiles?.length) {
        setDashboardAiFiles(state.initialFiles)
      }
      searchParams.delete('mode')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams, location.state])

  // Check for highlight parameter from notification
  useEffect(() => {
    const highlightBatchId = searchParams.get('highlight_batch')
    if (highlightBatchId) {
      setHighlightedBatchId(highlightBatchId)
      // Remove the parameter from URL
      searchParams.delete('highlight_batch')
      setSearchParams(searchParams, { replace: true })
      
      // Remove highlight after 3 seconds (flashing effect)
      const timer = setTimeout(() => {
        setHighlightedBatchId(null)
      }, 3000)
      
      return () => clearTimeout(timer)
    }
  }, [searchParams, setSearchParams])

  const [brokerSuggestions, setBrokerSuggestions] = useState<typeof mockBrokers>([])
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false)
  const [showDocumentUploadModal, setShowDocumentUploadModal] = useState(false)
  const [showDocumentViewer, setShowDocumentViewer] = useState(false)
  const [showInvoiceDetailView, setShowInvoiceDetailView] = useState(false)
  const [selectedBatchInvoiceId, setSelectedBatchInvoiceId] = useState<string | null>(null)
  const [currentInvoiceForDocuments, setCurrentInvoiceForDocuments] = useState<InvoiceFormData | null>(null)
  const [currentInvoiceIndex, setCurrentInvoiceIndex] = useState<number | null>(null)
  const [uploadedDocuments, setUploadedDocuments] = useState<InvoiceDocument[]>([])
  const [documentReviewResult, setDocumentReviewResult] = useState<BatchDocumentReviewResult | null>(null)
  const [isReviewingDocuments, setIsReviewingDocuments] = useState(false)
  const [documentReviewError, setDocumentReviewError] = useState<string | null>(null)
  const [isEditingExistingInvoice, setIsEditingExistingInvoice] = useState(false)
  const [viewingInvoiceDocuments, setViewingInvoiceDocuments] = useState<InvoiceFormData | null>(null)
  const [batchInvoices, setBatchInvoices] = useState<Record<string, InvoiceFormData[]>>({})
  const [invoiceExtras, setInvoiceExtras] = useState<Record<string, Partial<Invoice>>>({})
  const [invoicesRefreshKey, setInvoicesRefreshKey] = useState(0)

  useEffect(() => {
    setShowInvoiceDetailView(false)
    setSelectedBatchInvoiceId(null)
  }, [selectedBatch])

  // Update tab when URL parameter changes
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'create' && activeTab !== 'create') {
      setActiveTab('create')
    }
  }, [searchParams])

  const getStatusBadge = (status: string) => {
    const submitted = ['submitted', 'processing']
    const inReview = ['verification', 'approval']
    if (submitted.includes(status)) {
      return <span className="status-pill status-pill--submitted">Submitted</span>
    }
    if (inReview.includes(status)) {
      return <span className="status-pill status-pill--review">In review</span>
    }
    return <span className="status-pill status-pill--pending-batch">Pending</span>
  }

  const generateNextInvoiceNumber = () => {
    const year = new Date().getFullYear()
    // If there are existing invoices, find the highest number and increment
    if (currentBatchInvoices.length > 0) {
      const invoiceNumbers = currentBatchInvoices
        .map((inv) => inv.invoice_number)
        .filter((num) => num && num.match(/^INV-\d{4}-(\d+)$/))
        .map((num) => {
          const match = num.match(/^INV-\d{4}-(\d+)$/)
          return match ? parseInt(match[1], 10) : 0
        })
      
      if (invoiceNumbers.length > 0) {
        const maxNumber = Math.max(...invoiceNumbers)
        return `INV-${year}-${String(maxNumber + 1).padStart(3, '0')}`
      }
    }
    // Otherwise start from 1
    return `INV-${year}-001`
  }

  const handleInvoiceInputChange = (field: keyof InvoiceFormData, value: string) => {
    setInvoiceFormData((prev) => ({ ...prev, [field]: value }))
    
    // Auto-complete broker suggestions when typing broker name
    if (field === 'broker_name') {
      if (value.trim()) {
        const filtered = mockBrokers.filter((broker) =>
          broker.name.toLowerCase().includes(value.toLowerCase())
        )
        setBrokerSuggestions(filtered)
        setShowBrokerSuggestions(filtered.length > 0)
      } else {
        setBrokerSuggestions([])
        setShowBrokerSuggestions(false)
      }
    }
  }

  const handleBrokerSelect = (broker: typeof mockBrokers[0]) => {
    const address = broker.address
      ? `${broker.address}${broker.city ? `, ${broker.city}` : ''}${broker.state ? `, ${broker.state}` : ''}${broker.zip ? ` ${broker.zip}` : ''}`.trim()
      : ''
    
    setInvoiceFormData((prev) => ({
      ...prev,
      broker_name: broker.name,
      broker_address: address,
    }))
    setShowBrokerSuggestions(false)
  }

  const handleAddInvoice = () => {
    if (!invoiceFormData.broker_name || !invoiceFormData.broker_address || !invoiceFormData.amount) {
      alert('Broker name, broker address, and amount are required')
      return
    }

    // Use the invoice number from form (which may have been edited)
    const invoiceNumber = invoiceFormData.invoice_number || generateNextInvoiceNumber()

    // Store the invoice data temporarily to show in upload modal
    const invoiceToAdd: InvoiceFormData = {
      ...invoiceFormData,
      invoice_number: invoiceNumber,
      documents: [],
    }

    // Show document upload modal
    setCurrentInvoiceForDocuments(invoiceToAdd)
    setUploadedDocuments([])
    setDocumentReviewResult(null)
    setDocumentReviewError(null)
    setShowDocumentUploadModal(true)
  }

  const handleDocumentUploadComplete = async () => {
    if (!currentInvoiceForDocuments) return

    // Generate PDF invoice automatically
    let pdfDocument: InvoiceDocument | null = null
    try {
      const pdfFile = await generatePDFInvoice(currentInvoiceForDocuments)
      pdfDocument = {
        id: `pdf-${Date.now()}`,
        name: pdfFile.name,
        file: pdfFile,
        size: pdfFile.size,
      }
    } catch (error) {
      console.error('Error generating PDF invoice:', error)
      // Continue without PDF if generation fails
    }

    // Combine PDF with uploaded documents
    const allDocuments = pdfDocument 
      ? [pdfDocument, ...uploadedDocuments]
      : uploadedDocuments

    if (isEditingExistingInvoice && currentInvoiceIndex !== null) {
      // Update existing invoice with documents
      setCurrentBatchInvoices((prev) => {
        const updated = [...prev]
        updated[currentInvoiceIndex] = {
          ...updated[currentInvoiceIndex],
          documents: allDocuments,
        }
        return updated
      })
    } else {
      // Add new invoice with documents to batch
      const invoiceWithDocuments: InvoiceFormData = {
        ...currentInvoiceForDocuments,
        documents: allDocuments,
      }

      setCurrentBatchInvoices((prev) => [...prev, invoiceWithDocuments])
      
      // Generate next invoice number for the new form based on highest existing number
      const nextInvoiceNumber = generateNextInvoiceNumber()
      
      setInvoiceFormData({
        invoice_number: nextInvoiceNumber,
        load_number: '',
        broker_name: '',
        broker_address: '',
        amount: '',
        invoice_date: new Date().toISOString().split('T')[0],
        notes: '',
      })
    }
    
    setShowBrokerSuggestions(false)
    setShowDocumentUploadModal(false)
    setCurrentInvoiceForDocuments(null)
    setCurrentInvoiceIndex(null)
    setUploadedDocuments([])
    setIsEditingExistingInvoice(false)
  }

  const handleDocumentUploadSkip = async () => {
    if (!currentInvoiceForDocuments) return

    if (isEditingExistingInvoice) {
      // Just close the modal, don't modify the invoice
      setShowDocumentUploadModal(false)
      setCurrentInvoiceForDocuments(null)
      setCurrentInvoiceIndex(null)
      setUploadedDocuments([])
      setIsEditingExistingInvoice(false)
      return
    }

    // Generate PDF invoice automatically even when skipping document upload
    let pdfDocument: InvoiceDocument | null = null
    try {
      const pdfFile = await generatePDFInvoice(currentInvoiceForDocuments)
      pdfDocument = {
        id: `pdf-${Date.now()}`,
        name: pdfFile.name,
        file: pdfFile,
        size: pdfFile.size,
      }
    } catch (error) {
      console.error('Error generating PDF invoice:', error)
      // Continue without PDF if generation fails
    }

    // Add invoice with PDF (if generated) to batch
    const invoiceToAdd: InvoiceFormData = {
      ...currentInvoiceForDocuments,
      documents: pdfDocument ? [pdfDocument] : [],
    }
    
    setCurrentBatchInvoices((prev) => [...prev, invoiceToAdd])
    
    // Generate next invoice number for the new form based on highest existing number
    const nextInvoiceNumber = generateNextInvoiceNumber()
    
    setInvoiceFormData({
      invoice_number: nextInvoiceNumber,
      load_number: '',
      broker_name: '',
      broker_address: '',
      amount: '',
      invoice_date: new Date().toISOString().split('T')[0],
      notes: '',
    })
    setShowBrokerSuggestions(false)
    setShowDocumentUploadModal(false)
    setCurrentInvoiceForDocuments(null)
    setCurrentInvoiceIndex(null)
    setUploadedDocuments([])
    setIsEditingExistingInvoice(false)
  }

  const handleUploadDocumentsForInvoice = (invoice: InvoiceFormData, index: number) => {
    setCurrentInvoiceForDocuments(invoice)
    setCurrentInvoiceIndex(index)
    setUploadedDocuments(invoice.documents || [])
    setIsEditingExistingInvoice(true)
    setShowDocumentUploadModal(true)
  }

  const handleViewDocuments = (invoice: InvoiceFormData) => {
    setViewingInvoiceDocuments(invoice)
    setShowDocumentViewer(true)
  }

  // Convert invoice documents to DocumentViewer format
  const getDocumentsForInvoice = (invoice: InvoiceFormData) => {
    if (!invoice.documents || invoice.documents.length === 0) return []
    return invoice.documents.map((doc) => ({
      id: doc.id,
      name: doc.name,
      file: doc.file,
      type: doc.file.type,
      size: doc.size,
    }))
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

  // Check if file is an image
  const isImageFile = (file: File): boolean => {
    const imageTypes = ['image/png', 'image/jpeg', 'image/jpg']
    return imageTypes.includes(file.type.toLowerCase())
  }

  // Process files and convert images to PDF
  const processFiles = async (files: FileList | File[]): Promise<InvoiceDocument[]> => {
    const fileArray = Array.from(files)
    const processedDocuments: InvoiceDocument[] = []

    for (const file of fileArray) {
      if (isImageFile(file)) {
        try {
          const pdfFile = await convertImageToPDF(file)
          processedDocuments.push({
            id: `doc-${Date.now()}-${Math.random()}`,
            name: pdfFile.name,
            file: pdfFile,
            size: pdfFile.size,
          })
        } catch (error) {
          console.error('Error converting image to PDF:', error)
          // Fallback to original file if conversion fails
          processedDocuments.push({
            id: `doc-${Date.now()}-${Math.random()}`,
            name: file.name,
            file: file,
            size: file.size,
          })
        }
      } else {
        // For non-image files, add as-is
        processedDocuments.push({
          id: `doc-${Date.now()}-${Math.random()}`,
          name: file.name,
          file: file,
          size: file.size,
        })
      }
    }

    return processedDocuments
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const processedDocuments = await processFiles(files)
    setUploadedDocuments((prev) => [...prev, ...processedDocuments])
    setDocumentReviewResult(null)
    setDocumentReviewError(null)
    // Reset input to allow selecting the same file again
    e.target.value = ''
  }

  const handleRemoveDocument = (docId: string) => {
    setUploadedDocuments((prev) => prev.filter((doc) => doc.id !== docId))
    setDocumentReviewResult(null)
    setDocumentReviewError(null)
  }

  const handleRunDocumentReview = async () => {
    if (uploadedDocuments.length === 0) {
      alert('Upload at least one document to review')
      return
    }

    setIsReviewingDocuments(true)
    setDocumentReviewError(null)
    setDocumentReviewResult(null)

    try {
      const result = await reviewUploadedDocuments(
        uploadedDocuments.map((doc) => ({
          id: doc.id,
          name: doc.name,
          file: doc.file,
        }))
      )
      setDocumentReviewResult(result)
    } catch (error) {
      console.error('Document review failed:', error)
      setDocumentReviewError(
        error instanceof Error ? error.message : 'AI document review failed. Please try again.'
      )
    } finally {
      setIsReviewingDocuments(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  // Generate PDF invoice file
  const generatePDFInvoice = async (invoice: InvoiceFormData): Promise<File> => {
    // Get client information from dashboard data
    const clientName = mockClientDashboardData.client_name
    const clientAddress = `${mockClientDashboardData.client_name}\nAddress information here` // You can enhance this with actual client data
    
    // Load logo and convert to base64
    let logoBase64: string | undefined = undefined
    try {
      // In Vite, public assets are served from root, so try /Logo.png first
      const logoPaths = [
        '/Logo.png', // Vite public folder
      ]
      
      console.log('Attempting to load logo...')
      for (const path of logoPaths) {
        try {
          console.log('Trying logo path:', path)
          const response = await fetch(path)
          
          // Check if response is actually an image
          const contentType = response.headers.get('content-type') || ''
          if (!contentType.startsWith('image/')) {
            console.log('Logo not found at:', path, 'Content-Type:', contentType)
            continue
          }
          
          if (response.ok) {
            const blob = await response.blob()
            
            // Double-check it's actually an image blob
            if (!blob.type.startsWith('image/')) {
              console.log('Response is not an image, type:', blob.type)
              continue
            }
            
            logoBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onloadend = () => {
                const result = reader.result as string
                if (result && result.startsWith('data:image')) {
                  console.log('✓ Logo loaded successfully from:', path, 'Size:', result.length)
                  resolve(result)
                } else {
                  reject(new Error('Invalid image data'))
                }
              }
              reader.onerror = () => reject(new Error('FileReader error'))
              reader.readAsDataURL(blob)
            })
            if (logoBase64) {
              break
            }
          } else {
            console.log('Logo not found at:', path, 'Status:', response.status)
          }
        } catch (err) {
          console.log('Error loading logo from', path, ':', err)
          // Try next path
          continue
        }
      }
      
      if (!logoBase64) {
        console.warn('⚠️ Logo not found. Please place Logo.png in the public/ folder. PDF will be generated without logo.')
      }
    } catch (error) {
      console.error('Error loading logo:', error)
      // Continue without logo if it fails
    }
    
    // Generate invoice HTML
    const invoiceHTML = generateInvoice({
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date || new Date().toISOString().split('T')[0],
      invoiceAmount: parseFloat(invoice.amount || '0'),
      loadNumber: invoice.load_number,
      brokerName: invoice.broker_name,
      brokerAddress: invoice.broker_address,
      carrierName: clientName,
      clientName: clientName,
      clientAddress: clientAddress,
      remittanceInfo: 'All payments should be sent to the carrier listed above. Please include invoice number on all payments.',
      bankName: 'Bank Name', // You can get this from client data
      accountNumber: '****1234', // You can get this from client data
      routingNumber: '123456789', // You can get this from client data
      charges: [
        {
          description: 'Linehaul',
          amount: parseFloat(invoice.amount || '0'),
        },
      ],
      logoBase64: logoBase64,
    })

    // Create a temporary iframe to render the HTML with proper styling
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.left = '-9999px'
    iframe.style.width = '800px'
    iframe.style.height = '2000px' // Increased height to ensure footer is captured
    iframe.style.border = 'none'
    iframe.style.overflow = 'visible'
    document.body.appendChild(iframe)

    // Wait for iframe to load
    await new Promise((resolve) => {
      iframe.onload = resolve
      iframe.src = 'about:blank'
    })

    // Write HTML to iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) {
      throw new Error('Could not access iframe document')
    }

    iframeDoc.open()
    iframeDoc.write(invoiceHTML)
    iframeDoc.close()

    // Wait for images to load in iframe and ensure they're visible
    await new Promise((resolve) => {
      setTimeout(() => {
        const images = iframeDoc.getElementsByTagName('img')
        let loadedCount = 0
        const totalImages = images.length

        if (totalImages === 0) {
          setTimeout(resolve, 300)
          return
        }

        const checkComplete = () => {
          loadedCount++
          if (loadedCount === totalImages) {
            setTimeout(resolve, 500) // Additional delay to ensure rendering
          }
        }

        Array.from(images).forEach((img) => {
          // Skip if image src is HTML (404 response that returns index.html)
          if (img.src && (img.src.startsWith('data:text/html') || img.src.includes('text/html'))) {
            console.warn('Skipping invalid image (HTML response):', img.src.substring(0, 100))
            checkComplete()
            return
          }
          
          // Ensure images are visible
          img.style.display = 'block'
          img.style.visibility = 'visible'
          img.style.opacity = '1'
          img.style.maxHeight = '70px'
          img.style.maxWidth = '200px'
          
          // For base64 images, they should already be loaded
          if (img.src && img.src.startsWith('data:image')) {
            if (img.complete) {
              checkComplete()
            } else {
              img.onload = checkComplete
              img.onerror = () => {
                console.warn('Base64 image failed to load')
                checkComplete()
              }
            }
          } else {
            img.crossOrigin = 'anonymous'
            if (img.complete && img.naturalHeight !== 0) {
              checkComplete()
            } else {
              img.onload = checkComplete
              img.onerror = () => {
                console.warn('Image failed to load:', img.src.substring(0, 50))
                checkComplete()
              }
            }
          }
        })
      }, 100)
    })

    // Get the container element from iframe
    const container = iframeDoc.querySelector('.container') as HTMLElement
    if (!container) {
      throw new Error('Could not find container element')
    }

    // Ensure container has proper dimensions
    container.style.minHeight = 'auto'
    container.style.height = 'auto'

    // Use html2canvas to convert HTML to canvas, then to PDF
    const { default: html2canvas } = await import('html2canvas')
    
    // Ensure container is fully rendered
    await new Promise(resolve => setTimeout(resolve, 300))
    
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#f5f5f5',
      width: container.scrollWidth || 800,
      height: container.scrollHeight || 1500, // Increased to capture footer
      windowWidth: 800,
      windowHeight: container.scrollHeight || 1500,
      onclone: (clonedDoc, element) => {
        // Ensure all images are visible in cloned document
        const clonedImages = clonedDoc.getElementsByTagName('img')
        console.log('Found', clonedImages.length, 'images in cloned document')
        Array.from(clonedImages).forEach((img, idx) => {
          // Skip invalid images (HTML responses)
          if (img.src && (img.src.startsWith('data:text/html') || img.src.includes('text/html'))) {
            console.warn(`⚠ Skipping invalid image ${idx} (HTML response)`)
            img.style.display = 'none'
            return
          }
          
          img.style.display = 'block'
          img.style.visibility = 'visible'
          img.style.opacity = '1'
          img.style.maxHeight = '70px'
          img.style.maxWidth = '200px'
          img.style.position = 'absolute'
          img.style.top = '0'
          img.style.left = '50%'
          img.style.transform = 'translateX(-50%)'
          // Log if logo is found
          if (img.src && img.src.startsWith('data:image')) {
            console.log(`✓ Logo ${idx} found in cloned document, base64 length:`, img.src.length)
          } else if (img.src) {
            console.warn(`⚠ Image ${idx} src:`, img.src.substring(0, 100))
          }
        })
        
        // Ensure footer is visible and positioned correctly
        const footer = clonedDoc.querySelector('.footer') as HTMLElement
        if (footer) {
          footer.style.display = 'block'
          footer.style.visibility = 'visible'
          footer.style.position = 'relative'
          footer.style.marginTop = 'auto'
          footer.style.padding = '20px 40px'
          footer.style.borderTop = '1px solid #e0e0e0'
          console.log('Footer found and styled in cloned document')
        } else {
          console.warn('⚠️ Footer not found in cloned document')
        }
        
        // Ensure container has proper height to show footer
        const clonedContainer = element as HTMLElement
        if (clonedContainer) {
          clonedContainer.style.minHeight = 'auto'
          clonedContainer.style.height = 'auto'
          clonedContainer.style.display = 'flex'
          clonedContainer.style.flexDirection = 'column'
        }
      },
    })
    
    console.log('Canvas created, dimensions:', canvas.width, 'x', canvas.height)

    // Remove temporary iframe
    document.body.removeChild(iframe)

    // Convert canvas to PDF
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const imgWidth = 210 // A4 width in mm
    const pageHeight = 297 // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight
    let position = 0

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight

    // Add additional pages if needed
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }

    // Convert PDF to blob
    const pdfBlob = pdf.output('blob')
    
    // Create a File object from the blob
    const fileName = `Invoice_${invoice.invoice_number}_${invoice.invoice_date?.replace(/\//g, '-') || new Date().toISOString().split('T')[0]}.pdf`
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' })
    
    return file
  }

  const handleRemoveInvoice = (index: number) => {
    setCurrentBatchInvoices((prev) => prev.filter((_, i) => i !== index))
  }

  const handleCreateBatch = () => {
    try {
      const { batch } = submitManualBatch({
        clientId: data.client_id,
        clientName: data.client_name,
        invoices: currentBatchInvoices.map((inv) => ({
          invoice_number: inv.invoice_number,
          load_number: inv.load_number,
          broker_name: inv.broker_name,
          amount: inv.amount,
          invoice_date: inv.invoice_date,
          notes: inv.notes,
          documents: inv.documents?.map((d) => ({ id: d.id, file: d.file })),
        })),
      })
      setBatchInvoices((prev) => ({
        ...prev,
        [batch.id]: [...currentBatchInvoices],
      }))
      setCurrentBatchInvoices([])
      setCreateSubMode('choose')
      refreshBatches()
      setActiveTab('view')
      setSelectedBatch(batch.id)
      alert(`Batch ${batch.batch_number} submitted. Credyx will review your paperwork.`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create batch')
    }
  }

  const handleViewInvoiceDetail = (invoice: Invoice) => {
    setSelectedBatchInvoiceId(invoice.id)
    setShowInvoiceDetailView(true)
  }

  const selectedBatchData = batches.find((b) => b.id === selectedBatch)
  const selectedBatchStoreInvoices = selectedBatch ? getInvoicesByBatchId(selectedBatch) : []

  const batchDetailInvoices = useMemo(() => {
    if (!selectedBatch) return []
    const base =
      selectedBatchStoreInvoices.length > 0
        ? selectedBatchStoreInvoices
        : (batchInvoices[selectedBatch] || []).map((form, index) =>
            formInvoiceToInvoice(
              form,
              selectedBatch,
              index,
              data.client_id,
              data.client_name,
              selectedBatchData?.batch_number
            )
          )
    return base.map((invoice) => mergeInvoiceExtras(invoice, invoiceExtras[invoice.id]))
  }, [
    selectedBatch,
    selectedBatchStoreInvoices,
    batchInvoices,
    data.client_id,
    data.client_name,
    selectedBatchData?.batch_number,
    invoiceExtras,
    invoicesRefreshKey,
  ])

  const selectedBatchInvoice = useMemo(
    () => batchDetailInvoices.find((inv) => inv.id === selectedBatchInvoiceId) ?? null,
    [batchDetailInvoices, selectedBatchInvoiceId]
  )

  const handleBatchInvoiceDocuments = (invoice: Invoice) => {
    const formMatch = selectedBatch
      ? batchInvoices[selectedBatch]?.find((f) => f.invoice_number === invoice.invoice_number)
      : null
    if (formMatch?.documents?.length) {
      handleViewDocuments(formMatch)
    }
  }

  const handleBatchAddNote = async (invoiceId: string, note: string) => {
    if (getInvoiceById(invoiceId)) {
      addClientInvoiceNote(invoiceId, note, data.client_name)
      setInvoicesRefreshKey((key) => key + 1)
      return
    }

    const newNote: InvoiceNote = {
      id: `note-${Date.now()}`,
      note,
      created_by: data.client_name,
      created_at: new Date().toISOString(),
      type: 'client_note',
    }

    setInvoiceExtras((prev) => ({
      ...prev,
      [invoiceId]: {
        ...prev[invoiceId],
        notes_history: [...(prev[invoiceId]?.notes_history || []), newNote],
      },
    }))
  }

  const handleBatchOpenDispute = async (invoiceId: string, reason: string, description: string) => {
    if (getInvoiceById(invoiceId)) {
      openClientInvoiceDispute(invoiceId, reason, description, data.client_name)
      setInvoicesRefreshKey((key) => key + 1)
      return
    }

    const reasonLabel = getDisputeReasonLabel(reason)
    const dispute: InvoiceDispute = {
      id: `dispute-${Date.now()}`,
      reason,
      description,
      status: 'open',
      created_by: data.client_name,
      created_at: new Date().toISOString(),
    }
    const disputeNote: InvoiceNote = {
      id: `note-dispute-${Date.now()}`,
      note: `Dispute opened: ${reasonLabel} — ${description}`,
      created_by: data.client_name,
      created_at: new Date().toISOString(),
      type: 'dispute',
    }

    setInvoiceExtras((prev) => ({
      ...prev,
      [invoiceId]: {
        ...prev[invoiceId],
        disputes: [...(prev[invoiceId]?.disputes || []), dispute],
        notes_history: [...(prev[invoiceId]?.notes_history || []), disputeNote],
      },
    }))
  }

  const handleBatchMarkAsPaid = async (invoiceId: string, options: ClientMarkPaidOptions) => {
    if (getInvoiceById(invoiceId)) {
      markClientInvoiceAsPaid(invoiceId, data.client_name, options)
      setInvoicesRefreshKey((key) => key + 1)
      return
    }

    const invoice = batchDetailInvoices.find((inv) => inv.id === invoiceId)
    if (!invoice || invoice.status !== 'approved') return

    const noteText = buildPaymentConfirmationNote(
      invoice.amount,
      options.amountReceived,
      options.optionalNote
    )

    const paidNote: InvoiceNote = {
      id: `note-paid-${Date.now()}`,
      note: noteText,
      created_by: data.client_name,
      created_at: new Date().toISOString(),
      type: 'client_note',
    }

    setInvoiceExtras((prev) => ({
      ...prev,
      [invoiceId]: {
        ...prev[invoiceId],
        status: 'paid',
        paid_amount: options.amountReceived,
        days_since_expected: 0,
        notes_history: [...(prev[invoiceId]?.notes_history || []), paidNote],
      },
    }))
  }

  return (
    <ClientLayout clientName={data.client_name} clientId={data.client_id}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Tab Navigation */}
          <div className="page-tabs">
          <button
            type="button"
            onClick={() => {
              setActiveTab('create')
              setSelectedBatch(null)
              searchParams.set('tab', 'create')
              setSearchParams(searchParams, { replace: true })
            }}
            className={`page-tab ${activeTab === 'create' ? 'page-tab--active' : ''}`}
          >
            Create Batch
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('view')
              setSelectedBatch(null)
              searchParams.delete('tab')
              setSearchParams(searchParams, { replace: true })
            }}
            className={`page-tab ${activeTab === 'view' ? 'page-tab--active' : ''}`}
          >
            View Batches
          </button>
          </div>
          {activeTab === 'view' && !selectedBatch && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('create')
                setSelectedBatch(null)
                searchParams.set('tab', 'create')
                setSearchParams(searchParams, { replace: true })
              }}
              className="dashboard-btn-primary shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Batch
            </button>
          )}
        </div>

        {activeTab === 'create' ? (
          <div className="space-y-4">
            {createSubMode === 'choose' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  className="batch-option-card batch-option-card--featured"
                  onClick={() => setCreateSubMode('ai')}
                >
                  <h3 className="text-base font-semibold mb-1.5" style={{ color: c.primary }}>
                    AI upload
                  </h3>
                  <p className="text-sm" style={{ color: c.secondary }}>
                    Upload rate cons & BOLs. We sort by load, draft invoices, and you confirm each
                    before submitting.
                  </p>
                </button>
                <button
                  type="button"
                  className="batch-option-card"
                  onClick={() => setCreateSubMode('manual')}
                >
                  <h3 className="text-base font-semibold mb-1.5" style={{ color: c.primary }}>
                    Manual batch
                  </h3>
                  <p className="text-sm" style={{ color: c.secondary }}>
                    Enter invoices one at a time and attach documents yourself.
                  </p>
                </button>
              </div>
            )}

            {createSubMode === 'ai' && (
              <div className="dashboard-card p-5">
                <BatchAiUploadFlow
                  clientId={data.client_id}
                  clientName={data.client_name}
                  initialFiles={dashboardAiFiles}
                  onCancel={() => {
                    setCreateSubMode('choose')
                    setDashboardAiFiles(undefined)
                  }}
                  onComplete={(batchId) => {
                    setDashboardAiFiles(undefined)
                    setCreateSubMode('choose')
                    refreshBatches()
                    setActiveTab('view')
                    setSelectedBatch(batchId)
                    alert('Batch uploaded. Credyx will review your paperwork.')
                  }}
                />
              </div>
            )}

            {createSubMode === 'manual' && (
          <div className="space-y-4">
            <div>
              <button
                type="button"
                className="text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: c.info }}
                onClick={() => setCreateSubMode('choose')}
              >
                ← Back to upload options
              </button>
            </div>
            <div className="dashboard-card">
              <div className="p-5">
                <div className="mb-5 pb-5 border-b" style={{ borderColor: c.border }}>
                  <h3 className="text-base font-semibold" style={{ color: c.primary }}>
                    Manual batch
                  </h3>
                  <p className="text-sm mt-0.5" style={{ color: c.secondary }}>
                    Batch number is auto-generated when you submit
                  </p>
                </div>

                {/* Add Invoice Form */}
                <div className="border-b pb-5 mb-5" style={{ borderColor: c.border }}>
                  <h4 className="text-sm font-semibold mb-4" style={{ color: c.primary }}>
                    Add Invoice
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="client-label">
                        Invoice Number
                      </label>
                      <input
                        type="text"
                        value={invoiceFormData.invoice_number}
                        onChange={(e) => handleInvoiceInputChange('invoice_number', e.target.value)}
                        placeholder="INV-2025-001"
                        className="client-input"
                      />
                      <p className="client-label-hint">
                        Auto-generated, can be edited
                      </p>
                    </div>
                    <div>
                      <label className="client-label">
                        Load Number
                      </label>
                      <input
                        type="text"
                        value={invoiceFormData.load_number}
                        onChange={(e) => handleInvoiceInputChange('load_number', e.target.value)}
                        placeholder="LD12345"
                        className="client-input"
                      />
                    </div>
                    <div className="relative">
                      <label className="client-label">
                        Broker <span style={{ color: c.info }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={invoiceFormData.broker_name}
                        onChange={(e) => handleInvoiceInputChange('broker_name', e.target.value)}
                        placeholder="Type broker name..."
                        className="client-input"
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = c.info
                          if (brokerSuggestions.length > 0) {
                            setShowBrokerSuggestions(true)
                          }
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = c.border
                          setTimeout(() => setShowBrokerSuggestions(false), 200)
                        }}
                      />
                      {showBrokerSuggestions && brokerSuggestions.length > 0 && (
                        <div
                          className="absolute z-10 w-full mt-1 dashboard-card max-h-60 overflow-y-auto py-1"
                        >
                          {brokerSuggestions.map((broker) => (
                            <button
                              key={broker.id}
                              type="button"
                              onClick={() => handleBrokerSelect(broker)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                              style={{ color: c.primary }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = c.surface
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = c.card
                              }}
                            >
                              {broker.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="client-label">
                        Amount <span style={{ color: c.info }}>*</span>
                      </label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="0.01"
                        value={invoiceFormData.amount}
                        onChange={(e) => handleInvoiceInputChange('amount', e.target.value)}
                        placeholder="5000.00"
                        className="client-input"
                      />
                    </div>
                    <div>
                      <label className="client-label">
                        Invoice Date
                      </label>
                      <input
                        type="date"
                        value={invoiceFormData.invoice_date}
                        onChange={(e) => handleInvoiceInputChange('invoice_date', e.target.value)}
                        className="client-input"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="client-label">
                        Broker Address <span style={{ color: c.info }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={invoiceFormData.broker_address}
                        onChange={(e) => handleInvoiceInputChange('broker_address', e.target.value)}
                        placeholder="Broker address"
                        className="client-input"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="client-label">
                        Notes
                      </label>
                      <textarea
                        value={invoiceFormData.notes}
                        onChange={(e) => handleInvoiceInputChange('notes', e.target.value)}
                        placeholder="Additional notes..."
                        rows={2}
                        className="client-input"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleAddInvoice}
                      className="dashboard-btn-primary"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Invoice</span>
                    </button>
                  </div>
                </div>

                {/* Invoices List */}
                {currentBatchInvoices.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-md font-semibold mb-4" style={{ color: c.primary }}>
                      Invoices in Batch ({currentBatchInvoices.length})
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="dashboard-table">
                        <thead>
                          <tr className="border-b" style={{ borderColor: c.border }}>
                            <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                              Invoice#
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                              Load#
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                              Broker
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                              Amount
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                              Invoice Date
                            </th>
                            <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                              Documents
                            </th>
                            <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentBatchInvoices.map((invoice, index) => (
                            <tr
                              key={index}
                              className="border-b"
                              style={{ borderColor: c.border }}
                            >
                              <td className="py-3 px-4 text-sm font-medium" style={{ color: c.primary }}>
                                {invoice.invoice_number}
                              </td>
                              <td className="py-3 px-4 text-sm" style={{ color: c.secondary }}>
                                {invoice.load_number || '-'}
                              </td>
                              <td className="py-3 px-4 text-sm" style={{ color: c.secondary }}>
                                {invoice.broker_name}
                              </td>
                              <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: c.primary }}>
                                {formatCurrency(parseFloat(invoice.amount || '0'))}
                              </td>
                              <td className="py-3 px-4 text-sm" style={{ color: c.secondary }}>
                                {invoice.invoice_date ? formatDate(invoice.invoice_date) : '-'}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {invoice.documents && invoice.documents.length > 0 ? (
                                  <div className="flex items-center justify-center space-x-2">
                                    <button
                                      onClick={() => handleViewDocuments(invoice)}
                                      className="inline-flex items-center px-2 py-1 text-xs font-medium rounded transition-colors"
                                      style={{
                                        backgroundColor: c.secondary,
                                        color: c.card,
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#6b7a7b'
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = c.secondary
                                      }}
                                      title="View Documents"
                                    >
                                      <FileText className="w-3 h-3 mr-1" />
                                      {invoice.documents.length}
                                    </button>
                                    <button
                                      onClick={() => handleUploadDocumentsForInvoice(invoice, index)}
                                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                                      style={{ color: c.primary }}
                                      title="Add/Edit Documents"
                                    >
                                      <Upload className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleUploadDocumentsForInvoice(invoice, index)}
                                    className="inline-flex items-center px-2 py-1 text-xs font-medium rounded transition-colors"
                                    style={{
                                      color: c.primary,
                                      border: '1px solid #e2e8f0',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = c.surface
                                      e.currentTarget.style.borderColor = c.info
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = c.card
                                      e.currentTarget.style.borderColor = c.border
                                    }}
                                  >
                                    <Upload className="w-3 h-3 mr-1" />
                                    Upload
                                  </button>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => handleRemoveInvoice(index)}
                                  className="transition-colors"
                                  style={{ color: c.secondary }}
                                  onMouseEnter={(e) => e.currentTarget.style.color = c.info}
                                  onMouseLeave={(e) => e.currentTarget.style.color = c.secondary}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2" style={{ borderColor: c.info }}>
                            <td colSpan={3} className="py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                              Total
                            </td>
                            <td className="py-3 px-4 text-sm text-right font-bold" style={{ color: c.primary }}>
                              {formatCurrency(
                                currentBatchInvoices.reduce(
                                  (sum, inv) => sum + parseFloat(inv.amount || '0'),
                                  0
                                )
                              )}
                            </td>
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Submit Batch Button */}
                {currentBatchInvoices.length > 0 && (
                  <div className="flex items-center justify-end gap-2 pt-4 border-t" style={{ borderColor: c.border }}>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentBatchInvoices([])
                        const year = new Date().getFullYear()
                        setInvoiceFormData({
                          invoice_number: `INV-${year}-001`,
                          load_number: '',
                          broker_name: '',
                          broker_address: '',
                          amount: '',
                          invoice_date: new Date().toISOString().split('T')[0],
                          notes: '',
                        })
                        setShowBrokerSuggestions(false)
                      }}
                      className="dashboard-btn-secondary"
                    >
                      Clear All
                    </button>
                    <button type="button" onClick={handleCreateBatch} className="dashboard-btn-primary">
                      Create Batch
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
            )}
          </div>
        ) : selectedBatch ? (
          // Batch Detail View
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelectedBatch(null)}
              className="text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: c.info }}
            >
              ← Back to Batches
            </button>

            {selectedBatchData && (
              <div className="dashboard-card">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-5 pb-5 border-b" style={{ borderColor: c.border }}>
                    <div>
                      <h3 className="text-lg font-semibold" style={{ color: c.primary }}>
                        {selectedBatchData.batch_number}
                      </h3>
                      <p className="text-sm mt-0.5" style={{ color: c.secondary }}>
                        Submitted on {formatDate(selectedBatchData.submitted_at)}
                      </p>
                    </div>
                    <div>{getStatusBadge(selectedBatchData.status)}</div>
                  </div>

                  {/* Batch Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                    <div className="dashboard-metric-secondary" style={{ backgroundColor: c.surface }}>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" style={{ color: c.info }} />
                        <span className="text-sm font-medium" style={{ color: c.secondary }}>
                          Total Invoices
                        </span>
                      </div>
                      <span className="text-xl font-bold tabular-nums" style={{ color: c.primary }}>
                        {selectedBatchData.total_invoices}
                      </span>
                    </div>
                    <div className="dashboard-metric-secondary" style={{ backgroundColor: c.surface }}>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4" style={{ color: c.info }} />
                        <span className="text-sm font-medium" style={{ color: c.secondary }}>
                          Total Amount
                        </span>
                      </div>
                      <span className="text-xl font-bold tabular-nums" style={{ color: c.primary }}>
                        {formatCurrency(selectedBatchData.total_amount)}
                      </span>
                    </div>
                    {selectedBatchData.reviewed_at && (
                      <div className="dashboard-metric-secondary" style={{ backgroundColor: c.surface }}>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" style={{ color: c.info }} />
                          <span className="text-sm font-medium" style={{ color: c.secondary }}>
                            Reviewed At
                          </span>
                        </div>
                        <span className="text-sm font-semibold" style={{ color: c.primary }}>
                          {formatDate(selectedBatchData.reviewed_at)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Invoices List */}
                  <div className="border-t pt-5" style={{ borderColor: c.border }}>
                    <h4 className="text-base font-semibold mb-4" style={{ color: c.primary }}>
                      Invoices in this Batch ({selectedBatchData.total_invoices})
                    </h4>
                    {selectedBatchStoreInvoices.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="dashboard-table">
                          <thead>
                            <tr className="border-b" style={{ borderColor: c.border }}>
                              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Invoice#
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Load#
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Broker
                              </th>
                              <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Amount
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Invoice Date
                              </th>
                              <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Documents
                              </th>
                              <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedBatchStoreInvoices.map((invoice) => (
                              <tr
                                key={invoice.id}
                                className="border-b cursor-pointer"
                                style={{ borderColor: c.border }}
                                onClick={() => handleViewInvoiceDetail(invoice)}
                              >
                                <td className="py-3 px-4 text-sm font-medium" style={{ color: c.primary }}>
                                  {invoice.invoice_number}
                                </td>
                                <td className="py-3 px-4 text-sm" style={{ color: c.secondary }}>
                                  {invoice.load_number || '-'}
                                </td>
                                <td className="py-3 px-4 text-sm" style={{ color: c.secondary }}>
                                  {invoice.broker_name}
                                </td>
                                <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: c.primary }}>
                                  {formatCurrency(invoice.amount)}
                                </td>
                                <td className="py-3 px-4 text-sm" style={{ color: c.secondary }}>
                                  {invoice.invoice_date ? formatDate(invoice.invoice_date) : '-'}
                                </td>
                                <td className="py-3 px-4 text-center text-sm" style={{ color: c.secondary }}>
                                  {invoice.documents_count ?? 0}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleViewInvoiceDetail(invoice)
                                    }}
                                    className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
                                    style={{ color: c.info }}
                                    title="View Details"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : batchInvoices[selectedBatch!] && batchInvoices[selectedBatch!].length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="dashboard-table">
                          <thead>
                            <tr className="border-b" style={{ borderColor: c.border }}>
                              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Invoice#
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Load#
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Broker
                              </th>
                              <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Amount
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Invoice Date
                              </th>
                              <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Documents
                              </th>
                              <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: c.primary }}>
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {batchInvoices[selectedBatch!].map((invoice, index) => {
                              const detailInvoice = batchDetailInvoices[index]
                              return (
                              <tr
                                key={index}
                                className="border-b cursor-pointer"
                                style={{ borderColor: c.border }}
                                onClick={() => detailInvoice && handleViewInvoiceDetail(detailInvoice)}
                              >
                                <td className="py-3 px-4 text-sm font-medium" style={{ color: c.primary }}>
                                  {invoice.invoice_number}
                                </td>
                                <td className="py-3 px-4 text-sm" style={{ color: c.secondary }}>
                                  {invoice.load_number || '-'}
                                </td>
                                <td className="py-3 px-4 text-sm" style={{ color: c.secondary }}>
                                  {invoice.broker_name}
                                </td>
                                <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: c.primary }}>
                                  {formatCurrency(parseFloat(invoice.amount || '0'))}
                                </td>
                                <td className="py-3 px-4 text-sm" style={{ color: c.secondary }}>
                                  {invoice.invoice_date ? formatDate(invoice.invoice_date) : '-'}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {invoice.documents && invoice.documents.length > 0 ? (
                                    <button
                                      onClick={() => handleViewDocuments(invoice)}
                                      className="inline-flex items-center px-2 py-1 text-xs font-medium rounded transition-colors"
                                      style={{
                                        backgroundColor: c.secondary,
                                        color: c.card,
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#6b7a7b'
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = c.secondary
                                      }}
                                      title="View Documents"
                                    >
                                      <FileText className="w-3 h-3 mr-1" />
                                      {invoice.documents.length}
                                    </button>
                                  ) : (
                                    <span className="text-xs" style={{ color: c.secondary }}>
                                      No documents
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <div className="flex items-center justify-center space-x-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (detailInvoice) handleViewInvoiceDetail(detailInvoice)
                                      }}
                                      className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
                                      style={{ color: c.info }}
                                      title="View Details"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )})}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: c.secondary }} />
                        <p className="text-sm font-medium mb-1" style={{ color: c.primary }}>
                          No invoices in this batch
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          // View Batches Tab
          <div className="dashboard-card overflow-hidden">
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: c.border }}>
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.primary }}>
                  All Batches
                </h3>
                <p className="text-xs font-medium mt-0.5" style={{ color: c.secondary }}>
                  {batches.length} batch{batches.length !== 1 ? 'es' : ''} found
                </p>
              </div>
            </div>

            {batches.length === 0 ? (
              <div className="text-center py-10 px-5">
                <p className="text-base font-medium mb-1" style={{ color: c.primary }}>
                  No batches found
                </p>
                <p className="text-sm" style={{ color: c.secondary }}>
                  Your submitted batches will appear here
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Batch#</th>
                      <th className="text-right">Invoices</th>
                      <th className="text-right">Amount</th>
                      <th>Submitted</th>
                      <th>Status</th>
                      <th>Reviewed</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch) => {
                      const isHighlighted = highlightedBatchId === batch.id
                      return (
                        <tr
                          key={batch.id}
                          className={`cursor-pointer ${isHighlighted ? 'batch-highlight-row' : ''}`}
                          onClick={() => setSelectedBatch(batch.id)}
                        >
                          <td className="font-semibold">{batch.batch_number}</td>
                          <td className="text-right tabular-nums">{batch.total_invoices}</td>
                          <td className="text-right font-medium tabular-nums">
                            {formatCurrency(batch.total_amount)}
                          </td>
                          <td style={{ color: c.secondary }}>{formatDate(batch.submitted_at)}</td>
                          <td>{getStatusBadge(batch.status)}</td>
                          <td style={{ color: c.secondary }}>
                            {batch.reviewed_at ? formatDate(batch.reviewed_at) : '-'}
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedBatch(batch.id)
                              }}
                              className="dashboard-btn-primary"
                              style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Document Upload Modal */}
      {showDocumentUploadModal && currentInvoiceForDocuments && (
        <div className="fixed inset-0 client-modal-overlay flex items-center justify-center z-50">
          <div className="client-modal max-w-[1400px] w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="client-modal-header flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: c.primary }}>
                  Upload Documents
                </h3>
                <p className="text-sm mt-1" style={{ color: c.secondary }}>
                  Invoice #{currentInvoiceForDocuments.invoice_number}
                </p>
              </div>
              <button
                onClick={handleDocumentUploadSkip}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
                style={{ color: c.primary }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="client-modal-body">
              {/* Invoice Info */}
              <div className="mb-6 p-4 rounded" style={{ backgroundColor: c.surface }}>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium" style={{ color: c.secondary }}>Broker:</span>
                    <span className="ml-2" style={{ color: c.primary }}>
                      {currentInvoiceForDocuments.broker_name}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium" style={{ color: c.secondary }}>Amount:</span>
                    <span className="ml-2" style={{ color: c.primary }}>
                      {formatCurrency(parseFloat(currentInvoiceForDocuments.amount || '0'))}
                    </span>
                  </div>
                  {currentInvoiceForDocuments.load_number && (
                    <div>
                      <span className="font-medium" style={{ color: c.secondary }}>Load#:</span>
                      <span className="ml-2" style={{ color: c.primary }}>
                        {currentInvoiceForDocuments.load_number}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* File Upload Area */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2" style={{ color: c.primary }}>
                  Upload Documents
                </label>
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center transition-colors"
                  style={{
                    borderColor: c.border,
                    backgroundColor: c.surface,
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.currentTarget.style.borderColor = c.info
                    e.currentTarget.style.backgroundColor = c.accentLight
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    e.currentTarget.style.borderColor = c.border
                    e.currentTarget.style.backgroundColor = c.surface
                  }}
                  onDrop={async (e) => {
                    e.preventDefault()
                    e.currentTarget.style.borderColor = c.border
                    e.currentTarget.style.backgroundColor = c.surface
                    const files = e.dataTransfer.files
                    if (files.length > 0) {
                      const processedDocuments = await processFiles(files)
                      setUploadedDocuments((prev) => [...prev, ...processedDocuments])
                      setDocumentReviewResult(null)
                      setDocumentReviewError(null)
                    }
                  }}
                >
                  <Upload className="w-12 h-12 mx-auto mb-4" style={{ color: c.secondary }} />
                  <p className="text-sm mb-2" style={{ color: c.primary }}>
                    Drag and drop files here, or
                  </p>
                  <label
                    htmlFor="file-upload"
                    className="dashboard-btn-primary cursor-pointer"
                    style={{ color: c.card }}
                  >
                    Browse Files
                  </label>
                  <input
                    id="file-upload"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  />
                  <p className="text-xs mt-2" style={{ color: c.secondary }}>
                    PDF, JPG, PNG, DOC, DOCX (Max 25MB per file)
                  </p>
                </div>
              </div>

              <DocumentReviewResults
                result={documentReviewResult}
                isReviewing={isReviewingDocuments}
                error={documentReviewError}
                onRunReview={handleRunDocumentReview}
                canReview={uploadedDocuments.length > 0}
                aiEnabled={isAIReviewEnabled()}
                reviewFiles={uploadedDocuments.map((doc) => doc.file)}
              />

              {/* Uploaded Files List */}
              {uploadedDocuments.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium mb-3" style={{ color: c.primary }}>
                    Uploaded Documents ({uploadedDocuments.length})
                  </h4>
                  <div className="space-y-2">
                    {uploadedDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded border"
                        style={{
                          borderColor: c.border,
                          backgroundColor: c.card,
                        }}
                      >
                        <div className="flex items-center space-x-3">
                          <FileText className="w-5 h-5" style={{ color: c.secondary }} />
                          <div>
                            <p className="text-sm font-medium" style={{ color: c.primary }}>
                              {doc.name}
                            </p>
                            <p className="text-xs" style={{ color: c.secondary }}>
                              {formatFileSize(doc.size)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveDocument(doc.id)}
                          className="p-1 hover:bg-red-50 rounded transition-colors"
                          style={{ color: c.secondary }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              className="flex items-center justify-end space-x-3 p-6 border-t"
              style={{ borderColor: c.border }}
            >
              <button
                onClick={handleDocumentUploadSkip}
                className="px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  color: c.primary,
                  border: '1px solid #e2e8f0',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = c.surface
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = c.card
                }}
              >
                {isEditingExistingInvoice ? 'Cancel' : 'Skip'}
              </button>
              <button
                onClick={handleDocumentUploadComplete}
                className="px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: c.primary,
                  color: c.card,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = c.primaryHover
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = c.primary
                }}
              >
                {uploadedDocuments.length > 0
                  ? isEditingExistingInvoice
                    ? 'Save Documents'
                    : 'Save & Continue'
                  : isEditingExistingInvoice
                  ? 'Close'
                  : 'Continue Without Documents'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer */}
      {showDocumentViewer && viewingInvoiceDocuments && (
        <DocumentViewer
          isOpen={showDocumentViewer}
          onClose={() => {
            setShowDocumentViewer(false)
            setViewingInvoiceDocuments(null)
          }}
          documents={getDocumentsForInvoice(viewingInvoiceDocuments)}
          invoiceNumber={viewingInvoiceDocuments.invoice_number}
          title="View Documents"
        />
      )}

      <InvoiceDetailWorkspace
        isOpen={showInvoiceDetailView}
        onClose={() => setShowInvoiceDetailView(false)}
        invoices={batchDetailInvoices}
        selectedInvoice={selectedBatchInvoice}
        onSelectInvoice={(invoice) => setSelectedBatchInvoiceId(invoice.id)}
        onViewDocuments={handleBatchInvoiceDocuments}
        onAddNote={handleBatchAddNote}
        onOpenDispute={handleBatchOpenDispute}
        onMarkAsPaid={handleBatchMarkAsPaid}
        onInvoiceUpdated={() => setInvoicesRefreshKey((key) => key + 1)}
        clientName={data.client_name}
        title={selectedBatchData ? `Batch ${selectedBatchData.batch_number}` : 'Invoice Details'}
        showStatusFilter={false}
      />
    </ClientLayout>
  )
}
