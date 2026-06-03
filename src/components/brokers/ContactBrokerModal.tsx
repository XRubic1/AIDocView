import { X, Phone, Mail, MapPin, FileText, Copy } from 'lucide-react'
import { Broker } from '../../types/broker'

interface ContactBrokerModalProps {
  broker: Broker | null
  invoiceNumber?: string
  onClose: () => void
  onCall?: () => void
  onEmail?: () => void
}

export default function ContactBrokerModal({
  broker,
  invoiceNumber,
  onClose,
  onCall,
  onEmail,
}: ContactBrokerModalProps) {
  if (!broker) return null

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    // TODO: Show toast notification
  }

  const fullAddress = broker.address
    ? `${broker.address}, ${broker.city || ''}, ${broker.state || ''} ${broker.zip || ''}`.trim()
    : null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <div>
              <h2 className="text-xl font-bold text-black">Contact Broker</h2>
              {invoiceNumber && (
                <p className="text-sm text-gray-600">Invoice: {invoiceNumber}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Broker Name */}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-black mb-2">{broker.name}</h3>
              {broker.contact_person && (
                <p className="text-sm text-gray-600">Contact: {broker.contact_person}</p>
              )}
            </div>

            {/* Contact Information */}
            <div className="space-y-4 mb-6">
              {/* Multiple Phones */}
              {broker.phones && broker.phones.length > 0 ? (
                broker.phones.map((phoneItem, index) => {
                  const categoryLabels: Record<string, string> = {
                    accounts_payable: 'Accounts Payable',
                    accounts_receivable: 'Accounts Receivable',
                    rate_verification: 'Rate Verification',
                  }
                  return (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded">
                      <div className="flex items-center space-x-3">
                        <Phone className="w-5 h-5 text-gray-400" />
                        <div>
                          <div className="text-sm font-medium text-gray-700">
                            {categoryLabels[phoneItem.category] || phoneItem.category}
                          </div>
                          <div className="text-lg font-semibold text-black">{phoneItem.phone}</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleCopy(phoneItem.phone)}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                          aria-label="Copy phone number"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            onCall?.()
                            window.location.href = `tel:${phoneItem.phone}`
                          }}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors rounded"
                        >
                          Call
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : broker.phone ? (
                // Legacy single phone
                <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded">
                  <div className="flex items-center space-x-3">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Phone</div>
                      <div className="text-lg font-semibold text-black">{broker.phone}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleCopy(broker.phone!)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="Copy phone number"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        onCall?.()
                        window.location.href = `tel:${broker.phone}`
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors rounded"
                    >
                      Call
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Multiple Emails */}
              {broker.emails && broker.emails.length > 0 ? (
                broker.emails.map((emailItem, index) => {
                  const categoryLabels: Record<string, string> = {
                    accounting: 'Accounting',
                    paperwork: 'Paperwork',
                    noa: 'NOA',
                  }
                  return (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded">
                      <div className="flex items-center space-x-3">
                        <Mail className="w-5 h-5 text-gray-400" />
                        <div>
                          <div className="text-sm font-medium text-gray-700">
                            {categoryLabels[emailItem.category] || emailItem.category}
                          </div>
                          <div className="text-lg font-semibold text-black">{emailItem.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleCopy(emailItem.email)}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                          aria-label="Copy email"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            onEmail?.()
                            window.location.href = `mailto:${emailItem.email}${invoiceNumber ? `?subject=Invoice ${invoiceNumber}` : ''}`
                          }}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors rounded"
                        >
                          Email
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : broker.email ? (
                // Legacy single email
                <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded">
                  <div className="flex items-center space-x-3">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Email</div>
                      <div className="text-lg font-semibold text-black">{broker.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleCopy(broker.email!)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="Copy email"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        onEmail?.()
                        window.location.href = `mailto:${broker.email}${invoiceNumber ? `?subject=Invoice ${invoiceNumber}` : ''}`
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors rounded"
                    >
                      Email
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Fax */}
              {broker.fax && (
                <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded">
                  <div className="flex items-center space-x-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Fax</div>
                      <div className="text-lg font-semibold text-black">{broker.fax}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(broker.fax!)}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Copy fax number"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Address */}
              {fullAddress && (
                <div className="flex items-start space-x-3 p-4 bg-gray-50 border border-gray-200 rounded">
                  <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-700 mb-1">Address</div>
                    <div className="text-sm text-gray-900">{fullAddress}</div>
                  </div>
                  <button
                    onClick={() => handleCopy(fullAddress)}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Copy address"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* MC/DOT Numbers */}
            {(broker.mc_number || broker.dot_number) && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                {broker.mc_number && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded">
                    <div className="text-sm font-medium text-gray-700 mb-1">MC Number</div>
                    <div className="text-lg font-semibold text-black">{broker.mc_number}</div>
                  </div>
                )}
                {broker.dot_number && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded">
                    <div className="text-sm font-medium text-gray-700 mb-1">DOT Number</div>
                    <div className="text-lg font-semibold text-black">{broker.dot_number}</div>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {broker.notes && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded mb-6">
                <div className="text-sm font-semibold text-yellow-900 mb-2">Notes</div>
                <p className="text-sm text-yellow-800">{broker.notes}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


