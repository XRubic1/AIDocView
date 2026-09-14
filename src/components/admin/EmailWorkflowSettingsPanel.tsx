/**
 * Settings → Email → Workflow: compact rule toggles and chase clocks.
 */
import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
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

const RULE_GROUPS: { id: string; title: string; hint: string; ids: EmailLifecycleRule['id'][] }[] = [
  {
    id: 'process',
    title: 'After Process',
    hint: 'Already sent from Batches → Process. Toggle only if you need to pause a send.',
    ids: ['batch_processed_carrier', 'batch_processed_broker_ppw'],
  },
  {
    id: 'paperwork',
    title: 'Paperwork status',
    hint: 'After PPW is delivered. Wait the broker’s paperwork-confirm days (default 7). Payment emails wait until paperwork is good and Net terms.',
    ids: ['broker_paperwork_status_inquiry', 'broker_paperwork_status_followup'],
  },
  {
    id: 'payment',
    title: 'Payment status',
    hint: 'Starts after paperwork is broker-confirmed, then waits until Net terms (due date).',
    ids: ['broker_payment_status_inquiry', 'broker_payment_status_followup'],
  },
  {
    id: 'staff',
    title: 'Staff & carrier notices',
    hint: 'Sent from Inbox confirm, not on a timer.',
    ids: ['broker_claim_scope', 'carrier_claim_or_hold_notice', 'carrier_dispute_opened'],
  },
]

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
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
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
}: {
  value: number
  onChange: (n: number) => void
  disabled?: boolean
}) {
  const c = useClientTheme()
  return (
    <input
      type="number"
      min={0}
      max={90}
      disabled={disabled}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value)
        onChange(Number.isFinite(n) ? n : 0)
      }}
      className="client-input w-[4.5rem] text-center tabular-nums text-sm py-1"
      style={{
        color: c.primary,
        backgroundColor: disabled ? c.stat.slate : c.card,
        height: 32,
        minHeight: 32,
      }}
    />
  )
}

function ClockTable({
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
  const cell = 'px-3 py-2.5 align-middle'
  const head = 'text-[10px] font-semibold uppercase tracking-wide'

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: c.border }}>
      <table className="w-full min-w-[520px] text-sm border-collapse">
        <thead>
          <tr style={{ backgroundColor: c.stat.slate }}>
            <th className={`${cell} ${head} text-left`} style={{ color: c.secondary }}>
              Clock
            </th>
            <th className={`${cell} ${head} text-left`} style={{ color: c.secondary }}>
              Paperwork
            </th>
            <th className={`${cell} ${head} text-left`} style={{ color: c.secondary }}>
              Payment
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t" style={{ borderColor: c.border }}>
            <td className={cell}>
              <p className="font-medium" style={{ color: c.primary }}>
                First ask
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: c.mutedLight }}>
                Days after PPW / after paperwork good
              </p>
            </td>
            <td className={cell}>
              <span className="inline-flex items-center gap-1.5">
                <DaysField
                  value={paperwork.firstAskDays}
                  onChange={(firstAskDays) => onPaperwork({ ...paperwork, firstAskDays })}
                />
                <span className="text-xs" style={{ color: c.secondary }}>
                  days
                </span>
              </span>
            </td>
            <td className={cell}>
              <span className="inline-flex items-center gap-1.5">
                <DaysField
                  value={payment.firstAskDays}
                  onChange={(firstAskDays) => onPayment({ ...payment, firstAskDays })}
                />
                <span className="text-xs" style={{ color: c.secondary }}>
                  days
                </span>
              </span>
            </td>
          </tr>
          <tr className="border-t" style={{ borderColor: c.border }}>
            <td className={cell}>
              <p className="font-medium" style={{ color: c.primary }}>
                Action needed after first try
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: c.mutedLight }}>
                Staff item if no reply. 0 = same day as first ask.
              </p>
            </td>
            <td className={cell}>
              <div className="flex items-center gap-2">
                <Toggle
                  checked={paperwork.actionNeededAfterFirst}
                  onChange={(actionNeededAfterFirst) =>
                    onPaperwork({ ...paperwork, actionNeededAfterFirst })
                  }
                  label="Paperwork action needed after first try"
                />
                <DaysField
                  value={paperwork.actionNeededAfterFirstDays}
                  disabled={!paperwork.actionNeededAfterFirst}
                  onChange={(actionNeededAfterFirstDays) =>
                    onPaperwork({ ...paperwork, actionNeededAfterFirstDays })
                  }
                />
              </div>
            </td>
            <td className={cell}>
              <div className="flex items-center gap-2">
                <Toggle
                  checked={payment.actionNeededAfterFirst}
                  onChange={(actionNeededAfterFirst) =>
                    onPayment({ ...payment, actionNeededAfterFirst })
                  }
                  label="Payment action needed after first try"
                />
                <DaysField
                  value={payment.actionNeededAfterFirstDays}
                  disabled={!payment.actionNeededAfterFirst}
                  onChange={(actionNeededAfterFirstDays) =>
                    onPayment({ ...payment, actionNeededAfterFirstDays })
                  }
                />
              </div>
            </td>
          </tr>
          <tr className="border-t" style={{ borderColor: c.border }}>
            <td className={cell}>
              <p className="font-medium" style={{ color: c.primary }}>
                Second follow-up
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: c.mutedLight }}>
                Days after first ask. 0 = skip second send.
              </p>
            </td>
            <td className={cell}>
              <span className="inline-flex items-center gap-1.5">
                <DaysField
                  value={paperwork.secondFollowupDays}
                  onChange={(secondFollowupDays) =>
                    onPaperwork({ ...paperwork, secondFollowupDays })
                  }
                />
                <span className="text-xs" style={{ color: c.secondary }}>
                  days
                </span>
              </span>
            </td>
            <td className={cell}>
              <span className="inline-flex items-center gap-1.5">
                <DaysField
                  value={payment.secondFollowupDays}
                  onChange={(secondFollowupDays) => onPayment({ ...payment, secondFollowupDays })}
                />
                <span className="text-xs" style={{ color: c.secondary }}>
                  days
                </span>
              </span>
            </td>
          </tr>
          <tr className="border-t" style={{ borderColor: c.border }}>
            <td className={cell}>
              <p className="font-medium" style={{ color: c.primary }}>
                Needs attention
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: c.mutedLight }}>
                Silent days after the second follow-up
              </p>
            </td>
            <td className={cell}>
              <span className="inline-flex items-center gap-1.5">
                <DaysField
                  value={paperwork.needsAttentionAfterSecondDays}
                  onChange={(needsAttentionAfterSecondDays) =>
                    onPaperwork({ ...paperwork, needsAttentionAfterSecondDays })
                  }
                />
                <span className="text-xs" style={{ color: c.secondary }}>
                  days
                </span>
              </span>
            </td>
            <td className={cell}>
              <span className="inline-flex items-center gap-1.5">
                <DaysField
                  value={payment.needsAttentionAfterSecondDays}
                  onChange={(needsAttentionAfterSecondDays) =>
                    onPayment({ ...payment, needsAttentionAfterSecondDays })
                  }
                />
                <span className="text-xs" style={{ color: c.secondary }}>
                  days
                </span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function EmailWorkflowSettingsPanel() {
  const c = useClientTheme()
  const { showToast } = useToast()
  const [settings, setSettings] = useState<EmailLifecycleSettings>(DEFAULT_EMAIL_LIFECYCLE_SETTINGS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void loadEmailLifecycleSettings().then(setSettings)
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const next = await saveEmailLifecycleSettings(settings)
      setSettings(next)
      showToast('Email workflow saved', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const ruleById = new Map(EMAIL_LIFECYCLE_RULES.map((r) => [r.id, r]))

  return (
    <div className="email-workflow-settings flex flex-col gap-6 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight" style={{ color: c.primary }}>
            When to send
          </h3>
          <p className="text-sm mt-1 max-w-xl leading-relaxed" style={{ color: c.secondary }}>
            Platform defaults. Brokers can override clocks and email vs phone on the broker
            record.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="dashboard-btn-primary dashboard-btn-compact inline-flex items-center gap-1.5 shrink-0"
        >
          {saving ? <Spinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          Save workflow
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {RULE_GROUPS.map((group) => (
          <section
            key={group.id}
            className="rounded-xl border p-3 sm:p-4 transition-shadow duration-200 hover:shadow-sm"
            style={{ borderColor: c.border, backgroundColor: c.card }}
          >
            <h4 className="text-sm font-semibold" style={{ color: c.primary }}>
              {group.title}
            </h4>
            <p className="text-[11px] mt-0.5 mb-3 leading-snug" style={{ color: c.mutedLight }}>
              {group.hint}
            </p>
            <ul className="space-y-2.5">
              {group.ids.map((id) => {
                const rule = ruleById.get(id)
                if (!rule) return null
                const on = settings.rules[id]?.enabled !== false
                return (
                  <li
                    key={id}
                    className="flex items-start justify-between gap-3 rounded-lg px-2.5 py-2"
                    style={{ backgroundColor: c.stat.slate }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug" style={{ color: c.primary }}>
                        {rule.name}
                      </p>
                      <p className="text-[11px] mt-0.5 leading-snug" style={{ color: c.secondary }}>
                        {rule.description}
                      </p>
                    </div>
                    <Toggle
                      checked={on}
                      onChange={(enabled) =>
                        setSettings((s) => ({
                          ...s,
                          rules: { ...s.rules, [id]: { enabled } },
                        }))
                      }
                      label={`${rule.name} enabled`}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <section>
        <h4 className="text-sm font-semibold mb-1" style={{ color: c.primary }}>
          Chase clocks
        </h4>
        <p className="text-xs mb-3" style={{ color: c.secondary }}>
          Paperwork track starts when PPW is delivered. Payment track starts when paperwork is
          good.
        </p>
        <ClockTable
          paperwork={settings.paperwork}
          payment={settings.payment}
          onPaperwork={(paperwork) => setSettings((s) => ({ ...s, paperwork }))}
          onPayment={(payment) => setSettings((s) => ({ ...s, payment }))}
        />
      </section>
    </div>
  )
}
