import type { SalesGradeCombineMode, SalesLeadRatingPolicy } from '../../utils/salesLeadRating'
import { useClientTheme } from '../../theme/ThemeContext'

export type SalesLeadRatingSettingsForm = {
  years_a_max: string
  years_b_max: string
  years_c_max: string
  years_d_max: string
  trucks_a_max: string
  trucks_b_max: string
  trucks_c_max: string
  trucks_d_max: string
  combine_mode: SalesGradeCombineMode
  force_f_if_not_authorized: boolean
  force_f_if_no_carrier_authority: boolean
  demote_if_insurance_bad: boolean
  demote_if_safety_bad: boolean
}

type Patch = Partial<SalesLeadRatingSettingsForm>

function NumInput({
  value,
  onChange,
  label,
  max = 500,
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
      min={0}
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

function ToggleRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint: string
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/40">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
    </label>
  )
}

/** Map saved policy → editable string form. */
export function salesLeadPolicyToForm(policy: SalesLeadRatingPolicy): SalesLeadRatingSettingsForm {
  return {
    years_a_max: String(policy.years_a_max),
    years_b_max: String(policy.years_b_max),
    years_c_max: String(policy.years_c_max),
    years_d_max: String(policy.years_d_max),
    trucks_a_max: String(policy.trucks_a_max),
    trucks_b_max: String(policy.trucks_b_max),
    trucks_c_max: String(policy.trucks_c_max),
    trucks_d_max: String(policy.trucks_d_max),
    combine_mode: policy.combine_mode,
    force_f_if_not_authorized: policy.force_f_if_not_authorized,
    force_f_if_no_carrier_authority: policy.force_f_if_no_carrier_authority,
    demote_if_insurance_bad: policy.demote_if_insurance_bad,
    demote_if_safety_bad: policy.demote_if_safety_bad,
  }
}

/** Editable chase-grade rules for cold outreach (years + fleet size). */
export default function SalesLeadRatingSettingsPanel({
  settings,
  onChange,
}: {
  settings: SalesLeadRatingSettingsForm
  onChange: (patch: Patch) => void
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Grades rate how worth chasing a carrier is for Credyx (A = chase first). Newer /
        smaller fleets score higher — they are less likely to already have an A/R team.
      </p>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Years in business (FMCSA add date)
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Max years inclusive for each letter. Example: A ≤ 5, B ≤ 10 → a 3-year carrier is A.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ['years_a_max', 'A max years', settings.years_a_max],
              ['years_b_max', 'B max years', settings.years_b_max],
              ['years_c_max', 'C max years', settings.years_c_max],
              ['years_d_max', 'D max years', settings.years_d_max],
            ] as const
          ).map(([key, label, value]) => (
            <label key={key} className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
              {label}
              <NumInput value={value} label={label} onChange={(v) => onChange({ [key]: v })} />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Fleet size (trucks / power units)
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Max trucks inclusive for each letter. Example: A ≤ 5, C ≤ 19 → a 10-truck carrier is C.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ['trucks_a_max', 'A max trucks', settings.trucks_a_max],
              ['trucks_b_max', 'B max trucks', settings.trucks_b_max],
              ['trucks_c_max', 'C max trucks', settings.trucks_c_max],
              ['trucks_d_max', 'D max trucks', settings.trucks_d_max],
            ] as const
          ).map(([key, label, value]) => (
            <label key={key} className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
              {label}
              <NumInput value={value} label={label} onChange={(v) => onChange({ [key]: v })} />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Combine years + trucks
        </h3>
        <select
          className="client-input max-w-md"
          value={settings.combine_mode}
          onChange={(e) => {
            const v = e.target.value
            onChange({
              combine_mode:
                v === 'worse' || v === 'better' || v === 'average' ? v : 'average',
            })
          }}
        >
          <option value="average">Average (recommended)</option>
          <option value="worse">Worse of the two (stricter)</option>
          <option value="better">Better of the two (looser)</option>
        </select>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Hard stops & demotions
        </h3>
        <ToggleRow
          checked={settings.force_f_if_not_authorized}
          onChange={(v) => onChange({ force_f_if_not_authorized: v })}
          label="Force F if OOS / revoked and role authority is missing"
          hint="Carriers need Common Active; brokers need Broker Active. FMCSA “Not Authorized” is ignored when the right authority is Active."
        />
        <ToggleRow
          checked={settings.force_f_if_no_carrier_authority}
          onChange={(v) => onChange({ force_f_if_no_carrier_authority: v })}
          label="Force F if missing role authority (Common / Broker)"
          hint="Carrier entities → Common must be Active. Broker-only entities → Broker must be Active. Dual C+B → Common Active required."
        />
        <ToggleRow
          checked={settings.demote_if_insurance_bad}
          onChange={(v) => onChange({ demote_if_insurance_bad: v })}
          label="Demote one letter if no current insurance coverage"
          hint="Uses current ActiveInsurances only — past cancellations do not demote."
        />
        <ToggleRow
          checked={settings.demote_if_safety_bad}
          onChange={(v) => onChange({ demote_if_safety_bad: v })}
          label="Demote one letter if safety is Conditional / Unsatisfactory"
          hint="Off by default — safety alone does not mean they have A/R."
        />
      </section>
    </div>
  )
}
