import jsPDF from 'jspdf'
import { formatCurrency, formatDate } from './format'
import { loadCredyxLogoBase64 } from './generateCarrierBillingPdf'

export interface CarrierStatementPdfInput {
  carrierName: string
  /** e.g. "September 2026" */
  periodLabel: string
  startDate: string
  endDate: string
  summary: {
    invoiced: number
    invoiceCount: number
    collected: number
    paymentCount: number
    fees: number
    net: number
    openAr: number
  }
  /** Shown under the fee line, e.g. "Estimated from your fee terms (3%)". */
  feeNote: string
  byBroker: Array<{ broker: string; invoiced: number; collected: number }>
  payments: Array<{ date: string; invoice: string; broker: string; method: string; amount: number }>
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
}

/** Monthly carrier statement — invoiced, collected, fees, net, by broker, and payments. */
export async function generateCarrierStatementPdf(input: CarrierStatementPdfInput): Promise<void> {
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

  const eyebrow = (text: string, x: number, at: number) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.muted)
    doc.text(text.toUpperCase(), x, at)
  }

  // Header band
  const headerH = 92
  doc.setFillColor(...COLORS.navy)
  doc.rect(0, 0, pageW, headerH, 'F')
  doc.setFillColor(...COLORS.blue)
  doc.rect(0, headerH, pageW, 3, 'F')
  if (logo) {
    doc.addImage(logo.dataUrl, logo.format, margin, 26, 168, 40)
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(...COLORS.white)
    doc.text('Credyx', margin, 52)
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text('A/R SOLUTIONS', pageW - margin, 38, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.white)
  doc.text('Carrier statement', pageW - margin, 56, { align: 'right' })

  y = headerH + 36
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...COLORS.ink)
  doc.text(input.periodLabel, margin, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  doc.text(`${formatDate(input.startDate)} – ${formatDate(input.endDate)}`, pageW - margin, y, {
    align: 'right',
  })
  y += 20
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.body)
  doc.text(input.carrierName, margin, y)
  y += 28

  // Summary card: four figures across
  const cardH = 76
  doc.setFillColor(...COLORS.wash)
  doc.setDrawColor(...COLORS.line)
  doc.roundedRect(margin, y, contentW, cardH, 8, 8, 'FD')
  const cells = [
    { label: 'Invoiced', value: formatCurrency(input.summary.invoiced), sub: `${input.summary.invoiceCount} invoices` },
    { label: 'Collected', value: formatCurrency(input.summary.collected), sub: `${input.summary.paymentCount} payments` },
    { label: 'Credyx fees', value: formatCurrency(input.summary.fees), sub: 'Estimated' },
    { label: 'Net to you', value: formatCurrency(input.summary.net), sub: 'Collected - fees' },
  ]
  const cellW = contentW / cells.length
  cells.forEach((cell, i) => {
    const x = margin + 18 + i * cellW
    eyebrow(cell.label, x, y + 22)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    const [r, g, b] = i === 3 ? COLORS.blue : COLORS.ink
    doc.setTextColor(r, g, b)
    doc.text(cell.value, x, y + 44)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.muted)
    doc.text(cell.sub, x, y + 60)
  })
  y += cardH + 14
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text(
    `${input.feeNote}  ·  Open A/R today: ${formatCurrency(input.summary.openAr)}`,
    margin,
    y
  )
  y += 30

  const table = (
    title: string,
    columns: Array<{ label: string; width: number; align?: 'left' | 'right' }>,
    rows: string[][],
    empty: string
  ) => {
    ensureSpace(60)
    eyebrow(title, margin, y)
    y += 12
    doc.setDrawColor(...COLORS.line)
    doc.line(margin, y, pageW - margin, y)
    y += 14
    const drawHead = () => {
      let x = margin
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...COLORS.muted)
      for (const col of columns) {
        const tx = col.align === 'right' ? x + col.width : x
        doc.text(col.label, tx, y, { align: col.align === 'right' ? 'right' : 'left' })
        x += col.width
      }
      y += 14
    }
    drawHead()
    if (rows.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...COLORS.muted)
      doc.text(empty, margin, y)
      y += 24
      return
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    for (const row of rows) {
      if (y + 16 > pageH - 56) {
        doc.addPage()
        y = margin
        drawHead()
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
      }
      let x = margin
      doc.setTextColor(...COLORS.body)
      row.forEach((cell, i) => {
        const col = columns[i]
        const text = doc.splitTextToSize(cell, col.width - 8)[0] ?? ''
        const tx = col.align === 'right' ? x + col.width : x
        doc.text(text, tx, y, { align: col.align === 'right' ? 'right' : 'left' })
        x += col.width
      })
      y += 16
    }
    y += 18
  }

  table(
    'By broker',
    [
      { label: 'Broker', width: contentW * 0.5 },
      { label: 'Invoiced', width: contentW * 0.25, align: 'right' },
      { label: 'Collected', width: contentW * 0.25, align: 'right' },
    ],
    input.byBroker.map((b) => [b.broker, formatCurrency(b.invoiced), formatCurrency(b.collected)]),
    'No broker activity this month.'
  )

  table(
    'Payments received',
    [
      { label: 'Date', width: contentW * 0.16 },
      { label: 'Invoice', width: contentW * 0.16 },
      { label: 'Broker', width: contentW * 0.36 },
      { label: 'Method', width: contentW * 0.14 },
      { label: 'Amount', width: contentW * 0.18, align: 'right' },
    ],
    input.payments.map((p) => [formatDate(p.date), p.invoice, p.broker, p.method, formatCurrency(p.amount)]),
    'No payments received this month.'
  )

  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.muted)
    doc.text('Credyx A/R Solutions · Carrier statement', margin, pageH - 28)
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 28, { align: 'right' })
  }

  const slug = input.periodLabel.toLowerCase().replace(/\s+/g, '-')
  doc.save(`credyx-statement-${slug}.pdf`)
}
