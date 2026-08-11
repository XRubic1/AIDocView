/** Labels + clean copy from broker note text (strips Snapshot stamps). */

export type BrokerWarningTone = 'danger' | 'warn'

export type BrokerWarningLabel = {
  id: string
  text: string
  tone: BrokerWarningTone
}

export type ParsedBrokerWarnings = {
  labels: BrokerWarningLabel[]
  /** Human note lines, Snapshot stamps and status-only lines removed. */
  notes: string[]
}

const SNAPSHOT_STAMP = /^\[Snapshot(?:\s+\d{4}-\d{2}-\d{2})?\]\s*/i

/** Drop the internal “[Snapshot 2024-08-10]” prefix Credyx used to stamp. */
export function stripSnapshotStamp(line: string): string {
  return line.replace(SNAPSHOT_STAMP, '').trim()
}

function isInactiveStatus(text: string): boolean {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!t) return false
  if (/^(inactive|not authorized|out of service|revoked)$/.test(t)) return true
  if (/^operating status:\s*(inactive|not authorized|out of service)/.test(t)) return true
  if (/^broker is inactive\b/.test(t)) return true
  return false
}

function isInsuranceWarning(text: string): boolean {
  const t = text.toLowerCase()
  return t.includes('insurance cancelled') || t.includes('no active coverage')
}

/**
 * Split a stored notes field into warning labels + readable sentences.
 */
export function parseBrokerWarningNotes(raw: string | null | undefined): ParsedBrokerWarnings {
  const labels: BrokerWarningLabel[] = []
  const notes: string[] = []
  const seenNote = new Set<string>()
  let inactive = false
  let insurance = false

  const chunks = (raw ?? '')
    .split(/\r?\n/)
    .flatMap((line) => line.split(/(?=\[Snapshot)/i))
    .map(stripSnapshotStamp)
    .filter(Boolean)

  for (const chunk of chunks) {
    if (isInactiveStatus(chunk)) {
      inactive = true
      continue
    }
    if (isInsuranceWarning(chunk)) {
      insurance = true
    }
    const key = chunk.toLowerCase()
    if (seenNote.has(key)) continue
    seenNote.add(key)
    notes.push(chunk)
  }

  if (inactive) {
    labels.push({ id: 'inactive', text: 'Inactive', tone: 'danger' })
  }
  if (insurance) {
    labels.push({ id: 'insurance', text: 'Insurance cancelled', tone: 'danger' })
  }

  return { labels, notes }
}

/** Merge internal + carrier notes so the same warning is not shown twice. */
export function mergeBrokerWarningNotes(
  internalRaw: string | null | undefined,
  carrierRaw: string | null | undefined
): {
  labels: BrokerWarningLabel[]
  internalNotes: string[]
  carrierNotes: string[]
  carrierSameAsInternal: boolean
} {
  const internal = parseBrokerWarningNotes(internalRaw)
  const carrier = parseBrokerWarningNotes(carrierRaw)
  const labelById = new Map<string, BrokerWarningLabel>()
  for (const label of [...internal.labels, ...carrier.labels]) {
    labelById.set(label.id, label)
  }

  const internalKey = internal.notes.join('\n').toLowerCase()
  const carrierKey = carrier.notes.join('\n').toLowerCase()
  const carrierSameAsInternal =
    Boolean((carrierRaw ?? '').trim()) && internalKey === carrierKey

  return {
    labels: [...labelById.values()],
    internalNotes: internal.notes,
    carrierNotes: carrierSameAsInternal ? [] : carrier.notes,
    carrierSameAsInternal,
  }
}

/** Clear sentence when applying an operating-status Snapshot change. */
export function operatingStatusWarningNote(status: string | null | undefined): string | null {
  const v = status?.trim()
  if (!v) return null
  if (isInactiveStatus(v)) {
    return 'Broker is Inactive. Do not book until authority is confirmed.'
  }
  return `Operating status: ${v}`
}
