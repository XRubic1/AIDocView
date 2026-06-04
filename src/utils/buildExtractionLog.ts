import { getReviewModelSummary } from '../config/aiReview'
import { BatchDocumentReviewResult, DocumentReviewResult } from '../types/documentReview'
import { buildStructuredLoadReview } from './loadReviewSummary'
import { documentHasBolEvidence } from './requiredDocuments'
import {
  getCustomReviewRules,
  getEffectiveBuiltInRules,
} from './reviewRulesStore'
import { getShipperRulesForPrompt } from './shipperRulesStore'

export type LogLineKind = 'meta' | 'classify' | 'extract' | 'check' | 'excel' | 'rule' | 'warn' | 'err' | 'ok'

export interface LogLine {
  kind: LogLineKind
  label: string
  value: string
  status?: 'pass' | 'fail' | 'warn'
}

/** Dense technical log lines for the engine inspector (terminal-style). */
export function buildExtractionLog(
  doc: DocumentReviewResult,
  batch?: BatchDocumentReviewResult | null,
  excelFileName?: string | null
): LogLine[] {
  const lines: LogLine[] = []
  const ext = doc.extraction
  const fileStem = doc.fileName.replace(/\.pdf$/i, '')

  lines.push({ kind: 'meta', label: 'file', value: doc.fileName })
  lines.push({ kind: 'meta', label: 'load', value: fileStem })
  lines.push({ kind: 'meta', label: 'model', value: doc.modelUsed })
  lines.push({ kind: 'meta', label: 'pipeline', value: getReviewModelSummary() })

  getEffectiveBuiltInRules()
    .filter((rule) => rule.enabled)
    .forEach((rule) => {
      lines.push({
        kind: 'rule',
        label: rule.definition.id,
        value: rule.definition.name,
        status: 'pass',
      })
    })

  getCustomReviewRules()
    .filter((rule) => rule.enabled)
    .forEach((rule) => {
      lines.push({
        kind: 'rule',
        label: 'custom',
        value: `${rule.title}: ${rule.condition} → ${rule.instruction}`.slice(0, 72),
        status: 'pass',
      })
    })

  const shipperRules = getShipperRulesForPrompt()
  shipperRules.forEach((entry, index) => {
    const summary = `${entry.shipper}: ${entry.rule}`
    lines.push({
      kind: 'rule',
      label: `shipper_${index + 1}`,
      value: summary.slice(0, 72),
      status: 'pass',
    })
  })

  if (batch?.auditSummary?.rulesApplied?.length) {
    batch.auditSummary.rulesApplied.forEach((label) => {
      lines.push({ kind: 'rule', label: 'audit', value: label, status: 'pass' })
    })
  }

  const pages = ext.pageClassifications ?? []
  pages.forEach((p) => {
    const conf = p.confidence != null ? ` ${Math.round(p.confidence * 100)}%` : ''
    lines.push({
      kind: 'classify',
      label: `p${p.pageNumber}`,
      value: `${p.pageType}${conf}`,
    })
  })

  if (!documentHasBolEvidence(ext)) {
    lines.push({ kind: 'classify', label: 'BOL', value: 'not_found', status: 'fail' })
  }

  const rc = ext.rateConParse
  const inv = ext.primaryInvoice
  if (rc) {
    if (rc.load_number) lines.push({ kind: 'extract', label: 'rate_con.load', value: String(rc.load_number) })
    if (rc.broker_name) lines.push({ kind: 'extract', label: 'rate_con.broker', value: rc.broker_name })
    if (rc.carrier_name) lines.push({ kind: 'extract', label: 'rate_con.carrier', value: rc.carrier_name })
    if (rc.rate_total != null) lines.push({ kind: 'extract', label: 'rate_con.amount', value: `$${rc.rate_total}` })
  }

  if (inv) {
    if (inv.load_number) lines.push({ kind: 'extract', label: 'invoice.load', value: String(inv.load_number) })
    if (inv.broker_name) lines.push({ kind: 'extract', label: 'invoice.broker', value: inv.broker_name })
    if (inv.amount_total != null) lines.push({ kind: 'extract', label: 'invoice.amount', value: `$${inv.amount_total}` })
  }

  if (rc?.load_number && inv?.load_number) {
    const rcDigits = String(rc.load_number).replace(/\D/g, '')
    const invDigits = String(inv.load_number).replace(/\D/g, '')
    if (rcDigits !== invDigits && !rcDigits.endsWith(invDigits) && !invDigits.endsWith(rcDigits)) {
      lines.push({
        kind: 'warn',
        label: 'load_mismatch',
        value: `RC ${rc.load_number} vs INV ${inv.load_number}`,
        status: 'fail',
      })
    }
  }

  if (rc?.rate_total != null && inv?.amount_total != null) {
    const diff = Math.abs(rc.rate_total - inv.amount_total)
    if (diff > 50 && diff / Math.max(rc.rate_total, 1) > 0.05) {
      lines.push({
        kind: 'warn',
        label: 'amount_mismatch',
        value: `RC $${rc.rate_total} vs INV $${inv.amount_total}`,
        status: 'fail',
      })
    }
  }

  const bol = ext.bolAudit
  if (bol) {
    lines.push({
      kind: 'extract',
      label: 'bol.receiver_sig',
      value: bol.signatures.receiver,
      status: bol.signatures.receiver === 'PRESENT' || bol.signatures.receiver === 'PASS_BY_RULE' ? 'pass' : 'fail',
    })
    if (bol.ship_to) lines.push({ kind: 'extract', label: 'bol.ship_to', value: bol.ship_to })
  }

  if (batch) {
    const structured = buildStructuredLoadReview(doc, batch, {
      excelFileName: excelFileName ?? batch.excelFileName,
    })
    structured.requiredAll.forEach((check) => {
      const shortId = check.id.replace('req_', '')
      lines.push({
        kind: 'check',
        label: shortId,
        value: check.status === 'ok' ? 'PASS' : 'FAIL',
        status: check.status === 'ok' ? 'pass' : 'fail',
      })
      if (check.status !== 'ok' && check.summary) {
        lines.push({ kind: 'warn', label: '  ↳', value: check.summary.slice(0, 72) })
      }
    })

    const excelMatch =
      batch.multiInvoice?.verifications.find((v) => v.unit.fileName === doc.fileName)?.excelMatch ??
      batch.excelMatch
    if (excelFileName || batch.excelFileName) {
      lines.push({ kind: 'excel', label: 'sheet', value: excelFileName ?? batch.excelFileName ?? '—' })

      const multiVerifications = batch.multiInvoice?.verifications ?? []
      if (multiVerifications.length > 1) {
        multiVerifications.forEach((verification) => {
          const stem = verification.unit.fileName.replace(/\.pdf$/i, '')
          const match = verification.excelMatch
          if (match) {
            lines.push({
              kind: 'excel',
              label: stem.slice(0, 12),
              value: `load ${match.row.loadNumber}${match.row.amount != null ? ` · $${match.row.amount}` : ''} · ${match.overall}`,
              status:
                match.overall === 'MATCH' ? 'pass' : match.overall === 'MISMATCH' ? 'fail' : 'warn',
            })
          } else {
            lines.push({
              kind: 'excel',
              label: stem.slice(0, 12),
              value: 'no row match',
              status: 'warn',
            })
          }
        })
      } else if (excelMatch) {
        lines.push({
          kind: 'excel',
          label: 'row',
          value: `load ${excelMatch.row.loadNumber}${excelMatch.row.amount != null ? ` · $${excelMatch.row.amount}` : ''}`,
          status: excelMatch.overall === 'MATCH' ? 'pass' : excelMatch.overall === 'MISMATCH' ? 'fail' : 'warn',
        })
        excelMatch.fields.forEach((f) => {
          lines.push({
            kind: 'excel',
            label: f.field,
            value: `${f.status} · ${f.message}`.slice(0, 64),
            status: f.status === 'MATCH' ? 'pass' : f.status === 'MISMATCH' ? 'fail' : 'warn',
          })
        })
      } else {
        lines.push({ kind: 'excel', label: 'row', value: 'no match', status: 'warn' })
      }
    }

    const failN = structured.requiredFailed.length
    const total = structured.requiredTotal
    lines.push({
      kind: failN === 0 ? 'ok' : 'err',
      label: 'verdict',
      value: failN === 0 ? `APPROVED · ${total}/${total}` : `NEEDS_REVIEW · ${total - failN}/${total}`,
      status: failN === 0 ? 'pass' : 'fail',
    })
  }

  if (batch?.reviewCost?.totalUsd != null) {
    lines.push({ kind: 'meta', label: 'cost', value: `$${batch.reviewCost.totalUsd.toFixed(3)}` })
  }

  return lines
}
