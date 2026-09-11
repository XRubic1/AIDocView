import { generateInvoicePDFFile, type InvoicePDFInput } from '../../../utils/generateInvoicePDF'
import type { DocSortLoadGroup } from '../types'
import { invoiceFieldsFromLoadGroup } from '../utils/formatRate'

function todayUs(): string {
  const d = new Date()
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

/** Pre-fill invoice fields from the rate con / BOL fingerprints in a sorted load. */
export function buildInvoiceDraftFromGroup(group: DocSortLoadGroup): InvoicePDFInput {
  const fields = invoiceFieldsFromLoadGroup(group)
  const load = fields.loadNumber || group.label

  return {
    invoiceNumber: `INV-${load}-${Date.now().toString().slice(-6)}`,
    invoiceDate: todayUs(),
    invoiceAmount: fields.rateAmount,
    loadNumber: load,
    brokerName: fields.brokerName,
    brokerAddress: '',
    carrierName: fields.carrierName,
    clientName: fields.brokerName || 'Client',
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
