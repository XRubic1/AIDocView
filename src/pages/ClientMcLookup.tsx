import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  Loader2,
  Mail,
  Phone,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useClientTheme } from '../theme/ThemeContext'
import '../styles/credyxMcCheck.css'
import { lookupMcCredit } from '../services/mcCreditLookupService'
import {
  lookupBrokerSnapshotByDot,
  lookupBrokerSnapshotByMc,
  recordLookupCreditScore,
} from '../services/brokerSnapshotService'
import { recordPublicMcCheck } from '../services/publicMcVisitorService'
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

function verdictStyle(verdict: McCreditVerdict, c: ReturnType<typeof useClientTheme>) {
  if (verdict === 'good') {
    return { bg: c.accentLight, border: c.accent, color: c.accent, Icon: CheckCircle2, label: 'Good' }
  }
  if (verdict === 'caution') {
    return { bg: c.stat.amber, border: c.warning, color: c.warning, Icon: AlertTriangle, label: 'Caution' }
  }
  if (verdict === 'avoid') {
    return { bg: c.stat.red, border: c.error, color: c.error, Icon: ShieldAlert, label: 'Avoid' }
  }
  return { bg: c.stat.slate, border: c.border, color: c.secondary, Icon: HelpCircle, label: 'Review' }
}

function ratingTone(rating: string, c: ReturnType<typeof useClientTheme>) {
  const value = rating.toUpperCase()
  if (value.includes('NO BUY') || value.includes('F')) return { color: c.error }
  if (['A', 'B', 'C'].some((letter) => value.includes(letter)) && !value.includes('D')) {
    return { color: c.accent }
  }
  if (value.includes('D')) return { color: c.warning }
  return null
}

function insuranceLabel(summary: BrokerSnapshotSummary): { label: string; ok: boolean } {
  const covered = (summary.activeInsuranceCount ?? 0) > 0 || (summary.insurances?.length ?? 0) > 0
  const brokerActive = (summary.brokerAuthority ?? '').trim().toLowerCase() === 'active'
  if (covered || summary.insuranceVerdict === 'ok' || brokerActive) return { label: 'Insurance on file', ok: true }
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

type DocketKind = 'MC' | 'DOT' | 'FF'

function brokerDomainNote(emails: string[], stolen: boolean): { title: string; text: string } | null {
  const domains = unique(emails.map((email) => extractEmailDomain(email)))
  if (stolen) {
    const from =
      domains.length === 1
        ? `comes from @${domains[0]}`
        : domains.length > 1
          ? `comes from ${domains.map((domain) => `@${domain}`).join(' or ')}`
          : 'and email domain are legitimate'
    return {
      title: 'Stolen-ID warning on file',
      text: `Before booking, call the phone numbers below, email the broker, and confirm the rate confirmation ${from}.`,
    }
  }
  if (domains.length > 1) {
    return {
      title: 'Email domains do not match',
      text: `Call the phone numbers below and confirm which domain is legitimate (${domains.map((domain) => `@${domain}`).join(', ')}).`,
    }
  }
  return null
}

function prettyCaps(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed !== trimmed.toUpperCase() || !/[A-Z]/.test(trimmed)) return trimmed
  return trimmed
    .toLowerCase()
    .replace(/(^|[^a-z0-9'])([a-z])/g, (_, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`)
    .replace(/\b([A-Za-z]{2})\b(?=\s*$)/, (word) => word.toUpperCase())
}

function decisionLine(
  profile: CreditProfile | null,
  assessment: McCreditAssessment | null,
  fallback: string
): string {
  const rating =
    profile?.rating && profile.rating !== '—' && profile.rating !== 'No Buy'
      ? `${profile.rating} rating`
      : null
  const score = assessment?.positives.find((item) => /credit score/i.test(item))
  const days =
    assessment?.positives.find((item) => /day/i.test(item)) ??
    assessment?.reasons.find((item) => /day/i.test(item))
  const scoreBit = score
    ? score.replace(/\s*\(avg [^)]+\)/i, '').replace(/\.$/, '').toLowerCase()
    : null
  const dayCount = days?.match(/(\d+)/)?.[1]
  const dayBit = dayCount
    ? /quick|fast/i.test(days ?? '')
      ? `payment around ${dayCount} days`
      : `an average of ${dayCount} days to pay`
    : null
  const bits = [rating, scoreBit, dayBit].filter((bit): bit is string => Boolean(bit))
  if (!bits.length) return fallback
  const [first, ...rest] = bits
  const head = first.charAt(0).toUpperCase() + first.slice(1)
  if (!rest.length) return `${head}.`
  if (rest.length === 1) return `${head} and ${rest[0]}.`
  return `${head}, ${rest[0]} and ${rest[1]}.`
}

function scoreCaption(profile: CreditProfile, assessment: McCreditAssessment | null): string {
  const line =
    assessment?.positives.find((item) => /credit score/i.test(item)) ??
    assessment?.reasons.find((item) => /credit score/i.test(item))
  if (line) {
    const avg = line.match(/avg\s+(\d+)/i)?.[1]
    const tone = /strong/i.test(line) ? 'Strong' : /moderate/i.test(line) ? 'Moderate' : 'Lower'
    return avg ? `${tone} credit scores across agencies (avg ${avg}).` : `${tone} credit scores across agencies.`
  }
  const notice = profile.notices.find((item) => !item.includes('@'))
  if (notice) return notice
  return profile.rating === 'N' ? 'No letter grade on file.' : 'Letter grade on file.'
}

function docketDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function companiesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
  const a = norm(left ?? '')
  const b = norm(right ?? '')
  if (!a || !b) return true
  return a.includes(b) || b.includes(a)
}

function brokerAuthorityActive(authority: BrokerSnapshotSummary): boolean {
  const broker = displayAuthorities(authority).broker.trim().toLowerCase()
  return broker === 'active' || broker === 'authorized'
}

/** A carrier with no credit file and no broker authority is not a broker to book. */
function isCarrierWithoutBrokerFile(
  credit: McCreditAssessment | null,
  profile: CreditProfile | null,
  authority: BrokerSnapshotSummary | null
): boolean {
  if (!authority?.found || brokerAuthorityActive(authority)) return false
  const noRating = !profile || profile.rating === '—'
  const noDays = !profile || profile.days === '—'
  const noFile = !credit || credit.sourceCount === 0 || credit.verdict === 'unknown'
  return noRating && noDays && noFile
}

function headlineFor(
  credit: McCreditAssessment | null,
  profile: CreditProfile | null,
  authority: BrokerSnapshotSummary | null
): { verdict: McCreditVerdict; title: string; summary: string } {
  if (isCarrierWithoutBrokerFile(credit, profile, authority)) {
    return {
      verdict: 'avoid',
      title: 'Not recommended',
      summary:
        'This is a carrier, not a broker. No credit rating, no days to pay, and no active broker authority.',
    }
  }
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
    const stolen = credit.reasons.some((reason) => reason.startsWith('Stolen-ID warning'))
    return {
      verdict: 'good',
      title: 'Good to work with',
      summary: stolen
        ? credit.summary
        : 'Credit and authority both look solid. Still confirm the load details.',
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

type CredyxPitch = 'general' | 'nobuy' | 'weak'

const CREDYX_GENERAL = [
  'Hey, did you know Credyx can also help you chase unpaid invoices?',
  'Hey, check this out 👀 Credyx can follow up with the broker if your invoice is on hold.',
  "Already booked the load and the broker isn't paying? Credyx can handle the follow-ups for you.",
  "Did you know Credyx can follow up with brokers for you when they don't pay?",
  "Invoice still unpaid? Don't waste your time chasing the broker. Let Credyx do it.",
  "Your broker hasn't paid yet? Send it to Credyx. We'll help chase it down.",
  'Oh, your invoice is on hold? 👀 Credyx can help you deal with the broker.',
  'You just checked the broker. Now let Credyx handle the paperwork and payment follow-ups.',
  "Hey, did you know there's more you can do on Credyx than just check brokers?",
  'Check brokers for free. And if something goes wrong after the load, Credyx can help.',
]

const CREDYX_LINES: Record<CredyxPitch, string[]> = {
  general: CREDYX_GENERAL,
  nobuy: ['Factoring company put your invoice on NO BUY? Let Credyx chase the broker for you.'],
  weak: [
    'Ohhh… this broker has a bad payment history 👀 Already booked the load? Let Credyx keep an eye on it.',
  ],
}

function pickLine(pitch: CredyxPitch): string {
  const lines = CREDYX_LINES[pitch]
  return lines[Math.floor(Math.random() * lines.length)]
}

function creditLooksWeak(profile: CreditProfile | null, assessment: McCreditAssessment | null): boolean {
  const rating = profile?.rating ?? ''
  if (rating === 'No Buy') return false
  if (/[DF]/.test(rating)) return true
  return Boolean(
    assessment?.reasons.some((reason) => /lower credit|credit rating includes d|slower payment/i.test(reason))
  )
}

function credyxPitch(
  loading: boolean,
  searched: boolean,
  verdict: McCreditVerdict | undefined,
  profile: CreditProfile | null,
  assessment: McCreditAssessment | null,
  carrier: boolean,
  blocked: boolean
): CredyxPitch {
  if (loading || !searched || !verdict) return 'general'
  const noBuy =
    profile?.rating === 'No Buy' ||
    Boolean(assessment?.reasons.some((reason) => /no buy/i.test(reason)))
  if (noBuy) return 'nobuy'
  if (carrier || blocked) return 'general'
  if ((verdict === 'avoid' || verdict === 'caution') && creditLooksWeak(profile, assessment)) {
    return 'weak'
  }
  return 'general'
}

export default function ClientMcLookup({
  initialMc = '',
  autoLookup = false,
  embedded = false,
  introduce = false,
  visitorMcDigits = '',
}: {
  initialMc?: string
  autoLookup?: boolean
  embedded?: boolean
  /** Public MC Check: Credyx card before the broker details. */
  introduce?: boolean
  /** Public /MC: unlocked carrier MC used to attribute lookups. */
  visitorMcDigits?: string
}) {
  const c = useClientTheme()
  const [kind, setKind] = useState<DocketKind>('MC')
  const [mc, setMc] = useState(initialMc)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credit, setCredit] = useState<McCreditSearchResponse | null>(null)
  const [authority, setAuthority] = useState<BrokerSnapshotSummary | null>(null)
  const [authorityError, setAuthorityError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [noteSearch, setNoteSearch] = useState(0)

  const assessment = credit ? assessMcCredit(credit) : null
  const profile = useMemo(() => (credit ? buildCreditProfile(credit.results) : null), [credit])
  const authorityFound = Boolean(authority?.found)
  const headline = searched ? headlineFor(assessment, profile, authority) : null

  async function runSearch(raw: string, searchKind: DocketKind = kind) {
    const digits = docketDigits(raw)
    if (!digits || (searchKind !== 'DOT' && digits.length < 4)) {
      setError(`Enter a ${searchKind} number.`)
      return
    }
    setMc(digits)
    setLoading(true)
    setError(null)
    setSearched(false)
    if (introduce) setNoteSearch((current) => current + 1)

    let nextCredit: McCreditSearchResponse | null = null
    let nextAuthority: BrokerSnapshotSummary | null = null
    let authorityFailed = false

    if (searchKind === 'DOT') {
      try {
        nextAuthority = await lookupBrokerSnapshotByDot(digits)
      } catch {
        authorityFailed = true
      }
      const mcDigits = docketDigits(nextAuthority?.mcNumber ?? '')
      if (mcDigits) {
        try {
          nextCredit = await lookupMcCredit(mcDigits)
        } catch {
          nextCredit = null
        }
      }
    } else {
      const prefix = searchKind === 'FF' ? 'FF' : 'MC'
      const [creditResult, authorityResult] = await Promise.allSettled([
        lookupMcCredit(digits),
        lookupBrokerSnapshotByMc(digits, { fresh: true, prefix }),
      ])
      nextCredit = creditResult.status === 'fulfilled' ? creditResult.value : null
      nextAuthority = authorityResult.status === 'fulfilled' ? authorityResult.value : null
      authorityFailed = authorityResult.status === 'rejected'
      const creditCompany = nextCredit?.results.find((row) => row.company)?.company?.replace(/\s*\(STOLEN ID.*$/i, '')
      if (prefix === 'FF' && nextAuthority?.found && !companiesMatch(nextAuthority.name, creditCompany)) {
        nextCredit = null
      }
    }

    setCredit(nextCredit)
    setAuthority(nextAuthority)
    setAuthorityError(
      authorityFailed ? 'Authority check did not return. Try the lookup again.' : null
    )
    setSearched(true)
    const score = nextCredit ? buildCreditProfile(nextCredit.results)?.score : null
    const scoreMc = nextCredit?.mc || nextAuthority?.mcNumber || (searchKind === 'MC' ? digits : '')
    if (score && score !== '—' && scoreMc) {
      void recordLookupCreditScore(scoreMc, score).catch(() => undefined)
    }
    if (!nextCredit && !nextAuthority) {
      setError(`${searchKind} lookup failed. Try again in a moment.`)
    }
    if (introduce && visitorMcDigits) {
      const resultCompany =
        prettyCaps(
          (nextAuthority?.found ? nextAuthority?.name : null) ||
            nextCredit?.results.find((row) => row.company)?.company?.replace(/\s*\(STOLEN ID.*$/i, '') ||
            ''
        ) || null
      const lookedUpDigits =
        docketDigits(nextCredit?.mc || nextAuthority?.mcNumber || '') || digits
      const lookedUpLabel =
        searchKind === 'DOT'
          ? `DOT-${digits}`
          : searchKind === 'FF'
            ? `FF-${lookedUpDigits}`
            : `MC-${lookedUpDigits}`
      void recordPublicMcCheck({
        visitorMcDigits,
        searchKind,
        searchedDigits: lookedUpDigits,
        searchedLabel: lookedUpLabel,
        companyName: resultCompany,
      })
    }
    setLoading(false)
  }

  function onSearch(event?: FormEvent) {
    event?.preventDefault()
    void runSearch(mc)
  }

  useEffect(() => {
    if (!autoLookup) return
    const cleaned = initialMc.trim()
    if (!cleaned) return
    void runSearch(cleaned, 'MC')
    // Prefill from the brokers tab should run once when this panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLookup, initialMc])

  const company = prettyCaps(
    (authorityFound ? authority?.name : null) || profile?.company || assessment?.company || 'Broker'
  )
  const place = prettyCaps(authority?.phyAddress || profile?.place || '')
  const phone = formatPhoneList(unique([profile?.phone, authority?.phone]).join(', '))
  const emails = unique(splitEmails([profile?.email, authority?.email].filter(Boolean).join(', ')))
  const showResult = searched && !error && (profile || authorityFound)
  const nothing = searched && !error && !profile && !authorityFound
  const stolen = hasStolenWarning(credit?.results)
  const domain = brokerDomainNote(emails, stolen)
  const otherReasons = (assessment?.reasons ?? []).filter((reason) => !reason.startsWith('Stolen-ID'))
  const summary = headline
    ? headline.verdict === 'avoid'
      ? headline.summary
      : headline.verdict === 'caution' && otherReasons.length > 0 && !headline.summary.startsWith('Stolen-ID')
        ? headline.summary
        : headline.verdict === 'caution' && otherReasons.length > 0
          ? otherReasons.join(' ')
          : decisionLine(profile, assessment, headline.summary)
    : ''
  const extraReasons = otherReasons.filter((reason) => {
    if (summary.includes(reason)) return false
    if (headline?.verdict === 'avoid' && /matching broker|no credit record/i.test(reason)) return false
    return true
  })
  const docket =
    authority?.mcNumber || credit?.mc || (kind === 'DOT' ? '' : mc)
  const docketLabel = /^(FF|MX|MC)/i.test(docket)
    ? docket
    : kind === 'FF'
      ? `FF-${docket}`
      : docket
  const idle = !loading && !searched && !error
  const showPublicResult = showResult && Boolean(headline)
  const pitch = credyxPitch(
    loading,
    searched,
    headline?.verdict,
    profile,
    assessment,
    isCarrierWithoutBrokerFile(assessment, profile, authority),
    Boolean(authority?.found && isDoNotWorkBroker(authority))
  )
  const noteKey = `${noteSearch}:${pitch}`
  const [credyxLine, setCredyxLine] = useState(() => ({ key: '0:general', text: pickLine('general') }))
  if (introduce && credyxLine.key !== noteKey) setCredyxLine({ key: noteKey, text: pickLine(pitch) })

  if (introduce) {
    return (
      <div className="credyx-mc">
        <div className="credyx-mc-wrap credyx-mc-main">
          <form className="credyx-mc-lkb" onSubmit={onSearch}>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as DocketKind)}
              disabled={loading}
              aria-label="Number type"
            >
              <option value="MC">MC</option>
              <option value="DOT">DOT</option>
              <option value="FF">FF</option>
            </select>
            <input
              value={mc}
              onChange={(event) => setMc(event.target.value)}
              placeholder="Enter broker number"
              inputMode="numeric"
              autoComplete="off"
              disabled={loading}
            />
            <button type="submit" className="credyx-mc-btn" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
            </button>
          </form>

          {idle ? (
            <div className="credyx-mc-empty">
              <h2>Look up any broker</h2>
              <p>Search by MC, DOT, or FF number.</p>
            </div>
          ) : null}

          {error ? <p className="credyx-mc-err">{error}</p> : null}

          {nothing ? (
            <div className="credyx-mc-empty">
              <h2>No record for {kind} {credit?.mc || mc}</h2>
              <p>Nothing came back for this number. Check the digits and try again.</p>
            </div>
          ) : null}

          {showPublicResult && headline ? (
            <div className="credyx-mc-go">
              <PublicCredyxCard key={credyxLine.key} text={credyxLine.text} />
              <PublicIdentityCard
                verdict={headline.verdict}
                title={headline.title}
                summary={summary}
                company={company}
                mc={docketLabel}
                dot={authority?.dotNumber}
                place={place}
              />
              <div className="credyx-mc-g3">
                <div className="credyx-mc-cd credyx-mc-rise" style={{ ['--d' as string]: '0.1s' }}>
                  <div className="credyx-mc-lab">Credit rating</div>
                  {profile ? (
                    <PublicRatingBody profile={profile} assessment={assessment} />
                  ) : (
                    <p className="credyx-mc-sub">No credit rating on file.</p>
                  )}
                </div>
                <div className="credyx-mc-cd credyx-mc-rise" style={{ ['--d' as string]: '0.2s' }}>
                  <div className="credyx-mc-lab">Days to pay</div>
                  {profile ? (
                    <PublicDaysBody profile={profile} />
                  ) : (
                    <p className="credyx-mc-sub">No payment pace on file.</p>
                  )}
                </div>
                <div className="credyx-mc-cd credyx-mc-rise" style={{ ['--d' as string]: '0.3s' }}>
                  <div className="credyx-mc-lab" style={{ marginBottom: 6 }}>
                    Authority
                  </div>
                  {authorityError ? <p className="credyx-mc-err">{authorityError}</p> : null}
                  <PublicAuthorityRows summary={authority} />
                </div>
              </div>
              <div className="credyx-mc-g2">
                <PublicInsuranceCard summary={authority} />
                <PublicContactCard phone={phone} emails={emails} />
              </div>
              {domain ? <DomainBar note={domain} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className={embedded ? 'min-h-0 flex-1 overflow-y-auto' : 'h-full overflow-y-auto'}
      style={{ backgroundColor: c.background }}
    >
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4 px-4 py-5 md:px-6 md:py-6">
        <form
          onSubmit={onSearch}
          className="flex items-center gap-2 rounded-2xl border px-3 py-2"
          style={{ backgroundColor: c.card, borderColor: c.border, boxShadow: c.shadow.card }}
        >
          <label className="relative shrink-0">
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as DocketKind)}
              disabled={loading}
              className="appearance-none bg-transparent py-2 pl-2 pr-7 text-sm font-semibold"
              style={{ color: c.primary }}
              aria-label="Number type"
            >
              <option value="MC">MC</option>
              <option value="DOT">DOT</option>
              <option value="FF">FF</option>
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-1 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: c.secondary }}
            />
          </label>
          <input
            value={mc}
            onChange={(event) => setMc(event.target.value)}
            placeholder={kind === 'DOT' ? 'DOT number' : kind === 'FF' ? 'FF number' : 'MC number'}
            inputMode="numeric"
            autoComplete="off"
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none"
            style={{ color: c.primary }}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: c.accent }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
          </button>
        </form>

        {error ? (
          <p
            className="rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: c.error, backgroundColor: c.stat.red, color: c.error }}
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
              No record for {kind} {credit?.mc || mc}
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
            summary={summary}
            extra={extraReasons}
            company={company}
            mc={docketLabel}
            dot={authority?.dotNumber}
            place={place}
          />
        ) : null}

        {showResult ? (
          <div className="grid items-stretch gap-3 md:grid-cols-3">
            <Card title="Credit rating">
              {profile ? (
                <RatingBody profile={profile} assessment={assessment} />
              ) : (
                <Placeholder>No credit rating on file.</Placeholder>
              )}
            </Card>
            <Card title="Days to pay">
              {profile ? <DaysBody profile={profile} /> : <Placeholder>No payment pace on file.</Placeholder>}
            </Card>
            <Card
              title="Authority and insurance"
              action={authority ? <InsuranceDebugButton payload={authority.insuranceDebug} /> : null}
            >
              {authorityError ? (
                <p className="mb-2 text-sm" style={{ color: c.error }}>
                  {authorityError}
                </p>
              ) : null}
              <AuthorityBody summary={authority} />
            </Card>
          </div>
        ) : null}

        {showResult && domain ? <DomainBar note={domain} /> : null}

        {showResult ? (
          <ContactStrip
            phone={phone}
            emails={emails}
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

function PublicCredyxCard({ text }: { text: string }) {
  return (
    <div className="credyx-mc-cx credyx-mc-rise" style={{ ['--d' as string]: '0s' }}>
      <div className="credyx-mc-cxh">
        <div>
          <span className="credyx-mc-eyebrow">Credyx A/R Solutions</span>
          <h3>{text}</h3>
          <p>We handle the paperwork and chase the broker. Payment goes straight to you.</p>
        </div>
        <Link className="credyx-mc-btn" to="/#waitlist-form">
          Schedule a demo
        </Link>
      </div>
      <div className="credyx-mc-cxs">
        <div>
          <b>1</b>You submit your docs
        </div>
        <div>
          <b>2</b>We verify them
        </div>
        <div>
          <b>3</b>We follow up with the broker
        </div>
        <div>
          <b>4</b>You get paid directly
        </div>
      </div>
    </div>
  )
}

function PublicIdentityCard({
  verdict,
  title,
  summary,
  company,
  mc,
  dot,
  place,
}: {
  verdict: McCreditVerdict
  title: string
  summary: string
  company: string
  mc: string
  dot?: number | null
  place?: string
}) {
  const prefix = mc.match(/^(FF|MX|MC)/i)?.[1]?.toUpperCase() ?? 'MC'
  const digits = mc.replace(/^(FF|MX|MC)-?/i, '').trim()
  const pills = [
    digits ? `${prefix} ${digits}` : null,
    dot != null ? `DOT ${dot}` : null,
  ].filter((pill): pill is string => Boolean(pill))
  const tone =
    verdict === 'good' ? 'ok' : verdict === 'caution' ? 'caution' : 'avoid'

  return (
    <div className="credyx-mc-cd credyx-mc-rise" style={{ ['--d' as string]: '0s' }}>
      <div className="credyx-mc-hd">
        <div>
          <h2>{company}</h2>
          {place ? <div className="credyx-mc-adr">{place}</div> : null}
        </div>
        {pills.length ? (
          <div className="credyx-mc-tags">
            {pills.map((pill) => (
              <span key={pill} className="credyx-mc-tg">
                {pill}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className={`credyx-mc-vd credyx-mc-vd--${tone}`}>
        <span className="credyx-mc-vd__ic">
          {tone === 'ok' ? <Check className="h-6 w-6" strokeWidth={2.6} /> : <AlertTriangle className="h-6 w-6" />}
        </span>
        <div>
          <h3>{title}</h3>
          <p>{summary}</p>
        </div>
      </div>
    </div>
  )
}

function PublicRatingBody({
  profile,
  assessment,
}: {
  profile: CreditProfile
  assessment: McCreditAssessment | null
}) {
  const score = profile.score === '—' ? null : profile.score.replace('–', '–')
  return (
    <div className="credyx-mc-cr">
      <div className="credyx-mc-rg">
        <svg viewBox="0 0 100 100" aria-hidden>
          <circle className="credyx-mc-rg__track" cx="50" cy="50" r="46" />
          <circle className="credyx-mc-rg__prog" cx="50" cy="50" r="46" />
        </svg>
        <b>{profile.rating}</b>
      </div>
      <div>
        {score ? <div className="credyx-mc-score-title">Score {score}</div> : null}
        <div className="credyx-mc-sub">{scoreCaption(profile, assessment)}</div>
      </div>
    </div>
  )
}

function PublicDaysBody({ profile }: { profile: CreditProfile }) {
  const range = profile.days === '—' ? null : profile.days.replace('–', '–')
  const nums = profile.days.match(/\d+/g)?.map(Number) ?? []
  const avg = nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : null
  const marker = avg != null ? Math.min(100, Math.max(0, (avg / 60) * 100)) : null
  return (
    <>
      <div className="credyx-mc-big">
        {range ?? '—'} {range ? <small>days</small> : null}
      </div>
      {avg != null ? (
        <div className="credyx-mc-sub">
          Average <b>{Math.round(avg)} days</b>
        </div>
      ) : null}
      {marker != null ? (
        <>
          <div className="credyx-mc-gg">
            <i style={{ flex: 50, background: 'var(--mc-blue)' }} />
            <i style={{ flex: 25, background: 'var(--mc-amb)' }} />
            <i style={{ flex: 25, background: 'var(--mc-red)' }} />
            <span className="credyx-mc-mk" style={{ left: `${marker}%` }} />
          </div>
          <div className="credyx-mc-tk">
            <span>0</span>
            <span>30</span>
            <span>60+</span>
          </div>
        </>
      ) : null}
    </>
  )
}

function PublicStatusPill({ value }: { value: string }) {
  const tone = statusTone(value)
  const label = shownStatus(value)
  const cls =
    tone === 'good' ? 'credyx-mc-pl' : tone === 'bad' ? 'credyx-mc-pl credyx-mc-pl--bad' : 'credyx-mc-pl credyx-mc-pl--n'
  return <b className={cls}>{label}</b>
}

function PublicAuthorityRows({ summary }: { summary: BrokerSnapshotSummary | null }) {
  if (!summary) {
    return <p className="credyx-mc-sub">No authority details for this number.</p>
  }
  const shown = displayAuthorities(summary)
  const blocked = isDoNotWorkBroker(summary)
  const brokerActive = brokerAuthorityActive(summary)
  const insurance = insuranceLabel(summary)
  const insuranceValue =
    insurance.label === 'Insurance on file'
      ? 'On file'
      : insurance.label === 'Insurance cancelled'
        ? 'Cancelled'
        : insurance.label === 'Insurance missing'
          ? 'Missing'
          : 'Needs review'
  return (
    <>
      <div className="credyx-mc-rw">
        <span>Authority</span>
        <PublicStatusPill value={brokerActive ? 'Active' : blocked ? 'Do not use' : 'None'} />
      </div>
      <div className="credyx-mc-rw">
        <span>Insurance</span>
        <PublicStatusPill value={insuranceValue} />
      </div>
      <div className="credyx-mc-rw">
        <span>Broker authority</span>
        <PublicStatusPill value={shown.broker} />
      </div>
      <div className="credyx-mc-rw">
        <span>Common</span>
        <PublicStatusPill value={shown.common} />
      </div>
      <div className="credyx-mc-rw">
        <span>Contract</span>
        <PublicStatusPill value={shown.contract} />
      </div>
    </>
  )
}

function PublicInsuranceCard({ summary }: { summary: BrokerSnapshotSummary | null }) {
  const policy = (summary?.insurances ?? []).find(
    (row) => row.companyName && !/^(surety bond|insurer|unknown insurer)$/i.test(row.companyName)
  )
  const filing = [policy?.policyNumber, money(policy?.maxLimit ?? null)].filter(Boolean).join(' · ')
  const contact = splitEmails(policy?.email ?? '')[0] || null
  const authorized =
    summary?.propertyAuthorized === true
      ? 'Broker Property'
      : summary?.brokerAuthority
        ? prettyCaps(summary.brokerAuthority)
        : null

  return (
    <div className="credyx-mc-cd credyx-mc-rise" style={{ ['--d' as string]: '0.4s' }}>
      <div className="credyx-mc-lab" style={{ marginBottom: 6 }}>
        Insurance on file
      </div>
      {policy?.companyName ? (
        <div className="credyx-mc-kv">
          <span>Insurer</span>
          <b>{policy.companyName}</b>
        </div>
      ) : (
        <div className="credyx-mc-kv">
          <span>Insurer</span>
          <b>{summary?.primaryInsurer || '—'}</b>
        </div>
      )}
      <div className="credyx-mc-kv">
        <span>Filing</span>
        <b>{filing || '—'}</b>
      </div>
      <div className="credyx-mc-kv">
        <span>Insurance contact</span>
        <b>{contact || '—'}</b>
      </div>
      <div className="credyx-mc-kv">
        <span>Authorized for</span>
        <b>{authorized || '—'}</b>
      </div>
      {summary?.dotNumber != null && summary.dotNumber > 0 ? (
        <a
          className="credyx-mc-lk"
          href={`https://motus.dot.gov/customer/${summary.dotNumber}/account`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View authority on Motus <ExternalLink className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  )
}

function PublicContactCard({ phone, emails }: { phone?: string; emails: string[] }) {
  const phones = (phone || '')
    .split(/[,;·]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (!phones.length && !emails.length) {
    return (
      <div className="credyx-mc-cd credyx-mc-ct credyx-mc-rise" style={{ ['--d' as string]: '0.5s' }}>
        <div className="credyx-mc-lab" style={{ marginBottom: 6 }}>
          Contact
        </div>
        <p className="credyx-mc-sub">No contact info on file.</p>
      </div>
    )
  }
  return (
    <div className="credyx-mc-cd credyx-mc-ct credyx-mc-rise" style={{ ['--d' as string]: '0.5s' }}>
      <div className="credyx-mc-lab" style={{ marginBottom: 6 }}>
        Contact
      </div>
      {phones.map((line) => (
        <a key={line} href={`tel:${line.replace(/[^\d+]/g, '')}`}>
          <Phone className="h-5 w-5" />
          {line}
        </a>
      ))}
      {emails.map((address) => (
        <a key={address} href={`mailto:${address}`}>
          <Mail className="h-5 w-5" />
          {address}
        </a>
      ))}
    </div>
  )
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const c = useClientTheme()
  return (
    <section
      className="flex h-full flex-col rounded-2xl border px-5 py-4"
      style={{ backgroundColor: c.card, borderColor: c.border, boxShadow: c.shadow.card }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm" style={{ color: c.secondary }}>
          {title}
        </p>
        {action}
      </div>
      <div className="mt-3">{children}</div>
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
  extra,
  company,
  mc,
  dot,
  place,
}: {
  verdict: McCreditVerdict
  title: string
  summary: string
  extra: string[]
  company: string
  mc: string
  dot?: number | null
  place?: string
}) {
  const c = useClientTheme()
  const style = verdictStyle(verdict, c)
  const Icon = style.Icon
  const prefix = mc.match(/^(FF|MX|MC)/i)?.[1]?.toUpperCase() ?? 'MC'
  const digits = mc.replace(/^(FF|MX|MC)-?/i, '').trim()
  const pills = [
    digits ? `${prefix} ${digits}` : null,
    dot != null ? `DOT ${dot}` : null,
  ].filter((pill): pill is string => Boolean(pill))

  return (
    <section className="rounded-2xl border px-5 py-5" style={{ backgroundColor: style.bg, borderColor: style.border }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold leading-tight" style={{ color: c.primary }}>
            {company}
          </h2>
          {place ? (
            <p className="mt-1 text-sm" style={{ color: c.secondary }}>
              {place}
            </p>
          ) : null}
        </div>
        {pills.length ? (
          <div className="flex flex-wrap gap-2">
            {pills.map((pill) => (
              <span
                key={pill}
                className="rounded-lg border px-2.5 py-1 text-xs font-medium"
                style={{ borderColor: c.accent, backgroundColor: c.card, color: c.primary }}
              >
                {pill}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-4 border-t pt-4" style={{ borderColor: style.border }}>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 shrink-0" style={{ color: style.color }} />
          <p className="text-lg font-semibold leading-none" style={{ color: style.color }}>
            {title}
          </p>
        </div>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: c.secondary }}>
          {summary}
        </p>
        {extra.length ? (
          <ul className="mt-2 space-y-1 text-sm" style={{ color: c.primary }}>
            {extra.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}

function RatingBody({
  profile,
  assessment,
}: {
  profile: CreditProfile
  assessment: McCreditAssessment | null
}) {
  const c = useClientTheme()
  const tone = ratingTone(profile.rating, c)
  const score = profile.score === '—' ? null : profile.score.replace('–', '-')
  return (
    <div>
      <p className="text-5xl font-semibold leading-none" style={{ color: tone?.color ?? c.primary }}>
        {profile.rating}
      </p>
      {score ? (
        <p className="mt-3 text-sm" style={{ color: c.secondary }}>
          Score {score}
        </p>
      ) : null}
      <p className="mt-2 text-sm leading-snug" style={{ color: c.secondary }}>
        {scoreCaption(profile, assessment)}
      </p>
    </div>
  )
}

function DaysBody({ profile }: { profile: CreditProfile }) {
  const c = useClientTheme()
  const label = profile.days === '—' ? '—' : `${profile.days.replace('–', '-')} days`
  const nums = profile.days.match(/\d+/g)?.map(Number) ?? []
  const marker = nums.length
    ? Math.min(100, Math.max(0, (nums.reduce((sum, value) => sum + value, 0) / nums.length / 60) * 100))
    : null
  return (
    <div>
      <p className="text-4xl font-semibold leading-none tracking-tight" style={{ color: c.primary }}>
        {label}
      </p>
      {marker != null ? (
        <div className="mt-8">
          <div className="relative h-2.5">
            <div className="flex h-2.5 overflow-hidden rounded-full">
              <div className="h-full w-1/2" style={{ backgroundColor: c.accent }} />
              <div className="h-full w-1/4" style={{ backgroundColor: c.warning }} />
              <div className="h-full flex-1" style={{ backgroundColor: c.error }} />
            </div>
            <span
              className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${marker}%`, backgroundColor: c.primary }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px]" style={{ color: c.secondary }}>
            <span>0</span>
            <span>30</span>
            <span>60+</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function statusTone(value: string): 'good' | 'bad' | 'muted' {
  const text = value.trim().toLowerCase()
  if (text === 'active' || text === 'on file' || text === 'authorized') return 'good'
  if (!text || text === 'none' || text === '—' || text === '-') return 'muted'
  if (/cancel|missing|inactive|not |do not|revok|unauthor|review/.test(text)) return 'bad'
  return 'muted'
}

function shownStatus(value: string): string {
  const text = value.trim()
  if (!text || text === '—' || text === '-' || /^none$/i.test(text)) return 'None'
  if (/^active$/i.test(text) || /^authorized$/i.test(text)) return 'Active'
  return text
}

function StatusLine({ label, value }: { label: string; value: string }) {
  const c = useClientTheme()
  const tone = statusTone(value)
  const dot = tone === 'good' ? c.accent : tone === 'bad' ? c.error : c.mutedLight
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span style={{ color: c.secondary }}>{label}</span>
      <span className="inline-flex items-center gap-2 font-medium" style={{ color: c.primary }}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
        {shownStatus(value)}
      </span>
    </div>
  )
}

function AuthorityBody({ summary }: { summary: BrokerSnapshotSummary | null }) {
  const c = useClientTheme()
  if (!summary) {
    return <Placeholder>No authority details for this number.</Placeholder>
  }
  const shown = displayAuthorities(summary)
  const blocked = isDoNotWorkBroker(summary)
  const brokerActive = brokerAuthorityActive(summary)
  const insurance = insuranceLabel(summary)
  const insuranceValue =
    insurance.label === 'Insurance on file'
      ? 'On file'
      : insurance.label === 'Insurance cancelled'
        ? 'Cancelled'
        : insurance.label === 'Insurance missing'
          ? 'Missing'
          : 'Needs review'
  const policies = (summary.insurances ?? [])
    .filter((policy) => policy.companyName && !/^(surety bond|insurer|unknown insurer)$/i.test(policy.companyName))
    .slice(0, 2)
  const showCancel = shouldShowCancellationHistory(summary)
  const note = summary.operatingStatus
    ? prettyCaps(summary.operatingStatus).replace(/:\s*/g, ' ').replace(/\s{2,}/g, ' ')
    : null
  return (
    <div>
      <StatusLine label="Authority" value={brokerActive ? 'Active' : blocked ? 'Do not use' : 'None'} />
      <StatusLine label="Insurance" value={insuranceValue} />
      <StatusLine label="Broker authority" value={shown.broker} />
      <StatusLine label="Common" value={shown.common} />
      <StatusLine label="Contract" value={shown.contract} />
      {summary.dotNumber != null && summary.dotNumber > 0 ? (
        <a
          href={`https://motus.dot.gov/customer/${summary.dotNumber}/account`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: c.accent }}
        >
          View authority on Motus
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
      {note ? (
        <p className="mt-3 text-xs leading-snug" style={{ color: c.secondary }}>
          {/[.!?]$/.test(note) ? note : `${note}.`}
        </p>
      ) : null}
      {policies.length ? (
        <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: c.border }}>
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
      ) : null}
      {showCancel && summary.latestCancellationDate ? (
        <p className="mt-2 text-xs" style={{ color: c.secondary }}>
          Cancellation on file · {summary.latestCancellationDate}
        </p>
      ) : null}
    </div>
  )
}

function InsuranceDebugButton({ payload }: { payload: unknown }) {
  const c = useClientTheme()
  const [open, setOpen] = useState(false)
  const text = payload == null ? 'No insurance payload was attached to this check.' : JSON.stringify(payload, null, 2)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
        style={{ borderColor: c.border, color: c.secondary }}
        aria-label="Show insurance debug"
        title="Show what the insurance check pulled"
      >
        <Bug className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)' }}
          onClick={() => setOpen(false)}
        >
          <section
            className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-xl"
            style={{ backgroundColor: c.card, borderColor: c.border }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Insurance debug"
          >
            <header
              className="flex items-center justify-between gap-3 border-b px-4 py-3"
              style={{ borderColor: c.border }}
            >
              <p className="text-sm font-semibold" style={{ color: c.primary }}>
                Insurance pull
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md"
                style={{ color: c.secondary }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <pre
              className="m-0 min-h-0 flex-1 overflow-auto px-4 py-3 text-xs leading-relaxed"
              style={{ color: c.primary }}
            >
              {text}
            </pre>
          </section>
        </div>
      ) : null}
    </>
  )
}

function DomainBar({ note }: { note: { title: string; text: string } }) {
  const c = useClientTheme()
  return (
    <section
      className="flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm"
      style={{ backgroundColor: c.stat.amber, borderColor: c.warning, color: c.primary }}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: c.warning }} />
      <div>
        <p className="font-semibold" style={{ color: c.warning }}>
          {note.title}
        </p>
        <p className="mt-0.5 leading-relaxed">{note.text}</p>
      </div>
    </section>
  )
}

function ContactLines({ value }: { value: string }) {
  const lines = value
    .split(/[,;·]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  return (
    <>
      {lines.map((line) => (
        <p key={line} className="break-words">
          {line}
        </p>
      ))}
    </>
  )
}

function ContactStrip({
  phone,
  emails,
  officer,
  mail,
}: {
  phone?: string
  emails: string[]
  officer?: string | null
  mail?: string
}) {
  const items = [
    phone ? { label: 'Phone', value: phone } : null,
    emails.length ? { label: 'Email', value: emails.join(' · ') } : null,
    officer ? { label: 'Officer', value: officer } : null,
    mail ? { label: 'Mailing', value: mail } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item))
  if (!items.length) return null
  const c = useClientTheme()
  return (
    <section
      className="grid gap-4 rounded-2xl border px-5 py-4 sm:grid-cols-2"
      style={{ backgroundColor: c.card, borderColor: c.border, boxShadow: c.shadow.card }}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="text-sm" style={{ color: c.secondary }}>
            {item.label}
          </p>
          <div className="mt-2 space-y-1 text-sm" style={{ color: c.primary }}>
            <ContactLines value={item.value} />
          </div>
        </div>
      ))}
    </section>
  )
}

