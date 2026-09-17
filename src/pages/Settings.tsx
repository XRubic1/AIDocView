import { useState, useEffect, type ReactNode } from 'react'
import {
  User,
  Bell,
  FileText,
  Mail,
  Shield,
  Database,
  Save,
  Check,
  Lock,
  Phone,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import {
  saveArPolicy,
  loadArPolicy,
  applyArPolicy,
  loadBrokerSnapshotTtl,
  saveBrokerSnapshotTtl,
  DEFAULT_BROKER_SNAPSHOT_TTL,
  loadCollectionsPolicy,
  saveCollectionsPolicy,
  applyCollectionsPolicy,
  loadBrokerRiskPolicy,
  saveBrokerRiskPolicy,
  applyBrokerRiskPolicy,
  loadEmailMailboxes,
  saveEmailMailboxes,
  applyEmailMailboxes,
  DEFAULT_EMAIL_MAILBOXES,
} from '../services/platformSettingsService'
import { useToast } from '../components/ui/ToastProvider'
import Spinner from '../components/ui/Spinner'
import EmailTemplatesPanel from '../components/admin/EmailTemplatesPanel'
import EmailAddressesSettingsPanel from '../components/admin/EmailAddressesSettingsPanel'
import EmailWorkflowSettingsPanel from '../components/admin/EmailWorkflowSettingsPanel'
import CollectionsSettingsPanel, {
  type CollectionsSettingsForm,
} from '../components/admin/CollectionsSettingsPanel'
import BrokerRiskSettingsPanel, {
  type BrokerRiskSettingsForm,
} from '../components/admin/BrokerRiskSettingsPanel'
import AiRateLimitSettingsPanel from '../components/admin/AiRateLimitSettingsPanel'
import AiSpendSettingsPanel from '../components/admin/AiSpendSettingsPanel'
import AiStatusCheckPanel from '../components/admin/AiStatusCheckPanel'
import { useClientTheme } from '../theme/ThemeContext'

type SettingsTab =
  | 'profile'
  | 'notifications'
  | 'invoices'
  | 'collections'
  | 'broker-risk'
  | 'email'
  | 'email-addresses'
  | 'email-sends'
  | 'security'
  | 'ai'
  | 'system'

function SettingsTabPanel({
  children,
  className = '',
  footer,
}: {
  children: ReactNode
  className?: string
  footer?: ReactNode
}) {
  return (
    <div className={`client-settings-tab-panel dashboard-card ${className}`.trim()}>
      <div className="client-settings-tab-panel__content">{children}</div>
      {footer}
    </div>
  )
}

function SettingsField({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  const c = useClientTheme()
  return (
    <div className={`client-settings-field ${className}`.trim()}>
      <label className="client-label" style={{ color: c.secondary }}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="client-label-hint" style={{ color: c.mutedLight }}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function SettingsTextInput({
  label,
  value,
  onChange,
  type = 'text',
  readOnly = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  readOnly?: boolean
}) {
  const c = useClientTheme()
  return (
    <SettingsField label={label}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
        className="client-input w-full"
        style={{
          backgroundColor: readOnly ? c.stat.slate : c.card,
          fontSize: 13,
          color: c.primary,
          height: 36,
          minHeight: 36,
        }}
      />
    </SettingsField>
  )
}

function SettingsSelect({
  label,
  value,
  onChange,
  children,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  hint?: string
}) {
  const c = useClientTheme()
  return (
    <SettingsField label={label} hint={hint}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="client-input w-full"
        style={{ backgroundColor: c.card, fontSize: 13, color: c.primary, height: 36, minHeight: 36 }}
      >
        {children}
      </select>
    </SettingsField>
  )
}

function SettingsToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const c = useClientTheme()
  return (
    <div
      className="client-settings-toggle-row flex items-center justify-between gap-3 py-2 border-b last:border-b-0"
      style={{ borderColor: c.border }}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight" style={{ color: c.primary }}>
          {label}
        </p>
        <p className="text-[11px] mt-0.5 leading-snug line-clamp-1" style={{ color: c.secondary }}>
          {hint}
        </p>
      </div>
      <label className="client-toggle shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span
          className="client-toggle__track"
          style={{ backgroundColor: checked ? c.info : c.mutedLight }}
        />
      </label>
    </div>
  )
}

export default function Settings() {
  const c = useClientTheme()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [saved, setSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [profileData, setProfileData] = useState({
    name: 'Admin User',
    email: 'admin@credyx.com',
    role: 'Administrator',
    phone: '(555) 123-4567',
    timezone: 'America/New_York',
  })

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    smsNotifications: false,
    batchAlerts: true,
    collectionAlerts: true,
    overdueAlerts: true,
    paymentConfirmations: true,
    dailyDigest: true,
    weeklyReport: false,
  })

  const [invoiceSettings, setInvoiceSettings] = useState({
    defaultPaymentTerms: '30',
    autoApproveThreshold: '1000',
    forceCloseDays: '90',
    agingBuckets: {
      bucket1: '15',
      bucket2: '30',
      bucket3: '45',
      bucket4: '60',
      bucket5: '90',
    },
    requireApproval: true,
    requireNotes: false,
  })

  const [securitySettings, setSecuritySettings] = useState({
    sessionTimeout: '30',
    requireTwoFactor: false,
    passwordExpiry: '90',
    maxLoginAttempts: '5',
    enableAuditLog: true,
  })

  const [systemSettings, setSystemSettings] = useState({
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    currency: 'USD',
    language: 'en',
    itemsPerPage: '25',
    autoBackup: true,
    backupFrequency: 'daily',
  })

  const [brokerRiskSettings, setBrokerRiskSettings] = useState<BrokerRiskSettingsForm>({
    medium_single_late_days: '15',
    high_single_late_days: '21',
    late_payment_min_days: '15',
    open_overdue_min_days: '15',
    medium_late_count: '2',
    medium_open_overdue_count: '1',
    high_late_count: '3',
    high_open_overdue_count: '1',
    lookback_days: '365',
    fallback_terms_days: '30',
    min_paid_sample_for_confidence: '2',
    min_paid_sample_for_payment_timing: '10',
    new_broker_no_history_level: 'high',
    unknown_broker_no_history_level: 'medium',
    new_broker_thin_sample_level: 'medium',
    score_new_brokers_with_no_loads: true,
    cacheTtlDays: String(DEFAULT_BROKER_SNAPSHOT_TTL.cacheTtlDays),
    insuranceWatchTtlDays: String(DEFAULT_BROKER_SNAPSHOT_TTL.insuranceWatchTtlDays),
  })

  const [collectionsSettings, setCollectionsSettings] = useState<CollectionsSettingsForm>({
    defaultPaperworkCheckDays: '7',
    defaultInquiryDays: '15',
    paymentVerifyUrgentDays: '5',
    followupAfterDays: '3',
    needsAttentionAfterDays: '5',
    willPayUrgent: true,
    willPayMissedDays: '5',
    callbackUrgent: true,
    callbackMissedDays: '0',
    riskyBrokerUrgent: true,
    riskyBrokerMinLevel: 'high' as 'high' | 'medium',
    overdueUrgent: true,
    overdueUrgentDays: '15',
    noPpwUrgent: true,
    noPpwAfterDays: '0',
    staleContactUrgent: true,
    staleContactDays: '7',
    needsCallUrgent: true,
  })

  const [emailMailboxes, setEmailMailboxes] = useState({ ...DEFAULT_EMAIL_MAILBOXES })

  useEffect(() => {
    void loadArPolicy().then((policy) => {
      setInvoiceSettings((prev) => ({
        ...prev,
        forceCloseDays: String(policy.forceCloseDays),
        agingBuckets: {
          bucket1: String(policy.agingBuckets[0]),
          bucket2: String(policy.agingBuckets[1]),
          bucket3: String(policy.agingBuckets[2]),
          bucket4: String(policy.agingBuckets[3]),
          bucket5: String(policy.agingBuckets[4]),
        },
      }))
      applyArPolicy(policy)
    })
    void loadBrokerSnapshotTtl().then((ttl) => {
      setBrokerRiskSettings((p) => ({
        ...p,
        cacheTtlDays: String(ttl.cacheTtlDays),
        insuranceWatchTtlDays: String(ttl.insuranceWatchTtlDays),
      }))
    })
    void loadBrokerRiskPolicy().then((policy) => {
      applyBrokerRiskPolicy(policy)
      setBrokerRiskSettings((prev) => ({
        ...prev,
        medium_single_late_days: String(policy.medium_single_late_days),
        high_single_late_days: String(policy.high_single_late_days),
        late_payment_min_days: String(policy.late_payment_min_days),
        open_overdue_min_days: String(policy.open_overdue_min_days),
        medium_late_count: String(policy.medium_late_count),
        medium_open_overdue_count: String(policy.medium_open_overdue_count),
        high_late_count: String(policy.high_late_count),
        high_open_overdue_count: String(policy.high_open_overdue_count),
        lookback_days: String(policy.lookback_days),
        fallback_terms_days: String(policy.fallback_terms_days),
        min_paid_sample_for_confidence: String(policy.min_paid_sample_for_confidence),
        min_paid_sample_for_payment_timing: String(
          policy.min_paid_sample_for_payment_timing
        ),
        new_broker_no_history_level: policy.new_broker_no_history_level,
        unknown_broker_no_history_level: policy.unknown_broker_no_history_level,
        new_broker_thin_sample_level: policy.new_broker_thin_sample_level,
        score_new_brokers_with_no_loads: policy.score_new_brokers_with_no_loads,
      }))
    })
    void loadCollectionsPolicy().then((policy) => {
      applyCollectionsPolicy(policy)
      setCollectionsSettings({
        defaultPaperworkCheckDays: String(policy.defaultPaperworkCheckDays),
        defaultInquiryDays: String(policy.defaultInquiryDays),
        paymentVerifyUrgentDays: String(policy.paymentVerifyUrgentDays),
        followupAfterDays: String(policy.followupAfterDays),
        needsAttentionAfterDays: String(policy.needsAttentionAfterDays),
        willPayUrgent: policy.willPayUrgent,
        willPayMissedDays: String(policy.willPayMissedDays),
        callbackUrgent: policy.callbackUrgent,
        callbackMissedDays: String(policy.callbackMissedDays),
        riskyBrokerUrgent: policy.riskyBrokerUrgent,
        riskyBrokerMinLevel: policy.riskyBrokerMinLevel,
        overdueUrgent: policy.overdueUrgent,
        overdueUrgentDays: String(policy.overdueUrgentDays),
        noPpwUrgent: policy.noPpwUrgent,
        noPpwAfterDays: String(policy.noPpwAfterDays),
        staleContactUrgent: policy.staleContactUrgent,
        staleContactDays: String(policy.staleContactDays),
        needsCallUrgent: policy.needsCallUrgent,
      })
    })
    void loadEmailMailboxes().then((mailboxes) => {
      applyEmailMailboxes(mailboxes)
      setEmailMailboxes(mailboxes)
    })
  }, [])

  const tabs: Array<{ id: SettingsTab; label: string; icon: typeof User }> = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'collections', label: 'Collections', icon: Phone },
    { id: 'broker-risk', label: 'Broker Risk', icon: ShieldAlert },
    { id: 'email-addresses', label: 'Addresses', icon: Mail },
    { id: 'email-sends', label: 'Email sends', icon: Mail },
    { id: 'email', label: 'Templates', icon: FileText },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'ai', label: 'AI', icon: Sparkles },
    { id: 'system', label: 'System', icon: Database },
  ]

  const handleSave = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      if (activeTab === 'invoices') {
        await saveArPolicy({
          collectionsOverdueDays: (Number(invoiceSettings.agingBuckets.bucket1) ||
            15) as typeof import('../utils/invoiceAging').AR_POLICY.collectionsOverdueDays,
          clientUrgentDays: 25,
          criticalDays: 60,
          forceCloseDays: (Number(invoiceSettings.forceCloseDays) ||
            90) as typeof import('../utils/invoiceAging').AR_POLICY.forceCloseDays,
          agingBuckets: [
            Number(invoiceSettings.agingBuckets.bucket1) || 15,
            Number(invoiceSettings.agingBuckets.bucket2) || 30,
            Number(invoiceSettings.agingBuckets.bucket3) || 45,
            Number(invoiceSettings.agingBuckets.bucket4) || 60,
            Number(invoiceSettings.agingBuckets.bucket5) || 90,
          ] as typeof import('../utils/invoiceAging').AR_POLICY.agingBuckets,
        })
      }
      if (activeTab === 'collections') {
        await saveCollectionsPolicy({
          defaultPaperworkCheckDays: Number(collectionsSettings.defaultPaperworkCheckDays) || 7,
          defaultInquiryDays: Number(collectionsSettings.defaultInquiryDays) || 15,
          paymentVerifyUrgentDays: Number(collectionsSettings.paymentVerifyUrgentDays) || 5,
          followupAfterDays: Number(collectionsSettings.followupAfterDays) || 3,
          needsAttentionAfterDays: Number(collectionsSettings.needsAttentionAfterDays) || 5,
          willPayUrgent: collectionsSettings.willPayUrgent,
          willPayMissedDays: Number(collectionsSettings.willPayMissedDays) || 5,
          callbackUrgent: collectionsSettings.callbackUrgent,
          callbackMissedDays: Number.isFinite(Number(collectionsSettings.callbackMissedDays))
            ? Number(collectionsSettings.callbackMissedDays)
            : 0,
          riskyBrokerUrgent: collectionsSettings.riskyBrokerUrgent,
          riskyBrokerMinLevel: collectionsSettings.riskyBrokerMinLevel,
          overdueUrgent: collectionsSettings.overdueUrgent,
          overdueUrgentDays: Number(collectionsSettings.overdueUrgentDays) || 15,
          noPpwUrgent: collectionsSettings.noPpwUrgent,
          noPpwAfterDays: Number.isFinite(Number(collectionsSettings.noPpwAfterDays))
            ? Number(collectionsSettings.noPpwAfterDays)
            : 0,
          staleContactUrgent: collectionsSettings.staleContactUrgent,
          staleContactDays: Number(collectionsSettings.staleContactDays) || 7,
          needsCallUrgent: collectionsSettings.needsCallUrgent,
        })
      }
      if (activeTab === 'broker-risk') {
        await saveBrokerRiskPolicy({
          medium_single_late_days: Number(brokerRiskSettings.medium_single_late_days) || 15,
          high_single_late_days: Number(brokerRiskSettings.high_single_late_days) || 21,
          late_payment_min_days: Number(brokerRiskSettings.late_payment_min_days) || 15,
          open_overdue_min_days: Number(brokerRiskSettings.open_overdue_min_days) || 15,
          medium_late_count: Number(brokerRiskSettings.medium_late_count) || 2,
          medium_open_overdue_count: Number(brokerRiskSettings.medium_open_overdue_count) || 1,
          high_late_count: Number(brokerRiskSettings.high_late_count) || 3,
          high_open_overdue_count: Number(brokerRiskSettings.high_open_overdue_count) || 1,
          lookback_days: Number(brokerRiskSettings.lookback_days) || 365,
          fallback_terms_days: Number(brokerRiskSettings.fallback_terms_days) || 30,
          min_paid_sample_for_confidence:
            Number(brokerRiskSettings.min_paid_sample_for_confidence) || 2,
          min_paid_sample_for_payment_timing:
            Number(brokerRiskSettings.min_paid_sample_for_payment_timing) || 10,
          new_broker_no_history_level: brokerRiskSettings.new_broker_no_history_level,
          unknown_broker_no_history_level: brokerRiskSettings.unknown_broker_no_history_level,
          new_broker_thin_sample_level: brokerRiskSettings.new_broker_thin_sample_level,
          score_new_brokers_with_no_loads: brokerRiskSettings.score_new_brokers_with_no_loads,
        })
        const savedTtl = await saveBrokerSnapshotTtl({
          cacheTtlDays:
            Number(brokerRiskSettings.cacheTtlDays) || DEFAULT_BROKER_SNAPSHOT_TTL.cacheTtlDays,
          insuranceWatchTtlDays:
            Number(brokerRiskSettings.insuranceWatchTtlDays) ||
            DEFAULT_BROKER_SNAPSHOT_TTL.insuranceWatchTtlDays,
        })
        setBrokerRiskSettings((p) => ({
          ...p,
          cacheTtlDays: String(savedTtl.cacheTtlDays),
          insuranceWatchTtlDays: String(savedTtl.insuranceWatchTtlDays),
        }))
      }
      if (activeTab === 'email-addresses') {
        const saved = await saveEmailMailboxes(emailMailboxes)
        setEmailMailboxes(saved)
      }
      setSaved(true)
      showToast('Settings saved', 'success')
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save settings', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const saveFooter =
    activeTab !== 'email' && activeTab !== 'email-sends' ? (
      <div className="client-settings-tab-panel__footer" style={{ borderColor: c.border }}>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving || saved}
          className="dashboard-btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-60"
        >
          {isSaving ? (
            <>
              <Spinner size="sm" className="text-white" />
              Saving…
            </>
          ) : saved ? (
            <>
              <Check className="w-4 h-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save changes
            </>
          )}
        </button>
      </div>
    ) : undefined

  const inputStyle = {
    backgroundColor: c.card,
    fontSize: 13,
    color: c.primary,
    height: 36,
    minHeight: 36,
  } as const

  return (
    <>
      <div className="client-settings-page overflow-hidden flex flex-col min-h-0">
        <div className="client-page-tabs-bar shrink-0 overflow-x-auto">
          <div className="page-tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`page-tab ${activeTab === tab.id ? 'page-tab--active' : ''}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <section
          className="client-stat-strip grid grid-cols-2 lg:grid-cols-4 border-b shrink-0"
          style={{ borderColor: c.border }}
        >
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b sm:border-b-0"
            style={{ backgroundColor: c.stat.blue, borderColor: c.border }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
              <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                Role
              </span>
            </div>
            <span className="text-sm font-bold truncate shrink-0 max-w-[55%]" style={{ color: c.primary }}>
              {profileData.role}
            </span>
          </div>
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b lg:border-b-0"
            style={{ backgroundColor: c.stat.slate, borderColor: c.border }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: c.secondary }} />
              <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                Force close
              </span>
            </div>
            <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
              {invoiceSettings.forceCloseDays}d
            </span>
          </div>
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0"
            style={{ backgroundColor: c.stat.blue, borderColor: c.border }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
              <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                Email
              </span>
            </div>
            <span className="text-sm font-bold shrink-0" style={{ color: c.primary }}>
              Templates
            </span>
          </div>
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5"
            style={{
              backgroundColor: securitySettings.requireTwoFactor ? c.stat.green : c.stat.amber,
              borderColor: c.border,
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Lock
                className="w-3.5 h-3.5 shrink-0"
                style={{
                  color: securitySettings.requireTwoFactor ? c.success : c.warning,
                }}
              />
              <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                2FA
              </span>
            </div>
            <span className="text-sm font-bold shrink-0" style={{ color: c.primary }}>
              {securitySettings.requireTwoFactor ? 'On' : 'Off'}
            </span>
          </div>
        </section>

        <div className="client-settings-body flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="client-settings-panel flex-1 min-h-0 overflow-hidden">
            {activeTab === 'profile' && (
              <SettingsTabPanel footer={saveFooter}>
                <div className="client-settings-grid client-settings-grid--profile">
                  <SettingsTextInput
                    label="Full name"
                    value={profileData.name}
                    onChange={(v) => setProfileData((p) => ({ ...p, name: v }))}
                  />
                  <SettingsTextInput
                    label="Email"
                    type="email"
                    value={profileData.email}
                    onChange={(v) => setProfileData((p) => ({ ...p, email: v }))}
                  />
                  <SettingsTextInput
                    label="Phone"
                    type="tel"
                    value={profileData.phone}
                    onChange={(v) => setProfileData((p) => ({ ...p, phone: v }))}
                  />
                  <SettingsSelect
                    label="Timezone"
                    value={profileData.timezone}
                    onChange={(v) => setProfileData((p) => ({ ...p, timezone: v }))}
                  >
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  </SettingsSelect>
                </div>
              </SettingsTabPanel>
            )}

            {activeTab === 'notifications' && (
              <SettingsTabPanel footer={saveFooter}>
                <div className="client-settings-grid client-settings-grid--notifications">
                  <SettingsToggleRow
                    label="Email notifications"
                    hint="Receive notifications via email"
                    checked={notificationSettings.emailNotifications}
                    onChange={(v) =>
                      setNotificationSettings((p) => ({ ...p, emailNotifications: v }))
                    }
                  />
                  <SettingsToggleRow
                    label="SMS notifications"
                    hint="Receive notifications via SMS"
                    checked={notificationSettings.smsNotifications}
                    onChange={(v) =>
                      setNotificationSettings((p) => ({ ...p, smsNotifications: v }))
                    }
                  />
                  <SettingsToggleRow
                    label="Batch alerts"
                    hint="Notify when new batches are submitted"
                    checked={notificationSettings.batchAlerts}
                    onChange={(v) => setNotificationSettings((p) => ({ ...p, batchAlerts: v }))}
                  />
                  <SettingsToggleRow
                    label="Collection alerts"
                    hint="Notify about overdue invoices"
                    checked={notificationSettings.collectionAlerts}
                    onChange={(v) =>
                      setNotificationSettings((p) => ({ ...p, collectionAlerts: v }))
                    }
                  />
                  <SettingsToggleRow
                    label="Daily digest"
                    hint="Receive daily summary email"
                    checked={notificationSettings.dailyDigest}
                    onChange={(v) => setNotificationSettings((p) => ({ ...p, dailyDigest: v }))}
                  />
                  <SettingsToggleRow
                    label="Weekly report"
                    hint="Receive weekly summary email"
                    checked={notificationSettings.weeklyReport}
                    onChange={(v) => setNotificationSettings((p) => ({ ...p, weeklyReport: v }))}
                  />
                </div>
              </SettingsTabPanel>
            )}

            {activeTab === 'invoices' && (
              <SettingsTabPanel footer={saveFooter}>
                <div className="client-settings-grid client-settings-grid--preferences">
                  <SettingsTextInput
                    label="Default payment terms (days)"
                    type="number"
                    value={invoiceSettings.defaultPaymentTerms}
                    onChange={(v) =>
                      setInvoiceSettings((p) => ({ ...p, defaultPaymentTerms: v }))
                    }
                  />
                  <SettingsTextInput
                    label="Auto-approve threshold ($)"
                    type="number"
                    value={invoiceSettings.autoApproveThreshold}
                    onChange={(v) =>
                      setInvoiceSettings((p) => ({ ...p, autoApproveThreshold: v }))
                    }
                  />
                  <SettingsTextInput
                    label="Force close after (days)"
                    type="number"
                    value={invoiceSettings.forceCloseDays}
                    onChange={(v) => setInvoiceSettings((p) => ({ ...p, forceCloseDays: v }))}
                  />
                </div>

                <p
                  className="client-label mt-4 mb-2"
                  style={{ color: c.secondary }}
                >
                  Aging buckets (days)
                </p>
                <div className="client-settings-grid client-settings-grid--profile mb-4">
                  {(
                    [
                      ['bucket1', 'Bucket 1'],
                      ['bucket2', 'Bucket 2'],
                      ['bucket3', 'Bucket 3'],
                      ['bucket4', 'Bucket 4'],
                      ['bucket5', 'Bucket 5'],
                    ] as const
                  ).map(([key, label]) => (
                    <SettingsField key={key} label={label}>
                      <input
                        type="number"
                        value={invoiceSettings.agingBuckets[key]}
                        onChange={(e) =>
                          setInvoiceSettings((p) => ({
                            ...p,
                            agingBuckets: { ...p.agingBuckets, [key]: e.target.value },
                          }))
                        }
                        className="client-input w-full"
                        style={inputStyle}
                      />
                    </SettingsField>
                  ))}
                </div>

                <div className="client-settings-grid client-settings-grid--notifications">
                  <SettingsToggleRow
                    label="Require approval"
                    hint="All invoices require manual approval"
                    checked={invoiceSettings.requireApproval}
                    onChange={(v) => setInvoiceSettings((p) => ({ ...p, requireApproval: v }))}
                  />
                  <SettingsToggleRow
                    label="Require notes"
                    hint="Notes required when changing invoice status"
                    checked={invoiceSettings.requireNotes}
                    onChange={(v) => setInvoiceSettings((p) => ({ ...p, requireNotes: v }))}
                  />
                </div>
              </SettingsTabPanel>
            )}

            {activeTab === 'collections' && (
              <SettingsTabPanel footer={saveFooter}>
                <CollectionsSettingsPanel
                  settings={collectionsSettings}
                  onChange={(patch) => setCollectionsSettings((p) => ({ ...p, ...patch }))}
                />
              </SettingsTabPanel>
            )}

            {activeTab === 'broker-risk' && (
              <SettingsTabPanel footer={saveFooter}>
                <BrokerRiskSettingsPanel
                  settings={brokerRiskSettings}
                  onChange={(patch) => setBrokerRiskSettings((p) => ({ ...p, ...patch }))}
                />
              </SettingsTabPanel>
            )}

            {activeTab === 'email-addresses' && (
              <SettingsTabPanel footer={saveFooter}>
                <EmailAddressesSettingsPanel
                  settings={emailMailboxes}
                  onChange={(patch) => setEmailMailboxes((p) => ({ ...p, ...patch }))}
                />
              </SettingsTabPanel>
            )}

            {activeTab === 'email-sends' && (
              <SettingsTabPanel>
                <EmailWorkflowSettingsPanel />
              </SettingsTabPanel>
            )}

            {activeTab === 'email' && (
              <SettingsTabPanel className="admin-email-templates-panel">
                <EmailTemplatesPanel />
              </SettingsTabPanel>
            )}

            {activeTab === 'security' && (
              <SettingsTabPanel footer={saveFooter}>
                <div className="client-settings-grid client-settings-grid--preferences">
                  <SettingsTextInput
                    label="Session timeout (minutes)"
                    type="number"
                    value={securitySettings.sessionTimeout}
                    onChange={(v) => setSecuritySettings((p) => ({ ...p, sessionTimeout: v }))}
                  />
                  <SettingsTextInput
                    label="Password expiry (days)"
                    type="number"
                    value={securitySettings.passwordExpiry}
                    onChange={(v) => setSecuritySettings((p) => ({ ...p, passwordExpiry: v }))}
                  />
                  <SettingsTextInput
                    label="Max login attempts"
                    type="number"
                    value={securitySettings.maxLoginAttempts}
                    onChange={(v) => setSecuritySettings((p) => ({ ...p, maxLoginAttempts: v }))}
                  />
                </div>
                <div className="client-settings-grid client-settings-grid--notifications mt-4">
                  <SettingsToggleRow
                    label="Two-factor authentication"
                    hint="Require 2FA for all users"
                    checked={securitySettings.requireTwoFactor}
                    onChange={(v) => setSecuritySettings((p) => ({ ...p, requireTwoFactor: v }))}
                  />
                  <SettingsToggleRow
                    label="Audit logging"
                    hint="Log all system activities"
                    checked={securitySettings.enableAuditLog}
                    onChange={(v) => setSecuritySettings((p) => ({ ...p, enableAuditLog: v }))}
                  />
                </div>
              </SettingsTabPanel>
            )}

            {activeTab === 'system' && (
              <SettingsTabPanel footer={saveFooter}>
                <div className="client-settings-grid client-settings-grid--preferences">
                  <SettingsSelect
                    label="Date format"
                    value={systemSettings.dateFormat}
                    onChange={(v) => setSystemSettings((p) => ({ ...p, dateFormat: v }))}
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </SettingsSelect>
                  <SettingsSelect
                    label="Time format"
                    value={systemSettings.timeFormat}
                    onChange={(v) => setSystemSettings((p) => ({ ...p, timeFormat: v }))}
                  >
                    <option value="12h">12-hour</option>
                    <option value="24h">24-hour</option>
                  </SettingsSelect>
                  <SettingsSelect
                    label="Currency"
                    value={systemSettings.currency}
                    onChange={(v) => setSystemSettings((p) => ({ ...p, currency: v }))}
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="CAD">CAD (C$)</option>
                  </SettingsSelect>
                  <SettingsSelect
                    label="Items per page"
                    value={systemSettings.itemsPerPage}
                    onChange={(v) => setSystemSettings((p) => ({ ...p, itemsPerPage: v }))}
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </SettingsSelect>
                  {systemSettings.autoBackup ? (
                    <SettingsSelect
                      label="Backup frequency"
                      value={systemSettings.backupFrequency}
                      onChange={(v) => setSystemSettings((p) => ({ ...p, backupFrequency: v }))}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </SettingsSelect>
                  ) : null}
                </div>
                <div className="client-settings-grid client-settings-grid--notifications mt-4">
                  <SettingsToggleRow
                    label="Auto backup"
                    hint="Automatically backup system data"
                    checked={systemSettings.autoBackup}
                    onChange={(v) => setSystemSettings((p) => ({ ...p, autoBackup: v }))}
                  />
                </div>

              </SettingsTabPanel>
            )}

            {activeTab === 'ai' && (
              <SettingsTabPanel>
                <div className="space-y-6">
                  <AiStatusCheckPanel />
                  <AiSpendSettingsPanel />
                  <AiRateLimitSettingsPanel variant="admin" />
                </div>
              </SettingsTabPanel>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
