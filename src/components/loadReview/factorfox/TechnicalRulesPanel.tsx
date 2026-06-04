import { useMemo, useState } from 'react'
import {
  createCustomReviewRule,
  getCustomReviewRules,
  getEffectiveBuiltInRules,
  saveCustomReviewRule,
  setBuiltInRuleEnabled,
} from '../../../utils/reviewRulesStore'
import { ReviewRuleCategory } from '../../../types/reviewRules'

interface TechnicalRulesPanelProps {
  /** Bump to reload rules from localStorage after parent saves. */
  refreshKey?: number
  onRulesChanged?: () => void
}

const CATEGORIES: ReviewRuleCategory[] = ['general', 'invoice', 'bol', 'excel', 'amount', 'shipper']

/** Inline rules list + quick add — changes apply on next recompute / BOL audit. */
export default function TechnicalRulesPanel({
  refreshKey = 0,
  onRulesChanged,
}: TechnicalRulesPanelProps) {
  const [title, setTitle] = useState('')
  const [condition, setCondition] = useState('')
  const [instruction, setInstruction] = useState('')
  const [category, setCategory] = useState<ReviewRuleCategory>('general')
  const [localRefresh, setLocalRefresh] = useState(0)

  const builtIn = useMemo(
    () => getEffectiveBuiltInRules(),
    [refreshKey, localRefresh]
  )
  const custom = useMemo(() => getCustomReviewRules(), [refreshKey, localRefresh])

  const bump = () => {
    setLocalRefresh((n) => n + 1)
    onRulesChanged?.()
  }

  const handleAddRule = () => {
    if (!title.trim() || !condition.trim() || !instruction.trim()) return
    createCustomReviewRule({ title, condition, instruction, category })
    setTitle('')
    setCondition('')
    setInstruction('')
    bump()
  }

  return (
    <div className="engine-tech-rules">
      <div className="engine-tech-rules-head">Rules active</div>
      <ul className="engine-tech-rules-list">
        {builtIn.map((rule) => (
          <li key={rule.definition.id} className="engine-tech-rules-item">
            <label className="engine-tech-rules-check">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => {
                  setBuiltInRuleEnabled(rule.definition.id, e.target.checked)
                  bump()
                }}
              />
              <span>{rule.definition.name}</span>
            </label>
            <span className="engine-tech-rules-tag">built-in</span>
          </li>
        ))}
        {custom.map((rule) => (
          <li key={rule.id} className="engine-tech-rules-item">
            <label className="engine-tech-rules-check">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => {
                  saveCustomReviewRule({ ...rule, enabled: e.target.checked })
                  bump()
                }}
              />
              <span>{rule.title}</span>
            </label>
            <span className="engine-tech-rules-tag">{rule.category}</span>
          </li>
        ))}
      </ul>

      <div className="engine-tech-rules-add">
        <div className="engine-tech-rules-add-head">Add rule (live in BOL / review prompts)</div>
        <input
          type="text"
          placeholder="Rule title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="engine-tech-rules-input"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ReviewRuleCategory)}
          className="engine-tech-rules-input"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="When (e.g. page 1 is carrier invoice)"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          className="engine-tech-rules-input"
        />
        <input
          type="text"
          placeholder="Do (e.g. classify as invoice, not rate con)"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          className="engine-tech-rules-input"
        />
        <button type="button" className="engine-tech-rules-btn" onClick={handleAddRule}>
          Add rule
        </button>
      </div>
    </div>
  )
}
