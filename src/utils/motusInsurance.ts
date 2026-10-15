/** Public FMCSA MOTUS authority and insurance, shaped like the account page. */

export type MotusInsurancePolicy = {
  companyName: string
  policyNumber: string
  form: string
  insuranceFiled: string
  status: string
  receivedDate: string | null
  effectiveDate: string | null
  cancellationDate: string | null
  /** Active on MOTUS and no cancellation date. */
  active: boolean
  /** MOTUS status is Active, and a cancellation date is also present. */
  activeWithCancellation: boolean
  hasCancellationDate: boolean
}

export type MotusAuthority = {
  id: string
  legalName: string
  authorityType: string
  docketNumber: string
  status: string
  statusReason: string | null
  statusActive: boolean
  minimumInsurance: string | null
  detailUrl: string
  policies: MotusInsurancePolicy[]
  insuranceActive: boolean
}

export type MotusInsuranceReport = {
  dotNumber: string
  legalName: string
  accountUrl: string
  queriedAt: string
  authorities: MotusAuthority[]
  insuranceActive: boolean
}

export type MotusQuery =
  | { kind: 'dot'; dot: string }
  | { kind: 'docket'; prefix: 'MC' | 'FF' | 'MX'; number: string }

const DOCKET = /^(MC|FF|MX)\s*-?\s*(\d{3,10})$/i

export function parseMotusQuery(raw: string): MotusQuery | null {
  const text = raw.trim()
  if (!text) return null

  const fromUrl = text.match(/\/customer\/(\d{3,10})\b/i)
  if (fromUrl) return { kind: 'dot', dot: fromUrl[1] }

  const docket = text.match(DOCKET)
  if (docket) {
    return {
      kind: 'docket',
      prefix: docket[1].toUpperCase() as 'MC' | 'FF' | 'MX',
      number: docket[2],
    }
  }

  const digits = text.replace(/\D/g, '')
  if (digits.length >= 3 && digits.length <= 10 && digits === text.replace(/[\s-]/g, '')) {
    return { kind: 'dot', dot: digits }
  }
  return null
}

export function formatMotusDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatMotusMoney(value: unknown): string {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

type NameRow = { nameType?: string; entityName?: string; disableDate?: string | null; updateDate?: string | null; createDate?: string | null }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function newestLegalName(names: unknown): string {
  const rows = asArray(names)
    .map(asRecord)
    .filter((row): row is NameRow & Record<string, unknown> => Boolean(row))
    .filter((row) => row.nameType === 'Legal' && !row.disableDate && text(row.entityName))
  rows.sort((a, b) => stamp(b.updateDate || b.createDate) - stamp(a.updateDate || a.createDate))
  return text(rows[0]?.entityName)
}

function stamp(value: unknown): number {
  const time = typeof value === 'string' ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function companyName(filing: Record<string, unknown>): string {
  const fromInsurer = newestLegalName(asRecord(filing.insuranceEntity)?.entityNames)
  if (fromInsurer) return fromInsurer
  const legacy = asRecord(filing.legacyFilerNumber)
  const fromLegacyEntity = newestLegalName(asRecord(legacy?.entity)?.entityNames)
  if (fromLegacyEntity) return fromLegacyEntity
  return text(legacy?.companyName) || '—'
}

function formLabel(filing: Record<string, unknown>): string {
  const form = text(asRecord(filing.insuranceForm)?.insuranceForm)
  if (!form) return '—'
  if (form === 'BMC-91X') {
    const cls = text(asRecord(filing.insuranceClass)?.insuranceClassDesc)
    return cls ? `${form} (${cls})` : form
  }
  return form
}

function statusReason(authority: Record<string, unknown>, currentStatus: string): string | null {
  const rows = asArray(authority.entityOperatingAuthorityHistories)
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .filter((row) => text(row.changeDesc))
  const matching = rows.filter((row) => {
    const name = text(asRecord(row.operatingAuthorityStatus)?.operatingAuthorityStatusName)
    return !currentStatus || name.toLowerCase() === currentStatus.toLowerCase()
  })
  const pool = matching.length ? matching : rows
  pool.sort((a, b) => stamp(b.updateDate || b.createDate) - stamp(a.updateDate || a.createDate))
  return text(pool[0]?.changeDesc) || null
}

function mapPolicy(filing: Record<string, unknown>): MotusInsurancePolicy {
  const status = text(asRecord(filing.status)?.filingStatusDesc) || '—'
  const cancellationDate = formatMotusDate(filing.cancellationDate)
  const activeStatus = status.toLowerCase() === 'active'
  return {
    companyName: companyName(filing),
    policyNumber: text(filing.policyNumber) || '—',
    form: formLabel(filing),
    insuranceFiled: formatMotusMoney(filing.maxCovAmount),
    status,
    receivedDate: formatMotusDate(filing.receivedDate),
    effectiveDate: formatMotusDate(filing.effectiveDate),
    cancellationDate,
    active: activeStatus && !cancellationDate,
    activeWithCancellation: activeStatus && Boolean(cancellationDate),
    hasCancellationDate: Boolean(cancellationDate),
  }
}

export function minimumInsuranceLabel(payload: unknown): string | null {
  const row = asRecord(payload)
  const display = asRecord(row?.display)
  const label = text(display?.primaryLabel)
  const amount = row?.minimumBipdAmount
  if (!label || amount == null || amount === '') return null
  return `${label}: ${formatMotusMoney(amount)}`
}

export function mapMotusAuthority(input: {
  dotNumber: string
  legalName: string
  authority: unknown
  minimumBipd?: unknown
}): MotusAuthority | null {
  const authority = asRecord(input.authority)
  if (!authority) return null
  const id = text(authority.entityOperatingAuthorityId)
  if (!id) return null

  const status = text(asRecord(authority.operatingAuthorityStatus)?.operatingAuthorityStatusName) || '—'
  const policies = asArray(authority.insuranceFilings)
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .sort((a, b) => stamp(b.effectiveDate) - stamp(a.effectiveDate))
    .map(mapPolicy)

  return {
    id,
    legalName: input.legalName || '—',
    authorityType: text(asRecord(authority.operatingAuthorityType)?.operatingAuthorityType) || '—',
    docketNumber: text(authority.docketNumber) || '—',
    status,
    statusReason: statusReason(authority, status === '—' ? '' : status),
    statusActive: status.toLowerCase() === 'active',
    minimumInsurance: minimumInsuranceLabel(input.minimumBipd),
    detailUrl: `https://motus.dot.gov/customer/${input.dotNumber}/operating-authority-detail/${id}`,
    policies,
    insuranceActive: policies.some((policy) => policy.active),
  }
}

export function authorityIdsFromCarrier(carrier: unknown): string[] {
  const root = asRecord(carrier)
  const ids: string[] = []
  for (const registration of asArray(root?.entityRegistrations)) {
    for (const link of asArray(asRecord(registration)?.entityRegistrationOperatingAuthorities)) {
      const row = asRecord(link)
      if (row?.disableDate) continue
      const id = text(row?.entityOperatingAuthorityId)
      if (id && !ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

export function legalNameFromCarrier(carrier: unknown): string {
  const root = asRecord(carrier)
  return newestLegalName(root?.entityNames) || text(root?.entityName) || '—'
}

export function buildMotusReport(input: {
  dotNumber: string
  carrier: unknown
  authorities: Array<{ detail: unknown; minimumBipd?: unknown }>
  queriedAt?: string
}): MotusInsuranceReport {
  const legalName = legalNameFromCarrier(input.carrier)
  const authorities = input.authorities
    .map((row) =>
      mapMotusAuthority({
        dotNumber: input.dotNumber,
        legalName,
        authority: row.detail,
        minimumBipd: row.minimumBipd,
      })
    )
    .filter((row): row is MotusAuthority => Boolean(row))

  return {
    dotNumber: input.dotNumber,
    legalName,
    accountUrl: `https://motus.dot.gov/customer/${input.dotNumber}/account`,
    queriedAt: input.queriedAt ?? new Date().toISOString(),
    authorities,
    insuranceActive: authorities.some((authority) => authority.insuranceActive),
  }
}

/** MOTUS or the lookup function failed. A missing account is a real result, not a retry. */
export function isRetryableMotusFailure(message: string): boolean {
  if (/no motus account|no operating authority|enter a dot|sign in as an admin|limited to admins/i.test(message)) {
    return false
  }
  return /fail|timeout|unexpected|unavailable|network|fetch|aborted|non-2xx|502|503|429|gateway/i.test(message)
}

export type MotusListVerdict = 'good' | 'cancellation' | 'inactive'

export type MotusListClassification = {
  verdict: MotusListVerdict
  authorityStatus: string
  docketNumber: string
  cancellationDates: string[]
  summary: string
}

function policyMarksCancellation(policy: MotusInsurancePolicy): boolean {
  return policy.hasCancellationDate || /cancel/i.test(policy.status)
}

/** Newest active filing, or the newest filing when nothing is active. Older canceled rows are left out. */
export function currentMotusPolicies(policies: MotusInsurancePolicy[]): MotusInsurancePolicy[] {
  const active = policies.filter((policy) => policy.status.toLowerCase() === 'active')
  if (active.length) return active
  return policies[0] ? [policies[0]] : []
}

/** One row for an imported DOT list: good, cancellation, or inactive. */
export function classifyMotusReport(report: MotusInsuranceReport): MotusListClassification {
  const policies = report.authorities.flatMap((authority) => currentMotusPolicies(authority.policies))
  const cancellationDates = [
    ...new Set(
      policies
        .filter(policyMarksCancellation)
        .map((policy) => policy.cancellationDate)
        .filter((date): date is string => Boolean(date))
    ),
  ]
  const authorityStatus = report.authorities.some((authority) => authority.statusActive)
    ? 'Active'
    : report.authorities.map((authority) => authority.status).filter((status) => status && status !== '—')[0] ||
      'Inactive'
  const docketNumber =
    report.authorities
      .map((authority) => authority.docketNumber)
      .filter((docket) => docket && docket !== '—')
      .join(', ') || '—'
  const cancellationNote =
    cancellationDates.length > 0 ? `Cancellation on ${cancellationDates.join(', ')}.` : ''

  if (!report.authorities.length || !report.authorities.some((authority) => authority.statusActive)) {
    return {
      verdict: 'inactive',
      authorityStatus,
      docketNumber,
      cancellationDates,
      summary: cancellationNote
        ? `Authority is ${authorityStatus}. ${cancellationNote}`
        : `Authority is ${authorityStatus}.`,
    }
  }

  if (policies.some((policy) => policy.active)) {
    return {
      verdict: 'good',
      authorityStatus,
      docketNumber,
      cancellationDates: [],
      summary: 'Active insurance, no cancellation date.',
    }
  }

  if (policies.some(policyMarksCancellation)) {
    return {
      verdict: 'cancellation',
      authorityStatus,
      docketNumber,
      cancellationDates,
      summary: cancellationNote || 'Insurance is canceled.',
    }
  }

  return {
    verdict: 'inactive',
    authorityStatus,
    docketNumber,
    cancellationDates,
    summary: 'No active insurance on file.',
  }
}
