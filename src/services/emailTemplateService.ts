import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import {
  EMAIL_TEMPLATE_DEFAULTS,
  getDefaultEmailTemplate,
  type EmailTemplateDefinition,
  type EmailTemplateId,
} from '../config/emailTemplateDefaults'
import type { EmailTemplateRow } from '../types/emailTemplate'
import { persistOrThrow } from './persistHelper'

function definitionToRow(def: EmailTemplateDefinition): EmailTemplateRow {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    audience: def.audience,
    placeholders: def.placeholders,
    subject: def.subject,
    body_html: def.body_html,
    updated_at: new Date(0).toISOString(),
    updated_by: null,
  }
}

/** Merge DB rows over code defaults (defaults fill gaps). */
export function mergeEmailTemplates(
  rows: EmailTemplateRow[] | null | undefined
): EmailTemplateRow[] {
  const byId = new Map((rows ?? []).map((r) => [r.id, r]))
  return EMAIL_TEMPLATE_DEFAULTS.map((def) => {
    const row = byId.get(def.id)
    if (!row) return definitionToRow(def)
    return {
      ...definitionToRow(def),
      ...row,
      name: row.name || def.name,
      description: row.description || def.description,
      audience: row.audience || def.audience,
      placeholders: row.placeholders || def.placeholders,
    }
  })
}

/** List all templates (defaults + DB overrides). */
export async function listEmailTemplates(): Promise<EmailTemplateRow[]> {
  if (!isSupabaseConfigured()) {
    return EMAIL_TEMPLATE_DEFAULTS.map(definitionToRow)
  }

  const supabase = getSupabase()
  if (!supabase) return EMAIL_TEMPLATE_DEFAULTS.map(definitionToRow)

  const { data, error } = await supabase.from('email_templates').select('*').order('id')
  if (error) {
    console.warn('[emailTemplateService] list failed, using defaults:', error.message)
    return EMAIL_TEMPLATE_DEFAULTS.map(definitionToRow)
  }

  return mergeEmailTemplates((data ?? []) as EmailTemplateRow[])
}

/** Load one template (DB or default). */
export async function getEmailTemplate(id: EmailTemplateId): Promise<EmailTemplateRow> {
  const all = await listEmailTemplates()
  const found = all.find((t) => t.id === id)
  if (found) return found
  const def = getDefaultEmailTemplate(id)
  if (!def) throw new Error(`Unknown email template: ${id}`)
  return definitionToRow(def)
}

/** Persist subject/body edits for a template. */
export async function saveEmailTemplate(
  id: EmailTemplateId,
  patch: { subject: string; body_html: string },
  updatedBy?: string
): Promise<EmailTemplateRow> {
  const current = await getEmailTemplate(id)
  const next: EmailTemplateRow = {
    ...current,
    subject: patch.subject.trim(),
    body_html: patch.body_html.trim(),
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  }

  if (!next.subject) throw new Error('Subject is required')
  if (!next.body_html) throw new Error('Body is required')

  if (!isSupabaseConfigured()) {
    return next
  }

  const supabase = getSupabase()
  if (!supabase) return next

  await persistOrThrow('email_templates', async () => {
    const { error } = await supabase.from('email_templates').upsert({
      id: next.id,
      name: next.name,
      description: next.description,
      audience: next.audience,
      placeholders: next.placeholders,
      subject: next.subject,
      body_html: next.body_html,
      updated_at: next.updated_at,
      updated_by: next.updated_by,
    })
    if (error) throw new Error(error.message)
  })

  return next
}

/** Restore a template to the built-in default. */
export async function resetEmailTemplateToDefault(
  id: EmailTemplateId,
  updatedBy?: string
): Promise<EmailTemplateRow> {
  const def = getDefaultEmailTemplate(id)
  if (!def) throw new Error(`Unknown email template: ${id}`)
  return saveEmailTemplate(
    id,
    { subject: def.subject, body_html: def.body_html },
    updatedBy
  )
}
