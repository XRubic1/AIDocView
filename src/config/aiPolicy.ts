/**
 * Platform-wide AI policy (Settings → System) + helpers.
 * Master switch disables AI packet/review spend but never blocks doc uploads.
 */

export type AiPolicySettings = {
  /** When false, no client AI DocSort / review spend (uploads still allowed). */
  aiEnabled: boolean
  /**
   * When false, client uploads are not turned into invoices by AI.
   * Review of invoices that already exist can still run.
   */
  autoInvoiceCreationEnabled: boolean
  /** Optional org-wide soft monthly USD cap (null = no org cap). */
  monthlySpendCapUsd: number | null
  /** Default per-carrier monthly USD cap when client has no override (null = none). */
  defaultClientMonthlyCapUsd: number | null
}

export const DEFAULT_AI_POLICY: AiPolicySettings = {
  aiEnabled: true,
  autoInvoiceCreationEnabled: true,
  monthlySpendCapUsd: null,
  defaultClientMonthlyCapUsd: null,
}

/** Mutable runtime copy. */
export const AI_POLICY: AiPolicySettings = { ...DEFAULT_AI_POLICY }

export function normalizeAiPolicy(
  value: Partial<AiPolicySettings> | null | undefined
): AiPolicySettings {
  const monthly =
    value?.monthlySpendCapUsd == null || value.monthlySpendCapUsd === ('' as unknown)
      ? null
      : Number(value.monthlySpendCapUsd)
  const clientDefault =
    value?.defaultClientMonthlyCapUsd == null ||
    value.defaultClientMonthlyCapUsd === ('' as unknown)
      ? null
      : Number(value.defaultClientMonthlyCapUsd)
  return {
    aiEnabled: value?.aiEnabled !== false,
    autoInvoiceCreationEnabled: value?.autoInvoiceCreationEnabled !== false,
    monthlySpendCapUsd:
      monthly != null && Number.isFinite(monthly) && monthly > 0 ? monthly : null,
    defaultClientMonthlyCapUsd:
      clientDefault != null && Number.isFinite(clientDefault) && clientDefault > 0
        ? clientDefault
        : null,
  }
}

/** Per-carrier AI controls on clients.ai_settings. */
export type ClientAiSettings = {
  /** When false, this carrier cannot spend AI (uploads still OK). null/undefined = inherit platform. */
  aiEnabled?: boolean | null
  /** When true, enforce monthlyCapUsd for this carrier. */
  limitEnabled?: boolean
  /** Monthly USD cap when limitEnabled. */
  monthlyCapUsd?: number | null
}

/** True when new uploads may be turned into invoices by AI. */
export function isAutoInvoiceCreationEnabled(): boolean {
  return AI_POLICY.autoInvoiceCreationEnabled !== false
}

export function normalizeClientAiSettings(
  value: ClientAiSettings | null | undefined
): ClientAiSettings {
  const monthly =
    value?.monthlyCapUsd == null ? null : Number(value.monthlyCapUsd)
  return {
    aiEnabled: value?.aiEnabled === false ? false : value?.aiEnabled === true ? true : null,
    limitEnabled: Boolean(value?.limitEnabled),
    monthlyCapUsd:
      monthly != null && Number.isFinite(monthly) && monthly > 0 ? monthly : null,
  }
}
