import { writeFileSync } from 'node:fs'
import { AUTH_EMAIL_TEMPLATE_DEFAULTS } from '../src/config/authEmailTemplates.ts'

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

const parts = AUTH_EMAIL_TEMPLATE_DEFAULTS.map((t, i) => {
  const tag = `b${i}`
  return `INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  ${sqlLiteral(t.id)},
  ${sqlLiteral(t.name)},
  ${sqlLiteral(t.description)},
  'auth',
  ${sqlLiteral(t.placeholders)},
  $${tag}subj$${t.subject}$${tag}subj$,
  $${tag}html$${t.body_html}$${tag}html$
)
ON CONFLICT (id) DO UPDATE SET
  placeholders = EXCLUDED.placeholders,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html;`
})

const sql = `-- Branded Credyx layout for Auth emails (navy header, blue CTA, OTP box).
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_audience_check;
ALTER TABLE email_templates ADD CONSTRAINT email_templates_audience_check
  CHECK (audience IN ('broker', 'carrier', 'admin', 'system', 'auth'));

${parts.join('\n\n')}
`
writeFileSync('supabase/migrations/20260908233000_branded_auth_emails.sql', sql)
console.log('wrote', sql.length, 'chars')
