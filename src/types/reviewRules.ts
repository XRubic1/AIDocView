/** Categories for organizing review rules in the UI. */
export type ReviewRuleCategory =
  | 'amount'
  | 'bol'
  | 'invoice'
  | 'excel'
  | 'shipper'
  | 'general'

export type ReviewRuleParamType = 'number' | 'boolean'

/** Editable parameter on a built-in rule (e.g. tolerance dollars). */
export interface ReviewRuleParameterDef {
  key: string
  label: string
  type: ReviewRuleParamType
  default: number
  /** Display hint (e.g. "percent" stored as 0.5 meaning 0.5%). */
  unit?: string
  min?: number
  max?: number
  step?: number
}

/** Built-in rule catalog entry (defaults live in config, not localStorage). */
export interface BuiltInReviewRuleDefinition {
  id: string
  name: string
  category: ReviewRuleCategory
  description: string
  /** When false, programmatic checks and prompt hints for this rule are skipped. */
  defaultEnabled: boolean
  parameters?: ReviewRuleParameterDef[]
  /** Shown in Rules page — why we added this rule. */
  rationale?: string
}

/** User override for a built-in rule. */
export interface BuiltInReviewRuleOverride {
  enabled?: boolean
  params?: Record<string, number>
}

/** Dispatcher-defined rule in plain language (injected into AI prompts). */
export interface CustomReviewRule {
  id: string
  title: string
  category: ReviewRuleCategory
  /** When this rule applies (shipper, doc type, scenario). */
  condition: string
  /** What the reviewer / AI should do instead of the default check. */
  instruction: string
  enabled: boolean
  createdAt: string
  updatedAt?: string
}

export interface ReviewRulesStorage {
  builtInOverrides: Record<string, BuiltInReviewRuleOverride>
  customRules: CustomReviewRule[]
}

/** Effective built-in rule after merging defaults + overrides. */
export interface EffectiveBuiltInRule {
  definition: BuiltInReviewRuleDefinition
  enabled: boolean
  params: Record<string, number>
}
