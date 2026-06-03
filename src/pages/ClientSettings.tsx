import { useState } from 'react'
import { mockClientDashboardData } from '../data/mockClientDashboard'
import { mockClients } from '../data/mockClients'
import {
  User,
  Bell,
  Eye,
  Lock,
  Building2,
  CreditCard,
  Save,
  Check,
} from 'lucide-react'
import ClientHeader from '../components/ClientHeader'

type SettingsTab = 'profile' | 'notifications' | 'preferences' | 'security' | 'remittance'

export default function ClientSettings() {
  const [data] = useState(mockClientDashboardData)

  // Get current client data
  const currentClient = mockClients.find((c) => c.id === data.client_id) || mockClients[0]

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [saved, setSaved] = useState(false)

  // Profile Settings
  const [profileData, setProfileData] = useState({
    company_name: currentClient.name || data.client_name,
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

  // Notification Settings
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    invoiceApproved: true,
    invoiceOnHold: true,
    paymentReceived: true,
    batchSubmitted: true,
    overdueAlerts: true,
    weeklySummary: false,
    dailyDigest: false,
  })

  // Display Preferences
  const [preferences, setPreferences] = useState({
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    currency: 'USD',
    itemsPerPage: '25',
    defaultView: 'dashboard',
  })

  // Security Settings
  const [securitySettings, setSecuritySettings] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false,
    sessionTimeout: '30',
  })

  // Remittance Information
  const [remittanceData, setRemittanceData] = useState({
    remittance_info: currentClient.remittance_info || '',
    bank_name: currentClient.bank_name || '',
    account_number: currentClient.account_number || '',
    routing_number: currentClient.routing_number || '',
  })

  const navItems = [
    { label: 'Dashboard', path: '/client/dashboard' },
    { label: 'Batches', path: '/client/batches' },
    { label: 'Invoices', path: '/client/invoices' },
    { label: 'Payments', path: '/client/payments' },
    { label: 'Collections', path: '/client/collections' },
    { label: 'Reports', path: '/client/reports' },
    { label: 'Settings', path: '/client/settings' },
  ]

  const tabs = [
    { id: 'profile' as SettingsTab, label: 'Profile', icon: User },
    { id: 'notifications' as SettingsTab, label: 'Notifications', icon: Bell },
    { id: 'preferences' as SettingsTab, label: 'Preferences', icon: Eye },
    { id: 'security' as SettingsTab, label: 'Security', icon: Lock },
    { id: 'remittance' as SettingsTab, label: 'Remittance', icon: CreditCard },
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

  const handlePreferenceChange = (field: string, value: string) => {
    setPreferences((prev) => ({ ...prev, [field]: value }))
  }

  const handleSecurityChange = (field: string, value: string | boolean) => {
    setSecuritySettings((prev) => ({ ...prev, [field]: value }))
  }

  const handleRemittanceChange = (field: string, value: string) => {
    setRemittanceData((prev) => ({ ...prev, [field]: value }))
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
    // TODO: Implement password change logic
    alert('Password changed successfully')
    setSecuritySettings((prev) => ({
      ...prev,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    }))
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      <ClientHeader clientName={data.client_name} navItems={navItems} />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#113543' }}>
            Settings
          </h2>
          <p style={{ color: '#819291' }}>Manage your account settings and preferences</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Tabs */}
          <div className="lg:w-64 flex-shrink-0">
            <div className="bg-white border rounded" style={{ borderColor: '#819291' }}>
              <div className="p-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className="w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium rounded transition-colors mb-1"
                      style={{
                        backgroundColor: activeTab === tab.id ? '#f8f9fa' : 'transparent',
                        color: activeTab === tab.id ? '#113543' : '#819291',
                      }}
                      onMouseEnter={(e) => {
                        if (activeTab !== tab.id) {
                          e.currentTarget.style.backgroundColor = '#f8f9fa'
                          e.currentTarget.style.color = '#113543'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (activeTab !== tab.id) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.color = '#819291'
                        }
                      }}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <div className="bg-white border rounded" style={{ borderColor: '#819291' }}>
              <div className="p-6">
                {/* Profile Tab */}
                {activeTab === 'profile' && (
                  <div>
                    <div className="flex items-center space-x-2 mb-6">
                      <Building2 className="w-5 h-5" style={{ color: '#C2A558' }} />
                      <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                        Company Profile
                      </h3>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            Company Name
                          </label>
                          <input
                            type="text"
                            value={profileData.company_name}
                            onChange={(e) => handleProfileChange('company_name', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            Contact Person
                          </label>
                          <input
                            type="text"
                            value={profileData.contact_person}
                            onChange={(e) => handleProfileChange('contact_person', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            Email
                          </label>
                          <input
                            type="email"
                            value={profileData.email}
                            onChange={(e) => handleProfileChange('email', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            Phone
                          </label>
                          <input
                            type="tel"
                            value={profileData.phone}
                            onChange={(e) => handleProfileChange('phone', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            Fax
                          </label>
                          <input
                            type="tel"
                            value={profileData.fax}
                            onChange={(e) => handleProfileChange('fax', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            Address
                          </label>
                          <input
                            type="text"
                            value={profileData.address}
                            onChange={(e) => handleProfileChange('address', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            City
                          </label>
                          <input
                            type="text"
                            value={profileData.city}
                            onChange={(e) => handleProfileChange('city', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            State
                          </label>
                          <input
                            type="text"
                            value={profileData.state}
                            onChange={(e) => handleProfileChange('state', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            ZIP Code
                          </label>
                          <input
                            type="text"
                            value={profileData.zip}
                            onChange={(e) => handleProfileChange('zip', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            MC Number
                          </label>
                          <input
                            type="text"
                            value={profileData.mc_number}
                            onChange={(e) => handleProfileChange('mc_number', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            DOT Number
                          </label>
                          <input
                            type="text"
                            value={profileData.dot_number}
                            onChange={(e) => handleProfileChange('dot_number', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notifications Tab */}
                {activeTab === 'notifications' && (
                  <div>
                    <div className="flex items-center space-x-2 mb-6">
                      <Bell className="w-5 h-5" style={{ color: '#C2A558' }} />
                      <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                        Notification Preferences
                      </h3>
                    </div>

                    <div className="space-y-4">
                      {Object.entries(notificationSettings).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between py-3 border-b" style={{ borderColor: '#819291' }}>
                          <div>
                            <label className="text-sm font-medium" style={{ color: '#113543' }}>
                              {key
                                .replace(/([A-Z])/g, ' $1')
                                .replace(/^./, (str) => str.toUpperCase())
                                .trim()}
                            </label>
                            <p className="text-xs mt-1" style={{ color: '#819291' }}>
                              {key === 'emailNotifications'
                                ? 'Receive all email notifications'
                                : key === 'invoiceApproved'
                                ? 'Get notified when invoices are approved'
                                : key === 'invoiceOnHold'
                                ? 'Get notified when invoices are placed on hold'
                                : key === 'paymentReceived'
                                ? 'Get notified when payments are received'
                                : key === 'batchSubmitted'
                                ? 'Get notified when batches are submitted'
                                : key === 'overdueAlerts'
                                ? 'Get alerts for overdue invoices'
                                : key === 'weeklySummary'
                                ? 'Receive weekly summary reports'
                                : 'Receive daily digest emails'}
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={value}
                              onChange={(e) => handleNotificationChange(key, e.target.checked)}
                              className="sr-only peer"
                            />
                            <div
                              className="w-11 h-6 rounded-full transition-colors peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                              style={{
                                backgroundColor: value ? '#C2A558' : '#819291',
                              }}
                            ></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preferences Tab */}
                {activeTab === 'preferences' && (
                  <div>
                    <div className="flex items-center space-x-2 mb-6">
                      <Eye className="w-5 h-5" style={{ color: '#C2A558' }} />
                      <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                        Display Preferences
                      </h3>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                          Date Format
                        </label>
                        <select
                          value={preferences.dateFormat}
                          onChange={(e) => handlePreferenceChange('dateFormat', e.target.value)}
                          className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#819291'
                          }}
                        >
                          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                          Time Format
                        </label>
                        <select
                          value={preferences.timeFormat}
                          onChange={(e) => handlePreferenceChange('timeFormat', e.target.value)}
                          className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#819291'
                          }}
                        >
                          <option value="12h">12-hour</option>
                          <option value="24h">24-hour</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                          Currency
                        </label>
                        <select
                          value={preferences.currency}
                          onChange={(e) => handlePreferenceChange('currency', e.target.value)}
                          className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#819291'
                          }}
                        >
                          <option value="USD">USD ($)</option>
                          <option value="EUR">EUR (€)</option>
                          <option value="GBP">GBP (£)</option>
                          <option value="CAD">CAD (C$)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                          Items Per Page
                        </label>
                        <select
                          value={preferences.itemsPerPage}
                          onChange={(e) => handlePreferenceChange('itemsPerPage', e.target.value)}
                          className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#819291'
                          }}
                        >
                          <option value="10">10</option>
                          <option value="25">25</option>
                          <option value="50">50</option>
                          <option value="100">100</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Security Tab */}
                {activeTab === 'security' && (
                  <div>
                    <div className="flex items-center space-x-2 mb-6">
                      <Lock className="w-5 h-5" style={{ color: '#C2A558' }} />
                      <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                        Security Settings
                      </h3>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                          Current Password
                        </label>
                        <input
                          type="password"
                          value={securitySettings.currentPassword}
                          onChange={(e) => handleSecurityChange('currentPassword', e.target.value)}
                          className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#819291'
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                          New Password
                        </label>
                        <input
                          type="password"
                          value={securitySettings.newPassword}
                          onChange={(e) => handleSecurityChange('newPassword', e.target.value)}
                          className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#819291'
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          value={securitySettings.confirmPassword}
                          onChange={(e) => handleSecurityChange('confirmPassword', e.target.value)}
                          className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#819291'
                          }}
                        />
                      </div>
                      <button
                        onClick={handlePasswordChange}
                        className="px-4 py-2 text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: '#113543',
                          color: '#FFFFFF',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#0d2a35'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#113543'
                        }}
                      >
                        Change Password
                      </button>
                      <div className="pt-4 border-t" style={{ borderColor: '#819291' }}>
                        <div className="flex items-center justify-between py-3">
                          <div>
                            <label className="text-sm font-medium" style={{ color: '#113543' }}>
                              Two-Factor Authentication
                            </label>
                            <p className="text-xs mt-1" style={{ color: '#819291' }}>
                              Add an extra layer of security to your account
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={securitySettings.twoFactorEnabled}
                              onChange={(e) => handleSecurityChange('twoFactorEnabled', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div
                              className="w-11 h-6 rounded-full transition-colors peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                              style={{
                                backgroundColor: securitySettings.twoFactorEnabled ? '#C2A558' : '#819291',
                              }}
                            ></div>
                          </label>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2 mt-4" style={{ color: '#819291' }}>
                            Session Timeout (minutes)
                          </label>
                          <input
                            type="number"
                            value={securitySettings.sessionTimeout}
                            onChange={(e) => handleSecurityChange('sessionTimeout', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Remittance Tab */}
                {activeTab === 'remittance' && (
                  <div>
                    <div className="flex items-center space-x-2 mb-6">
                      <CreditCard className="w-5 h-5" style={{ color: '#C2A558' }} />
                      <h3 className="text-lg font-semibold" style={{ color: '#113543' }}>
                        Remittance Information
                      </h3>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                          Remittance Instructions
                        </label>
                        <textarea
                          value={remittanceData.remittance_info}
                          onChange={(e) => handleRemittanceChange('remittance_info', e.target.value)}
                          rows={4}
                          className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#819291'
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                          Bank Name
                        </label>
                        <input
                          type="text"
                          value={remittanceData.bank_name}
                          onChange={(e) => handleRemittanceChange('bank_name', e.target.value)}
                          className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                          style={{
                            borderColor: '#819291',
                            color: '#113543',
                            backgroundColor: '#FFFFFF',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#C2A558'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#819291'
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            Account Number
                          </label>
                          <input
                            type="text"
                            value={remittanceData.account_number}
                            onChange={(e) => handleRemittanceChange('account_number', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: '#819291' }}>
                            Routing Number
                          </label>
                          <input
                            type="text"
                            value={remittanceData.routing_number}
                            onChange={(e) => handleRemittanceChange('routing_number', e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:outline-none"
                            style={{
                              borderColor: '#819291',
                              color: '#113543',
                              backgroundColor: '#FFFFFF',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#C2A558'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#819291'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <div className="mt-8 pt-6 border-t flex justify-end" style={{ borderColor: '#819291' }}>
                  <button
                    onClick={handleSave}
                    className="flex items-center space-x-2 px-6 py-2 text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: '#113543',
                      color: '#FFFFFF',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#0d2a35'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#113543'
                    }}
                  >
                    {saved ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Saved!</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Save Changes</span>
                      </>
                    )}
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

