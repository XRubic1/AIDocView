import type { ReactNode } from 'react'
import { useClientTheme } from '../../theme/ThemeContext'

export type BrokerRiskSettingsForm = {
  medium_single_late_days: string
  high_single_late_days: string
  late_payment_min_days: string
  open_overdue_min_days: string
  medium_late_count: string
  medium_open_overdue_count: string
  high_late_count: string
  high_open_overdue_count: string
  lookback_days: string
  fallback_terms_days: string
  min_paid_sample_for_confidence: string
  cacheTtlDays: string
  insuranceWatchTtlDays: string
}

type Patch = Partial<BrokerRiskSettingsForm>

function InfoTip({ text }: { text: string }) {
  return (
    <span className="collections-info">
      <button
        type="button"
        className="collections-info__btn"
        aria-label="Why this matters"
        onClick={(e) => e.preventDefault()}
      >
        !
      </button>
      <span className="collections-info__tip" role="tooltip">
        {text}
      </span>
    </span>
  )
}

function NumInput({
  value,
  onChange,
  label,
  max = 365,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  max?: number
}) {
  const c = useClientTheme()
  return (
    <input
      type="number"
      min={1}
      max={max}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="collections-rule__days tabular-nums"
      style={{
        color: c.primary,
        borderColor: c.border,
        backgroundColor: c.card,
      }}
    />
  )
}

function Row({
  title,
  info,
  children,
}: {
  title: string
  info: string
  children: ReactNode
}) {
  const c = useClientTheme()
  return (
    <div className="collections-rule is-on">
      <span className="collections-rule__main">
        <span className="collections-rule__head">
          <span className="collections-rule__title" style={{ color: c.primary }}>
            {title}
          </span>
          <InfoTip text={info} />
        </span>
        <span className="collections-rule__copy" style={{ color: c.secondary }}>
          {children}
        </span>
      </span>
    </div>
  )
}

function Section({
  eyebrow,
  title,
  info,
  lead,
  children,
}: {
  eyebrow: string
  title: string
  info: string
  lead: string
  children: ReactNode
}) {
  const c = useClientTheme()
  return (
    <section className="collections-settings__card" style={{ borderColor: c.border, backgroundColor: c.card }}>
      <header className="collections-settings__card-head">
        <p className="collections-settings__eyebrow" style={{ color: c.info }}>
          {eyebrow}
        </p>
        <div className="collections-settings__card-title-row">
          <h3 className="collections-settings__title" style={{ color: c.primary }}>
            {title}
          </h3>
          <InfoTip text={info} />
        </div>
        <p className="collections-settings__lead" style={{ color: c.secondary }}>
          {lead}
        </p>
      </header>
      {children}
    </section>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const c = useClientTheme()
  return (
    <div className="collections-rule-group">
      <h4 className="collections-rule-group__title" style={{ color: c.muted }}>
        {title}
      </h4>
      <div className="collections-rules">{children}</div>
    </div>
  )
}

/**
 * Broker Risk scoring + MC Lookup cache — Settings tab.
 */
export default function BrokerRiskSettingsPanel({
  settings,
  onChange,
}: {
  settings: BrokerRiskSettingsForm
  onChange: (patch: Patch) => void
}) {
  const s = settings

  return (
    <div className="collections-settings">
      <Section
        eyebrow="Scoring"
        title="When a broker needs review"
        info="These clocks count days past the broker’s Net due date — not invoice age. Due date is invoice date + Net. Changing this does not auto-email the broker; it only changes who lands in Broker Risk."
        lead="Past Net terms, not the due date itself. Run analysis after you save to refresh the queue."
      >
        <div className="collections-rule-groups">
          <Group title="Review clocks">
            <Row
              title="Needs review"
              info="One paid or open invoice this many days past Net → Medium / Needs review. Net 30 + 15 = day 45."
            >
              Flag at{' '}
              <NumInput
                label="Days past Net for Needs review"
                value={s.medium_single_late_days}
                onChange={(v) => onChange({ medium_single_late_days: v })}
                max={90}
              />{' '}
              days past Net.
            </Row>
            <Row
              title="Urgent / High"
              info="One paid or open invoice this many days past Net → High / Urgent. Net 30 + 21 = day 51."
            >
              Escalate at{' '}
              <NumInput
                label="Days past Net for High / Urgent"
                value={s.high_single_late_days}
                onChange={(v) => onChange({ high_single_late_days: v })}
                max={90}
              />{' '}
              days past Net.
            </Row>
            <Row
              title="Count a paid invoice as late"
              info="A remittance only counts as a late payment after this many days past Net — same idea as Needs review, not day 1 after due."
            >
              After{' '}
              <NumInput
                label="Days past Net before a paid invoice counts late"
                value={s.late_payment_min_days}
                onChange={(v) => onChange({ late_payment_min_days: v })}
                max={90}
              />{' '}
              days past Net.
            </Row>
            <Row
              title="Count an open invoice as overdue"
              info="Open A/R enters overdue counts only after this many days past due. Aligns with collections grace."
            >
              After{' '}
              <NumInput
                label="Days past due before open A/R counts overdue"
                value={s.open_overdue_min_days}
                onChange={(v) => onChange({ open_overdue_min_days: v })}
                max={90}
              />{' '}
              days past due.
            </Row>
          </Group>

          <Group title="Medium vs High">
            <Row
              title="Medium — late pays"
              info="At least this many review-threshold late payments → Medium."
            >
              At least{' '}
              <NumInput
                label="Late payment count for Medium"
                value={s.medium_late_count}
                onChange={(v) => onChange({ medium_late_count: v })}
                max={20}
              />{' '}
              late payments.
            </Row>
            <Row
              title="Medium — open past terms"
              info="At least this many open invoices past the review clock → Medium."
            >
              At least{' '}
              <NumInput
                label="Open overdue count for Medium"
                value={s.medium_open_overdue_count}
                onChange={(v) => onChange({ medium_open_overdue_count: v })}
                max={20}
              />{' '}
              open invoices past review.
            </Row>
            <Row
              title="High — late pays"
              info="At least this many review-threshold late payments → High."
            >
              At least{' '}
              <NumInput
                label="Late payment count for High"
                value={s.high_late_count}
                onChange={(v) => onChange({ high_late_count: v })}
                max={20}
              />{' '}
              late payments.
            </Row>
            <Row
              title="High — open past urgent"
              info="This many open invoices already past the Urgent clock → High. Opens that are only at Needs review stay Medium."
            >
              At least{' '}
              <NumInput
                label="Open urgent overdue count for High"
                value={s.high_open_overdue_count}
                onChange={(v) => onChange({ high_open_overdue_count: v })}
                max={20}
              />{' '}
              open invoices past urgent.
            </Row>
          </Group>
        </div>
      </Section>

      <Section
        eyebrow="History"
        title="Terms, sample & MC lookup"
        info="Fallback Net is only used when the broker record has no Due by days. Snapshot cache is the FMCSA/MC lookup — not the same as Broker Risk scoring."
        lead="How far back we look, default Net, and how often MC Lookup refreshes."
      >
        <div className="collections-rule-groups">
          <Group title="Payment history">
            <Row
              title="Lookback"
              info="Confirmed payments older than this are ignored when counting late pays."
            >
              Last{' '}
              <NumInput
                label="Lookback days for late paid invoices"
                value={s.lookback_days}
                onChange={(v) => onChange({ lookback_days: v })}
                max={730}
              />{' '}
              days of paid invoices.
            </Row>
            <Row
              title="Fallback Net"
              info="If the broker has no Due by (Net) on file, use this many days from invoice date."
            >
              Assume Net{' '}
              <NumInput
                label="Fallback Net terms days"
                value={s.fallback_terms_days}
                onChange={(v) => onChange({ fallback_terms_days: v })}
                max={90}
              />{' '}
              when the broker has no terms.
            </Row>
            <Row
              title="Thin history"
              info="Fewer confirmed pays than this with the carrier → insufficient sample (NEW / low confidence)."
            >
              Need{' '}
              <NumInput
                label="Minimum paid invoices for confidence"
                value={s.min_paid_sample_for_confidence}
                onChange={(v) => onChange({ min_paid_sample_for_confidence: v })}
                max={20}
              />{' '}
              confirmed pays for confidence.
            </Row>
          </Group>

          <Group title="MC Lookup cache">
            <Row
              title="Normal refresh"
              info="Shared cache so many carriers looking up the same MC do not each burn an API call. After this window, the next lookup refreshes."
            >
              Refresh every{' '}
              <NumInput
                label="Normal Snapshot cache TTL days"
                value={s.cacheTtlDays}
                onChange={(v) => onChange({ cacheTtlDays: v })}
                max={365}
              />{' '}
              days when insurance looks fine.
            </Row>
            <Row
              title="Insurance watch"
              info="Shorter window when insurance is missing, cancelled, or weak — so Inactive / cancelled coverage is not stale."
            >
              Refresh every{' '}
              <NumInput
                label="Insurance-watch Snapshot cache TTL days"
                value={s.insuranceWatchTtlDays}
                onChange={(v) => onChange({ insuranceWatchTtlDays: v })}
                max={365}
              />{' '}
              days when insurance is weak.
            </Row>
          </Group>
        </div>
      </Section>
    </div>
  )
}
