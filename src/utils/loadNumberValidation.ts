import { CrossValidationFlag } from '../types/documentPipeline'
import { DocumentReviewResult } from '../types/documentReview'
import { loadNumbersMatch } from './extractBatchFields'
import { excelLoadMismatchMessage, loadNumberMismatchMessage } from './reviewMessages'

function normalizeLoadNumber(value?: string | null): string {
  return (value ?? '').replace(/\D/g, '').replace(/^0+/, '') || (value ?? '').replace(/\D/g, '')
}

/** All load/reference numbers read from BOL audits in the batch. */
export function collectBolLoadReferences(documents: DocumentReviewResult[]): string[] {
  const refs = new Set<string>()

  for (const doc of documents) {
    const audit = doc.extraction.bolAudit
    if (audit?.load_number?.trim()) refs.add(audit.load_number.trim())
    audit?.reference_numbers?.forEach((ref) => {
      if (ref?.trim()) refs.add(ref.trim())
    })

    doc.extraction.bolPageAudits?.forEach((entry) => {
      const number = entry.audit.load_number?.trim()
      if (number) refs.add(number)
      entry.audit.reference_numbers?.forEach((ref) => {
        if (ref?.trim()) refs.add(ref.trim())
      })
    })
  }

  return [...refs]
}

export function hasInvoicePages(documents: DocumentReviewResult[]): boolean {
  return documents.some(
    (doc) =>
      (doc.extraction.invoicePageAudits?.length ?? 0) > 0 ||
      doc.extraction.pageClassifications?.some((page) => page.pageType === 'invoice')
  )
}

/**
 * Broker load # (rate con PO) is authoritative. BOLs often show BOL/PRO numbers instead — not an automatic mismatch.
 */
export function validateLoadNumberCrossCheck(input: {
  rateConLoad?: string | null
  bolReferences: string[]
  invoiceLoad?: string | null
  excelLoad?: string | null
  hasInvoiceDocument: boolean
}): {
  status: 'MATCH' | 'MISMATCH'
  details: string
  flags: CrossValidationFlag[]
} {
  const flags: CrossValidationFlag[] = []
  const rateLoad = input.rateConLoad?.trim() ?? ''
  const rateNorm = normalizeLoadNumber(rateLoad)

  const brokerSources: Array<{ label: string; value: string }> = []
  if (rateLoad) brokerSources.push({ label: 'rate con', value: rateLoad })
  if (input.hasInvoiceDocument && input.invoiceLoad?.trim()) {
    brokerSources.push({ label: 'invoice', value: input.invoiceLoad.trim() })
  }
  if (input.excelLoad?.trim()) {
    brokerSources.push({ label: 'Excel', value: input.excelLoad.trim() })
  }

  let status: 'MATCH' | 'MISMATCH' = 'MATCH'
  let details = 'Load numbers align across broker documents.'

  const rateConSource = brokerSources.find((s) => s.label === 'rate con')
  const invoiceSource = brokerSources.find((s) => s.label === 'invoice')
  const excelSource = brokerSources.find((s) => s.label === 'Excel')
  const anchorLoad = rateConSource?.value ?? brokerSources[0]?.value ?? ''

  const coreSources = [rateConSource, invoiceSource].filter(
    (s): s is { label: string; value: string } => Boolean(s?.value)
  )

  if (coreSources.length >= 2) {
    const coreMismatch = coreSources.some(
      (source) => !loadNumbersMatch(anchorLoad, source.value)
    )
    if (coreMismatch) {
      status = 'MISMATCH'
      details = loadNumberMismatchMessage(coreSources)
      flags.push({ level: 'ERROR', field: 'load_number', message: details })
    }
  } else if (coreSources.length === 1 && excelSource?.value) {
    if (!loadNumbersMatch(anchorLoad, excelSource.value)) {
      flags.push({
        level: 'WARNING',
        field: 'load_number_excel',
        message: excelLoadMismatchMessage(
          excelSource.value,
          coreSources[0].value,
          coreSources[0].label === 'invoice' ? 'invoice' : 'rate confirmation'
        ),
      })
    }
  } else if (!rateNorm && coreSources.length === 0) {
    details = 'Load number not found on rate con.'
    flags.push({ level: 'WARNING', field: 'load_number', message: details })
  }

  if (
    excelSource?.value &&
    anchorLoad &&
    status === 'MATCH' &&
    !loadNumbersMatch(anchorLoad, excelSource.value)
  ) {
    flags.push({
      level: 'WARNING',
      field: 'load_number_excel',
      message: excelLoadMismatchMessage(excelSource.value, anchorLoad, 'rate confirmation or invoice'),
    })
  }

  if (!rateNorm || input.bolReferences.length === 0) {
    return { status, details, flags }
  }

  const matchingBol = input.bolReferences.filter((ref) => loadNumbersMatch(rateLoad, ref))
  const nonMatchingBol = input.bolReferences.filter(
    (ref) => ref.trim() && !loadNumbersMatch(rateLoad, ref)
  )

  if (matchingBol.length > 0) {
    if (nonMatchingBol.length > 0) {
      flags.push({
        level: 'INFO',
        field: 'bol_reference_number',
        message: `Some BOL(s) also show other reference number(s) (${nonMatchingBol.join(', ')}) — often BOL/PRO numbers, not the broker PO ${rateLoad}.`,
      })
    }
    return { status, details, flags }
  }

  flags.push({
    level: 'WARNING',
    field: 'bol_reference_number',
    message: `BOL reference number(s) (${input.bolReferences.join(', ')}) do not match broker load # ${rateLoad}. This is usually the BOL or PRO number — verify the broker PO appears on the BOL if required.`,
  })

  return { status, details, flags }
}
