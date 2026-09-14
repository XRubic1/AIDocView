import type { ReactNode } from 'react'
import { useClientTheme } from '../../theme/ThemeContext'

export type CollectionsSettingsForm = {
  defaultPaperworkCheckDays: string
  defaultInquiryDays: string
  paymentVerifyUrgentDays: string
  followupAfterDays: string
  needsAttentionAfterDays: string
  willPayUrgent: boolean
  willPayMissedDays: string
  callbackUrgent: boolean
  callbackMissedDays: string
  riskyBrokerUrgent: boolean
  riskyBrokerMinLevel: 'high' | 'medium'
  overdueUrgent: boolean
  overdueUrgentDays: string
  noPpwUrgent: boolean
  noPpwAfterDays: string
  staleContactUrgent: boolean
  staleContactDays: string
  needsCallUrgent: boolean
}

type Patch = Partial<CollectionsSettingsForm>

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

function DaysInput({
  value,
  onChange,
  disabled,
  label,
  min = 1,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  label: string
  min?: number
}) {
  const c = useClientTheme()
  return (
    <input
      type="number"
      min={min}
      max={90}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="collections-rule__days tabular-nums"
      style={{
        color: c.primary,
        borderColor: c.border,
        backgroundColor: disabled ? 'transparent' : c.card,
      }}
    />
  )
}

function RuleRow({
  on,
  onToggle,
  title,
  info,
  children,
}: {
  on: boolean
  onToggle: (value: boolean) => void
  title: string
  info: string
  children: ReactNode
}) {
  const c = useClientTheme()
  return (
    <label className={`collections-rule${on ? ' is-on' : ''}`}>
      <input
        type="checkbox"
        className="collections-rule__check"
        checked={on}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={title}
      />
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
    </label>
  )
}

function Step({
  n,
  label,
  info,
  children,
}: {
  n: number
  label: string
  info: string
  children: ReactNode
}) {
  const c = useClientTheme()
  return (
    <li className="collections-chase-step">
      <span className="collections-chase-step__n tabular-nums" style={{ color: c.info }}>
        {n}
      </span>
      <span className="collections-chase-step__main">
        <span className="collections-chase-step__head">
          <span className="collections-chase-step__label" style={{ color: c.primary }}>
            {label}
          </span>
          <InfoTip text={info} />
        </span>
        <span className="collections-chase-step__copy" style={{ color: c.secondary }}>
          {children}
        </span>
      </span>
    </li>
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
 * Collections rules as sectioned cards with “!” tooltips.
 */
export default function CollectionsSettingsPanel({
  settings,
  onChange,
}: {
  settings: CollectionsSettingsForm
  onChange: (patch: Patch) => void
}) {
  const s = settings

  return (
    <div className="collections-settings">
      <Section
        eyebrow="Chase"
        title="Broker follow-up clock"
        info="This is the email/call cadence after paperwork is sent. It does not change the invoice due date. Due date is still invoice date + broker Net terms. Status inquiry is a check-in, not a demand for payment."
        lead="After PPW is sent, wait for the broker to confirm they have the packet. After they confirm, wait until Net terms, then call to verify payment. Past that window, it is urgent collection."
      >
        <ol className="collections-chase-steps">
          <Step
            n={1}
            label="PPW status check"
            info="After the packet is emailed, wait this many days, then confirm the broker received paperwork. Each broker can override this (7 default, some want 10–15). Until they confirm, the invoice stays on PPW status check."
          >
            Wait{' '}
            <DaysInput
              label="Days after PPW before paperwork check"
              value={s.defaultPaperworkCheckDays}
              onChange={(v) => onChange({ defaultPaperworkCheckDays: v })}
            />{' '}
            days after PPW (broker record can override), then check that paperwork was received.
          </Step>
          <Step
            n={2}
            label="Payment waiting"
            info="Once paperwork is broker-confirmed, do not chase payment until Net terms (due date). The invoice sits in payment waiting."
          >
            After broker confirmed, wait until the invoice reaches Net terms (due by days on the broker).
            If the broker has no due date, wait{' '}
            <DaysInput
              label="Days after PPW before payment verify when no Net terms"
              value={s.defaultInquiryDays}
              onChange={(v) => onChange({ defaultInquiryDays: v })}
            />{' '}
            days after PPW instead.
          </Step>
          <Step
            n={3}
            label="Payment verify"
            info="On the due date, the invoice enters the verification queue. Someone must call or email the broker for payment status."
          >
            At Net terms, place it in the payment-verify queue so Credyx can call the broker.
          </Step>
          <Step
            n={4}
            label="Urgent collection"
            info="If verification is still open this many days after Net terms, the invoice is past due and moves to the urgent collection queue (marked separately from ordinary chase)."
          >
            If still unpaid{' '}
            <DaysInput
              label="Days after Net terms before urgent collection"
              value={s.paymentVerifyUrgentDays}
              onChange={(v) => onChange({ paymentVerifyUrgentDays: v })}
            />{' '}
            days after Net terms, mark past due and urgent collection.
          </Step>
          <Step
            n={5}
            label="Follow-up if they go quiet"
            info="Counted from the day the inquiry was sent — not from PPW. A second email if they never answered the first."
          >
            If they don’t reply, send a follow-up{' '}
            <DaysInput
              label="Days after inquiry before follow-up"
              value={s.followupAfterDays}
              onChange={(v) => onChange({ followupAfterDays: v })}
            />{' '}
            days after that inquiry.
          </Step>
          <Step
            n={6}
            label="Call the broker"
            info="Counted from the inquiry date. Collections shows “Call broker.” This is a person task — Credyx does not auto-dial."
          >
            If they’re still quiet{' '}
            <DaysInput
              label="Days after inquiry before a call"
              value={s.needsAttentionAfterDays}
              onChange={(v) => onChange({ needsAttentionAfterDays: v })}
            />{' '}
            days after the inquiry, someone should call.
          </Step>
        </ol>
      </Section>

      <Section
        eyebrow="Review"
        title="Mark urgent when…"
        info="Urgent is a Collections filter so a person reviews the file. It does not auto-email the broker or change due dates. Turn a rule off if you don’t want that case in Urgent."
        lead="These flags mean a person should look at the invoice. Each rule can be on or off."
      >
        <div className="collections-rule-groups">
          <Group title="Payment promises">
            <RuleRow
              on={s.willPayUrgent}
              onToggle={(v) => onChange({ willPayUrgent: v })}
              title="Will Pay slipped"
              info="Will Pay is the date the broker confirmed they will pay. If that date passes by this many days and the invoice still has an open balance, the promise slipped — review it. This is not the same as the due date (Net terms)."
            >
              Payment still isn’t in{' '}
              <DaysInput
                label="Days after Will Pay before urgent"
                value={s.willPayMissedDays}
                onChange={(v) => onChange({ willPayMissedDays: v })}
                disabled={!s.willPayUrgent}
              />{' '}
              days after the confirmed pay date.
            </RuleRow>
            <RuleRow
              on={s.callbackUrgent}
              onToggle={(v) => onChange({ callbackUrgent: v })}
              title="Call back due"
              info="Call Back is the date Credyx scheduled to check in. On that day (0 extra days) Review shows Call back due. Add extra days only if you want slack after the date."
            >
              Flag Call back due on the scheduled day, plus{' '}
              <DaysInput
                label="Extra days after call back before Review"
                value={s.callbackMissedDays}
                onChange={(v) => onChange({ callbackMissedDays: v })}
                disabled={!s.callbackUrgent}
                min={0}
              />{' '}
              extra days.
            </RuleRow>
          </Group>

          <Group title="Aging & paperwork">
            <RuleRow
              on={s.overdueUrgent}
              onToggle={(v) => onChange({ overdueUrgent: v })}
              title="Past due"
              info="Due date = invoice date + broker Net days. An invoice is overdue 15 days past that due date in A/R policy. This rule marks it Urgent at the days you set here (often the same 15)."
            >
              Open balance is{' '}
              <DaysInput
                label="Days past due before urgent"
                value={s.overdueUrgentDays}
                onChange={(v) => onChange({ overdueUrgentDays: v })}
                disabled={!s.overdueUrgent}
              />{' '}
              or more days past due.
            </RuleRow>
            <RuleRow
              on={s.noPpwUrgent}
              onToggle={(v) => onChange({ noPpwUrgent: v })}
              title="PPW never sent"
              info="Open invoices must have PPW sent to the broker. This is a major issue — they cannot pay without the packet. 0 days means flag as soon as the invoice is open."
            >
              No PPW sent on an open invoice, after{' '}
              <DaysInput
                label="Invoice age before missing PPW is a major issue"
                value={s.noPpwAfterDays}
                onChange={(v) => onChange({ noPpwAfterDays: v })}
                disabled={!s.noPpwUrgent}
                min={0}
              />{' '}
              days (0 = immediately).
            </RuleRow>
            <RuleRow
              on={s.staleContactUrgent}
              onToggle={(v) => onChange({ staleContactUrgent: v })}
              title="Gone quiet"
              info="Only after the inquiry window. Last contact is the latest of “broker contacted” or the last inquiry email. Never contacted counts as stale."
            >
              Inquiry is due, and nobody has talked to the broker in{' '}
              <DaysInput
                label="Days without contact before urgent"
                value={s.staleContactDays}
                onChange={(v) => onChange({ staleContactDays: v })}
                disabled={!s.staleContactUrgent}
              />{' '}
              days (or never).
            </RuleRow>
          </Group>

          <Group title="Broker risk">
            <RuleRow
              on={s.riskyBrokerUrgent}
              onToggle={(v) => onChange({ riskyBrokerUrgent: v })}
              title="Risky broker — all open loads"
              info="If Credyx has flagged this broker as risky, don’t wait load-by-load. Every open invoice for them is urgent. Cleared risk reviews do not trigger this."
            >
              Broker is flagged{' '}
              <select
                className="collections-rule__select"
                value={s.riskyBrokerMinLevel}
                disabled={!s.riskyBrokerUrgent}
                onChange={(e) =>
                  onChange({
                    riskyBrokerMinLevel: e.target.value === 'medium' ? 'medium' : 'high',
                  })
                }
                aria-label="Risk level that makes loads urgent"
              >
                <option value="high">high risk</option>
                <option value="medium">medium or high risk</option>
              </select>
              .
            </RuleRow>
          </Group>

          <Group title="Chase">
            <RuleRow
              on={s.needsCallUrgent}
              onToggle={(v) => onChange({ needsCallUrgent: v })}
              title="Needs a call"
              info="When the follow-up clock already says “Call broker,” also put it in the Urgent filter so it isn’t only on the Chase tab."
            >
              Chase already says we need to call the broker.
            </RuleRow>
          </Group>
        </div>
      </Section>
    </div>
  )
}
