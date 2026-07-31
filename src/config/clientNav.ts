import type { ClientCapabilities } from '../utils/clientCapabilities'
import {
  LayoutDashboard,
  Boxes,
  FileText,
  FolderOpen,
  Upload,
  BarChart3,
  CreditCard,
  Scale,
  ClipboardList,
  Building2,
  MessageCircle,
  Settings,
  HelpCircle,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react'

export interface ClientNavItem {
  label: string
  path: string
  icon: LucideIcon
  badgeKey?: 'pendingBatches' | 'heldInvoices'
  /** Danger badges (e.g. held invoices) render in red. */
  badgeTone?: 'default' | 'danger'
  /** When set, item is hidden unless this returns true. */
  showWhen?: (capabilities: ClientCapabilities) => boolean
}

export interface ClientNavSection {
  title: string
  items: ClientNavItem[]
}

export const clientNavSections: ClientNavSection[] = [
  {
    title: '',
    items: [
      { label: 'Dashboard', path: '/client/dashboard', icon: LayoutDashboard },
      { label: 'Batches', path: '/client/batches', icon: Boxes, badgeKey: 'pendingBatches' },
      {
        label: 'Invoices',
        path: '/client/invoices',
        icon: FileText,
        badgeKey: 'heldInvoices',
        badgeTone: 'danger',
      },
      { label: 'Document Vault', path: '/client/documents', icon: FolderOpen },
      {
        label: 'Submit docs',
        path: '/client/batches?tab=create',
        icon: Upload,
        showWhen: (c) => c.canSubmitDocHandoff,
      },
    ],
  },
  {
    title: 'FINANCE',
    items: [
      { label: 'Aging A/R', path: '/client/collections', icon: BarChart3 },
      { label: 'Brokers', path: '/client/brokers', icon: Building2 },
      { label: 'Assistant', path: '/client/assistant', icon: MessageCircle },
      { label: 'Payments', path: '/client/payments', icon: CreditCard },
      { label: 'Pay variances', path: '/client/short-payments', icon: Scale },
      { label: 'Reports', path: '/client/reports', icon: ClipboardList },
    ],
  },
  {
    title: 'ACCOUNT',
    items: [
      { label: 'Tutorials', path: '/client/tutorials', icon: GraduationCap },
      { label: 'Settings', path: '/client/settings', icon: Settings },
      { label: 'Support', path: 'mailto:support@credyx.com', icon: HelpCircle },
    ],
  },
]

/** Filter nav sections by client tier capabilities. */
export function filterClientNavSections(
  capabilities: ClientCapabilities
): ClientNavSection[] {
  return clientNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.showWhen || item.showWhen(capabilities)),
    }))
    .filter((section) => section.items.length > 0)
}

/** Derive two-letter initials from a display name or email. */
export function getInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '??'

  if (trimmed.includes('@')) {
    const local = trimmed.split('@')[0]
    const parts = local.split(/[._-]/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return local.slice(0, 2).toUpperCase()
  }

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return trimmed.slice(0, 2).toUpperCase()
}

/** Resolve a friendly display name from stored login email. */
export function getClientUserDisplayName(email: string | null): string {
  if (!email) return 'James Doe'
  const local = email.split('@')[0]
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) {
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
  }
  return local.charAt(0).toUpperCase() + local.slice(1)
}
