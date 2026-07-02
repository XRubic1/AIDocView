type EnvSource = Record<string, string | undefined>

function viteEnv(): EnvSource {
  try {
    return (import.meta as ImportMeta & { env?: EnvSource }).env ?? {}
  } catch {
    return {}
  }
}

function nodeEnv(): EnvSource {
  if (typeof process === 'undefined' || !process.env) return {}
  return process.env as EnvSource
}

/** Read config from Vite (`import.meta.env`) or Node (`process.env`) for eval/CI. */
export function getRuntimeEnvString(key: string): string | undefined {
  const override = nodeEnv()[key]?.trim()
  if (override) return override
  return viteEnv()[key]?.trim() || undefined
}

export function getRuntimeEnvBool(key: string, defaultValue: boolean): boolean {
  const raw = getRuntimeEnvString(key)?.toLowerCase()
  if (!raw) return defaultValue
  return raw === 'true' || raw === '1' || raw === 'yes'
}

export function getRuntimeEnvInt(key: string, fallback: number): number {
  const raw = getRuntimeEnvString(key)
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getRuntimeEnvFloat(key: string, fallback: number): number {
  const raw = getRuntimeEnvString(key)
  if (!raw) return fallback
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}
