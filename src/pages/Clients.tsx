import { useState, useMemo, useEffect } from 'react'
import AdminLayout from '../components/AdminLayout'
import { Client, ServiceTier } from '../types/client'
import {
  getAllClients,
  createClient,
  updateClient,
  updateClientTier,
  hydrateClientRegistry,
  fetchClientById,
} from '../services/clientRegistry'
import { provisionClientAuthAccount } from '../services/clientAuthService'
import { getPlanForTier, createDefaultBilling } from '../config/servicePlans'
import { getTierShortLabel } from '../utils/clientCapabilities'
import { isSupabaseConfigured } from '../lib/supabase'
import { SkeletonRows } from '../components/ui/Skeleton'
import { loadClientTenantData, getClientInvoices, getClientBatches } from '../data/clientDemoData'
import { Phone, Mail, MapPin, Search, Building2, CreditCard, X, ArrowLeft, Plus, FolderOpen } from 'lucide-react'
import { mockBrokers } from '../data/mockBrokers'
import { Broker } from '../types/broker'
import { Invoice } from '../types/invoice'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/format'
import AdminInvoiceDetailView from '../components/batches/AdminInvoiceDetailView'
import AdminClientVaultPanel from '../components/admin/AdminClientVaultPanel'
import ClientCalendarPanel from '../components/admin/ClientCalendarPanel'
import { useToast } from '../components/ui/ToastProvider'
import { syncClientBatchFees } from '../services/batchFeeSync'
import { getClientDocuments } from '../services/clientDocumentService'
import {
  defaultRemittanceBlastVaultIds,
  listRemittanceBlastRecipients,
  sendRemittanceUpdatedToBrokers,
} from '../services/remittanceBlastService'
import {
  formatVaultDocPickerLabel,
  selectionHasBankProof,
} from '../utils/carrierRemittance'
import {
  countClientsWithPendingVaultDocs,
  isClientSetupComplete,
} from '../utils/clientSetupDocuments'
import { useAuth } from '../context/AuthContext'
import { getAdminUserDisplayName } from '../config/adminNav'
import '../styles/clientPortal.css'

type ClientTab = 'ar' | 'batches' | 'collections' | 'terms' | 'plan' | 'vault' | 'calendar'

export default function Clients() {
  const { showToast } = useToast()
  const { resolved } = useAuth()
  const [clients, setClients] = useState<Client[]>(() => getAllClients())
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [activeTab, setActiveTab] = useState<ClientTab>('ar')
  const [arFilter, setArFilter] = useState<'all' | 'open' | 'paid'>('all')
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showRemittanceBlastModal, setShowRemittanceBlastModal] = useState(false)
  const [remittanceBlastVaultIds, setRemittanceBlastVaultIds] = useState<string[]>([])
  const [remittanceBlastMessage, setRemittanceBlastMessage] = useState('')
  const [remittanceBlastBusy, setRemittanceBlastBusy] = useState(false)
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
    service_tier: 'self_service' as ServiceTier,
  })

  const [tenantVersion, setTenantVersion] = useState(0)
  const [tenantLoading, setTenantLoading] = useState(false)

  const refreshClients = () => setClients(getAllClients())

  useEffect(() => {
    void hydrateClientRegistry().then(() => refreshClients())
  }, [])

  useEffect(() => {
    if (!selectedClient || !isSupabaseConfigured()) return
    setTenantLoading(true)
    void loadClientTenantData(selectedClient.id, selectedClient.name)
      .then(() => setTenantVersion((v) => v + 1))
      .finally(() => setTenantLoading(false))
  }, [selectedClient?.id])

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

  const pendingVaultClientCount = useMemo(
    () => countClientsWithPendingVaultDocs(clients.map((c) => c.id)),
    [clients, tenantVersion]
  )

  const adminDisplayName =
    getAdminUserDisplayName(resolved.user?.email ?? null) || 'Admin'

  const handleClientClick = (client: Client) => {
    setSelectedClient(getAllClients().find((c) => c.id === client.id) ?? client)
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
    const clientInvoices = getClientInvoices(selectedClient.id, selectedClient.name).filter(
      (inv) => inv.status !== 'hold' && inv.status !== 'pending'
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
  }, [selectedClient, tenantVersion])

  // Get invoices for selected broker
  const brokerInvoices = useMemo(() => {
    if (!selectedBroker || !selectedClient) return []
    return getClientInvoices(selectedClient.id, selectedClient.name).filter(
      (inv) =>
        inv.broker_id === selectedBroker.id &&
        inv.status !== 'hold' &&
        inv.status !== 'pending'
    )
  }, [selectedBroker, selectedClient, tenantVersion])

  // Get data for selected client
  const clientInvoices = useMemo(() => {
    if (!selectedClient) return []
    return getClientInvoices(selectedClient.id, selectedClient.name)
  }, [selectedClient, tenantVersion])

  const clientBatches = useMemo(() => {
    if (!selectedClient) return []
    return getClientBatches(selectedClient.id)
  }, [selectedClient, tenantVersion])

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
        return inv.status === 'paid' || inv.status === 'approved'
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
        return inv.status === 'paid' || inv.status === 'approved'
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name) {
      showToast('Client name is required', 'error')
      return
    }

    await createClient({
      name: formData.name,
      contact_person: formData.contact_person,
      email: formData.email,
      phone: formData.phone,
      service_tier: (formData.service_tier as ServiceTier) || 'self_service',
      status: (formData.status as Client['status']) || 'active',
    })
    refreshClients()
    handleCloseAddModal()
  }

  const formatAddress = (client: Client) => {
    const parts = [client.address, client.city, client.state, client.zip].filter(Boolean)
    return parts.join(', ') || '-'
  }

  const getStatusBadge = (status?: string) => {
    const styles: Record<string, string> = {
      active: 'status-pill status-pill--paid',
      inactive: 'status-pill',
      pending: 'status-pill status-pill--pending',
      suspended: 'status-pill status-pill--hold',
    }
    const label =
      status === 'inactive'
        ? 'Inactive'
        : status === 'pending'
          ? 'Pending'
          : status === 'suspended'
            ? 'Suspended'
            : 'Active'
    return <span className={`${styles[status ?? 'active'] ?? 'status-pill'} capitalize`}>{label}</span>
  }

  /** Persist fee terms immediately (Terms tab edits). */
  const persistFeeTerms = async (next: Client['fee_terms']) => {
    if (!selectedClient) return
    const updated = await updateClient(selectedClient.id, { fee_terms: next })
    if (updated) {
      setSelectedClient(updated)
      refreshClients()
      // Batches pull live from client terms — refresh fee totals everywhere.
      syncClientBatchFees(selectedClient.id)
    }
  }

  return (
    <AdminLayout flushMain>
      <div className="flex flex-col min-h-0 h-full overflow-hidden">
        <div className="client-page-toolbar shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-200">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search clients…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="client-input w-full pl-8 pr-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500 tabular-nums">
              {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
            </p>
            {pendingVaultClientCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                <FolderOpen className="w-3 h-3" />
                {pendingVaultClientCount} pending docs
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add client
            </button>
          </div>
        </div>

        <div className="client-table-scroll flex-1 min-h-0 overflow-auto">
          {filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <p className="text-sm font-medium">No clients found</p>
              <p className="text-xs mt-1">Try adjusting your search</p>
            </div>
          ) : (
            <table className="dashboard-table dashboard-table--compact w-full min-w-[920px]">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Plan</th>
                  <th>Billing</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Location</th>
                  <th>MC</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => {
                  const billing = client.billing?.subscription_status ?? 'trial'
                  return (
                    <tr
                      key={client.id}
                      className="dashboard-table-row--clickable"
                      onClick={() => handleClientClick(client)}
                    >
                      <td>
                        <p className="font-medium text-slate-900">{client.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {client.factoring ? (
                            <span className="text-[10px] text-slate-500 font-medium">Factoring</span>
                          ) : null}
                          {!isClientSetupComplete(client.id, client) ? (
                            <span className="text-[10px] font-semibold text-amber-700">
                              Setup incomplete
                            </span>
                          ) : null}
                          {getClientDocuments(client.id).some((d) => d.approval_status === 'pending') ? (
                            <span className="text-[10px] font-semibold text-amber-800">
                              Docs pending
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <span className="text-xs font-medium text-slate-700">
                          {getTierShortLabel(client.service_tier ?? 'self_service')}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`text-xs font-medium capitalize ${
                            billing === 'trial' ? 'text-sky-700' : 'text-slate-700'
                          }`}
                        >
                          {billing.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="text-slate-600">{client.contact_person || '—'}</td>
                      <td>
                        {client.email ? (
                          <a
                            href={`mailto:${client.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
                          >
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[160px]">{client.email}</span>
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {client.phone ? (
                          <a
                            href={`tel:${client.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
                          >
                            <Phone className="w-3 h-3 shrink-0" />
                            {client.phone}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-slate-600">
                        {formatAddress(client) !== '-' ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[140px]">{formatAddress(client)}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="tabular-nums text-slate-600">{client.mc_number || '—'}</td>
                      <td>{getStatusBadge(client.status)}</td>
                      <td>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleClientClick(client)
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

      {/* Client detail workspace */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-stretch justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-6xl h-full max-h-[calc(100vh-1.5rem)] rounded-lg border border-slate-200 shadow-xl overflow-hidden flex flex-col">
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
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-900 truncate">
                      {selectedClient.name}
                    </h2>
                    {getStatusBadge(selectedClient.status)}
                    {selectedClient.billing?.subscription_status === 'trial' ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                        Trial
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {getTierShortLabel(selectedClient.service_tier ?? 'self_service')}
                    {selectedClient.email ? ` · ${selectedClient.email}` : ''}
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

            <div className="shrink-0 border-b border-slate-200 px-3 py-1.5 flex items-center gap-1 overflow-x-auto">
              {(
                [
                  ['ar', 'A/R'],
                  ['batches', 'Batches'],
                  ['collections', 'Collections'],
                  ['calendar', 'Calendar'],
                  ['terms', 'Terms'],
                  ['plan', 'Plan'],
                  ['vault', 'Vault'],
                ] as const
              ).map(([id, label]) => {
                const pendingCount =
                  id === 'vault' && selectedClient
                    ? getClientDocuments(selectedClient.id).filter(
                        (d) => d.approval_status === 'pending'
                      ).length
                    : 0
                return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveTab(id)
                    if (id !== 'collections') {
                      setSelectedBroker(null)
                      setSelectedInvoice(null)
                    }
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors shrink-0 ${
                    activeTab === id
                      ? 'border-slate-900 bg-white text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {label}
                  {pendingCount > 0 ? (
                    <span className="ml-1 inline-flex min-w-[1.1rem] justify-center rounded-full bg-amber-500 text-white text-[10px] px-1">
                      {pendingCount}
                    </span>
                  ) : null}
                </button>
              )})}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 relative text-sm text-slate-800">
              {tenantLoading && (
                <div className="absolute inset-0 z-10 bg-white/90 p-4">
                  <SkeletonRows rows={6} rowClassName="h-14" />
                </div>
              )}
              {activeTab === 'ar' && (
              <div className="space-y-3">
                  <div className="flex items-center gap-1">
                    {(
                      [
                        ['all', 'All'],
                        ['open', 'Open'],
                        ['paid', 'Paid'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setArFilter(id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                          arFilter === id
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-lg border border-slate-200 overflow-hidden bg-slate-200">
                    <div className="bg-white px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                        Total {arFilter === 'paid' ? 'paid' : arFilter === 'open' ? 'open' : 'A/R'}
                      </p>
                      <p className="text-base font-semibold tabular-nums text-slate-900 mt-0.5">
                        {formatCurrency(arTotals.total)}
                      </p>
                    </div>
                    {arFilter !== 'paid' ? (
                      <>
                        {(
                          [
                            ['1-15', arTotals['1_15']],
                            ['16-30', arTotals['16_30']],
                            ['31-45', arTotals['31_45']],
                          ] as const
                        ).map(([label, value]) => (
                          <div key={label} className="bg-white px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                              {label} days
                            </p>
                            <p className="text-base font-semibold tabular-nums text-slate-900 mt-0.5">
                              {formatCurrency(value)}
                            </p>
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className="bg-white px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                            Invoices
                          </p>
                          <p className="text-base font-semibold tabular-nums text-slate-900 mt-0.5">
                            {filteredArInvoices.length}
                          </p>
                        </div>
                        <div className="bg-white px-3 py-2 col-span-2">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                            Status
                          </p>
                          <p className="text-base font-semibold text-slate-700 mt-0.5">Paid</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* A/R Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="dashboard-table dashboard-table--compact w-full">
                      <thead>
                        <tr>
                          <th>Invoice#</th>
                          <th>Broker</th>
                          <th className="text-right">Amount</th>
                          <th>Invoice date</th>
                          <th>Due date</th>
                          <th>Days overdue</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredArInvoices.map((inv) => (
                            <tr key={inv.id}>
                              <td className="font-medium">{inv.invoice_number}</td>
                              <td className="text-slate-600">{inv.broker_name || '—'}</td>
                              <td className="text-right tabular-nums font-medium">
                                {formatCurrency(inv.amount)}
                              </td>
                              <td className="text-slate-600">{formatDate(inv.invoice_date)}</td>
                              <td className="text-slate-600">{formatDate(inv.due_date)}</td>
                              <td className="text-slate-600">
                                {inv.status === 'paid' ? '—' : `${inv.days_since_expected || 0} days`}
                              </td>
                              <td>
                                <span
                                  className={`status-pill capitalize ${
                                    inv.status === 'paid'
                                      ? 'status-pill--paid'
                                      : inv.status === 'hold'
                                        ? 'status-pill--hold'
                                        : 'status-pill--pending'
                                  }`}
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
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="dashboard-table dashboard-table--compact w-full">
                      <thead>
                        <tr>
                          <th>Batch#</th>
                          <th className="text-right">Invoices</th>
                          <th className="text-right">Amount</th>
                          <th>Status</th>
                          <th>Submitted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientBatches.map((batch) => (
                          <tr key={batch.id}>
                            <td className="font-medium">{batch.batch_number}</td>
                            <td className="text-right tabular-nums">{batch.total_invoices}</td>
                            <td className="text-right tabular-nums font-medium">
                              {formatCurrency(batch.total_amount)}
                            </td>
                            <td>
                              <span
                                className={`status-pill capitalize ${
                                  batch.status === 'ready_to_post'
                                    ? 'status-pill--pending'
                                    : 'status-pill'
                                }`}
                              >
                                {batch.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="text-slate-600">{formatDate(batch.submitted_at)}</td>
                          </tr>
                        ))}
                        {clientBatches.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center text-slate-500 py-6">
                              No batches for this client.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                    )}

              {activeTab === 'collections' && (
                <div className="space-y-4">
                  {!selectedBroker ? (
                    <div className="space-y-3">
                      {brokersWithCounts.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">
                          <p className="text-sm font-medium">No brokers found for this client</p>
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

              {activeTab === 'calendar' && selectedClient && (
                <ClientCalendarPanel client={selectedClient} />
              )}

              {activeTab === 'plan' && selectedClient && (
                <div className="max-w-3xl space-y-4">
                  <div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                      Service plan
                    </h3>
                    <p className="text-xs text-slate-600 mb-3">
                      Tier, account status, and whether monthly Credyx fees are charged.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Service tier
                      </span>
                      <select
                        value={selectedClient.service_tier ?? 'self_service'}
                        onChange={(e) => {
                          void (async () => {
                            const tier = e.target.value as ServiceTier
                            const updated = await updateClientTier(selectedClient.id, tier)
                            if (updated) {
                              setSelectedClient(updated)
                              refreshClients()
                            }
                          })()
                        }}
                        className="client-input mt-1 w-full text-sm"
                      >
                        <option value="self_service">Self-Service</option>
                        <option value="managed">Managed</option>
                      </select>
                    </label>

                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Account status
                      </span>
                      <select
                        value={selectedClient.status ?? 'active'}
                        onChange={(e) => {
                          void (async () => {
                            const newStatus = e.target.value as Client['status']
                            const updated = await updateClient(selectedClient.id, {
                              status: newStatus,
                            })
                            if (updated && newStatus === 'active' && selectedClient.email) {
                              const prev = selectedClient.status
                              if (prev !== 'active') {
                                const auth = await provisionClientAuthAccount(
                                  updated.id,
                                  updated.email!
                                )
                                if (!auth.ok) {
                                  console.error('[Clients] Auth provision failed:', auth.error)
                                }
                              }
                            }
                            if (updated) {
                              setSelectedClient((await fetchClientById(updated.id)) ?? updated)
                              refreshClients()
                            }
                          })()
                        }}
                        className="client-input mt-1 w-full text-sm"
                      >
                        <option value="active">Active</option>
                        <option value="pending">Pending</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </label>

                    <label className="block text-xs sm:col-span-2">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Billing subscription
                      </span>
                      <select
                        value={selectedClient.billing?.subscription_status ?? 'trial'}
                        onChange={(e) => {
                          void (async () => {
                            const subscription_status = e.target.value as NonNullable<
                              Client['billing']
                            >['subscription_status']
                            const planBilling =
                              selectedClient.billing ??
                              createDefaultBilling(selectedClient.service_tier ?? 'self_service')
                            const updated = await updateClient(selectedClient.id, {
                              billing: { ...planBilling, subscription_status },
                            })
                            if (updated) {
                              setSelectedClient(updated)
                              refreshClients()
                              syncClientBatchFees(selectedClient.id)
                              showToast(
                                subscription_status === 'active'
                                  ? 'Trial ended — monthly fees will be charged'
                                  : `Billing set to ${subscription_status.replace('_', ' ')}`,
                                'success'
                              )
                            }
                          })()
                        }}
                        className="client-input mt-1 w-full text-sm max-w-md"
                      >
                        <option value="trial">Trial (fees waived)</option>
                        <option value="active">Active (charge fees)</option>
                        <option value="past_due">Past due</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <span className="block text-xs text-slate-500 mt-1.5">
                        Trial waives Credyx monthly invoice fees. Switch to Active to start billing.
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-sm text-slate-800 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={selectedClient.factoring ?? false}
                        onChange={(e) => {
                          void (async () => {
                            const updated = await updateClient(selectedClient.id, {
                              factoring: e.target.checked,
                            })
                            if (updated) {
                              setSelectedClient(updated)
                              refreshClients()
                            }
                          })()
                        }}
                      />
                      Factoring client
                    </label>
                  </div>

                  {(() => {
                    const plan = getPlanForTier(selectedClient.service_tier ?? 'self_service')
                    return (
                      <div className="rounded-lg border border-slate-200 px-3 py-2.5 bg-slate-50">
                        <p className="text-sm font-medium text-slate-900">{plan.name}</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          App {formatCurrency(plan.app_fee_monthly)}/mo + collection fee from Fee
                          Terms
                        </p>
                      </div>
                    )
                  })()}
                </div>
              )}

              {activeTab === 'vault' && selectedClient && (
                <AdminClientVaultPanel
                  client={selectedClient}
                  adminName={adminDisplayName}
                  onChanged={() => setTenantVersion((v) => v + 1)}
                />
              )}

              {activeTab === 'terms' && selectedClient && (
                <div className="max-w-3xl space-y-4">
                  <div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                      Fee terms
                    </h3>
                    <p className="text-xs text-slate-600">
                      Open batches pull these rates live. When a batch is processed, its rates lock
                      and stop following later changes. You can still edit locked batches in
                      Accounting. Saves immediately.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-xs">
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Fee type
                      </span>
                      <select
                        value={selectedClient.fee_terms?.fee_type || 'percentage'}
                        onChange={(e) => {
                          const newFeeType = e.target.value as 'percentage' | 'flat'
                          void persistFeeTerms({
                            fee_type: newFeeType,
                            fee_percentage:
                              newFeeType === 'percentage'
                                ? selectedClient.fee_terms?.fee_percentage
                                : undefined,
                            flat_fee_amount:
                              newFeeType === 'flat'
                                ? selectedClient.fee_terms?.flat_fee_amount
                                : undefined,
                          })
                        }}
                        className="client-input mt-1 w-full text-sm"
                      >
                        <option value="percentage">Percentage</option>
                        <option value="flat">Flat fee</option>
                      </select>
                    </label>

                    {(selectedClient.fee_terms?.fee_type || 'percentage') === 'percentage' ? (
                      <label className="block text-xs">
                        <span className="font-medium text-slate-600 uppercase tracking-wide">
                          Fee percentage (%)
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={selectedClient.fee_terms?.fee_percentage ?? ''}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value) || 0
                              void persistFeeTerms({
                                fee_type: 'percentage',
                                fee_percentage: value,
                              })
                            }}
                            className="client-input flex-1 text-sm tabular-nums"
                            placeholder="1.00"
                          />
                          <span className="text-xs text-slate-500">%</span>
                        </div>
                      </label>
                    ) : (
                      <label className="block text-xs">
                        <span className="font-medium text-slate-600 uppercase tracking-wide">
                          Flat fee ($)
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={selectedClient.fee_terms?.flat_fee_amount ?? ''}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value) || 0
                              void persistFeeTerms({
                                fee_type: 'flat',
                                flat_fee_amount: value,
                              })
                            }}
                            className="client-input flex-1 text-sm tabular-nums"
                            placeholder="50.00"
                          />
                        </div>
                      </label>
                    )}
                  </div>

                  {selectedClient.fee_terms?.fee_type === 'percentage' &&
                  selectedClient.fee_terms?.fee_percentage ? (
                    <p className="text-xs text-slate-600 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                      Example on $10,000 collected:{' '}
                      <span className="font-medium text-slate-900 tabular-nums">
                        {formatCurrency(
                          (10000 * (selectedClient.fee_terms.fee_percentage || 0)) / 100
                        )}
                      </span>
                    </p>
                  ) : null}

                  {selectedClient.remittance_info ? (
                    <div>
                      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" />
                        Remittance
                      </h3>
                      <p className="text-sm text-slate-800 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                        {selectedClient.remittance_info}
                      </p>
                    </div>
                  ) : null}

                  {(selectedClient.bank_name ||
                    selectedClient.account_number ||
                    selectedClient.routing_number) && (
                    <div>
                      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        Banking
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px rounded-lg border border-slate-200 overflow-hidden bg-slate-200">
                        {selectedClient.bank_name ? (
                          <div className="bg-white px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                              Bank
                            </p>
                            <p className="text-sm font-medium text-slate-900 mt-0.5">
                              {selectedClient.bank_name}
                            </p>
                          </div>
                        ) : null}
                        {selectedClient.account_number ? (
                          <div className="bg-white px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                              Account
                            </p>
                            <p className="text-sm font-medium text-slate-900 mt-0.5 tabular-nums">
                              {selectedClient.account_number}
                            </p>
                          </div>
                        ) : null}
                        {selectedClient.routing_number ? (
                          <div className="bg-white px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                              Routing
                            </p>
                            <p className="text-sm font-medium text-slate-900 mt-0.5 tabular-nums">
                              {selectedClient.routing_number}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}

                  <div className="pt-1">
                    <button
                      type="button"
                      className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1.5"
                      onClick={() => {
                        setRemittanceBlastVaultIds(
                          defaultRemittanceBlastVaultIds(selectedClient.id)
                        )
                        setRemittanceBlastMessage('')
                        setShowRemittanceBlastModal(true)
                      }}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Notify brokers of remittance change
                    </button>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Emails all brokers this carrier has invoiced with. Does not send
                      automatically when remittance is saved.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Add client</h2>
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Service tier</label>
                      <select
                        value={formData.service_tier || 'self_service'}
                        onChange={(e) => handleInputChange('service_tier', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      >
                        <option value="self_service">Self-Service</option>
                        <option value="managed">Managed</option>
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
                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={handleCloseAddModal}
                    className="dashboard-btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="dashboard-btn-primary">
                    Add client
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showRemittanceBlastModal && selectedClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => !remittanceBlastBusy && setShowRemittanceBlastModal(false)}
          role="presentation"
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="remittance-blast-title"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h3 id="remittance-blast-title" className="text-base font-semibold text-slate-900">
                Notify brokers — {selectedClient.name}
              </h3>
              <button
                type="button"
                className="p-1.5 rounded-lg hover:bg-slate-100"
                disabled={remittanceBlastBusy}
                onClick={() => setShowRemittanceBlastModal(false)}
                aria-label="Close"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="px-4 py-3 space-y-3">
              {(() => {
                const recipients = listRemittanceBlastRecipients(selectedClient.id)
                const withEmail = recipients.filter((r) => r.email)
                const withoutEmail = recipients.filter((r) => !r.email)
                return (
                  <>
                    <p className="text-sm text-slate-600">
                      Will email <strong>{withEmail.length}</strong> broker
                      {withEmail.length === 1 ? '' : 's'} this carrier has worked with
                      {withoutEmail.length > 0
                        ? ` (${withoutEmail.length} skipped — no email)`
                        : ''}
                      .
                    </p>
                    <ul className="text-xs text-slate-700 max-h-28 overflow-y-auto rounded border border-slate-200 bg-slate-50 px-2 py-1.5 space-y-0.5">
                      {recipients.length === 0 ? (
                        <li>No brokers found on invoices for this carrier.</li>
                      ) : (
                        recipients.map((r) => (
                          <li key={r.broker_id}>
                            {r.broker_name}
                            {r.email ? ` — ${r.email}` : ' — (no email)'}
                          </li>
                        ))
                      )}
                    </ul>
                  </>
                )
              })()}

              <label className="block text-xs">
                <span className="font-medium text-slate-600 uppercase tracking-wide">
                  Extra message (optional)
                </span>
                <textarea
                  className="client-input w-full mt-1 text-sm"
                  rows={2}
                  value={remittanceBlastMessage}
                  onChange={(e) => setRemittanceBlastMessage(e.target.value)}
                  placeholder="Optional note…"
                />
              </label>

              <div>
                <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                  Attach vault docs
                </span>
                <div className="mt-1.5 max-h-36 overflow-y-auto rounded border border-slate-200 px-2 py-1.5 space-y-1">
                  {getClientDocuments(selectedClient.id)
                    .filter((d) => d.category === 'broker' && d.approval_status === 'approved')
                    .map((doc) => (
                      <label
                        key={doc.id}
                        className="flex items-start gap-2 text-sm text-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={remittanceBlastVaultIds.includes(doc.id)}
                          onChange={(e) => {
                            setRemittanceBlastVaultIds((prev) =>
                              e.target.checked
                                ? [...prev, doc.id]
                                : prev.filter((id) => id !== doc.id)
                            )
                          }}
                        />
                        <span>{formatVaultDocPickerLabel(doc)}</span>
                      </label>
                    ))}
                  {getClientDocuments(selectedClient.id).filter(
                    (d) => d.category === 'broker' && d.approval_status === 'approved'
                  ).length === 0 ? (
                    <p className="text-xs text-slate-500 py-1">No approved broker vault documents</p>
                  ) : null}
                </div>
                {!selectionHasBankProof(remittanceBlastVaultIds, selectedClient.id) ? (
                  <p className="text-xs text-amber-700 mt-1.5">
                    No voided check or bank letter selected.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200">
              <button
                type="button"
                className="dashboard-btn-secondary"
                disabled={remittanceBlastBusy}
                onClick={() => setShowRemittanceBlastModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-btn-primary"
                disabled={
                  remittanceBlastBusy ||
                  listRemittanceBlastRecipients(selectedClient.id).every((r) => !r.email)
                }
                onClick={() => {
                  void (async () => {
                    setRemittanceBlastBusy(true)
                    try {
                      const result = await sendRemittanceUpdatedToBrokers({
                        clientId: selectedClient.id,
                        selectedVaultDocIds: remittanceBlastVaultIds,
                        message: remittanceBlastMessage,
                        sentBy: getAdminUserDisplayName(resolved.user?.email ?? null) || 'Admin',
                        userId: resolved.user?.id,
                      })
                      showToast(
                        `Remittance notice: ${result.success} sent, ${result.failed} failed, ${result.skipped} skipped`,
                        result.failed > 0 ? 'error' : 'success'
                      )
                      setShowRemittanceBlastModal(false)
                    } catch (err) {
                      showToast(
                        err instanceof Error ? err.message : 'Could not send notices',
                        'error'
                      )
                    } finally {
                      setRemittanceBlastBusy(false)
                    }
                  })()
                }}
              >
                {remittanceBlastBusy ? 'Sending…' : 'Send to all brokers'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

