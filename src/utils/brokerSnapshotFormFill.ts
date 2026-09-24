import type { Broker, BrokerEmail, BrokerPhone } from '../types/broker'
import type { BrokerSnapshotSummary } from '../types/brokerSnapshot'
import { normalizeMcQuery } from './clientBrokers'
import { formatPhoneNumber } from './formatPhoneNumber'

function isBlank(value: string | number | null | undefined): boolean {
  if (value == null) return true
  return String(value).trim() === ''
}

function normText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function normPhone(value: string): string {
  return value.replace(/\D/g, '')
}

/** Broker form fields we can suggest from BrokerSnapshot. */
export type SnapshotSuggestField =
  | 'name'
  | 'contact_person'
  | 'fax'
  | 'address'
  | 'dot_number'
  | 'email'
  | 'phone'
  | 'carrier_notes'

export type SnapshotFieldDiff = {
  field: SnapshotSuggestField
  label: string
  /** Value currently on the form / Credyx record. */
  previous: string
  /** Value from BrokerSnapshot. */
  proposed: string
}

export type SnapshotFormFillResult = {
  formPatch: Partial<Broker>
  emails?: BrokerEmail[]
  phones?: BrokerPhone[]
  filled: string[]
  /** Non-empty form fields that differ from Snapshot — show as “what’s new”. */
  diffs: SnapshotFieldDiff[]
}

type SnapshotCandidate = {
  field: SnapshotSuggestField
  label: string
  proposed: string
  current: string
  equal: boolean
}

function buildCandidates(
  current: Partial<Broker>,
  snapshot: BrokerSnapshotSummary,
  options?: { emails?: BrokerEmail[]; phones?: BrokerPhone[] }
): SnapshotCandidate[] {
  const emails = options?.emails ?? []
  const phones = options?.phones ?? []
  const currentEmail =
    emails.find((e) => e.email.trim())?.email?.trim() || current.email?.trim() || ''
  const currentPhone =
    phones.find((p) => p.phone.trim())?.phone?.trim() || current.phone?.trim() || ''

  const snapPhone = snapshot.phone?.trim()
    ? formatPhoneNumber(snapshot.phone)
    : ''
  const snapFax = snapshot.fax?.trim() ? formatPhoneNumber(snapshot.fax) : ''
  const snapDot =
    snapshot.dotNumber != null ? String(snapshot.dotNumber).trim() : ''

  const rows: Array<{
    field: SnapshotSuggestField
    label: string
    proposed: string
    current: string
    same: (a: string, b: string) => boolean
  }> = [
    {
      field: 'name',
      label: 'name',
      proposed: snapshot.name?.trim() || '',
      current: current.name?.trim() || '',
      same: (a, b) => normText(a) === normText(b),
    },
    {
      field: 'contact_person',
      label: 'contact',
      proposed: snapshot.officer?.trim() || '',
      current: current.contact_person?.trim() || '',
      same: (a, b) => normText(a) === normText(b),
    },
    {
      field: 'fax',
      label: 'fax',
      proposed: snapFax,
      current: current.fax?.trim() || '',
      same: (a, b) => normPhone(a) === normPhone(b),
    },
    {
      field: 'address',
      label: 'address',
      proposed: snapshot.phyAddress?.trim() || '',
      current: current.address?.trim() || '',
      same: (a, b) => normText(a) === normText(b),
    },
    {
      field: 'dot_number',
      label: 'DOT',
      proposed: snapDot,
      current: current.dot_number?.trim() || '',
      same: (a, b) => a.replace(/\D/g, '') === b.replace(/\D/g, ''),
    },
    {
      field: 'email',
      label: 'email',
      proposed: snapshot.email?.trim() || '',
      current: currentEmail,
      same: (a, b) => normText(a) === normText(b),
    },
    {
      field: 'phone',
      label: 'phone',
      proposed: snapPhone,
      current: currentPhone,
      same: (a, b) => normPhone(a) === normPhone(b),
    },
    {
      field: 'carrier_notes',
      label: 'notes',
      proposed: snapshot.insuranceNote?.trim() || '',
      current: current.carrier_notes?.trim() || '',
      same: (a, b) => normText(a) === normText(b),
    },
  ]

  return rows
    .filter((r) => !isBlank(r.proposed))
    .map((r) => ({
      field: r.field,
      label: r.label,
      proposed: r.proposed,
      current: r.current,
      equal: !isBlank(r.current) && r.same(r.current, r.proposed),
    }))
}

/**
 * Map BrokerSnapshot onto empty fields; collect diffs for fields that already
 * have a different value on file.
 */
export function fillEmptyBrokerFieldsFromSnapshot(
  current: Partial<Broker>,
  snapshot: BrokerSnapshotSummary,
  options?: { emails?: BrokerEmail[]; phones?: BrokerPhone[] }
): SnapshotFormFillResult {
  const formPatch: Partial<Broker> = {}
  const filled: string[] = []
  const diffs: SnapshotFieldDiff[] = []

  const mc =
    normalizeMcQuery(snapshot.mcNumber || '') ||
    normalizeMcQuery(current.mc_number || '') ||
    undefined

  if (isBlank(current.mc_number) && mc) {
    formPatch.mc_number = mc
    filled.push('MC')
  }

  let nextEmails: BrokerEmail[] | undefined
  let nextPhones: BrokerPhone[] | undefined

  for (const row of buildCandidates(current, snapshot, options)) {
    if (isBlank(row.current)) {
      if (row.field === 'email') {
        formPatch.email = row.proposed
        nextEmails = [{ email: row.proposed, category: 'accounting' }]
      } else if (row.field === 'phone') {
        formPatch.phone = row.proposed
        nextPhones = [{ phone: row.proposed, category: 'accounts_payable' }]
      } else {
        formPatch[row.field] = row.proposed
      }
      filled.push(row.label)
      continue
    }
    if (!row.equal) {
      diffs.push({
        field: row.field,
        label: row.label,
        previous: row.current,
        proposed: row.proposed,
      })
    }
  }

  return { formPatch, emails: nextEmails, phones: nextPhones, filled, diffs }
}
