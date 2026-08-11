import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  DollarSign,
  FileText,
  Inbox,
  MessageSquare,
} from 'lucide-react'
import type { AdminNotificationCategory } from '../../utils/adminNotificationGroups'

const SECTION_ICONS: Record<AdminNotificationCategory, LucideIcon> = {
  disputes: AlertCircle,
  payments: DollarSign,
  notes: MessageSquare,
  docs: FileText,
  other: Inbox,
}

/**
 * Colored icon used to identify a notification section at a glance.
 */
export function AdminNotificationSectionIcon({
  category,
  size = 'md',
}: {
  category: AdminNotificationCategory
  size?: 'sm' | 'md'
}) {
  const Icon = SECTION_ICONS[category]
  return (
    <span
      className={`admin-notif-section-icon admin-notif-section-icon--${category} admin-notif-section-icon--${size}`}
      aria-hidden
    >
      <Icon />
    </span>
  )
}
