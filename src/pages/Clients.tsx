import { useState, useMemo } from 'react'
import { Header } from '../components/admin/Header'
import { mockClients } from '../data/mockClients'
import { Client } from '../types/client'
import { Phone, Mail, MapPin, Search, Building2, CreditCard, X, ArrowLeft } from 'lucide-react'
import { mockInvoices } from '../data/mockInvoices'
import { getAllBatches } from '../data/mockBatches'
import { mockClientCollections } from '../data/mockCollections'
import { mockBrokers } from '../data/mockBrokers'
import { Broker } from '../types/broker'
import { Invoice } from '../types/invoice'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/format'
import AdminInvoiceDetailView from '../components/batches/AdminInvoiceDetailView'

type ClientTab = 'ar' | 'batches' | 'collections' | 'terms'

export default function Clients() {
  const [clients, setClients] = useState<Client[]>(mockClients)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [activeTab, setActiveTab] = useState<ClientTab>('ar')
  const [arFilter, setArFilter] = useState<'all' | 'open' | 'paid'>('all')
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [formData, setFormData] = useState<Partial<Client>>({
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
    remittance_info: '',
    bank_name: '',
    account_number: '',
    routing_number: '',
    notes: '',
    status: 'active',
  })

  const filteredClients = clients.filter((client) => {
    if (searchTerm === '') return true
    const searchLower = searchTerm.toLowerCase()
    return (
      client.name.toLowerCase().includes(searchLower) ||
      client.contact_person?.toLowerCase().includes(searchLower) ||
      client.email?.toLowerCase().includes(searchLower) ||
      client.phone?.toLowerCase().includes(searchLower) ||
      client.mc_number?.toLowerCase().includes(searchLower) ||
      client.dot_number?.toLowerCase().includes(searchLower) ||
      client.city?.toLowerCase().includes(searchLower) ||
      client.state?.toLowerCase().includes(searchLower)
    )
  })

  const handleClientClick = (client: Client) => {
    setSelectedClient(client)
  }

  const handleCloseModal = () => {
    setSelectedClient(null)
    setActiveTab('ar')
    setArFilter('all')
    setSelectedBroker(null)
    setSelectedInvoice(null)
  }

  // Get brokers with invoice counts for the selected client
  const brokersWithCounts = useMemo(() => {
    if (!selectedClient) return []
    
    // Get all invoices for this client
    const clientInvoices = mockInvoices.filter(
      (inv) => inv.client_id === selectedClient.id && 
               inv.status !== 'hold' && 
               inv.status !== 'pending'
    )
    
    // Group invoices by broker
    const brokerMap = new Map<string, { broker: Broker; invoices: Invoice[] }>()
    
    clientInvoices.forEach((inv) => {
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
  }, [selectedClient])

  // Get invoices for selected broker
  const brokerInvoices = useMemo(() => {
    if (!selectedBroker || !selectedClient) return []
    return mockInvoices.filter(
      (inv) => inv.broker_id === selectedBroker.id && 
               inv.client_id === selectedClient.id &&
               inv.status !== 'hold' && 
               inv.status !== 'pending'
    )
  }, [selectedBroker, selectedClient])

  // Get data for selected client
  const clientInvoices = useMemo(() => {
    if (!selectedClient) return []
    return mockInvoices.filter((inv) => inv.client_id === selectedClient.id)
  }, [selectedClient])

  const clientBatches = useMemo(() => {
    if (!selectedClient) return []
    return getAllBatches().filter((batch) => batch.client_id === selectedClient.id)
  }, [selectedClient])

  const clientCollections = useMemo(() => {
    if (!selectedClient) return []
    return mockClientCollections.filter((col) => {
      const invoice = mockInvoices.find((inv) => inv.id === col.invoice_id)
      return invoice?.client_id === selectedClient.id
    })
  }, [selectedClient])

  // Calculate A/R totals based on filter
  const arTotals = useMemo(() => {
    const totals = {
      total: 0,
      '1_15': 0,
      '16_30': 0,
      '31_45': 0,
      '46_60': 0,
      '61_90': 0,
      over_91: 0,
    }
    
    // Filter invoices based on selected filter
    const filteredInvoices = clientInvoices.filter((inv) => {
      // Always exclude hold and pending invoices from A/R
      if (inv.status === 'hold' || inv.status === 'pending') {
        return false
      }
      
      // Apply filter
      if (arFilter === 'open') {
        return inv.status !== 'paid'
      } else if (arFilter === 'paid') {
        return inv.status === 'paid'
      } else {
        // 'all' - include both paid and open (approved) invoices
        return inv.status === 'paid' || inv.status === 'approved' || (inv.status !== 'hold' && inv.status !== 'pending')
      }
    })
    
    filteredInvoices.forEach((inv) => {
      const days = inv.days_since_expected || 0
      totals.total += inv.amount
      
      // Only calculate aging buckets for open (non-paid) invoices
      if (inv.status !== 'paid') {
        if (days <= 15) totals['1_15'] += inv.amount
        else if (days <= 30) totals['16_30'] += inv.amount
        else if (days <= 45) totals['31_45'] += inv.amount
        else if (days <= 60) totals['46_60'] += inv.amount
        else if (days <= 90) totals['61_90'] += inv.amount
        else totals.over_91 += inv.amount
      }
    })
    
    return totals
  }, [clientInvoices, arFilter])
  
  // Get filtered invoices for table display
  const filteredArInvoices = useMemo(() => {
    return clientInvoices.filter((inv) => {
      // Always exclude hold and pending invoices from A/R
      if (inv.status === 'hold' || inv.status === 'pending') {
        return false
      }
      
      // Apply filter
      if (arFilter === 'open') {
        return inv.status !== 'paid'
      } else if (arFilter === 'paid') {
        return inv.status === 'paid'
      } else {
        // 'all' - include both paid and open (approved) invoices
        return inv.status === 'paid' || inv.status === 'approved' || (inv.status !== 'hold' && inv.status !== 'pending')
      }
    })
  }, [clientInvoices, arFilter])

  const handleOpenAddModal = () => {
    setShowAddModal(true)
    setFormData({
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
      remittance_info: '',
      bank_name: '',
      account_number: '',
      routing_number: '',
      notes: '',
      status: 'active',
    })
  }

  const handleCloseAddModal = () => {
    setShowAddModal(false)
    setFormData({
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
      remittance_info: '',
      bank_name: '',
      account_number: '',
      routing_number: '',
      notes: '',
      status: 'active',
    })
  }

  const handleInputChange = (field: keyof Client, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name) {
      alert('Client name is required')
      return
    }

    const newClient: Client = {
      id: `client-${Date.now()}`,
      name: formData.name,
      contact_person: formData.contact_person || undefined,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      fax: formData.fax || undefined,
      address: formData.address || undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      zip: formData.zip || undefined,
      mc_number: formData.mc_number || undefined,
      dot_number: formData.dot_number || undefined,
      remittance_info: formData.remittance_info || undefined,
      bank_name: formData.bank_name || undefined,
      account_number: formData.account_number || undefined,
      routing_number: formData.routing_number || undefined,
      notes: formData.notes || undefined,
      status: (formData.status as 'active' | 'inactive' | 'pending') || 'active',
    }

    setClients((prev) => [...prev, newClient])
    handleCloseAddModal()
  }

  const formatAddress = (client: Client) => {
    const parts = [client.address, client.city, client.state, client.zip].filter(Boolean)
    return parts.join(', ') || '-'
  }

  const getStatusBadge = (status?: string) => {
    const statusConfig = {
      active: { color: 'bg-green-100 text-green-800', label: 'Active' },
      inactive: { color: 'bg-gray-100 text-gray-800', label: 'Inactive' },
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.active

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName="Admin User" userRole="Administrator" />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-black mb-2">Clients</h1>
          <p className="text-gray-600">Manage client (carrier) information and payment details</p>
        </div>

        {/* Search and Actions */}
        <div className="bg-white border border-gray-200 p-4 mb-6 rounded">
          <div className="flex items-center justify-between">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search clients..."
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
              Add Client
            </button>
          </div>
        </div>

        {/* Clients Table */}
        <div className="bg-white border border-gray-200">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-black">All Clients</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''} found
                </p>
              </div>
            </div>

            {filteredClients.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg font-medium mb-2">No clients found</p>
                <p className="text-sm">Try adjusting your search criteria</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Client Name
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
                        Status
                      </th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client, index) => (
                      <tr
                        key={client.id}
                        className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${
                          index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                        }`}
                        onClick={() => handleClientClick(client)}
                      >
                        <td className="py-3 px-4 text-sm font-medium text-gray-900">
                          {client.name}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {client.contact_person || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {client.email ? (
                            <a
                              href={`mailto:${client.email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                            >
                              <Mail className="w-3 h-3" />
                              <span>{client.email}</span>
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {client.phone ? (
                            <a
                              href={`tel:${client.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{client.phone}</span>
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {formatAddress(client) !== '-' ? (
                            <div className="flex items-center space-x-1">
                              <MapPin className="w-3 h-3 text-gray-400" />
                              <span>{formatAddress(client)}</span>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {client.mc_number || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm">{getStatusBadge(client.status)}</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleClientClick(client)
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
      </main>

      {/* Client Detail Modal with Tabs */}
      {selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-gray-100 rounded transition-colors"
                  style={{ color: '#819291' }}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-2xl font-bold" style={{ color: '#113543' }}>
                    {selectedClient.name}
                  </h2>
                  <div className="mt-1">{getStatusBadge(selectedClient.status)}</div>
                </div>
              </div>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-black transition-colors"
                >
                <X className="w-5 h-5" />
                </button>
              </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 flex-shrink-0">
              <nav className="flex space-x-1 px-6">
                {[
                  { id: 'ar' as ClientTab, label: 'A/R' },
                  { id: 'batches' as ClientTab, label: 'Batches' },
                  { id: 'collections' as ClientTab, label: 'Collections' },
                  { id: 'terms' as ClientTab, label: 'Terms' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id)
                      // Reset broker selection when switching tabs
                      if (tab.id !== 'collections') {
                        setSelectedBroker(null)
                        setSelectedInvoice(null)
                      }
                    }}
                    className="px-6 py-3 text-sm font-medium transition-colors relative"
                    style={{
                      color: activeTab === tab.id ? '#113543' : '#819291',
                      borderBottom: activeTab === tab.id ? '2px solid #C2A558' : '2px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (activeTab !== tab.id) {
                        e.currentTarget.style.color = '#113543'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeTab !== tab.id) {
                        e.currentTarget.style.color = '#819291'
                      }
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'ar' && (
              <div className="space-y-6">
                  {/* Filter Buttons */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setArFilter('all')}
                        className="px-4 py-2 text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: arFilter === 'all' ? '#C2A558' : '#f8f9fa',
                          color: arFilter === 'all' ? '#FFFFFF' : '#113543',
                          border: arFilter === 'all' ? 'none' : '1px solid #819291',
                        }}
                        onMouseEnter={(e) => {
                          if (arFilter !== 'all') {
                            e.currentTarget.style.backgroundColor = '#f0f0f0'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (arFilter !== 'all') {
                            e.currentTarget.style.backgroundColor = '#f8f9fa'
                          }
                        }}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setArFilter('open')}
                        className="px-4 py-2 text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: arFilter === 'open' ? '#C2A558' : '#f8f9fa',
                          color: arFilter === 'open' ? '#FFFFFF' : '#113543',
                          border: arFilter === 'open' ? 'none' : '1px solid #819291',
                        }}
                        onMouseEnter={(e) => {
                          if (arFilter !== 'open') {
                            e.currentTarget.style.backgroundColor = '#f0f0f0'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (arFilter !== 'open') {
                            e.currentTarget.style.backgroundColor = '#f8f9fa'
                          }
                        }}
                      >
                        Open Only
                      </button>
                      <button
                        onClick={() => setArFilter('paid')}
                        className="px-4 py-2 text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: arFilter === 'paid' ? '#C2A558' : '#f8f9fa',
                          color: arFilter === 'paid' ? '#FFFFFF' : '#113543',
                          border: arFilter === 'paid' ? 'none' : '1px solid #819291',
                        }}
                        onMouseEnter={(e) => {
                          if (arFilter !== 'paid') {
                            e.currentTarget.style.backgroundColor = '#f0f0f0'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (arFilter !== 'paid') {
                            e.currentTarget.style.backgroundColor = '#f8f9fa'
                          }
                        }}
                      >
                        Paid Only
                      </button>
                    </div>
                  </div>

                  {/* A/R Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                      <div className="text-sm mb-1" style={{ color: '#819291' }}>
                        Total {arFilter === 'paid' ? 'Paid' : arFilter === 'open' ? 'Open A/R' : 'A/R'}
                      </div>
                      <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                        {formatCurrency(arTotals.total)}
                      </div>
                    </div>
                    {arFilter !== 'paid' && (
                      <>
                        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                          <div className="text-sm mb-1" style={{ color: '#819291' }}>1-15 Days</div>
                          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                            {formatCurrency(arTotals['1_15'])}
                          </div>
                        </div>
                        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                          <div className="text-sm mb-1" style={{ color: '#819291' }}>16-30 Days</div>
                          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                            {formatCurrency(arTotals['16_30'])}
                          </div>
                        </div>
                        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                          <div className="text-sm mb-1" style={{ color: '#819291' }}>31-45 Days</div>
                          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                            {formatCurrency(arTotals['31_45'])}
                          </div>
                        </div>
                      </>
                    )}
                    {arFilter === 'paid' && (
                      <>
                        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                          <div className="text-sm mb-1" style={{ color: '#819291' }}>Total Paid</div>
                          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                            {formatCurrency(arTotals.total)}
                          </div>
                        </div>
                        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                          <div className="text-sm mb-1" style={{ color: '#819291' }}>Invoices</div>
                          <div className="text-2xl font-bold" style={{ color: '#113543' }}>
                            {filteredArInvoices.length}
                          </div>
                        </div>
                        <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                          <div className="text-sm mb-1" style={{ color: '#819291' }}>Status</div>
                          <div className="text-2xl font-bold" style={{ color: '#819291' }}>
                            Paid
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* A/R Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b" style={{ borderColor: '#819291' }}>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Invoice#
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Broker
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
                        </tr>
                      </thead>
                      <tbody>
                        {filteredArInvoices.map((inv, index) => (
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
                                {inv.broker_name || '-'}
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
                              <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                                {inv.status === 'paid' ? '-' : `${inv.days_since_expected || 0} days`}
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
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                      </div>
                    )}

              {activeTab === 'batches' && (
                <div className="space-y-6">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b" style={{ borderColor: '#819291' }}>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Batch#
                          </th>
                          <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Total Invoices
                          </th>
                          <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Total Amount
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Status
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: '#113543' }}>
                            Submitted
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientBatches.map((batch, index) => (
                          <tr
                            key={batch.id}
                            className="border-b"
                            style={{
                              borderColor: '#819291',
                              backgroundColor: index % 2 === 0 ? '#f8f9fa' : '#FFFFFF',
                            }}
                          >
                            <td className="py-3 px-4 text-sm font-medium" style={{ color: '#113543' }}>
                              {batch.batch_number}
                            </td>
                            <td className="py-3 px-4 text-sm text-right" style={{ color: '#819291' }}>
                              {batch.total_invoices}
                            </td>
                            <td className="py-3 px-4 text-sm text-right font-medium" style={{ color: '#113543' }}>
                              {formatCurrency(batch.total_amount)}
                            </td>
                            <td className="py-3 px-4 text-sm">
                              <span
                                className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                                style={{
                                  backgroundColor: batch.status === 'ready_to_post' ? '#C2A558' : '#819291',
                                  color: '#FFFFFF',
                                }}
                              >
                                {batch.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm" style={{ color: '#819291' }}>
                              {formatDate(batch.submitted_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                      </div>
                    )}

              {activeTab === 'collections' && (
                <div className="space-y-6">
                  {!selectedBroker ? (
                    // Broker List View
                    <div className="space-y-6">
                      {brokersWithCounts.length === 0 ? (
                        <div className="text-center py-12" style={{ color: '#819291' }}>
                          <div className="text-4xl mb-2">📋</div>
                          <div className="font-medium">No brokers found for this client</div>
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
                          <h3 className="text-lg font-bold" style={{ color: '#113543' }}>
                            {selectedBroker.name}
                          </h3>
                          <p className="text-sm" style={{ color: '#819291' }}>
                            Payment Terms: Net {selectedBroker.payment_terms_days || 30}
                          </p>
                  </div>
                </div>

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

                      {/* Invoice Detail View */}
                      {selectedInvoice && (
                        <AdminInvoiceDetailView
                          invoice={selectedInvoice}
                          invoiceList={brokerInvoices}
                          onInvoiceSelect={(inv) => setSelectedInvoice(inv)}
                          onClose={() => setSelectedInvoice(null)}
                          // Disable approve/hold since invoices are already processed
                        />
                      )}
                        </div>
                      )}
                </div>
              )}

              {activeTab === 'terms' && (
                <div className="space-y-6">
                  {/* Fee Terms */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4" style={{ color: '#113543' }}>
                      Fee Terms
                    </h3>
                    <p className="text-sm mb-4" style={{ color: '#819291' }}>
                      Set the fee structure for this client. Fees will be automatically calculated when batches are submitted.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                          Fee Type
                        </label>
                        <select
                          value={selectedClient.fee_terms?.fee_type || 'percentage'}
                          onChange={(e) => {
                            const newFeeType = e.target.value as 'percentage' | 'flat'
                            setClients((prev) =>
                              prev.map((c) =>
                                c.id === selectedClient.id
                                  ? {
                                      ...c,
                                      fee_terms: {
                                        ...c.fee_terms,
                                        fee_type: newFeeType,
                                        fee_percentage: newFeeType === 'percentage' ? c.fee_terms?.fee_percentage : undefined,
                                        flat_fee_amount: newFeeType === 'flat' ? c.fee_terms?.flat_fee_amount : undefined,
                                      },
                                    }
                                  : c
                              )
                            )
                            setSelectedClient((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    fee_terms: {
                                      ...prev.fee_terms,
                                      fee_type: newFeeType,
                                      fee_percentage: newFeeType === 'percentage' ? prev.fee_terms?.fee_percentage : undefined,
                                      flat_fee_amount: newFeeType === 'flat' ? prev.fee_terms?.flat_fee_amount : undefined,
                                    },
                                  }
                                : null
                            )
                          }}
                          className="w-full px-3 py-2 text-sm border rounded"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                        >
                          <option value="percentage">Percentage</option>
                          <option value="flat">Flat Fee</option>
                        </select>
                      </div>
                      {selectedClient.fee_terms?.fee_type === 'percentage' ? (
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                            Fee Percentage (%)
                          </label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={selectedClient.fee_terms?.fee_percentage || ''}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0
                                setClients((prev) =>
                                  prev.map((c) =>
                                    c.id === selectedClient.id
                                      ? {
                                          ...c,
                                          fee_terms: {
                                            ...c.fee_terms,
                                            fee_type: 'percentage',
                                            fee_percentage: value,
                                          },
                                        }
                                      : c
                                  )
                                )
                                setSelectedClient((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        fee_terms: {
                                          ...prev.fee_terms,
                                          fee_type: 'percentage',
                                          fee_percentage: value,
                                        },
                                      }
                                    : null
                                )
                              }}
                              className="flex-1 px-3 py-2 text-sm border rounded"
                              style={{
                                borderColor: '#819291',
                                color: '#113543',
                                backgroundColor: '#FFFFFF',
                              }}
                              placeholder="e.g., 2.5 for 2.5%"
                            />
                            <span className="text-sm" style={{ color: '#819291' }}>%</span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                            Flat Fee Amount ($)
                          </label>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm" style={{ color: '#819291' }}>$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={selectedClient.fee_terms?.flat_fee_amount || ''}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0
                                setClients((prev) =>
                                  prev.map((c) =>
                                    c.id === selectedClient.id
                                      ? {
                                          ...c,
                                          fee_terms: {
                                            ...c.fee_terms,
                                            fee_type: 'flat',
                                            flat_fee_amount: value,
                                          },
                                        }
                                      : c
                                  )
                                )
                                setSelectedClient((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        fee_terms: {
                                          ...prev.fee_terms,
                                          fee_type: 'flat',
                                          flat_fee_amount: value,
                                        },
                                      }
                                    : null
                                )
                              }}
                              className="flex-1 px-3 py-2 text-sm border rounded"
                              style={{
                                borderColor: '#819291',
                                color: '#113543',
                                backgroundColor: '#FFFFFF',
                              }}
                              placeholder="e.g., 50.00"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    {selectedClient.fee_terms?.fee_type === 'percentage' && selectedClient.fee_terms?.fee_percentage && (
                      <div className="mt-4 p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                        <p className="text-sm" style={{ color: '#819291' }}>
                          Example: For a batch with $10,000 total amount, the fee would be{' '}
                          <span className="font-medium" style={{ color: '#113543' }}>
                            {formatCurrency((10000 * (selectedClient.fee_terms.fee_percentage || 0)) / 100)}
                          </span>
                        </p>
                  </div>
                )}
                  </div>

                {/* Remittance Information */}
                {selectedClient.remittance_info && (
                  <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2" style={{ color: '#113543' }}>
                      <CreditCard className="w-5 h-5" />
                      <span>Remittance Information</span>
                    </h3>
                      <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                        <p className="text-sm" style={{ color: '#113543' }}>
                          {selectedClient.remittance_info}
                        </p>
                    </div>
                  </div>
                )}

                {/* Banking Information */}
                {(selectedClient.bank_name || selectedClient.account_number || selectedClient.routing_number) && (
                  <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2" style={{ color: '#113543' }}>
                      <Building2 className="w-5 h-5" />
                      <span>Banking Information</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {selectedClient.bank_name && (
                          <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                            <label className="text-sm mb-1" style={{ color: '#819291' }}>Bank Name</label>
                            <p className="text-sm font-medium" style={{ color: '#113543' }}>
                            {selectedClient.bank_name}
                          </p>
                        </div>
                      )}
                      {selectedClient.account_number && (
                          <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                            <label className="text-sm mb-1" style={{ color: '#819291' }}>Account Number</label>
                            <p className="text-sm font-medium" style={{ color: '#113543' }}>
                            {selectedClient.account_number}
                          </p>
                        </div>
                      )}
                      {selectedClient.routing_number && (
                          <div className="p-4 border rounded" style={{ backgroundColor: '#f8f9fa', borderColor: '#819291' }}>
                            <label className="text-sm mb-1" style={{ color: '#819291' }}>Routing Number</label>
                            <p className="text-sm font-medium" style={{ color: '#113543' }}>
                            {selectedClient.routing_number}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-black">Add New Client</h2>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Client Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name || ''}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={formData.status || 'active'}
                        onChange={(e) => handleInputChange('status', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4">Contact Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={formData.phone || ''}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
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
                </div>

                {/* Address */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4">Address</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">MC Number</label>
                      <input
                        type="text"
                        value={formData.mc_number || ''}
                        onChange={(e) => handleInputChange('mc_number', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">DOT Number</label>
                      <input
                        type="text"
                        value={formData.dot_number || ''}
                        onChange={(e) => handleInputChange('dot_number', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Remittance Information */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4 flex items-center space-x-2">
                    <CreditCard className="w-5 h-5" />
                    <span>Remittance Information</span>
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Remittance Instructions
                    </label>
                    <textarea
                      value={formData.remittance_info || ''}
                      onChange={(e) => handleInputChange('remittance_info', e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Banking Information */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4 flex items-center space-x-2">
                    <Building2 className="w-5 h-5" />
                    <span>Banking Information</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                      <input
                        type="text"
                        value={formData.bank_name || ''}
                        onChange={(e) => handleInputChange('bank_name', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={formData.account_number || ''}
                        onChange={(e) => handleInputChange('account_number', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Routing Number
                      </label>
                      <input
                        type="text"
                        value={formData.routing_number || ''}
                        onChange={(e) => handleInputChange('routing_number', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
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
                    Add Client
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

