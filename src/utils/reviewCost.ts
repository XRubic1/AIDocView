import { AI_REVIEW_CONFIG } from '../config/aiReview'

/** Per-model pricing (USD per 1M tokens) — override via env if needed. */
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'gpt-4.1': { inputPer1M: 2.0, outputPer1M: 8.0 },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4-turbo': { inputPer1M: 10.0, outputPer1M: 30.0 },
}

export interface ApiTokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface ApiUsageRecord extends ApiTokenUsage {
  model: string
  estimatedCostUsd: number
}

export interface ReviewCostSummary {
  totalUsd: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  apiCalls: number
  byModel: Array<{
    model: string
    calls: number
    costUsd: number
    tokens: number
  }>
}

function getModelPricing(model: string): { inputPer1M: number; outputPer1M: number } {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model]
  const prefix = Object.keys(MODEL_PRICING).find((key) => model.startsWith(key))
  if (prefix) return MODEL_PRICING[prefix]
  return { inputPer1M: 2.5, outputPer1M: 10.0 }
}

/** Estimate USD cost from token counts and model id. */
export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = getModelPricing(model)
  const inputCost = (promptTokens / 1_000_000) * pricing.inputPer1M
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPer1M
  return inputCost + outputCost
}

/** Parse usage block from OpenAI chat completions response. */
export function usageFromOpenAIResponse(
  payload: Record<string, unknown>,
  model: string
): ApiUsageRecord {
  const usage = payload.usage as
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | undefined

  const promptTokens = usage?.prompt_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0
  const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens

  return {
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: estimateCostUsd(model, promptTokens, completionTokens),
  }
}

/** Sum usage across all review API attempts. */
export function aggregateReviewCost(
  records: Array<ApiUsageRecord | undefined>
): ReviewCostSummary {
  const valid = records.filter((record): record is ApiUsageRecord => Boolean(record))
  const byModelMap = new Map<string, { calls: number; costUsd: number; tokens: number }>()

  let totalUsd = 0
  let promptTokens = 0
  let completionTokens = 0
  let totalTokens = 0

  valid.forEach((record) => {
    totalUsd += record.estimatedCostUsd
    promptTokens += record.promptTokens
    completionTokens += record.completionTokens
    totalTokens += record.totalTokens

    const existing = byModelMap.get(record.model) ?? { calls: 0, costUsd: 0, tokens: 0 }
    existing.calls += 1
    existing.costUsd += record.estimatedCostUsd
    existing.tokens += record.totalTokens
    byModelMap.set(record.model, existing)
  })

  return {
    totalUsd,
    totalTokens,
    promptTokens,
    completionTokens,
    apiCalls: valid.length,
    byModel: Array.from(byModelMap.entries()).map(([model, stats]) => ({
      model,
      ...stats,
    })),
  }
}

/** Peak tokens/min from API attempt timestamps (rolling 60s window). */
export function computePeakTpmFromReviewAttempts(
  attempts: Array<{ reviewedAt: string; usage?: { totalTokens: number } }>
): number | null {
  const events: Array<{ at: number; tokens: number }> = []
  for (const attempt of attempts) {
    if (!attempt.usage?.totalTokens) continue
    const at = new Date(attempt.reviewedAt).getTime()
    if (Number.isNaN(at)) continue
    events.push({ at, tokens: attempt.usage.totalTokens })
  }
  if (events.length === 0) return null

  events.sort((a, b) => a.at - b.at)
  const windowMs = 60_000
  let peak = 0
  for (let i = 0; i < events.length; i++) {
    let sum = 0
    for (let j = i; j < events.length && events[j].at - events[i].at <= windowMs; j++) {
      sum += events[j].tokens
    }
    peak = Math.max(peak, sum)
  }
  return Math.round(peak)
}

export function formatReviewCost(summary: ReviewCostSummary): string {
  const models = summary.byModel.map((row) => `${row.model}: $${row.costUsd.toFixed(4)}`).join(', ')
  return `$${summary.totalUsd.toFixed(4)} (${summary.totalTokens.toLocaleString()} tokens, ${summary.apiCalls} API call${summary.apiCalls !== 1 ? 's' : ''}${models ? ` — ${models}` : ''})`
}

/** Thrown when a document hits the configured per-PDF AI spend cap. */
export class ReviewCostBudgetExceededError extends Error {
  readonly spentUsd: number
  readonly limitUsd: number

  constructor(spentUsd: number, limitUsd: number) {
    super(REVIEW_COST_CAP_USER_MESSAGE)
    this.name = 'ReviewCostBudgetExceededError'
    this.spentUsd = spentUsd
    this.limitUsd = limitUsd
  }
}

/** User-facing copy when per-PDF AI credit is exhausted — no dollar amounts. */
export const REVIEW_COST_CAP_USER_MESSAGE =
  'AI review exceeded the allowed credit for this load. Please finish verification manually.'

export function getReviewCostCapUserMessage(): string {
  return REVIEW_COST_CAP_USER_MESSAGE
}

/** @deprecated Use getReviewCostCapUserMessage — amounts are not shown to users. */
export function formatReviewCostCapMessage(_spentUsd?: number, _limitUsd?: number): string {
  return REVIEW_COST_CAP_USER_MESSAGE
}

/** Tracks estimated spend for one PDF review; blocks further API calls when over cap. */
export class ReviewCostBudget {
  readonly limitUsd: number
  private spentUsd = 0

  constructor(limitUsd: number) {
    this.limitUsd = limitUsd
  }

  get totalSpentUsd(): number {
    return this.spentUsd
  }

  get isEnabled(): boolean {
    return this.limitUsd > 0
  }

  isAtOrOverLimit(): boolean {
    return this.isEnabled && this.spentUsd >= this.limitUsd
  }

  assertWithinBudget(): void {
    if (this.isAtOrOverLimit()) {
      throw new ReviewCostBudgetExceededError(this.spentUsd, this.limitUsd)
    }
  }

  record(usage: ApiUsageRecord): void {
    if (!this.isEnabled) return
    this.spentUsd += usage.estimatedCostUsd
    if (this.spentUsd > this.limitUsd) {
      throw new ReviewCostBudgetExceededError(this.spentUsd, this.limitUsd)
    }
  }
}

export function createDocumentReviewCostBudget(): ReviewCostBudget | undefined {
  const limit = AI_REVIEW_CONFIG.MAX_REVIEW_COST_USD
  if (limit <= 0) return undefined
  return new ReviewCostBudget(limit)
}

export function getActiveModelPricingNote(): string {
  return `${AI_REVIEW_CONFIG.PRIMARY_MODEL} / ${AI_REVIEW_CONFIG.FALLBACK_MODEL} — estimates use published per-token rates`
}
