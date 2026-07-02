/**
 * Eval harness types — kept in scripts/eval so they are not bundled into the Vite client.
 */

export type ExpectedVerdict = 'APPROVED' | 'NEEDS_REVIEW' | 'REJECTED'

export type ExpectedReceiverSignature =
  | 'PRESENT'
  | 'MISSING'
  | 'UNCLEAR'
  | 'PASS_BY_RULE'

export interface EvalDocumentSpec {
  id: string
  name: string
  /** Relative to case directory — PDF or image upload. */
  path?: string
  /** Pre-rendered pages instead of PDF rasterization (relative dir). */
  pagesDir?: string
  /** Filenames inside pagesDir, in order (e.g. page-01.jpg). */
  pageFiles?: string[]
}

export interface ExpectedPageClassification {
  fileName: string
  pageNumber: number
  pageType: string
}

export interface EvalExpected {
  pageClassifications?: ExpectedPageClassification[]
  receiverSignature?: ExpectedReceiverSignature
  verdict: ExpectedVerdict
  flagsMustInclude?: string[]
  flagsMustNotInclude?: string[]
}

export interface EvalCaseConsistency {
  /** Maximum allowed fraction of runs with a verdict different from the mode (0–1). */
  maxVerdictFlipRate?: number
}

export interface EvalCaseDefinition {
  id: string
  description?: string
  documents: EvalDocumentSpec[]
  expected: EvalExpected
  consistency?: EvalCaseConsistency
  /** Env overrides applied before review (e.g. VITE_AI_SIGNATURE_CONSENSUS=1). */
  env?: Record<string, string>
}

export interface EvalRunSnapshot {
  verdict: ExpectedVerdict
  receiverSignature?: ExpectedReceiverSignature
  pageClassifications: ExpectedPageClassification[]
  flags: string[]
}

export interface EvalAssertionDiff {
  field: string
  expected: unknown
  actual: unknown
  message: string
}

export interface EvalCaseRunResult {
  runIndex: number
  snapshot: EvalRunSnapshot
  assertionDiffs: EvalAssertionDiff[]
  passed: boolean
  error?: string
}

export interface EvalCaseReport {
  caseId: string
  caseDir: string
  mode: 'mock' | 'live'
  runs: EvalCaseRunResult[]
  passed: boolean
  verdictFlipRate: number
  dominantVerdict: ExpectedVerdict | null
  consistencyPassed: boolean
}

export interface RecordedOpenAICall {
  label?: string
  request?: Record<string, unknown>
  response: Record<string, unknown>
}

export interface OpenAIFixtureFile {
  version: number
  recordedAt?: string
  calls: RecordedOpenAICall[]
}
