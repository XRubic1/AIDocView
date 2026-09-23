import { getSupabase, isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import {
  lookupBrokerSnapshotByDot,
  lookupBrokerSnapshotByMc,
} from './brokerSnapshotService'
import type { BrokerSnapshotSummary } from '../types/brokerSnapshot'
import {
  fleetSizeFromSnapshot,
  formatSalesGradeWhy,
  rateSalesLeadFromSnapshot,
  SALES_LEAD_RATING_POLICY,
  yearsFromAddDate,
  type SalesChaseGrade,
  type SalesGradeBreakdown,
  type SalesLeadRatingPolicy,
} from '../utils/salesLeadRating'
import { loadSalesLeadRatingPolicy } from './platformSettingsService'

export type SalesLeadStatus =
  | 'new'
  | 'researching'
  | 'contacted'
  | 'replied'
  | 'converted'
  | 'declined'
  | 'skipped'

export type SalesLeadLookupBy = 'mc' | 'dot'

export interface SalesLead {
  id: string
  mc_number: string
  mc_digits: string
  company_name: string | null
  dot_number: number | null
  contact_phone: string | null
  contact_email: string | null
  officer: string | null
  phy_address: string | null
  operating_status: string | null
  add_date: string | null
  years_in_business: number | null
  total_trucks: number | null
  total_power_units: number | null
  total_drivers: number | null
  chase_grade: SalesChaseGrade
  grade_breakdown: SalesGradeBreakdown
  /** Plain-English ranking explanation. */
  grade_why: string
  snapshot: BrokerSnapshotSummary | null
  status: SalesLeadStatus
  notes: string | null
  last_lookup_at: string | null
  created_at: string
  updated_at: string
}

const LEAD_SELECT =
  'id, mc_number, mc_digits, company_name, dot_number, contact_phone, contact_email, officer, phy_address, operating_status, add_date, years_in_business, total_trucks, total_power_units, total_drivers, chase_grade, grade_breakdown, snapshot, status, notes, last_lookup_at, created_at, updated_at'

/** Normalize MC to digits-only key. */
export function normalizeMcDigits(mc: string): string {
  return mc.trim().toUpperCase().replace(/[^0-9]/g, '')
}

/** Normalize DOT to digits-only. */
export function normalizeDotDigits(dot: string): string {
  return dot.trim().replace(/\D/g, '')
}

/** Synthetic mc_digits for DOT-only leads (avoids empty-string unique collisions). */
function syntheticDotMcDigits(dot: number | string): string {
  return `DOT:${String(dot).replace(/\D/g, '')}`
}

function isSyntheticDotMcDigits(mcDigits: string): boolean {
  return mcDigits.startsWith('DOT:')
}

function formatMcDisplay(digits: string, snapshotMc?: string | null): string {
  if (snapshotMc?.trim()) return snapshotMc.trim().toUpperCase()
  return digits ? `MC-${digits}` : ''
}

function mapRow(row: Record<string, unknown>): SalesLead {
  const breakdownRaw = (row.grade_breakdown ?? {}) as Partial<SalesGradeBreakdown>
  const grade = String(row.chase_grade || 'C').toUpperCase()
  const chase_grade = (['A', 'B', 'C', 'D', 'F'].includes(grade) ? grade : 'C') as SalesChaseGrade

  const grade_breakdown: SalesGradeBreakdown = {
    years_in_business: breakdownRaw.years_in_business ?? null,
    trucks: breakdownRaw.trucks ?? null,
    years_grade: breakdownRaw.years_grade ?? null,
    trucks_grade: breakdownRaw.trucks_grade ?? null,
    combined_grade: breakdownRaw.combined_grade ?? chase_grade,
    forced_f_reason: breakdownRaw.forced_f_reason ?? null,
    demotions: Array.isArray(breakdownRaw.demotions) ? breakdownRaw.demotions : [],
    notes: Array.isArray(breakdownRaw.notes) ? breakdownRaw.notes : [],
    summary: typeof breakdownRaw.summary === 'string' ? breakdownRaw.summary : '',
  }

  return {
    id: String(row.id),
    mc_number: String(row.mc_number ?? ''),
    mc_digits: String(row.mc_digits ?? ''),
    company_name: (row.company_name as string | null) ?? null,
    dot_number: typeof row.dot_number === 'number' ? row.dot_number : null,
    contact_phone: (row.contact_phone as string | null) ?? null,
    contact_email: (row.contact_email as string | null) ?? null,
    officer: (row.officer as string | null) ?? null,
    phy_address: (row.phy_address as string | null) ?? null,
    operating_status: (row.operating_status as string | null) ?? null,
    add_date: (row.add_date as string | null) ?? null,
    years_in_business:
      typeof row.years_in_business === 'number' ? row.years_in_business : null,
    total_trucks: typeof row.total_trucks === 'number' ? row.total_trucks : null,
    total_power_units:
      typeof row.total_power_units === 'number' ? row.total_power_units : null,
    total_drivers: typeof row.total_drivers === 'number' ? row.total_drivers : null,
    chase_grade,
    grade_breakdown,
    grade_why: formatSalesGradeWhy(grade_breakdown),
    snapshot: (row.snapshot as BrokerSnapshotSummary | null) ?? null,
    status: (row.status as SalesLeadStatus) || 'new',
    notes: (row.notes as string | null) ?? null,
    last_lookup_at: (row.last_lookup_at as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function buildLeadFields(
  snapshot: BrokerSnapshotSummary,
  policy: SalesLeadRatingPolicy,
  fallback?: { mcDigits?: string; dotNumber?: number | null }
) {
  const realMcDigits =
    normalizeMcDigits(snapshot.mcNumber ?? '') ||
    (fallback?.mcDigits ? normalizeMcDigits(fallback.mcDigits) : '')
  const breakdown = rateSalesLeadFromSnapshot(snapshot, policy)
  const trucks = fleetSizeFromSnapshot(snapshot)
  const years = yearsFromAddDate(snapshot.addDate)
  const dotFromSnapshot =
    typeof snapshot.dotNumber === 'number' && Number.isFinite(snapshot.dotNumber)
      ? snapshot.dotNumber
      : null
  const dot_number = dotFromSnapshot ?? fallback?.dotNumber ?? null

  // DOT-only leads need a unique mc_digits key so empty "" does not collide
  // with every other DOT-only row (false "already on list" errors).
  const mc_digits =
    realMcDigits ||
    (dot_number != null ? syntheticDotMcDigits(dot_number) : '')

  return {
    mc_number: realMcDigits
      ? formatMcDisplay(realMcDigits, snapshot.mcNumber)
      : dot_number != null
        ? `DOT ${dot_number}`
        : formatMcDisplay('', snapshot.mcNumber),
    mc_digits,
    company_name: snapshot.name ?? null,
    dot_number,
    contact_phone: snapshot.phone ?? null,
    contact_email: snapshot.email ?? null,
    officer: snapshot.officer ?? null,
    phy_address: snapshot.phyAddress ?? null,
    operating_status: snapshot.operatingStatus ?? null,
    add_date: snapshot.addDate ? snapshot.addDate.slice(0, 10) : null,
    years_in_business: years,
    total_trucks: typeof snapshot.totalTrucks === 'number' ? snapshot.totalTrucks : trucks,
    total_power_units:
      typeof snapshot.totalPowerUnits === 'number' ? snapshot.totalPowerUnits : null,
    total_drivers: typeof snapshot.totalDrivers === 'number' ? snapshot.totalDrivers : null,
    chase_grade: breakdown.combined_grade,
    grade_breakdown: breakdown,
    snapshot,
    last_lookup_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/** Describe an existing lead for duplicate errors. */
function formatExistingLeadLabel(lead: {
  company_name: string | null
  mc_number: string
  mc_digits: string
  dot_number: number | null
  chase_grade: string
}): string {
  const name = lead.company_name?.trim() || 'Unknown company'
  const mc = isSyntheticDotMcDigits(lead.mc_digits)
    ? null
    : lead.mc_number || (lead.mc_digits ? `MC-${lead.mc_digits}` : null)
  const parts = [
    name,
    mc,
    lead.dot_number != null ? `DOT ${lead.dot_number}` : null,
    `grade ${lead.chase_grade}`,
  ].filter(Boolean)
  return parts.join(' · ')
}

/** Find an existing lead by MC digits and/or DOT. */
async function findExistingSalesLead(args: {
  mcDigits?: string
  dotNumber?: number | null
}): Promise<SalesLead | null> {
  const supabase = requireSupabase()
  const mcDigits = args.mcDigits?.trim() ?? ''
  const realMc = mcDigits && !isSyntheticDotMcDigits(mcDigits) ? mcDigits : ''

  if (realMc) {
    const { data, error } = await supabase
      .from('sales_leads')
      .select(LEAD_SELECT)
      .eq('mc_digits', realMc)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return mapRow(data as Record<string, unknown>)
  }

  if (args.dotNumber != null && Number.isFinite(args.dotNumber)) {
    const { data, error } = await supabase
      .from('sales_leads')
      .select(LEAD_SELECT)
      .eq('dot_number', args.dotNumber)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return mapRow(data as Record<string, unknown>)

    // Older DOT-only rows may use synthetic mc_digits key.
    const { data: byKey, error: keyErr } = await supabase
      .from('sales_leads')
      .select(LEAD_SELECT)
      .eq('mc_digits', syntheticDotMcDigits(args.dotNumber))
      .maybeSingle()
    if (keyErr) throw new Error(keyErr.message)
    if (byKey) return mapRow(byKey as Record<string, unknown>)
  }

  return null
}

async function insertLead(
  fields: ReturnType<typeof buildLeadFields>,
  label: string
): Promise<SalesLead> {
  const supabase = requireSupabase()

  const existing = await findExistingSalesLead({
    mcDigits: fields.mc_digits,
    dotNumber: fields.dot_number,
  })
  if (existing) {
    throw new Error(
      `${label} is already on your sales list as ${formatExistingLeadLabel(existing)}. Clear the grade filter or search for that company.`
    )
  }

  const { data, error } = await supabase
    .from('sales_leads')
    .insert({
      ...fields,
      status: 'new',
    })
    .select(LEAD_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      // Race or leftover unique index — resolve which row blocked the insert.
      const again = await findExistingSalesLead({
        mcDigits: fields.mc_digits,
        dotNumber: fields.dot_number,
      })
      if (again) {
        throw new Error(
          `${label} is already on your sales list as ${formatExistingLeadLabel(again)}. Clear the grade filter or search for that company.`
        )
      }
      throw new Error(
        `${label} could not be added (duplicate key). Another lead may share this MC or DOT — try Refresh on the list or search by company name.`
      )
    }
    throw new Error(error.message)
  }

  return mapRow(data as Record<string, unknown>)
}

/** List sales leads, newest first. */
export async function listSalesLeads(): Promise<SalesLead[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('sales_leads')
    .select(LEAD_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>))
}

/**
 * Look up MC via BrokerSnapshot and insert a sales lead.
 * Throws if MC is empty or already on the list.
 */
export async function addSalesLeadByMc(mc: string): Promise<SalesLead> {
  const digits = normalizeMcDigits(mc)
  if (!digits) throw new Error('Enter a valid MC number')

  const policy = await loadSalesLeadRatingPolicy()
  Object.assign(SALES_LEAD_RATING_POLICY, policy)

  const snapshot = await lookupBrokerSnapshotByMc(mc)
  const fields = buildLeadFields(snapshot, policy, { mcDigits: digits })
  return insertLead(fields, `MC ${fields.mc_number || digits}`)
}

/**
 * Look up USDOT via BrokerSnapshot and insert a sales lead.
 * Uses returned MC when present for dedupe.
 */
export async function addSalesLeadByDot(dot: string): Promise<SalesLead> {
  const digits = normalizeDotDigits(dot)
  if (!digits) throw new Error('Enter a valid DOT number')

  const policy = await loadSalesLeadRatingPolicy()
  Object.assign(SALES_LEAD_RATING_POLICY, policy)

  const snapshot = await lookupBrokerSnapshotByDot(digits)
  const fields = buildLeadFields(snapshot, policy, {
    mcDigits: snapshot.mcNumber ?? '',
    dotNumber: Number(digits),
  })

  // Ensure DOT is stored even when Snapshot omits it on a miss.
  if (fields.dot_number == null) {
    fields.dot_number = Number(digits)
  }

  return insertLead(fields, `DOT ${digits}`)
}

/** Add a lead by MC or DOT. */
export async function addSalesLead(
  value: string,
  by: SalesLeadLookupBy
): Promise<SalesLead> {
  return by === 'dot' ? addSalesLeadByDot(value) : addSalesLeadByMc(value)
}

/**
 * Parse a notepad blob of DOTs separated by commas (also tolerates newlines / spaces).
 * Returns unique digit strings in order first-seen.
 */
export function parseDotNotepad(raw: string): string[] {
  const parts = raw.split(/[,\n\r\t;|]+/)
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const digits = normalizeDotDigits(part)
    if (digits.length < 4 || digits.length > 10) continue
    if (seen.has(digits)) continue
    seen.add(digits)
    out.push(digits)
  }
  return out
}

export type DotNotepadBatchItemResult =
  | { dot: string; status: 'added'; lead: SalesLead }
  | { dot: string; status: 'skipped'; reason: string }
  | { dot: string; status: 'error'; reason: string }

export type DotNotepadBatchResult = {
  added: SalesLead[]
  skipped: Array<{ dot: string; reason: string }>
  errors: Array<{ dot: string; reason: string }>
  items: DotNotepadBatchItemResult[]
}

const DOT_BATCH_DELAY_MS = 250 // stay under BrokerSnapshot ~5 req/sec

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Look up each DOT and insert sales leads. Skips duplicates; continues on errors.
 * Calls onProgress after each DOT (1-based index).
 */
export async function addSalesLeadsFromDotNotepad(
  raw: string,
  onProgress?: (done: number, total: number, item: DotNotepadBatchItemResult) => void
): Promise<DotNotepadBatchResult> {
  const dots = parseDotNotepad(raw)
  const result: DotNotepadBatchResult = {
    added: [],
    skipped: [],
    errors: [],
    items: [],
  }

  for (let i = 0; i < dots.length; i++) {
    const dot = dots[i]
    let item: DotNotepadBatchItemResult
    try {
      const lead = await addSalesLeadByDot(dot)
      item = { dot, status: 'added', lead }
      result.added.push(lead)
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Lookup failed'
      const isDup = /already on your sales list/i.test(reason)
      if (isDup) {
        item = { dot, status: 'skipped', reason }
        result.skipped.push({ dot, reason })
      } else {
        item = { dot, status: 'error', reason }
        result.errors.push({ dot, reason })
      }
    }
    result.items.push(item)
    onProgress?.(i + 1, dots.length, item)
    if (i < dots.length - 1) await sleep(DOT_BATCH_DELAY_MS)
  }

  return result
}

/** Re-fetch BrokerSnapshot and re-score an existing lead. */
export async function refreshSalesLead(leadId: string): Promise<SalesLead> {
  const supabase = requireSupabase()
  const { data: existing, error: fetchError } = await supabase
    .from('sales_leads')
    .select('mc_number, mc_digits, dot_number')
    .eq('id', leadId)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)
  if (!existing) throw new Error('Lead not found')

  const policy = await loadSalesLeadRatingPolicy()
  Object.assign(SALES_LEAD_RATING_POLICY, policy)

  const mcRaw = String(existing.mc_number || existing.mc_digits || '')
  const mcDigits = isSyntheticDotMcDigits(String(existing.mc_digits ?? ''))
    ? ''
    : normalizeMcDigits(mcRaw)
  const dot =
    typeof existing.dot_number === 'number'
      ? String(existing.dot_number)
      : isSyntheticDotMcDigits(String(existing.mc_digits ?? ''))
        ? String(existing.mc_digits).replace(/^DOT:/, '')
        : ''

  let snapshot: BrokerSnapshotSummary
  if (mcDigits) {
    snapshot = await lookupBrokerSnapshotByMc(mcDigits)
  } else if (dot) {
    snapshot = await lookupBrokerSnapshotByDot(dot)
  } else {
    throw new Error('Lead has no MC or DOT to refresh')
  }

  const fields = buildLeadFields(snapshot, policy, {
    mcDigits,
    dotNumber: dot ? Number(dot) : null,
  })

  const { data, error } = await supabase
    .from('sales_leads')
    .update(fields)
    .eq('id', leadId)
    .select(LEAD_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return mapRow(data as Record<string, unknown>)
}

/** Update pipeline status / notes. */
export async function updateSalesLead(
  leadId: string,
  patch: { status?: SalesLeadStatus; notes?: string | null; chase_grade?: SalesChaseGrade }
): Promise<SalesLead> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('sales_leads')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .select(LEAD_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return mapRow(data as Record<string, unknown>)
}

/** Remove a lead from the list. */
export async function deleteSalesLead(leadId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.from('sales_leads').delete().eq('id', leadId)
  if (error) throw new Error(error.message)
}

/** Count leads by chase grade for summary cards. */
export function summarizeSalesLeads(leads: SalesLead[]): Record<SalesChaseGrade | 'all', number> {
  const summary: Record<SalesChaseGrade | 'all', number> = {
    all: leads.length,
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    F: 0,
  }
  for (const lead of leads) {
    summary[lead.chase_grade] += 1
  }
  return summary
}

export { formatSalesGradeWhy }
