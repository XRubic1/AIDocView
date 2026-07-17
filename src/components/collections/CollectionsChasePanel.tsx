/**
 * Chase queue panel for Collections — Credyx works items by hand until AI inbox exists.
 */
import { useMemo, useState } from 'react'
import { mockBrokers } from '../../data/mockBrokers'
import { mockInvoices } from '../../data/mockInvoices'
import {
  buildCollectionsChaseQueue,
  markCollectionsNeedsAttention,
  sendBrokerPaymentStatusFollowup,
  sendBrokerPaymentStatusInquiry,
  setExpectedPaymentFromBrokerStatus,
  type ChaseQueueItem,
} from '../../utils/collectionsChase'
import { formatCurrency, formatDate } from '../../utils/format'
import { useToast } from '../ui/ToastProvider'
import { useClientTheme } from '../../theme/ThemeContext'

function statusLabel(status: ChaseQueueItem['status']): string {
  switch (status) {
    case 'needs_attention':
      return 'Needs attention (call)'
    case 'due_for_followup':
      return 'Follow-up due'
    case 'due_for_inquiry':
      return 'Inquiry due'
    case 'awaiting_response':
      return 'Awaiting response'
    default:
      return status
  }
}

export default function CollectionsChasePanel({
  onOpenInvoice,
}: {
  onOpenInvoice?: (invoiceId: string) => void
}) {
  const c = useClientTheme()
  const { showToast } = useToast()
  const [version, setVersion] = useState(0)
  const [expectedDraft, setExpectedDraft] = useState<Record<string, string>>({})

  const queue = useMemo(
    () => buildCollectionsChaseQueue(mockInvoices, mockBrokers),
    [version]
  )

  const handleInquiry = async (item: ChaseQueueItem) => {
    if (!item.broker) {
      showToast('Broker not found', 'error')
      return
    }
    if (item.preferredContact === 'phone') {
      showToast('Broker prefers phone — call and mark contacted from invoice detail.', 'info')
      return
    }
    const res = await sendBrokerPaymentStatusInquiry(item.invoice, item.broker)
    if (res.ok) {
      showToast('Status inquiry emailed', 'success')
      setVersion((v) => v + 1)
    } else {
      showToast(res.error ?? 'Send failed', 'error')
    }
  }

  const handleFollowup = async (item: ChaseQueueItem) => {
    if (!item.broker) return
    const res = await sendBrokerPaymentStatusFollowup(item.invoice, item.broker)
    if (res.ok) {
      showToast('Follow-up emailed', 'success')
      setVersion((v) => v + 1)
    } else {
      showToast(res.error ?? 'Send failed', 'error')
    }
  }

  const handleNeedsAttention = (item: ChaseQueueItem) => {
    markCollectionsNeedsAttention(item.invoice.id)
    showToast('Marked needs attention — call the broker', 'info')
    setVersion((v) => v + 1)
  }

  const handleSetExpected = async (item: ChaseQueueItem) => {
    const date = expectedDraft[item.invoice.id]
    if (!date) {
      showToast('Enter an expected payment date', 'error')
      return
    }
    await setExpectedPaymentFromBrokerStatus(
      item.invoice.id,
      date,
      `Expected payment updated from broker status response`
    )
    showToast('Expected payment date updated — visible on carrier portal', 'success')
    setVersion((v) => v + 1)
  }

  return (
    <div className="border mb-6" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: '#819291' }}>
        <h2 className="text-base font-semibold" style={{ color: '#113543' }}>
          Payment status chase queue
        </h2>
        <p className="text-xs mt-0.5" style={{ color: '#819291' }}>
          Based on days since PPW sent vs each broker&apos;s inquiry age. Work these by hand until
          collections inbox AI is live.
        </p>
      </div>
      {queue.length === 0 ? (
        <div className="p-6 text-sm text-center" style={{ color: '#819291' }}>
          No invoices due for payment-status chase right now.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: '#819291' }}>
                <th className="text-left py-2 px-3">Invoice</th>
                <th className="text-left py-2 px-3">Broker</th>
                <th className="text-right py-2 px-3">Amount</th>
                <th className="text-left py-2 px-3">Days since PPW</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-left py-2 px-3">Contact</th>
                <th className="text-left py-2 px-3">Set expected</th>
                <th className="text-left py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <tr key={item.invoice.id} className="border-b" style={{ borderColor: '#e5e7eb' }}>
                  <td className="py-2 px-3 font-medium" style={{ color: c.primary }}>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => onOpenInvoice?.(item.invoice.id)}
                    >
                      {item.invoice.invoice_number}
                    </button>
                    <div className="text-xs" style={{ color: c.secondary }}>
                      PPW {formatDate(item.ppwSentAt)}
                    </div>
                  </td>
                  <td className="py-2 px-3" style={{ color: c.secondary }}>
                    {item.broker?.name ?? item.invoice.broker_name}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {formatCurrency(item.invoice.amount)}
                  </td>
                  <td className="py-2 px-3 tabular-nums">
                    {item.daysSincePpw}d / {item.inquiryThreshold}d
                  </td>
                  <td className="py-2 px-3">{statusLabel(item.status)}</td>
                  <td className="py-2 px-3 capitalize">{item.preferredContact}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={expectedDraft[item.invoice.id] ?? ''}
                        onChange={(e) =>
                          setExpectedDraft((d) => ({ ...d, [item.invoice.id]: e.target.value }))
                        }
                        className="px-1.5 py-1 border rounded text-xs"
                        style={{ borderColor: '#819291' }}
                      />
                      <button
                        type="button"
                        className="text-xs underline"
                        style={{ color: '#113543' }}
                        onClick={() => void handleSetExpected(item)}
                      >
                        Save
                      </button>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {(item.status === 'due_for_inquiry' || item.status === 'awaiting_response') && (
                        <button
                          type="button"
                          className="dashboard-btn-secondary !h-7 !px-2 !text-xs"
                          onClick={() => void handleInquiry(item)}
                        >
                          Email inquiry
                        </button>
                      )}
                      {item.status === 'due_for_followup' && (
                        <button
                          type="button"
                          className="dashboard-btn-secondary !h-7 !px-2 !text-xs"
                          onClick={() => void handleFollowup(item)}
                        >
                          Follow-up
                        </button>
                      )}
                      {item.status !== 'needs_attention' && (
                        <button
                          type="button"
                          className="dashboard-btn-secondary !h-7 !px-2 !text-xs"
                          onClick={() => handleNeedsAttention(item)}
                        >
                          Needs call
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
