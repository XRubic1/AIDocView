export type McCreditSource = 'compass' | 'trufunding' | 'factorsnetwork'

export type McCreditRecord = {
  source: McCreditSource
  mc: string
  company: string
  dba?: string
  city?: string
  state?: string
  address?: string
  phone?: string
  email?: string | string[]
  creditRating: string
  paydex: string | number
  creditScore: string | number
  dbRate?: string
  noBuy?: string
  warning?: string
  creditNote?: string
  rateDate?: string
  creditExpireDate?: string
  payFasterPercent?: string | number
  calcDaysToPay?: {
    all?: string | number
    days90?: string | number
    days60?: string | number
  }
  calcInvCount?: {
    all?: string | number
    days90?: string | number
    days60?: string | number
  }
}

export type McCreditSourceResult = {
  source: McCreditSource
  ok: boolean
  error?: string
  results: McCreditRecord[]
}

function env(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim()
  return value || undefined
}

function readSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headers.getSetCookie === 'function') {
    const raw = headers.getSetCookie()
    if (raw.length) return raw
  }
  const fallback = response.headers.get('set-cookie')
  if (!fallback) return []
  return fallback.split(/,(?=[^;]+?=)/)
}

type CompassLoginResponse = {
  msg?: string
  token?: string
  message?: string
}

type CompassBrokerRow = {
  mc?: string
  company?: string
  dba?: string
  city?: string
  st?: string
  addr1?: string
  phone1?: string
  email?: string | string[]
  credRate?: string
  paydex?: string | number
  creditScore?: string | number
  dbRate?: string
  noBuyDesc?: string
  warning?: string
  credNote?: string
  rateDate?: string
  credExpireDate?: string
  calcDaysToPay1?: string | number
  calcDaysToPay2?: string | number
  calcDaysToPay3?: string | number
  calcInvCount1?: string | number
  calcInvCount2?: string | number
  calcInvCount3?: string | number
}

async function searchCompass(mcNumber: string): Promise<McCreditRecord[]> {
  const email = env('COMPASS_EMAIL')
  const password = env('COMPASS_PASSWORD')
  if (!email || !password) {
    throw new Error('Compass is not configured (COMPASS_EMAIL / COMPASS_PASSWORD).')
  }
  const base = env('COMPASS_BASE_URL') ?? 'https://cfs.compassstore.net'

  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const loginData = (await login.json()) as CompassLoginResponse
  if (!login.ok || !loginData.token) {
    throw new Error(loginData.message || loginData.msg || `Compass login failed (${login.status})`)
  }

  const params = new URLSearchParams({ mcNumber, companyName: '' })
  const response = await fetch(`${base}/api/v1/dashboard/broker-search?${params}`, {
    headers: { Authorization: `Bearer ${loginData.token}`, Accept: 'application/json' },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Compass broker search failed (${response.status}): ${text.slice(0, 180)}`)
  }
  const rows = (await response.json()) as CompassBrokerRow[]
  if (!Array.isArray(rows)) throw new Error('Unexpected Compass broker search response')

  return rows.map((row) => ({
    source: 'compass' as const,
    mc: String(row.mc ?? ''),
    company: row.company ?? '',
    dba: row.dba,
    city: row.city,
    state: row.st,
    address: row.addr1,
    phone: row.phone1,
    email: row.email,
    creditRating: row.credRate ?? '',
    paydex: row.paydex ?? '',
    creditScore: row.creditScore ?? '',
    dbRate: row.dbRate,
    noBuy: row.noBuyDesc,
    warning: row.warning,
    creditNote: row.credNote,
    rateDate: row.rateDate,
    creditExpireDate: row.credExpireDate,
    calcDaysToPay: {
      all: row.calcDaysToPay1,
      days90: row.calcDaysToPay2,
      days60: row.calcDaysToPay3,
    },
    calcInvCount: {
      all: row.calcInvCount1,
      days90: row.calcInvCount2,
      days60: row.calcInvCount3,
    },
  }))
}

type TruLoginResponse = {
  StatusResponse?: string
  InfoResponse?: string
  Token?: string
}

type TruBrokerRow = {
  MC?: string
  company?: string
  dba?: string
  city?: string
  st?: string
  addr1?: string
  phone1?: string
  email?: string | string[]
  CredRate?: string
  Paydex?: string | number
  CreditScore?: string | number
  DbRate?: string
  NoBuyDesc?: string
  Warning?: string
  CredNote?: string
  RateDate?: string
  CredExpireDate?: string
  CalcDaysToPay1?: string | number
  CalcDaysToPay2?: string | number
  CalcDaysToPay3?: string | number
  CalcInvCount1?: string | number
  CalcInvCount2?: string | number
  CalcInvCount3?: string | number
}

async function searchTruFunding(mcNumber: string): Promise<McCreditRecord[]> {
  const username = env('TRUFUNDING_USERNAME')
  const password = env('TRUFUNDING_PASSWORD')
  if (!username || !password) {
    throw new Error('TruFunding is not configured (TRUFUNDING_USERNAME / TRUFUNDING_PASSWORD).')
  }
  const base = env('TRUFUNDING_BASE_URL') ?? 'https://clients.trufunding.net'
  const loginPayload = {
    username,
    password,
    ModuleName: 'FACTORSOFTLOGISTIC',
    CallerId: 'FactorSoftClientWeb',
    code_in: 'dnCFStezzga',
  }

  const login = await fetch(`${base}/api/UserLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ data: JSON.stringify(loginPayload) }),
  })
  const loginData = (await login.json()) as TruLoginResponse
  if (!login.ok || loginData.StatusResponse !== '1' || !loginData.Token) {
    throw new Error(loginData.InfoResponse || `TruFunding login failed (${login.status})`)
  }

  const searchPayload = {
    mc: mcNumber,
    company: '',
    name: '',
    phone: '',
    username,
    token: loginData.Token,
  }
  const response = await fetch(`${base}/api/brokersearch_trufunding?source=brokersearch&data=`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ data: JSON.stringify(searchPayload) }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`TruFunding broker search failed (${response.status}): ${text.slice(0, 180)}`)
  }
  const rows = (await response.json()) as TruBrokerRow[]
  if (!Array.isArray(rows)) throw new Error('Unexpected TruFunding broker search response')

  return rows.map((row) => ({
    source: 'trufunding' as const,
    mc: String(row.MC ?? ''),
    company: row.company ?? '',
    dba: row.dba,
    city: row.city,
    state: row.st,
    address: row.addr1,
    phone: row.phone1,
    email: row.email,
    creditRating: row.CredRate ?? '',
    paydex: row.Paydex ?? '',
    creditScore: row.CreditScore ?? '',
    dbRate: row.DbRate,
    noBuy: row.NoBuyDesc,
    warning: row.Warning,
    creditNote: row.CredNote,
    rateDate: row.RateDate,
    creditExpireDate: row.CredExpireDate,
    calcDaysToPay: {
      all: row.CalcDaysToPay1,
      days90: row.CalcDaysToPay2,
      days60: row.CalcDaysToPay3,
    },
    calcInvCount: {
      all: row.CalcInvCount1,
      days90: row.CalcInvCount2,
      days60: row.CalcInvCount3,
    },
  }))
}

type FnDebtorHit = {
  uuid?: string
  companyName?: string
  mcNumber?: number | string
  mc?: number | string
  phoneNumber?: string
  address1?: string
  city?: string
  state?: string
  creditScore?: string | number | null
  averageDaysToPay?: string | number | null
  email?: string | string[] | null
  emailAddress?: string | string[] | null
  typeOfBusiness?: string
  website?: string
}

type FactorsSummary = {
  averageDaysToPay?: string
  creditScore?: string
  email?: string | string[]
}

async function searchFactorsNetwork(mcNumber: string): Promise<McCreditRecord[]> {
  const username = env('FACTORSNETWORK_USERNAME')
  const password = env('FACTORSNETWORK_PASSWORD')
  if (!username || !password) {
    throw new Error(
      'Factors Network is not configured (FACTORSNETWORK_USERNAME / FACTORSNETWORK_PASSWORD).'
    )
  }
  const base = env('FACTORSNETWORK_BASE_URL') ?? 'https://www.factorsnetwork.com'

  const login = await fetch(`${base}/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Ajax': 'true',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ username, password, rememberMe: 'off' }),
    redirect: 'manual',
  })
  const loginData = (await login.json().catch(() => null)) as {
    success?: boolean
    status?: string
  } | null
  if (!login.ok || !loginData?.success) {
    throw new Error(loginData?.status || `Factors Network login failed (${login.status})`)
  }
  const cookies = readSetCookies(login)
  if (!cookies.length) {
    throw new Error('Factors Network login succeeded but no session cookie was returned.')
  }
  const cookie = cookies
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ')

  const hits = await findFactorsDebtors(base, cookie, username, password, mcNumber)
  const primary = pickPrimaryHit(hits.filter((hit) => hit.uuid))

  return Promise.all(
    primary.map(async (hit) => {
      const extras = await fetchCurrentFactorsMetrics(base, cookie, hit, username)
      return normalizeFactors(hit, extras, hits.length)
    })
  )
}

function pickPrimaryHit(hits: FnDebtorHit[]): FnDebtorHit[] {
  if (hits.length <= 1) return hits
  const scored = [...hits].sort((a, b) => scoreHit(b) - scoreHit(a))
  return scored.slice(0, 1)
}

function scoreHit(row: FnDebtorHit): number {
  let n = 0
  const addr = (row.address1 || '').toUpperCase()
  if (/CHICAGO\s+AVENUE|W\s+CHICAGO|WEST\s+CHICAGO/.test(addr)) n += 5
  if ((row.phoneNumber || '').includes(',')) n += 2
  if (row.website) n += 1
  if (row.creditScore) n += 1
  return n
}

function presentMetric(value: string | number | null | undefined): string | undefined {
  if (value == null || value === '') return undefined
  return String(value)
}

function hitMcDigits(row: FnDebtorHit): string {
  return String(row.mcNumber ?? row.mc ?? '').replace(/\D/g, '')
}

function rowsFromFactorsPayload(data: unknown): FnDebtorHit[] {
  if (!data || typeof data !== 'object') return []
  const body = data as Record<string, unknown>
  const rows = body.debtors ?? body.creditReportdebtors ?? body.creditReportDebtors
  return Array.isArray(rows) ? (rows as FnDebtorHit[]) : []
}

function sameMc(row: FnDebtorHit, mcNumber: string): boolean {
  const digits = hitMcDigits(row)
  return digits.length > 0 && digits === mcNumber
}

async function findFactorsDebtors(
  base: string,
  cookie: string,
  username: string,
  password: string,
  mcNumber: string
): Promise<FnDebtorHit[]> {
  const byMc = new URLSearchParams({
    mcNumber,
    firstResult: '0',
    maxResults: '5',
    includeBranches: 'false',
  })
  const byName = new URLSearchParams({
    companyName: mcNumber,
    firstResult: '0',
    maxResults: '25',
  })
  const listUrl = `${base}/api/debtors.json?${byMc}`
  const publicByMc = `${base}/api/public/debtors.json?${byMc}`
  const publicByName = `${base}/api/public/debtors.json?${byName}`
  const basic = `Basic ${btoa(`${username}:${password}`)}`
  const ajax = { Accept: 'application/json', Cookie: cookie, 'X-Ajax': 'true' }
  const attempts: Array<{ url: string; method: 'GET' | 'POST'; headers: Record<string, string> }> = [
    { url: listUrl, method: 'GET', headers: ajax },
    { url: listUrl, method: 'GET', headers: { Accept: 'application/json', Authorization: basic } },
    {
      url: publicByMc,
      method: 'POST',
      headers: { ...ajax, 'Content-Type': 'application/json' },
    },
    {
      url: publicByName,
      method: 'POST',
      headers: { ...ajax, 'Content-Type': 'application/json' },
    },
  ]

  let sawMatchableResponse = false
  let lastError = ''
  for (const attempt of attempts) {
    const response = await fetch(attempt.url, {
      method: attempt.method,
      headers: attempt.headers,
      body: attempt.method === 'POST' ? JSON.stringify({ draw: 1, start: 0, length: 25 }) : undefined,
      signal: AbortSignal.timeout(12_000),
    }).catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : 'Factors Network search timed out'
      return null
    })
    if (!response) continue
    if (!response.ok) {
      lastError = `Factors Network search failed (${response.status})`
      continue
    }
    sawMatchableResponse = true
    const hits = rowsFromFactorsPayload(await response.json()).filter((row) => sameMc(row, mcNumber))
    if (hits.length) return hits
  }

  if (!sawMatchableResponse && lastError) throw new Error(lastError)
  return []
}

function emailsFromUnknown(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) return value.flatMap((item) => emailsFromUnknown(item))
  const found = String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
  return found.map((email) => email.toLowerCase())
}

function uniqueEmails(values: string[], ignore: string[] = []): string[] {
  const skipped = new Set(ignore.map((email) => email.toLowerCase()))
  const seen = new Set<string>()
  const emails: string[] = []
  for (const email of values) {
    const normalized = email.toLowerCase()
    if (skipped.has(normalized) || normalized.endsWith('@factorsnetwork.com')) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    emails.push(normalized)
  }
  return emails
}

function emailsOnHit(hit: FnDebtorHit): string[] {
  const record = hit as FnDebtorHit & Record<string, unknown>
  return uniqueEmails(
    ['email', 'emailAddress', 'emails', 'contactEmail', 'email1'].flatMap((key) =>
      emailsFromUnknown(record[key])
    )
  )
}

function asEmailField(emails: string[]): string | string[] | undefined {
  if (!emails.length) return undefined
  return emails.length === 1 ? emails[0] : emails
}

/**
 * Current score, average days to pay, and contact email when Factors Network has one.
 * The multi-year report body is not downloaded.
 */
async function fetchCurrentFactorsMetrics(
  base: string,
  cookie: string,
  hit: FnDebtorHit,
  portalUsername: string
): Promise<FactorsSummary> {
  let creditScore = presentMetric(hit.creditScore)
  let averageDaysToPay = presentMetric(hit.averageDaysToPay)
  let email = asEmailField(emailsOnHit(hit))
  if (creditScore && averageDaysToPay && email) return { creditScore, averageDaysToPay, email }
  if (!hit.uuid) return { creditScore, averageDaysToPay, email }

  const statusUrls = [
    `${base}/api/debtors/${encodeURIComponent(hit.uuid)}/credit_status.json`,
    `${base}/api/public/debtors/${encodeURIComponent(hit.uuid)}/credit_status.json`,
  ]
  for (const url of statusUrls) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Cookie: cookie, 'X-Ajax': 'true' },
      signal: AbortSignal.timeout(12_000),
    }).catch(() => null)
    if (!response?.ok) continue
    const data = (await response.json().catch(() => null)) as {
      creditStatusResponse?: {
        creditScoreActual?: string | number | null
        avgDaysToPayActual?: string | number | null
      }
      creditScoreActual?: string | number | null
      avgDaysToPayActual?: string | number | null
    } | null
    const body = data?.creditStatusResponse ?? data
    creditScore = presentMetric(body?.creditScoreActual) ?? creditScore
    averageDaysToPay = presentMetric(body?.avgDaysToPayActual) ?? averageDaysToPay
    if (creditScore && averageDaysToPay && email) return { creditScore, averageDaysToPay, email }
  }

  const fromReport = await readCurrentReportSummary(base, cookie, hit.uuid, portalUsername)
  const reportEmails = uniqueEmails(
    [
      ...emailsFromUnknown(email),
      ...emailsFromUnknown(fromReport.email),
    ],
    portalUsername.includes('@') ? [portalUsername] : []
  )
  return {
    creditScore: fromReport.creditScore ?? creditScore,
    averageDaysToPay: fromReport.averageDaysToPay ?? averageDaysToPay,
    email: asEmailField(reportEmails),
  }
}

function currentMonthParam(date = new Date()): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${month}/${date.getUTCFullYear()}`
}

function extractReportSummary(html: string, ignoreEmail: string[] = []): FactorsSummary {
  const adp =
    html.match(/\$\(["']#averageDaysToPay["']\)\.val\(["']([^"']*)["']\)/)?.[1] ??
    html.match(/id=["']averageDaysToPay["'][^>]*value=["']([^"']*)["']/i)?.[1]
  const score =
    html.match(/\$\(["']#creditScore["']\)\.val\(["']([^"']*)["']\)/)?.[1] ??
    html.match(/id=["']creditScore["'][^>]*value=["']([^"']*)["']/i)?.[1]
  const emailField =
    html.match(/\$\(["']#email(?:Address)?["']\)\.val\(["']([^"']*)["']\)/i)?.[1] ??
    html.match(/id=["']email(?:Address)?["'][^>]*value=["']([^"']*)["']/i)?.[1]
  const mailto = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((match) => match[1])
  const labeled = [...html.matchAll(/e-?mail[^@<]{0,80}([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)].map(
    (match) => match[1]
  )
  const emails = uniqueEmails(
    [
      ...emailsFromUnknown(emailField),
      ...mailto.flatMap((value) => emailsFromUnknown(value)),
      ...labeled.flatMap((value) => emailsFromUnknown(value)),
    ],
    ignoreEmail
  )
  return {
    averageDaysToPay: presentMetric(adp),
    creditScore: presentMetric(score),
    email: asEmailField(emails),
  }
}

/** Read only until the current score, ADP, and email (when present) are found, then stop. */
async function readCurrentReportSummary(
  base: string,
  cookie: string,
  uuid: string,
  portalUsername: string
): Promise<FactorsSummary> {
  const month = currentMonthParam()
  const ignoreEmail = portalUsername.includes('@') ? [portalUsername] : []
  const urls = [
    `${base}/secure/report/display?uuid=${encodeURIComponent(uuid)}&page=reportSearch`,
    `${base}/secure/report/display?uuid=${encodeURIComponent(uuid)}&page=reportSearch&start=${encodeURIComponent(month)}&end=${encodeURIComponent(month)}`,
  ]
  for (const url of urls) {
    const found = await readReportUntilSummary(url, cookie, ignoreEmail)
    if (found.averageDaysToPay && found.creditScore) return found
  }
  return {}
}

async function readReportUntilSummary(
  url: string,
  cookie: string,
  ignoreEmail: string[]
): Promise<FactorsSummary> {
  const response = await fetch(url, {
    headers: { Accept: 'text/html', Cookie: cookie },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null)
  if (!response?.ok || !response.body) return {}

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  const cap = 250_000
  try {
    while (html.length < cap) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      const found = extractReportSummary(html, ignoreEmail)
      const hasMetrics = Boolean(found.averageDaysToPay && found.creditScore)
      if (hasMetrics && (found.email || html.length >= 120_000)) return found
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return extractReportSummary(html, ignoreEmail)
}

function normalizeFactors(
  row: FnDebtorHit,
  extras: FactorsSummary,
  branchCount: number
): McCreditRecord {
  return {
    source: 'factorsnetwork',
    mc: hitMcDigits(row),
    company: row.companyName ?? '',
    city: row.city,
    state: row.state,
    address: row.address1,
    phone: row.phoneNumber,
    email: extras.email,
    creditRating: '—',
    paydex: extras.averageDaysToPay || '—',
    creditScore: extras.creditScore ?? '',
    creditNote:
      branchCount > 1
        ? `Factors Network has ${branchCount} location records for this MC. Showing the current score and average days to pay.`
        : undefined,
    warning: row.typeOfBusiness ? `Type: ${row.typeOfBusiness}` : undefined,
  }
}

export async function runMcCreditSource(
  source: McCreditSource,
  mc: string
): Promise<McCreditSourceResult> {
  try {
    const results =
      source === 'compass'
        ? await searchCompass(mc)
        : source === 'trufunding'
          ? await searchTruFunding(mc)
          : await searchFactorsNetwork(mc)
    return { source, ok: true, results }
  } catch (error) {
    return {
      source,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      results: [],
    }
  }
}
