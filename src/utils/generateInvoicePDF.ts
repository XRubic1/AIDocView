import jsPDF from 'jspdf'
import { generateInvoice } from '../../pdfTemplate'

export interface InvoicePDFInput {
  invoiceNumber: string
  invoiceDate: string
  invoiceAmount: number
  loadNumber?: string
  brokerName: string
  brokerAddress?: string
  carrierName: string
  clientName?: string
  clientAddress?: string
  clientAddressLines?: string
  remittanceInfo?: string
  bankName?: string
  accountNumber?: string
  routingNumber?: string
  routingType?: 'ACH' | 'WIRE'
}

/** Loads the app logo from the public folder as a base64 data URL. */
async function loadLogoBase64(): Promise<string | undefined> {
  try {
    const response = await fetch('/Logo.png')
    const contentType = response.headers.get('content-type') || ''
    if (!response.ok || !contentType.startsWith('image/')) {
      return undefined
    }

    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) {
      return undefined
    }

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        if (result?.startsWith('data:image')) {
          resolve(result)
        } else {
          reject(new Error('Invalid image data'))
        }
      }
      reader.onerror = () => reject(new Error('FileReader error'))
      reader.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

/** A4 page size at 96 DPI — matches jsPDF A4 dimensions when rendered full bleed. */
const A4_WIDTH_PX = 794
const A4_HEIGHT_PX = 1123

/** Removes full-viewport min-heights and expands layout to full A4 page. */
function prepareContainerForCapture(iframeDoc: Document, container: HTMLElement) {
  const body = iframeDoc.body
  body.style.minHeight = `${A4_HEIGHT_PX}px`
  body.style.height = `${A4_HEIGHT_PX}px`
  body.style.width = `${A4_WIDTH_PX}px`
  body.style.padding = '0'
  body.style.margin = '0'
  body.style.background = '#ffffff'

  container.style.minHeight = `${A4_HEIGHT_PX}px`
  container.style.height = `${A4_HEIGHT_PX}px`
  container.style.width = '100%'
  container.style.maxWidth = 'none'
  container.style.margin = '0'
  container.style.border = 'none'
  container.style.paddingBottom = '0'
  container.style.display = 'flex'
  container.style.flexDirection = 'column'

  const content = container.querySelector('.content') as HTMLElement | null
  if (content) {
    content.style.flex = '1'
    content.style.display = 'flex'
    content.style.flexDirection = 'column'
    content.style.padding = '16px 36px 12px'
  }

  const invDocument = container.querySelector('.inv-document') as HTMLElement | null
  if (invDocument) {
    invDocument.style.flex = '1'
    invDocument.style.display = 'flex'
    invDocument.style.flexDirection = 'column'
    invDocument.style.minHeight = '100%'
  }

  const footer = container.querySelector('.footer') as HTMLElement | null
  if (footer) {
    footer.style.marginTop = 'auto'
    footer.style.position = 'relative'
  }
}

/** Renders a canvas snapshot onto a single full-bleed A4 PDF page. */
function canvasToSinglePagePDF(canvas: HTMLCanvasElement): jsPDF {
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgData = canvas.toDataURL('image/png')

  pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight)

  return pdf
}

/** Generates a PDF invoice file from invoice detail fields. */
export async function generateInvoicePDFFile(input: InvoicePDFInput): Promise<File> {
  const logoBase64 = await loadLogoBase64()

  const invoiceHTML = generateInvoice({
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    invoiceAmount: input.invoiceAmount,
    loadNumber: input.loadNumber,
    brokerName: input.brokerName,
    brokerAddress: input.brokerAddress,
    carrierName: input.carrierName,
    clientName: input.clientName,
    clientAddress: input.clientAddress,
    clientAddressLines: input.clientAddressLines,
    remittanceInfo: input.remittanceInfo,
    bankName: input.bankName,
    accountNumber: input.accountNumber,
    routingNumber: input.routingNumber,
    routingType: input.routingType || 'ACH',
    charges: [{ description: 'Linehaul', amount: input.invoiceAmount }],
    logoBase64,
  })

  const iframe = document.createElement('iframe')
  iframe.style.position = 'absolute'
  iframe.style.left = '-9999px'
  iframe.style.width = `${A4_WIDTH_PX}px`
  iframe.style.height = `${A4_HEIGHT_PX}px`
  iframe.style.border = 'none'
  iframe.style.overflow = 'hidden'
  document.body.appendChild(iframe)

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve()
    iframe.src = 'about:blank'
  })

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
  if (!iframeDoc) {
    document.body.removeChild(iframe)
    throw new Error('Could not access iframe document')
  }

  iframeDoc.open()
  iframeDoc.write(invoiceHTML)
  iframeDoc.close()

  await new Promise<void>((resolve) => {
    setTimeout(() => {
      const images = iframeDoc.getElementsByTagName('img')
      if (images.length === 0) {
        setTimeout(resolve, 300)
        return
      }

      let loadedCount = 0
      const checkComplete = () => {
        loadedCount++
        if (loadedCount === images.length) {
          setTimeout(resolve, 500)
        }
      }

      Array.from(images).forEach((img) => {
        if (img.src?.startsWith('data:text/html') || img.src?.includes('text/html')) {
          checkComplete()
          return
        }

        img.style.display = 'block'
        img.style.visibility = 'visible'
        img.style.opacity = '1'

        if (img.complete) {
          checkComplete()
        } else {
          img.onload = checkComplete
          img.onerror = checkComplete
        }
      })
    }, 100)
  })

  const container = iframeDoc.querySelector('.container') as HTMLElement
  if (!container) {
    document.body.removeChild(iframe)
    throw new Error('Could not find container element')
  }

  prepareContainerForCapture(iframeDoc, container)
  await new Promise((resolve) => setTimeout(resolve, 150))

  const { default: html2canvas } = await import('html2canvas')

  const canvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: '#ffffff',
    width: A4_WIDTH_PX,
    height: A4_HEIGHT_PX,
    windowWidth: A4_WIDTH_PX,
    windowHeight: A4_HEIGHT_PX,
  })

  document.body.removeChild(iframe)

  const pdf = canvasToSinglePagePDF(canvas)

  const pdfBlob = pdf.output('blob')
  const safeDate = input.invoiceDate.replace(/\//g, '-')
  const fileName = `Invoice_${input.invoiceNumber}_${safeDate}.pdf`

  return new File([pdfBlob], fileName, { type: 'application/pdf' })
}
