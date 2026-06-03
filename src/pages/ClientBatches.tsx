import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mockClientDashboardData } from '../data/mockClientDashboard'
import { mockBrokers } from '../data/mockBrokers'
import { mockClients } from '../data/mockClients'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/format'
import { FileText, Calendar, DollarSign, Plus, Trash2, Upload, X, Eye } from 'lucide-react'
import { generateInvoice } from '../../pdfTemplate'
import jsPDF from 'jspdf'
import DocumentViewer from '../components/DocumentViewer'
import ClientHeader from '../components/ClientHeader'
import DocumentReviewResults from '../components/client/DocumentReviewResults'
import { isAIReviewEnabled, reviewUploadedDocuments } from '../services/documentReviewService'
import { BatchDocumentReviewResult } from '../types/documentReview'

// Mock batch data for client
const mockClientBatches = [
  {
    id: 'batch-1',
    batch_number: 'BATCH-2025-001',
    total_invoices: 25,
    total_amount: 125000.0,
    submitted_at: '2025-11-28T10:00:00Z',
    status: 'pending',
    reviewed_at: null,
  },
  {
    id: 'batch-2',
    batch_number: 'BATCH-2025-002',
    total_invoices: 18,
    total_amount: 87500.0,
    submitted_at: '2025-11-25T14:30:00Z',
    status: 'reviewed',
    reviewed_at: '2025-11-26T09:15:00Z',
  },
  {
    id: 'batch-3',
    batch_number: 'BATCH-2025-003',
    total_invoices: 32,
    total_amount: 156000.0,
    submitted_at: '2025-11-22T08:00:00Z',
    status: 'reviewed',
    reviewed_at: '2025-11-23T11:30:00Z',
  },
  {
    id: 'batch-4',
    batch_number: 'BATCH-2025-004',
    total_invoices: 15,
    total_amount: 72000.0,
    submitted_at: '2025-11-20T16:45:00Z',
    status: 'reviewed',
    reviewed_at: '2025-11-21T10:20:00Z',
  },
]

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

export default function ClientBatches() {
  const [data] = useState(mockClientDashboardData)
  const [batches, setBatches] = useState(mockClientBatches)
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [showInvoiceDetailModal, setShowInvoiceDetailModal] = useState(false)
  const [currentInvoiceForDocuments, setCurrentInvoiceForDocuments] = useState<InvoiceFormData | null>(null)
  const [currentInvoiceIndex, setCurrentInvoiceIndex] = useState<number | null>(null)
  const [uploadedDocuments, setUploadedDocuments] = useState<InvoiceDocument[]>([])
  const [documentReviewResult, setDocumentReviewResult] = useState<BatchDocumentReviewResult | null>(null)
  const [isReviewingDocuments, setIsReviewingDocuments] = useState(false)
  const [documentReviewError, setDocumentReviewError] = useState<string | null>(null)
  const [isEditingExistingInvoice, setIsEditingExistingInvoice] = useState(false)
  const [viewingInvoiceDocuments, setViewingInvoiceDocuments] = useState<InvoiceFormData | null>(null)
  const [viewingInvoiceDetail, setViewingInvoiceDetail] = useState<InvoiceFormData | null>(null)
  const [batchInvoices, setBatchInvoices] = useState<Record<string, InvoiceFormData[]>>({})

  const navItems = [
    { label: 'Dashboard', path: '/client/dashboard' },
    { label: 'Batches', path: '/client/batches' },
    { label: 'Invoices', path: '/client/invoices' },
    { label: 'Payments', path: '/client/payments' },
    { label: 'Collections', path: '/client/collections' },
    { label: 'Reports', path: '/client/reports' },
    { label: 'Settings', path: '/client/settings' },
  ]

  // Update tab when URL parameter changes
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'create' && activeTab !== 'create') {
      setActiveTab('create')
    }
  }, [searchParams])

  const getStatusBadge = (status: string) => {
    if (status === 'reviewed') {
      return (
        <span
          className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium capitalize"
          style={{ backgroundColor: '#819291', color: '#FFFFFF' }}
        >
          Reviewed
        </span>
      )
    }
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium capitalize"
        style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
      >
        Pending
      </span>
    )
  }

  const generateBatchNumber = () => {
    const year = new Date().getFullYear()
    const batchCount = batches.length + 1
    return `BATCH-${year}-${String(batchCount).padStart(3, '0')}`
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
    if (currentBatchInvoices.length === 0) {
      alert('Please add at least one invoice to the batch')
      return
    }

    const totalAmount = currentBatchInvoices.reduce(
      (sum, inv) => sum + parseFloat(inv.amount || '0'),
      0
    )

    // Get client fee terms
    const client = mockClients.find((c) => c.id === data.client_id)
    let feeCalculation: {
      fee_type?: 'percentage' | 'flat'
      fee_percentage?: number
      flat_fee_amount?: number
      total_fee?: number
      net_amount?: number
    } | undefined

    if (client?.fee_terms) {
      const { fee_type, fee_percentage, flat_fee_amount } = client.fee_terms
      let totalFee = 0

      if (fee_type === 'percentage' && fee_percentage) {
        totalFee = (totalAmount * fee_percentage) / 100
      } else if (fee_type === 'flat' && flat_fee_amount) {
        totalFee = flat_fee_amount
      }

      feeCalculation = {
        fee_type,
        fee_percentage,
        flat_fee_amount,
        total_fee: totalFee,
        net_amount: totalAmount - totalFee,
      }
    }

    const batchId = `batch-${Date.now()}`
    const batchNumber = generateBatchNumber()

    const newBatch = {
      id: batchId,
      batch_number: batchNumber,
      total_invoices: currentBatchInvoices.length,
      total_amount: totalAmount,
      submitted_at: new Date().toISOString(),
      status: 'pending' as const,
      reviewed_at: null,
      fee_calculation: feeCalculation,
    }

    // Store invoices for this batch
    setBatchInvoices((prev) => ({
      ...prev,
      [batchId]: [...currentBatchInvoices],
    }))

    setBatches((prev) => [newBatch, ...prev])
    setCurrentBatchInvoices([])
    setActiveTab('view')
  }

  const handleViewInvoiceDetail = (invoice: InvoiceFormData) => {
    setViewingInvoiceDetail(invoice)
    setShowInvoiceDetailModal(true)
  }

  const selectedBatchData = batches.find((b) => b.id === selectedBatch)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      <ClientHeader clientName={data.client_name} navItems={navItems} />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>Batches</h2>
          <p style={{ color: '#819291' }}>Create and manage your invoice batches</p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white border-b mb-6" style={{ borderColor: '#819291' }}>
          <nav className="flex space-x-1">
            <button
              onClick={() => {
                setActiveTab('create')
                setSelectedBatch(null)
                searchParams.set('tab', 'create')
                setSearchParams(searchParams, { replace: true })
              }}
              className="px-6 py-3 text-sm font-medium transition-colors relative"
              style={{
                color: activeTab === 'create' ? '#113543' : '#819291',
                borderBottom: activeTab === 'create' ? '2px solid #C2A558' : '2px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (activeTab !== 'create') {
                  e.currentTarget.style.color = '#113543'
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== 'create') {
                  e.currentTarget.style.color = '#819291'
                }
              }}
            >
              Create Batch
            </button>
            <button
              onClick={() => {
                setActiveTab('view')
                setSelectedBatch(null)
                searchParams.delete('tab')
                setSearchParams(searchParams, { replace: true })
              }}
              className="px-6 py-3 text-sm font-medium transition-colors relative"
              style={{
                color: activeTab === 'view' ? '#113543' : '#819291',
                borderBottom: activeTab === 'view' ? '2px solid #C2A558' : '2px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (activeTab !== 'view') {
                  e.currentTarget.style.color = '#113543'
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== 'view') {
                  e.currentTarget.style.color = '#819291'
                }
              }}
            >
              View Batches
            </button>
          </nav>
        </div>

        {activeTab === 'create' ? (
          // Create Batch Tab
          <div className="space-y-6">
            <div className="bg-white border rounded" style={{ borderColor: '#819291' }}>
              <div className="p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-bold mb-2" style={{ color: '#113543' }}>
                    New Batch: {generateBatchNumber()}
                  </h3>
                  <p className="text-sm" style={{ color: '#819291' }}>
                    Batch number will be auto-generated when you submit
                  </p>
                </div>

                {/* Add Invoice Form */}
                <div className="border-b pb-6 mb-6" style={{ borderColor: '#819291' }}>
                  <h4 className="text-md font-semibold mb-4" style={{ color: '#113543' }}>
                    Add Invoice
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Invoice Number
                      </label>
                      <input
                        type="text"
                        value={invoiceFormData.invoice_number}
                        onChange={(e) => handleInvoiceInputChange('invoice_number', e.target.value)}
                        placeholder="INV-2025-001"
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      />
                      <p className="text-xs mt-1" style={{ color: '#819291' }}>
                        Auto-generated, can be edited
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Load Number
                      </label>
                      <input
                        type="text"
                        value={invoiceFormData.load_number}
                        onChange={(e) => handleInvoiceInputChange('load_number', e.target.value)}
                        placeholder="LD12345"
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      />
                    </div>
                    <div className="relative">
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Broker <span style={{ color: '#C2A558' }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={invoiceFormData.broker_name}
                        onChange={(e) => handleInvoiceInputChange('broker_name', e.target.value)}
                        placeholder="Type broker name..."
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                          if (brokerSuggestions.length > 0) {
                            setShowBrokerSuggestions(true)
                          }
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                          // Delay hiding suggestions to allow clicking on them
                          setTimeout(() => setShowBrokerSuggestions(false), 200)
                        }}
                      />
                      {showBrokerSuggestions && brokerSuggestions.length > 0 && (
                        <div
                          className="absolute z-10 w-full mt-1 bg-white border rounded shadow-lg max-h-60 overflow-y-auto"
                          style={{ borderColor: '#819291' }}
                        >
                          {brokerSuggestions.map((broker) => (
                            <button
                              key={broker.id}
                              type="button"
                              onClick={() => handleBrokerSelect(broker)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                              style={{ color: '#113543' }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#f8f9fa'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#FFFFFF'
                              }}
                            >
                              {broker.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Amount <span style={{ color: '#C2A558' }}>*</span>
                      </label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="0.01"
                        value={invoiceFormData.amount}
                        onChange={(e) => handleInvoiceInputChange('amount', e.target.value)}
                        placeholder="5000.00"
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Invoice Date
                      </label>
                      <input
                        type="date"
                        value={invoiceFormData.invoice_date}
                        onChange={(e) => handleInvoiceInputChange('invoice_date', e.target.value)}
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Broker Address <span style={{ color: '#C2A558' }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={invoiceFormData.broker_address}
                        onChange={(e) => handleInvoiceInputChange('broker_address', e.target.value)}
                        placeholder="Broker address"
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1" style={{ color: '#113543' }}>
                        Notes
                      </label>
                      <textarea
                        value={invoiceFormData.notes}
                        onChange={(e) => handleInvoiceInputChange('notes', e.target.value)}
                        placeholder="Additional notes..."
                        rows={2}
                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                        style={{
                          borderColor: '#819291',
                          color: '#113543',
                          backgroundColor: '#FFFFFF',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleAddInvoice}
                      className="flex items-center space-x-2 px-4 py-2 text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: '#113543',
                        color: '#FFFFFF',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#0d2a35'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#113543'
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Invoice</span>
                    </button>
                  </div>
                </div>

                {/* Invoices List */}
                {currentBatchInvoices.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-md font-semibold mb-4" style={{ color: '#113543' }}>
                      Invoices in Batch ({currentBatchInvoices.length})
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b" style={{ borderColor: '#819291' }}>
                            <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                              Invoice#
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                              Load#
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                              Broker
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                              Amount
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                              Invoice Date
                            </th>
                            <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                              Documents
                            </th>
                            <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentBatchInvoices.map((invoice, index) => (
                            <tr
                              key={index}
                              className="border-b"
                              style={{
                                borderColor: '#819291',
                                backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                              }}
                            >
                              <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                                {invoice.invoice_number}
                              </td>
                              <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                                {invoice.load_number || '-'}
                              </td>
                              <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                                {invoice.broker_name}
                              </td>
                              <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                                {formatCurrency(parseFloat(invoice.amount || '0'))}
                              </td>
                              <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                                {invoice.invoice_date ? formatDate(invoice.invoice_date) : '-'}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {invoice.documents && invoice.documents.length > 0 ? (
                                  <div className="flex items-center justify-center space-x-2">
                                    <button
                                      onClick={() => handleViewDocuments(invoice)}
                                      className="inline-flex items-center px-2 py-1 text-xs font-medium rounded transition-colors"
                                      style={{
                                        backgroundColor: '#819291',
                                        color: '#FFFFFF',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#6b7a7b'
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = '#819291'
                                      }}
                                      title="View Documents"
                                    >
                                      <FileText className="w-3 h-3 mr-1" />
                                      {invoice.documents.length}
                                    </button>
                                    <button
                                      onClick={() => handleUploadDocumentsForInvoice(invoice, index)}
                                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                                      style={{ color: '#113543' }}
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
                                      color: '#113543',
                                      border: '1px solid #819291',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#f8f9fa'
                                      e.currentTarget.style.borderColor = '#C2A558'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = '#FFFFFF'
                                      e.currentTarget.style.borderColor = '#819291'
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
                                  style={{ color: '#819291' }}
                                  onMouseEnter={(e) => e.currentTarget.style.color = '#C2A558'}
                                  onMouseLeave={(e) => e.currentTarget.style.color = '#819291'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2" style={{ borderColor: '#C2A558' }}>
                            <td colSpan={3} className="py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                              Total
                            </td>
                            <td className="py-3 px-4 text-sm text-right font-bold" style={{ color: '#113543' }}>
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
                  <div className="flex items-center justify-end space-x-3 pt-4 border-t" style={{ borderColor: '#819291' }}>
                    <button
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
                      className="px-4 py-2 text-sm font-medium transition-colors"
                      style={{
                        color: '#819291',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #819291',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#113543'
                        e.currentTarget.style.borderColor = '#113543'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#819291'
                        e.currentTarget.style.borderColor = '#819291'
                      }}
                    >
                      Clear All
                    </button>
                    <button
                      onClick={handleCreateBatch}
                      className="px-4 py-2 text-sm font-medium text-white transition-colors"
                      style={{
                        backgroundColor: '#113543',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#0d2a35'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#113543'
                      }}
                    >
                      Create Batch
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : selectedBatch ? (
          // Batch Detail View
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSelectedBatch(null)}
                className="flex items-center space-x-2 text-sm transition-colors"
                style={{ color: '#819291' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#113543'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#819291'}
              >
                <span>←</span>
                <span>Back to Batches</span>
              </button>
            </div>

            {selectedBatchData && (
              <div className="bg-white border rounded" style={{ borderColor: '#819291' }}>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold mb-1" style={{ color: '#113543' }}>
                        {selectedBatchData.batch_number}
                      </h3>
                      <p className="text-sm" style={{ color: '#819291' }}>
                        Submitted on {formatDate(selectedBatchData.submitted_at)}
                      </p>
                    </div>
                    <div>{getStatusBadge(selectedBatchData.status)}</div>
                  </div>

                  {/* Batch Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="border p-4 rounded" style={{ borderColor: '#819291' }}>
                      <div className="flex items-center space-x-2 mb-2">
                        <FileText className="w-4 h-4" style={{ color: '#C2A558' }} />
                        <span className="text-sm" style={{ color: '#819291' }}>Total Invoices</span>
                      </div>
                      <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                        {selectedBatchData.total_invoices}
                      </div>
                    </div>
                    <div className="border p-4 rounded" style={{ borderColor: '#819291' }}>
                      <div className="flex items-center space-x-2 mb-2">
                        <DollarSign className="w-4 h-4" style={{ color: '#C2A558' }} />
                        <span className="text-sm" style={{ color: '#819291' }}>Total Amount</span>
                      </div>
                      <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                        {formatCurrency(selectedBatchData.total_amount)}
                      </div>
                    </div>
                    {selectedBatchData.reviewed_at && (
                      <div className="border p-4 rounded" style={{ borderColor: '#819291' }}>
                        <div className="flex items-center space-x-2 mb-2">
                          <Calendar className="w-4 h-4" style={{ color: '#C2A558' }} />
                          <span className="text-sm" style={{ color: '#819291' }}>Reviewed At</span>
                        </div>
                        <div className="text-lg font-medium" style={{ color: '#113543' }}>
                          {formatDate(selectedBatchData.reviewed_at)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Invoices List */}
                  <div className="border-t pt-6" style={{ borderColor: '#819291' }}>
                    <h4 className="text-lg font-semibold mb-4" style={{ color: '#113543' }}>
                      Invoices in this Batch ({selectedBatchData.total_invoices})
                    </h4>
                    {batchInvoices[selectedBatch] && batchInvoices[selectedBatch].length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b" style={{ borderColor: '#819291' }}>
                              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                                Invoice#
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                                Load#
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                                Broker
                              </th>
                              <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                                Amount
                              </th>
                              <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                                Invoice Date
                              </th>
                              <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                                Documents
                              </th>
                              <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {batchInvoices[selectedBatch].map((invoice, index) => (
                              <tr
                                key={index}
                                className="border-b"
                                style={{
                                  borderColor: '#819291',
                                  backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                                }}
                              >
                                <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                                  {invoice.invoice_number}
                                </td>
                                <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                                  {invoice.load_number || '-'}
                                </td>
                                <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                                  {invoice.broker_name}
                                </td>
                                <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                                  {formatCurrency(parseFloat(invoice.amount || '0'))}
                                </td>
                                <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                                  {invoice.invoice_date ? formatDate(invoice.invoice_date) : '-'}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {invoice.documents && invoice.documents.length > 0 ? (
                                    <button
                                      onClick={() => handleViewDocuments(invoice)}
                                      className="inline-flex items-center px-2 py-1 text-xs font-medium rounded transition-colors"
                                      style={{
                                        backgroundColor: '#819291',
                                        color: '#FFFFFF',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#6b7a7b'
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = '#819291'
                                      }}
                                      title="View Documents"
                                    >
                                      <FileText className="w-3 h-3 mr-1" />
                                      {invoice.documents.length}
                                    </button>
                                  ) : (
                                    <span className="text-xs" style={{ color: '#819291' }}>
                                      No documents
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <div className="flex items-center justify-center space-x-2">
                                    <button
                                      onClick={() => handleViewInvoiceDetail(invoice)}
                                      className="px-3 py-1 text-xs font-medium rounded transition-colors"
                                      style={{
                                        color: '#113543',
                                        border: '1px solid #819291',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#f8f9fa'
                                        e.currentTarget.style.borderColor = '#C2A558'
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = '#FFFFFF'
                                        e.currentTarget.style.borderColor = '#819291'
                                      }}
                                    >
                                      View Details
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: '#819291' }} />
                        <p className="text-sm font-medium mb-1" style={{ color: '#113543' }}>
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
          <div className="bg-white border rounded" style={{ borderColor: '#819291' }}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold" style={{ color: '#113543' }}>All Batches</h3>
                  <p className="text-sm mt-1" style={{ color: '#819291' }}>
                    {batches.length} batch{batches.length !== 1 ? 'es' : ''} found
                  </p>
                </div>
              </div>

              {batches.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-lg font-medium mb-2" style={{ color: '#113543' }}>
                    No batches found
                  </p>
                  <p className="text-sm" style={{ color: '#819291' }}>
                    Your submitted batches will appear here
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b" style={{ borderColor: '#819291' }}>
                        <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Batch#
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Invoices
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Amount
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Submitted
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Status
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Reviewed
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((batch, index) => {
                        const isHighlighted = highlightedBatchId === batch.id
                        return (
                        <tr
                          key={batch.id}
                          className={`border-b cursor-pointer transition-colors ${isHighlighted ? 'highlight-flash' : ''}`}
                          style={{
                            borderColor: '#819291',
                            backgroundColor: isHighlighted 
                              ? '#FFF9E6' 
                              : index % 2 === 0 ? '#f8f9fa' 
                              : '#FFFFFF',
                            animation: isHighlighted ? 'flashHighlight 1.5s ease-in-out 3' : 'none',
                          }}
                          onMouseEnter={(e) => {
                            if (!isHighlighted) {
                              e.currentTarget.style.backgroundColor = '#f0f0f0'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isHighlighted) {
                              e.currentTarget.style.backgroundColor =
                                index % 2 === 0 ? '#f8f9fa' : '#FFFFFF'
                            } else {
                              e.currentTarget.style.backgroundColor = '#FFF9E6'
                            }
                          }}
                        >
                          <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                            {batch.batch_number}
                          </td>
                          <td className="py-3 px-4 text-sm text-right" style={{ color: '#113543' }}>
                            {batch.total_invoices}
                          </td>
                          <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                            {formatCurrency(batch.total_amount)}
                          </td>
                          <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                            {formatDate(batch.submitted_at)}
                          </td>
                          <td className="py-3 px-4 text-sm">{getStatusBadge(batch.status)}</td>
                          <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                            {batch.reviewed_at ? formatDate(batch.reviewed_at) : '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedBatch(batch.id)
                              }}
                              className="px-3 py-1 text-sm font-medium transition-colors"
                              style={{
                                backgroundColor: '#113543',
                                color: '#FFFFFF',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#0d2a35'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#113543'
                              }}
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
          </div>
        )}
      </main>

      {/* Document Upload Modal */}
      {showDocumentUploadModal && currentInvoiceForDocuments && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            className="bg-white rounded-lg shadow-xl max-w-[1400px] w-full mx-4 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between p-6 border-b"
              style={{ borderColor: '#819291' }}
            >
              <div>
                <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                  Upload Documents
                </h3>
                <p className="text-sm mt-1" style={{ color: '#819291' }}>
                  Invoice #{currentInvoiceForDocuments.invoice_number}
                </p>
              </div>
              <button
                onClick={handleDocumentUploadSkip}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
                style={{ color: '#113543' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {/* Invoice Info */}
              <div className="mb-6 p-4 rounded" style={{ backgroundColor: '#f8f9fa' }}>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium" style={{ color: '#819291' }}>Broker:</span>
                    <span className="ml-2" style={{ color: '#113543' }}>
                      {currentInvoiceForDocuments.broker_name}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium" style={{ color: '#819291' }}>Amount:</span>
                    <span className="ml-2" style={{ color: '#113543' }}>
                      {formatCurrency(parseFloat(currentInvoiceForDocuments.amount || '0'))}
                    </span>
                  </div>
                  {currentInvoiceForDocuments.load_number && (
                    <div>
                      <span className="font-medium" style={{ color: '#819291' }}>Load#:</span>
                      <span className="ml-2" style={{ color: '#113543' }}>
                        {currentInvoiceForDocuments.load_number}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* File Upload Area */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                  Upload Documents
                </label>
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center transition-colors"
                  style={{
                    borderColor: '#819291',
                    backgroundColor: '#f8f9fa',
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.currentTarget.style.borderColor = '#C2A558'
                    e.currentTarget.style.backgroundColor = '#f0f0f0'
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    e.currentTarget.style.borderColor = '#819291'
                    e.currentTarget.style.backgroundColor = '#f8f9fa'
                  }}
                  onDrop={async (e) => {
                    e.preventDefault()
                    e.currentTarget.style.borderColor = '#819291'
                    e.currentTarget.style.backgroundColor = '#f8f9fa'
                    const files = e.dataTransfer.files
                    if (files.length > 0) {
                      const processedDocuments = await processFiles(files)
                      setUploadedDocuments((prev) => [...prev, ...processedDocuments])
                      setDocumentReviewResult(null)
                      setDocumentReviewError(null)
                    }
                  }}
                >
                  <Upload className="w-12 h-12 mx-auto mb-4" style={{ color: '#819291' }} />
                  <p className="text-sm mb-2" style={{ color: '#113543' }}>
                    Drag and drop files here, or
                  </p>
                  <label
                    htmlFor="file-upload"
                    className="inline-block px-4 py-2 text-sm font-medium cursor-pointer transition-colors"
                    style={{
                      backgroundColor: '#113543',
                      color: '#FFFFFF',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#0d2a35'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#113543'
                    }}
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
                  <p className="text-xs mt-2" style={{ color: '#819291' }}>
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
                  <h4 className="text-sm font-medium mb-3" style={{ color: '#113543' }}>
                    Uploaded Documents ({uploadedDocuments.length})
                  </h4>
                  <div className="space-y-2">
                    {uploadedDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded border"
                        style={{
                          borderColor: '#819291',
                          backgroundColor: '#FFFFFF',
                        }}
                      >
                        <div className="flex items-center space-x-3">
                          <FileText className="w-5 h-5" style={{ color: '#819291' }} />
                          <div>
                            <p className="text-sm font-medium" style={{ color: '#113543' }}>
                              {doc.name}
                            </p>
                            <p className="text-xs" style={{ color: '#819291' }}>
                              {formatFileSize(doc.size)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveDocument(doc.id)}
                          className="p-1 hover:bg-red-50 rounded transition-colors"
                          style={{ color: '#819291' }}
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
              style={{ borderColor: '#819291' }}
            >
              <button
                onClick={handleDocumentUploadSkip}
                className="px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  color: '#113543',
                  border: '1px solid #819291',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8f9fa'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF'
                }}
              >
                {isEditingExistingInvoice ? 'Cancel' : 'Skip'}
              </button>
              <button
                onClick={handleDocumentUploadComplete}
                className="px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: '#113543',
                  color: '#FFFFFF',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#0d2a35'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#113543'
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

      {/* Invoice Detail Modal */}
      {showInvoiceDetailModal && viewingInvoiceDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10"
              style={{ borderColor: '#819291' }}
            >
              <div>
                <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                  Invoice Details
                </h3>
                <p className="text-sm mt-1" style={{ color: '#819291' }}>
                  {viewingInvoiceDetail.invoice_number}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowInvoiceDetailModal(false)
                  setViewingInvoiceDetail(null)
                }}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
                style={{ color: '#113543' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {/* Invoice Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="border p-4 rounded" style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}>
                  <div className="text-sm mb-1" style={{ color: '#819291' }}>Amount</div>
                  <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                    {formatCurrency(parseFloat(viewingInvoiceDetail.amount || '0'))}
                  </div>
                </div>
                <div className="border p-4 rounded" style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}>
                  <div className="text-sm mb-1" style={{ color: '#819291' }}>Invoice Date</div>
                  <div className="text-lg font-medium" style={{ color: '#113543' }}>
                    {viewingInvoiceDetail.invoice_date ? formatDate(viewingInvoiceDetail.invoice_date) : '-'}
                  </div>
                </div>
                <div className="border p-4 rounded" style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}>
                  <div className="text-sm mb-1" style={{ color: '#819291' }}>Documents</div>
                  <div className="text-lg font-medium flex items-center space-x-1" style={{ color: '#113543' }}>
                    <FileText className="w-4 h-4" />
                    <span>{viewingInvoiceDetail.documents?.length || 0}</span>
                  </div>
                </div>
              </div>

              {/* Invoice Information */}
              <div className="space-y-4 mb-6">
                <div className="border p-4 rounded" style={{ borderColor: '#819291' }}>
                  <h4 className="text-sm font-semibold mb-3" style={{ color: '#113543' }}>
                    Invoice Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium" style={{ color: '#819291' }}>Invoice Number:</span>
                      <span className="ml-2" style={{ color: '#113543' }}>
                        {viewingInvoiceDetail.invoice_number}
                      </span>
                    </div>
                    {viewingInvoiceDetail.load_number && (
                      <div>
                        <span className="font-medium" style={{ color: '#819291' }}>Load Number:</span>
                        <span className="ml-2" style={{ color: '#113543' }}>
                          {viewingInvoiceDetail.load_number}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="font-medium" style={{ color: '#819291' }}>Broker:</span>
                      <span className="ml-2" style={{ color: '#113543' }}>
                        {viewingInvoiceDetail.broker_name}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium" style={{ color: '#819291' }}>Broker Address:</span>
                      <span className="ml-2" style={{ color: '#113543' }}>
                        {viewingInvoiceDetail.broker_address || '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {viewingInvoiceDetail.notes && (
                  <div className="border p-4 rounded" style={{ borderColor: '#819291' }}>
                    <h4 className="text-sm font-semibold mb-2" style={{ color: '#113543' }}>
                      Notes
                    </h4>
                    <p className="text-sm" style={{ color: '#113543' }}>
                      {viewingInvoiceDetail.notes}
                    </p>
                  </div>
                )}

                {/* Documents Section */}
                {viewingInvoiceDetail.documents && viewingInvoiceDetail.documents.length > 0 && (
                  <div className="border p-4 rounded" style={{ borderColor: '#819291' }}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold" style={{ color: '#113543' }}>
                        Documents ({viewingInvoiceDetail.documents.length})
                      </h4>
                      <button
                        onClick={() => {
                          setShowInvoiceDetailModal(false)
                          handleViewDocuments(viewingInvoiceDetail)
                        }}
                        className="px-3 py-1 text-xs font-medium rounded transition-colors"
                        style={{
                          color: '#113543',
                          border: '1px solid #819291',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8f9fa'
                          e.currentTarget.style.borderColor = '#C2A558'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#FFFFFF'
                          e.currentTarget.style.borderColor = '#819291'
                        }}
                      >
                        <Eye className="w-3 h-3 inline mr-1" />
                        View All
                      </button>
                    </div>
                    <div className="space-y-2">
                      {viewingInvoiceDetail.documents.slice(0, 3).map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-2 rounded"
                          style={{ backgroundColor: '#f8f9fa' }}
                        >
                          <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4" style={{ color: '#819291' }} />
                            <span className="text-sm" style={{ color: '#113543' }}>
                              {doc.name}
                            </span>
                          </div>
                          <span className="text-xs" style={{ color: '#819291' }}>
                            {formatFileSize(doc.size)}
                          </span>
                        </div>
                      ))}
                      {viewingInvoiceDetail.documents.length > 3 && (
                        <p className="text-xs text-center" style={{ color: '#819291' }}>
                          +{viewingInvoiceDetail.documents.length - 3} more document(s)
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className="flex items-center justify-end space-x-3 p-6 border-t"
              style={{ borderColor: '#819291' }}
            >
              {viewingInvoiceDetail.documents && viewingInvoiceDetail.documents.length > 0 && (
                <button
                  onClick={() => {
                    setShowInvoiceDetailModal(false)
                    handleViewDocuments(viewingInvoiceDetail)
                  }}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    color: '#113543',
                    border: '1px solid #819291',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8f9fa'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF'
                  }}
                >
                  <Eye className="w-4 h-4 inline mr-2" />
                  View Documents
                </button>
              )}
              <button
                onClick={() => {
                  setShowInvoiceDetailModal(false)
                  setViewingInvoiceDetail(null)
                }}
                className="px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: '#113543',
                  color: '#FFFFFF',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#0d2a35'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#113543'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
