import type { EmailTemplateId } from '../config/emailTemplateDefaults'

/** Row stored in email_templates (admin-editable). */
export interface EmailTemplateRow {
  id: EmailTemplateId
  name: string
  description: string
  audience: 'broker' | 'carrier' | 'admin' | 'system'
  placeholders: string
  subject: string
  body_html: string
  updated_at: string
  updated_by?: string | null
}
