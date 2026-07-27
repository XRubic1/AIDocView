/** Invoice action plan + calendar event types (Phase 0). */

import type { BrokerRiskConfidence } from './brokerRisk'

export type InvoiceActionPlanStatus = 'active' | 'closed' | 'superseded'

export type InvoiceCalendarEventType =
  | 'paperwork_check'
  | 'payment_status_check'
  | 'reminder'
  | 'expected_payment'
  | 'escalate'
  | 'call'

export type InvoiceCalendarEventOwner = 'system' | 'user' | 'credyx_staff'
export type InvoiceCalendarEventStatus = 'pending' | 'done' | 'snoozed' | 'obsolete'

export type InvoiceActionPlan = {
  id: string
  invoice_id: string
  client_id: string
  strategy_version: string
  expected_payment_date: string | null
  expected_payment_confidence: BrokerRiskConfidence
  status: InvoiceActionPlanStatus
  created_at: string
  updated_at: string
}

export type InvoiceCalendarEvent = {
  id: string
  plan_id: string
  invoice_id: string
  client_id: string
  type: InvoiceCalendarEventType
  title: string
  detail: string
  due_at: string
  owner: InvoiceCalendarEventOwner
  status: InvoiceCalendarEventStatus
  completed_at: string | null
  completion_note: string | null
  created_at: string
  updated_at: string
}

export const INVOICE_PLAN_STRATEGY_VERSION = 'rules-v1'
