import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE = 'https://brokersnapshot.com/api/v2'

/** Admin staff or authenticated carrier portal user. */
function isAllowedUser(user: {
  app_metadata?: Record<string, unknown>
}): boolean {
  const meta = user.app_metadata ?? {}
  if (meta.role === 'admin') return true
  const clientId = meta.client_id
  return typeof clientId === 'string' && clientId.length > 0
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Digits-only MC/DOT from user input (MC-123456 → 123456). */
function extractDocketDigits(raw: unknown): string {
  const text = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (!text) return ''
  return text.replace(/^(MC|MX|FF)/, '')
}

function authorityLabel(code: unknown): string | null {
  if (code == null || code === '') return null
  const c = String(code).toUpperCase()
  if (c === 'A' || c === 'Y') return 'Active'
  if (c === 'I') return 'Inactive'
  if (c === 'N') return 'None'
  if (c === 'P') return 'Pending'
  return String(code)
}

function formatPhyAddress(address: Record<string, unknown> | null | undefined): string | null {
  if (!address) return null
  const parts = [address.phy_str, address.phy_city, address.phy_st, address.phy_zip]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function formatMailAddress(address: Record<string, unknown> | null | undefined): string | null {
  if (!address) return null
  const parts = [address.mai_str, address.mai_city, address.mai_st, address.mai_zip]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Map BrokerSnapshot Company payload → UI-safe summary (no raw dump). */
function summarizeCompany(data: Record<string, unknown>) {
  const general = (data.General ?? {}) as Record<string, unknown>
  const authority = (data.Authority ?? {}) as Record<string, unknown>
  const contact = (data.Contact ?? {}) as Record<string, unknown>
  const address = (data.Address ?? {}) as Record<string, unknown>
  const totals = (data.Totals ?? {}) as Record<string, unknown>
  const drivers = (data.Drivers ?? {}) as Record<string, unknown>
  const equipment = (data.EquipmentUnits ?? {}) as Record<string, unknown>
  const mileage = (data.Mileage ?? {}) as Record<string, unknown>
  const cargo = (data.CargoTransported ?? {}) as Record<string, unknown>
  const safety = (data.SafetyRating ?? {}) as Record<string, unknown>
  const activeInsurances = Array.isArray(data.ActiveInsurances)
    ? (data.ActiveInsurances as Record<string, unknown>[])
    : []
  const historyInsurances = Array.isArray(data.HistoryInsurances)
    ? (data.HistoryInsurances as Record<string, unknown>[])
    : []
  const rejectedInsurances = Array.isArray(data.RejectedInsurances)
    ? (data.RejectedInsurances as Record<string, unknown>[])
    : []
  const revocations = Array.isArray(data.Revocations)
    ? (data.Revocations as Record<string, unknown>[])
    : []

  const prefix = data.prefix != null ? String(data.prefix) : 'MC'
  const docket =
    data.docket_number != null ? String(data.docket_number) : null
  const mcNumber = docket ? `${prefix}-${docket}` : null

  const common = authorityLabel(authority.common_stat)
  const contract = authorityLabel(authority.contract_stat)
  const broker = authorityLabel(authority.broker_stat)
  const operatingStatus =
    authority.OperatingStatus != null
      ? String(authority.OperatingStatus)
      : null

  const riskFlags: string[] = []
  const hasActiveAuthority =
    common === 'Active' || contract === 'Active' || broker === 'Active'
  if (operatingStatus) {
    const op = operatingStatus.toLowerCase()
    const unauthorizedOp =
      op.includes('not authorized') ||
      op.includes('unauthorized') ||
      op.includes('out of service') ||
      op.includes('revoked') ||
      op.includes('suspended')
    // Brokers often show FMCSA "Not Authorized" while broker_stat is Active.
    if (unauthorizedOp && !hasActiveAuthority) {
      riskFlags.push('Not authorized — do not work this broker')
    } else if (!hasActiveAuthority && !op.includes('authoriz') && !op.includes('active')) {
      riskFlags.push('No clear active operating authority')
    }
  } else if (!hasActiveAuthority) {
    riskFlags.push('Authority status unclear')
  }

  if (!hasActiveAuthority && broker === 'Inactive') {
    riskFlags.push('Broker authority is inactive')
  }

  const addDate = general.add_date != null ? String(general.add_date) : null
  if (addDate) {
    const added = Date.parse(addDate)
    if (Number.isFinite(added)) {
      const ageDays = (Date.now() - added) / (1000 * 60 * 60 * 24)
      if (ageDays < 365) riskFlags.push('Authority under 1 year old')
      else if (ageDays < 730) riskFlags.push('Relatively new authority (under 2 years)')
    }
  }

  const totalTrucks = asNumber(totals.total_trucks)
  if (totalTrucks === 0) riskFlags.push('Reports zero trucks')

  // Cancellations from insurance history (rows with a cancel date).
  const cancellations = historyInsurances
    .filter((row) => row.cancel_effective_date != null && String(row.cancel_effective_date).trim())
    .map((row) => ({
      companyName:
        row.company_name != null ? String(row.company_name) : 'Unknown insurer',
      policyNumber: row.policy_number != null ? String(row.policy_number) : null,
      effectiveDate: row.effective_date != null ? String(row.effective_date) : null,
      cancelEffectiveDate:
        row.cancel_effective_date != null ? String(row.cancel_effective_date) : null,
      maxLimit: asNumber(row.bi_pd_maximum_limit),
    }))
    .sort((a, b) => {
      const da = Date.parse(a.cancelEffectiveDate ?? '') || 0
      const db = Date.parse(b.cancelEffectiveDate ?? '') || 0
      return db - da
    })

  const hasInsuranceCancellation = cancellations.length > 0
  const latestCancellationDate = cancellations[0]?.cancelEffectiveDate ?? null

  if (activeInsurances.length === 0) {
    riskFlags.push('No active insurance on file in Snapshot')
  }
  if (hasInsuranceCancellation && activeInsurances.length === 0) {
    riskFlags.push(
      latestCancellationDate
        ? `Insurance cancellation on file (${latestCancellationDate})`
        : 'Insurance cancellation on file'
    )
  }
  if (rejectedInsurances.length > 0) {
    riskFlags.push('Rejected insurance filing on record')
  }
  if (revocations.length > 0) {
    riskFlags.push('Authority revocation record on file')
  }

  const insurances = activeInsurances.slice(0, 8).map((row) => ({
    companyName: row.company_name != null ? String(row.company_name) : 'Unknown insurer',
    policyNumber: row.policy_number != null ? String(row.policy_number) : null,
    effectiveDate: row.effective_date != null ? String(row.effective_date) : null,
    maxLimit: asNumber(row.bi_pd_maximum_limit),
    formCode: asNumber(row.form_code),
  }))

  const cargoPolicy = activeInsurances.find((row) => Number(row.bi_pd_maximum_limit ?? 0) > 0)

  // Quick insurance verdict for the top of MC Lookup.
  let insuranceVerdict: 'ok' | 'missing' | 'cancelled' | 'warning' = 'ok'
  let insuranceNote = 'Broker insurance is fine.'

  if (activeInsurances.length === 0 && hasInsuranceCancellation) {
    insuranceVerdict = 'cancelled'
    insuranceNote = latestCancellationDate
      ? `Insurance cancelled — last cancel ${latestCancellationDate}. Do not book until coverage is confirmed.`
      : 'Insurance cancelled — no active coverage on file. Do not book until coverage is confirmed.'
  } else if (activeInsurances.length === 0) {
    insuranceVerdict = 'missing'
    insuranceNote = 'No active insurance on file — verify coverage before booking.'
  } else if (hasInsuranceCancellation) {
    insuranceVerdict = 'ok'
    insuranceNote = 'Broker insurance is fine — active coverage on file (older cancellations in history).'
  } else {
    insuranceVerdict = 'ok'
    const insurer =
      cargoPolicy?.company_name != null
        ? String(cargoPolicy.company_name)
        : insurances[0]?.companyName
    insuranceNote = insurer
      ? `Broker insurance is fine — active coverage (${insurer}).`
      : 'Broker insurance is fine — active coverage on file.'
  }

  return {
    found: true,
    source: 'brokersnapshot',
    companyId: data.Id != null ? String(data.Id) : null,
    name: general.name != null ? String(general.name) : null,
    mcNumber,
    dotNumber: asNumber(data.dot_number),
    statusCode: general.status_code != null ? String(general.status_code) : null,
    entityType: general.carship != null ? String(general.carship) : null,
    carrierOperation:
      general.carrier_operation != null ? String(general.carrier_operation) : null,
    operatingStatus,
    commonAuthority: common,
    contractAuthority: contract,
    brokerAuthority: broker,
    propertyAuthorized:
      typeof authority.property_chk === 'boolean' ? authority.property_chk : null,
    phyAddress: formatPhyAddress(address),
    mailAddress: formatMailAddress(address),
    phone: contact.phy_phone != null ? String(contact.phy_phone) : null,
    fax: contact.phy_fax != null ? String(contact.phy_fax) : null,
    email: contact.email_address != null ? String(contact.email_address) : null,
    officer:
      contact.company_officer_1 != null ? String(contact.company_officer_1) : null,
    officer2:
      contact.company_officer_2 != null ? String(contact.company_officer_2) : null,
    totalTrucks,
    totalPowerUnits: asNumber(totals.total_pwr),
    totalDrivers: asNumber(drivers.total_drivers),
    ownTractors: asNumber(equipment.owntract),
    ownTrailers: asNumber(equipment.owntrail),
    mileage: asNumber(mileage.mcs150_mileage),
    mileageYear: asNumber(mileage.mcs150_mileage_year),
    activeInsuranceCount: activeInsurances.length,
    primaryInsurer:
      cargoPolicy?.company_name != null
        ? String(cargoPolicy.company_name)
        : insurances[0]?.companyName ?? null,
    insurances,
    cancellations: cancellations.slice(0, 5),
    hasInsuranceCancellation,
    latestCancellationDate,
    insuranceVerdict,
    insuranceNote,
    safetyRating:
      safety.safety_rating != null ? String(safety.safety_rating) : null,
    safetyRatingDate:
      safety.safety_rating_date != null ? String(safety.safety_rating_date) : null,
    addDate,
    changeDate: general.chgn_date != null ? String(general.chgn_date) : null,
    cargoGeneralFreight:
      typeof cargo.genfreight === 'boolean' ? cargo.genfreight : null,
    cargoHazmat: typeof cargo.hm_ind === 'boolean' ? cargo.hm_ind : null,
    riskFlags,
  }
}

async function fetchCompany(
  apiKey: string,
  params: URLSearchParams
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const url = `${API_BASE}/Company?${params.toString()}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'X-Null-Value': 'include',
    },
  })
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  return { ok: response.ok, status: response.status, body }
}

const TTL_DAYS_DEFAULT = 30
const TTL_DAYS_INSURANCE_WATCH = 5

type SnapshotTtlConfig = {
  cacheTtlDays: number
  insuranceWatchTtlDays: number
}

let ttlCache: { at: number; value: SnapshotTtlConfig } | null = null
const TTL_SETTINGS_CACHE_MS = 60_000

function clampTtlDays(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(Math.floor(n), 365)
}

async function loadSnapshotTtlConfig(
  admin: ReturnType<typeof adminClient>
): Promise<SnapshotTtlConfig> {
  if (ttlCache && Date.now() - ttlCache.at < TTL_SETTINGS_CACHE_MS) {
    return ttlCache.value
  }

  try {
    const { data } = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'broker_snapshot_ttl')
      .maybeSingle()

    const raw = (data?.value ?? {}) as Record<string, unknown>
    const value: SnapshotTtlConfig = {
      cacheTtlDays: clampTtlDays(raw.cacheTtlDays, TTL_DAYS_DEFAULT),
      insuranceWatchTtlDays: clampTtlDays(raw.insuranceWatchTtlDays, TTL_DAYS_INSURANCE_WATCH),
    }
    ttlCache = { at: Date.now(), value }
    return value
  } catch {
    return {
      cacheTtlDays: TTL_DAYS_DEFAULT,
      insuranceWatchTtlDays: TTL_DAYS_INSURANCE_WATCH,
    }
  }
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
}

function normalizeCompare(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,#]/g, '')
}

async function computeNextReviewAt(
  admin: ReturnType<typeof adminClient>,
  summary: Record<string, unknown>
): Promise<string> {
  const ttl = await loadSnapshotTtlConfig(admin)
  const verdict = String(summary.insuranceVerdict ?? 'ok')
  const watch =
    verdict !== 'ok' || Number(summary.activeInsuranceCount ?? 0) === 0
  const days = watch ? ttl.insuranceWatchTtlDays : ttl.cacheTtlDays
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
}

/** Record who looked up this MC (carriers). Never fail the lookup if logging fails. */
async function logLookupEvent(
  admin: ReturnType<typeof adminClient>,
  args: {
    snapshotId: string | null
    mcNumber: string
    digits: string
    clientId: string | null
    fromCache: boolean
    insuranceVerdict: string | null
    legalName: string | null
  }
): Promise<void> {
  try {
    await admin.from('broker_snapshot_lookup_events').insert({
      id: newId('bslu'),
      snapshot_id: args.snapshotId,
      mc_number: args.mcNumber,
      mc_digits: args.digits,
      client_id: args.clientId,
      from_cache: args.fromCache,
      insurance_verdict: args.insuranceVerdict,
      legal_name: args.legalName,
    })
  } catch (err) {
    console.error('lookup event log failed', err)
  }
}

type DiffRow = {
  field_key: string
  field_label: string
  old_value: string | null
  new_value: string | null
}

function buildBrokerDiffs(
  broker: Record<string, unknown> | null,
  summary: Record<string, unknown>
): DiffRow[] {
  const diffs: DiffRow[] = []
  const push = (
    key: string,
    label: string,
    oldVal: string | null | undefined,
    newVal: string | null | undefined
  ) => {
    const o = (oldVal ?? '').trim() || null
    const n = (newVal ?? '').trim() || null
    if (!n) return
    if (normalizeCompare(o) === normalizeCompare(n)) return
    diffs.push({ field_key: key, field_label: label, old_value: o, new_value: n })
  }

  if (!broker) {
    diffs.push({
      field_key: 'broker_record',
      field_label: 'Add broker to Credyx',
      old_value: null,
      new_value: [
        summary.name != null ? String(summary.name) : 'Unknown',
        summary.mcNumber != null ? String(summary.mcNumber) : null,
        summary.dotNumber != null ? `DOT ${summary.dotNumber}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })
    return diffs
  }

  push('name', 'Legal name', broker.name as string, summary.name as string)
  push(
    'dot_number',
    'DOT number',
    broker.dot_number as string,
    summary.dotNumber != null ? String(summary.dotNumber) : null
  )
  push('phone', 'Phone', broker.phone as string, summary.phone as string)
  push('fax', 'Fax', broker.fax as string, summary.fax as string)
  push('email', 'Email', broker.email as string, summary.email as string)
  push(
    'contact_person',
    'Contact / officer',
    broker.contact_person as string,
    summary.officer as string
  )
  push('address', 'Address', broker.address as string, summary.phyAddress as string)

  const oldIns = (broker.carrier_notes as string) || ''
  const insNote =
    summary.insuranceNote != null ? String(summary.insuranceNote) : null
  const verdict = String(summary.insuranceVerdict ?? '')
  if (verdict && verdict !== 'ok') {
    push(
      'insurance_status',
      'Insurance status',
      oldIns.includes('insurance') ? oldIns.slice(0, 120) : 'Active / unknown in Credyx',
      insNote
    )
  }

  const brokerAuthActive =
    String(summary.brokerAuthority ?? '').toLowerCase() === 'active' ||
    String(summary.commonAuthority ?? '').toLowerCase() === 'active' ||
    String(summary.contractAuthority ?? '').toLowerCase() === 'active'
  if (summary.operatingStatus && !brokerAuthActive) {
    const op = String(summary.operatingStatus).toLowerCase()
    if (
      op.includes('not authorized') ||
      op.includes('unauthorized') ||
      op.includes('out of service') ||
      op.includes('revoked') ||
      op.includes('suspended') ||
      op.includes('inactive')
    ) {
      push(
        'operating_status',
        'Operating status',
        'Expected active / authorized',
        String(summary.operatingStatus)
      )
    }
  }

  return diffs
}

async function fetchSnapshotCompany(
  apiKey: string,
  prefix: string,
  digits: string
): Promise<Record<string, unknown> | null> {
  const params = new URLSearchParams({
    prefix,
    docket: digits,
    include: '3',
    includeInsurance: '23',
    includeSos: '0',
    includeSms: '0',
    includeReview: '0',
  })
  const result = await fetchCompany(apiKey, params)
  if (result.ok && result.body.Data) {
    return summarizeCompany(result.body.Data as Record<string, unknown>) as Record<
      string,
      unknown
    >
  }

  const listUrl = `${API_BASE}/Companies?prefix=${encodeURIComponent(prefix)}&docket=${encodeURIComponent(digits)}&include=3&includeInsurance=1&limit=1`
  const listRes = await fetch(listUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'X-Null-Value': 'include',
    },
  })
  const listBody = (await listRes.json().catch(() => ({}))) as Record<string, unknown>
  const rows = Array.isArray(listBody.Data) ? listBody.Data : []
  if (!listRes.ok || rows.length === 0) return null
  return summarizeCompany(rows[0] as Record<string, unknown>) as Record<string, unknown>
}

async function persistSnapshotAndDiffs(
  admin: ReturnType<typeof adminClient>,
  summary: Record<string, unknown>,
  digits: string,
  existingSnapshotId?: string | null
): Promise<{ snapshotId: string; pendingChanges: number }> {
  const mcNumber =
    summary.mcNumber != null ? String(summary.mcNumber) : `MC-${digits}`
  const now = new Date().toISOString()
  const nextReviewAt = await computeNextReviewAt(admin, summary)

  const { data: brokerRows } = await admin
    .from('brokers')
    .select(
      'id, name, contact_person, email, phone, fax, address, city, state, zip, mc_number, dot_number, carrier_notes, notes'
    )
    .ilike('mc_number', `%${digits}%`)
    .limit(20)

  const brokers = (brokerRows ?? []) as Record<string, unknown>[]
  const broker =
    brokers.find((b) => {
      const mc = String(b.mc_number ?? '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .replace(/^MC/, '')
      return mc === digits
    }) ?? null

  const snapshotId = existingSnapshotId || newId('bsnap')
  const row = {
    id: snapshotId,
    broker_id: broker?.id != null ? String(broker.id) : null,
    mc_number: mcNumber,
    mc_digits: digits,
    dot_number: summary.dotNumber != null ? String(summary.dotNumber) : null,
    company_id: summary.companyId != null ? String(summary.companyId) : null,
    legal_name: summary.name != null ? String(summary.name) : null,
    payload: summary,
    insurance_verdict:
      summary.insuranceVerdict != null ? String(summary.insuranceVerdict) : null,
    fetched_at: now,
    next_review_at: nextReviewAt,
    last_lookup_at: now,
    needs_broker_add: !broker,
    updated_at: now,
  }

  if (existingSnapshotId) {
    const { data: prev } = await admin
      .from('broker_external_snapshots')
      .select('lookup_count')
      .eq('id', existingSnapshotId)
      .maybeSingle()
    const prevCount = Number((prev as { lookup_count?: number } | null)?.lookup_count ?? 0)
    await admin
      .from('broker_external_snapshots')
      .update({
        ...row,
        lookup_count: prevCount + 1,
      })
      .eq('id', existingSnapshotId)
  } else {
    await admin.from('broker_external_snapshots').upsert({
      ...row,
      lookup_count: 1,
      created_at: now,
    })
  }

  // Mark previous pending diffs stale, then insert fresh pending set.
  await admin
    .from('broker_snapshot_changes')
    .update({ status: 'stale' })
    .eq('snapshot_id', snapshotId)
    .eq('status', 'pending')

  const diffs = buildBrokerDiffs(broker, summary)
  if (diffs.length > 0) {
    const changeRows = diffs.map((d) => ({
      id: newId('bschg'),
      snapshot_id: snapshotId,
      broker_id: broker?.id != null ? String(broker.id) : null,
      mc_number: mcNumber,
      field_key: d.field_key,
      field_label: d.field_label,
      old_value: d.old_value,
      new_value: d.new_value,
      status: 'pending',
      created_at: now,
    }))
    await admin.from('broker_snapshot_changes').insert(changeRows)

    await admin.from('admin_notifications').insert({
      id: newId('admin-notif-bsnap'),
      type: 'batch_submitted',
      title: broker ? 'Broker Snapshot changes' : 'New broker from MC Lookup',
      message: broker
        ? `${mcNumber}: ${diffs.length} field change(s) vs Credyx directory`
        : `${mcNumber}: carrier looked up a broker not in Credyx — review to add`,
      timestamp: now,
      read: false,
      link: '/admin/broker-snapshot',
      link_label: 'Review changes',
      metadata: { mc_number: mcNumber, change_count: diffs.length },
    })
  }

  return { snapshotId, pendingChanges: diffs.length }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
    if (!isAllowedUser(userData.user)) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }
    const lookupClientId =
      typeof userData.user.app_metadata?.client_id === 'string'
        ? String(userData.user.app_metadata.client_id)
        : null

    const apiKey = Deno.env.get('BROKERSNAPSHOT_API_KEY')
    if (!apiKey) {
      return jsonResponse({ error: 'BrokerSnapshot not configured' }, 500)
    }

    const payload = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >
    const action = String(payload.action ?? 'lookupByMc')
    const admin = adminClient()

    if (action === 'lookupByMc') {
      const digits = extractDocketDigits(payload.mc ?? payload.mc_number)
      if (!digits || digits.length < 4) {
        return jsonResponse({ error: 'Provide a valid MC number (at least 4 digits)' }, 400)
      }

      const prefix = String(payload.prefix ?? 'MC').toUpperCase()
      const forceRefresh = Boolean(payload.forceRefresh)
      const nowIso = new Date().toISOString()

      // Shared cache — many carriers looking up the same MC share one Snapshot pull.
      const { data: cached } = await admin
        .from('broker_external_snapshots')
        .select('id, payload, next_review_at, fetched_at, lookup_count, needs_broker_add')
        .eq('mc_digits', digits)
        .maybeSingle()

      const cacheRow = cached as {
        id: string
        payload: Record<string, unknown>
        next_review_at: string
        fetched_at: string
        lookup_count: number
        needs_broker_add: boolean
      } | null

      const cacheFresh =
        cacheRow &&
        !forceRefresh &&
        cacheRow.next_review_at &&
        cacheRow.next_review_at > nowIso &&
        cacheRow.payload?.found === true

      if (cacheFresh && cacheRow) {
        await admin
          .from('broker_external_snapshots')
          .update({
            last_lookup_at: nowIso,
            lookup_count: Number(cacheRow.lookup_count ?? 1) + 1,
            updated_at: nowIso,
          })
          .eq('id', cacheRow.id)

        const cachedPayload = cacheRow.payload ?? {}
        await logLookupEvent(admin, {
          snapshotId: cacheRow.id,
          mcNumber:
            cachedPayload.mcNumber != null
              ? String(cachedPayload.mcNumber)
              : `${prefix}-${digits}`,
          digits,
          clientId: lookupClientId,
          fromCache: true,
          insuranceVerdict:
            cachedPayload.insuranceVerdict != null
              ? String(cachedPayload.insuranceVerdict)
              : null,
          legalName:
            cachedPayload.name != null ? String(cachedPayload.name) : null,
        })

        return jsonResponse({
          Success: true,
          Data: {
            ...cacheRow.payload,
            _meta: {
              fromCache: true,
              fetchedAt: cacheRow.fetched_at,
              nextReviewAt: cacheRow.next_review_at,
              needsBrokerAdd: cacheRow.needs_broker_add,
            },
          },
        })
      }

      const summary = await fetchSnapshotCompany(apiKey, prefix, digits)
      if (!summary) {
        await logLookupEvent(admin, {
          snapshotId: cacheRow?.id ?? null,
          mcNumber: `${prefix}-${digits}`,
          digits,
          clientId: lookupClientId,
          fromCache: false,
          insuranceVerdict: null,
          legalName: null,
        })
        return jsonResponse({
          Success: true,
          Data: { found: false, mcNumber: `${prefix}-${digits}`, riskFlags: [] },
        })
      }

      try {
        const { pendingChanges, snapshotId } = await persistSnapshotAndDiffs(
          admin,
          summary,
          digits,
          cacheRow?.id ?? null
        )
        await logLookupEvent(admin, {
          snapshotId,
          mcNumber:
            summary.mcNumber != null ? String(summary.mcNumber) : `${prefix}-${digits}`,
          digits,
          clientId: lookupClientId,
          fromCache: false,
          insuranceVerdict:
            summary.insuranceVerdict != null ? String(summary.insuranceVerdict) : null,
          legalName: summary.name != null ? String(summary.name) : null,
        })
        const { data: snapAfter } = await admin
          .from('broker_external_snapshots')
          .select('fetched_at, next_review_at, needs_broker_add')
          .eq('mc_digits', digits)
          .maybeSingle()

        return jsonResponse({
          Success: true,
          Data: {
            ...summary,
            _meta: {
              fromCache: false,
              fetchedAt: (snapAfter as { fetched_at?: string } | null)?.fetched_at ?? nowIso,
              nextReviewAt:
                (snapAfter as { next_review_at?: string } | null)?.next_review_at ??
                (await computeNextReviewAt(admin, summary)),
              needsBrokerAdd: !summary ? false : Boolean(
                (snapAfter as { needs_broker_add?: boolean } | null)?.needs_broker_add
              ),
              pendingChanges,
            },
          },
        })
      } catch (persistErr) {
        // Still return Snapshot data if cache write fails.
        console.error('snapshot persist failed', persistErr)
        return jsonResponse({
          Success: true,
          Data: {
            ...summary,
            _meta: {
              fromCache: false,
              fetchedAt: nowIso,
              nextReviewAt: await computeNextReviewAt(admin, summary),
              persistError: true,
            },
          },
        })
      }
    }

    if (action === 'lookupByDot') {
      const dot = String(payload.dot ?? '').replace(/\D/g, '')
      if (!dot) return jsonResponse({ error: 'Provide a DOT number' }, 400)
      const params = new URLSearchParams({
        dot,
        include: '3',
        includeInsurance: '23',
        includeSos: '0',
      })
      const result = await fetchCompany(apiKey, params)
      if (!result.ok || !result.body.Data) {
        return jsonResponse({
          Success: true,
          Data: { found: false, dotNumber: Number(dot), riskFlags: [] },
        })
      }
      return jsonResponse({
        Success: true,
        Data: summarizeCompany(result.body.Data as Record<string, unknown>),
      })
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Proxy error'
    return jsonResponse({ error: message }, 500)
  }
})
