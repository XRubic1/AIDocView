import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { Mail, Search, X, User as UserIcon, Shield, Calendar } from 'lucide-react'
import { formatDate } from '../utils/format'
import { useToast } from '../components/ui/ToastProvider'
import { useAdminCapabilities } from '../hooks/useAdminCapabilities'
import {
  ADMIN_STAFF_ROLE_DESCRIPTIONS,
  ADMIN_STAFF_ROLE_LABELS,
  ADMIN_STAFF_ROLES,
  type AdminStaffRole,
} from '../utils/adminRoles'
import {
  createAdminStaffUser,
  listAdminStaffUsers,
  updateAdminStaffUserRole,
  type AdminStaffUser,
} from '../services/adminUserService'
import Spinner from '../components/ui/Spinner'

const ROLE_BADGE_CLASS: Record<AdminStaffRole, string> = {
  super_admin: 'bg-red-100 text-red-800',
  admin: 'bg-blue-100 text-blue-800',
  reports: 'bg-emerald-100 text-emerald-800',
  billing: 'bg-amber-100 text-amber-900',
  payment_posting: 'bg-violet-100 text-violet-800',
}

type CreateForm = {
  name: string
  email: string
  password: string
  admin_role: AdminStaffRole
}

const EMPTY_FORM: CreateForm = {
  name: '',
  email: '',
  password: '',
  admin_role: 'admin',
}

export default function Users() {
  const { showToast } = useToast()
  const { capabilities } = useAdminCapabilities()
  const [searchParams, setSearchParams] = useSearchParams()
  const [users, setUsers] = useState<AdminStaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminStaffUser | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [formData, setFormData] = useState<CreateForm>(EMPTY_FORM)
  const [editRole, setEditRole] = useState<AdminStaffRole>('admin')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listAdminStaffUsers()
      setUsers(rows)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load users', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (!capabilities.canManageUsers) return
    void loadUsers()
  }, [capabilities.canManageUsers, loadUsers])

  useEffect(() => {
    if (searchParams.get('add') === '1' && capabilities.canManageUsers) {
      setShowAddModal(true)
      setFormData(EMPTY_FORM)
      searchParams.delete('add')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams, capabilities.canManageUsers])

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.admin_role.toLowerCase().includes(q) ||
        ADMIN_STAFF_ROLE_LABELS[user.admin_role].toLowerCase().includes(q)
    )
  }, [users, searchTerm])

  const handleOpenAddModal = () => {
    setFormData(EMPTY_FORM)
    setShowAddModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.email.trim() || !formData.password) {
      showToast('Name, email, and password are required', 'error')
      return
    }
    if (formData.password.length < 8) {
      showToast('Password must be at least 8 characters', 'error')
      return
    }

    setSaving(true)
    try {
      const created = await createAdminStaffUser({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        admin_role: formData.admin_role,
      })
      setUsers((prev) => [...prev, created].sort((a, b) => a.email.localeCompare(b.email)))
      setShowAddModal(false)
      setFormData(EMPTY_FORM)
      showToast(`Created ${created.email}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create user', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRole = async () => {
    if (!selectedUser) return
    setSaving(true)
    try {
      const updated = await updateAdminStaffUserRole({
        userId: selectedUser.id,
        admin_role: editRole,
      })
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      setSelectedUser(updated)
      showToast('Role updated', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update role', 'error')
    } finally {
      setSaving(false)
    }
  }

  const roleBadge = (role: AdminStaffRole) => (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASS[role]}`}
    >
      {ADMIN_STAFF_ROLE_LABELS[role]}
    </span>
  )

  return (
    <AdminLayout>
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-black mb-2">Users</h1>
          <p className="text-gray-600">
            Create backoffice users and limit what they can see by role
          </p>
        </div>

        <div className="bg-white border border-gray-200 p-4 mb-6 rounded">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
              type="button"
              onClick={handleOpenAddModal}
              className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors"
            >
              Add User
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200">
          <div className="p-6">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-black">All Users</h2>
              <p className="text-sm text-gray-600 mt-1">
                {loading
                  ? 'Loading…'
                  : `${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''}`}
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg font-medium mb-2">No users found</p>
                <p className="text-sm">Create a user or adjust your search</p>
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
                        onClick={() => {
                          setSelectedUser(user)
                          setEditRole(user.admin_role)
                        }}
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
                            className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                          >
                            <Mail className="w-3 h-3" />
                            {user.email}
                          </a>
                        </td>
                        <td className="py-3 px-4 text-sm">{roleBadge(user.admin_role)}</td>
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : 'Never'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedUser(user)
                              setEditRole(user.admin_role)
                            }}
                            className="px-3 py-1 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors"
                          >
                            Manage
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

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {ADMIN_STAFF_ROLES.map((role) => (
            <div key={role} className="border border-gray-200 rounded bg-white p-4">
              <div className="mb-2">{roleBadge(role)}</div>
              <p className="text-sm text-gray-600">{ADMIN_STAFF_ROLE_DESCRIPTIONS[role]}</p>
            </div>
          ))}
        </div>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-black">{selectedUser.name}</h2>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="text-gray-400 hover:text-black"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-600">Email</label>
                  <p className="text-sm font-medium text-gray-900 mt-1">{selectedUser.email}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-600 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Created
                  </label>
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    {formatDate(selectedUser.created_at)}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-600 flex items-center gap-1.5 mb-1">
                    <Shield className="w-3.5 h-3.5" />
                    Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as AdminStaffRole)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                  >
                    {ADMIN_STAFF_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ADMIN_STAFF_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {ADMIN_STAFF_ROLE_DESCRIPTIONS[editRole]}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={saving || editRole === selectedUser.admin_role}
                  onClick={() => void handleSaveRole()}
                  className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save role'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-black">Add New User</h2>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-black"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temporary password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={formData.password}
                    onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                    placeholder="Min. 8 characters"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Access role <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.admin_role}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        admin_role: e.target.value as AdminStaffRole,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                  >
                    {ADMIN_STAFF_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ADMIN_STAFF_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {ADMIN_STAFF_ROLE_DESCRIPTIONS[formData.admin_role]}
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 disabled:opacity-50"
                  >
                    {saving ? 'Creating…' : 'Create User'}
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
