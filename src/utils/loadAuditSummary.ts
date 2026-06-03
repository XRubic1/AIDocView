import {
  BolAudit,
  CrossValidationResult,
  LoadAuditSummary,
  RateConParse,
} from '../types/documentPipeline'
import { DocumentReviewResult, PageClassification } from '../types/documentReview'
import { ReviewCostSummary } from './reviewCost'
import {
  evaluateRequiredDocuments,
  mergeOverallStatus,
} from './requiredDocuments'
import { MultiStopBolResult } from './multiStopBolValidation'
import { MultiInvoiceResult } from './multiInvoiceValidation'
import { bolAuditMeetsDeliveryRequirements } from './bolAuditSanitizer'
import { getActiveReviewRuleLabels } from './reviewRulesStore'

function bolSignatureDetail(bol?: BolAudit): string | undefined {
  if (!bol) return undefined
  const receiverOk =
    bol.signatures.receiver === 'PRESENT' || bol.signatures.receiver === 'PASS_BY_RULE'
  const dateOk =
    bol.signatures.receiver_date === 'PRESENT' || bol.signatures.receiver_date === 'PASS_BY_RULE'
  if (receiverOk && dateOk) return 'signed — receiver confirmation on BOL'
  if (receiverOk) return 'receiver signature present'
  if (bol.signatures.receiver === 'PASS_BY_RULE') return 'receiver confirmed per shipper rule'
  return undefined
}

/** Build Prompt 6-style summary without an extra API call. */
export function buildLoadAuditSummary(input: {
  rateConParse?: RateConParse
  bolAudit?: BolAudit
  crossValidation?: CrossValidationResult
  multiStopBol?: MultiStopBolResult
  multiInvoice?: MultiInvoiceResult
  pageClassifications?: PageClassification[]
  bolPageCount?: number
  reviewCost?: ReviewCostSummary
  reviewDocuments?: DocumentReviewResult[]
}): LoadAuditSummary {
  const cross = input.crossValidation
  const bol = input.bolAudit
  const rate = input.rateConParse
  const pages = input.pageClassifications ?? []
  const countType = (type: string) => pages.filter((page) => page.pageType === type).length

  const required = evaluateRequiredDocuments({
    rateConParse: rate,
    bolAudit: bol,
    bolPageCount: input.bolPageCount,
    pageClassifications: pages,
    hasExtractedInvoice: (input.multiInvoice?.invoiceCount ?? 0) > 0,
    reviewDocuments: input.reviewDocuments,
    multiLoadUpload: input.multiInvoice?.multiLoadUpload,
  })

  const { hasRateCon, hasBol, hasInvoice, bolPageCount: bolPages } = required
  const multiInvoice = input.multiInvoice
  const multiLoad = multiInvoice?.multiLoadUpload ?? false

  let overallStatus: LoadAuditSummary['overallStatus'] = mergeOverallStatus(
    cross?.overall ?? 'APPROVED',
    required.documentGate
  )
  if (multiLoad && input.reviewDocuments?.length) {
    const anyBolFails = input.reviewDocuments.some((doc) => {
      const docBol = doc.extraction.bolAudit
      if (!docBol) return false
      return !bolAuditMeetsDeliveryRequirements(docBol, doc.extraction.rateConParse)
    })
    if (anyBolFails && overallStatus === 'APPROVED') {
      overallStatus = 'NEEDS_REVIEW'
    }
  } else if (
    bol &&
    overallStatus === 'APPROVED' &&
    !bolAuditMeetsDeliveryRequirements(bol, rate)
  ) {
    overallStatus = 'NEEDS_REVIEW'
  }

  const lumperPages = countType('lumper')
  const invoicePages = countType('invoice')
  const podPages = countType('proof_of_delivery')

  const multiStop = input.multiStopBol
  const verifiedInvoiceCount = multiInvoice?.primaryAcceptedCount ?? 0
  const invoiceDetail = multiInvoice?.invoiceCount
    ? multiInvoice.invoiceCount > 1
        ? `${multiInvoice.invoiceCount} invoices verified — ${verifiedInvoiceCount} match rate con`
        : verifiedInvoiceCount > 0
          ? '1 invoice verified against rate con'
          : `${invoicePages} page${invoicePages !== 1 ? 's' : ''} — extraction only`
    : hasInvoice
      ? `${invoicePages} page${invoicePages !== 1 ? 's' : ''} classified`
      : undefined
  const multiStopBolDetail =
    multiStop?.isMultiStop
      ? `${multiStop.bolUnitCount} BOL(s) for ${multiStop.stopCount} stops — ${multiStop.stops.filter((s) => s.status === 'COMPLETE').length}/${multiStop.stopCount} signed`
      : undefined

  const bolDetail = [
    bolPages > 0 ? `${bolPages} page${bolPages > 1 ? 's' : ''}` : undefined,
    multiStopBolDetail,
    bolSignatureDetail(bol),
  ]
    .filter(Boolean)
    .join(' · ')

  const documentsReceived: LoadAuditSummary['documentsReceived'] = [
    { name: 'Rate confirmation', status: hasRateCon ? 'ok' : 'missing' },
    {
      name: 'Bill of lading (BOL)',
      status: hasBol
        ? bol?.page_count === 'INCOMPLETE' || !bolAuditMeetsDeliveryRequirements(bol, rate)
          ? 'partial'
          : 'ok'
        : 'missing',
      detail: [bolDetail, bol?.page_count === 'INCOMPLETE' ? bol.page_count_notes : undefined]
        .filter(Boolean)
        .join(' · ') || undefined,
    },
    {
      name: 'Invoice',
      status: hasInvoice
        ? multiInvoice?.primaryLoadIncomplete
          ? 'partial'
          : 'ok'
        : 'missing',
      detail: invoiceDetail,
    },
  ]

  if (lumperPages > 0) {
    documentsReceived.push({
      name: 'Lumper receipt',
      status: 'info',
      detail:
        lumperPages > 1
          ? `${lumperPages} pages detected — not required; verify against invoice if billed`
          : 'Present — not required; verify amount on invoice if billed',
    })
  }

  const flags = [...(cross?.flags ?? []), ...required.flags]
  const seenFields = new Set<string>()
  const dedupedFlags = flags.filter((flag) => {
    const key = `${flag.field}-${flag.message}`
    if (seenFields.has(key)) return false
    seenFields.add(key)
    return true
  })

  if (dedupedFlags.some((flag) => flag.level === 'ERROR')) {
    overallStatus = 'REJECTED'
  } else if (
    dedupedFlags.some((flag) => flag.level === 'WARNING') &&
    overallStatus === 'APPROVED'
  ) {
    overallStatus = 'NEEDS_REVIEW'
  }

  if (podPages > 0 && hasBol) {
    flags.push({
      level: 'INFO',
      field: 'pod_on_bol',
      message: `${podPages} page(s) classified as POD — treated as part of BOL delivery proof (signed BOL workflow).`,
    })
  }

  const rulesApplied: string[] = []
  getActiveReviewRuleLabels().forEach((name) => {
    if (!rulesApplied.includes(name)) rulesApplied.push(name)
  })
  if (bol?.signatures?.rule_applied) rulesApplied.push(bol.signatures.rule_applied)
  if (bol?.signatures?.receiver === 'PASS_BY_RULE') {
    rulesApplied.push('Shipper rule applied to receiver signature')
  }

  const statusEmoji =
    overallStatus === 'APPROVED' ? '✅' : overallStatus === 'NEEDS_REVIEW' ? '⚠️' : '❌'

  const docIcon = (status: string) => {
    if (status === 'ok') return '✅'
    if (status === 'partial') return '⚠️'
    if (status === 'info') return 'ℹ️'
    return '❌'
  }

  const flagLines =
    dedupedFlags.length > 0
      ? dedupedFlags
          .sort((a, b) => {
            const order = { ERROR: 0, WARNING: 1, INFO: 2 }
            return order[a.level] - order[b.level]
          })
          .map((flag) => `- [${flag.level}] ${flag.message}`)
          .join('\n')
      : 'No issues found. Ready to process.'

  const multiInvoiceLines =
    multiInvoice && multiInvoice.invoiceCount > 0
      ? [
          'INVOICE VERIFICATION:',
          ...multiInvoice.verifications.map((verification) => {
            const accepted =
              verification.loadMatch && verification.amountMatch && verification.brokerMatch
            const icon = accepted
              ? '✅'
              : verification.appliesToPrimaryLoad
                ? verification.status === 'PARTIAL'
                  ? '⚠️'
                  : '❌'
                : '➖'
            const inv = verification.unit.invoice
            const scope = verification.appliesToPrimaryLoad ? '' : ' (separate load)'
            return `- p. ${verification.unit.pageNumbers.join(', ')} (${verification.unit.fileName}): load ${inv.load_number ?? '—'}, $${inv.amount_total ?? '—'} ${icon}${scope}`
          }),
          '',
        ]
      : []

  const multiStopLines =
    multiStop?.isMultiStop && multiStop.stops.length > 0
      ? [
          'MULTI-STOP BOL COVERAGE:',
          ...multiStop.stops.map((stop) => {
            const icon =
              stop.status === 'COMPLETE'
                ? '✅'
                : stop.status === 'MISSING_SIGNATURE'
                  ? '⚠️'
                  : '❌'
            const bolRef = stop.matchedBol
              ? ` — ${stop.matchedBol.fileName} (p. ${stop.matchedBol.pageNumbers.join(', ')})`
              : ''
            return `- Stop ${stop.stopNumber}: ${stop.destinationLabel} ${icon}${bolRef}`
          }),
          '',
        ]
      : []

  const narrative = [
    `OVERALL STATUS: ${statusEmoji} ${overallStatus}`,
    '',
    `LOAD: ${rate?.load_number ?? '—'} | BROKER: ${rate?.broker_name ?? '—'} | AMOUNT: $${rate?.rate_total ?? '—'}`,
    '',
    'DOCUMENTS RECEIVED:',
    ...documentsReceived.map((doc) => {
      const suffix = doc.detail ? ` (${doc.detail})` : ''
      return `- ${doc.name}${suffix} ${docIcon(doc.status)}`
    }),
    '',
    ...(multiInvoiceLines.length > 0 ? multiInvoiceLines : []),
    ...multiStopLines,
    'FLAGS:',
    flagLines,
    '',
    'RULES APPLIED:',
    rulesApplied.length > 0 ? rulesApplied.map((rule) => `- ${rule}`).join('\n') : '- None',
  ].join('\n')

  const summaryLoadNumber = multiLoad
    ? multiInvoice?.distinctLoadNumbers.length
      ? `${multiInvoice.distinctLoadNumbers.length} loads (${multiInvoice.verifications.map((v) => v.unit.invoice.load_number ?? '—').join(', ')})`
      : `${multiInvoice?.invoiceCount ?? 0} loads`
    : rate?.load_number ?? undefined

  const summaryBroker = multiLoad
    ? `${multiInvoice?.invoiceCount ?? 0} independent PDFs`
    : rate?.broker_name ?? undefined

  const summaryAmount = multiLoad
    ? undefined
    : rate?.rate_total ?? undefined

  return {
    overallStatus,
    loadNumber: summaryLoadNumber,
    broker: summaryBroker,
    amount: summaryAmount,
    documentsReceived,
    flags: dedupedFlags,
    rulesApplied,
    narrative,
  }
}
