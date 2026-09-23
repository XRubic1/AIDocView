import type { BrokerSnapshotSummary } from '../types/brokerSnapshot'

/** Chase-worthiness letter grade for cold outreach (A = chase first). */
export type SalesChaseGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export const SALES_CHASE_GRADES: SalesChaseGrade[] = ['A', 'B', 'C', 'D', 'F']

/** How years + trucks factor grades combine into one letter. */
export type SalesGradeCombineMode = 'average' | 'worse' | 'better'

/**
 * Adjustable thresholds for rating carrier leads from BrokerSnapshot.
 * Years / trucks cutoffs are “max inclusive” for each letter before falling to the next.
 */
export const DEFAULT_SALES_LEAD_RATING_POLICY = {
  /**
   * Years in business (from FMCSA add_date). Newer carriers often lack A/R help → better chase grade.
   * Example: ≤5 years → A, ≤10 → B, ≤15 → C, ≤25 → D, else F.
   */
  years_a_max: 5,
  years_b_max: 10,
  years_c_max: 15,
  years_d_max: 25,

  /**
   * Fleet size (total trucks, else power units). Small fleets → better chase grade.
   * Example: ≤5 trucks → A, ≤9 → B, ≤19 → C, ≤49 → D, else F.
   */
  trucks_a_max: 5,
  trucks_b_max: 9,
  trucks_c_max: 19,
  trucks_d_max: 49,

  /** How to merge years grade + trucks grade. */
  combine_mode: 'average' as SalesGradeCombineMode,

  /** Force F when operating status is OOS/revoked/suspended and role authority is not Active. */
  force_f_if_not_authorized: true,

  /**
   * Force F when the entity lacks the right Active authority:
   * carriers → Common Active; brokers → Broker Active.
   */
  force_f_if_no_carrier_authority: true,

  /**
   * Drop one letter only when there is no *current* insurance coverage marked cancelled.
   * Past cancellations alone never demote (current ActiveInsurances win).
   */
  demote_if_insurance_bad: true,

  /** Drop one letter when safety rating is Conditional / Unsatisfactory. */
  demote_if_safety_bad: false,
} as const

export type SalesLeadRatingPolicy = {
  years_a_max: number
  years_b_max: number
  years_c_max: number
  years_d_max: number
  trucks_a_max: number
  trucks_b_max: number
  trucks_c_max: number
  trucks_d_max: number
  combine_mode: SalesGradeCombineMode
  force_f_if_not_authorized: boolean
  force_f_if_no_carrier_authority: boolean
  demote_if_insurance_bad: boolean
  demote_if_safety_bad: boolean
}

/** Runtime singleton — Settings / Sales page persist into this. */
export const SALES_LEAD_RATING_POLICY: SalesLeadRatingPolicy = {
  ...DEFAULT_SALES_LEAD_RATING_POLICY,
}

const GRADE_POINTS: Record<SalesChaseGrade, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  F: 1,
}

const POINTS_TO_GRADE: Record<number, SalesChaseGrade> = {
  5: 'A',
  4: 'B',
  3: 'C',
  2: 'D',
  1: 'F',
}

export type SalesGradeBreakdown = {
  years_in_business: number | null
  trucks: number | null
  years_grade: SalesChaseGrade | null
  trucks_grade: SalesChaseGrade | null
  combined_grade: SalesChaseGrade
  forced_f_reason: string | null
  demotions: string[]
  notes: string[]
  /** Human-readable “why this grade” for the Sales UI. */
  summary: string
}

/** Build a plain-English ranking explanation from a grade breakdown. */
export function formatSalesGradeWhy(breakdown: SalesGradeBreakdown): string {
  if (breakdown.summary?.trim()) return breakdown.summary.trim()

  if (breakdown.forced_f_reason) {
    return `Grade F — ${breakdown.forced_f_reason}`
  }

  const parts: string[] = []
  if (breakdown.years_in_business != null && breakdown.years_grade) {
    const y = breakdown.years_in_business
    const yLabel = y < 1 ? `${Math.round(y * 12)} mo` : `${y.toFixed(1)} yr`
    parts.push(`${yLabel} in business → ${breakdown.years_grade}`)
  }
  if (breakdown.trucks != null && breakdown.trucks_grade) {
    parts.push(`${breakdown.trucks} truck${breakdown.trucks === 1 ? '' : 's'} → ${breakdown.trucks_grade}`)
  }
  for (const d of breakdown.demotions) {
    parts.push(`demoted: ${d}`)
  }
  for (const n of breakdown.notes) {
    parts.push(n)
  }

  if (parts.length === 0) return `Grade ${breakdown.combined_grade}`
  return `Grade ${breakdown.combined_grade} — ${parts.join('; ')}`
}

function buildGradeSummary(
  combined: SalesChaseGrade,
  years: number | null,
  trucks: number | null,
  years_grade: SalesChaseGrade | null,
  trucks_grade: SalesChaseGrade | null,
  combine_mode: SalesGradeCombineMode,
  demotions: string[],
  notes: string[],
  forced_f_reason: string | null
): string {
  if (forced_f_reason) {
    return `Grade F — ${forced_f_reason}`
  }

  const parts: string[] = []
  if (years != null && years_grade) {
    const yLabel = years < 1 ? `${Math.round(years * 12)} mo` : `${years.toFixed(1)} yr`
    parts.push(
      `${yLabel} in business scores ${years_grade} (newer carriers often need A/R help)`
    )
  }
  if (trucks != null && trucks_grade) {
    parts.push(
      `${trucks} truck${trucks === 1 ? '' : 's'} scores ${trucks_grade} (smaller fleets less likely to have an A/R team)`
    )
  }

  let combineNote = ''
  if (years_grade && trucks_grade) {
    if (combine_mode === 'average') combineNote = `Averaged to ${combined}`
    else if (combine_mode === 'worse') combineNote = `Took the worse of the two → ${combined}`
    else combineNote = `Took the better of the two → ${combined}`
  } else if (years_grade || trucks_grade) {
    combineNote = `Final grade ${combined}`
  } else {
    combineNote = `Final grade ${combined} (limited Snapshot data)`
  }

  for (const d of demotions) {
    parts.push(`Demoted one letter — ${d}`)
  }
  for (const n of notes) {
    parts.push(n)
  }

  return [`Grade ${combined}`, combineNote, ...parts].filter(Boolean).join('. ')
}

function clampNonNeg(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.min(Math.floor(n), 500)
}

function normalizeCombineMode(value: unknown): SalesGradeCombineMode {
  if (value === 'worse' || value === 'better' || value === 'average') return value
  return DEFAULT_SALES_LEAD_RATING_POLICY.combine_mode
}

/** Normalize partial policy JSON from platform_settings. */
export function normalizeSalesLeadRatingPolicy(
  value: Partial<SalesLeadRatingPolicy> | null | undefined
): SalesLeadRatingPolicy {
  const d = DEFAULT_SALES_LEAD_RATING_POLICY
  return {
    years_a_max: clampNonNeg(value?.years_a_max, d.years_a_max),
    years_b_max: clampNonNeg(value?.years_b_max, d.years_b_max),
    years_c_max: clampNonNeg(value?.years_c_max, d.years_c_max),
    years_d_max: clampNonNeg(value?.years_d_max, d.years_d_max),
    trucks_a_max: clampNonNeg(value?.trucks_a_max, d.trucks_a_max),
    trucks_b_max: clampNonNeg(value?.trucks_b_max, d.trucks_b_max),
    trucks_c_max: clampNonNeg(value?.trucks_c_max, d.trucks_c_max),
    trucks_d_max: clampNonNeg(value?.trucks_d_max, d.trucks_d_max),
    combine_mode: normalizeCombineMode(value?.combine_mode),
    force_f_if_not_authorized:
      typeof value?.force_f_if_not_authorized === 'boolean'
        ? value.force_f_if_not_authorized
        : d.force_f_if_not_authorized,
    force_f_if_no_carrier_authority:
      typeof value?.force_f_if_no_carrier_authority === 'boolean'
        ? value.force_f_if_no_carrier_authority
        : d.force_f_if_no_carrier_authority,
    demote_if_insurance_bad:
      typeof value?.demote_if_insurance_bad === 'boolean'
        ? value.demote_if_insurance_bad
        : d.demote_if_insurance_bad,
    demote_if_safety_bad:
      typeof value?.demote_if_safety_bad === 'boolean'
        ? value.demote_if_safety_bad
        : d.demote_if_safety_bad,
  }
}

/** Years since FMCSA add_date (fractional). */
export function yearsFromAddDate(
  addDate: string | null | undefined,
  now = new Date()
): number | null {
  if (!addDate?.trim()) return null
  const d = new Date(addDate)
  if (Number.isNaN(d.getTime())) return null
  const ms = now.getTime() - d.getTime()
  if (ms < 0) return 0
  return Math.round((ms / (365.25 * 24 * 60 * 60 * 1000)) * 100) / 100
}

/** Prefer total trucks; fall back to power units. */
export function fleetSizeFromSnapshot(snapshot: BrokerSnapshotSummary): number | null {
  if (typeof snapshot.totalTrucks === 'number' && Number.isFinite(snapshot.totalTrucks)) {
    return Math.max(0, Math.floor(snapshot.totalTrucks))
  }
  if (
    typeof snapshot.totalPowerUnits === 'number' &&
    Number.isFinite(snapshot.totalPowerUnits)
  ) {
    return Math.max(0, Math.floor(snapshot.totalPowerUnits))
  }
  return null
}

function gradeFromAscendingMax(
  value: number,
  aMax: number,
  bMax: number,
  cMax: number,
  dMax: number
): SalesChaseGrade {
  if (value <= aMax) return 'A'
  if (value <= bMax) return 'B'
  if (value <= cMax) return 'C'
  if (value <= dMax) return 'D'
  return 'F'
}

function pointsToGrade(points: number): SalesChaseGrade {
  const rounded = Math.max(1, Math.min(5, Math.round(points)))
  return POINTS_TO_GRADE[rounded] ?? 'C'
}

function demoteGrade(grade: SalesChaseGrade, steps = 1): SalesChaseGrade {
  const next = GRADE_POINTS[grade] - steps
  return pointsToGrade(next)
}

function isActiveAuthority(label: string | null | undefined): boolean {
  return (label ?? '').trim().toLowerCase() === 'active'
}

/** Parse BrokerSnapshot entity codes (e.g. C;S;B) into carrier / broker roles. */
export function parseSnapshotEntityRoles(snapshot: BrokerSnapshotSummary): {
  isCarrier: boolean
  isBroker: boolean
} {
  const raw = String(snapshot.entityType ?? '')
    .trim()
    .toUpperCase()
  const tokens = raw.split(/[;,\s|/]+/).filter(Boolean)

  let isCarrier =
    tokens.includes('C') ||
    tokens.some((t) => t.startsWith('CARRIER')) ||
    /\bcarrier\b/i.test(raw)
  let isBroker =
    tokens.includes('B') ||
    tokens.some((t) => t.startsWith('BROKER')) ||
    /\bbroker\b/i.test(raw)

  // Infer from authority when entity type is blank.
  if (!isCarrier && !isBroker) {
    if (
      isActiveAuthority(snapshot.commonAuthority) ||
      isActiveAuthority(snapshot.contractAuthority) ||
      snapshot.propertyAuthorized === true
    ) {
      isCarrier = true
    }
    if (isActiveAuthority(snapshot.brokerAuthority)) {
      isBroker = true
    }
  }

  return { isCarrier, isBroker }
}

/**
 * Role-specific authority for sales grading:
 * - Carrier → Common must be Active
 * - Broker → Broker must be Active
 * - Dual (C+B) → Common Active (Credyx chases carriers; Broker Active alone is not enough)
 */
export function getSalesRoleAuthority(snapshot: BrokerSnapshotSummary): {
  ok: boolean
  isCarrier: boolean
  isBroker: boolean
  missingReason: string | null
  note: string | null
} {
  const { isCarrier, isBroker } = parseSnapshotEntityRoles(snapshot)
  const commonOk = isActiveAuthority(snapshot.commonAuthority)
  const brokerOk = isActiveAuthority(snapshot.brokerAuthority)

  if (isCarrier && isBroker) {
    if (commonOk) {
      return {
        ok: true,
        isCarrier,
        isBroker,
        missingReason: null,
        note: brokerOk
          ? 'Carrier+Broker entity — Common Active (required); Broker also Active.'
          : 'Carrier+Broker entity — Common Active (required for carrier chase).',
      }
    }
    return {
      ok: false,
      isCarrier,
      isBroker,
      missingReason: brokerOk
        ? 'Carrier entity without Active Common authority (Broker Active alone does not count)'
        : 'Carrier+Broker entity without Active Common authority',
      note: null,
    }
  }

  if (isCarrier) {
    if (commonOk) {
      return {
        ok: true,
        isCarrier,
        isBroker,
        missingReason: null,
        note: 'Carrier — Common Active.',
      }
    }
    return {
      ok: false,
      isCarrier,
      isBroker,
      missingReason: 'Carrier without Active Common authority',
      note: null,
    }
  }

  if (isBroker) {
    if (brokerOk) {
      return {
        ok: true,
        isCarrier,
        isBroker,
        missingReason: null,
        note: 'Broker — Broker authority Active.',
      }
    }
    return {
      ok: false,
      isCarrier,
      isBroker,
      missingReason: 'Broker without Active Broker authority',
      note: null,
    }
  }

  // Unknown entity type — accept either Common or Broker Active.
  if (commonOk || brokerOk) {
    return {
      ok: true,
      isCarrier,
      isBroker,
      missingReason: null,
      note: commonOk
        ? 'Common Active (entity type unclear).'
        : 'Broker Active (entity type unclear).',
    }
  }

  return {
    ok: false,
    isCarrier,
    isBroker,
    missingReason: 'No Active Common or Broker authority',
    note: null,
  }
}

/**
 * True when CURRENT status is a real shutdown and role authority is missing.
 * FMCSA "Not Authorized" with Active Common (carrier) or Active Broker (broker) is ignored.
 */
function isHardUnauthorized(snapshot: BrokerSnapshotSummary): boolean {
  const role = getSalesRoleAuthority(snapshot)
  if (role.ok) return false

  const t = String(snapshot.operatingStatus ?? '')
    .trim()
    .toLowerCase()
  if (!t) return false
  return (
    t.includes('not authorized') ||
    t.includes('out of service') ||
    t.includes('revoked') ||
    t.includes('suspended') ||
    t === 'unauthorized'
  )
}

function combineGrades(
  a: SalesChaseGrade | null,
  b: SalesChaseGrade | null,
  mode: SalesGradeCombineMode
): SalesChaseGrade {
  if (!a && !b) return 'C'
  if (!a) return b!
  if (!b) return a
  if (mode === 'worse') {
    return GRADE_POINTS[a] <= GRADE_POINTS[b] ? a : b
  }
  if (mode === 'better') {
    return GRADE_POINTS[a] >= GRADE_POINTS[b] ? a : b
  }
  return pointsToGrade((GRADE_POINTS[a] + GRADE_POINTS[b]) / 2)
}

/**
 * Rate a BrokerSnapshot carrier for cold-outreach chase priority.
 * Higher letter = more worth chasing for Credyx A/R back office.
 */
export function rateSalesLeadFromSnapshot(
  snapshot: BrokerSnapshotSummary,
  policy: SalesLeadRatingPolicy = SALES_LEAD_RATING_POLICY,
  now = new Date()
): SalesGradeBreakdown {
  const notes: string[] = []
  const demotions: string[] = []

  if (!snapshot.found) {
    const forced = 'Not found in BrokerSnapshot'
    return {
      years_in_business: null,
      trucks: null,
      years_grade: null,
      trucks_grade: null,
      combined_grade: 'F',
      forced_f_reason: forced,
      demotions: [],
      notes: ['Lookup returned no company.'],
      summary: buildGradeSummary('F', null, null, null, null, policy.combine_mode, [], ['Lookup returned no company.'], forced),
    }
  }

  const years = yearsFromAddDate(snapshot.addDate, now)
  const trucks = fleetSizeFromSnapshot(snapshot)

  const years_grade =
    years == null
      ? null
      : gradeFromAscendingMax(
          years,
          policy.years_a_max,
          policy.years_b_max,
          policy.years_c_max,
          policy.years_d_max
        )

  const trucks_grade =
    trucks == null
      ? null
      : gradeFromAscendingMax(
          trucks,
          policy.trucks_a_max,
          policy.trucks_b_max,
          policy.trucks_c_max,
          policy.trucks_d_max
        )

  if (years == null) notes.push('No FMCSA add date — years grade skipped.')
  if (trucks == null) notes.push('No truck / power-unit count — fleet grade skipped.')

  if (policy.force_f_if_not_authorized && isHardUnauthorized(snapshot)) {
    const role = getSalesRoleAuthority(snapshot)
    const forced =
      role.missingReason ||
      `Operating status: ${snapshot.operatingStatus}`
    return {
      years_in_business: years,
      trucks,
      years_grade,
      trucks_grade,
      combined_grade: 'F',
      forced_f_reason: forced,
      demotions: [],
      notes,
      summary: buildGradeSummary(
        'F',
        years,
        trucks,
        years_grade,
        trucks_grade,
        policy.combine_mode,
        [],
        notes,
        forced
      ),
    }
  }

  const roleAuth = getSalesRoleAuthority(snapshot)
  if (roleAuth.note) notes.push(roleAuth.note)

  const opLower = String(snapshot.operatingStatus ?? '').toLowerCase()
  if (
    roleAuth.ok &&
    (opLower.includes('not authorized') || opLower.includes('unauthorized'))
  ) {
    notes.push(
      `FMCSA operating status says "${snapshot.operatingStatus}" but required authority is Active — ignored for chase grade.`
    )
  }

  // Carriers need Common Active; brokers need Broker Active.
  if (policy.force_f_if_no_carrier_authority && !roleAuth.ok) {
    const forced = roleAuth.missingReason || 'Missing required Active authority'
    return {
      years_in_business: years,
      trucks,
      years_grade,
      trucks_grade,
      combined_grade: 'F',
      forced_f_reason: forced,
      demotions: [],
      notes,
      summary: buildGradeSummary(
        'F',
        years,
        trucks,
        years_grade,
        trucks_grade,
        policy.combine_mode,
        [],
        notes,
        forced
      ),
    }
  }

  let combined = combineGrades(years_grade, trucks_grade, policy.combine_mode)

  // Only demote on CURRENT bad insurance — never on historical cancellations alone.
  // (Proxy marks history-only as "missing", not "cancelled".)
  if (policy.demote_if_insurance_bad && snapshot.insuranceVerdict === 'cancelled') {
    demotions.push('No current insurance coverage')
    combined = demoteGrade(combined)
  }

  if (policy.demote_if_safety_bad && snapshot.safetyRating) {
    const safety = snapshot.safetyRating.toLowerCase()
    if (safety.includes('conditional') || safety.includes('unsatisfactory')) {
      demotions.push(`Safety: ${snapshot.safetyRating}`)
      combined = demoteGrade(combined)
    }
  }

  return {
    years_in_business: years,
    trucks,
    years_grade,
    trucks_grade,
    combined_grade: combined,
    forced_f_reason: null,
    demotions,
    notes,
    summary: buildGradeSummary(
      combined,
      years,
      trucks,
      years_grade,
      trucks_grade,
      policy.combine_mode,
      demotions,
      notes,
      null
    ),
  }
}
