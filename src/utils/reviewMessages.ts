/** Map internal document labels to plain English. */
function docLabel(label: string): string {
  const map: Record<string, string> = {
    'rate con': 'rate confirmation',
    invoice: 'invoice',
    Excel: 'Excel sheet',
  }
  return map[label] ?? label
}

/**
 * Turn technical verification text into short, plain-language sentences for users.
 * Applied at display time and when building new flags.
 */
export function humanizeReviewMessage(message: string): string {
  let text = message.trim()
  if (!text) return text

  // UI already shows the PDF name — strip redundant prefixes
  text = text.replace(/^Invoice\s+[^\s:]+\.pdf\s*\(p\.\s*\d+\):\s*/i, '')
  text = text.replace(/^Invoice\s+[^:]+:\s*/i, '')
  text = text.replace(/^[\w\s.-]+\.pdf:\s*/i, '')
  text = text.replace(/^packet_[\w.-]+_/i, '')

  const replacements: Array<[RegExp, string]> = [
    [/^BOL audit needs review:\s*/i, ''],
    [/^BOL notes \(non-blocking\):\s*/i, 'Note: '],
    [/Broker load # mismatch:/gi, 'Load numbers do not match on these documents:'],
    [/Load # on invoice \("([^"]+)"\) does not match rate con \("([^"]+)"\)/gi,
      'Load number on the invoice ($1) does not match the rate confirmation ($2)'],
    [/Load # not found on invoice \(rate con shows "([^"]+)"\)/gi,
      'Could not read a load number on the invoice (rate confirmation shows $1)'],
    [/Load # mismatch:/gi, 'Load numbers do not match:'],
    [/Broker on invoice does not match rate con/gi,
      'Broker name on the invoice does not match the rate confirmation'],
    [/Broker name differs between rate con, invoice, and\/or Excel/gi,
      'Broker name is not the same on the rate confirmation, invoice, and/or Excel sheet'],
    [/Rate con delivery address does not match BOL Ship To/gi,
      'Delivery address on the rate confirmation does not match the bill of lading'],
    [/BOL destination does not match rate con/gi,
      'Delivery address on the bill of lading does not match the rate confirmation'],
    [/Receiver signature or delivery proof missing on the BOL/gi,
      'Missing receiver signature or delivery proof on the bill of lading'],
    [/may be forged, stamped, or digitally added/gi,
      'may be forged, stamped, or digitally added'],
    [/signature authenticity.*unclear/gi,
      'signature authenticity is unclear'],
    [/verify authenticity before approving/gi,
      'verify signature authenticity before approving'],
    [/AI review stopped at the \$/gi, 'AI review exceeded the allowed credit'],
    [/AI review hit the cost limit/gi, 'AI review exceeded the allowed credit'],
    [/estimated spend/gi, 'allowed credit'],
    [/cost limit/gi, 'allowed credit'],
    [/Finish verification manually/gi, 'finish verification manually'],
    [/Incomplete BOL:/gi, 'Incomplete bill of lading:'],
    [/BOL page set may be incomplete/gi, 'The bill of lading may be missing pages'],
    [/Bill of lading \(BOL\) is required/gi, 'A bill of lading is required'],
    [/was not detected in this PDF/gi, 'was not found in this PDF'],
    [/verify Excel row auto-match/gi, 'check that the correct Excel row was matched'],
    [/does not match rate con in this PDF/gi,
      'does not match the rate confirmation in this PDF'],
    [/no rate con found in the same PDF/gi,
      'no rate confirmation was found in the same PDF'],
    [/partial match to rate con/gi, 'only partly matches the rate confirmation'],
    [/vs documents/gi, 'compared to the paperwork'],
    [/vs Excel/gi, 'compared to the Excel sheet'],
    [/\brate con\b/gi, 'rate confirmation'],
    [/\bBOL\b/g, 'bill of lading'],
    [/"\s*—\s*"/g, '"not found"'],
  ]

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement)
  }

  text = text.replace(/\s+/g, ' ').trim()

  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1)
  }
  if (text && !/[.!?]$/.test(text)) {
    text += '.'
  }

  return text
}

/** Split compound messages and humanize each line; drop duplicates. */
export function humanizeReviewMessages(messages: string[]): string[] {
  const out: string[] = []
  for (const raw of messages) {
    const parts = raw.split(/\s*;\s*/).map((p) => p.trim()).filter(Boolean)
    for (const part of parts.length > 0 ? parts : [raw]) {
      const line = humanizeReviewMessage(part)
      if (line && !out.includes(line)) {
        out.push(line)
      }
    }
  }
  return out
}

/** Short label for verification checklist rows. */
export const CHECK_LABELS = {
  loadNumber: 'Load number',
  broker: 'Broker name',
  amount: 'Freight amount',
  bol: 'Bill of lading (signed & delivery address)',
  multiStop: 'All delivery stops covered',
  carrier: 'Carrier name',
  pageCount: 'BOL page count',
} as const

/** Every packet is scored on these 7 checks, in this order. */
export const REQUIRED_PACKET_CHECKS = [
  { id: 'req_load', label: CHECK_LABELS.loadNumber },
  { id: 'req_broker', label: CHECK_LABELS.broker },
  { id: 'req_amount', label: CHECK_LABELS.amount },
  { id: 'req_bol', label: CHECK_LABELS.bol },
  { id: 'req_stops', label: CHECK_LABELS.multiStop },
  { id: 'req_carrier', label: CHECK_LABELS.carrier },
  { id: 'req_page_count', label: CHECK_LABELS.pageCount },
] as const

export const REQUIRED_PACKET_CHECK_COUNT = REQUIRED_PACKET_CHECKS.length

/** Human-readable load # mismatch across documents. */
export function loadNumberMismatchMessage(
  sources: Array<{ label: string; value: string }>
): string {
  const parts = sources.map((s) => `${docLabel(s.label)}: ${s.value}`).join('; ')
  return `Load numbers do not match — ${parts}.`
}

/** Human-readable Excel load # warning. */
export function excelLoadMismatchMessage(
  excelLoad: string,
  documentLoad: string,
  documentLabel = 'rate confirmation'
): string {
  return `Excel sheet shows load ${excelLoad}, but the ${documentLabel} shows ${documentLoad}. Check that the right Excel row is matched.`
}
