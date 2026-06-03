import { useState, useMemo } from 'react'
import { Header } from '../components/admin/Header'
import { getAllAuditLogs, getFilteredAuditLogs } from '../utils/auditLogger'
import { AuditLog, AuditActionType } from '../types/audit'
import { formatDate } from '../utils/format'
import { Search, Filter, Download, AlertCircle, CheckCircle, Info, AlertTriangle, XCircle, Calendar, User, Activity } from 'lucide-react'

export default function AuditDashboard() {
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [selectedAction, setSelectedAction] = useState<AuditActionType | ''>('')
  const [selectedEntityType, setSelectedEntityType] = useState<AuditLog['entity_type'] | ''>('')
  const [selectedSeverity, setSelectedSeverity] = useState<AuditLog['severity'] | ''>('')
  const [successFilter, setSuccessFilter] = useState<boolean | null>(null)
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

  const allLogs = getAllAuditLogs()

  // Get unique users, actions, and entity types for filters
  const uniqueUsers = useMemo(() => {
    const users = new Set(allLogs.map((log) => log.user_name))
    return Array.from(users).sort()
  }, [allLogs])

  const uniqueActions = useMemo(() => {
    const actions = new Set(allLogs.map((log) => log.action))
    return Array.from(actions).sort()
  }, [allLogs])

  // Filter logs
  const filteredLogs = useMemo(() => {
    return getFilteredAuditLogs({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      userId: selectedUser || undefined,
      action: selectedAction || undefined,
      entityType: selectedEntityType || undefined,
      severity: selectedSeverity || undefined,
      success: successFilter !== null ? successFilter : undefined,
      search: searchTerm || undefined,
    })
  }, [searchTerm, dateFrom, dateTo, selectedUser, selectedAction, selectedEntityType, selectedSeverity, successFilter])

  // Statistics
  const stats = useMemo(() => {
    const total = filteredLogs.length
    const bySeverity = {
      info: filteredLogs.filter((log) => log.severity === 'info').length,
      warning: filteredLogs.filter((log) => log.severity === 'warning').length,
      error: filteredLogs.filter((log) => log.severity === 'error').length,
      critical: filteredLogs.filter((log) => log.severity === 'critical').length,
    }
    const successful = filteredLogs.filter((log) => log.success).length
    const failed = filteredLogs.filter((log) => !log.success).length

    return {
      total,
      bySeverity,
      successful,
      failed,
    }
  }, [filteredLogs])

  const getSeverityIcon = (severity: AuditLog['severity']) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-4 h-4" style={{ color: '#dc2626' }} />
      case 'error':
        return <AlertCircle className="w-4 h-4" style={{ color: '#ef4444' }} />
      case 'warning':
        return <AlertTriangle className="w-4 h-4" style={{ color: '#f59e0b' }} />
      default:
        return <Info className="w-4 h-4" style={{ color: '#3b82f6' }} />
    }
  }

  const getSeverityColor = (severity: AuditLog['severity']) => {
    switch (severity) {
      case 'critical':
        return { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' }
      case 'error':
        return { bg: '#fef2f2', text: '#ef4444', border: '#fecaca' }
      case 'warning':
        return { bg: '#fffbeb', text: '#f59e0b', border: '#fde68a' }
      default:
        return { bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe' }
    }
  }

  const handleExport = () => {
    // In a real implementation, this would export the filtered logs
    const csvContent = [
      ['Timestamp', 'User', 'Role', 'Action', 'Entity Type', 'Entity Name', 'Description', 'Severity', 'Success'].join(','),
      ...filteredLogs.map((log) =>
        [
          log.timestamp,
          log.user_name,
          log.user_role,
          log.action,
          log.entity_type,
          log.entity_name || '',
          `"${log.description.replace(/"/g, '""')}"`,
          log.severity,
          log.success ? 'Yes' : 'No',
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const clearFilters = () => {
    setSearchTerm('')
    setDateFrom('')
    setDateTo('')
    setSelectedUser('')
    setSelectedAction('')
    setSelectedEntityType('')
    setSelectedSeverity('')
    setSuccessFilter(null)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
      <Header userName="Admin User" />
      
      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{ color: '#113543' }}>
              Audit Log Dashboard
            </h1>
            <p className="text-sm" style={{ color: '#819291' }}>
              Monitor and review all system activities and security events
            </p>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: '#819291' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#6b7a7a'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#819291'
            }}
          >
            <Download className="w-4 h-4" />
            <span>Export Logs</span>
          </button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg border p-4" style={{ borderColor: '#819291' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: '#819291' }}>Total Events</p>
                <p className="text-2xl font-bold" style={{ color: '#113543' }}>{stats.total}</p>
              </div>
              <Activity className="w-8 h-8" style={{ color: '#819291' }} />
            </div>
          </div>
          <div className="bg-white rounded-lg border p-4" style={{ borderColor: '#819291' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: '#819291' }}>Successful</p>
                <p className="text-2xl font-bold" style={{ color: '#2E7D32' }}>{stats.successful}</p>
              </div>
              <CheckCircle className="w-8 h-8" style={{ color: '#2E7D32' }} />
            </div>
          </div>
          <div className="bg-white rounded-lg border p-4" style={{ borderColor: '#819291' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: '#819291' }}>Failed</p>
                <p className="text-2xl font-bold" style={{ color: '#dc2626' }}>{stats.failed}</p>
              </div>
              <XCircle className="w-8 h-8" style={{ color: '#dc2626' }} />
            </div>
          </div>
          <div className="bg-white rounded-lg border p-4" style={{ borderColor: '#819291' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: '#819291' }}>Warnings</p>
                <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{stats.bySeverity.warning}</p>
              </div>
              <AlertTriangle className="w-8 h-8" style={{ color: '#f59e0b' }} />
            </div>
          </div>
          <div className="bg-white rounded-lg border p-4" style={{ borderColor: '#819291' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: '#819291' }}>Errors</p>
                <p className="text-2xl font-bold" style={{ color: '#ef4444' }}>{stats.bySeverity.error + stats.bySeverity.critical}</p>
              </div>
              <AlertCircle className="w-8 h-8" style={{ color: '#ef4444' }} />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border p-4 mb-6" style={{ borderColor: '#819291' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4" style={{ color: '#819291' }} />
              <h3 className="text-sm font-semibold" style={{ color: '#113543' }}>Filters</h3>
            </div>
            <button
              onClick={clearFilters}
              className="text-xs font-medium transition-colors"
              style={{ color: '#819291' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#113543'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#819291'
              }}
            >
              Clear All
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#113543' }}>
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 w-4 h-4" style={{ color: '#819291' }} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search logs..."
                  className="w-full pl-8 pr-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                  style={{
                    borderColor: '#819291',
                    color: '#113543',
                    backgroundColor: '#FFFFFF',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#C2A558'
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#819291'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#113543' }}>
                Date From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: '#819291',
                  color: '#113543',
                  backgroundColor: '#FFFFFF',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C2A558'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#819291'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#113543' }}>
                Date To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: '#819291',
                  color: '#113543',
                  backgroundColor: '#FFFFFF',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C2A558'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#819291'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* User */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#113543' }}>
                User
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: '#819291',
                  color: '#113543',
                  backgroundColor: '#FFFFFF',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C2A558'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#819291'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <option value="">All Users</option>
                {uniqueUsers.map((user) => (
                  <option key={user} value={user}>
                    {user}
                  </option>
                ))}
              </select>
            </div>

            {/* Action */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#113543' }}>
                Action
              </label>
              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value as AuditActionType | '')}
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: '#819291',
                  color: '#113543',
                  backgroundColor: '#FFFFFF',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C2A558'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#819291'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <option value="">All Actions</option>
                {uniqueActions.map((action) => (
                  <option key={action} value={action}>
                    {action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>

            {/* Entity Type */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#113543' }}>
                Entity Type
              </label>
              <select
                value={selectedEntityType}
                onChange={(e) => setSelectedEntityType(e.target.value as AuditLog['entity_type'] | '')}
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: '#819291',
                  color: '#113543',
                  backgroundColor: '#FFFFFF',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C2A558'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#819291'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <option value="">All Types</option>
                <option value="batch">Batch</option>
                <option value="invoice">Invoice</option>
                <option value="client">Client</option>
                <option value="broker">Broker</option>
                <option value="user">User</option>
                <option value="document">Document</option>
                <option value="system">System</option>
                <option value="collection">Collection</option>
                <option value="report">Report</option>
                <option value="settings">Settings</option>
              </select>
            </div>

            {/* Severity */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#113543' }}>
                Severity
              </label>
              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value as AuditLog['severity'] | '')}
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: '#819291',
                  color: '#113543',
                  backgroundColor: '#FFFFFF',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C2A558'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#819291'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <option value="">All Severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Success */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#113543' }}>
                Status
              </label>
              <select
                value={successFilter === null ? '' : successFilter ? 'success' : 'failed'}
                onChange={(e) => {
                  if (e.target.value === '') setSuccessFilter(null)
                  else setSuccessFilter(e.target.value === 'success')
                }}
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: '#819291',
                  color: '#113543',
                  backgroundColor: '#FFFFFF',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C2A558'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(194, 165, 88, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#819291'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <option value="">All Status</option>
                <option value="success">Successful</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Audit Logs Table */}
        <div className="bg-white rounded-lg border" style={{ borderColor: '#819291' }}>
          <div className="p-4 border-b" style={{ borderColor: '#819291' }}>
            <h2 className="text-lg font-semibold" style={{ color: '#113543' }}>
              Audit Logs ({filteredLogs.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#F5F5F5' }}>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Entity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Description
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Severity
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: '#819291' }}>
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: '#819291' }}>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: '#819291' }}>
                      No audit logs found matching the selected filters
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const severityColors = getSeverityColor(log.severity)
                    return (
                      <>
                        <tr
                          key={log.id}
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-xs" style={{ color: '#113543' }}>
                              {formatDate(log.timestamp)}
                            </div>
                            <div className="text-xs" style={{ color: '#819291' }}>
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm font-medium" style={{ color: '#113543' }}>
                              {log.user_name}
                            </div>
                            <div className="text-xs" style={{ color: '#819291' }}>
                              {log.user_role}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm" style={{ color: '#113543' }}>
                              {log.action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm" style={{ color: '#113543' }}>
                              {log.entity_type}
                            </div>
                            {log.entity_name && (
                              <div className="text-xs" style={{ color: '#819291' }}>
                                {log.entity_name}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm max-w-md truncate" style={{ color: '#113543' }}>
                              {log.description}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center">
                              {getSeverityIcon(log.severity)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {log.success ? (
                              <CheckCircle className="w-4 h-4 mx-auto" style={{ color: '#2E7D32' }} />
                            ) : (
                              <XCircle className="w-4 h-4 mx-auto" style={{ color: '#dc2626' }} />
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              className="text-xs font-medium transition-colors"
                              style={{ color: '#819291' }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#113543'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#819291'
                              }}
                            >
                              {expandedLogId === log.id ? 'Hide' : 'Show'}
                            </button>
                          </td>
                        </tr>
                        {expandedLogId === log.id && (
                          <tr>
                            <td colSpan={8} className="px-4 py-4" style={{ backgroundColor: '#F9FAFB' }}>
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="font-medium" style={{ color: '#819291' }}>Log ID:</span>
                                    <span className="ml-2" style={{ color: '#113543' }}>{log.id}</span>
                                  </div>
                                  {log.ip_address && (
                                    <div>
                                      <span className="font-medium" style={{ color: '#819291' }}>IP Address:</span>
                                      <span className="ml-2" style={{ color: '#113543' }}>{log.ip_address}</span>
                                    </div>
                                  )}
                                  {log.user_agent && (
                                    <div className="col-span-2">
                                      <span className="font-medium" style={{ color: '#819291' }}>User Agent:</span>
                                      <span className="ml-2 text-xs" style={{ color: '#113543' }}>{log.user_agent}</span>
                                    </div>
                                  )}
                                </div>
                                {log.changes && log.changes.length > 0 && (
                                  <div>
                                    <div className="font-medium mb-2 text-sm" style={{ color: '#113543' }}>Changes:</div>
                                    <div className="space-y-1">
                                      {log.changes.map((change, idx) => (
                                        <div key={idx} className="text-xs p-2 rounded" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291', border: '1px solid' }}>
                                          <span className="font-medium" style={{ color: '#113543' }}>{change.field}:</span>
                                          <span className="ml-2" style={{ color: '#dc2626' }}>
                                            {typeof change.old_value === 'object' ? JSON.stringify(change.old_value) : String(change.old_value)}
                                          </span>
                                          <span className="mx-2" style={{ color: '#819291' }}>→</span>
                                          <span style={{ color: '#2E7D32' }}>
                                            {typeof change.new_value === 'object' ? JSON.stringify(change.new_value) : String(change.new_value)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                  <div>
                                    <div className="font-medium mb-2 text-sm" style={{ color: '#113543' }}>Metadata:</div>
                                    <div className="text-xs p-2 rounded" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291', border: '1px solid' }}>
                                      <pre style={{ color: '#113543', whiteSpace: 'pre-wrap' }}>
                                        {JSON.stringify(log.metadata, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}

