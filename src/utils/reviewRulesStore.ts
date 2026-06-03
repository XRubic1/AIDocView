import { BUILT_IN_REVIEW_RULES } from '../config/reviewRulesDefaults'
import {
  BuiltInReviewRuleOverride,
  CustomReviewRule,
  EffectiveBuiltInRule,
  ReviewRulesStorage,
} from '../types/reviewRules'

const STORAGE_KEY = 'credyx-review-rules-v1'

function defaultParams(def: (typeof BUILT_IN_REVIEW_RULES)[0]): Record<string, number> {
  const params: Record<string, number> = {}
  def.parameters?.forEach((p) => {
    params[p.key] = p.default
  })
  return params
}

function readStorage(): ReviewRulesStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { builtInOverrides: {}, customRules: [] }
    const parsed = JSON.parse(raw) as ReviewRulesStorage
    return {
      builtInOverrides: parsed.builtInOverrides ?? {},
      customRules: Array.isArray(parsed.customRules) ? parsed.customRules : [],
    }
  } catch {
    return { builtInOverrides: {}, customRules: [] }
  }
}

function writeStorage(data: ReviewRulesStorage): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

/** All built-in rules with effective enabled state and parameters. */
export function getEffectiveBuiltInRules(): EffectiveBuiltInRule[] {
  const { builtInOverrides } = readStorage()
  return BUILT_IN_REVIEW_RULES.map((definition) => {
    const override = builtInOverrides[definition.id]
    const baseParams = defaultParams(definition)
    return {
      definition,
      enabled: override?.enabled ?? definition.defaultEnabled,
      params: { ...baseParams, ...override?.params },
    }
  })
}

export function isBuiltInRuleEnabled(ruleId: string): boolean {
  const rule = getEffectiveBuiltInRules().find((r) => r.definition.id === ruleId)
  return rule?.enabled ?? true
}

export function getBuiltInRuleParams(ruleId: string): Record<string, number> {
  const rule = getEffectiveBuiltInRules().find((r) => r.definition.id === ruleId)
  return rule?.params ?? {}
}

export function setBuiltInRuleEnabled(ruleId: string, enabled: boolean): void {
  const storage = readStorage()
  storage.builtInOverrides[ruleId] = {
    ...storage.builtInOverrides[ruleId],
    enabled,
  }
  writeStorage(storage)
}

export function setBuiltInRuleParam(ruleId: string, key: string, value: number): void {
  const storage = readStorage()
  const prev = storage.builtInOverrides[ruleId] ?? {}
  storage.builtInOverrides[ruleId] = {
    ...prev,
    params: { ...prev.params, [key]: value },
  }
  writeStorage(storage)
}

export function resetBuiltInRules(): void {
  const storage = readStorage()
  storage.builtInOverrides = {}
  writeStorage(storage)
}

export function getCustomReviewRules(): CustomReviewRule[] {
  return readStorage().customRules
}

export function saveCustomReviewRule(rule: CustomReviewRule): void {
  const storage = readStorage()
  const index = storage.customRules.findIndex((r) => r.id === rule.id)
  if (index >= 0) storage.customRules[index] = rule
  else storage.customRules.unshift(rule)
  writeStorage(storage)
}

export function deleteCustomReviewRule(id: string): void {
  const storage = readStorage()
  storage.customRules = storage.customRules.filter((r) => r.id !== id)
  writeStorage(storage)
}

export function createCustomReviewRule(input: {
  title: string
  category: CustomReviewRule['category']
  condition: string
  instruction: string
}): CustomReviewRule {
  const now = new Date().toISOString()
  const rule: CustomReviewRule = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: input.title.trim(),
    category: input.category,
    condition: input.condition.trim(),
    instruction: input.instruction.trim(),
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }
  saveCustomReviewRule(rule)
  return rule
}

/** Custom + shipper-specific rules only — built-in rules are enforced in code, not repeated in prompts. */
export function getBolAiRulesForPrompt(): string[] {
  const lines: string[] = []
  getCustomReviewRules()
    .filter((r) => r.enabled)
    .forEach((r) => {
      lines.push(`${r.title}: when ${r.condition} → ${r.instruction}`)
    })
  return lines
}

/** @deprecated Built-in rules are code-enforced; use getBolAiRulesForPrompt for vision prompts. */
export function getReviewRulesForPrompt(): string[] {
  const lines: string[] = []

  getEffectiveBuiltInRules()
    .filter((r) => r.enabled)
    .forEach((r) => {
      let line = `[${r.definition.category}] ${r.definition.name}: ${r.definition.description}`
      if (r.definition.id === 'amount_freight_tolerance') {
        const minUsd = r.params.minUsd ?? 15
        const pct = r.params.percent ?? 0.5
        line += ` (tolerance: $${minUsd} or ${pct}% of larger amount, whichever is greater)`
      }
      lines.push(line)
    })

  getCustomReviewRules()
    .filter((r) => r.enabled)
    .forEach((r) => {
      lines.push(
        `[custom · ${r.category}] ${r.title} — When: ${r.condition} — Do: ${r.instruction}`
      )
    })

  return lines
}

/** Append active review rules to an AI extraction/validation prompt. */
export function appendReviewRulesToPrompt(basePrompt: string): string {
  const rules = getReviewRulesForPrompt()
  if (!rules.length) return basePrompt
  return `${basePrompt}\n\nActive review rules (follow when applicable):\n${rules.map((r) => `- ${r}`).join('\n')}\n`
}

/** Labels for audit summary “Rules applied”. */
export function getActiveReviewRuleLabels(): string[] {
  const builtIn = getEffectiveBuiltInRules()
    .filter((r) => r.enabled)
    .map((r) => r.definition.name)
  const custom = getCustomReviewRules()
    .filter((r) => r.enabled)
    .map((r) => r.title)
  return [...builtIn, ...custom]
}
