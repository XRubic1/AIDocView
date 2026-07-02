import path from 'node:path'
import { setDomSurface } from '../../../src/platform/domSurface.js'
import { setReviewImageRasterizer } from '../../../src/platform/reviewImageRasterizer.js'
import type { EvalCaseDefinition } from '../types.js'
import { applyEvalEnv } from './evalEnv.js'
import {
  clearOpenAIHandler,
  installMockOpenAI,
  installRecordingOpenAI,
  loadOpenAIFixtures,
  resetMockOpenAI,
} from './mockOpenAI.js'
import {
  createNodeReviewImageRasterizer,
  loadCaseDocuments,
  type CaseDocumentInput,
} from './nodeRasterizer.js'
import { createNodeDomSurface } from './nodeDomSurface.js'

export { applyEvalEnv } from './evalEnv.js'

export interface InstallEvalRuntimeOptions {
  mode: 'mock' | 'live'
  caseDir: string
  caseDefinition: EvalCaseDefinition
  documentInputs: CaseDocumentInput[]
  record?: boolean
}

let activeMockCalls: Awaited<ReturnType<typeof loadOpenAIFixtures>>['calls'] | undefined

/** Replay mock fixtures from the first OpenAI call (multi-run consistency). */
export function resetActiveMockOpenAI(): void {
  if (activeMockCalls) {
    resetMockOpenAI(activeMockCalls)
  }
}

export async function installEvalRuntime(options: InstallEvalRuntimeOptions): Promise<void> {
  applyEvalEnv(options.caseDefinition.env)

  setDomSurface(createNodeDomSurface())

  const caseDocs = await loadCaseDocuments(options.documentInputs)
  setReviewImageRasterizer(createNodeReviewImageRasterizer(caseDocs))

  const fixturePath = path.join(options.caseDir, 'fixtures', 'openai-calls.json')

  clearOpenAIHandler()
  activeMockCalls = undefined

  if (options.mode === 'mock') {
    const fixtures = await loadOpenAIFixtures(fixturePath)
    activeMockCalls = fixtures.calls
    installMockOpenAI(activeMockCalls)
    return
  }

  if (options.record) {
    installRecordingOpenAI(fixturePath)
    return
  }

  // Live pass-through — handler unset; openaiFetch uses real HTTP.
}

export function teardownEvalRuntime(): void {
  clearOpenAIHandler()
  activeMockCalls = undefined
}
