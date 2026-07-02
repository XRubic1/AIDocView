import type { BatchDocumentReviewResult } from '../../src/types/documentReview.js'
import type { EvalAssertionDiff, EvalExpected, EvalRunSnapshot } from './types.js'

function receiverFromBatch(result: BatchDocumentReviewResult): string | undefined {
  for (const doc of result.documents) {
    const audit = doc.extraction.bolAudit
    if (audit?.signatures?.receiver) return audit.signatures.receiver
    for (const entry of doc.extraction.bolPageAudits ?? []) {
      if (entry.audit?.signatures?.receiver) return entry.audit.signatures.receiver
    }
  }
  return undefined
}

export function extractEvalSnapshot(result: BatchDocumentReviewResult): EvalRunSnapshot {
  const pageClassifications = result.documents.flatMap((doc) =>
    (doc.extraction.pageClassifications ?? []).map((page) => ({
      fileName: doc.fileName,
      pageNumber: page.pageNumber,
      pageType: page.pageType,
    }))
  )

  const flags = (result.crossValidation?.flags ?? []).map((flag) => flag.message)

  return {
    verdict: result.crossValidation?.overall ?? 'NEEDS_REVIEW',
    receiverSignature: receiverFromBatch(result) as EvalRunSnapshot['receiverSignature'],
    pageClassifications,
    flags,
  }
}

function flagMatches(message: string, pattern: string): boolean {
  return message.toLowerCase().includes(pattern.toLowerCase())
}

export function compareSnapshotToExpected(
  snapshot: EvalRunSnapshot,
  expected: EvalExpected
): EvalAssertionDiff[] {
  const diffs: EvalAssertionDiff[] = []

  if (snapshot.verdict !== expected.verdict) {
    diffs.push({
      field: 'verdict',
      expected: expected.verdict,
      actual: snapshot.verdict,
      message: `Expected verdict ${expected.verdict} but got ${snapshot.verdict}`,
    })
  }

  if (expected.receiverSignature && snapshot.receiverSignature !== expected.receiverSignature) {
    diffs.push({
      field: 'receiverSignature',
      expected: expected.receiverSignature,
      actual: snapshot.receiverSignature,
      message: `Expected receiver signature ${expected.receiverSignature} but got ${snapshot.receiverSignature ?? 'undefined'}`,
    })
  }

  for (const must of expected.flagsMustInclude ?? []) {
    if (!snapshot.flags.some((flag) => flagMatches(flag, must))) {
      diffs.push({
        field: 'flagsMustInclude',
        expected: must,
        actual: snapshot.flags,
        message: `Expected a flag containing "${must}"`,
      })
    }
  }

  for (const mustNot of expected.flagsMustNotInclude ?? []) {
    if (snapshot.flags.some((flag) => flagMatches(flag, mustNot))) {
      diffs.push({
        field: 'flagsMustNotInclude',
        expected: mustNot,
        actual: snapshot.flags,
        message: `Did not expect a flag containing "${mustNot}"`,
      })
    }
  }

  for (const expectedPage of expected.pageClassifications ?? []) {
    const match = snapshot.pageClassifications.find(
      (page) =>
        page.fileName === expectedPage.fileName && page.pageNumber === expectedPage.pageNumber
    )
    if (!match) {
      diffs.push({
        field: 'pageClassifications',
        expected: expectedPage,
        actual: snapshot.pageClassifications,
        message: `Missing page classification for ${expectedPage.fileName} page ${expectedPage.pageNumber}`,
      })
      continue
    }
    if (match.pageType !== expectedPage.pageType) {
      diffs.push({
        field: 'pageClassifications',
        expected: expectedPage.pageType,
        actual: match.pageType,
        message: `${expectedPage.fileName} page ${expectedPage.pageNumber}: expected type ${expectedPage.pageType}, got ${match.pageType}`,
      })
    }
  }

  return diffs
}

export function computeVerdictFlipRate(verdicts: string[]): number {
  if (verdicts.length <= 1) return 0
  const counts = new Map<string, number>()
  verdicts.forEach((verdict) => counts.set(verdict, (counts.get(verdict) ?? 0) + 1))
  const maxCount = Math.max(...counts.values())
  return (verdicts.length - maxCount) / verdicts.length
}

export function dominantVerdict(verdicts: string[]): string | null {
  if (verdicts.length === 0) return null
  const counts = new Map<string, number>()
  verdicts.forEach((verdict) => counts.set(verdict, (counts.get(verdict) ?? 0) + 1))
  let best: string | null = null
  let bestCount = -1
  counts.forEach((count, verdict) => {
    if (count > bestCount) {
      best = verdict
      bestCount = count
    }
  })
  return best
}
