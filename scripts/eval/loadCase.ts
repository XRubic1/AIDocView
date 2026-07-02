import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { EvalCaseDefinition } from './types.js'

export async function loadEvalCase(caseDir: string): Promise<EvalCaseDefinition> {
  const expectedPath = path.join(caseDir, 'expected.json')
  const raw = await readFile(expectedPath, 'utf8')
  const parsed = JSON.parse(raw) as EvalCaseDefinition

  if (!parsed.id || !parsed.documents?.length || !parsed.expected?.verdict) {
    throw new Error(`Invalid expected.json in ${caseDir}`)
  }

  return parsed
}

export function resolveCaseDocuments(caseDir: string, definition: EvalCaseDefinition) {
  return definition.documents.map((doc) => ({
    ...doc,
    absolutePath: doc.path ? path.join(caseDir, doc.path) : undefined,
    absolutePagesDir: doc.pagesDir ? path.join(caseDir, doc.pagesDir) : undefined,
  }))
}
