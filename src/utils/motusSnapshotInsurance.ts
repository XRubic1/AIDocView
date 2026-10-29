import {
  classifyMotusReport,
  currentMotusPolicies,
  type MotusInsuranceReport,
  type MotusInsurancePolicy,
} from './motusInsurance'

type InsuranceVerdict = 'ok' | 'missing' | 'cancelled' | 'warning'

const BROKERSNAPSHOT_INSURANCE_FLAG = /insurance/i

function parseMoney(value: string): number | null {
  const amount = Number(value.replace(/[^0-9.]/g, ''))
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

function row(policy: MotusInsurancePolicy) {
  return {
    companyName: policy.companyName,
    policyNumber: policy.policyNumber === '—' ? null : policy.policyNumber,
    effectiveDate: policy.effectiveDate,
    maxLimit: parseMoney(policy.insuranceFiled),
    formCode: null,
    phone: null,
    email: null,
  }
}

/**
 * Replaces the insurance fields of a BrokerSnapshot summary with the public MOTUS filings.
 * Authority, fleet size, pay data and everything else on the summary is left alone.
 */
export function applyMotusInsurance<T extends Record<string, unknown>>(
  summary: T,
  report: MotusInsuranceReport
): T {
  const classification = classifyMotusReport(report)
  const current = report.authorities.flatMap((authority) => currentMotusPolicies(authority.policies))
  const active = current.filter((policy) => policy.active)
  const cancelled = report.authorities
    .flatMap((authority) => authority.policies)
    .filter((policy) => policy.hasCancellationDate || /cancel/i.test(policy.status))
    .sort((a, b) => (Date.parse(b.cancellationDate ?? '') || 0) - (Date.parse(a.cancellationDate ?? '') || 0))

  const verdict: InsuranceVerdict =
    classification.verdict === 'good'
      ? 'ok'
      : classification.verdict === 'cancellation'
        ? 'cancelled'
        : 'missing'

  const insurer = active[0]?.companyName
  const note =
    verdict === 'ok'
      ? insurer && insurer !== '—'
        ? `Insurance is fine — active coverage on MOTUS (${insurer}).`
        : 'Insurance is fine — active coverage on MOTUS.'
      : verdict === 'cancelled'
        ? `Insurance cancelled on MOTUS. ${classification.summary} Verify coverage before booking.`
        : `${classification.summary} Verify coverage before booking.`

  const flags = Array.isArray(summary.riskFlags) ? (summary.riskFlags as string[]) : []
  const riskFlags = flags.filter((flag) => !BROKERSNAPSHOT_INSURANCE_FLAG.test(flag))
  if (verdict === 'missing') riskFlags.push('No active insurance on file in MOTUS')
  if (verdict === 'cancelled') {
    const date = classification.cancellationDates[0]
    riskFlags.push(
      date ? `Insurance cancelled on MOTUS (${date}) — no current coverage` : 'Insurance cancelled on MOTUS — no current coverage'
    )
  }

  return {
    ...summary,
    activeInsuranceCount: active.length,
    primaryInsurer: insurer && insurer !== '—' ? insurer : null,
    insurances: active.slice(0, 8).map(row),
    cancellations: cancelled.slice(0, 5).map((policy) => ({
      companyName: policy.companyName,
      policyNumber: policy.policyNumber === '—' ? null : policy.policyNumber,
      effectiveDate: policy.effectiveDate,
      cancelEffectiveDate: policy.cancellationDate,
      maxLimit: parseMoney(policy.insuranceFiled),
    })),
    hasInsuranceCancellation: cancelled.length > 0,
    latestCancellationDate: cancelled[0]?.cancellationDate ?? null,
    insuranceVerdict: verdict,
    insuranceNote: note,
    insuranceSource: 'motus',
    motusAccountUrl: report.accountUrl,
    riskFlags,
  }
}
