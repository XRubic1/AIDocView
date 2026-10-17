import { useEffect, useState } from 'react'
import {
  getAdminNotifications,
  subscribeAdminNotifications,
} from '../services/adminNotificationService'
import type { Notification } from '../types/notification'

/** Live admin notification list (bell inbox), updated across tabs. */
export function useAdminNotifications(): Notification[] {
  const [notifications, setNotifications] = useState<Notification[]>(() => getAdminNotifications())

  useEffect(() => {
    setNotifications(getAdminNotifications())
    return subscribeAdminNotifications(() => setNotifications(getAdminNotifications()))
  }, [])

  return notifications
}
