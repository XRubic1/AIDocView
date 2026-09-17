import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  ADMIN_EDIT_PERMISSIONS,
  listAdminViewPermissions,
  type AdminEditPermissionKey,
  type AdminViewPermission,
} from '../../config/adminPermissionCatalog'
import type { AdminCustomRole } from '../../types/adminCustomRole'
import {
  createAdminCustomRole,
  deleteAdminCustomRole,
  updateAdminCustomRole,
} from '../../services/adminCustomRoleService'
import { useAdminCustomRoles } from '../../hooks/useAdminCustomRoles'
import { useToast } from '../ui/ToastProvider'

type RoleFormState = {
  name: string
  description: string
  viewPaths: string[]
  editPermissions: AdminEditPermissionKey[]
}

const EMPTY_FORM: RoleFormState = {
  name: '',
  description: '',
  viewPaths: ['/admin/dashboard', '/admin/notifications'],
  editPermissions: [],
}

type AdminCustomRolesPanelProps = {
  /** Role ids currently assigned to users — blocks delete when in use. */
  assignedRoleIds?: string[]
}

/** Super-admin UI to create/edit custom roles (what pages + edit actions). */
export default function AdminCustomRolesPanel({
  assignedRoleIds = [],
}: AdminCustomRolesPanelProps) {
  const { showToast } = useToast()
  const roles = useAdminCustomRoles()
  const viewCatalog = useMemo(() => listAdminViewPermissions(), [])
  const sections = useMemo(() => {
    const map = new Map<string, AdminViewPermission[]>()
    for (const row of viewCatalog) {
      const list = map.get(row.section) ?? []
      list.push(row)
      map.set(row.section, list)
    }
    return [...map.entries()] as Array<[string, AdminViewPermission[]]>
  }, [viewCatalog])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RoleFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setEditorOpen(true)
  }

  const openEdit = (role: AdminCustomRole) => {
    setEditingId(role.id)
    setForm({
      name: role.name,
      description: role.description,
      viewPaths: [...role.viewPaths],
      editPermissions: [...role.editPermissions],
    })
    setEditorOpen(true)
  }

  const toggleView = (path: string) => {
    setForm((prev) => ({
      ...prev,
      viewPaths: prev.viewPaths.includes(path)
        ? prev.viewPaths.filter((p) => p !== path)
        : [...prev.viewPaths, path],
    }))
  }

  const toggleEdit = (key: AdminEditPermissionKey) => {
    setForm((prev) => ({
      ...prev,
      editPermissions: prev.editPermissions.includes(key)
        ? prev.editPermissions.filter((k) => k !== key)
        : [...prev.editPermissions, key],
    }))
  }

  const toggleSection = (sectionPaths: string[], checked: boolean) => {
    setForm((prev) => {
      const without = prev.viewPaths.filter((p) => !sectionPaths.includes(p))
      return {
        ...prev,
        viewPaths: checked ? [...without, ...sectionPaths] : without,
      }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editingId) {
        await updateAdminCustomRole(editingId, form)
        showToast('Role updated', 'success')
      } else {
        await createAdminCustomRole(form)
        showToast('Role created', 'success')
      }
      setEditorOpen(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save role', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (role: AdminCustomRole) => {
    if (assignedRoleIds.includes(role.id)) {
      showToast('Reassign users off this role before deleting it', 'error')
      return
    }
    if (!window.confirm(`Delete role “${role.name}”?`)) return
    setSaving(true)
    try {
      await deleteAdminCustomRole(role.id)
      showToast('Role deleted', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete role', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-black">Custom roles</h2>
          <p className="text-sm text-gray-600 mt-1">
            Create roles and choose which pages they can open and which actions they can take.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800"
        >
          <Plus className="w-4 h-4" />
          New role
        </button>
      </div>

      {roles.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded bg-white px-4 py-10 text-center text-sm text-gray-500">
          No custom roles yet. Built-in roles still work — add a custom role when you need a
          different mix of access.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {roles.map((role) => (
            <div key={role.id} className="border border-gray-200 rounded bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{role.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {role.description || 'No description'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(role)}
                    className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                    aria-label={`Edit ${role.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(role)}
                    className="p-1.5 rounded border border-gray-200 text-red-600 hover:bg-red-50"
                    aria-label={`Delete ${role.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-3">
                {role.viewPaths.length} page{role.viewPaths.length === 1 ? '' : 's'}
                {role.editPermissions.length > 0
                  ? ` · ${role.editPermissions.length} edit permission${
                      role.editPermissions.length === 1 ? '' : 's'
                    }`
                  : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {editorOpen ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="shrink-0 px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-black">
                {editingId ? 'Edit role' : 'New custom role'}
              </h3>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="text-gray-400 hover:text-black"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                  placeholder="e.g. Collections specialist"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded resize-y"
                  placeholder="What this role is for"
                />
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-1">Pages they can see</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Checked pages appear in the sidebar and can be opened.
                </p>
                <div className="space-y-3">
                  {sections.map(([section, items]) => {
                    const paths = items.map((i) => i.path)
                    const selectedCount = paths.filter((p) => form.viewPaths.includes(p)).length
                    const allChecked = selectedCount === paths.length
                    return (
                      <div key={section} className="border border-gray-200 rounded">
                        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                          <span className="text-[11px] font-semibold tracking-wide text-gray-600">
                            {section}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleSection(paths, !allChecked)}
                            className="text-[11px] font-medium text-blue-700 hover:underline"
                          >
                            {allChecked ? 'Clear' : 'Select all'}
                          </button>
                        </div>
                        <ul className="divide-y divide-gray-100">
                          {items.map((item) => (
                            <li key={item.path}>
                              <label className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-800 cursor-pointer hover:bg-gray-50">
                                <input
                                  type="checkbox"
                                  checked={form.viewPaths.includes(item.path)}
                                  onChange={() => toggleView(item.path)}
                                  className="rounded border-gray-300"
                                />
                                <span>{item.label}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-1">What they can edit</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Extra actions beyond opening a page. Leave unchecked for view-only style access.
                </p>
                <ul className="border border-gray-200 rounded divide-y divide-gray-100">
                  {ADMIN_EDIT_PERMISSIONS.map((perm) => (
                    <li key={perm.key}>
                      <label className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={form.editPermissions.includes(perm.key)}
                          onChange={() => toggleEdit(perm.key)}
                          className="mt-0.5 rounded border-gray-300"
                        />
                        <span>
                          <span className="block text-sm font-medium text-gray-900">
                            {perm.label}
                          </span>
                          <span className="block text-xs text-gray-500 mt-0.5">
                            {perm.description}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !form.name.trim() || form.viewPaths.length === 0}
                onClick={() => void handleSave()}
                className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : editingId ? 'Save role' : 'Create role'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
