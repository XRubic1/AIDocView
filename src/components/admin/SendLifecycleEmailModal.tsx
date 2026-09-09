/**
 * Send a lifecycle system email (claim scope, etc.) from Credyx and log it on the load thread.
 */
import { useState } from 'react'
import { X } from 'lucide-react'
import { getInvoiceById } from '../../data/mockInvoices'
import { sendClaimScopeEmail } from '../../services/emailLifecycleService'
import { sendTransactionalEmail } from '../../services/emailService'
import { recordOutboundMessage } from '../../services/emailLifecycleService'
import { mockBrokers } from '../../data/mockBrokers'
import { resolveBrokerPaperworkEmail } from '../../utils/paperworkSender'
import { getClientById } from '../../services/clientRegistry'
import { defaultPortalLink } from '../../utils/carrierAttentionLink'
import { useToast } from '../ui/ToastProvider'
import type { EmailTemplateId } from '../../config/emailTemplateDefaults'

export default function SendLifecycleEmailModal({
  invoiceId,
  templateId,
  onClose,
}: {
  invoiceId: string
  templateId: EmailTemplateId
  onClose: () => void
}) {
  const { showToast } = useToast()
  const invoice = getInvoiceById(invoiceId)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  if (!invoice) return null

  const send = async () => {
    setSending(true)
    try {
      if (templateId === 'broker_claim_scope') {
        const result = await sendClaimScopeEmail(invoice, message)
        if (!result.ok) {
          showToast(result.error ?? 'Send failed', 'error')
          return
        }
        showToast('Claim-scope email sent', 'success')
        onClose()
        return
      }
      const broker = mockBrokers.find((b) => b.id === invoice.broker_id)
      const client = getClientById(invoice.client_id)
      const to =
        templateId.startsWith('carrier_') ? client?.email : resolveBrokerPaperworkEmail(broker)
      if (!to) {
        showToast('No recipient email', 'error')
        return
      }
      const result = await sendTransactionalEmail(templateId, to, {
        brokerName: broker?.name || invoice.broker_name,
        clientName: invoice.client_name,
        contactName: client?.contact_person || 'there',
        invoiceNumber: invoice.invoice_number,
        loadNumber: invoice.load_number || 'N/A',
        message,
        summary: message,
        portalLink: `${defaultPortalLink()}/client/invoices`,
        brokerContact: resolveBrokerPaperworkEmail(broker) || '—',
      })
      if (!result.ok) {
        showToast(result.error ?? 'Send failed', 'error')
        return
      }
      recordOutboundMessage({
        invoice,
        to,
        subject: templateId,
        body: message,
        templateId,
      })
      showToast('Email sent', 'success')
      onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold">System email — {invoice.invoice_number}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <textarea
          className="client-input w-full min-h-[100px] text-sm"
          placeholder="Optional note in the email"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button
          type="button"
          disabled={sending}
          onClick={() => void send()}
          className="rounded-md bg-[#1684FE] text-white text-sm px-3 py-1.5"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
