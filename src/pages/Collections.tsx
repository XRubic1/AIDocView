import { useState, useMemo } from 'react'
import AdminLayout from '../components/AdminLayout'
import { mockBrokers } from '../data/mockBrokers'
import { mockInvoices } from '../data/mockInvoices'
import { Broker } from '../types/broker'
import { Invoice } from '../types/invoice'
import { ArrowLeft } from 'lucide-react'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/format'
import AdminInvoiceDetailView from '../components/batches/AdminInvoiceDetailView'
import CollectionsChasePanel from '../components/collections/CollectionsChasePanel'

export default function Collections() {
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  // Get brokers with invoice counts
  const brokersWithCounts = useMemo(() => {
    // Get all invoices (excluding hold and pending)
    const allInvoices = mockInvoices.filter(
      (inv) => inv.status !== 'hold' && inv.status !== 'pending'
    )
    
    // Group invoices by broker
    const brokerMap = new Map<string, { broker: Broker; invoices: Invoice[] }>()
    
    allInvoices.forEach((inv) => {
      if (inv.broker_id) {
        const broker = mockBrokers.find((b) => b.id === inv.broker_id)
        if (broker) {
          if (!brokerMap.has(broker.id)) {
            brokerMap.set(broker.id, { broker, invoices: [] })
          }
          brokerMap.get(broker.id)!.invoices.push(inv)
        }
      }
    })
    
    // Calculate counts for each broker
    return Array.from(brokerMap.values()).map(({ broker, invoices }) => {
      const openInvoices = invoices.filter((inv) => inv.status !== 'paid')
      const paymentTermsDays = broker.payment_terms_days || 30
      
      // Calculate overdue invoices (invoices past payment terms)
      const overdueInvoices = openInvoices.filter((inv) => {
        const daysSinceInvoice = inv.days_since_expected || 0
        return daysSinceInvoice > paymentTermsDays
      })
      
      return {
        broker,
        openInvoicesCount: openInvoices.length,
        overdueInvoicesCount: overdueInvoices.length,
        allInvoices: invoices,
        openInvoices,
      }
    })
  }, [])

  // Get invoices for selected broker
  const brokerInvoices = useMemo(() => {
    if (!selectedBroker) return []
    return mockInvoices.filter(
      (inv) => inv.broker_id === selectedBroker.id &&
               inv.status !== 'hold' && 
               inv.status !== 'pending'
    )
  }, [selectedBroker])

  return (
    <AdminLayout userName="Admin User" userRole="Administrator">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>Collections</h1>
          <p style={{ color: '#819291' }}>Manage broker invoices and collections</p>
        </div>

        {!selectedBroker && (
          <CollectionsChasePanel
            onOpenInvoice={(invoiceId) => {
              const inv = mockInvoices.find((i) => i.id === invoiceId)
              if (inv) {
                const broker = mockBrokers.find((b) => b.id === inv.broker_id)
                if (broker) setSelectedBroker(broker)
                setSelectedInvoice(inv)
              }
            }}
          />
        )}

        {!selectedBroker ? (
          // Broker List View
          <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
            <div className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-bold" style={{ color: '#113543' }}>Brokers</h2>
                <p className="text-sm mt-1" style={{ color: '#819291' }}>
                  View invoices by broker and track overdue payments
                </p>
              </div>

              {brokersWithCounts.length === 0 ? (
                <div className="text-center py-12" style={{ color: '#819291' }}>
                  <div className="text-4xl mb-2">📋</div>
                  <div className="font-medium">No brokers found</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b" style={{ borderColor: '#819291' }}>
                        <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Broker Name
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Open Invoices
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Overdue Invoices
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Payment Terms
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {brokersWithCounts.map((item, index) => (
                        <tr
                          key={item.broker.id}
                          className="border-b cursor-pointer transition-colors"
                          style={{
                            borderColor: '#819291',
                            backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                          }}
                          onClick={() => setSelectedBroker(item.broker)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f0f0f0'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#f8f9fa' : '#FFFFFF'
                          }}
                        >
                          <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                            {item.broker.name}
                          </td>
                          <td className="py-3 px-4 text-sm text-right" style={{ color: '#819291' }}>
                            {item.openInvoicesCount}
                          </td>
                          <td className="py-3 px-4 text-sm text-right font-medium" style={{ 
                            color: item.overdueInvoicesCount > 0 ? '#C2A558' : '#819291' 
                          }}>
                            {item.overdueInvoicesCount}
                          </td>
                          <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                            Net {item.broker.payment_terms_days || 30}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedBroker(item.broker)
                              }}
                              className="px-3 py-1 text-sm font-medium text-white transition-colors"
                              style={{ backgroundColor: '#C2A558' }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#b89547'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#C2A558'
                              }}
                            >
                              View Invoices
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Broker Invoice List View
          <div className="space-y-6">
            <div className="flex items-center space-x-4 mb-6">
              <button
                onClick={() => {
                  setSelectedBroker(null)
                  setSelectedInvoice(null)
                }}
                className="flex items-center space-x-2 transition-colors"
                style={{ color: '#819291' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#113543'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#819291'
                }}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Brokers</span>
              </button>
              <div>
                <h2 className="text-xl font-bold" style={{ color: '#113543' }}>
                  {selectedBroker.name}
                </h2>
                <p className="text-sm" style={{ color: '#819291' }}>
                  Payment Terms: Net {selectedBroker.payment_terms_days || 30}
                </p>
              </div>
            </div>

            <div className="border" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
              <div className="p-6">
                {brokerInvoices.length === 0 ? (
                  <div className="text-center py-12" style={{ color: '#819291' }}>
                    <div className="text-4xl mb-2">📄</div>
                    <div className="font-medium">No invoices found for {selectedBroker.name}</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b" style={{ borderColor: '#819291' }}>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Invoice#
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Client
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Load#
                          </th>
                          <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Amount
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Invoice Date
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Due Date
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Days Overdue
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Status
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Paperwork Status
                          </th>
                          <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {brokerInvoices.map((inv, index) => {
                          const paymentTermsDays = selectedBroker.payment_terms_days || 30
                          const daysSinceInvoice = inv.days_since_expected || 0
                          const isOverdue = daysSinceInvoice > paymentTermsDays
                          
                          // Get most recent document send record
                          const lastSendRecord = inv.document_send_history && inv.document_send_history.length > 0
                            ? inv.document_send_history.sort((a, b) => 
                                new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
                              )[0]
                            : null
                          const paperworkSent = !!lastSendRecord
                          
                          return (
                            <tr
                              key={inv.id}
                              className="border-b"
                              style={{
                                borderColor: '#819291',
                                backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                              }}
                            >
                              <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                                {inv.invoice_number}
                              </td>
                              <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                                {inv.client_name}
                              </td>
                              <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                                {inv.load_number || '-'}
                              </td>
                              <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                                {formatCurrency(inv.amount)}
                              </td>
                              <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                                {formatDate(inv.invoice_date)}
                              </td>
                              <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                                {formatDate(inv.due_date)}
                              </td>
                              <td className="py-3 px-4 text-sm font-medium" style={{ 
                                color: isOverdue ? '#C2A558' : '#819291' 
                              }}>
                                {inv.status === 'paid' ? '-' : `${daysSinceInvoice} days`}
                              </td>
                              <td className="py-3 px-4 text-sm">
                                <span
                                  className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                                  style={{
                                    backgroundColor: 
                                      inv.status === 'paid' ? '#819291' :
                                      inv.status === 'hold' ? '#C2A558' :
                                      '#819291',
                                    color: '#FFFFFF',
                                  }}
                                >
                                  {inv.status === 'paid' ? 'Paid' : inv.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-sm">
                                {paperworkSent ? (
                                  <span
                                    className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                                    style={{ backgroundColor: '#819291', color: '#FFFFFF' }}
                                  >
                                    Sent
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                                    style={{ backgroundColor: '#C2A558', color: '#FFFFFF' }}
                                  >
                                    Not Sent
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => setSelectedInvoice(inv)}
                                  className="text-sm transition-colors"
                                  style={{ color: '#819291' }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = '#113543'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = '#819291'
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

            {/* Invoice Detail View */}
            {selectedInvoice && (
              <AdminInvoiceDetailView
                invoice={selectedInvoice}
                invoiceList={brokerInvoices}
                onInvoiceSelect={(inv) => setSelectedInvoice(inv)}
                onClose={() => setSelectedInvoice(null)}
                isCollectionsView={true}
                // Approve/Hold disabled since invoices are already processed
              />
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

