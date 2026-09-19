import jsPDF from 'jspdf'
import type { Client } from '../types/client'
import type { ClientBill, PeriodBilledInvoice } from '../types/billing'
import { formatCurrency } from './format'
import { parseBillingPeriod } from '../services/arBillingService'

export interface CarrierBillingPdfInput {
  client: Client
  bill: ClientBill
  feeTermsLabel: string
  collectedVolume: number
  billedInvoices: PeriodBilledInvoice[]
  paymentUrl?: string
}

const COLORS = {
  navy: [15, 23, 42] as const,
  blue: [22, 132, 254] as const,
  ink: [15, 23, 42] as const,
  body: [51, 65, 85] as const,
  muted: [100, 116, 139] as const,
  line: [226, 232, 240] as const,
  wash: [248, 250, 252] as const,
  white: [255, 255, 255] as const,
  green: [4, 120, 87] as const,
}

function periodLabel(periodKey: string): string {
  const parsed = parseBillingPeriod(periodKey)
  return new Date(parsed.year, parsed.month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function formatDueDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Short display id for the PDF (period-based, not internal bill-*). */
function invoiceNumberLabel(bill: ClientBill): string {
  return `INV-${bill.period}`
}

/** Load Credyx wordmark for PDF (white Cred + blue yx on navy header). */
async function loadCredyxLogoBase64(): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  try {
    const response = await fetch('/credyx-logo-white-cred-no-bg.png')
    const contentType = response.headers.get('content-type') || ''
    if (!response.ok || !contentType.startsWith('image/')) return null
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return null
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        if (result?.startsWith('data:image')) resolve(result)
        else reject(new Error('Invalid image data'))
      }
      reader.onerror = () => reject(new Error('FileReader error'))
      reader.readAsDataURL(blob)
    })
    return {
      dataUrl,
      format: blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'JPEG' : 'PNG',
    }
  } catch {
    return null
  }
}

function drawEyebrow(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text(text.toUpperCase(), x, y)
}

function drawWordmarkFallback(doc: jsPDF, x: number, y: number) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...COLORS.white)
  doc.text('Cred', x, y)
  const credW = doc.getTextWidth('Cred')
  doc.setTextColor(...COLORS.blue)
  doc.text('yx', x + credW, y)
}

/**
 * Credyx monthly fee invoice PDF — branded header with logo, clean layout.
 */
export async function generateCarrierBillingPdf(
  input: CarrierBillingPdfInput
): Promise<File> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 48
  const contentW = pageW - margin * 2
  const logo = await loadCredyxLogoBase64()
  let y = 0

  const ensureSpace = (need: number) => {
    if (y + need <= pageH - 56) return
    doc.addPage()
    y = margin
  }

  // —— Header ——
  const headerH = 92
  doc.setFillColor(...COLORS.navy)
  doc.rect(0, 0, pageW, headerH, 'F')
  doc.setFillColor(...COLORS.blue)
  doc.rect(0, headerH, pageW, 3, 'F')

  if (logo) {
    // Wordmark sized for header (~168×40)
    doc.addImage(logo.dataUrl, logo.format, margin, 26, 168, 40)
  } else {
    drawWordmarkFallback(doc, margin, 52)
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text('A/R SOLUTIONS', pageW - margin, 38, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.white)
  doc.text('Monthly invoice', pageW - margin, 56, { align: 'right' })

  y = headerH + 36

  // —— Title row ——
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...COLORS.ink)
  doc.text(periodLabel(input.bill.period), margin, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  doc.text(invoiceNumberLabel(input.bill), pageW - margin, y, { align: 'right' })
  y += 28

  // —— Bill to / details ——
  const midX = margin + contentW / 2 + 16
  drawEyebrow(doc, 'Bill to', margin, y)
  drawEyebrow(doc, 'Details', midX, y)
  y += 14

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...COLORS.ink)
  doc.text(input.client.name, margin, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.body)
  doc.text(`Issued  ${formatDueDate(input.bill.issued_at)}`, midX, y)
  y += 15

  if (input.client.email) {
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.muted)
    doc.text(input.client.email, margin, y)
  }
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.body)
  doc.text(`Fee terms  ${input.feeTermsLabel}`, midX, y)
  y += 15
  doc.text(`Collected  ${formatCurrency(input.collectedVolume)}`, midX, y)
  y += 26

  // —— Amount due card ——
  ensureSpace(78)
  const cardH = 72
  doc.setFillColor(...COLORS.wash)
  doc.setDrawColor(...COLORS.line)
  doc.roundedRect(margin, y, contentW, cardH, 8, 8, 'FD')
  doc.setFillColor(...COLORS.blue)
  doc.roundedRect(margin, y, 4, cardH, 2, 2, 'F')

  const cardPad = margin + 22
  drawEyebrow(doc, 'Amount due', cardPad, y + 22)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(...COLORS.blue)
  doc.text(formatCurrency(input.bill.amount), cardPad, y + 50)

  drawEyebrow(doc, 'Pay by', midX, y + 22)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...COLORS.ink)
  doc.text(formatDueDate(input.bill.due_at), midX, y + 48)
  y += cardH + 28

  // —— Charges ——
  ensureSpace(40)
  drawEyebrow(doc, 'Charges', margin, y)
  y += 8
  doc.setDrawColor(...COLORS.line)
  doc.setLineWidth(0.6)
  doc.line(margin, y, pageW - margin, y)
  y += 16

  if (input.bill.line_items.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...COLORS.muted)
    doc.text('No charges this period.', margin, y)
    y += 18
  } else {
    for (const li of input.bill.line_items) {
      ensureSpace(22)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...COLORS.body)
      const desc = doc.splitTextToSize(li.description, contentW - 100)
      doc.text(desc, margin, y)
      doc.setFont('helvetica', 'bold')
      const amountColor = li.amount < 0 ? COLORS.green : COLORS.ink
      doc.setTextColor(amountColor[0], amountColor[1], amountColor[2])
      doc.text(formatCurrency(li.amount), pageW - margin, y, { align: 'right' })
      y += Math.max(18, desc.length * 13)
    }
  }

  ensureSpace(28)
  y += 6
  doc.setDrawColor(...COLORS.line)
  doc.line(margin, y, pageW - margin, y)
  y += 16
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.ink)
  doc.text('Total due', margin, y)
  doc.setTextColor(...COLORS.blue)
  doc.text(formatCurrency(input.bill.amount), pageW - margin, y, { align: 'right' })
  y += 30

  // —— Loads ——
  ensureSpace(48)
  drawEyebrow(doc, 'Loads this period', margin, y)
  y += 8
  doc.setDrawColor(...COLORS.line)
  doc.line(margin, y, pageW - margin, y)
  y += 14

  const colInvoice = margin
  const colBroker = margin + 128
  const colCollected = margin + 318
  const colFee = pageW - margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text('INVOICE', colInvoice, y)
  doc.text('BROKER', colBroker, y)
  doc.text('COLLECTED', colCollected, y)
  doc.text('FEE', colFee, y, { align: 'right' })
  y += 6
  doc.setDrawColor(...COLORS.line)
  doc.line(margin, y, pageW - margin, y)
  y += 12

  if (input.billedInvoices.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...COLORS.muted)
    doc.text('No loads collected or closed this period.', margin, y)
    y += 16
  } else {
    let rowIndex = 0
    for (const row of input.billedInvoices) {
      ensureSpace(32)
      if (rowIndex % 2 === 0) {
        doc.setFillColor(...COLORS.wash)
        doc.rect(margin - 4, y - 10, contentW + 8, 28, 'F')
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...COLORS.ink)
      doc.text(doc.splitTextToSize(row.invoiceNumber, 118), colInvoice, y)

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.body)
      doc.text(doc.splitTextToSize(row.brokerName || '—', 170), colBroker, y)
      doc.text(formatCurrency(row.collectedAmount || row.invoiceAmount), colCollected, y)
      doc.setFont('helvetica', 'bold')
      doc.text(formatCurrency(row.fee), colFee, y, { align: 'right' })

      y += 11
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...COLORS.muted)
      const sub =
        (row.loadNumber ? `Load ${row.loadNumber} · ` : '') +
        (row.closedByCredyx ? 'Closed by Credyx' : 'Paid')
      doc.text(sub, colInvoice, y)
      y += 16
      rowIndex += 1
    }
  }

  // —— Pay link ——
  if (input.paymentUrl) {
    y += 14
    ensureSpace(44)
    drawEyebrow(doc, 'Pay online', margin, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.blue)
    const urlLines = doc.splitTextToSize(input.paymentUrl, contentW)
    doc.text(urlLines, margin, y)
  }

  // —— Footer on every page ——
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i)
    doc.setDrawColor(...COLORS.line)
    doc.setLineWidth(0.5)
    doc.line(margin, pageH - 40, pageW - margin, pageH - 40)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.ink)
    doc.text('Credyx · Paid on time', margin, pageH - 26)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.muted)
    doc.text('billing@credyx.net', pageW / 2, pageH - 26, { align: 'center' })
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 26, { align: 'right' })
  }

  const blob = doc.output('blob')
  const fileName = `Credyx-invoice-${input.bill.period}.pdf`
  return new File([blob], fileName, { type: 'application/pdf' })
}
