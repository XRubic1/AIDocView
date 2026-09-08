import { useState } from 'react'
import { formatCurrency } from '../../utils/format'
import { formatDate } from '../../utils/format'
import { Invoice } from '../../types/invoice'
import { mockInvoices } from '../../data/mockInvoices'
import { getAgingArBucketKey, getInvoiceAgeDays, isOpenArInvoice } from '../../utils/invoiceAging'

interface AgingInvoicesTabProps {
  onInvoiceSelect: (invoiceId: string) => void
  lastViewedInvoiceId?: string | null
}

type AgingBucket = '1_15' | '16_30' | '31_45' | '46_60' | '61_90' | 'over_91'

interface AgingGroup {
  bucket: AgingBucket
  label: string
  invoices: Invoice[]
  totalAmount: number
}

export default function AgingInvoicesTab({ onInvoiceSelect, lastViewedInvoiceId }: AgingInvoicesTabProps) {
  const [selectedBucket, setSelectedBucket] = useState<AgingBucket | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Group invoices by aging bucket (invoice age, not days past due)
  const agingGroups: AgingGroup[] = [
    { bucket: '1_15', label: '0–15 days', invoices: [], totalAmount: 0 },
    { bucket: '16_30', label: '16–30 days', invoices: [], totalAmount: 0 },
    { bucket: '31_45', label: '31–45 days', invoices: [], totalAmount: 0 },
    { bucket: '46_60', label: '46–60 days', invoices: [], totalAmount: 0 },
    { bucket: '61_90', label: '61–90 days', invoices: [], totalAmount: 0 },
    { bucket: 'over_91', label: '91+ days', invoices: [], totalAmount: 0 },
  ]

  // Filter and categorize invoices
  const filteredInvoices = mockInvoices.filter((invoice) => {
    if (searchTerm === '') return true
    return (
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.broker_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.load_number?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  filteredInvoices.forEach((invoice) => {
    if (!isOpenArInvoice(invoice)) {
      return
    }
    const bucket = getAgingArBucketKey(getInvoiceAgeDays(invoice))
    const group = agingGroups.find((g) => g.bucket === bucket)
    if (group) {
      group.invoices.push(invoice)
      group.totalAmount += invoice.amount
    }
  })

  const getBucketColor = (bucket: AgingBucket) => {
    switch (bucket) {
      case '1_15':
      case '16_30':
        return 'text-green-600'
      case '31_45':
      case '46_60':
        return 'text-yellow-600'
      case '61_90':
      case 'over_91':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  const getBucketBgColor = (bucket: AgingBucket) => {
    switch (bucket) {
      case '1_15':
      case '16_30':
        return 'bg-green-50 border-green-200'
      case '31_45':
      case '46_60':
        return 'bg-yellow-50 border-yellow-200'
      case '61_90':
      case 'over_91':
        return 'bg-red-50 border-red-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const displayedInvoices = selectedBucket
    ? agingGroups.find((g) => g.bucket === selectedBucket)?.invoices || []
    : []

  const totalAR = agingGroups.reduce((sum, group) => sum + group.totalAmount, 0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-black">Aging A/R</h2>
          <p className="text-sm text-gray-600 mt-1">
            Invoices grouped by invoice age (days since invoice date)
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

      {/* Aging Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {agingGroups.map((group) => {
          const percentage =
            totalAR > 0 ? ((group.totalAmount / totalAR) * 100).toFixed(1) : '0'
          return (
            <div
              key={group.bucket}
              className={`p-4 border rounded cursor-pointer transition-colors ${
                selectedBucket === group.bucket
                  ? 'border-black border-2'
                  : getBucketBgColor(group.bucket)
              }`}
              onClick={() =>
                setSelectedBucket(selectedBucket === group.bucket ? null : group.bucket)
              }
            >
              <div className={`text-sm font-medium mb-1 ${getBucketColor(group.bucket)}`}>
                {group.label}
              </div>
              <div className="text-xl font-bold text-black mb-1">
                {formatCurrency(group.totalAmount)}
              </div>
              <div className="text-xs text-gray-600">
                {group.invoices.length} invoice{group.invoices.length !== 1 ? 's' : ''}
              </div>
              <div className="text-xs text-gray-500 mt-1">{percentage}%</div>
            </div>
          )
        })}
      </div>

      {/* Total A/R */}
      <div className="bg-gray-100 border border-gray-300 p-4 mb-6 rounded">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-700">Total A/R</div>
          <div className="text-2xl font-bold text-black">{formatCurrency(totalAR)}</div>
        </div>
      </div>

      {/* Invoices Table */}
      {selectedBucket ? (
        <div className="overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-semibold text-black">
              {agingGroups.find((g) => g.bucket === selectedBucket)?.label} - Invoices
            </h3>
            <button
              onClick={() => setSelectedBucket(null)}
              className="text-sm text-gray-600 hover:text-black"
            >
              Clear Selection
            </button>
          </div>
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
                  Expected Payment
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                  Invoice Age
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
              {displayedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500">
                    No invoices found in this aging bucket
                  </td>
                </tr>
              ) : (
                displayedInvoices.map((invoice, index) => {
                  const invoiceAgeDays = getInvoiceAgeDays(invoice)
                  const isLastViewed = lastViewedInvoiceId === invoice.id
                  return (
                    <tr
                      key={invoice.id}
                      className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                        isLastViewed 
                          ? 'bg-yellow-100 hover:bg-yellow-200' 
                          : index % 2 === 0 
                            ? 'bg-gray-50' 
                            : 'bg-white'
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
                        {formatDate(invoice.expected_payment_date)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${
                            invoiceAgeDays >= 60
                              ? 'bg-red-100 text-red-800'
                              : invoiceAgeDays >= 30
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {invoiceAgeDays}d
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${
                            invoice.status === 'hold'
                              ? 'bg-yellow-100 text-yellow-800'
                              : invoice.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {invoice.status === 'hold'
                            ? 'On Hold'
                            : invoice.status === 'approved'
                              ? 'Approved'
                              : 'Pending'}
                        </span>
                      </td>
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
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg font-medium mb-2">Select an aging bucket to view invoices</p>
          <p className="text-sm">Click on any aging bucket card above to see the invoices in that range</p>
        </div>
      )}
    </div>
  )
}

