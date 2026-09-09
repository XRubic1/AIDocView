import {
  LayoutDashboard,
  Boxes,
  FileText,
  BarChart3,
  Phone,
  Calculator,
  ScrollText,
  Building2,
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
  Inbox,
  type LucideIcon,
} from 'lucide-react'
import { getInitials, getClientUserDisplayName } from './clientNav'

export type AdminNavBadgeKey =
  | 'pendingBatches'
  | 'pendingPayments'
  | 'pendingWriteOffs'
  | 'pendingBrokerRisk'
  | 'pendingBrokerSnapshot'

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

export const adminNavSections: AdminNavSection[] = [
  {
    title: 'MAIN',
    items: [
      { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
      { label: 'Batches', path: '/batches', icon: Boxes, badgeKey: 'pendingBatches' },
      { label: 'Invoices', path: '/invoices', icon: FileText, badgeKeys: ['pendingPayments', 'pendingWriteOffs'] },
      { label: 'Aging A/R', path: '/aging-ar', icon: BarChart3 },
      { label: 'Collections', path: '/collections', icon: Phone },
      { label: 'Inbox', path: '/admin/inbox', icon: Inbox },
      {
        label: 'Broker Risk',
        path: '/admin/broker-risk',
        icon: ShieldAlert,
        badgeKey: 'pendingBrokerRisk',
      },
      {
        label: 'Broker Snapshot',
        path: '/admin/broker-snapshot',
        icon: Building2,
        badgeKey: 'pendingBrokerSnapshot',
      },
      { label: 'Calendar', path: '/admin/calendar', icon: CalendarDays },
      { label: 'Assistant', path: '/admin/assistant', icon: MessageCircle },
      { label: 'Work Queue', path: '/admin/work-queue', icon: Briefcase },
      { label: 'Notifications', path: '/admin/notifications', icon: Bell },
      { label: 'Docs', path: '/docs', icon: BookOpen },
    ],
  },
  {
    title: 'OPERATIONS',
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
    title: 'DIRECTORY',
    items: [
      { label: 'Brokers', path: '/brokers', icon: Building2 },
      { label: 'Clients', path: '/clients', icon: Users },
      { label: 'Waitlist', path: '/admin/waitlist', icon: Megaphone },
      { label: 'Users', path: '/users', icon: UserCog },
    ],
  },
  {
    title: 'ACCOUNT',
    items: [{ label: 'Settings', path: '/settings', icon: Settings }],
  },
]

export { getInitials, getClientUserDisplayName as getAdminUserDisplayName }
