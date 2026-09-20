import type { BatchIntakeDraft } from '../types/credyxBatch'

/** True when this file name is already a page-split child (`foo-p3.pdf`). */
export function isPageSplitFileName(fileName: string): boolean {
  return /-(p\d+)\.pdf$/i.test(fileName)
}

/** Stem used to match parent PDF → `RateConf_x.pdf` children `RateConf_x-p1.pdf`. */
export function pdfNameStem(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').replace(/-(p\d+)$/i, '')
}

/**
 * File names present in the draft catalog + live Files.
 * Must NOT go through listAllSupportingFingerprints — that path calls
 * draftHasPageSplitChildren and would recurse until the stack overflows.
 */
export function collectDraftFileNames(draft: BatchIntakeDraft): string[] {
  const names: string[] = []
  for (const fp of [
    ...draft.unmatched.rateCons,
    ...draft.unmatched.bols,
    ...draft.unmatched.other,
  ]) {
    if (fp.fileName) names.push(fp.fileName)
  }
  for (const inv of draft.invoices) {
    for (const fp of [
      ...inv.fingerprints.rateCons,
      ...inv.fingerprints.bols,
      ...(inv.fingerprints.other ?? []),
    ]) {
      if (fp.fileName) names.push(fp.fileName)
    }
  }
  for (const file of draft.fileById.values()) {
    if (file.name) names.push(file.name)
  }
  return names
}

/** Draft already has `stem-pN.pdf` children for this parent file. */
export function draftHasPageSplitChildren(
  draft: BatchIntakeDraft,
  parentFileName: string
): boolean {
  if (isPageSplitFileName(parentFileName)) return true
  const stem = pdfNameStem(parentFileName).toLowerCase()
  if (!stem) return false
  return collectDraftFileNames(draft).some((name) => {
    if (!isPageSplitFileName(name)) return false
    return pdfNameStem(name).toLowerCase() === stem
  })
}
