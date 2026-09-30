import { FormEvent, ReactNode, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { useClientTheme } from '../theme/ThemeContext'
import { lookupMcCredit } from '../services/mcCreditLookupService'
import { lookupBrokerSnapshotByMc } from '../services/brokerSnapshotService'
import { extractEmailDomain } from '../utils/emailDomain'
import { formatPhoneNumber } from '../utils/formatPhoneNumber'
import { assessMcCredit, creditMetrics, redactVendorText } from '../utils/mcCreditAssessment'
import {
  displayAuthorities,
  hasActiveFreightAuthority,
  isDoNotWorkBroker,
  shouldShowCancellationHistory,
} from '../utils/brokerSnapshotSafety'
import type {
  McCreditAssessment,
  McCreditRecord,
  McCreditSearchResponse,
  McCreditVerdict,
} from '../types/mcCreditLookup'
import type { BrokerSnapshotSummary } from '../types/brokerSnapshot'

type CreditProfile = {
  company: string
  place: string
  phone?: string
  email?: string
  rating: string
  days: string
  score: string
  notices: string[]
}

function text(value: string | number | undefined | null): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (!trimmed || trimmed === '—' || trimmed === '-') return null
  return trimmed
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function spread(values: string[]): string {
  if (!values.length) return '—'
  const nums = values
    .map((value) => Number(String(value).replace(/[^\d.-]/g, '')))
    .filter((value) => Number.isFinite(value))
  if (nums.length !== values.length) return values.join(' · ')
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const fmt = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(0))
  return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`
}

const HIDDEN_LOOKUP_EMAIL = /archivetru\.cadence@gmail\.com/i
const HIDDEN_LOOKUP_DOMAIN = /@(?:[\w.-]+\.)?(?:compassfs\.info|trufunding\.net)\b/i

function isHiddenLookupEmail(email: string): boolean {
  const trimmed = email.trim()
  return HIDDEN_LOOKUP_EMAIL.test(trimmed) || HIDDEN_LOOKUP_DOMAIN.test(trimmed)
}

function stripHiddenLookupEmails(value: string): string {
  return value
    .replace(HIDDEN_LOOKUP_EMAIL, '')
    .replace(/[A-Z0-9._%+-]+@(?:[\w.-]+\.)?(?:compassfs\.info|trufunding\.net)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[,;]\s*[,;]\s*/g, ', ')
    .replace(/^[,;\s]+|[,;\s]+$/g, '')
    .trim()
}

function scrub(value: string | null | undefined): string | null {
  const cleaned = stripHiddenLookupEmails(redactVendorText(value ?? undefined) ?? '')
  if (!cleaned || /brokersnapshot|snapshot/i.test(cleaned)) return null
  return cleaned
}

function buildCreditProfile(results: McCreditRecord[]): CreditProfile | null {
  if (!results.length) return null
  const company =
    results.find((row) => row.company)?.company?.replace(/\s*\(STOLEN ID.*$/i, '').trim() ||
    'Broker'
  const located = results.find((row) => row.city || row.state || row.address)
  const place = [located?.address, [located?.city, located?.state].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ')
  const noBuy = results.some((row) => {
    const blob = `${row.noBuy ?? ''} ${row.creditRating ?? ''}`.toUpperCase()
    return blob.includes('NO BUY') || row.creditRating?.toUpperCase() === 'F'
  })
  const letters = unique(
    results.map((row) => {
      const rating = (row.creditRating || '').toUpperCase().trim()
      return ['A', 'B', 'C', 'D', 'F', 'N'].includes(rating) ? rating : null
    })
  )
  return {
    company,
    place,
    phone: unique(results.map((row) => text(row.phone))).join(', ') || undefined,
    email:
      unique(
        results.flatMap((row) => {
          const raw = row.email
          const values = Array.isArray(raw) ? raw : [raw]
          return values.flatMap((value) => splitEmails(text(value) ?? undefined))
        })
      ).join(', ') || undefined,
    rating: noBuy ? 'No Buy' : letters.join(' · ') || '—',
    days: spread(
      unique(results.map((row) => {
        const days = creditMetrics(row).days
        return days == null ? null : String(days)
      }))
    ),
    score: spread(
      unique(results.map((row) => {
        const score = creditMetrics(row).score
        return score == null ? null : String(score)
      }))
    ),
    notices: unique(
      results.flatMap((row) => [scrub(row.warning), scrub(row.noBuy), scrub(row.creditNote)])
    ),
  }
}

function money(limit: number | null | undefined): string | null {
  if (limit == null || limit <= 0) return null
  return `$${limit.toLocaleString()}`
}

function verdictStyle(verdict: McCreditVerdict) {
  if (verdict === 'good') {
    return { bg: '#ECFDF5', border: '#6EE7B7', color: '#047857', Icon: CheckCircle2, label: 'Good' }
  }
  if (verdict === 'caution') {
    return { bg: '#FFFBEB', border: '#FCD34D', color: '#B45309', Icon: AlertTriangle, label: 'Caution' }
  }
  if (verdict === 'avoid') {
    return { bg: '#FEF2F2', border: '#FCA5A5', color: '#B91C1C', Icon: ShieldAlert, label: 'Avoid' }
  }
  return { bg: '#F8FAFC', border: '#E2E8F0', color: '#64748B', Icon: HelpCircle, label: 'Review' }
}

function ratingTone(rating: string) {
  const value = rating.toUpperCase()
  if (value.includes('NO BUY') || value.includes('F')) return { bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C' }
  if (['A', 'B', 'C'].some((letter) => value.includes(letter)) && !value.includes('D')) {
    return { bg: '#ECFDF5', border: '#A7F3D0', color: '#047857' }
  }
  if (value.includes('D')) return { bg: '#FFFBEB', border: '#FDE68A', color: '#B45309' }
  return null
}

function insuranceLabel(summary: BrokerSnapshotSummary): { label: string; ok: boolean } {
  const covered = (summary.activeInsuranceCount ?? 0) > 0 || (summary.insurances?.length ?? 0) > 0
  if (covered || summary.insuranceVerdict === 'ok') return { label: 'Insurance on file', ok: true }
  if (summary.insuranceVerdict === 'cancelled') return { label: 'Insurance cancelled', ok: false }
  if (summary.insuranceVerdict === 'missing') return { label: 'Insurance missing', ok: false }
  return { label: 'Insurance needs review', ok: false }
}

function formatPhoneList(value: string | null | undefined): string {
  if (!value) return ''
  return unique(
    value
      .split(/[,;·]+/)
      .map((part) => formatPhoneNumber(part.trim()))
      .filter(Boolean)
  ).join(', ')
}

function splitEmails(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/[,;·]+/)
    .map((part) => part.trim())
    .filter((part) => part.includes('@') && !isHiddenLookupEmail(part))
}

function hasStolenWarning(results: McCreditRecord[] | undefined): boolean {
  if (!results?.length) return false
  return results.some((row) =>
    /stolen\s*id|stolen\s*identity|call\s*to\s*verify/i.test(
      [row.company, row.warning, row.creditNote, row.noBuy].filter(Boolean).join(' ')
    )
  )
}

function brokerDomainNote(emails: string[], stolen: boolean): { text: string; ok: boolean } | null {
  const domains = unique(emails.map((email) => extractEmailDomain(email)))
  if (!domains.length && !stolen) return null
  if (domains.length === 1) {
    const domain = `@${domains[0]}`
    return {
      ok: !stolen,
      text: stolen
        ? `Stolen-ID warning. Broker domain must match ${domain}`
        : `Broker domain must match ${domain}`,
    }
  }
  if (domains.length > 1) {
    return {
      ok: false,
      text: `Broker domains don't match (${domains.map((domain) => `@${domain}`).join(', ')}). Confirm this is not a stolen MC.`,
    }
  }
  return { ok: false, text: 'Stolen-ID warning on file. Confirm the broker domain before you book.' }
}

function headlineFor(
  credit: McCreditAssessment | null,
  authority: BrokerSnapshotSummary | null
): { verdict: McCreditVerdict; title: string; summary: string } {
  const blocked = Boolean(authority?.found && isDoNotWorkBroker(authority))
  const insurance = authority?.found ? insuranceLabel(authority) : null
  if (blocked || credit?.verdict === 'avoid') {
    return {
      verdict: 'avoid',
      title: 'Not recommended',
      summary: blocked
        ? 'No active authority on file. Do not book until that is confirmed.'
        : credit?.summary || 'Hard risk flags found. Verify before hauling.',
    }
  }
  if (credit?.verdict === 'caution' || (insurance && !insurance.ok)) {
    return {
      verdict: 'caution',
      title: 'Work with caution',
      summary: credit?.summary || 'Confirm authority and insurance before you book.',
    }
  }
  if (credit?.verdict === 'good' && authority?.found && hasActiveFreightAuthority(authority)) {
    return {
      verdict: 'good',
      title: 'Good to work with',
      summary: 'Credit and authority both look solid. Still confirm the load details.',
    }
  }
  if (credit?.verdict === 'good') {
    return {
      verdict: 'good',
      title: credit.title,
      summary: credit.summary,
    }
  }
  if (authority?.found && hasActiveFreightAuthority(authority)) {
    return {
      verdict: 'caution',
      title: 'Authority is active',
      summary: 'Authority is on file. Credit details were thin, so review before booking.',
    }
  }
  return {
    verdict: 'unknown',
    title: 'Review carefully',
    summary: 'This check did not return a full picture. Confirm the MC before you book.',
  }
}

export default function ClientMcLookup() {
  const c = useClientTheme()
  const [mc, setMc] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credit, setCredit] = useState<McCreditSearchResponse | null>(null)
  const [authority, setAuthority] = useState<BrokerSnapshotSummary | null>(null)
  const [searched, setSearched] = useState(false)

  const assessment = credit ? assessMcCredit(credit) : null
  const profile = useMemo(() => (credit ? buildCreditProfile(credit.results) : null), [credit])
  const authorityFound = Boolean(authority?.found)
  const headline = searched ? headlineFor(assessment, authority) : null

  async function onSearch(event?: FormEvent) {
    event?.preventDefault()
    const cleaned = mc.trim()
    if (!cleaned) {
      setError('Enter an MC number.')
      return
    }
    setLoading(true)
    setError(null)
    setSearched(false)
    const [creditResult, authorityResult] = await Promise.allSettled([
      lookupMcCredit(cleaned),
      lookupBrokerSnapshotByMc(cleaned),
    ])
    const nextCredit = creditResult.status === 'fulfilled' ? creditResult.value : null
    const nextAuthority = authorityResult.status === 'fulfilled' ? authorityResult.value : null
    setCredit(nextCredit)
    setAuthority(nextAuthority)
    setSearched(true)
    if (nextCredit?.mc) setMc(nextCredit.mc)
    if (!nextCredit && !nextAuthority) {
      setError('MC lookup failed. Try again in a moment.')
    }
    setLoading(false)
  }

  const company =
    (authorityFound ? authority?.name : null) || profile?.company || assessment?.company || 'Broker'
  const place = authority?.phyAddress || profile?.place || ''
  const phone = formatPhoneList(unique([profile?.phone, authority?.phone]).join(', '))
  const email = unique(splitEmails([profile?.email, authority?.email].filter(Boolean).join(', '))).join(' · ')
  const showResult = searched && !error && (profile || authorityFound)
  const nothing = searched && !error && !profile && !authorityFound
  const stolen = hasStolenWarning(credit?.results)
  const domain = brokerDomainNote(splitEmails(email), stolen)
  const showBoard = !error && (showResult || !searched)

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: c.background }}>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-5 md:px-6 md:py-6">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: c.accent }}>
            Broker check
          </p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight" style={{ color: c.primary }}>
            MC Lookup
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed" style={{ color: c.secondary }}>
            Credit, payment pace, authority, and insurance in one check before you book.
          </p>
        </header>

        <form
          onSubmit={onSearch}
          className="rounded-2xl border p-4"
          style={{ backgroundColor: c.card, borderColor: c.border, boxShadow: c.shadow.card }}
        >
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide" style={{ color: c.secondary }}>
              MC number
            </span>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={mc}
                onChange={(e) => setMc(e.target.value)}
                placeholder="Enter MC"
                inputMode="numeric"
                autoComplete="off"
                className="client-input min-w-0 flex-1"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="dashboard-btn-primary inline-flex h-10 items-center justify-center gap-2 px-5 text-sm font-semibold disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? 'Checking' : 'Look up'}
              </button>
            </div>
          </label>
        </form>

        {error ? (
          <p
            className="rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: c.error }}
          >
            {error}
          </p>
        ) : null}

        {nothing ? (
          <section
            className="rounded-2xl border px-5 py-8 text-center"
            style={{ backgroundColor: c.card, borderColor: c.border, boxShadow: c.shadow.card }}
          >
            <HelpCircle className="mx-auto h-8 w-8" style={{ color: c.mutedLight }} />
            <h2 className="mt-3 text-lg font-semibold" style={{ color: c.primary }}>
              No record for MC {credit?.mc || mc}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: c.secondary }}>
              Nothing came back for this number. Check the digits and try again.
            </p>
          </section>
        ) : null}

        {showResult && headline ? (
          <IdentityBar
            verdict={headline.verdict}
            title={headline.title}
            summary={headline.summary}
            reasons={assessment?.reasons ?? []}
            positives={assessment?.positives ?? []}
            company={company}
            mc={authority?.mcNumber || credit?.mc || mc}
            dot={authority?.dotNumber}
            place={place}
          />
        ) : null}

        {showBoard ? (
          <div className="grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Slot title="Rating">
              {showResult && profile ? (
                <RatingBody profile={profile} />
              ) : (
                <Placeholder>Letter grade when one is on file.</Placeholder>
              )}
            </Slot>
            <Slot title="Days to pay">
              {showResult && profile ? (
                <DaysBody profile={profile} note={assessment?.positives.find((item) => /pay|day/i.test(item))} />
              ) : (
                <Placeholder>How quickly this broker pays.</Placeholder>
              )}
            </Slot>
            <Slot title="Authority and insurance" className="sm:col-span-2 lg:col-span-1">
              {showResult ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <AuthorityBody summary={authorityFound ? authority : null} />
                  <InsuranceBody summary={authorityFound ? authority : null} />
                </div>
              ) : (
                <Placeholder>Broker authority and coverage, when they are on file.</Placeholder>
              )}
            </Slot>
          </div>
        ) : null}

        {showResult && domain && !domain.ok ? <DomainBar note={domain} /> : null}
        {showResult && domain?.ok ? (
          <p className="px-1 text-sm" style={{ color: c.secondary }}>
            {domain.text}
          </p>
        ) : null}

        {showResult ? (
          <ContactStrip
            phone={phone}
            email={email}
            officer={authority?.officer}
            mail={
              authority?.mailAddress && authority.mailAddress !== authority.phyAddress
                ? authority.mailAddress
                : undefined
            }
          />
        ) : null}
      </div>
    </div>
  )
}

function Slot({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const c = useClientTheme()
  return (
    <section
      className={`flex h-full min-h-[168px] flex-col rounded-2xl border px-4 py-4 ${className ?? ''}`}
      style={{ backgroundColor: c.card, borderColor: c.border, boxShadow: c.shadow.card }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: c.accent }}>
        {title}
      </p>
      <div className="mt-2 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

function Placeholder({ children }: { children: ReactNode }) {
  const c = useClientTheme()
  return (
    <p className="text-sm leading-relaxed" style={{ color: c.secondary }}>
      {children}
    </p>
  )
}

function IdentityBar({
  verdict,
  title,
  summary,
  reasons,
  positives,
  company,
  mc,
  dot,
  place,
}: {
  verdict: McCreditVerdict
  title: string
  summary: string
  reasons: string[]
  positives: string[]
  company: string
  mc: string
  dot?: number | null
  place?: string
}) {
  const c = useClientTheme()
  const style = verdictStyle(verdict)
  const Icon = style.Icon
  const mcLabel = mc ? `MC ${mc.replace(/^MC-?/i, '')}` : null
  const dotLabel = dot != null ? `DOT ${dot}` : null
  const negatives = reasons.filter((reason) => !reason.includes('@'))
  const pluses = positives.filter((item) => !item.includes('@'))

  return (
    <section className="rounded-2xl border-2 px-5 py-5" style={{ backgroundColor: style.bg, borderColor: style.border }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-3xl font-semibold leading-tight underline decoration-2 underline-offset-4" style={{ color: c.primary }}>
          {company}
        </h2>
        {mcLabel || dotLabel ? (
          <div className="flex items-baseline gap-4 text-sm font-medium" style={{ color: c.secondary }}>
            {mcLabel ? <p>{mcLabel}</p> : null}
            {dotLabel ? <p>{dotLabel}</p> : null}
          </div>
        ) : null}
      </div>
      {place ? (
        <p className="mt-2 whitespace-normal text-sm" style={{ color: c.secondary }}>
          {place}
        </p>
      ) : null}
      <div className="mt-4 border-t pt-4" style={{ borderColor: style.border }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: style.color }}>
          Decision
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Icon className="h-6 w-6 shrink-0" style={{ color: style.color }} />
          <p className="text-xl font-semibold leading-none" style={{ color: style.color }}>
            {title}
          </p>
        </div>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: c.primary }}>
          {summary}
        </p>
        {pluses.length || negatives.length ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#047857' }}>
                Positive
              </p>
              {pluses.length ? (
                <ul className="mt-1 space-y-1 text-sm" style={{ color: c.primary }}>
                  {pluses.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm" style={{ color: c.secondary }}>
                  None on this check.
                </p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#B91C1C' }}>
                Negative
              </p>
              {negatives.length ? (
                <ul className="mt-1 space-y-1 text-sm" style={{ color: c.primary }}>
                  {negatives.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm" style={{ color: c.secondary }}>
                  None on this check.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function RatingBody({ profile }: { profile: CreditProfile }) {
  const c = useClientTheme()
  const tone = ratingTone(profile.rating)
  return (
    <div className="flex h-full flex-col">
      <p className="text-2xl font-semibold leading-none" style={{ color: tone?.color ?? c.primary }}>
        {profile.rating}
      </p>
      {profile.score !== '—' ? (
        <p className="mt-2 text-xs" style={{ color: c.secondary }}>
          Score {profile.score}
        </p>
      ) : null}
      {profile.notices.filter((notice) => !notice.includes('@')).slice(0, 1).length ? (
        <div className="mt-3 space-y-1 text-xs leading-snug" style={{ color: c.secondary }}>
          {profile.notices
            .filter((notice) => !notice.includes('@'))
            .slice(0, 1)
            .map((notice) => (
              <p key={notice}>{notice}</p>
            ))}
        </div>
      ) : (
        <p className="mt-3 text-xs" style={{ color: c.secondary }}>
          {profile.rating === 'N' ? 'No letter grade on file.' : 'Letter grade on file.'}
        </p>
      )}
    </div>
  )
}

function DaysBody({ profile, note }: { profile: CreditProfile; note?: string }) {
  const c = useClientTheme()
  return (
    <div>
      <p className="text-2xl font-semibold leading-none" style={{ color: c.primary }}>
        {profile.days}
      </p>
      {note ? (
        <p className="mt-3 text-xs leading-snug" style={{ color: c.secondary }}>
          {note}
        </p>
      ) : null}
    </div>
  )
}

function AuthorityBody({ summary }: { summary: BrokerSnapshotSummary | null }) {
  const c = useClientTheme()
  if (!summary) {
    return <Placeholder>No authority details for this MC.</Placeholder>
  }
  const shown = displayAuthorities(summary)
  const blocked = isDoNotWorkBroker(summary)
  const active = hasActiveFreightAuthority(summary)
  const rows = [
    ['Broker', shown.broker],
    ['Common', shown.common],
    ['Contract', shown.contract],
  ] as const
  return (
    <div>
      <p className="text-sm font-semibold" style={{ color: blocked ? '#B91C1C' : c.primary }}>
        {blocked ? 'Do not use' : active ? 'Active' : 'Needs review'}
      </p>
      <dl className="mt-3 space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt style={{ color: c.secondary }}>{label}</dt>
            <dd className="font-semibold" style={{ color: c.primary }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {summary.operatingStatus ? (
        <p className="mt-2 text-xs leading-snug" style={{ color: c.primary }}>
          {summary.operatingStatus}
        </p>
      ) : null}
    </div>
  )
}

function InsuranceBody({ summary }: { summary: BrokerSnapshotSummary | null }) {
  const c = useClientTheme()
  if (!summary) {
    return <Placeholder>No insurance details for this MC.</Placeholder>
  }
  const insurance = insuranceLabel(summary)
  const policies = (summary.insurances ?? []).slice(0, 2)
  const showCancel = shouldShowCancellationHistory(summary)
  return (
    <div>
      <p className="text-sm font-semibold" style={{ color: insurance.ok ? c.primary : '#B91C1C' }}>
        {insurance.label}
      </p>
      <div className="mt-2 space-y-2">
        {policies.map((policy) => (
          <div key={`${policy.companyName}-${policy.policyNumber ?? ''}`}>
            <p className="text-sm font-medium leading-snug" style={{ color: c.primary }}>
              {policy.companyName}
            </p>
            <p className="text-xs" style={{ color: c.secondary }}>
              {[policy.policyNumber, money(policy.maxLimit)].filter(Boolean).join(' · ')}
            </p>
            {policy.phone ? (
              <p className="text-xs" style={{ color: c.primary }}>
                {formatPhoneList(policy.phone)}
              </p>
            ) : null}
            {splitEmails(policy.email).map((address) => (
              <p key={address} className="break-all text-xs" style={{ color: c.primary }}>
                {address}
              </p>
            ))}
          </div>
        ))}
      </div>
      {showCancel && summary.latestCancellationDate ? (
        <p className="mt-2 text-xs" style={{ color: c.secondary }}>
          Cancellation on file · {summary.latestCancellationDate}
        </p>
      ) : null}
    </div>
  )
}

function DomainBar({ note }: { note: { text: string; ok: boolean } }) {
  return (
    <section
      className="flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm"
      style={{ backgroundColor: '#FFFBEB', borderColor: '#FCD34D', color: '#92400E' }}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="font-semibold">{note.text}</p>
    </section>
  )
}

function ContactStrip({
  phone,
  email,
  officer,
  mail,
}: {
  phone?: string
  email?: string
  officer?: string | null
  mail?: string
}) {
  const items = [
    phone ? { label: 'Phone', value: phone } : null,
    email ? { label: 'Email', value: email } : null,
    officer ? { label: 'Officer', value: officer } : null,
    mail ? { label: 'Mailing', value: mail } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item))
  if (!items.length) return null
  const c = useClientTheme()
  return (
    <section
      className="grid gap-3 rounded-2xl border px-4 py-3 sm:grid-cols-2 lg:grid-cols-4"
      style={{ backgroundColor: c.card, borderColor: c.border, boxShadow: c.shadow.card }}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: c.secondary }}>
            {item.label}
          </p>
          <p className="mt-0.5 break-words text-sm" style={{ color: c.primary }}>
            {item.value}
          </p>
        </div>
      ))}
    </section>
  )
}
