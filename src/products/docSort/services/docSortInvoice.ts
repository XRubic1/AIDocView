import { generateInvoicePDFFile, type InvoicePDFInput } from '../../../utils/generateInvoicePDF'
import type { DocSortLoadGroup } from '../types'
import { primaryRateCon } from '../utils/formatRate'

function todayUs(): string {
  const d = new Date()
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

/** Pre-fill invoice fields from the rate con in a sorted load group. */
export function buildInvoiceDraftFromGroup(group: DocSortLoadGroup): InvoicePDFInput {
  const rateCon = primaryRateCon(group)
  const load = group.label
  const aiRate = rateCon?.rateAmount && rateCon.rateAmount > 0 ? rateCon.rateAmount : 0

  return {
    invoiceNumber: `INV-${load}-${Date.now().toString().slice(-6)}`,
    invoiceDate: todayUs(),
    invoiceAmount: aiRate,
    loadNumber: load,
    brokerName: rateCon?.broker?.trim() || 'Broker',
    brokerAddress: '',
    carrierName: rateCon?.carrier?.trim() || 'Carrier',
    clientName: rateCon?.broker?.trim() || 'Client',
    clientAddress: '',
    remittanceInfo: '',
  }
}

/** Render invoice PDF and trigger browser download. Filename uses invoice #. */
export async function generateAndDownloadInvoice(input: InvoicePDFInput): Promise<File> {
  const file = await generateInvoicePDFFile(input)
  const safeInv = input.invoiceNumber.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Invoice'
  const safeDate = input.invoiceDate.replace(/\//g, '-')
  const downloadName = `${safeInv}_${safeDate}.pdf`
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = downloadName
  anchor.click()
  URL.revokeObjectURL(url)
  return new File([file], downloadName, { type: 'application/pdf' })
}
