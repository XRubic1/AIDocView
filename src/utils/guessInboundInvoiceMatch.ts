/**
 * Guess which invoice an inbound broker email is about from subject/body (+ local invoice store).
 */
import { mockInvoices, getInvoiceById } from '../data/mockInvoices'
import type { Invoice } from '../types/invoice'

export type InboundInvoiceGuess = {
  invoiceId: string | null
  invoiceNumber: string
  loadNumber: string
  /** Carrier = Credyx client / trucking company name */
  carrierName: string
  brokerName: string
  /** True when we found a row in the invoice store */
  matched: boolean
  /** Human line: Inv# … · Load# … · Carrier … */
  label: string
}

const INV_RE =
  /\b(?:inv(?:oice)?[#:\s-]*|INV[- ]?)([A-Za-z0-9][\w-]*)\b/gi
const LOAD_RE =
  /\b(?:load|pro)[#:\s-]+([A-Za-z0-9][\w-]*)\b/gi

function uniqTokens(re: RegExp, hay: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(hay)) !== null) {
    const t = (m[1] || '').trim()
    if (!t || t.length < 2) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

function findInvoiceByTokens(invTokens: string[], loadTokens: string[]): Invoice | undefined {
  for (const token of invTokens) {
    const needle = token.replace(/\s/g, '').toLowerCase()
    const found = mockInvoices.find((i) => {
      const num = i.invoice_number.replace(/\s/g, '').toLowerCase()
      return (
        num === needle ||
        num === `inv-${needle}` ||
        num.endsWith(`-${needle}`) ||
        num.includes(needle)
      )
    })
    if (found) return found
  }
  for (const token of loadTokens) {
    const needle = token.toLowerCase()
    const found = mockInvoices.find(
      (i) => (i.load_number || '').toLowerCase() === needle
    )
    if (found) return found
  }
  return undefined
}

export function formatInboundInvoiceGuessLabel(g: {
  invoiceNumber?: string
  loadNumber?: string
  carrierName?: string
}): string {
  const parts: string[] = []
  if (g.invoiceNumber?.trim()) parts.push(`Inv# ${g.invoiceNumber.trim()}`)
  if (g.loadNumber?.trim()) parts.push(`Load# ${g.loadNumber.trim()}`)
  if (g.carrierName?.trim()) parts.push(`Carrier ${g.carrierName.trim()}`)
  return parts.join(' · ')
}

/**
 * Resolve a display guess for an inbound email.
 * Prefer an already-linked invoiceId; otherwise scan subject/body.
 */
export function guessInboundInvoiceMatch(opts: {
  subject?: string
  body?: string
  invoiceId?: string | null
  invoiceNumber?: string | null
  loadNumber?: string | null
}): InboundInvoiceGuess {
  if (opts.invoiceId) {
    const inv = getInvoiceById(opts.invoiceId)
    if (inv) {
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        loadNumber: inv.load_number || '',
        carrierName: inv.client_name || '',
        brokerName: inv.broker_name || '',
        matched: true,
        label: formatInboundInvoiceGuessLabel({
          invoiceNumber: inv.invoice_number,
          loadNumber: inv.load_number,
          carrierName: inv.client_name,
        }),
      }
    }
  }

  const hay = `${opts.subject || ''} ${opts.body || ''}`
  const invTokens = uniqTokens(INV_RE, hay)
  const loadTokens = uniqTokens(LOAD_RE, hay)
  const found = findInvoiceByTokens(invTokens, loadTokens)

  if (found) {
    return {
      invoiceId: found.id,
      invoiceNumber: found.invoice_number,
      loadNumber: found.load_number || '',
      carrierName: found.client_name || '',
      brokerName: found.broker_name || '',
      matched: true,
      label: formatInboundInvoiceGuessLabel({
        invoiceNumber: found.invoice_number,
        loadNumber: found.load_number,
        carrierName: found.client_name,
      }),
    }
  }

  const invoiceNumber =
    opts.invoiceNumber?.trim() ||
    (invTokens[0] ? (invTokens[0].match(/^inv/i) ? invTokens[0] : `INV-${invTokens[0]}`) : '')
  const loadNumber = opts.loadNumber?.trim() || loadTokens[0] || ''
  const label = formatInboundInvoiceGuessLabel({
    invoiceNumber,
    loadNumber,
    carrierName: '',
  })

  return {
    invoiceId: null,
    invoiceNumber,
    loadNumber,
    carrierName: '',
    brokerName: '',
    matched: false,
    label: label || '—',
  }
}
