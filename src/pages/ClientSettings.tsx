import { useEffect, useState, type ReactNode } from 'react'
import {
  User,
  Bell,
  Eye,
  Lock,
  Building2,
  CreditCard,
  Save,
  Check,
  Wallet,
  Shield,
} from 'lucide-react'
import ClientLayout from '../components/ClientLayout'
import PlanBillingPanel from '../components/client/PlanBillingPanel'
import { useTheme, useClientTheme, type ThemeMode } from '../theme/ThemeContext'
import { getClientById } from '../services/clientRegistry'
import { useClientSession } from '../hooks/useClientSession'
import { useClientCapabilities } from '../hooks/useClientCapabilities'
import { getTierLabel } from '../utils/clientCapabilities'
import {
  getInitialListPageSize,
  LIST_PAGE_SIZE_KEY,
  PAGE_SIZE_OPTIONS,
} from '../utils/clientListPage'

type SettingsTab = 'profile' | 'notifications' | 'preferences' | 'security' | 'remittance' | 'billing'

type NotificationSettings = {
  emailNotifications: boolean
  invoiceApproved: boolean
  invoiceOnHold: boolean
  paymentReceived: boolean
  batchSubmitted: boolean
  overdueAlerts: boolean
  weeklySummary: boolean
  dailyDigest: boolean
}

const defaultNotifications: NotificationSettings = {
  emailNotifications: true,
  invoiceApproved: true,
  invoiceOnHold: true,
  paymentReceived: true,
  batchSubmitted: true,
  overdueAlerts: true,
  weeklySummary: false,
  dailyDigest: false,
}

const NOTIFICATION_OPTIONS: Array<{
  key: keyof NotificationSettings
  label: string
  hint: string
}> = [
  { key: 'emailNotifications', label: 'Email notifications', hint: 'Master switch for all email alerts' },
  { key: 'invoiceApproved', label: 'Invoice approved', hint: 'When an invoice clears approval' },
  { key: 'invoiceOnHold', label: 'Invoice on hold', hint: 'When an invoice is placed on hold' },
  { key: 'paymentReceived', label: 'Payment received', hint: 'When a payment is confirmed' },
  { key: 'batchSubmitted', label: 'Batch submitted', hint: 'When a batch is sent for processing' },
  { key: 'overdueAlerts', label: 'Overdue alerts', hint: 'Invoices past expected pay date' },
  { key: 'weeklySummary', label: 'Weekly summary', hint: 'End-of-week collections digest' },
  { key: 'dailyDigest', label: 'Daily digest', hint: 'Morning activity summary' },
]

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
      {hint && (
        <p className="client-label-hint" style={{ color: c.mutedLight }}>
          {hint}
        </p>
      )}
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
        <span className="client-toggle__track" style={{ backgroundColor: checked ? c.info : c.mutedLight }} />
      </label>
    </div>
  )
}

export default function ClientSettings() {
  const c = useClientTheme()
  const { clientId, clientName } = useClientSession()
  const { capabilities, tier } = useClientCapabilities()
  const { mode: themeMode, setMode: setThemeMode } = useTheme()

  const currentClient = getClientById(clientId)

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [saved, setSaved] = useState(false)

  const [profileData, setProfileData] = useState({
    company_name: currentClient?.name || clientName,
    contact_person: currentClient?.contact_person || '',
    email: currentClient?.email || '',
    phone: currentClient?.phone || '',
    fax: currentClient?.fax || '',
    address: currentClient?.address || '',
    city: currentClient?.city || '',
    state: currentClient?.state || '',
    zip: currentClient?.zip || '',
    mc_number: currentClient?.mc_number || '',
    dot_number: currentClient?.dot_number || '',
  })

  const [notificationSettings, setNotificationSettings] = useState(defaultNotifications)

  const [preferences, setPreferences] = useState({
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    currency: 'USD',
    itemsPerPage: String(getInitialListPageSize()),
    defaultView: 'dashboard',
  })

  const [securitySettings, setSecuritySettings] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false,
    sessionTimeout: '30',
  })

  const [remittanceData, setRemittanceData] = useState({
    remittance_info: currentClient?.remittance_info || '',
    bank_name: currentClient?.bank_name || '',
    account_number: currentClient?.account_number || '',
    routing_number: currentClient?.routing_number || '',
  })

  useEffect(() => {
    if (currentClient) {
      setProfileData({
        company_name: currentClient.name || clientName,
        contact_person: currentClient.contact_person || '',
        email: currentClient.email || '',
        phone: currentClient.phone || '',
        fax: currentClient.fax || '',
        address: currentClient.address || '',
        city: currentClient.city || '',
        state: currentClient.state || '',
        zip: currentClient.zip || '',
        mc_number: currentClient.mc_number || '',
        dot_number: currentClient.dot_number || '',
      })
      setRemittanceData({
        remittance_info: currentClient.remittance_info || '',
        bank_name: currentClient.bank_name || '',
        account_number: currentClient.account_number || '',
        routing_number: currentClient.routing_number || '',
      })
    }
  }, [clientId, currentClient, clientName])

  const tabs: Array<{ id: SettingsTab; label: string; icon: typeof User }> = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'billing', label: 'Billing', icon: Wallet },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'preferences', label: 'Preferences', icon: Eye },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'remittance', label: 'Remittance', icon: CreditCard },
  ]

  const handleSave = () => {
    try {
      const size = Number(preferences.itemsPerPage)
      if (PAGE_SIZE_OPTIONS.includes(size as (typeof PAGE_SIZE_OPTIONS)[number])) {
        localStorage.setItem(LIST_PAGE_SIZE_KEY, String(size))
      }
    } catch {
      /* ignore */
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handlePasswordChange = () => {
    if (securitySettings.newPassword !== securitySettings.confirmPassword) {
      alert('New password and confirm password do not match')
      return
    }
    if (securitySettings.newPassword.length < 8) {
      alert('Password must be at least 8 characters long')
      return
    }
    alert('Password changed successfully')
    setSecuritySettings((prev) => ({
      ...prev,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    }))
  }

  const inputStyle = {
    backgroundColor: c.card,
    fontSize: 13,
    color: c.primary,
  } as const

  const showSaveFooter = activeTab !== 'billing'

  const saveFooter = showSaveFooter ? (
    <div
      className="client-settings-tab-panel__footer"
      style={{ borderColor: c.border }}
    >
      <button
        type="button"
        onClick={handleSave}
        className="dashboard-btn-primary inline-flex items-center gap-2 text-sm"
      >
        {saved ? (
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

  return (
    <ClientLayout clientName={clientName} clientId={clientId} flushMain>
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
              <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: c.info }} />
              <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                Company
              </span>
            </div>
            <span className="text-sm font-bold truncate shrink-0 max-w-[50%]" style={{ color: c.primary }}>
              {profileData.company_name}
            </span>
          </div>
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5 lg:border-r border-b lg:border-b-0"
            style={{ backgroundColor: c.stat.green, borderColor: c.border }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Wallet className="w-3.5 h-3.5 shrink-0" style={{ color: c.success }} />
              <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                Plan
              </span>
            </div>
            <span
              className={`service-tier-badge ${tier === 'managed' ? 'service-tier-badge--managed' : 'service-tier-badge--self'} shrink-0`}
            >
              {getTierLabel(tier)}
            </span>
          </div>
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5 sm:border-r border-b lg:border-b-0"
            style={{ backgroundColor: c.stat.slate, borderColor: c.border }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <CreditCard className="w-3.5 h-3.5 shrink-0" style={{ color: c.secondary }} />
              <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                MC #
              </span>
            </div>
            <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: c.primary }}>
              {profileData.mc_number || '—'}
            </span>
          </div>
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5"
            style={{
              backgroundColor: securitySettings.twoFactorEnabled ? c.stat.green : c.stat.amber,
              borderColor: c.border,
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Shield className="w-3.5 h-3.5 shrink-0" style={{ color: securitySettings.twoFactorEnabled ? c.success : c.warning }} />
              <span className="text-xs font-medium truncate" style={{ color: c.secondary }}>
                2FA
              </span>
            </div>
            <span className="text-sm font-bold shrink-0" style={{ color: c.primary }}>
              {securitySettings.twoFactorEnabled ? 'On' : 'Off'}
            </span>
          </div>
        </section>

        <div className="client-settings-body flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="client-settings-panel flex-1 min-h-0 overflow-hidden">
            {activeTab === 'billing' && (
              <SettingsTabPanel className="client-settings-tab-panel--billing">
                <PlanBillingPanel clientId={clientId} tier={tier} />
              </SettingsTabPanel>
            )}

            {activeTab === 'profile' && (
              <SettingsTabPanel className="client-settings-tab-panel--profile" footer={saveFooter}>
                <div className="client-settings-grid client-settings-grid--profile">
                  <SettingsTextInput
                    label="Company name"
                    value={profileData.company_name}
                    onChange={(v) => setProfileData((p) => ({ ...p, company_name: v }))}
                  />
                  <SettingsTextInput
                    label="Contact person"
                    value={profileData.contact_person}
                    onChange={(v) => setProfileData((p) => ({ ...p, contact_person: v }))}
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
                  <SettingsTextInput
                    label="Fax"
                    type="tel"
                    value={profileData.fax}
                    onChange={(v) => setProfileData((p) => ({ ...p, fax: v }))}
                  />
                  <SettingsTextInput
                    label="Address"
                    value={profileData.address}
                    onChange={(v) => setProfileData((p) => ({ ...p, address: v }))}
                  />
                  <SettingsTextInput
                    label="City"
                    value={profileData.city}
                    onChange={(v) => setProfileData((p) => ({ ...p, city: v }))}
                  />
                  <SettingsTextInput
                    label="State"
                    value={profileData.state}
                    onChange={(v) => setProfileData((p) => ({ ...p, state: v }))}
                  />
                  <SettingsTextInput
                    label="ZIP"
                    value={profileData.zip}
                    onChange={(v) => setProfileData((p) => ({ ...p, zip: v }))}
                  />
                  <SettingsTextInput
                    label="MC number"
                    value={profileData.mc_number}
                    onChange={(v) => setProfileData((p) => ({ ...p, mc_number: v }))}
                  />
                  <SettingsTextInput
                    label="DOT number"
                    value={profileData.dot_number}
                    onChange={(v) => setProfileData((p) => ({ ...p, dot_number: v }))}
                  />
                </div>
              </SettingsTabPanel>
            )}

            {activeTab === 'notifications' && (
              <SettingsTabPanel className="client-settings-tab-panel--notifications" footer={saveFooter}>
                <div className="client-settings-grid client-settings-grid--notifications">
                  {NOTIFICATION_OPTIONS.map((opt) => (
                    <SettingsToggleRow
                      key={opt.key}
                      label={opt.label}
                      hint={opt.hint}
                      checked={notificationSettings[opt.key]}
                      onChange={(value) =>
                        setNotificationSettings((prev) => ({ ...prev, [opt.key]: value }))
                      }
                    />
                  ))}
                </div>
              </SettingsTabPanel>
            )}

            {activeTab === 'preferences' && (
              <SettingsTabPanel className="client-settings-tab-panel--preferences" footer={saveFooter}>
                <div className="client-settings-grid client-settings-grid--preferences">
                  <SettingsField label="Appearance" hint="Light mode is recommended.">
                    <select
                      value={themeMode}
                      onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
                      className="client-input w-full"
                      style={inputStyle}
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                      <option value="system">System</option>
                    </select>
                  </SettingsField>
                  <SettingsField label="Date format">
                    <select
                      value={preferences.dateFormat}
                      onChange={(e) => setPreferences((p) => ({ ...p, dateFormat: e.target.value }))}
                      className="client-input w-full"
                      style={inputStyle}
                    >
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  </SettingsField>
                  <SettingsField label="Time format">
                    <select
                      value={preferences.timeFormat}
                      onChange={(e) => setPreferences((p) => ({ ...p, timeFormat: e.target.value }))}
                      className="client-input w-full"
                      style={inputStyle}
                    >
                      <option value="12h">12-hour</option>
                      <option value="24h">24-hour</option>
                    </select>
                  </SettingsField>
                  <SettingsField label="Currency">
                    <select
                      value={preferences.currency}
                      onChange={(e) => setPreferences((p) => ({ ...p, currency: e.target.value }))}
                      className="client-input w-full"
                      style={inputStyle}
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="CAD">CAD (C$)</option>
                    </select>
                  </SettingsField>
                  <SettingsField
                    label="Default list page size"
                    hint="Applies to invoices, payments, batches, and other tables."
                  >
                    <select
                      value={preferences.itemsPerPage}
                      onChange={(e) => setPreferences((p) => ({ ...p, itemsPerPage: e.target.value }))}
                      className="client-input w-full"
                      style={inputStyle}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size} rows
                        </option>
                      ))}
                    </select>
                  </SettingsField>
                </div>
              </SettingsTabPanel>
            )}

            {activeTab === 'security' && (
              <SettingsTabPanel className="client-settings-tab-panel--security" footer={saveFooter}>
                <div className="client-settings-grid client-settings-grid--security">
                  <div className="client-settings-security-col space-y-3">
                    <SettingsTextInput
                      label="Current password"
                      type="password"
                      value={securitySettings.currentPassword}
                      onChange={(v) => setSecuritySettings((p) => ({ ...p, currentPassword: v }))}
                    />
                    <SettingsTextInput
                      label="New password"
                      type="password"
                      value={securitySettings.newPassword}
                      onChange={(v) => setSecuritySettings((p) => ({ ...p, newPassword: v }))}
                    />
                    <SettingsTextInput
                      label="Confirm new password"
                      type="password"
                      value={securitySettings.confirmPassword}
                      onChange={(v) => setSecuritySettings((p) => ({ ...p, confirmPassword: v }))}
                    />
                    <button
                      type="button"
                      onClick={handlePasswordChange}
                      className="dashboard-btn-secondary text-sm"
                    >
                      Change password
                    </button>
                  </div>
                  <div
                    className="client-settings-security-col flex flex-col gap-3 border-t lg:border-t-0 lg:border-l pt-4 lg:pt-0 lg:pl-6"
                    style={{ borderColor: c.border }}
                  >
                    <SettingsToggleRow
                      label="Two-factor authentication"
                      hint="Extra security for your account"
                      checked={securitySettings.twoFactorEnabled}
                      onChange={(value) =>
                        setSecuritySettings((p) => ({ ...p, twoFactorEnabled: value }))
                      }
                    />
                    <SettingsField label="Session timeout (minutes)">
                      <input
                        type="number"
                        value={securitySettings.sessionTimeout}
                        onChange={(e) =>
                          setSecuritySettings((p) => ({ ...p, sessionTimeout: e.target.value }))
                        }
                        className="client-input w-full"
                        style={inputStyle}
                        min={5}
                        max={120}
                      />
                    </SettingsField>
                  </div>
                </div>
              </SettingsTabPanel>
            )}

            {activeTab === 'remittance' && (
              <SettingsTabPanel className="client-settings-tab-panel--remittance" footer={saveFooter}>
                <div className="flex flex-col gap-4">
                  {!capabilities.canEditRemittance && (
                    <div
                      className="text-sm p-2.5 rounded-lg border shrink-0"
                      style={{
                        backgroundColor: c.stat.amber,
                        borderColor: c.border,
                        color: c.secondary,
                      }}
                    >
                      Remittance details are managed by Credyx on managed accounts.
                    </div>
                  )}
                  <SettingsField label="Remittance instructions">
                    <textarea
                      value={remittanceData.remittance_info}
                      onChange={(e) =>
                        setRemittanceData((p) => ({ ...p, remittance_info: e.target.value }))
                      }
                      readOnly={!capabilities.canEditRemittance}
                      disabled={!capabilities.canEditRemittance}
                      rows={4}
                      className="client-input client-settings-textarea w-full resize-none"
                      style={{
                        ...inputStyle,
                        backgroundColor: capabilities.canEditRemittance ? c.card : c.stat.slate,
                      }}
                    />
                  </SettingsField>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
                    <SettingsTextInput
                      label="Bank name"
                      value={remittanceData.bank_name}
                      onChange={(v) => setRemittanceData((p) => ({ ...p, bank_name: v }))}
                      readOnly={!capabilities.canEditRemittance}
                    />
                    <SettingsTextInput
                      label="Account number"
                      value={remittanceData.account_number}
                      onChange={(v) => setRemittanceData((p) => ({ ...p, account_number: v }))}
                      readOnly={!capabilities.canEditRemittance}
                    />
                    <SettingsTextInput
                      label="Routing number"
                      value={remittanceData.routing_number}
                      onChange={(v) => setRemittanceData((p) => ({ ...p, routing_number: v }))}
                      readOnly={!capabilities.canEditRemittance}
                    />
                  </div>
                </div>
              </SettingsTabPanel>
            )}
          </div>
        </div>
      </div>
    </ClientLayout>
  )
}
