/**
 * Settings → Email sends: compact toggles + chase clocks, details on hover.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Info, Save } from 'lucide-react'
import {
  EMAIL_LIFECYCLE_RULES,
  DEFAULT_EMAIL_LIFECYCLE_SETTINGS,
  type EmailLifecycleRule,
  type EmailLifecycleSettings,
  type EmailTrackClockDefaults,
} from '../../config/emailLifecycle'
import {
  loadEmailLifecycleSettings,
  saveEmailLifecycleSettings,
} from '../../services/platformSettingsService'
import { useToast } from '../ui/ToastProvider'
import { useClientTheme } from '../../theme/ThemeContext'
import Spinner from '../ui/Spinner'

const RULE_GROUPS: {
  id: string
  title: string
  info: string
  ids: EmailLifecycleRule['id'][]
}[] = [
  {
    id: 'carriers',
    title: 'Carriers',
    info: 'Emails to the carrier after you Process a batch or place a hold/claim. Account-dispute notices run from Blueprints.',
    ids: ['batch_processed_carrier', 'carrier_claim_or_hold_notice'],
  },
  {
    id: 'chasing',
    title: 'Chasing',
    info: 'Timed paperwork and payment status follow-ups. Packet send and ops alerts run from Blueprints.',
    ids: [
      'broker_paperwork_status_inquiry',
      'broker_paperwork_status_followup',
      'broker_payment_status_inquiry',
      'broker_payment_status_followup',
    ],
  },
  {
    id: 'claims',
    title: 'Claims',
    info: 'Staff-triggered “is this claim on the whole account?” email from Inbox. Does not send on a timer.',
    ids: ['broker_claim_scope'],
  },
]

/** Short labels for dense rows (full detail lives in the info tip). */
const SHORT_LABELS: Partial<Record<EmailLifecycleRule['id'], string>> = {
  batch_processed_carrier: 'Batch processed (skipped if Live blueprint Then-do owns it)',
  carrier_claim_or_hold_notice: 'Hold / claim notice',
  broker_paperwork_status_inquiry: 'Paperwork status (1st)',
  broker_paperwork_status_followup: 'Paperwork status (2nd)',
  broker_payment_status_inquiry: 'Payment status (1st)',
  broker_payment_status_followup: 'Payment status (2nd)',
  broker_claim_scope: 'Claim scope ask',
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="email-sends-info">
      <button
        type="button"
        className="email-sends-info__btn"
        aria-label="More information"
        onClick={(e) => e.preventDefault()}
      >
        <Info className="w-3 h-3" aria-hidden />
      </button>
      <span className="email-sends-info__tip" role="tooltip">
        {text}
      </span>
    </span>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  const c = useClientTheme()
  return (
    <label className="client-toggle shrink-0" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        className="client-toggle__track"
        style={{ backgroundColor: checked ? c.info : c.border }}
      />
    </label>
  )
}

function DaysField({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number
  onChange: (n: number) => void
  disabled?: boolean
  label: string
}) {
  const c = useClientTheme()
  return (
    <input
      type="number"
      min={0}
      max={90}
      disabled={disabled}
      value={value}
      aria-label={label}
      onChange={(e) => {
        const n = Number(e.target.value)
        onChange(Number.isFinite(n) ? n : 0)
      }}
      className="email-sends-days tabular-nums"
      style={{
        color: c.primary,
        backgroundColor: disabled ? 'transparent' : c.card,
        borderColor: c.border,
      }}
    />
  )
}

function ClockRow({
  label,
  info,
  paperwork,
  payment,
}: {
  label: string
  info: string
  paperwork: ReactNode
  payment: ReactNode
}) {
  const c = useClientTheme()
  return (
    <div className="email-sends-clock__row" style={{ borderColor: c.border }}>
      <div className="email-sends-clock__label">
        <span style={{ color: c.primary }}>{label}</span>
        <InfoTip text={info} />
      </div>
      <div className="email-sends-clock__cell">{paperwork}</div>
      <div className="email-sends-clock__cell">{payment}</div>
    </div>
  )
}

function ChaseClocks({
  paperwork,
  payment,
  onPaperwork,
  onPayment,
}: {
  paperwork: EmailTrackClockDefaults
  payment: EmailTrackClockDefaults
  onPaperwork: (next: EmailTrackClockDefaults) => void
  onPayment: (next: EmailTrackClockDefaults) => void
}) {
  const c = useClientTheme()
  return (
    <section className="email-sends-block" style={{ borderColor: c.border, backgroundColor: c.card }}>
      <header className="email-sends-block__head">
        <h4 className="email-sends-block__title" style={{ color: c.primary }}>
          Chase clocks
        </h4>
        <InfoTip text="Paperwork track starts when PPW is delivered. Payment track starts after paperwork is confirmed good, then waits Net terms. Brokers can override days on their record." />
      </header>
      <div className="email-sends-clock">
        <div className="email-sends-clock__row email-sends-clock__row--head" style={{ borderColor: c.border }}>
          <div />
          <div className="email-sends-clock__col-h" style={{ color: c.secondary }}>
            Paperwork
          </div>
          <div className="email-sends-clock__col-h" style={{ color: c.secondary }}>
            Payment
          </div>
        </div>
        <ClockRow
          label="First ask"
          info="Days to wait before the first status email. Paperwork: after PPW delivered. Payment: after paperwork is good (then Net terms still apply)."
          paperwork={
            <DaysField
              label="Paperwork first ask days"
              value={paperwork.firstAskDays}
              onChange={(firstAskDays) => onPaperwork({ ...paperwork, firstAskDays })}
            />
          }
          payment={
            <DaysField
              label="Payment first ask days"
              value={payment.firstAskDays}
              onChange={(firstAskDays) => onPayment({ ...payment, firstAskDays })}
            />
          }
        />
        <ClockRow
          label="Action after 1st"
          info="Create a staff action item if there is no reply after the first ask. Days = wait after first ask (0 = same day)."
          paperwork={
            <span className="email-sends-clock__combo">
              <Toggle
                checked={paperwork.actionNeededAfterFirst}
                onChange={(actionNeededAfterFirst) =>
                  onPaperwork({ ...paperwork, actionNeededAfterFirst })
                }
                label="Paperwork action after first"
              />
              <DaysField
                label="Paperwork action days"
                value={paperwork.actionNeededAfterFirstDays}
                disabled={!paperwork.actionNeededAfterFirst}
                onChange={(actionNeededAfterFirstDays) =>
                  onPaperwork({ ...paperwork, actionNeededAfterFirstDays })
                }
              />
            </span>
          }
          payment={
            <span className="email-sends-clock__combo">
              <Toggle
                checked={payment.actionNeededAfterFirst}
                onChange={(actionNeededAfterFirst) =>
                  onPayment({ ...payment, actionNeededAfterFirst })
                }
                label="Payment action after first"
              />
              <DaysField
                label="Payment action days"
                value={payment.actionNeededAfterFirstDays}
                disabled={!payment.actionNeededAfterFirst}
                onChange={(actionNeededAfterFirstDays) =>
                  onPayment({ ...payment, actionNeededAfterFirstDays })
                }
              />
            </span>
          }
        />
        <ClockRow
          label="2nd follow-up"
          info="Days after the first ask before a second email. Set 0 to skip the second send."
          paperwork={
            <DaysField
              label="Paperwork second follow-up days"
              value={paperwork.secondFollowupDays}
              onChange={(secondFollowupDays) => onPaperwork({ ...paperwork, secondFollowupDays })}
            />
          }
          payment={
            <DaysField
              label="Payment second follow-up days"
              value={payment.secondFollowupDays}
              onChange={(secondFollowupDays) => onPayment({ ...payment, secondFollowupDays })}
            />
          }
        />
        <ClockRow
          label="Needs attention"
          info="Silent days after the second follow-up before the load is flagged for staff attention."
          paperwork={
            <DaysField
              label="Paperwork needs-attention days"
              value={paperwork.needsAttentionAfterSecondDays}
              onChange={(needsAttentionAfterSecondDays) =>
                onPaperwork({ ...paperwork, needsAttentionAfterSecondDays })
              }
            />
          }
          payment={
            <DaysField
              label="Payment needs-attention days"
              value={payment.needsAttentionAfterSecondDays}
              onChange={(needsAttentionAfterSecondDays) =>
                onPayment({ ...payment, needsAttentionAfterSecondDays })
              }
            />
          }
        />
      </div>
    </section>
  )
}

/** Compact email send toggles and chase clocks with hover info. */
export default function EmailWorkflowSettingsPanel() {
  const c = useClientTheme()
  const { showToast } = useToast()
  const [settings, setSettings] = useState<EmailLifecycleSettings>(DEFAULT_EMAIL_LIFECYCLE_SETTINGS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void loadEmailLifecycleSettings().then((next) => {
      setSettings(next)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const next = await saveEmailLifecycleSettings(settings)
      setSettings(next)
      showToast('Email sends saved', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const ruleById = new Map(EMAIL_LIFECYCLE_RULES.map((r) => [r.id, r]))

  return (
    <div className="email-sends-settings">
      <div className="email-sends-settings__toolbar">
        <div className="email-sends-settings__intro">
          <h3 className="email-sends-settings__title" style={{ color: c.primary }}>
            Email sends
          </h3>
          <InfoTip text="Turn off individual email types. Disabled sends are skipped; chase clocks and templates stay as configured. Brokers can still prefer phone on their record." />
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1.5 shrink-0"
        >
          {saving ? <Spinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>

      <div className="email-sends-grid">
        {RULE_GROUPS.map((group) => (
          <section
            key={group.id}
            className="email-sends-block"
            style={{ borderColor: c.border, backgroundColor: c.card }}
          >
            <header className="email-sends-block__head">
              <h4 className="email-sends-block__title" style={{ color: c.primary }}>
                {group.title}
              </h4>
              <InfoTip text={group.info} />
            </header>
            <ul className="email-sends-rows">
              {group.ids.map((id) => {
                const rule = ruleById.get(id)
                if (!rule) return null
                const on = settings.rules[id]?.enabled !== false
                const label = SHORT_LABELS[id] ?? rule.name
                return (
                  <li key={id} className={`email-sends-row${on ? ' is-on' : ''}`}>
                    <span className="email-sends-row__label" style={{ color: c.primary }}>
                      {label}
                      <InfoTip text={rule.description} />
                    </span>
                    <Toggle
                      checked={on}
                      onChange={(enabled) =>
                        setSettings((s) => ({
                          ...s,
                          rules: { ...s.rules, [id]: { enabled } },
                        }))
                      }
                      label={`${label} enabled`}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <ChaseClocks
        paperwork={settings.paperwork}
        payment={settings.payment}
        onPaperwork={(paperwork) => setSettings((s) => ({ ...s, paperwork }))}
        onPayment={(payment) => setSettings((s) => ({ ...s, payment }))}
      />
    </div>
  )
}
