import { useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { mockUsers } from '../data/mockUsers'
import { User, UserRole, UserStatus } from '../types/user'
import { Mail, Phone, Search, X, User as UserIcon, Shield, Calendar } from 'lucide-react'
import { formatDate } from '../utils/format'

export default function Users() {
  const [users, setUsers] = useState<User[]>(mockUsers)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: 'viewer',
    status: 'active',
    phone: '',
    department: '',
    notes: '',
  })

  const filteredUsers = users.filter((user) => {
    if (searchTerm === '') return true
    const searchLower = searchTerm.toLowerCase()
    return (
      user.name.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower) ||
      user.role.toLowerCase().includes(searchLower) ||
      user.department?.toLowerCase().includes(searchLower) ||
      user.phone?.toLowerCase().includes(searchLower)
    )
  })

  const handleUserClick = (user: User) => {
    setSelectedUser(user)
  }

  const handleCloseModal = () => {
    setSelectedUser(null)
  }

  const handleOpenAddModal = () => {
    setShowAddModal(true)
    setFormData({
      name: '',
      email: '',
      role: 'viewer',
      status: 'active',
      phone: '',
      department: '',
      notes: '',
    })
  }

  const handleCloseAddModal = () => {
    setShowAddModal(false)
    setFormData({
      name: '',
      email: '',
      role: 'viewer',
      status: 'active',
      phone: '',
      department: '',
      notes: '',
    })
  }

  const handleInputChange = (field: keyof User, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.email) {
      alert('Name and Email are required')
      return
    }

    const newUser: User = {
      id: `user-${Date.now()}`,
      name: formData.name,
      email: formData.email,
      role: (formData.role as UserRole) || 'viewer',
      status: (formData.status as UserStatus) || 'active',
      phone: formData.phone || undefined,
      department: formData.department || undefined,
      created_at: new Date().toISOString(),
      created_by: 'Admin User', // TODO: Get from current user context
      notes: formData.notes || undefined,
    }

    setUsers((prev) => [...prev, newUser])
    handleCloseAddModal()
  }

  const getRoleBadge = (role: UserRole) => {
    const roleConfig = {
      admin: { color: 'bg-red-100 text-red-800', label: 'Admin' },
      manager: { color: 'bg-blue-100 text-blue-800', label: 'Manager' },
      reviewer: { color: 'bg-green-100 text-green-800', label: 'Reviewer' },
      viewer: { color: 'bg-gray-100 text-gray-800', label: 'Viewer' },
    }
    const config = roleConfig[role]

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const getStatusBadge = (status: UserStatus) => {
    const statusConfig = {
      active: { color: 'bg-green-100 text-green-800', label: 'Active' },
      inactive: { color: 'bg-gray-100 text-gray-800', label: 'Inactive' },
      suspended: { color: 'bg-red-100 text-red-800', label: 'Suspended' },
    }
    const config = statusConfig[status]

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const getRoleDescription = (role: UserRole) => {
    const descriptions = {
      admin: 'Full system access, can manage users and settings',
      manager: 'Can manage batches, invoices, and review workflows',
      reviewer: 'Can review and approve invoices, view reports',
      viewer: 'Read-only access to view invoices and reports',
    }
    return descriptions[role]
  }

  return (
    <AdminLayout userName="Admin User" userRole="Administrator">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-black mb-2">Users</h1>
          <p className="text-gray-600">Manage backoffice users and their access permissions</p>
        </div>

        {/* Search and Actions */}
        <div className="bg-white border border-gray-200 p-4 mb-6 rounded">
          <div className="flex items-center justify-between">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search users..."
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
              Add User
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white border border-gray-200">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-black">All Users</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} found
                </p>
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg font-medium mb-2">No users found</p>
                <p className="text-sm">Try adjusting your search criteria</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Name
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Email
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Role
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Department
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Last Login
                      </th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user, index) => (
                      <tr
                        key={user.id}
                        className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${
                          index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                        }`}
                        onClick={() => handleUserClick(user)}
                      >
                        <td className="py-3 px-4 text-sm font-medium text-gray-900">
                          <div className="flex items-center space-x-2">
                            <UserIcon className="w-4 h-4 text-gray-400" />
                            <span>{user.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          <a
                            href={`mailto:${user.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                          >
                            <Mail className="w-3 h-3" />
                            <span>{user.email}</span>
                          </a>
                        </td>
                        <td className="py-3 px-4 text-sm">{getRoleBadge(user.role)}</td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {user.department || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm">{getStatusBadge(user.status)}</td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {user.last_login ? formatDate(user.last_login) : 'Never'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleUserClick(user)
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

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-black">{selectedUser.name}</h2>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-black transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4">User Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-600">Email</label>
                      <a
                        href={`mailto:${selectedUser.email}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center space-x-1 mt-1"
                      >
                        <Mail className="w-4 h-4" />
                        <span>{selectedUser.email}</span>
                      </a>
                    </div>
                    {selectedUser.phone && (
                      <div>
                        <label className="text-sm text-gray-600">Phone</label>
                        <a
                          href={`tel:${selectedUser.phone}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center space-x-1 mt-1"
                        >
                          <Phone className="w-4 h-4" />
                          <span>{selectedUser.phone}</span>
                        </a>
                      </div>
                    )}
                    <div>
                      <label className="text-sm text-gray-600">Role</label>
                      <div className="mt-1">{getRoleBadge(selectedUser.role)}</div>
                      <p className="text-xs text-gray-500 mt-1">
                        {getRoleDescription(selectedUser.role)}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Status</label>
                      <div className="mt-1">{getStatusBadge(selectedUser.status)}</div>
                    </div>
                    {selectedUser.department && (
                      <div>
                        <label className="text-sm text-gray-600">Department</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">
                          {selectedUser.department}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Account Information */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4 flex items-center space-x-2">
                    <Calendar className="w-5 h-5" />
                    <span>Account Information</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-600">Created At</label>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {formatDate(selectedUser.created_at)}
                      </p>
                    </div>
                    {selectedUser.created_by && (
                      <div>
                        <label className="text-sm text-gray-600">Created By</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">
                          {selectedUser.created_by}
                        </p>
                      </div>
                    )}
                    {selectedUser.last_login && (
                      <div>
                        <label className="text-sm text-gray-600">Last Login</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">
                          {formatDate(selectedUser.last_login)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {selectedUser.notes && (
                  <div>
                    <h3 className="text-lg font-semibold text-black mb-4">Notes</h3>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm text-gray-900">{selectedUser.notes}</p>
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
                    Edit User
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-black">Add New User</h2>
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
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email || ''}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={formData.phone || ''}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Role and Permissions */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4 flex items-center space-x-2">
                    <Shield className="w-5 h-5" />
                    <span>Role & Permissions</span>
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Role <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.role || 'viewer'}
                        onChange={(e) => handleInputChange('role', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      >
                        <option value="viewer">Viewer - Read-only access</option>
                        <option value="reviewer">Reviewer - Can review and approve invoices</option>
                        <option value="manager">Manager - Can manage batches and workflows</option>
                        <option value="admin">Admin - Full system access</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {getRoleDescription((formData.role as UserRole) || 'viewer')}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                      </label>
                      <select
                        value={formData.status || 'active'}
                        onChange={(e) => handleInputChange('status', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Additional Information */}
                <div>
                  <h3 className="text-lg font-semibold text-black mb-4">Additional Information</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Department
                      </label>
                      <input
                        type="text"
                        value={formData.department || ''}
                        onChange={(e) => handleInputChange('department', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                      <textarea
                        value={formData.notes || ''}
                        onChange={(e) => handleInputChange('notes', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                        placeholder="Additional notes about this user..."
                      />
                    </div>
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
                    Create User
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


