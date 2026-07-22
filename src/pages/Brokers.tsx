import { useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { mockBrokers, addBroker } from '../data/mockBrokers'
import { Broker, BrokerEmail, BrokerPhone } from '../types/broker'
import { Phone, Mail, MapPin, Search, X, Plus, Trash2, ArrowLeft } from 'lucide-react'
import { useToast } from '../components/ui/ToastProvider'
import BrokerPaymentHistoryPanel from '../components/brokers/BrokerPaymentHistoryPanel'
import '../styles/clientPortal.css'

const EMAIL_CATEGORY_LABELS: Record<string, string> = {
  accounting: 'Accounting',
  paperwork: 'Paperwork',
  noa: 'NOA',
}

const PHONE_CATEGORY_FULL: Record<string, string> = {
  accounts_payable: 'Accounts Payable',
  accounts_receivable: 'Accounts Receivable',
  rate_verification: 'Rate Verification',
}

/** Primary email for compact list display. */
function primaryEmail(broker: Broker): string | undefined {
  return broker.emails?.[0]?.email ?? broker.email
}

/** Primary phone for compact list display. */
function primaryPhone(broker: Broker): string | undefined {
  return broker.phones?.[0]?.phone ?? broker.phone
}

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
      broker.emails?.some((e) => e.email.toLowerCase().includes(searchLower)) ||
      broker.phone?.toLowerCase().includes(searchLower) ||
      broker.phones?.some((p) => p.phone.toLowerCase().includes(searchLower)) ||
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
    updated[index] = { ...updated[index], [field]: value as BrokerEmail['category'] }
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
    updated[index] = { ...updated[index], [field]: value as BrokerPhone['category'] }
    setPhones(updated)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name) {
      showToast('Broker name is required', 'error')
      return
    }

    const validEmails = emails.filter((em) => em.email.trim() !== '')
    const validPhones = phones.filter((p) => p.phone.trim() !== '')

    const newBroker: Broker = {
      id: `broker-${Date.now()}`,
      name: formData.name,
      contact_person: formData.contact_person || undefined,
      email: formData.email || undefined,
      emails: validEmails.length > 0 ? validEmails : undefined,
      phone: formData.phone || undefined,
      phones: validPhones.length > 0 ? validPhones : undefined,
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
    showToast('Broker added', 'success')
  }

  const formatAddress = (broker: Broker) => {
    const parts = [broker.address, broker.city, broker.state, broker.zip].filter(Boolean)
    return parts.join(', ') || '-'
  }

  const inputClass = 'client-input w-full text-sm'

  return (
    <AdminLayout flushMain>
      <div className="flex flex-col min-h-0 h-full overflow-hidden">
        <div className="client-page-toolbar shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-200">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search brokers…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="client-input w-full pl-8 pr-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500 tabular-nums">
              {filteredBrokers.length} broker{filteredBrokers.length !== 1 ? 's' : ''}
            </p>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add broker
            </button>
          </div>
        </div>

        <div className="client-table-scroll flex-1 min-h-0 overflow-auto">
          {filteredBrokers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <p className="text-sm font-medium">No brokers found</p>
              <p className="text-xs mt-1">Try adjusting your search</p>
            </div>
          ) : (
            <table className="dashboard-table dashboard-table--compact w-full min-w-[900px]">
              <thead>
                <tr>
                  <th>Broker</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Terms</th>
                  <th>Location</th>
                  <th>MC</th>
                  <th>DOT</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredBrokers.map((broker) => {
                  const email = primaryEmail(broker)
                  const phone = primaryPhone(broker)
                  const extraEmails = (broker.emails?.length ?? 0) > 1 ? broker.emails!.length - 1 : 0
                  const extraPhones = (broker.phones?.length ?? 0) > 1 ? broker.phones!.length - 1 : 0
                  return (
                    <tr
                      key={broker.id}
                      className="dashboard-table-row--clickable"
                      onClick={() => handleBrokerClick(broker)}
                    >
                      <td>
                        <p className="font-medium text-slate-900">{broker.name}</p>
                      </td>
                      <td className="text-slate-600">{broker.contact_person || '—'}</td>
                      <td>
                        {email ? (
                          <a
                            href={`mailto:${email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
                          >
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[160px]">{email}</span>
                            {extraEmails > 0 ? (
                              <span className="text-[10px] text-slate-400">+{extraEmails}</span>
                            ) : null}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {phone ? (
                          <a
                            href={`tel:${phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
                          >
                            <Phone className="w-3 h-3 shrink-0" />
                            <span>{phone}</span>
                            {extraPhones > 0 ? (
                              <span className="text-[10px] text-slate-400">+{extraPhones}</span>
                            ) : null}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="tabular-nums text-slate-600">
                        Net {broker.payment_terms_days ?? 30}
                      </td>
                      <td className="text-slate-600">
                        {formatAddress(broker) !== '-' ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[140px]">{formatAddress(broker)}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="tabular-nums text-slate-600">{broker.mc_number || '—'}</td>
                      <td className="tabular-nums text-slate-600">{broker.dot_number || '—'}</td>
                      <td>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleBrokerClick(broker)
                          }}
                          className="dashboard-btn-secondary dashboard-btn-compact"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedBroker && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-stretch justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-4xl h-full max-h-[calc(100vh-1.5rem)] rounded-lg border border-slate-200 shadow-xl overflow-hidden flex flex-col">
            <div className="shrink-0 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                  aria-label="Back to list"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 truncate">
                    {selectedBroker.name}
                  </h2>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    Net {selectedBroker.payment_terms_days ?? 30}
                    {selectedBroker.contact_person ? ` · ${selectedBroker.contact_person}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 text-sm text-slate-800 space-y-4">
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Contact
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-px rounded-lg border border-slate-200 overflow-hidden bg-slate-200">
                  {selectedBroker.contact_person ? (
                    <div className="bg-white px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                        Contact person
                      </p>
                      <p className="text-sm font-medium text-slate-900 mt-0.5">
                        {selectedBroker.contact_person}
                      </p>
                    </div>
                  ) : null}

                  {selectedBroker.emails && selectedBroker.emails.length > 0
                    ? selectedBroker.emails.map((emailItem, index) => (
                        <div key={`email-${index}`} className="bg-white px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                            Email · {EMAIL_CATEGORY_LABELS[emailItem.category] || emailItem.category}
                          </p>
                          <a
                            href={`mailto:${emailItem.email}`}
                            className="inline-flex items-center gap-1 text-sm font-medium text-slate-800 hover:text-slate-950 mt-0.5"
                          >
                            <Mail className="w-3.5 h-3.5 shrink-0" />
                            {emailItem.email}
                          </a>
                        </div>
                      ))
                    : selectedBroker.email
                      ? (
                          <div className="bg-white px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                              Email
                            </p>
                            <a
                              href={`mailto:${selectedBroker.email}`}
                              className="inline-flex items-center gap-1 text-sm font-medium text-slate-800 hover:text-slate-950 mt-0.5"
                            >
                              <Mail className="w-3.5 h-3.5 shrink-0" />
                              {selectedBroker.email}
                            </a>
                          </div>
                        )
                      : null}

                  {selectedBroker.phones && selectedBroker.phones.length > 0
                    ? selectedBroker.phones.map((phoneItem, index) => (
                        <div key={`phone-${index}`} className="bg-white px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                            Phone · {PHONE_CATEGORY_FULL[phoneItem.category] || phoneItem.category}
                          </p>
                          <a
                            href={`tel:${phoneItem.phone}`}
                            className="inline-flex items-center gap-1 text-sm font-medium text-slate-800 hover:text-slate-950 mt-0.5"
                          >
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            {phoneItem.phone}
                          </a>
                        </div>
                      ))
                    : selectedBroker.phone
                      ? (
                          <div className="bg-white px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                              Phone
                            </p>
                            <a
                              href={`tel:${selectedBroker.phone}`}
                              className="inline-flex items-center gap-1 text-sm font-medium text-slate-800 hover:text-slate-950 mt-0.5"
                            >
                              <Phone className="w-3.5 h-3.5 shrink-0" />
                              {selectedBroker.phone}
                            </a>
                          </div>
                        )
                      : null}

                  {selectedBroker.fax ? (
                    <div className="bg-white px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                        Fax
                      </p>
                      <p className="text-sm font-medium text-slate-900 mt-0.5">{selectedBroker.fax}</p>
                    </div>
                  ) : null}
                </div>
              </section>

              {formatAddress(selectedBroker) !== '-' ? (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Address
                  </h3>
                  <p className="inline-flex items-start gap-1.5 text-sm text-slate-800">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    {formatAddress(selectedBroker)}
                  </p>
                </section>
              ) : null}

              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Collections preferences
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-px rounded-lg border border-slate-200 overflow-hidden bg-slate-200">
                  <div className="bg-white px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                      Payment terms
                    </p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5 tabular-nums">
                      Net {selectedBroker.payment_terms_days ?? 30}
                    </p>
                  </div>
                  <div className="bg-white px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                      Status inquiry
                    </p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5 tabular-nums">
                      {selectedBroker.payment_status_inquiry_days ?? 15} days after PPW
                    </p>
                  </div>
                  <div className="bg-white px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                      Preferred contact
                    </p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5 capitalize">
                      {selectedBroker.preferred_contact ?? 'either'}
                    </p>
                  </div>
                </div>
              </section>

              {(selectedBroker.mc_number || selectedBroker.dot_number) && (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    License
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-px rounded-lg border border-slate-200 overflow-hidden bg-slate-200">
                    {selectedBroker.mc_number ? (
                      <div className="bg-white px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                          MC
                        </p>
                        <p className="text-sm font-medium text-slate-900 mt-0.5 tabular-nums">
                          {selectedBroker.mc_number}
                        </p>
                      </div>
                    ) : null}
                    {selectedBroker.dot_number ? (
                      <div className="bg-white px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                          DOT
                        </p>
                        <p className="text-sm font-medium text-slate-900 mt-0.5 tabular-nums">
                          {selectedBroker.dot_number}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </section>
              )}

              <BrokerPaymentHistoryPanel broker={selectedBroker} />

              {selectedBroker.notes ? (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Notes
                  </h3>
                  <p className="text-sm text-slate-800 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                    {selectedBroker.notes}
                  </p>
                </section>
              ) : null}
            </div>

            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={handleCloseModal} className="dashboard-btn-secondary">
                Close
              </button>
              <button type="button" className="dashboard-btn-primary">
                Edit broker
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="shrink-0 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Add broker</h2>
              <button
                type="button"
                onClick={handleCloseAddModal}
                className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-sm">
                <section className="space-y-2.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Basic
                  </h3>
                  <label className="block text-xs">
                    <span className="font-medium text-slate-600 uppercase tracking-wide">
                      Broker name <span className="text-red-600">*</span>
                    </span>
                    <input
                      type="text"
                      required
                      value={formData.name || ''}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                </section>

                <section className="space-y-2.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Contact
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Contact person
                      </span>
                      <input
                        type="text"
                        value={formData.contact_person || ''}
                        onChange={(e) => handleInputChange('contact_person', e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">Fax</span>
                      <input
                        type="tel"
                        value={formData.fax || ''}
                        onChange={(e) => handleInputChange('fax', e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                        Emails
                      </span>
                      <button
                        type="button"
                        onClick={handleAddEmail}
                        className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {emails.map((emailItem, index) => (
                        <div key={index} className="flex items-center gap-1.5">
                          <input
                            type="email"
                            value={emailItem.email}
                            onChange={(e) => handleEmailChange(index, 'email', e.target.value)}
                            placeholder="email@example.com"
                            className={`${inputClass} flex-1`}
                          />
                          <select
                            value={emailItem.category}
                            onChange={(e) => handleEmailChange(index, 'category', e.target.value)}
                            className="client-input text-sm w-32 shrink-0"
                          >
                            <option value="accounting">Accounting</option>
                            <option value="paperwork">Paperwork</option>
                            <option value="noa">NOA</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(index)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-200"
                            aria-label="Remove email"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {emails.length === 0 ? (
                        <p className="text-xs text-slate-500">No emails yet.</p>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                        Phones
                      </span>
                      <button
                        type="button"
                        onClick={handleAddPhone}
                        className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {phones.map((phoneItem, index) => (
                        <div key={index} className="flex items-center gap-1.5">
                          <input
                            type="tel"
                            value={phoneItem.phone}
                            onChange={(e) => handlePhoneChange(index, 'phone', e.target.value)}
                            placeholder="(555) 123-4567"
                            className={`${inputClass} flex-1`}
                          />
                          <select
                            value={phoneItem.category}
                            onChange={(e) => handlePhoneChange(index, 'category', e.target.value)}
                            className="client-input text-sm w-40 shrink-0"
                          >
                            <option value="accounts_payable">Accounts Payable</option>
                            <option value="accounts_receivable">Accounts Receivable</option>
                            <option value="rate_verification">Rate Verification</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemovePhone(index)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-200"
                            aria-label="Remove phone"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {phones.length === 0 ? (
                        <p className="text-xs text-slate-500">No phones yet.</p>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="space-y-2.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Address
                  </h3>
                  <label className="block text-xs">
                    <span className="font-medium text-slate-600 uppercase tracking-wide">
                      Street
                    </span>
                    <input
                      type="text"
                      value={formData.address || ''}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">City</span>
                      <input
                        type="text"
                        value={formData.city || ''}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        State
                      </span>
                      <input
                        type="text"
                        value={formData.state || ''}
                        onChange={(e) => handleInputChange('state', e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">ZIP</span>
                      <input
                        type="text"
                        value={formData.zip || ''}
                        onChange={(e) => handleInputChange('zip', e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                  </div>
                </section>

                <section className="space-y-2.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    License
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        MC number
                      </span>
                      <input
                        type="text"
                        value={formData.mc_number || ''}
                        onChange={(e) => handleInputChange('mc_number', e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        DOT number
                      </span>
                      <input
                        type="text"
                        value={formData.dot_number || ''}
                        onChange={(e) => handleInputChange('dot_number', e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                  </div>
                </section>

                <section className="space-y-2.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Collections preferences
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Payment terms (days)
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={formData.payment_terms_days ?? 30}
                        onChange={(e) =>
                          handleInputChange('payment_terms_days', parseInt(e.target.value, 10) || 0)
                        }
                        className={`${inputClass} mt-1 tabular-nums`}
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Status inquiry (days after PPW)
                      </span>
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
                        className={`${inputClass} mt-1 tabular-nums`}
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Preferred contact
                      </span>
                      <select
                        value={formData.preferred_contact ?? 'either'}
                        onChange={(e) =>
                          handleInputChange(
                            'preferred_contact',
                            e.target.value as 'email' | 'phone' | 'either'
                          )
                        }
                        className={`${inputClass} mt-1`}
                      >
                        <option value="either">Email or phone</option>
                        <option value="email">Email only</option>
                        <option value="phone">Phone only</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="space-y-2.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Notes
                  </h3>
                  <textarea
                    value={formData.notes || ''}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    rows={3}
                    className={inputClass}
                  />
                </section>
              </div>

              <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 flex items-center justify-end gap-2">
                <button type="button" onClick={handleCloseAddModal} className="dashboard-btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="dashboard-btn-primary">
                  Add broker
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
