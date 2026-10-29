import {
  authorityIdsFromCarrier,
  buildMotusReport,
  type MotusInsuranceReport,
  type MotusQuery,
} from '../../../src/utils/motusInsurance.ts'

const MOTUS = 'https://motus.dot.gov/api'

async function getJson(url: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    const text = await response.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
    }
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

function motusFailed(result: { ok: boolean; status: number }): boolean {
  return !result.ok && result.status !== 404 && result.status !== 400
}

async function getJsonRetry(url: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  let result = await getJson(url)
  for (let attempt = 1; attempt < 3 && motusFailed(result); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 600 * attempt))
    result = await getJson(url)
  }
  return result
}

async function dotForDocket(prefix: string, number: string): Promise<string | null> {
  const where = encodeURIComponent(`docket_number='${prefix}${number}'`)
  const url = `https://data.transportation.gov/resource/c5y8-a4uz.json?$select=usdot_number&$where=${where}&$limit=1`
  const result = await getJsonRetry(url)
  const row = Array.isArray(result.data) ? result.data[0] : null
  const dot = row && typeof row === 'object' ? String((row as { usdot_number?: string }).usdot_number ?? '') : ''
  const digits = dot.replace(/\D/g, '')
  return digits || null
}

async function resolveDot(query: MotusQuery): Promise<string | null> {
  if (query.kind === 'docket') return dotForDocket(query.prefix, query.number)
  const direct = await getJsonRetry(`${MOTUS}/carriers/${query.dot}`)
  if (direct.ok && direct.data && typeof direct.data === 'object') return query.dot
  return dotForDocket('MC', query.dot)
}

export type MotusFetchResult =
  | { ok: true; report: MotusInsuranceReport }
  | { ok: false; status: number; error: string }

/** Public MOTUS authority and insurance for a DOT or MC/FF/MX docket. */
export async function fetchMotusReport(query: MotusQuery): Promise<MotusFetchResult> {
  const dot = await resolveDot(query)
  if (!dot) return { ok: false, status: 404, error: 'No MOTUS account found for that number.' }

  const carrier = await getJsonRetry(`${MOTUS}/carriers/${dot}`)
  if (motusFailed(carrier)) return { ok: false, status: 502, error: 'MOTUS lookup failed' }
  if (!carrier.ok || !carrier.data || typeof carrier.data !== 'object') {
    return { ok: false, status: 404, error: 'No MOTUS account found for that number.' }
  }

  const ids = authorityIdsFromCarrier(carrier.data)
  let viewFailed = false
  const authorities = await Promise.all(
    ids.map(async (id) => {
      const [detail, minimumBipd] = await Promise.all([
        getJsonRetry(`${MOTUS}/regulatedEntity/oa/${id}/getOAPublicView`),
        getJsonRetry(`${MOTUS}/filings/minimum-bipd/${id}`),
      ])
      if (!detail.ok) viewFailed = true
      return {
        detail: detail.ok ? detail.data : null,
        minimumBipd: minimumBipd.ok ? minimumBipd.data : null,
      }
    })
  )

  const report = buildMotusReport({ dotNumber: dot, carrier: carrier.data, authorities })
  if (!report.authorities.length) {
    if (viewFailed) return { ok: false, status: 502, error: 'MOTUS lookup failed' }
    return {
      ok: false,
      status: 404,
      error: 'MOTUS has this DOT, but no operating authority was on the account.',
    }
  }
  return { ok: true, report }
}
