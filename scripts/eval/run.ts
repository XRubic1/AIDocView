#!/usr/bin/env node
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compareSnapshotToExpected,
  computeVerdictFlipRate,
  dominantVerdict,
  extractEvalSnapshot,
} from './compareResult.js'
import { loadEvalCase, resolveCaseDocuments } from './loadCase.js'
import { installEvalRuntime, resetActiveMockOpenAI, teardownEvalRuntime } from './runtime/installEvalRuntime.js'
import type { EvalCaseReport, EvalCaseRunResult } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CASES_ROOT = path.join(__dirname, 'cases')

interface CliOptions {
  mode: 'mock' | 'live'
  runs: number
  caseFilter?: string
  record: boolean
}

function parseArgs(argv: string[]): CliOptions {
  let mode: CliOptions['mode'] = 'mock'
  let runs = 3
  let caseFilter: string | undefined
  let record = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--mode' && argv[index + 1]) {
      mode = argv[index + 1] as CliOptions['mode']
      index += 1
    } else if (arg === '--runs' && argv[index + 1]) {
      runs = Math.max(1, Number.parseInt(argv[index + 1], 10))
      index += 1
    } else if (arg === '--case' && argv[index + 1]) {
      caseFilter = argv[index + 1]
      index += 1
    } else if (arg === '--record') {
      record = true
      mode = 'live'
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  if (record && mode !== 'live') {
    mode = 'live'
  }

  return { mode, runs, caseFilter, record }
}

function printHelp(): void {
  console.log(`AIDocView eval runner

Usage:
  npm run eval:mock [-- --case bol-missing-receiver-mock]
  npm run eval:live [-- --case my-load --runs 3]
  npm run eval:record -- --case my-load

Options:
  --mode mock|live   Fixture replay (default mock) or live OpenAI
  --runs N           Repeat each case N times (default 3) — reports verdict flip-rate
  --case NAME        Run a single case directory name under scripts/eval/cases
  --record           Live mode that writes fixtures/openai-calls.json for CI mock
`)
}

async function listCaseDirs(filter?: string): Promise<string[]> {
  const entries = await readdir(CASES_ROOT, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(CASES_ROOT, entry.name))
    .filter((dir) => !filter || path.basename(dir) === filter)
}

async function runCase(
  caseDir: string,
  options: CliOptions
): Promise<EvalCaseReport> {
  const definition = await loadEvalCase(caseDir)
  const documentInputs = resolveCaseDocuments(caseDir, definition).map((spec) => ({ spec }))

  await installEvalRuntime({
    mode: options.record ? 'live' : options.mode,
    caseDir,
    caseDefinition: definition,
    documentInputs,
    record: options.record,
  })

  const { loadCaseDocuments } = await import('./runtime/nodeRasterizer.js')
  const loadedDocs = await loadCaseDocuments(documentInputs)

  const { reviewUploadedDocuments } = await import(
    '../../src/services/documentReviewService.js'
  )

  const runResults: EvalCaseRunResult[] = []

  try {
    for (let runIndex = 0; runIndex < options.runs; runIndex += 1) {
      if (options.mode === 'mock' && !options.record) {
        resetActiveMockOpenAI()
      }
      try {
        const batch = await reviewUploadedDocuments(
          loadedDocs.map((doc) => ({ id: doc.id, name: doc.name, file: doc.file }))
        )
        const snapshot = extractEvalSnapshot(batch)
        const assertionDiffs = compareSnapshotToExpected(snapshot, definition.expected)
        runResults.push({
          runIndex,
          snapshot,
          assertionDiffs,
          passed: assertionDiffs.length === 0,
        })
      } catch (error) {
        runResults.push({
          runIndex,
          snapshot: {
            verdict: 'NEEDS_REVIEW',
            pageClassifications: [],
            flags: [],
          },
          assertionDiffs: [
            {
              field: 'error',
              expected: 'successful review',
              actual: error instanceof Error ? error.message : String(error),
              message: error instanceof Error ? error.message : String(error),
            },
          ],
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  } finally {
    teardownEvalRuntime()
  }

  const verdicts = runResults.map((run) => run.snapshot.verdict)
  const flipRate = computeVerdictFlipRate(verdicts)
  const maxFlip = definition.consistency?.maxVerdictFlipRate ?? 0
  const consistencyPassed = flipRate <= maxFlip
  const passed =
    runResults.every((run) => run.passed) && consistencyPassed && !options.record

  return {
    caseId: definition.id,
    caseDir,
    mode: options.record ? 'live' : options.mode,
    runs: runResults,
    passed,
    verdictFlipRate: flipRate,
    dominantVerdict: dominantVerdict(verdicts) as EvalCaseReport['dominantVerdict'],
    consistencyPassed,
  }
}

function printCaseReport(report: EvalCaseReport): void {
  const status = report.passed ? 'PASS' : 'FAIL'
  console.log(`\n[${status}] ${report.caseId} (${report.mode})`)
  console.log(
    `  verdict flip-rate: ${(report.verdictFlipRate * 100).toFixed(0)}% (dominant: ${report.dominantVerdict ?? 'n/a'})`
  )

  report.runs.forEach((run) => {
    const runStatus = run.passed ? 'ok' : 'FAIL'
    console.log(
      `  run ${run.runIndex + 1}: ${runStatus} — verdict=${run.snapshot.verdict} receiver=${run.snapshot.receiverSignature ?? 'n/a'}`
    )
    run.assertionDiffs.forEach((diff) => console.log(`    - ${diff.message}`))
    if (run.error) console.log(`    error: ${run.error}`)
  })
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const caseDirs = await listCaseDirs(options.caseFilter)

  if (caseDirs.length === 0) {
    console.error(`No eval cases found under ${CASES_ROOT}`)
    process.exit(1)
  }

  const reports: EvalCaseReport[] = []
  for (const caseDir of caseDirs) {
    reports.push(await runCase(caseDir, options))
  }

  reports.forEach(printCaseReport)

  const allPassed = reports.every((report) => report.passed)
  if (options.record) {
    console.log('\nRecorded fixtures for case(s). Commit fixtures/openai-calls.json for CI mock runs.')
    process.exit(0)
  }

  process.exit(allPassed ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
