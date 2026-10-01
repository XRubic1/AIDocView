import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mockBrokers, addBroker, updateBrokerAsync } from '../data/mockBrokers'
import { mockInvoices } from '../data/mockInvoices'
import { Broker, BrokerEmail, BrokerPhone } from '../types/broker'
import { GitMerge, Phone, Mail, MapPin, Search, X, Plus, Trash2, Loader2 } from 'lucide-react'
import MergeBrokersModal from '../components/brokers/MergeBrokersModal'
import { mergeDuplicateBrokers } from '../services/mergeBrokersService'
import { useToast } from '../components/ui/ToastProvider'
import BrokerPaymentHistoryPanel from '../components/brokers/BrokerPaymentHistoryPanel'
import BrokerRiskAuditTimeline from '../components/brokers/BrokerRiskAuditTimeline'
import { listLatestBrokerRiskProfiles } from '../data/brokerRiskStore'
import { hydrateAuditLogsFromSupabase } from '../services/supabase/hydrateStores'
import { formatPhoneNumber } from '../utils/formatPhoneNumber'
import { applyEmailDomain, canSuggestEmailDomain, extractEmailDomain } from '../utils/emailDomain'
import { findBrokerByMc, normalizeMcQuery } from '../utils/clientBrokers'
import { lookupBrokerSnapshotByMc } from '../services/brokerSnapshotService'
import {
  fillEmptyBrokerFieldsFromSnapshot,
  type SnapshotFieldDiff,
  type SnapshotSuggestField,
} from '../utils/brokerSnapshotFormFill'
import SnapshotFieldSwap from '../components/brokers/SnapshotFieldSwap'
import AdminNewBrokersPanel from '../components/admin/AdminNewBrokersPanel'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { linkPendingInvoicesToBroker } from '../services/linkPendingNewBroker'
import { listPendingNewBrokers, normalizeBrokerNameKey } from '../utils/pendingNewBrokers'
import {
  addVerificationWebsite,
  listVerificationWebsites,
  loadVerificationWebsites,
  verificationWebsiteById,
  type VerificationWebsite,
} from '../services/verificationWebsites'
import '../styles/clientPortal.css'
import '../styles/brokerPicker.css'

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
  const tenantRevision = useTenantDataRevision()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageTab = searchParams.get('tab') === 'new' ? 'new' : 'all'
  const [brokers, setBrokers] = useState<Broker[]>(mockBrokers)
  const [searchTerm, setSearchTerm] = useState('')
  /** Carrier-requested name being added from the NEW Brokers tab. */
  const [reviewingRequestedName, setReviewingRequestedName] = useState<string | null>(null)
  const [linkingKey, setLinkingKey] = useState<string | null>(null)
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null)
  /** Drives slide-in / slide-out of the broker detail drawer. */
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [auditRefresh, setAuditRefresh] = useState(0)

  useEffect(() => {
    setBrokers([...mockBrokers])
  }, [tenantRevision])

  const pendingNewBrokers = useMemo(
    () => listPendingNewBrokers(mockInvoices, brokers),
    [brokers, tenantRevision]
  )

  const setPageTab = (tab: 'all' | 'new') => {
    const next = new URLSearchParams(searchParams)
    if (tab === 'new') next.set('tab', 'new')
    else next.delete('tab')
    setSearchParams(next, { replace: true })
  }

  // Animate drawer in after mount; lock body scroll while open.
  useEffect(() => {
    if (!selectedBroker) {
      setDetailDrawerVisible(false)
      return
    }
    const frame = window.requestAnimationFrame(() => setDetailDrawerVisible(true))
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = prevOverflow
    }
  }, [selectedBroker?.id])

  // Load audit trail when viewing a broker.
  useEffect(() => {
    if (!selectedBroker) return
    void hydrateAuditLogsFromSupabase()
      .then(() => setAuditRefresh((n) => n + 1))
      .catch(console.error)
  }, [selectedBroker?.id])

  const selectedBrokerRiskProfile = useMemo(() => {
    if (!selectedBroker) return null
    return (
      listLatestBrokerRiskProfiles().find((p) => p.broker_id === selectedBroker.id) ?? null
    )
  }, [selectedBroker, auditRefresh])

  /** When set, the form saves via updateBroker instead of addBroker. */
  const [isMerging, setIsMerging] = useState(false)
  const [editingBrokerId, setEditingBrokerId] = useState<string | null>(null)
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
    is_new: true,
    payment_terms_days: 30,
    paperwork_status_check_days: 7,
    payment_status_inquiry_days: 15,
    preferred_contact: 'either',
    verification_type: 'email',
  })
  const [emails, setEmails] = useState<BrokerEmail[]>([])
  const [phones, setPhones] = useState<BrokerPhone[]>([])
  const [isSaving, setIsSaving] = useState(false)
  /** MC → Snapshot autofill while Add/Edit broker form is open. */
  const [mcLookupLoading, setMcLookupLoading] = useState(false)
  /** Snapshot values that differ from what’s already on the form. */
  const [snapshotDiffs, setSnapshotDiffs] = useState<
    Array<SnapshotFieldDiff & { usingProposed: boolean }>
  >([])
  /** When on, extra emails show a gray `@domain` hint — Tab accepts it. */
  const [autoFillEmailDomain, setAutoFillEmailDomain] = useState(true)
  const [verificationWebsites, setVerificationWebsites] = useState<VerificationWebsite[]>(() =>
    listVerificationWebsites()
  )
  const [newWebsiteName, setNewWebsiteName] = useState('')
  const [newWebsiteUrl, setNewWebsiteUrl] = useState('')
  const [addingWebsite, setAddingWebsite] = useState(false)

  useEffect(() => {
    void loadVerificationWebsites()
      .then(setVerificationWebsites)
      .catch((err) => console.warn('[Brokers] verification websites', err))
  }, [])

  const handleLinkExistingBroker = async (requestedName: string, brokerId: string) => {
    const broker = brokers.find((b) => b.id === brokerId) ?? mockBrokers.find((b) => b.id === brokerId)
    if (!broker) {
      showToast('Broker not found', 'error')
      return
    }
    const key = normalizeBrokerNameKey(requestedName)
    setLinkingKey(key)
    try {
      const linked = await linkPendingInvoicesToBroker({
        requestedName,
        broker,
      })
      setBrokers([...mockBrokers])
      showToast(
        linked > 0
          ? `Linked ${linked} load${linked === 1 ? '' : 's'} to ${broker.name}`
          : 'No unmatched loads left for that name',
        linked > 0 ? 'success' : 'info'
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not attach loads', 'error')
    } finally {
      setLinkingKey(null)
    }
  }

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

  const filteredPendingBrokers = pendingNewBrokers.filter((item) => {
    if (searchTerm.trim() === '') return true
    const searchLower = searchTerm.toLowerCase()
    return (
      item.name.toLowerCase().includes(searchLower) ||
      item.clientNames.some((name) => name.toLowerCase().includes(searchLower)) ||
      item.invoices.some(
        (inv) =>
          inv.invoice_number.toLowerCase().includes(searchLower) ||
          (inv.load_number ?? '').toLowerCase().includes(searchLower)
      )
    )
  })

  const handleBrokerClick = (broker: Broker) => {
    setSelectedBroker(broker)
  }

  /** Slide the drawer out, then clear selection. */
  const handleCloseDetailDrawer = () => {
    if (isMerging) return
    setShowMergeModal(false)
    setDetailDrawerVisible(false)
    window.setTimeout(() => setSelectedBroker(null), 220)
  }

  // Esc closes the detail drawer (not while merge/edit modals are up).
  useEffect(() => {
    if (!selectedBroker || showMergeModal || showFormModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseDetailDrawer()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedBroker, showMergeModal, showFormModal, isMerging])

  const selectedInvoiceCount = selectedBroker
    ? mockInvoices.filter((invoice) => invoice.broker_id === selectedBroker.id).length
    : 0

  const handleConfirmMerge = async (keepId: string) => {
    if (!selectedBroker) return
    setIsMerging(true)
    try {
      const result = await mergeDuplicateBrokers(selectedBroker.id, keepId)
      setBrokers([...mockBrokers])
      setShowMergeModal(false)
      setSelectedBroker(null)
      showToast(
        result.invoiceCount === 0
          ? `Removed ${result.sourceName}; catalog now uses ${result.keepName}`
          : `Moved ${result.invoiceCount} load${result.invoiceCount === 1 ? '' : 's'} from ${result.sourceName} to ${result.keepName}`,
        'success'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Merge failed'
      showToast(message, 'error')
    } finally {
      setIsMerging(false)
    }
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
    carrier_notes: '',
    is_new: true,
    payment_terms_days: 30,
    paperwork_status_check_days: 7,
    payment_status_inquiry_days: 15,
    preferred_contact: 'either',
    verification_type: 'email',
  })

  /** Prefill form fields from an existing broker (edit mode). */
  const populateFormFromBroker = (broker: Broker) => {
    setFormData({
      name: broker.name,
      contact_person: broker.contact_person || '',
      email: broker.email || '',
      phone: broker.phone || '',
      fax: broker.fax ? formatPhoneNumber(broker.fax) : '',
      address: broker.address || '',
      city: broker.city || '',
      state: broker.state || '',
      zip: broker.zip || '',
      mc_number: broker.mc_number || '',
      dot_number: broker.dot_number || '',
      notes: broker.notes || '',
      carrier_notes: broker.carrier_notes || '',
      is_new: Boolean(broker.is_new),
      payment_terms_days: broker.payment_terms_days ?? 0,
      paperwork_status_check_days: broker.paperwork_status_check_days ?? 7,
      payment_status_inquiry_days: broker.payment_status_inquiry_days ?? 15,
      preferred_contact: broker.preferred_contact ?? 'either',
      verification_type: broker.verification_type ?? 'email',
      verification_website_id: broker.verification_website_id ?? '',
    })
    setEmails(
      broker.emails?.length
        ? broker.emails.map((e) => ({ ...e }))
        : broker.email
          ? [{ email: broker.email, category: 'accounting' }]
          : []
    )
    setPhones(
      broker.phones?.length
        ? broker.phones.map((p) => ({ ...p, phone: formatPhoneNumber(p.phone) }))
        : broker.phone
          ? [{ phone: formatPhoneNumber(broker.phone), category: 'accounts_payable' }]
          : []
    )
  }

  const handleOpenAddModal = () => {
    setReviewingRequestedName(null)
    setEditingBrokerId(null)
    setFormData(emptyBrokerForm())
    setEmails([])
    setPhones([])
    setAutoFillEmailDomain(true)
    setSnapshotDiffs([])
    setShowFormModal(true)
  }

  /** Open the add form for a carrier-requested broker that is not in the directory. */
  const handleOpenReviewNewBroker = (requestedName: string) => {
    setReviewingRequestedName(requestedName)
    setEditingBrokerId(null)
    setFormData({
      ...emptyBrokerForm(),
      name: requestedName,
      is_new: true,
      payment_terms_days: 30,
    })
    setEmails([])
    setPhones([])
    setAutoFillEmailDomain(true)
    setSnapshotDiffs([])
    setShowFormModal(true)
  }

  const handleOpenEditModal = () => {
    if (!selectedBroker) return
    setEditingBrokerId(selectedBroker.id)
    populateFormFromBroker(selectedBroker)
    setAutoFillEmailDomain(true)
    setSnapshotDiffs([])
    setShowFormModal(true)
  }

  const handleCloseFormModal = () => {
    setShowFormModal(false)
    setEditingBrokerId(null)
    setReviewingRequestedName(null)
    setFormData(emptyBrokerForm())
    setEmails([])
    setPhones([])
    setAutoFillEmailDomain(true)
    setMcLookupLoading(false)
    setSnapshotDiffs([])
  }

  const handleInputChange = (field: keyof Broker, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleAddVerificationWebsite = async () => {
    if (addingWebsite) return
    setAddingWebsite(true)
    try {
      const site = await addVerificationWebsite(newWebsiteName, newWebsiteUrl)
      setVerificationWebsites(listVerificationWebsites())
      setFormData((prev) => ({ ...prev, verification_website_id: site.id }))
      setNewWebsiteName('')
      setNewWebsiteUrl('')
      showToast(`Added ${site.name} to the verification list.`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add website', 'error')
    } finally {
      setAddingWebsite(false)
    }
  }

  const applySuggestFieldValue = (field: SnapshotSuggestField, value: string) => {
    if (field === 'email') {
      setFormData((prev) => ({ ...prev, email: value }))
      setEmails(value.trim() ? [{ email: value, category: 'accounting' }] : [])
      return
    }
    if (field === 'phone') {
      setFormData((prev) => ({ ...prev, phone: value }))
      setPhones(value.trim() ? [{ phone: value, category: 'accounts_payable' }] : [])
      return
    }
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleUseSnapshotProposed = (field: SnapshotSuggestField) => {
    const diff = snapshotDiffs.find((d) => d.field === field)
    if (!diff) return
    applySuggestFieldValue(field, diff.proposed)
    setSnapshotDiffs((prev) =>
      prev.map((d) => (d.field === field ? { ...d, usingProposed: true } : d))
    )
  }

  const handleUseSnapshotPrevious = (field: SnapshotSuggestField) => {
    const diff = snapshotDiffs.find((d) => d.field === field)
    if (!diff) return
    applySuggestFieldValue(field, diff.previous)
    setSnapshotDiffs((prev) =>
      prev.map((d) => (d.field === field ? { ...d, usingProposed: false } : d))
    )
  }

  const renderSnapshotDiff = (field: SnapshotSuggestField) => {
    const diff = snapshotDiffs.find((d) => d.field === field)
    if (!diff) return null
    return (
      <SnapshotFieldSwap
        label={diff.label}
        previous={diff.previous}
        proposed={diff.proposed}
        usingProposed={diff.usingProposed}
        onUseProposed={() => handleUseSnapshotProposed(field)}
        onUsePrevious={() => handleUseSnapshotPrevious(field)}
      />
    )
  }

  /**
   * MC search: Credyx hit loads that broker; Snapshot fills empty fields and
   * surfaces “what’s new” under fields that already differ.
   */
  const handleMcSnapshotLookup = async () => {
    const mcRaw = formData.mc_number?.trim() || ''
    const normalized = normalizeMcQuery(mcRaw)
    if (!normalized) {
      showToast('Enter an MC number first', 'error')
      return
    }

    setFormData((prev) => ({ ...prev, mc_number: normalized }))
    setSnapshotDiffs([])

    const mcKey = normalized.replace(/[^A-Z0-9]/g, '')
    const existing =
      brokers.find(
        (b) => b.mc_number?.toUpperCase().replace(/[^A-Z0-9]/g, '') === mcKey
      ) ?? findBrokerByMc(normalized)

    let workingForm = { ...formData, mc_number: normalized }
    let workingEmails = emails
    let workingPhones = phones

    if (existing && existing.id !== editingBrokerId) {
      showToast(`MC ${normalized} already in Credyx — loaded ${existing.name}`, 'info')
      setEditingBrokerId(existing.id)
      populateFormFromBroker(existing)
      setSelectedBroker(existing)
      workingForm = {
        name: existing.name,
        contact_person: existing.contact_person || '',
        email: existing.email || '',
        phone: existing.phone || '',
        fax: existing.fax ? formatPhoneNumber(existing.fax) : '',
        address: existing.address || '',
        city: existing.city || '',
        state: existing.state || '',
        zip: existing.zip || '',
        mc_number: existing.mc_number || normalized,
        dot_number: existing.dot_number || '',
        notes: existing.notes || '',
        carrier_notes: existing.carrier_notes || '',
        is_new: Boolean(existing.is_new),
        payment_terms_days: existing.payment_terms_days ?? 0,
        paperwork_status_check_days: existing.paperwork_status_check_days ?? 7,
        payment_status_inquiry_days: existing.payment_status_inquiry_days ?? 15,
        preferred_contact: existing.preferred_contact ?? 'either',
        verification_type: existing.verification_type ?? 'email',
        verification_website_id: existing.verification_website_id ?? '',
      }
      workingEmails = existing.emails?.length
        ? existing.emails.map((e) => ({ ...e }))
        : existing.email
          ? [{ email: existing.email, category: 'accounting' }]
          : []
      workingPhones = existing.phones?.length
        ? existing.phones.map((p) => ({ ...p, phone: formatPhoneNumber(p.phone) }))
        : existing.phone
          ? [{ phone: formatPhoneNumber(existing.phone), category: 'accounts_payable' }]
          : []
    }

    setMcLookupLoading(true)
    try {
      const snapshot = await lookupBrokerSnapshotByMc(normalized)
      if (!snapshot.found) {
        showToast(`No BrokerSnapshot match for ${normalized}`, 'error')
        return
      }

      const result = fillEmptyBrokerFieldsFromSnapshot(workingForm, snapshot, {
        emails: workingEmails,
        phones: workingPhones,
      })

      if (result.formPatch && Object.keys(result.formPatch).length > 0) {
        setFormData((prev) => ({
          ...prev,
          ...result.formPatch,
          mc_number: result.formPatch.mc_number || normalized,
        }))
      }
      if (result.emails) setEmails(result.emails)
      if (result.phones) setPhones(result.phones)

      if (result.diffs.length > 0) {
        setSnapshotDiffs(result.diffs.map((d) => ({ ...d, usingProposed: false })))
      }

      const parts: string[] = []
      if (result.filled.length > 0) parts.push(`filled ${result.filled.join(', ')}`)
      if (result.diffs.length > 0) {
        parts.push(`${result.diffs.length} new suggestion${result.diffs.length === 1 ? '' : 's'}`)
      }
      if (parts.length === 0) {
        showToast('Snapshot matches what’s already on file', 'info')
      } else {
        showToast(`BrokerSnapshot: ${parts.join(' · ')}`, 'success')
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'BrokerSnapshot lookup failed',
        'error'
      )
    } finally {
      setMcLookupLoading(false)
    }
  }

  const sharedEmailDomain = extractEmailDomain(emails[0]?.email ?? '')

  const handleAddEmail = () => {
    setEmails([...emails, { email: '', category: 'accounting' }])
  }

  const handleRemoveEmail = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index))
  }

  const handleEmailChange = (index: number, field: 'email' | 'category', value: string) => {
    const updated = [...emails]
    if (field === 'category') {
      updated[index] = { ...updated[index], category: value as BrokerEmail['category'] }
    } else {
      // Keep raw typing — domain is only applied when the user accepts the Tab suggestion.
      updated[index] = { ...updated[index], email: value }
    }
    setEmails(updated)
  }

  /** Accept the gray `@domain` suggestion into the actual value. */
  const acceptEmailDomainSuggestion = (index: number) => {
    if (!autoFillEmailDomain || !sharedEmailDomain || index === 0) return
    setEmails((prev) => {
      const current = prev[index]?.email ?? ''
      if (!canSuggestEmailDomain(current, sharedEmailDomain, true)) return prev
      const next = [...prev]
      next[index] = { ...next[index], email: applyEmailDomain(current, sharedEmailDomain) }
      return next
    })
  }

  const handleAddPhone = () => {
    setPhones([...phones, { phone: '', category: 'accounts_payable' }])
  }

  const handleRemovePhone = (index: number) => {
    setPhones(phones.filter((_, i) => i !== index))
  }

  const handlePhoneChange = (index: number, field: 'phone' | 'category', value: string) => {
    const updated = [...phones]
    const nextValue = field === 'phone' ? formatPhoneNumber(value) : (value as BrokerPhone['category'])
    updated[index] = { ...updated[index], [field]: nextValue }
    setPhones(updated)
  }

  const buildBrokerPayload = (): Omit<Broker, 'id'> | null => {
    if (!formData.name?.trim()) {
      showToast('Broker name is required', 'error')
      return null
    }

    const validEmails = emails.filter((em) => em.email.trim() !== '')
    const validPhones = phones.filter((p) => p.phone.trim() !== '')

    return {
      name: formData.name.trim(),
      contact_person: formData.contact_person?.trim() || undefined,
      email: validEmails[0]?.email || formData.email?.trim() || undefined,
      emails: validEmails.length > 0 ? validEmails : undefined,
      phone: validPhones[0]?.phone || formData.phone?.trim() || undefined,
      phones: validPhones.length > 0 ? validPhones : undefined,
      fax: formData.fax?.trim() || undefined,
      address: formData.address?.trim() || undefined,
      city: formData.city?.trim() || undefined,
      state: formData.state?.trim() || undefined,
      zip: formData.zip?.trim() || undefined,
      mc_number: formData.mc_number?.trim() || undefined,
      dot_number: formData.dot_number?.trim() || undefined,
      notes: formData.notes?.trim() || undefined,
      carrier_notes: formData.carrier_notes?.trim() || undefined,
      is_new: editingBrokerId ? Boolean(formData.is_new) : Boolean(formData.is_new ?? true),
      payment_terms_days:
        formData.payment_terms_days != null && Number(formData.payment_terms_days) > 0
          ? Number(formData.payment_terms_days)
          : editingBrokerId
            ? formData.payment_terms_days
            : 30,
      paperwork_status_check_days: formData.paperwork_status_check_days ?? 7,
      payment_status_inquiry_days: formData.payment_status_inquiry_days ?? 15,
      preferred_contact: formData.preferred_contact ?? 'either',
      verification_type: formData.verification_type ?? 'email',
      verification_website_id:
        formData.verification_type === 'web'
          ? formData.verification_website_id?.trim() || undefined
          : undefined,
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return

    const payload = buildBrokerPayload()
    if (!payload) return

    setIsSaving(true)
    try {
      if (editingBrokerId) {
        const previousDays = mockBrokers.find((b) => b.id === editingBrokerId)?.payment_terms_days
        const updated = await updateBrokerAsync(editingBrokerId, {
          ...payload,
          // Clear arrays when emptied so UI does not keep stale contacts.
          emails: payload.emails,
          phones: payload.phones,
        })
        if (!updated) {
          showToast('Broker not found', 'error')
          return
        }
        setBrokers([...mockBrokers])
        setSelectedBroker({ ...updated })
        handleCloseFormModal()
        const termsChanged =
          Number(payload.payment_terms_days ?? 0) !== Number(previousDays ?? 0)
        showToast(
          termsChanged
            ? 'Broker updated — open invoice due dates refreshed'
            : 'Broker updated',
          'success'
        )
      } else {
        const newBroker: Broker = {
          id: `broker-${Date.now()}`,
          ...payload,
          is_new: true,
          payment_terms_days:
            payload.payment_terms_days != null && Number(payload.payment_terms_days) > 0
              ? Number(payload.payment_terms_days)
              : 30,
        }
        const created = addBroker(newBroker)
        let linked = 0
        if (reviewingRequestedName) {
          linked = await linkPendingInvoicesToBroker({
            requestedName: reviewingRequestedName,
            broker: created,
          })
        }
        setBrokers([...mockBrokers])
        handleCloseFormModal()
        showToast(
          linked > 0
            ? `Broker added at Net ${created.payment_terms_days ?? 30} and linked to ${linked} load${linked === 1 ? '' : 's'}`
            : 'Broker added',
          'success'
        )
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save broker', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const formatAddress = (broker: Broker) => {
    const parts = [broker.address, broker.city, broker.state, broker.zip].filter(Boolean)
    return parts.join(', ') || '-'
  }

  /** Short city/state for the list (full address stays in the detail panel). */
  const formatListLocation = (broker: Broker) => {
    const parts = [broker.city, broker.state].filter(Boolean)
    return parts.join(', ') || '—'
  }

  const formatDueBy = (days?: number) => {
    if (days == null || days <= 0) return '—'
    return `Net ${days}`
  }

  const inputClass = 'client-input broker-form-field text-sm'
  const labelClass = 'block text-xs min-w-0 w-full'
  const formRowClass = 'flex flex-col gap-1.5 min-w-0 w-full'
  const formSelectClass = 'client-input broker-form-field text-sm'
  const sectionClass =
    'broker-form-section rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3 min-w-0 shadow-sm'
  const sectionTitleClass =
    'text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100 pb-2'

  return (
    <>
      <div className="admin-brokers-page flex flex-col min-h-0 h-full overflow-hidden">
        <div className="client-page-tabs-bar shrink-0 px-3 py-2 border-b border-slate-200">
          <div className="page-tabs">
            <button
              type="button"
              className={`page-tab ${pageTab === 'all' ? 'page-tab--active' : ''}`}
              onClick={() => setPageTab('all')}
            >
              Brokers
            </button>
            <button
              type="button"
              className={`page-tab ${pageTab === 'new' ? 'page-tab--active' : ''}`}
              onClick={() => setPageTab('new')}
            >
              NEW Brokers
              {pendingNewBrokers.length > 0 ? (
                <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
                  {pendingNewBrokers.length}
                </span>
              ) : null}
            </button>
          </div>
        </div>
        <div className="client-page-toolbar shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-200">
          <div className="relative flex-1 min-w-0 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder={pageTab === 'new' ? 'Search new brokers…' : 'Search brokers…'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="client-input w-full pl-8 pr-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <p className="text-xs text-slate-500 tabular-nums">
              {pageTab === 'new'
                ? `${filteredPendingBrokers.length} to review`
                : `${filteredBrokers.length} broker${filteredBrokers.length !== 1 ? 's' : ''}`}
            </p>
            {pageTab === 'all' ? (
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add broker
              </button>
            ) : null}
          </div>
        </div>

        <div className="client-table-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {pageTab === 'new' ? (
            <AdminNewBrokersPanel
              items={filteredPendingBrokers}
              brokers={brokers}
              linkingKey={linkingKey}
              emptyBecauseSearch={searchTerm.trim() !== '' && pendingNewBrokers.length > 0}
              onReview={handleOpenReviewNewBroker}
              onLinkExisting={(name, brokerId) => {
                void handleLinkExistingBroker(name, brokerId)
              }}
            />
          ) : filteredBrokers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <p className="text-sm font-medium">No brokers found</p>
              <p className="text-xs mt-1">Try adjusting your search</p>
            </div>
          ) : (
            <table className="dashboard-table dashboard-table--compact w-full">
              <thead>
                <tr>
                  <th className="admin-brokers-col-name">Broker</th>
                  <th className="hidden md:table-cell admin-brokers-col-contact">Contact</th>
                  <th className="hidden lg:table-cell admin-brokers-col-email">Email</th>
                  <th className="hidden md:table-cell admin-brokers-col-phone">Phone</th>
                  <th className="admin-brokers-col-terms">Due by</th>
                  <th className="hidden lg:table-cell admin-brokers-col-loc">Location</th>
                  <th className="admin-brokers-col-mc">MC</th>
                  <th className="hidden xl:table-cell admin-brokers-col-dot">DOT</th>
                </tr>
              </thead>
              <tbody>
                {filteredBrokers.map((broker) => {
                  const email = primaryEmail(broker)
                  const phone = primaryPhone(broker)
                  const formattedPhone = phone ? formatPhoneNumber(phone) : ''
                  const extraEmails =
                    (broker.emails?.length ?? 0) > 1 ? broker.emails!.length - 1 : 0
                  const extraPhones =
                    (broker.phones?.length ?? 0) > 1 ? broker.phones!.length - 1 : 0
                  return (
                    <tr
                      key={broker.id}
                      className="dashboard-table-row--clickable"
                      onClick={() => handleBrokerClick(broker)}
                    >
                      <td className="admin-brokers-col-name">
                        <p className="font-medium text-slate-900 truncate min-w-0">
                          {broker.name}
                        </p>
                      </td>
                      <td className="hidden md:table-cell text-slate-600 admin-brokers-col-contact">
                        <span className="truncate block min-w-0">
                          {broker.contact_person || '—'}
                        </span>
                      </td>
                      <td className="hidden lg:table-cell admin-brokers-col-email">
                        {email ? (
                          <a
                            href={`mailto:${email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 min-w-0 max-w-full text-slate-700 hover:text-slate-900"
                            title={email}
                          >
                            <Mail className="w-3 h-3 shrink-0 text-slate-400" />
                            <span className="truncate min-w-0">{email}</span>
                            {extraEmails > 0 ? (
                              <span className="text-[10px] text-slate-400 shrink-0">
                                +{extraEmails}
                              </span>
                            ) : null}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="hidden md:table-cell admin-brokers-col-phone">
                        {formattedPhone ? (
                          <a
                            href={`tel:${formattedPhone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 min-w-0 max-w-full text-slate-700 hover:text-slate-900"
                            title={formattedPhone}
                          >
                            <Phone className="w-3 h-3 shrink-0 text-slate-400" />
                            <span className="truncate min-w-0 tabular-nums">{formattedPhone}</span>
                            {extraPhones > 0 ? (
                              <span className="text-[10px] text-slate-400 shrink-0">
                                +{extraPhones}
                              </span>
                            ) : null}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="tabular-nums text-slate-600 admin-brokers-col-terms">
                        {formatDueBy(broker.payment_terms_days)}
                      </td>
                      <td className="hidden lg:table-cell text-slate-600 admin-brokers-col-loc">
                        <span className="truncate block min-w-0">
                          {formatListLocation(broker)}
                        </span>
                      </td>
                      <td className="tabular-nums text-slate-600 admin-brokers-col-mc">
                        {broker.mc_number || '—'}
                      </td>
                      <td className="hidden xl:table-cell tabular-nums text-slate-600 admin-brokers-col-dot">
                        {broker.dot_number || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedBroker && showMergeModal ? (
        <MergeBrokersModal
          source={selectedBroker}
          brokers={brokers}
          invoiceCount={selectedInvoiceCount}
          isMerging={isMerging}
          onClose={() => {
            if (!isMerging) setShowMergeModal(false)
          }}
          onConfirm={(keepId) => {
            void handleConfirmMerge(keepId)
          }}
        />
      ) : null}

      {selectedBroker && (
        <div
          className={`broker-detail-drawer${detailDrawerVisible ? ' is-visible' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedBroker.name} details`}
        >
          <button
            type="button"
            className="broker-detail-drawer__backdrop"
            aria-label="Close broker details"
            onClick={handleCloseDetailDrawer}
          />
          <aside className="broker-detail-drawer__panel">
            <div className="broker-detail-drawer__header">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900 truncate">
                  {selectedBroker.name}
                </h2>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {selectedInvoiceCount} load{selectedInvoiceCount === 1 ? '' : 's'}
                  {selectedBroker.payment_terms_days && selectedBroker.payment_terms_days > 0
                    ? ` · Due by ${selectedBroker.payment_terms_days}d`
                    : ' · No auto due'}
                  {selectedBroker.contact_person ? ` · ${selectedBroker.contact_person}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseDetailDrawer}
                className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="broker-detail-drawer__body text-sm text-slate-800 space-y-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-px rounded-lg border border-slate-200 overflow-hidden bg-slate-200">
                  <div className="bg-white px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                      Due by
                    </p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5 tabular-nums">
                      {selectedBroker.payment_terms_days && selectedBroker.payment_terms_days > 0
                        ? `${selectedBroker.payment_terms_days} days`
                        : 'Not set (0)'}
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
                  <div className="bg-white px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                      Verification type
                    </p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5 capitalize">
                      {selectedBroker.verification_type ?? 'email'}
                    </p>
                  </div>
                  {selectedBroker.verification_type === 'web' ? (
                    <div className="bg-white px-3 py-2 sm:col-span-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                        Where to verify
                      </p>
                      <p className="text-sm font-medium text-slate-900 mt-0.5">
                        {verificationWebsiteById(selectedBroker.verification_website_id)?.name ||
                          'Not set'}
                      </p>
                    </div>
                  ) : null}
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

              {selectedBroker.is_new ? (
                <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  Marked NEW for carriers — elevated risk until payment history builds.
                </p>
              ) : null}

              {selectedBroker.carrier_notes ? (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Carrier-visible Credyx notes
                  </h3>
                  <p className="text-sm text-slate-800 rounded border border-blue-200 bg-blue-50 px-3 py-2">
                    {selectedBroker.carrier_notes}
                  </p>
                </section>
              ) : null}

              {selectedBroker.notes ? (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Internal notes
                  </h3>
                  <p className="text-sm text-slate-800 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                    {selectedBroker.notes}
                  </p>
                </section>
              ) : null}

              <BrokerRiskAuditTimeline
                brokerId={selectedBroker.id}
                brokerName={selectedBroker.name}
                profile={selectedBrokerRiskProfile}
                refreshKey={auditRefresh}
              />
            </div>

            <div className="broker-detail-drawer__footer">
              <button type="button" onClick={handleCloseDetailDrawer} className="dashboard-btn-secondary">
                Close
              </button>
              <button
                type="button"
                onClick={() => setShowMergeModal(true)}
                className="dashboard-btn-secondary inline-flex items-center gap-1.5"
              >
                <GitMerge className="w-3.5 h-3.5" />
                Merge into…
              </button>
              <button type="button" onClick={handleOpenEditModal} className="dashboard-btn-primary">
                Edit broker
              </button>
            </div>
          </aside>
        </div>
      )}

      {showFormModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/50 overflow-hidden">
          <div className="broker-form-modal bg-white w-full h-full flex flex-col">
            <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/80">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900 truncate">
                  {editingBrokerId
                    ? 'Edit broker'
                    : reviewingRequestedName
                      ? 'Review new broker'
                      : 'Add broker'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {editingBrokerId
                    ? 'Update contact, address, and collections preferences'
                    : reviewingRequestedName
                      ? 'Not in the directory yet. Standard pay terms are Net 30. Saving attaches the carrier loads that used this name.'
                      : 'Enter MC and search to autofill — or fill sections manually. New brokers start at Net 30.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseFormModal}
                className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-white shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="broker-form-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain text-sm">
                <div className="broker-form-grid">
                  <section className={sectionClass}>
                    <h3 className={sectionTitleClass}>Identity</h3>
                    <label className={labelClass}>
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
                      {renderSnapshotDiff('name')}
                    </label>
                    <label className={labelClass}>
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Contact person
                      </span>
                      <input
                        type="text"
                        value={formData.contact_person || ''}
                        onChange={(e) => handleInputChange('contact_person', e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                      {renderSnapshotDiff('contact_person')}
                    </label>
                    <label className={labelClass}>
                      <span className="font-medium text-slate-600 uppercase tracking-wide">Fax</span>
                      <input
                        type="tel"
                        value={formData.fax || ''}
                        onChange={(e) => handleInputChange('fax', formatPhoneNumber(e.target.value))}
                        placeholder="(555) 123-4567"
                        className={`${inputClass} mt-1`}
                      />
                      {renderSnapshotDiff('fax')}
                    </label>
                  </section>

                  <section className={sectionClass}>
                    <h3 className={sectionTitleClass}>Address</h3>
                    <label className={labelClass}>
                      <span className="font-medium text-slate-600 uppercase tracking-wide">Street</span>
                      <input
                        type="text"
                        value={formData.address || ''}
                        onChange={(e) => handleInputChange('address', e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                      {renderSnapshotDiff('address')}
                    </label>
                    <label className={labelClass}>
                      <span className="font-medium text-slate-600 uppercase tracking-wide">City</span>
                      <input
                        type="text"
                        value={formData.city || ''}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3 min-w-0">
                      <label className={labelClass}>
                        <span className="font-medium text-slate-600 uppercase tracking-wide">State</span>
                        <input
                          type="text"
                          value={formData.state || ''}
                          onChange={(e) => handleInputChange('state', e.target.value)}
                          className={`${inputClass} mt-1`}
                        />
                      </label>
                      <label className={labelClass}>
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

                  <section className={sectionClass}>
                    <h3 className={sectionTitleClass}>License</h3>
                    <label className={labelClass}>
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        MC number
                      </span>
                      <div className="mt-1 flex items-stretch gap-1.5 min-w-0">
                        <input
                          type="text"
                          value={formData.mc_number || ''}
                          onChange={(e) => handleInputChange('mc_number', e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              void handleMcSnapshotLookup()
                            }
                          }}
                          placeholder="MC-123456"
                          className={`${inputClass} flex-1 min-w-0`}
                          disabled={mcLookupLoading}
                        />
                        <button
                          type="button"
                          onClick={() => void handleMcSnapshotLookup()}
                          disabled={mcLookupLoading || !(formData.mc_number || '').trim()}
                          className="shrink-0 inline-flex items-center justify-center w-9 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-[#1684FE] disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Search MC in Credyx, then BrokerSnapshot"
                          title="Search MC — Credyx first, then BrokerSnapshot autofill"
                        >
                          {mcLookupLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                          ) : (
                            <Search className="w-4 h-4" aria-hidden />
                          )}
                        </button>
                      </div>
                      <span className="mt-1 block text-[10px] text-slate-500 leading-snug">
                        Credyx first · empty fields autofill · differing fields show NEW swap below
                      </span>
                    </label>
                    <label className={labelClass}>
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        DOT number
                      </span>
                      <input
                        type="text"
                        value={formData.dot_number || ''}
                        onChange={(e) => handleInputChange('dot_number', e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                      {renderSnapshotDiff('dot_number')}
                    </label>
                  </section>

                  <section className={sectionClass}>
                    <h3 className={sectionTitleClass}>Collections</h3>
                    <label className={labelClass}>
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Due by (days)
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={formData.payment_terms_days ?? 0}
                        onChange={(e) =>
                          handleInputChange('payment_terms_days', parseInt(e.target.value, 10) || 0)
                        }
                        className={`${inputClass} mt-1 tabular-nums`}
                      />
                      <span className="mt-1 block text-[10px] text-slate-500 leading-snug">
                        0 = no automatic invoice due date
                      </span>
                    </label>
                    <p className="text-[10px] text-slate-500 leading-snug m-0">
                      Timed paperwork/payment chase days moved to Blueprints (Wait + Then-do).
                    </p>
                    <label className={labelClass}>
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
                    <label className={labelClass}>
                      <span className="font-medium text-slate-600 uppercase tracking-wide">
                        Verification type
                      </span>
                      <select
                        value={formData.verification_type ?? 'email'}
                        onChange={(e) =>
                          handleInputChange(
                            'verification_type',
                            e.target.value as 'email' | 'phone' | 'web'
                          )
                        }
                        className={`${inputClass} mt-1`}
                      >
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="web">Web</option>
                      </select>
                      <span className="mt-1 block text-[10px] text-slate-500 leading-snug">
                        Web means Credyx does not email this broker to confirm the rate.
                      </span>
                    </label>
                    {formData.verification_type === 'web' ? (
                      <div className="space-y-2">
                        <label className={labelClass}>
                          <span className="font-medium text-slate-600 uppercase tracking-wide">
                            Where to verify
                          </span>
                          <select
                            value={formData.verification_website_id ?? ''}
                            onChange={(e) =>
                              handleInputChange('verification_website_id', e.target.value)
                            }
                            className={`${inputClass} mt-1`}
                          >
                            <option value="">Select a website</option>
                            {verificationWebsites.map((site) => (
                              <option key={site.id} value={site.id}>
                                {site.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="rounded-lg border border-slate-200 p-2.5 space-y-2 bg-slate-50/70">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 m-0">
                            Add a website
                          </p>
                          <input
                            type="text"
                            value={newWebsiteName}
                            onChange={(e) => setNewWebsiteName(e.target.value)}
                            placeholder="Name"
                            className={inputClass}
                          />
                          <input
                            type="text"
                            value={newWebsiteUrl}
                            onChange={(e) => setNewWebsiteUrl(e.target.value)}
                            placeholder="https://"
                            className={inputClass}
                          />
                          <button
                            type="button"
                            className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1"
                            disabled={addingWebsite || !newWebsiteName.trim()}
                            onClick={() => void handleAddVerificationWebsite()}
                          >
                            {addingWebsite ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                            Add to list
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section className={`${sectionClass} broker-form-section--tall`}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Emails
                      </h3>
                      <button
                        type="button"
                        onClick={handleAddEmail}
                        className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1 shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                    {emails.length > 0 ? (
                      <label
                        className={`flex items-start gap-2 text-xs text-slate-600 ${
                          sharedEmailDomain ? 'cursor-pointer' : 'opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 shrink-0"
                          checked={autoFillEmailDomain}
                          disabled={!sharedEmailDomain}
                          onChange={(e) => setAutoFillEmailDomain(e.target.checked)}
                        />
                        <span className="leading-snug min-w-0">
                          {sharedEmailDomain
                            ? `Suggest @${sharedEmailDomain} — press Tab to fill`
                            : 'Suggest domain (enter a full first email first)'}
                        </span>
                      </label>
                    ) : null}
                    <div className="space-y-2">
                      {emails.map((emailItem, index) => {
                        const showDomainSuggest =
                          index > 0 &&
                          canSuggestEmailDomain(
                            emailItem.email,
                            sharedEmailDomain,
                            autoFillEmailDomain
                          )

                        return (
                          <div
                            key={index}
                            className={`${formRowClass} rounded-lg border border-slate-200 p-2.5 bg-slate-50/70`}
                          >
                            <div className="relative min-w-0 w-full">
                              {showDomainSuggest && sharedEmailDomain ? (
                                <div
                                  aria-hidden
                                  className="pointer-events-none absolute inset-0 z-0 flex items-center overflow-hidden px-3 text-[13px] font-medium"
                                >
                                  <span className="invisible whitespace-pre">{emailItem.email}</span>
                                  <span className="text-slate-400 select-none">
                                    @{sharedEmailDomain}
                                  </span>
                                </div>
                              ) : null}
                              <input
                                type="text"
                                inputMode="email"
                                autoComplete="off"
                                value={emailItem.email}
                                onChange={(e) => handleEmailChange(index, 'email', e.target.value)}
                                onKeyDown={(e) => {
                                  if (!showDomainSuggest) return
                                  const el = e.currentTarget
                                  const atEnd =
                                    el.selectionStart === el.value.length &&
                                    el.selectionEnd === el.value.length
                                  if (e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd)) {
                                    e.preventDefault()
                                    acceptEmailDomainSuggestion(index)
                                  }
                                }}
                                placeholder={
                                  index > 0 && autoFillEmailDomain && sharedEmailDomain
                                    ? `name  (Tab → @${sharedEmailDomain})`
                                    : 'email@example.com'
                                }
                                className={`${inputClass} relative z-10 ${
                                  showDomainSuggest ? '!bg-transparent' : ''
                                }`}
                              />
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <select
                                value={emailItem.category}
                                onChange={(e) =>
                                  handleEmailChange(index, 'category', e.target.value)
                                }
                                className={`${formSelectClass} flex-1`}
                              >
                                <option value="accounting">Accounting</option>
                                <option value="paperwork">Paperwork</option>
                                <option value="noa">NOA</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleRemoveEmail(index)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-slate-200 shrink-0"
                                aria-label="Remove email"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      {emails.length === 0 ? (
                        <p className="text-xs text-slate-500">No emails yet.</p>
                      ) : null}
                      {renderSnapshotDiff('email')}
                    </div>
                  </section>

                  <section className={`${sectionClass} broker-form-section--tall`}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Phones
                      </h3>
                      <button
                        type="button"
                        onClick={handleAddPhone}
                        className="dashboard-btn-secondary dashboard-btn-compact inline-flex items-center gap-1 shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                    <div className="space-y-2">
                      {phones.map((phoneItem, index) => (
                        <div
                          key={index}
                          className={`${formRowClass} rounded-lg border border-slate-200 p-2.5 bg-slate-50/70`}
                        >
                          <input
                            type="tel"
                            value={phoneItem.phone}
                            onChange={(e) => handlePhoneChange(index, 'phone', e.target.value)}
                            placeholder="(555) 123-4567"
                            className={inputClass}
                          />
                          <div className="flex items-center gap-1.5 min-w-0">
                            <select
                              value={phoneItem.category}
                              onChange={(e) => handlePhoneChange(index, 'category', e.target.value)}
                              className={`${formSelectClass} flex-1`}
                            >
                              <option value="accounts_payable">Accounts Payable</option>
                              <option value="accounts_receivable">Accounts Receivable</option>
                              <option value="rate_verification">Rate Verification</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => handleRemovePhone(index)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-slate-200 shrink-0"
                              aria-label="Remove phone"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {phones.length === 0 ? (
                        <p className="text-xs text-slate-500">No phones yet.</p>
                      ) : null}
                      {renderSnapshotDiff('phone')}
                    </div>
                  </section>

                  <section className={`${sectionClass} broker-form-section--notes`}>
                    <h3 className={sectionTitleClass}>Credyx NEW + carrier notes</h3>
                    <label className="flex items-start gap-2 text-sm text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={Boolean(formData.is_new)}
                        onChange={(e) => handleInputChange('is_new', e.target.checked)}
                      />
                      <span>
                        <span className="font-semibold">Mark as NEW</span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          Carrier portal shows NEW and treats thin / no payment history as elevated risk
                          (e.g. old MC on file since 2016 with no pays through Credyx).
                        </span>
                      </span>
                    </label>
                    <label className={formRowClass}>
                      <span className="text-xs font-medium text-slate-600">Carrier-visible Credyx notes</span>
                      <textarea
                        value={formData.carrier_notes || ''}
                        onChange={(e) => handleInputChange('carrier_notes', e.target.value)}
                        rows={3}
                        placeholder="Shown to carriers — e.g. Limited remittance history; start with smaller loads…"
                        className={inputClass}
                      />
                      {renderSnapshotDiff('carrier_notes')}
                    </label>
                  </section>

                  <section className={`${sectionClass} broker-form-section--notes`}>
                    <h3 className={sectionTitleClass}>Internal notes (admin only)</h3>
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) => handleInputChange('notes', e.target.value)}
                      rows={4}
                      placeholder="Internal notes about this broker — never shown to carriers…"
                      className={inputClass}
                    />
                  </section>
                </div>
              </div>

              <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50/80 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseFormModal}
                  disabled={isSaving}
                  className="dashboard-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className="dashboard-btn-primary">
                  {isSaving
                    ? 'Saving…'
                    : editingBrokerId
                      ? 'Save changes'
                      : 'Add broker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  )
}
