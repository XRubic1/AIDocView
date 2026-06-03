import { useState } from 'react'
import { formatCurrency } from '../../utils/format'
import { formatDate } from '../../utils/format'
import { Invoice } from '../../types/invoice'
import { mockInvoices } from '../../data/mockInvoices'

interface PendingInvoicesTabProps {
  onInvoiceSelect: (invoiceId: string) => void
}

export default function PendingInvoicesTab({ onInvoiceSelect }: PendingInvoicesTabProps) {
  const [invoices] = useState<Invoice[]>(
    mockInvoices.filter((inv) => inv.status === 'pending')
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
          <h2 className="text-lg font-bold text-black">Pending Review</h2>
          <p className="text-sm text-gray-600 mt-1">
            Invoices awaiting review and approval
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
            <div className="font-medium">No pending invoices</div>
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
                  Invoice Date
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Expected Payment
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
                  }`}
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
                    {formatDate(invoice.invoice_date)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    {formatDate(invoice.expected_payment_date)}
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


