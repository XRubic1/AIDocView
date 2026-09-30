/** Turn BrokerSnapshot envelopes into the company shape the proxy already summarizes. */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function field(obj: Record<string, unknown> | null | undefined, names: string[]): unknown {
  if (!obj) return null
  const wanted = new Set(names.map((name) => name.toLowerCase()))
  for (const [key, value] of Object.entries(obj)) {
    if (!wanted.has(key.toLowerCase())) continue
    if (value == null || String(value).trim() === '') continue
    return value
  }
  return null
}

function child(obj: Record<string, unknown>, names: string[]): Record<string, unknown> {
  return asRecord(field(obj, names)) ?? {}
}

function looksLikeCompany(record: Record<string, unknown>): boolean {
  const general = asRecord(record.General) ?? asRecord(record.general)
  const authority = asRecord(record.Authority) ?? asRecord(record.authority)
  if (general || authority || record.ActiveInsurances || record.activeInsurances) return true
  const keys = new Set(Object.keys(record).map((key) => key.toLowerCase()))
  const hasName = ['legalname', 'legal_name', 'companyname', 'name'].some((key) => keys.has(key))
  const hasId = ['dot_number', 'dotnumber', 'docket', 'docket_number', 'docketnumber', 'mc_number', 'mcnumber'].some(
    (key) => keys.has(key)
  )
  return hasName && hasId
}

const COMPANY_LIST_KEYS = ['Data', 'data', 'Company', 'company', 'Result', 'result', 'results', 'items']

function collectCompanyRecords(value: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(value)) {
    const rows = value.map((item) => asRecord(item)).filter((row): row is Record<string, unknown> => row != null)
    const companies = rows.filter(looksLikeCompany)
    if (companies.length) {
      out.push(...companies)
      return
    }
    for (const row of rows) collectCompanyRecords(row, out)
    return
  }
  const root = asRecord(value)
  if (!root) return
  if (looksLikeCompany(root)) {
    out.push(root)
    return
  }
  for (const key of COMPANY_LIST_KEYS) {
    if (key in root) collectCompanyRecords(root[key], out)
  }
}

/** Every company in a list payload. A number search can return more than one. */
export function extractCompanyRecords(body: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = []
  collectCompanyRecords(body, records)
  return records
}

/** Pull the company object out of Data/data/Company envelopes, including list payloads. */
export function extractCompanyRecord(body: unknown): Record<string, unknown> | null {
  return extractCompanyRecords(body)[0] ?? null
}

function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

/**
 * Prefer the company whose MC docket matches the search.
 * A DOT that merely equals the MC digits (a different carrier) ranks lower.
 */
export function companyRecordScore(record: Record<string, unknown>, docketDigits: string): number {
  const normalized = normalizeSnapshotCompany(record)
  const general = asRecord(normalized.General) ?? {}
  const authority = asRecord(normalized.Authority) ?? {}
  const policies = Array.isArray(normalized.ActiveInsurances) ? normalized.ActiveInsurances.length : 0
  const docket = digitsOnly(authority.docket_number)
  const dot = digitsOnly(normalized.dot_number)
  const status = String(general.status_code ?? '').toLowerCase()
  const broker = String(authority.broker_stat ?? '').toLowerCase()
  const common = String(authority.common_stat ?? '').toLowerCase()
  const contract = String(authority.contract_stat ?? '').toLowerCase()
  const activeAuth = [broker, common, contract].some((value) => value === 'active' || value === 'a' || value === 'authorized')
  let score = 0
  if (docket && docket === docketDigits) score += 1000
  else if (docket) score -= 400
  else if (dot && dot === docketDigits) score -= 250
  if (status === 'a' || status === 'active') score += 40
  if (status === 'i' || status === 'inactive') score -= 80
  if (activeAuth) score += 80
  if (policies > 0) score += 200 + Math.min(policies, 20)
  if (general.name) score += 2
  if (dot) score += 2
  return score
}

function money(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value == null) return null
  const cleaned = String(value).replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const amount = Number(cleaned)
  return Number.isFinite(amount) ? amount : null
}

function isPlaceholder(value: unknown): boolean {
  const text = String(value ?? '').trim().toLowerCase()
  return !text || text === 'null' || text === '0' || text === 'n/a' || text === 'na' || text === '-' || text === 'none' || text === '—'
}

function hasRealCancel(row: Record<string, unknown>): boolean {
  const cancel = field(row, [
    'cancel_effective_date',
    'cancellation_date',
    'cancelDate',
    'cancellationDate',
    'cancl_effective_date',
    'cancel_date',
  ])
  if (cancel == null || isPlaceholder(cancel)) return false
  const parsed = Date.parse(String(cancel))
  if (Number.isFinite(parsed) && parsed < Date.parse('1950-01-01')) return false
  return true
}

function insurerName(row: Record<string, unknown>): string | null {
  const direct = field(row, [
    'company_name',
    'name_company',
    'ins_company_name',
    'insuranceCarrier',
    'insurance_carrier',
    'carrier_name',
    'carrier',
    'insurer',
    'surety_name',
    'surety_company',
    'surety',
    'provider',
  ])
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const filer = asRecord(row.Filer) ?? asRecord(row.filer)
  const nested = filer ? field(filer, ['Name', 'LegalName', 'name', 'legalName']) : null
  return typeof nested === 'string' && nested.trim() ? nested.trim() : null
}

function isActiveMotusStatus(value: unknown): boolean {
  const numeric = Number(value)
  if (numeric === 1) return true
  const text = String(value ?? '').trim().toLowerCase()
  return text === 'active' || text === 'authorized' || text === 'a'
}

function isEndedMotusStatus(value: unknown): boolean {
  const numeric = Number(value)
  if (numeric === 2 || numeric === 3 || numeric === 4) return true
  const text = String(value ?? '').trim().toLowerCase()
  return text === 'inactive' || text === 'cancelled' || text === 'canceled' || text === 'revoked' || text === 'rejected'
}
function isInsuranceForm(value: unknown): boolean {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return false
  return /surety|bond|bipd|cargo|bmc|liability|primary|^8[45]$|^91x?$|^34$|^35$|^82$|^83$/.test(text)
}

function insuranceRow(row: Record<string, unknown>, sourceKey: string): Record<string, unknown> | null {
  const statusValue = field(row, ['status', 'coverage_status', 'insurance_status'])
  if (isEndedMotusStatus(statusValue)) return null
  if (hasRealCancel(row)) return null
  const status = String(statusValue ?? '').toLowerCase()
  if (status === 'cancelled' || status === 'inactive' || status === 'history' || status === 'rejected') {
    return null
  }
  const company = insurerName(row)
  const policy = field(row, [
    'policy_number',
    'policyNumber',
    'policy_no',
    'ins_policy_no',
    'policy',
    'policySurety',
    'policy_surety',
    'bond_number',
  ])
  const form = field(row, [
    'form_code',
    'formCode',
    'ins_form_code',
    'form',
    'type_desc',
    'ins_type_desc',
    'coverage_type',
    'insurance_type',
  ])
  const limit = money(
    field(row, [
      'bi_pd_maximum_limit',
      'max_cov_amount',
      'MaxCovAmount',
      'max_limit',
      'limit',
      'amount',
      'coverage',
      'coverage_amount',
      'required_amount',
    ])
  )
  const looksLikeBond =
    /bond|surety|bmc|\b84\b/i.test(sourceKey) ||
    (isInsuranceForm(form) && /surety|bond|bmc|^84$|^7$/i.test(String(form))) ||
    Number(limit) === 75000
  const hasPolicyIdentity = policy != null || (company != null && (form != null || limit != null))
  if (!hasPolicyIdentity && !looksLikeBond) return null
  if (!isActiveMotusStatus(statusValue) && statusValue != null && String(statusValue).trim() !== '') {
    return null
  }
  const usableForm = isInsuranceForm(form) || looksLikeBond ? form : null
  return {
    company_name: company ?? 'Surety bond',
    policy_number: policy != null ? String(policy) : null,
    effective_date: field(row, ['effective_date', 'effectiveDate', 'eff_date']) ?? null,
    bi_pd_maximum_limit: limit,
    form_code: usableForm ?? (looksLikeBond ? '84' : form ?? null),
  }
}

/** Active insurance filings from API v3 Auths[].Insurances. Status 1 and no cancellation date. */
export function collectInsuranceRows(record: Record<string, unknown>): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  const seen = new Set<string>()
  const push = (row: Record<string, unknown> | null) => {
    if (!row) return
    const key = `${row.company_name}|${row.policy_number}|${row.bi_pd_maximum_limit}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push(row)
  }

  const readPolicy = (policy: Record<string, unknown>): Record<string, unknown> | null => {
    const status = policy.Status ?? policy.status
    if (status != null && !isActiveMotusStatus(status)) return null
    if (isEndedMotusStatus(status)) return null
    if (status == null) {
      const cancelled = policy.CancellationDate ?? policy.cancellationDate ?? policy.cancel_effective_date
      if (cancelled != null && !isPlaceholder(cancelled)) return null
    }
    const filer = asRecord(policy.Filer) ?? asRecord(policy.filer)
    const filerName = filer ? textValue(field(filer, ['Name', 'LegalName'])) : null
    const company =
      filerName ??
      (typeof policy.company_name === 'string' && policy.company_name.trim() ? policy.company_name.trim() : null)
    const policyNumber = policy.PolicyNumber ?? policy.policy_number ?? policy.policyNumber
    const form = policy.Form ?? policy.form ?? policy.form_code
    const limit = money(policy.MaxCovAmount ?? policy.maxCovAmount ?? policy.bi_pd_maximum_limit)
    const coverageType = Number(policy.Type)
    const formNumber = Number(form)
    const surety = coverageType === 3 || coverageType === 4 || formNumber === 7 || formNumber === 8
    if (!company && policyNumber == null && limit == null) return null
    const phone = contactValue(filer?.Phones ?? filer?.Phone ?? policy.Phone ?? policy.phone, [
      'Number',
      'Phone',
      'phone',
      'Value',
    ])
    const email = contactValue(filer?.Emails ?? filer?.Email ?? policy.Email ?? policy.email, [
      'Address',
      'Email',
      'email',
      'Value',
    ])
    return {
      company_name: company ?? (surety ? 'Surety bond' : 'Insurer'),
      policy_number: policyNumber != null ? String(policyNumber) : null,
      effective_date: policy.EffectiveDate ?? policy.effective_date ?? null,
      bi_pd_maximum_limit: limit,
      form_code: form ?? null,
      phone,
      email,
    }
  }

  for (const listName of ['Auths', 'auths']) {
    const auths = record[listName]
    if (!Array.isArray(auths)) continue
    for (const item of auths) {
      const auth = asRecord(item)
      if (!auth) continue
      const policies = auth.Insurances ?? auth.insurances
      if (!Array.isArray(policies)) continue
      for (const raw of policies) {
        const policy = asRecord(raw)
        if (policy) push(readPolicy(policy))
      }
    }
  }

  const legacy = record.ActiveInsurances
  if (Array.isArray(legacy)) {
    for (const raw of legacy) {
      const policy = asRecord(raw)
      if (policy) push(readPolicy(policy))
    }
  }

  if (!rows.length && Array.isArray(record.Auths)) {
    for (const item of record.Auths) {
      const auth = asRecord(item)
      if (!auth || !isActiveMotusStatus(auth.Status)) continue
      const type = Number(auth.Type)
      const brokerAuth = type === 8 || type === 9 || type === 10 || type === 11
      if (!brokerAuth) continue
      const amount = money(auth.BondFileAmount)
      if (auth.BondReq !== true && auth.BondFiled !== true && !(amount != null && amount > 0)) continue
      push({
        company_name: 'Surety bond',
        policy_number: null,
        bi_pd_maximum_limit: amount,
        form_code: 7,
      })
      break
    }
  }
  return rows
}

function readMotusAuths(record: Record<string, unknown>): {
  broker?: string
  common?: string
  contract?: string
  operatingStatus?: string
  docket?: string
} {
  const auths = record.Auths ?? record.auths
  if (!Array.isArray(auths)) return {}
  let broker: string | undefined
  let common: string | undefined
  let contract: string | undefined
  let docket: string | undefined
  const label = (active: boolean) => (active ? 'Active' : undefined)
  for (const item of auths) {
    const auth = asRecord(item)
    if (!auth) continue
    const active = isActiveMotusStatus(auth.Status)
    const type = Number(auth.Type)
    // 1 property carrier, 8 broker of property, 9 broker of household goods.
    if ((type === 8 || type === 9) && active) broker = label(true)
    if ((type === 1 || type === 2 || type === 6) && active) common = label(true)
    if (!docket) {
      const number = field(auth, ['DocketNumber', 'docketNumber'])
      if (number != null) docket = String(number)
    }
  }
  const censusList = record.CensusAuths ?? record.censusAuths
  if (Array.isArray(censusList)) {
    const censusLabel = (value: unknown): string | undefined => {
      const code = Number(value)
      if (code === 2) return 'Active'
      if (code === 3) return 'Inactive'
      if (code === 1) return 'None'
      return undefined
    }
    for (const item of censusList) {
      const row = asRecord(item)
      if (!row) continue
      broker = broker ?? censusLabel(row.Broker ?? row.broker)
      common = common ?? censusLabel(row.Common ?? row.common)
      contract = contract ?? censusLabel(row.Contract ?? row.contract)
    }
  }
  const operatingStatus = broker === 'Active'
    ? 'Authorized for Broker Property'
    : common === 'Active'
      ? 'Authorized for Property'
      : undefined
  return { broker, common, contract, operatingStatus, docket }
}

function contactValue(source: unknown, names: string[]): string | null {
  if (typeof source === 'string' || typeof source === 'number') {
    const text = String(source).trim()
    return text || null
  }
  if (Array.isArray(source)) {
    for (const item of source) {
      const found = contactValue(item, names)
      if (found) return found
    }
    return null
  }
  const record = asRecord(source)
  if (!record) return null
  const direct = field(record, names)
  if (typeof direct === 'string' || typeof direct === 'number') {
    const text = String(direct).trim()
    if (text) return text
  }
  for (const name of ['Phones', 'Emails', 'Phone', 'Email']) {
    if (record[name] != null && record[name] !== source) {
      const nested = contactValue(record[name], names)
      if (nested) return nested
    }
  }
  return null
}

function textValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  const record = asRecord(value)
  if (!record) return null
  const nested = field(record, ['LegalName', 'legalName', 'Name', 'name', 'DbaName'])
  return typeof nested === 'string' && nested.trim() ? nested.trim() : null
}

/** Copy alternate Motus / list fields onto General, Authority, and ActiveInsurances. */
export function normalizeSnapshotCompany(record: Record<string, unknown>): Record<string, unknown> {
  const general = { ...child(record, ['General', 'general']) }
  const authority = { ...child(record, ['Authority', 'authority']) }

  const name =
    textValue(field(general, ['name'])) ??
    textValue(field(record, ['name', 'legalName', 'legal_name', 'companyName', 'company_name']))
  if (name != null) general.name = name

  const dot =
    field(record, ['dot_number', 'dotNumber', 'dot', 'usdot']) ??
    field(general, ['dot_number', 'dotNumber', 'dot'])
  const entity =
    textValue(field(general, ['carship', 'entity_type', 'entityType'])) ??
    textValue(field(record, ['entityType', 'entity_type', 'carship']))
  if (entity != null) general.carship = entity

  const statusRaw =
    field(general, ['status_code']) ??
    field(record, ['status_code', 'dotStatus', 'dot_status', 'status'])
  const statusCode = textValue(statusRaw) ?? (asRecord(statusRaw) ? field(asRecord(statusRaw)!, ['Status', 'status']) : statusRaw)
  if (isActiveMotusStatus(statusCode)) general.status_code = 'A'
  else if (typeof statusCode === 'string') general.status_code = statusCode

  const motus = readMotusAuths(record)
  const broker =
    field(authority, ['broker_stat', 'broker', 'broker_authority', 'brokerAuthority']) ??
    field(record, ['broker_stat', 'brokerAuthority', 'broker_authority']) ??
    motus.broker
  const common =
    field(authority, ['common_stat', 'common', 'common_authority', 'commonAuthority']) ??
    field(record, ['common_stat', 'commonAuthority', 'common_authority']) ??
    motus.common
  const contract =
    field(authority, ['contract_stat', 'contract', 'contract_authority', 'contractAuthority']) ??
    field(record, ['contract_stat', 'contractAuthority', 'contract_authority']) ??
    motus.contract
  if (broker != null) authority.broker_stat = broker
  if (common != null) authority.common_stat = common
  if (contract != null) authority.contract_stat = contract

  const operating =
    textValue(field(authority, ['OperatingStatus', 'operating_status', 'operatingStatus'])) ??
    textValue(field(general, ['operating_status', 'operatingStatus'])) ??
    textValue(field(record, ['operatingStatus', 'operating_status'])) ??
    motus.operatingStatus
  if (operating != null) authority.OperatingStatus = operating

  const docket =
    textValue(field(authority, ['docket_number', 'docket'])) ??
    textValue(field(record, ['docket_number', 'docketNumber', 'docket', 'mc_number', 'mcNumber'])) ??
    motus.docket
  if (docket != null) authority.docket_number = docket
  const prefix = field(authority, ['prefix']) ?? field(record, ['prefix'])
  if (prefix != null) authority.prefix = prefix

  const insurances = collectInsuranceRows(record)
  const existing = Array.isArray(record.ActiveInsurances) ? record.ActiveInsurances : []
  for (const row of existing) {
    const parsed = asRecord(row)
    if (!parsed) continue
    const normalized = insuranceRow(parsed, 'ActiveInsurances')
    if (!normalized) continue
    const key = `${normalized.company_name}|${normalized.policy_number}|${normalized.form_code}`
    if (insurances.some((item) => `${item.company_name}|${item.policy_number}|${item.form_code}` === key)) continue
    insurances.push(normalized)
  }

  return {
    ...record,
    ...(dot != null ? { dot_number: dot } : {}),
    General: general,
    Authority: authority,
    ...(insurances.length ? { ActiveInsurances: insurances } : {}),
  }
}
