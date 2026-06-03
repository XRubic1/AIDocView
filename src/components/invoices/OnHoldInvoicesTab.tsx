import { useState } from 'react'
import { formatCurrency } from '../../utils/format'
import { Invoice } from '../../types/invoice'
import { mockInvoices } from '../../data/mockInvoices'

interface OnHoldInvoicesTabProps {
  onInvoiceSelect: (invoiceId: string) => void
}

export default function OnHoldInvoicesTab({ onInvoiceSelect }: OnHoldInvoicesTabProps) {
  const [invoices] = useState<Invoice[]>(
    mockInvoices.filter((inv) => inv.status === 'hold')
  )
  const [searchTerm, setSearchTerm] = useState('')

  const filteredInvoices = invoices.filter((invoice) => {
    return (
      searchTerm === '' ||
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.broker_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.load_number?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-black">Invoices On Hold</h2>
          <p className="text-sm text-gray-600 mt-1">
            Invoices requiring attention or additional information
          </p>
        </div>
        <input
          type="text"
          placeholder="Search invoices..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded text-gray-700 bg-white"
        />
      </div>

      {filteredInvoices.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-green-600">
          <div className="text-center">
            <div className="text-4xl mb-2">✓</div>
            <div className="font-medium">No invoices on hold</div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Invoice#
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Load#
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Client
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Broker
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                  Amount
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Hold Reason
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Days Since Expected
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice, index) => (
                <tr
                  key={invoice.id}
                  className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                    index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                  } ${invoice.days_since_expected && invoice.days_since_expected >= 20 ? 'border-l-4 border-l-red-500' : ''}`}
                  onClick={() => onInvoiceSelect(invoice.id)}
                >
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">
                    {invoice.invoice_number}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    {invoice.load_number || '-'}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">{invoice.client_name}</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{invoice.broker_name}</td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-gray-900">
                    {formatCurrency(invoice.amount)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800">
                      {invoice.hold_reason || 'No reason specified'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {invoice.days_since_expected !== undefined && (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${
                          invoice.days_since_expected >= 20
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {invoice.days_since_expected} days
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onInvoiceSelect(invoice.id)
                      }}
                      className="px-3 py-1 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors"
                    >
                      Review
                    </button>
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

