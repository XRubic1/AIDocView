import { useState } from 'react'
import { formatCurrency } from '../../utils/format'
import { formatDate } from '../../utils/format'
import { Invoice } from '../../types/invoice'
import { mockInvoices } from '../../data/mockInvoices'

interface AllInvoicesTabProps {
  onInvoiceSelect: (invoiceId: string) => void
}

export default function AllInvoicesTab({ onInvoiceSelect }: AllInvoicesTabProps) {
  const [invoices] = useState<Invoice[]>(mockInvoices)
  const [filter, setFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-gray-100 text-gray-800', label: 'Pending' },
      approved: { color: 'bg-green-100 text-green-800', label: 'Approved' },
      rejected: { color: 'bg-red-100 text-red-800', label: 'Rejected' },
      hold: { color: 'bg-yellow-100 text-yellow-800', label: 'On Hold' },
      paid: { color: 'bg-blue-100 text-blue-800', label: 'Paid' },
      force_closed: { color: 'bg-purple-100 text-purple-800', label: 'Force Closed' },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesFilter = filter === 'all' || invoice.status === filter
    const matchesSearch =
      searchTerm === '' ||
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.broker_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.load_number?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-black">All Invoices</h2>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded text-gray-700 bg-white"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded text-gray-700 bg-white"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="hold">On Hold</option>
            <option value="rejected">Rejected</option>
            <option value="paid">Paid</option>
            <option value="force_closed">Force Closed</option>
          </select>
        </div>
      </div>

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
                Status
              </th>
              <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-500">
                  No invoices found
                </td>
              </tr>
            ) : (
              filteredInvoices.map((invoice, index) => (
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
                  <td className="py-3 px-4 text-sm">{getStatusBadge(invoice.status)}</td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onInvoiceSelect(invoice.id)
                      }}
                      className="px-3 py-1 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


