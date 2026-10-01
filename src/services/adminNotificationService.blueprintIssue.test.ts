import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  getSupabase: () => null,
}))

import {
  getAdminNotifications,
  notifyAdminBlueprintIssue,
  resolveAdminBlueprintIssue,
} from './adminNotificationService'

describe('blueprint issue alerts', () => {
  it('keeps one bell item and clears it when the email is available', () => {
    const input = {
      invoiceId: 'inv-issue-1',
      invoiceNumber: '013',
      code: 'no-broker-email' as const,
      title: 'Blueprint needs a broker email',
      message: 'Invoice 013. No broker email on file for ECOGISTICS.',
      blueprintName: 'Sending Docs On Process',
      brokerName: 'ECOGISTICS',
    }
    const first = notifyAdminBlueprintIssue(input)
    const second = notifyAdminBlueprintIssue({ ...input, message: 'retry' })
    expect(second.id).toBe(first.id)
    expect(second.message).toBe(first.message)
    expect(getAdminNotifications().filter((n) => n.id === first.id)).toHaveLength(1)
    expect(first.link).toBe('/invoices?invoice=inv-issue-1')
    expect(first.link_label).toBe('Open invoice')
    resolveAdminBlueprintIssue('inv-issue-1', 'no-broker-email')
    expect(getAdminNotifications().find((n) => n.id === first.id)?.read).toBe(true)
  })
})
