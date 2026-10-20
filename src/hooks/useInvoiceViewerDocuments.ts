import { useCallback, useEffect, useState } from 'react'
import type { Invoice } from '../types/invoice'
import {
  getInvoiceDocumentsForViewer,
  type InvoiceDocumentViewerItem,
} from '../services/invoiceDocumentStore'
import { resolveInvoiceDocumentsAsync } from '../utils/resolveInvoiceDocuments'
import { useClientSession } from './useClientSession'
import { useToast } from '../components/ui/ToastProvider'
import { uploadClientInvoiceDocuments } from '../services/clientInvoiceActions'
import { buildInvoicePacket, invoicePacketFileName } from '../utils/buildInvoicePacket'

/** Real files for an invoice, merged into a single packet PDF when there are several. */
async function loadPacketDocuments(invoice: Invoice): Promise<InvoiceDocumentViewerItem[]> {
  const docs = await resolveInvoiceDocumentsAsync(invoice)
  if (docs.length === 0) return []

  const { packet, rest } = await buildInvoicePacket(
    docs.map((d) => ({ name: d.name, file: d.file })),
    invoicePacketFileName(invoice.invoice_number)
  )
  if (!packet) return docs

  const restNames = new Set(rest.map((r) => r.name))
  return [
    {
      id: `packet-${invoice.id}`,
      name: packet.name,
      type: 'application/pdf',
      size: packet.size,
      file: packet,
    },
    ...docs.filter((d) => restNames.has(d.name)),
  ]
}

/**
 * Documents for DocumentViewer: the invoice's paperwork as one packet (real files from the
 * batch store or Supabase storage), falling back to placeholders while loading/offline.
 */
export function useInvoiceViewerDocuments(invoice: Invoice | null): {
  documents: InvoiceDocumentViewerItem[]
  loading: boolean
  /** Client upload of additional documents; refreshes the packet when done. */
  upload: (files: File[]) => Promise<void>
} {
  const { clientName } = useClientSession()
  const { showToast } = useToast()
  const [reloadKey, setReloadKey] = useState(0)
  const [resolved, setResolved] = useState<{ id: string; docs: InvoiceDocumentViewerItem[] } | null>(
    null
  )
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    if (!invoice) return
    let cancelled = false
    setLoadingId(invoice.id)
    void loadPacketDocuments(invoice)
      .then((docs) => {
        if (cancelled || docs.length === 0) return
        setResolved({ id: invoice.id, docs })
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingId(null)
      })
    return () => {
      cancelled = true
    }
  }, [invoice, reloadKey])

  const upload = useCallback(
    async (files: File[]) => {
      if (!invoice || files.length === 0) return
      try {
        const updated = await uploadClientInvoiceDocuments(
          invoice.id,
          files,
          clientName || 'Client'
        )
        if (!updated) throw new Error('Upload failed')
        showToast(
          'Documents uploaded. Credyx is reviewing and will advise if further action is required.',
          'success'
        )
        setReloadKey((k) => k + 1)
      } catch (error) {
        console.error('Failed to upload documents:', error)
        showToast('Upload failed. Please try again.', 'error')
      }
    },
    [invoice, clientName, showToast]
  )

  if (!invoice) return { documents: [], loading: false, upload }
  if (resolved && resolved.id === invoice.id) {
    return { documents: resolved.docs, loading: false, upload }
  }
  return {
    documents: getInvoiceDocumentsForViewer(invoice),
    loading: loadingId === invoice.id,
    upload,
  }
}
