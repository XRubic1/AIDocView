import { useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { mockBrokers, addBroker } from '../data/mockBrokers'
import { Broker, BrokerEmail, BrokerPhone } from '../types/broker'
import { Phone, Mail, MapPin, Search, X, Plus, Trash2 } from 'lucide-react'
import { useToast } from '../components/ui/ToastProvider'
import BrokerPaymentHistoryPanel from '../components/brokers/BrokerPaymentHistoryPanel'

export default function Brokers() {
  const { showToast } = useToast()
  const [brokers, setBrokers] = useState<Broker[]>(mockBrokers)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [formData, setFormData] = useState<Partial<Broker>>({
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    fax: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    mc_number: '',
    dot_number: '',
    notes: '',
    payment_terms_days: 30,
    payment_status_inquiry_days: 15,
    preferred_contact: 'either',
  })
  const [emails, setEmails] = useState<BrokerEmail[]>([])
  const [phones, setPhones] = useState<BrokerPhone[]>([])

  const filteredBrokers = brokers.filter((broker) => {
    if (searchTerm === '') return true
    const searchLower = searchTerm.toLowerCase()
    return (
      broker.name.toLowerCase().includes(searchLower) ||
      broker.contact_person?.toLowerCase().includes(searchLower) ||
      broker.email?.toLowerCase().includes(searchLower) ||
      broker.emails?.some(e => e.email.toLowerCase().includes(searchLower)) ||
      broker.phone?.toLowerCase().includes(searchLower) ||
      broker.phones?.some(p => p.phone.toLowerCase().includes(searchLower)) ||
      broker.mc_number?.toLowerCase().includes(searchLower) ||
      broker.dot_number?.toLowerCase().includes(searchLower) ||
      broker.city?.toLowerCase().includes(searchLower) ||
      broker.state?.toLowerCase().includes(searchLower)
    )
  })

  const handleBrokerClick = (broker: Broker) => {
    setSelectedBroker(broker)
  }

  const handleCloseModal = () => {
    setSelectedBroker(null)
  }

  const emptyBrokerForm = (): Partial<Broker> => ({
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    fax: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    mc_number: '',
    dot_number: '',
    notes: '',
    payment_terms_days: 30,
    payment_status_inquiry_days: 15,
    preferred_contact: 'either',
  })

  const handleOpenAddModal = () => {
    setShowAddModal(true)
    setFormData(emptyBrokerForm())
    setEmails([])
    setPhones([])
  }

  const handleCloseAddModal = () => {
    setShowAddModal(false)
    setFormData(emptyBrokerForm())
    setEmails([])
    setPhones([])
  }

  const handleInputChange = (field: keyof Broker, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleAddEmail = () => {
    setEmails([...emails, { email: '', category: 'accounting' }])
  }

  const handleRemoveEmail = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index))
  }

  const handleEmailChange = (index: number, field: 'email' | 'category', value: string) => {
    const updated = [...emails]
    updated[index] = { ...updated[index], [field]: value as any }
    setEmails(updated)
  }

  const handleAddPhone = () => {
    setPhones([...phones, { phone: '', category: 'accounts_payable' }])
  }

  const handleRemovePhone = (index: number) => {
    setPhones(phones.filter((_, i) => i !== index))
  }

  const handlePhoneChange = (index: number, field: 'phone' | 'category', value: string) => {
    const updated = [...phones]
    updated[index] = { ...updated[index], [field]: value as any }
    setPhones(updated)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name) {
      showToast('Broker name is required', 'error')
      return
    }

    // Validate emails
    const validEmails = emails.filter(e => e.email.trim() !== '')
    if (validEmails.length === 0 && !formData.email) {
      // At least one email is required (either in emails array or legacy email field)
    }

    // Validate phones
    const validPhones = phones.filter(p => p.phone.trim() !== '')
    if (validPhones.length === 0 && !formData.phone) {
      // At least one phone is required (either in phones array or legacy phone field)
    }

    const newBroker: Broker = {
      id: `broker-${Date.now()}`,
      name: formData.name,
      contact_person: formData.contact_person || undefined,
      email: formData.email || undefined, // Legacy field
      emails: validEmails.length > 0 ? validEmails : undefined, // New field
      phone: formData.phone || undefined, // Legacy field
      phones: validPhones.length > 0 ? validPhones : undefined, // New field
      fax: formData.fax || undefined,
      address: formData.address || undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      zip: formData.zip || undefined,
      mc_number: formData.mc_number || undefined,
      dot_number: formData.dot_number || undefined,
      notes: formData.notes || undefined,
      payment_terms_days: formData.payment_terms_days,
      payment_status_inquiry_days: formData.payment_status_inquiry_days ?? 15,
      preferred_contact: formData.preferred_contact ?? 'either',
    }

    addBroker(newBroker)
    setBrokers([...mockBrokers])
    handleCloseAddModal()
  }

  const formatAddress = (broker: Broker) => {
    const parts = [broker.address, broker.city, broker.state, broker.zip].filter(Boolean)
    return parts.join(', ') || '-'
  }

  return (
    <AdminLayout userName="Admin User" userRole="Administrator">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-black mb-2">Brokers</h1>
          <p className="text-gray-600">Manage broker information and contact details</p>
        </div>

        {/* Search and Actions */}
        <div className="bg-white border border-gray-200 p-4 mb-6 rounded">
          <div className="flex items-center justify-between">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search brokers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
            </div>
            <button
              onClick={handleOpenAddModal}
              className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors"
            >
              Add Broker
            </button>
          </div>
        </div>

        {/* Brokers Table */}
        <div className="bg-white border border-gray-200">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-black">All Brokers</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {filteredBrokers.length} broker{filteredBrokers.length !== 1 ? 's' : ''} found
                </p>
              </div>
            </div>

            {filteredBrokers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg font-medium mb-2">No brokers found</p>
                <p className="text-sm">Try adjusting your search criteria</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Broker Name
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Contact Person
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Email
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Phone
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Location
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        MC Number
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        DOT Number
                      </th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBrokers.map((broker, index) => (
                      <tr
                        key={broker.id}
                        className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${
                          index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                        }`}
                        onClick={() => handleBrokerClick(broker)}
                      >
                        <td className="py-3 px-4 text-sm font-medium text-gray-900">
                          {broker.name}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {broker.contact_person || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {broker.emails && broker.emails.length > 0 ? (
                            <div className="space-y-1">
                              {broker.emails.slice(0, 2).map((emailItem, idx) => (
                                <a
                                  key={idx}
                                  href={`mailto:${emailItem.email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                                >
                                  <Mail className="w-3 h-3" />
                                  <span>{emailItem.email} ({emailItem.category})</span>
                                </a>
                              ))}
                              {broker.emails.length > 2 && (
                                <span className="text-xs text-gray-500">
                                  +{broker.emails.length - 2} more
                                </span>
                              )}
                            </div>
                          ) : broker.email ? (
                            <a
                              href={`mailto:${broker.email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                            >
                              <Mail className="w-3 h-3" />
                              <span>{broker.email}</span>
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {broker.phones && broker.phones.length > 0 ? (
                            <div className="space-y-1">
                              {broker.phones.slice(0, 2).map((phoneItem, idx) => {
                                const categoryLabels: Record<string, string> = {
                                  accounts_payable: 'A/P',
                                  accounts_receivable: 'A/R',
                                  rate_verification: 'Rate',
                                }
                                return (
                                  <a
                                    key={idx}
                                    href={`tel:${phoneItem.phone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                                  >
                                    <Phone className="w-3 h-3" />
                                    <span>{phoneItem.phone} ({categoryLabels[phoneItem.category] || phoneItem.category})</span>
                                  </a>
                                )
                              })}
                              {broker.phones.length > 2 && (
                                <span className="text-xs text-gray-500">
                                  +{broker.phones.length - 2} more
                                </span>
                              )}
                            </div>
                          ) : broker.phone ? (
                            <a
                              href={`tel:${broker.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{broker.phone}</span>
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {formatAddress(broker) !== '-' ? (
                            <div className="flex items-center space-x-1">
                              <MapPin className="w-3 h-3 text-gray-400" />
                              <span>{formatAddress(broker)}</span>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {broker.mc_number || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {broker.dot_number || '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleBrokerClick(broker)
                            }}
                            className="px-3 py-1 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors"
                          >
                            View
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
      </div>

      {/* Broker Detail Modal */}
      {selectedBroker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-black">{selectedBroker.name}</h2>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-black transition-colors"
                >
                  <span className="text-2xl">&times;</span>
                </button>
              </div>

              <div className="space-y-6">
                {/* Contact Information */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4">Contact Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedBroker.contact_person && (
                      <div>
                        <label className="text-sm text-gray-600">Contact Person</label>
                        <p className="text-sm font-medium text-gray-900">
                          {selectedBroker.contact_person}
                        </p>
                      </div>
                    )}
                    {selectedBroker.emails && selectedBroker.emails.length > 0 ? (
                      selectedBroker.emails.map((emailItem, index) => {
                        const categoryLabels: Record<string, string> = {
                          accounting: 'Accounting',
                          paperwork: 'Paperwork',
                          noa: 'NOA',
                        }
                        return (
                          <div key={index}>
                            <label className="text-sm text-gray-600">
                              Email - {categoryLabels[emailItem.category] || emailItem.category}
                            </label>
                            <a
                              href={`mailto:${emailItem.email}`}
                              className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                            >
                              <Mail className="w-4 h-4" />
                              <span>{emailItem.email}</span>
                            </a>
                          </div>
                        )
                      })
                    ) : selectedBroker.email ? (
                      <div>
                        <label className="text-sm text-gray-600">Email</label>
                        <a
                          href={`mailto:${selectedBroker.email}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                        >
                          <Mail className="w-4 h-4" />
                          <span>{selectedBroker.email}</span>
                        </a>
                      </div>
                    ) : null}
                    {selectedBroker.phones && selectedBroker.phones.length > 0 ? (
                      selectedBroker.phones.map((phoneItem, index) => {
                        const categoryLabels: Record<string, string> = {
                          accounts_payable: 'Accounts Payable',
                          accounts_receivable: 'Accounts Receivable',
                          rate_verification: 'Rate Verification',
                        }
                        return (
                          <div key={index}>
                            <label className="text-sm text-gray-600">
                              Phone - {categoryLabels[phoneItem.category] || phoneItem.category}
                            </label>
                            <a
                              href={`tel:${phoneItem.phone}`}
                              className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                            >
                              <Phone className="w-4 h-4" />
                              <span>{phoneItem.phone}</span>
                            </a>
                          </div>
                        )
                      })
                    ) : selectedBroker.phone ? (
                      <div>
                        <label className="text-sm text-gray-600">Phone</label>
                        <a
                          href={`tel:${selectedBroker.phone}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                        >
                          <Phone className="w-4 h-4" />
                          <span>{selectedBroker.phone}</span>
                        </a>
                      </div>
                    ) : null}
                    {selectedBroker.fax && (
                      <div>
                        <label className="text-sm text-gray-600">Fax</label>
                        <p className="text-sm font-medium text-gray-900">{selectedBroker.fax}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Address */}
                {formatAddress(selectedBroker) !== '-' && (
                  <div>
                    <h3 className="text-lg font-semibold text-black mb-4">Address</h3>
                    <div className="flex items-start space-x-2">
                      <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                      <p className="text-sm text-gray-900">{formatAddress(selectedBroker)}</p>
                    </div>
                  </div>
                )}

                {/* MC/DOT Numbers */}
                {(selectedBroker.mc_number || selectedBroker.dot_number) && (
                  <div>
                    <h3 className="text-lg font-semibold text-black mb-4">License Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedBroker.mc_number && (
                        <div className="bg-gray-50 p-3 rounded">
                          <label className="text-sm text-gray-600">MC Number</label>
                          <p className="text-sm font-medium text-gray-900">
                            {selectedBroker.mc_number}
                          </p>
                        </div>
                      )}
                      {selectedBroker.dot_number && (
                        <div className="bg-gray-50 p-3 rounded">
                          <label className="text-sm text-gray-600">DOT Number</label>
                          <p className="text-sm font-medium text-gray-900">
                            {selectedBroker.dot_number}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-semibold text-black mb-4">Collections preferences</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="bg-gray-50 p-3 rounded">
                      <label className="text-gray-600">Payment terms</label>
                      <p className="font-medium">Net {selectedBroker.payment_terms_days ?? 30}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <label className="text-gray-600">Status inquiry age</label>
                      <p className="font-medium">
                        {selectedBroker.payment_status_inquiry_days ?? 15} days after PPW
                      </p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <label className="text-gray-600">Preferred contact</label>
                      <p className="font-medium capitalize">
                        {selectedBroker.preferred_contact ?? 'either'}
                      </p>
                    </div>
                  </div>
                </div>

                <BrokerPaymentHistoryPanel broker={selectedBroker} />

                {/* Notes */}
                {selectedBroker.notes && (
                  <div>
                    <h3 className="text-lg font-semibold text-black mb-4">Notes</h3>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm text-gray-900">{selectedBroker.notes}</p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={handleCloseModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                  <button className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors">
                    Edit Broker
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Broker Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-black">Add New Broker</h2>
                <button
                  onClick={handleCloseAddModal}
                  className="text-gray-400 hover:text-black transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4">Basic Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Broker Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name || ''}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4">Contact Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contact Person
                      </label>
                      <input
                        type="text"
                        value={formData.contact_person || ''}
                        onChange={(e) => handleInputChange('contact_person', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fax</label>
                      <input
                        type="tel"
                        value={formData.fax || ''}
                        onChange={(e) => handleInputChange('fax', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Multiple Emails */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Email Addresses
                      </label>
                      <button
                        type="button"
                        onClick={handleAddEmail}
                        className="flex items-center space-x-1 px-3 py-1 text-xs font-medium text-white bg-black hover:bg-gray-800 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Email</span>
                      </button>
                    </div>
                    <div className="space-y-2">
                      {emails.map((emailItem, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="email"
                            value={emailItem.email}
                            onChange={(e) => handleEmailChange(index, 'email', e.target.value)}
                            placeholder="email@example.com"
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                          <select
                            value={emailItem.category}
                            onChange={(e) => handleEmailChange(index, 'category', e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          >
                            <option value="accounting">Accounting</option>
                            <option value="paperwork">Paperwork</option>
                            <option value="noa">NOA</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(index)}
                            className="p-2 text-red-600 hover:text-red-800 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {emails.length === 0 && (
                        <p className="text-xs text-gray-500 italic">No emails added. Click "Add Email" to add one.</p>
                      )}
                    </div>
                  </div>

                  {/* Multiple Phones */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Phone Numbers
                      </label>
                      <button
                        type="button"
                        onClick={handleAddPhone}
                        className="flex items-center space-x-1 px-3 py-1 text-xs font-medium text-white bg-black hover:bg-gray-800 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Phone</span>
                      </button>
                    </div>
                    <div className="space-y-2">
                      {phones.map((phoneItem, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="tel"
                            value={phoneItem.phone}
                            onChange={(e) => handlePhoneChange(index, 'phone', e.target.value)}
                            placeholder="(555) 123-4567"
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                          <select
                            value={phoneItem.category}
                            onChange={(e) => handlePhoneChange(index, 'category', e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          >
                            <option value="accounts_payable">Accounts Payable</option>
                            <option value="accounts_receivable">Accounts Receivable</option>
                            <option value="rate_verification">Rate Verification</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemovePhone(index)}
                            className="p-2 text-red-600 hover:text-red-800 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {phones.length === 0 && (
                        <p className="text-xs text-gray-500 italic">No phone numbers added. Click "Add Phone" to add one.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4">Address</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Street Address
                      </label>
                      <input
                        type="text"
                        value={formData.address || ''}
                        onChange={(e) => handleInputChange('address', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                        <input
                          type="text"
                          value={formData.city || ''}
                          onChange={(e) => handleInputChange('city', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                        <input
                          type="text"
                          value={formData.state || ''}
                          onChange={(e) => handleInputChange('state', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ZIP Code
                        </label>
                        <input
                          type="text"
                          value={formData.zip || ''}
                          onChange={(e) => handleInputChange('zip', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* License Information */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4">License Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        MC Number
                      </label>
                      <input
                        type="text"
                        value={formData.mc_number || ''}
                        onChange={(e) => handleInputChange('mc_number', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        DOT Number
                      </label>
                      <input
                        type="text"
                        value={formData.dot_number || ''}
                        onChange={(e) => handleInputChange('dot_number', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Collections chase prefs */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4">Collections preferences</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Payment terms (days)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formData.payment_terms_days ?? 30}
                        onChange={(e) =>
                          handleInputChange('payment_terms_days', parseInt(e.target.value, 10) || 0)
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status inquiry age (days after PPW)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={formData.payment_status_inquiry_days ?? 15}
                        onChange={(e) =>
                          handleInputChange(
                            'payment_status_inquiry_days',
                            parseInt(e.target.value, 10) || 0
                          )
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        When Credyx asks for payment status (clock starts when PPW was sent).
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Preferred contact
                      </label>
                      <select
                        value={formData.preferred_contact ?? 'either'}
                        onChange={(e) =>
                          handleInputChange(
                            'preferred_contact',
                            e.target.value as 'email' | 'phone' | 'either'
                          )
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      >
                        <option value="either">Email or phone</option>
                        <option value="email">Email only</option>
                        <option value="phone">Phone only</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4">Notes</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Additional Notes
                    </label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) => handleInputChange('notes', e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleCloseAddModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors"
                  >
                    Add Broker
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

