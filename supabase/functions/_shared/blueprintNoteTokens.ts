/** Quoted fields in a blueprint note, filled when the note is saved. */

export type BlueprintNoteFields = {
  brokerEmail?: string
  brokerName?: string
  invoiceNumber?: string
  loadNumber?: string
}

const TOKEN_FIELDS: Record<string, keyof BlueprintNoteFields> = {
  'broker-email': 'brokerEmail',
  'broker-name': 'brokerName',
  'invoice-number': 'invoiceNumber',
  'load-number': 'loadNumber',
}

/**
 * Replaces "broker-email", "broker-name", "invoice-number", and "load-number".
 * Unknown quoted text is left as written.
 */
export function fillBlueprintNoteTokens(
  template: string,
  fields: BlueprintNoteFields
): string {
  if (!template) return template
  return template.replace(
    /"(broker-email|broker-name|invoice-number|load-number)"/gi,
    (_match, key: string) => {
      const field = TOKEN_FIELDS[key.toLowerCase()]
      const value = field ? fields[field]?.trim() : ''
      return value || '—'
    }
  )
}
