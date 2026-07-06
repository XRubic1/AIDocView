import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, RotateCcw, Shield } from 'lucide-react'
import {
  BOL_AI_VISION_CHECKS,
  BOL_VERDICT_GATES,
  bolCheckOutcomeLabel,
  type BolCheckOutcome,
} from '../../../config/bolVerificationChecklist'
import { BUILT_IN_REVIEW_RULES } from '../../../config/reviewRulesDefaults'
import {
  getEffectiveBuiltInRules,
  resetBuiltInRules,
  setBuiltInRuleEnabled,
} from '../../../utils/reviewRulesStore'
import { ff } from './factorFoxTheme'

function outcomeStyle(outcome: BolCheckOutcome): { color: string; backgroundColor: string } {
  if (outcome === 'reject') {
    return { color: ff.red, backgroundColor: ff.redLight }
  }
  if (outcome === 'review') {
    return { color: ff.amber, backgroundColor: ff.amberLight }
  }
  return { color: ff.textMuted, backgroundColor: ff.bg3 }
}

function CheckList({
  items,
  showOutcome = true,
}: {
  items: typeof BOL_AI_VISION_CHECKS
  showOutcome?: boolean
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const badge = outcomeStyle(item.outcome)
        return (
          <li
            key={item.id}
            className="p-3 border text-xs"
            style={{ borderColor: ff.border, backgroundColor: ff.bg3 }}
          >
            <div className="flex flex-wrap items-center gap-2 justify-between gap-y-1">
              <span className="font-semibold" style={{ color: ff.text }}>
                {item.name}
              </span>
              {showOutcome ? (
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5"
                  style={{ ...badge, fontFamily: ff.fontMono }}
                >
                  {bolCheckOutcomeLabel(item.outcome)}
                </span>
              ) : null}
            </div>
            <p className="mt-1 leading-relaxed" style={{ color: ff.textMuted }}>
              {item.description}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

/** Settings section — BOL pipeline checks and toggleable relaxation filters. */
export default function BolVerificationFiltersSection() {
  const [rulesVersion, setRulesVersion] = useState(0)

  const bolRelaxationRules = useMemo(() => {
    const effective = getEffectiveBuiltInRules()
    const bolIds = new Set(BUILT_IN_REVIEW_RULES.filter((r) => r.category === 'bol').map((r) => r.id))
    return effective.filter((rule) => bolIds.has(rule.definition.id))
  }, [rulesVersion])

  const refreshRules = () => setRulesVersion((v) => v + 1)

  return (
    <section
      className="border p-5 sm:p-6 space-y-6"
      style={{
        borderColor: ff.borderLight,
        backgroundColor: ff.bg2,
        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 p-2 border"
          style={{ borderColor: ff.greenBorder, backgroundColor: ff.greenLight }}
        >
          <ClipboardCheck className="w-5 h-5" style={{ color: ff.green }} />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className="text-sm font-bold uppercase tracking-wider"
            style={{ color: ff.text, fontFamily: ff.fontDisplay }}
          >
            BOL verification filters
          </h2>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: ff.textMuted }}>
            Every delivery-proof page runs through these checks. Loads are often{' '}
            <strong style={{ color: ff.red }}>rejected</strong> when the AI returns MISSING or FAIL
            (not just UNCLEAR). Turn on relaxation filters below if your broker allows stamped BOLs,
            ZIP-only differences, or signatures on the last page only.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <h3
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: ff.textMuted, fontFamily: ff.fontMono }}
        >
          AI vision audit (always on)
        </h3>
        <CheckList items={BOL_AI_VISION_CHECKS} />
      </div>

      <div className="space-y-3">
        <h3
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: ff.textMuted, fontFamily: ff.fontMono }}
        >
          Verdict gates (always on)
        </h3>
        <CheckList items={BOL_VERDICT_GATES} />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: ff.textMuted, fontFamily: ff.fontMono }}
          >
            Relaxation filters (toggle)
          </h3>
          <button
            type="button"
            onClick={() => {
              resetBuiltInRules()
              refreshRules()
            }}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider border transition-opacity hover:opacity-90"
            style={{
              fontFamily: ff.fontMono,
              color: ff.textMuted,
              borderColor: ff.borderLight,
            }}
          >
            <RotateCcw className="w-3 h-3" />
            Reset BOL filters
          </button>
        </div>
        <p className="text-xs" style={{ color: ff.textSubtle }}>
          These soften strict checks so good BOLs are not rejected for broker-accepted exceptions.
          Changes apply on the next Run review.
        </p>
        <ul className="space-y-2">
          {bolRelaxationRules.map(({ definition, enabled }) => (
            <li
              key={definition.id}
              className="p-3 border flex items-start justify-between gap-3"
              style={{
                borderColor: ff.border,
                backgroundColor: ff.bg3,
                opacity: enabled ? 1 : 0.7,
              }}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold" style={{ color: ff.text }}>
                  {definition.name}
                </p>
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: ff.textMuted }}>
                  {definition.description}
                </p>
                {definition.rationale ? (
                  <p className="text-[10px] mt-1 italic" style={{ color: ff.textSubtle }}>
                    {definition.rationale}
                  </p>
                ) : null}
              </div>
              <label className="flex items-center gap-2 flex-shrink-0 cursor-pointer">
                <span className="text-[10px] uppercase" style={{ color: ff.textMuted, fontFamily: ff.fontMono }}>
                  {enabled ? 'On' : 'Off'}
                </span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => {
                    setBuiltInRuleEnabled(definition.id, event.target.checked)
                    refreshRules()
                  }}
                  className="w-4 h-4"
                />
              </label>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] leading-relaxed border-t pt-3" style={{ borderColor: ff.border, color: ff.textSubtle, fontFamily: ff.fontMono }}>
        <Shield className="w-3 h-3 inline-block mr-1 -mt-0.5" style={{ color: ff.accent }} />
        Shipper-specific and custom AI rules live on the{' '}
        <Link to="/engine/rules" className="underline underline-offset-2" style={{ color: ff.accent }}>
          Rules
        </Link>{' '}
        tab (e.g. Walmart stamp = receiver signature).
      </p>
    </section>
  )
}
