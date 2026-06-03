import { useCallback, useMemo, useState } from 'react'
import { Plus, RotateCcw, Shield, Trash2 } from 'lucide-react'
import EngineLayout from '../components/engine/EngineLayout'
import { ff } from '../components/loadReview/factorfox/factorFoxTheme'
import { DEFAULT_SHIPPER_RULE_ENTRIES } from '../config/reviewRulesDefaults'
import { DispatcherShipperRule } from '../types/documentPipeline'
import { CustomReviewRule, ReviewRuleCategory } from '../types/reviewRules'
import {
  createCustomReviewRule,
  deleteCustomReviewRule,
  getCustomReviewRules,
  getEffectiveBuiltInRules,
  resetBuiltInRules,
  saveCustomReviewRule,
  setBuiltInRuleEnabled,
  setBuiltInRuleParam,
} from '../utils/reviewRulesStore'
import {
  deleteDispatcherRule,
  getAllDispatcherRules,
  saveDispatcherRule,
} from '../utils/shipperRulesStore'

type TabId = 'builtin' | 'shipper' | 'custom'

const CATEGORIES: { value: ReviewRuleCategory; label: string }[] = [
  { value: 'amount', label: 'Amount' },
  { value: 'bol', label: 'BOL' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'excel', label: 'Excel' },
  { value: 'shipper', label: 'Shipper' },
  { value: 'general', label: 'General' },
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

/** Rules management: built-in toggles, shipper overrides, custom dispatcher rules. */
export default function ReviewRulesPage() {
  const [tab, setTab] = useState<TabId>('builtin')
  const [builtinVersion, setBuiltinVersion] = useState(0)
  const [shipperRules, setShipperRules] = useState<DispatcherShipperRule[]>(() =>
    getAllDispatcherRules()
  )
  const [customRules, setCustomRules] = useState<CustomReviewRule[]>(() =>
    getCustomReviewRules()
  )

  const builtInRules = useMemo(
    () => getEffectiveBuiltInRules(),
    [builtinVersion]
  )

  const refreshBuiltin = () => setBuiltinVersion((v) => v + 1)
  const refreshShipper = () => setShipperRules(getAllDispatcherRules())
  const refreshCustom = () => setCustomRules(getCustomReviewRules())

  const [shipperForm, setShipperForm] = useState({
    rule_id: '',
    shipper_name: '',
    condition: '',
    field: 'receiver_signature',
    result: 'PASS',
    reason: '',
    example_note: '',
  })

  const [customForm, setCustomForm] = useState({
    title: '',
    category: 'general' as ReviewRuleCategory,
    condition: '',
    instruction: '',
  })

  const saveShipperRule = useCallback(() => {
    const id =
      shipperForm.rule_id.trim() ||
      slugify(`${shipperForm.shipper_name}-${shipperForm.field}`)
    if (!id || !shipperForm.reason.trim()) return

    const rule: DispatcherShipperRule = {
      rule_id: id,
      trigger: {
        shipper_name: shipperForm.shipper_name.trim() || null,
        condition: shipperForm.condition.trim() || 'When documents match this shipper',
      },
      override: {
        field: shipperForm.field.trim(),
        result: shipperForm.result.trim(),
        reason: shipperForm.reason.trim(),
      },
      created_by: 'dispatcher',
      example_note: shipperForm.example_note.trim() || undefined,
    }
    saveDispatcherRule(rule)
    refreshShipper()
    setShipperForm({
      rule_id: '',
      shipper_name: '',
      condition: '',
      field: 'receiver_signature',
      result: 'PASS',
      reason: '',
      example_note: '',
    })
  }, [shipperForm])

  const saveCustom = useCallback(() => {
    if (!customForm.title.trim() || !customForm.instruction.trim()) return
    createCustomReviewRule(customForm)
    refreshCustom()
    setCustomForm({
      title: '',
      category: 'general',
      condition: '',
      instruction: '',
    })
  }, [customForm])

  return (
    <EngineLayout
      headerTitle={
        <div>
          <h1
            className="text-xl font-bold uppercase tracking-wide flex items-center gap-2"
            style={{ color: ff.text, fontFamily: ff.fontDisplay }}
          >
            <Shield className="w-5 h-5" style={{ color: ff.accent }} />
            Review Rules
          </h1>
          <p className="text-xs mt-1 max-w-xl" style={{ color: ff.textMuted, fontFamily: ff.fontMono }}>
            Toggle built-in checks, shipper overrides, and custom AI rules. Changes apply on the next Run review.
          </p>
        </div>
      }
    >
        <div
          className="px-4 sm:px-6 pt-4 flex gap-2 border-b sticky top-0 z-10"
          style={{ borderColor: ff.border, backgroundColor: ff.bg2 }}
        >
          {(
            [
              ['builtin', 'Built-in'],
              ['shipper', 'Shipper'],
              ['custom', 'Your rules'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors uppercase tracking-wider"
              style={{
                fontFamily: ff.fontMono,
                color: tab === id ? ff.accent : ff.textMuted,
                backgroundColor: tab === id ? ff.accentDim : 'transparent',
                borderBottom: tab === id ? `2px solid ${ff.accent}` : '2px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-6">
          {tab === 'builtin' && (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm" style={{ color: ff.textMuted }}>
                  These used to be hard-coded in the app. Turn off any rule you do not want.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    resetBuiltInRules()
                    refreshBuiltin()
                  }}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors engine-btn-secondary"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset defaults
                </button>
              </div>

              <ul className="space-y-3">
                {builtInRules.map(({ definition, enabled, params }) => (
                  <li
                    key={definition.id}
                    className="rounded-xl border p-4 transition-shadow hover:shadow-sm"
                    style={{
                      borderColor: ff.border,
                      backgroundColor: ff.mainBg,
                      opacity: enabled ? 1 : 0.65,
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-xs font-medium uppercase px-2 py-0.5 rounded"
                            style={{ backgroundColor: ff.borderLight, color: ff.textMuted }}
                          >
                            {definition.category}
                          </span>
                          <h3 className="text-sm font-semibold" style={{ color: ff.text }}>
                            {definition.name}
                          </h3>
                        </div>
                        <p className="text-sm mt-1.5" style={{ color: ff.textMuted }}>
                          {definition.description}
                        </p>
                        {definition.rationale && (
                          <p className="text-xs mt-1 italic" style={{ color: ff.textSubtle }}>
                            Why: {definition.rationale}
                          </p>
                        )}
                        {definition.parameters && enabled && (
                          <div className="mt-3 flex flex-wrap gap-4">
                            {definition.parameters.map((param) => (
                              <label
                                key={param.key}
                                className="text-xs flex flex-col gap-1"
                                style={{ color: ff.textMuted }}
                              >
                                {param.label}
                                <input
                                  type="number"
                                  min={param.min}
                                  max={param.max}
                                  step={param.step ?? 1}
                                  value={params[param.key] ?? param.default}
                                  onChange={(e) => {
                                    setBuiltInRuleParam(
                                      definition.id,
                                      param.key,
                                      Number.parseFloat(e.target.value) || param.default
                                    )
                                    refreshBuiltin()
                                  }}
                                  className="w-24 px-2 py-1 rounded border text-sm"
                                  style={{ borderColor: ff.border, color: ff.text }}
                                />
                                {param.unit && (
                                  <span style={{ color: ff.textSubtle }}>{param.unit}</span>
                                )}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                      <label className="flex items-center gap-2 flex-shrink-0 cursor-pointer">
                        <span className="text-xs" style={{ color: ff.textMuted }}>
                          {enabled ? 'On' : 'Off'}
                        </span>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => {
                            setBuiltInRuleEnabled(definition.id, e.target.checked)
                            refreshBuiltin()
                          }}
                          className="w-4 h-4 rounded"
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === 'shipper' && (
            <>
              <section
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: ff.border, backgroundColor: ff.mainBg }}
              >
                <div
                  className="px-4 py-3 border-b text-xs font-semibold uppercase"
                  style={{ borderColor: ff.border, color: ff.textMuted, backgroundColor: ff.canvasBg }}
                >
                  Default shipper guidance
                </div>
                <ul className="divide-y" style={{ borderColor: ff.borderLight }}>
                  {DEFAULT_SHIPPER_RULE_ENTRIES.map((rule) => (
                    <li key={rule.shipper} className="px-4 py-3 text-sm">
                      <div className="font-semibold" style={{ color: ff.text }}>
                        {rule.shipper}
                      </div>
                      <div className="text-xs mt-1" style={{ color: ff.textMuted }}>
                        {rule.rule}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section
                className="rounded-xl border p-4 space-y-3"
                style={{ borderColor: ff.border, backgroundColor: ff.mainBg }}
              >
                <h3 className="text-sm font-semibold" style={{ color: ff.text }}>
                  Add shipper rule
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <input
                    placeholder="Shipper name (e.g. Walmart)"
                    value={shipperForm.shipper_name}
                    onChange={(e) =>
                      setShipperForm((f) => ({ ...f, shipper_name: e.target.value }))
                    }
                    className="px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: ff.border }}
                  />
                  <input
                    placeholder="Rule ID (optional slug)"
                    value={shipperForm.rule_id}
                    onChange={(e) => setShipperForm((f) => ({ ...f, rule_id: e.target.value }))}
                    className="px-3 py-2 rounded-lg border text-sm font-mono"
                    style={{ borderColor: ff.border }}
                  />
                  <input
                    placeholder="When does this apply?"
                    value={shipperForm.condition}
                    onChange={(e) => setShipperForm((f) => ({ ...f, condition: e.target.value }))}
                    className="sm:col-span-2 px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: ff.border }}
                  />
                  <input
                    placeholder="Field to override (e.g. receiver_signature)"
                    value={shipperForm.field}
                    onChange={(e) => setShipperForm((f) => ({ ...f, field: e.target.value }))}
                    className="px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: ff.border }}
                  />
                  <input
                    placeholder="New result (e.g. PASS)"
                    value={shipperForm.result}
                    onChange={(e) => setShipperForm((f) => ({ ...f, result: e.target.value }))}
                    className="px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: ff.border }}
                  />
                  <textarea
                    placeholder="Reason — what should the AI do instead?"
                    value={shipperForm.reason}
                    onChange={(e) => setShipperForm((f) => ({ ...f, reason: e.target.value }))}
                    rows={2}
                    className="sm:col-span-2 px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: ff.border }}
                  />
                </div>
                <button
                  type="button"
                  onClick={saveShipperRule}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg engine-btn-primary"
                >
                  <Plus className="w-4 h-4" />
                  Save shipper rule
                </button>
              </section>

              <section
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: ff.border, backgroundColor: ff.mainBg }}
              >
                <div
                  className="px-4 py-3 border-b text-xs font-semibold uppercase"
                  style={{ borderColor: ff.border, color: ff.textMuted, backgroundColor: ff.canvasBg }}
                >
                  Your shipper rules ({shipperRules.length})
                </div>
                {shipperRules.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-center" style={{ color: ff.textMuted }}>
                    No shipper rules yet. Add one above (e.g. stamp replaces signature).
                  </p>
                ) : (
                  <ul className="divide-y" style={{ borderColor: ff.borderLight }}>
                    {shipperRules.map((rule) => (
                      <li
                        key={rule.rule_id}
                        className="px-4 py-3 text-sm flex justify-between gap-3"
                      >
                        <div>
                          <div className="font-semibold font-mono text-xs" style={{ color: ff.text }}>
                            {rule.rule_id}
                          </div>
                          <div className="mt-1" style={{ color: ff.textMuted }}>
                            {rule.trigger.shipper_name ?? 'Any'} — {rule.override.reason}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Delete rule"
                          onClick={() => {
                            deleteDispatcherRule(rule.rule_id)
                            refreshShipper()
                          }}
                          className="p-2 rounded-lg engine-hover-surface transition-colors"
                          style={{ color: ff.red }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          {tab === 'custom' && (
            <>
              <section
                className="rounded-xl border p-4 space-y-3"
                style={{ borderColor: ff.border, backgroundColor: ff.mainBg }}
              >
                <h3 className="text-sm font-semibold" style={{ color: ff.text }}>
                  Add your own rule
                </h3>
                <p className="text-xs" style={{ color: ff.textMuted }}>
                  Plain-language rules are sent to the AI during rate con, invoice, and BOL review.
                  Built-in rules also run in code (amount tolerance, signatures, etc.). Custom rules
                  do not change programmatic load # or amount cross-checks — use built-in rules for those.
                </p>
                <input
                  placeholder="Short title"
                  value={customForm.title}
                  onChange={(e) => setCustomForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: ff.border }}
                />
                <select
                  value={customForm.category}
                  onChange={(e) =>
                    setCustomForm((f) => ({
                      ...f,
                      category: e.target.value as ReviewRuleCategory,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: ff.border }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="When does this apply? (e.g. Broker XYZ, lumper on invoice)"
                  value={customForm.condition}
                  onChange={(e) => setCustomForm((f) => ({ ...f, condition: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: ff.border }}
                />
                <textarea
                  placeholder="What should happen? (e.g. Accept stamped BOL without receiver date)"
                  value={customForm.instruction}
                  onChange={(e) =>
                    setCustomForm((f) => ({ ...f, instruction: e.target.value }))
                  }
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: ff.border }}
                />
                <button
                  type="button"
                  onClick={saveCustom}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg engine-btn-primary"
                >
                  <Plus className="w-4 h-4" />
                  Add rule
                </button>
              </section>

              <ul className="space-y-2">
                {customRules.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: ff.textMuted }}>
                    No custom rules yet.
                  </p>
                ) : (
                  customRules.map((rule) => (
                    <li
                      key={rule.id}
                      className="rounded-xl border p-4 flex justify-between gap-3"
                      style={{
                        borderColor: ff.border,
                        backgroundColor: ff.mainBg,
                        opacity: rule.enabled ? 1 : 0.6,
                      }}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase font-medium" style={{ color: ff.textMuted }}>
                            {rule.category}
                          </span>
                          <h3 className="text-sm font-semibold" style={{ color: ff.text }}>
                            {rule.title}
                          </h3>
                        </div>
                        <p className="text-xs mt-1" style={{ color: ff.textMuted }}>
                          When: {rule.condition || '—'}
                        </p>
                        <p className="text-sm mt-1" style={{ color: ff.text }}>
                          {rule.instruction}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(e) => {
                              saveCustomReviewRule({
                                ...rule,
                                enabled: e.target.checked,
                                updatedAt: new Date().toISOString(),
                              })
                              refreshCustom()
                            }}
                          />
                          On
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            deleteCustomReviewRule(rule.id)
                            refreshCustom()
                          }}
                          className="p-2 rounded-lg engine-hover-surface"
                          style={{ color: ff.red }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </div>
    </EngineLayout>
  )
}
