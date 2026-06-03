import { useState } from 'react'
import { Header } from '../components/admin/Header'
import {
  User,
  Bell,
  FileText,
  Mail,
  Shield,
  Database,
  Save,
  Check,
} from 'lucide-react'

type SettingsTab = 'profile' | 'notifications' | 'invoices' | 'email' | 'security' | 'system'

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [saved, setSaved] = useState(false)

  // Profile Settings
  const [profileData, setProfileData] = useState({
    name: 'Admin User',
    email: 'admin@credyx.com',
    role: 'Administrator',
    phone: '(555) 123-4567',
    timezone: 'America/New_York',
  })

  // Notification Settings
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

  // Invoice/AR Settings
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

  // Email Settings
  const [emailSettings, setEmailSettings] = useState({
    smtpServer: 'smtp.credyx.com',
    smtpPort: '587',
    smtpUser: 'noreply@credyx.com',
    fromEmail: 'noreply@credyx.com',
    fromName: 'Credyx A/R Solutions',
    useTLS: true,
  })

  // Security Settings
  const [securitySettings, setSecuritySettings] = useState({
    sessionTimeout: '30',
    requireTwoFactor: false,
    passwordExpiry: '90',
    maxLoginAttempts: '5',
    enableAuditLog: true,
  })

  // System Settings
  const [systemSettings, setSystemSettings] = useState({
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    currency: 'USD',
    language: 'en',
    itemsPerPage: '25',
    autoBackup: true,
    backupFrequency: 'daily',
  })

  const tabs = [
    { id: 'profile' as SettingsTab, label: 'Profile', icon: User },
    { id: 'notifications' as SettingsTab, label: 'Notifications', icon: Bell },
    { id: 'invoices' as SettingsTab, label: 'Invoices & A/R', icon: FileText },
    { id: 'email' as SettingsTab, label: 'Email', icon: Mail },
    { id: 'security' as SettingsTab, label: 'Security', icon: Shield },
    { id: 'system' as SettingsTab, label: 'System', icon: Database },
  ]

  const handleSave = () => {
    // TODO: Implement save logic
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleProfileChange = (field: string, value: string) => {
    setProfileData((prev) => ({ ...prev, [field]: value }))
  }

  const handleNotificationChange = (field: string, value: boolean) => {
    setNotificationSettings((prev) => ({ ...prev, [field]: value }))
  }

  const handleInvoiceChange = (field: string, value: string | boolean | object) => {
    if (typeof value === 'object') {
      setInvoiceSettings((prev) => ({ ...prev, agingBuckets: value as any }))
    } else {
      setInvoiceSettings((prev) => ({ ...prev, [field]: value }))
    }
  }

  const handleEmailChange = (field: string, value: string | boolean) => {
    setEmailSettings((prev) => ({ ...prev, [field]: value }))
  }

  const handleSecurityChange = (field: string, value: string | boolean) => {
    setSecuritySettings((prev) => ({ ...prev, [field]: value }))
  }

  const handleSystemChange = (field: string, value: string | boolean) => {
    setSystemSettings((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName="Admin User" userRole="Administrator" />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-black mb-2">Settings</h1>
          <p className="text-gray-600">Manage your account and system preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded">
              <nav className="p-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium rounded transition-colors mb-1 ${
                        activeTab === tab.id
                          ? 'bg-black text-white'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </nav>
            </div>
          </div>

          {/* Settings Content */}
          <div className="lg:col-span-3">
            <div className="bg-white border border-gray-200 rounded">
              <div className="p-6">
                {/* Profile Settings */}
                {activeTab === 'profile' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-black mb-6">Profile Settings</h2>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Full Name
                          </label>
                          <input
                            type="text"
                            value={profileData.name}
                            onChange={(e) => handleProfileChange('name', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email Address
                          </label>
                          <input
                            type="email"
                            value={profileData.email}
                            onChange={(e) => handleProfileChange('email', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            value={profileData.phone}
                            onChange={(e) => handleProfileChange('phone', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Timezone
                          </label>
                          <select
                            value={profileData.timezone}
                            onChange={(e) => handleProfileChange('timezone', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          >
                            <option value="America/New_York">Eastern Time (ET)</option>
                            <option value="America/Chicago">Central Time (CT)</option>
                            <option value="America/Denver">Mountain Time (MT)</option>
                            <option value="America/Los_Angeles">Pacific Time (PT)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notification Settings */}
                {activeTab === 'notifications' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-black mb-6">Notification Settings</h2>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between py-3 border-b border-gray-200">
                          <div>
                            <label className="text-sm font-medium text-gray-900">
                              Email Notifications
                            </label>
                            <p className="text-xs text-gray-500">
                              Receive notifications via email
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notificationSettings.emailNotifications}
                              onChange={(e) =>
                                handleNotificationChange('emailNotifications', e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between py-3 border-b border-gray-200">
                          <div>
                            <label className="text-sm font-medium text-gray-900">
                              SMS Notifications
                            </label>
                            <p className="text-xs text-gray-500">
                              Receive notifications via SMS
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notificationSettings.smsNotifications}
                              onChange={(e) =>
                                handleNotificationChange('smsNotifications', e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between py-3 border-b border-gray-200">
                          <div>
                            <label className="text-sm font-medium text-gray-900">
                              Batch Alerts
                            </label>
                            <p className="text-xs text-gray-500">
                              Notify when new batches are submitted
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notificationSettings.batchAlerts}
                              onChange={(e) =>
                                handleNotificationChange('batchAlerts', e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between py-3 border-b border-gray-200">
                          <div>
                            <label className="text-sm font-medium text-gray-900">
                              Collection Alerts
                            </label>
                            <p className="text-xs text-gray-500">
                              Notify about overdue invoices
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notificationSettings.collectionAlerts}
                              onChange={(e) =>
                                handleNotificationChange('collectionAlerts', e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between py-3 border-b border-gray-200">
                          <div>
                            <label className="text-sm font-medium text-gray-900">
                              Daily Digest
                            </label>
                            <p className="text-xs text-gray-500">
                              Receive daily summary email
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notificationSettings.dailyDigest}
                              onChange={(e) =>
                                handleNotificationChange('dailyDigest', e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Invoice/AR Settings */}
                {activeTab === 'invoices' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-black mb-6">Invoice & A/R Settings</h2>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Default Payment Terms (days)
                          </label>
                          <input
                            type="number"
                            value={invoiceSettings.defaultPaymentTerms}
                            onChange={(e) =>
                              handleInvoiceChange('defaultPaymentTerms', e.target.value)
                            }
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Auto-Approve Threshold ($)
                          </label>
                          <input
                            type="number"
                            value={invoiceSettings.autoApproveThreshold}
                            onChange={(e) =>
                              handleInvoiceChange('autoApproveThreshold', e.target.value)
                            }
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Force Close After (days)
                          </label>
                          <input
                            type="number"
                            value={invoiceSettings.forceCloseDays}
                            onChange={(e) =>
                              handleInvoiceChange('forceCloseDays', e.target.value)
                            }
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-3">
                            Aging Buckets (days)
                          </label>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Bucket 1</label>
                              <input
                                type="number"
                                value={invoiceSettings.agingBuckets.bucket1}
                                onChange={(e) =>
                                  handleInvoiceChange('agingBuckets', {
                                    ...invoiceSettings.agingBuckets,
                                    bucket1: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Bucket 2</label>
                              <input
                                type="number"
                                value={invoiceSettings.agingBuckets.bucket2}
                                onChange={(e) =>
                                  handleInvoiceChange('agingBuckets', {
                                    ...invoiceSettings.agingBuckets,
                                    bucket2: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Bucket 3</label>
                              <input
                                type="number"
                                value={invoiceSettings.agingBuckets.bucket3}
                                onChange={(e) =>
                                  handleInvoiceChange('agingBuckets', {
                                    ...invoiceSettings.agingBuckets,
                                    bucket3: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Bucket 4</label>
                              <input
                                type="number"
                                value={invoiceSettings.agingBuckets.bucket4}
                                onChange={(e) =>
                                  handleInvoiceChange('agingBuckets', {
                                    ...invoiceSettings.agingBuckets,
                                    bucket4: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Bucket 5</label>
                              <input
                                type="number"
                                value={invoiceSettings.agingBuckets.bucket5}
                                onChange={(e) =>
                                  handleInvoiceChange('agingBuckets', {
                                    ...invoiceSettings.agingBuckets,
                                    bucket5: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between py-3 border-t border-gray-200">
                          <div>
                            <label className="text-sm font-medium text-gray-900">
                              Require Approval
                            </label>
                            <p className="text-xs text-gray-500">
                              All invoices require manual approval
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={invoiceSettings.requireApproval}
                              onChange={(e) =>
                                handleInvoiceChange('requireApproval', e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Email Settings */}
                {activeTab === 'email' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-black mb-6">Email Settings</h2>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            SMTP Server
                          </label>
                          <input
                            type="text"
                            value={emailSettings.smtpServer}
                            onChange={(e) => handleEmailChange('smtpServer', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              SMTP Port
                            </label>
                            <input
                              type="text"
                              value={emailSettings.smtpPort}
                              onChange={(e) => handleEmailChange('smtpPort', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              SMTP Username
                            </label>
                            <input
                              type="text"
                              value={emailSettings.smtpUser}
                              onChange={(e) => handleEmailChange('smtpUser', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            From Email
                          </label>
                          <input
                            type="email"
                            value={emailSettings.fromEmail}
                            onChange={(e) => handleEmailChange('fromEmail', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            From Name
                          </label>
                          <input
                            type="text"
                            value={emailSettings.fromName}
                            onChange={(e) => handleEmailChange('fromName', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                        </div>
                        <div className="flex items-center justify-between py-3 border-t border-gray-200">
                          <div>
                            <label className="text-sm font-medium text-gray-900">Use TLS</label>
                            <p className="text-xs text-gray-500">
                              Enable TLS encryption for email
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={emailSettings.useTLS}
                              onChange={(e) => handleEmailChange('useTLS', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Security Settings */}
                {activeTab === 'security' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-black mb-6">Security Settings</h2>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Session Timeout (minutes)
                          </label>
                          <input
                            type="number"
                            value={securitySettings.sessionTimeout}
                            onChange={(e) => handleSecurityChange('sessionTimeout', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Password Expiry (days)
                          </label>
                          <input
                            type="number"
                            value={securitySettings.passwordExpiry}
                            onChange={(e) =>
                              handleSecurityChange('passwordExpiry', e.target.value)
                            }
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Max Login Attempts
                          </label>
                          <input
                            type="number"
                            value={securitySettings.maxLoginAttempts}
                            onChange={(e) =>
                              handleSecurityChange('maxLoginAttempts', e.target.value)
                            }
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                          />
                        </div>
                        <div className="flex items-center justify-between py-3 border-t border-gray-200">
                          <div>
                            <label className="text-sm font-medium text-gray-900">
                              Two-Factor Authentication
                            </label>
                            <p className="text-xs text-gray-500">
                              Require 2FA for all users
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={securitySettings.requireTwoFactor}
                              onChange={(e) =>
                                handleSecurityChange('requireTwoFactor', e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between py-3 border-t border-gray-200">
                          <div>
                            <label className="text-sm font-medium text-gray-900">
                              Audit Logging
                            </label>
                            <p className="text-xs text-gray-500">
                              Log all system activities
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={securitySettings.enableAuditLog}
                              onChange={(e) =>
                                handleSecurityChange('enableAuditLog', e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* System Settings */}
                {activeTab === 'system' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-black mb-6">System Settings</h2>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Date Format
                            </label>
                            <select
                              value={systemSettings.dateFormat}
                              onChange={(e) => handleSystemChange('dateFormat', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                            >
                              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Time Format
                            </label>
                            <select
                              value={systemSettings.timeFormat}
                              onChange={(e) => handleSystemChange('timeFormat', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                            >
                              <option value="12h">12-hour</option>
                              <option value="24h">24-hour</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Currency
                            </label>
                            <select
                              value={systemSettings.currency}
                              onChange={(e) => handleSystemChange('currency', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                            >
                              <option value="USD">USD ($)</option>
                              <option value="EUR">EUR (€)</option>
                              <option value="GBP">GBP (£)</option>
                              <option value="CAD">CAD (C$)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Items Per Page
                            </label>
                            <select
                              value={systemSettings.itemsPerPage}
                              onChange={(e) => handleSystemChange('itemsPerPage', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                            >
                              <option value="10">10</option>
                              <option value="25">25</option>
                              <option value="50">50</option>
                              <option value="100">100</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center justify-between py-3 border-t border-gray-200">
                          <div>
                            <label className="text-sm font-medium text-gray-900">
                              Auto Backup
                            </label>
                            <p className="text-xs text-gray-500">
                              Automatically backup system data
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={systemSettings.autoBackup}
                              onChange={(e) =>
                                handleSystemChange('autoBackup', e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                          </label>
                        </div>
                        {systemSettings.autoBackup && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Backup Frequency
                            </label>
                            <select
                              value={systemSettings.backupFrequency}
                              onChange={(e) =>
                                handleSystemChange('backupFrequency', e.target.value)
                              }
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200 mt-6">
                  {saved && (
                    <div className="flex items-center space-x-2 text-green-600">
                      <Check className="w-4 h-4" />
                      <span className="text-sm">Settings saved</span>
                    </div>
                  )}
                  <button
                    onClick={handleSave}
                    className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

