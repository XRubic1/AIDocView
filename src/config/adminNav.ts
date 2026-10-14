import {
  LayoutDashboard,
  Boxes,
  FileText,
  BarChart3,
  Phone,
  Calculator,
  ScrollText,
  Contact,
  Users,
  UserCog,
  Settings,
  Wallet,
  Receipt,
  BookOpen,
  CalendarDays,
  MessageCircle,
  Megaphone,
  Bell,
  Briefcase,
  ShieldAlert,
  ScanSearch,
  GitBranch,
  Inbox,
  Target,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react'
import { getInitials, getClientUserDisplayName } from './clientNav'

export type AdminNavBadgeKey =
  | 'pendingBatches'
  | 'pendingPayments'
  | 'pendingWriteOffs'
  | 'pendingBrokerRisk'
  | 'pendingBrokerSnapshot'
  | 'pendingNewBrokers'

export interface AdminNavItem {
  label: string
  path: string
  icon: LucideIcon
  badgeKey?: AdminNavBadgeKey
  /** When set, badge shows the sum of all listed keys. */
  badgeKeys?: AdminNavBadgeKey[]
}

export interface AdminNavSection {
  title: string
  items: AdminNavItem[]
}

/**
 * Admin sidebar — grouped by daily work, not a flat dump.
 * TODAY → A/R → BROKERS → FINANCE → PEOPLE → SYSTEM
 */
export const adminNavSections: AdminNavSection[] = [
  {
    title: 'TODAY',
    items: [
      { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
      { label: 'Work Queue', path: '/admin/work-queue', icon: Briefcase },
      { label: 'Inbox', path: '/admin/inbox', icon: Inbox },
      { label: 'Calendar', path: '/admin/calendar', icon: CalendarDays },
      { label: 'Notifications', path: '/admin/notifications', icon: Bell },
    ],
  },
  {
    title: 'A/R',
    items: [
      { label: 'Batches', path: '/batches', icon: Boxes, badgeKey: 'pendingBatches' },
      {
        label: 'Invoices',
        path: '/invoices',
        icon: FileText,
        badgeKeys: ['pendingPayments', 'pendingWriteOffs'],
      },
      { label: 'Aging A/R', path: '/aging-ar', icon: BarChart3 },
      { label: 'Collections', path: '/collections', icon: Phone },
    ],
  },
  {
    title: 'BROKERS',
    items: [
      {
        label: 'Broker Risk',
        path: '/admin/broker-risk',
        icon: ShieldAlert,
        badgeKey: 'pendingBrokerRisk',
      },
      {
        label: 'Blueprints',
        path: '/admin/blueprints',
        icon: GitBranch,
      },
      {
        label: 'Broker Snapshot',
        path: '/admin/broker-snapshot',
        icon: ScanSearch,
        badgeKey: 'pendingBrokerSnapshot',
      },
      {
        label: 'Brokers',
        path: '/brokers',
        icon: Contact,
        badgeKey: 'pendingNewBrokers',
      },
    ],
  },
  {
    title: 'FINANCE',
    items: [
      { label: 'Accounting', path: '/accounting', icon: Calculator },
      {
        label: 'Payment Posting',
        path: '/payment-posting',
        icon: Wallet,
        badgeKeys: ['pendingPayments', 'pendingWriteOffs'],
      },
      { label: 'Billing', path: '/billing', icon: Receipt },
      { label: 'Audit Logs', path: '/Audit/dashboard', icon: ScrollText },
    ],
  },
  {
    title: 'PEOPLE',
    items: [
      { label: 'Clients', path: '/clients', icon: Users },
      { label: 'Sales', path: '/admin/sales', icon: Target },
      { label: 'Waitlist', path: '/admin/waitlist', icon: Megaphone },
      { label: 'MC Checks', path: '/admin/mc-checks', icon: BadgeCheck },
      { label: 'Users', path: '/users', icon: UserCog },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { label: 'Assistant', path: '/admin/assistant', icon: MessageCircle },
      { label: 'Docs', path: '/docs', icon: BookOpen },
      { label: 'Settings', path: '/settings', icon: Settings },
    ],
  },
]

export { getInitials, getClientUserDisplayName as getAdminUserDisplayName }
