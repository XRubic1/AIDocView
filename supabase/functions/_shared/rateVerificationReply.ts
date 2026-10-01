/**
 * Read a broker reply to the rate verification email.
 * OK = rate stands, no advances or deductions.
 * Hold = advances, deductions, or a different rate.
 */
export type RateVerificationOutcome = 'ok' | 'hold' | 'unknown'

export type RateVerificationReading = {
  outcome: RateVerificationOutcome
  summary: string
}

export const RATE_VERIFICATION_TEMPLATE_ID = 'broker_rate_verification'

const HARD_HOLD =
  /\b(short\s*paid|short\s*pay|charge\s*backs?|chargebacks?|comchec?ks?|fuel\s+advances?|we\s+(?:took|deducted|advanced)|rate\s+is\s+(?:wrong|off|different|incorrect)|not\s+the\s+(?:agreed\s+)?rate)\b/i

const CLEAR_OK =
  /\b(no\s+advances?(?:\s+or\s+deductions?)?|no\s+deductions?|without\s+(?:any\s+)?(?:advances?|deductions?)|rate\s+(?:is\s+)?(?:correct|good|confirmed)|good\s+to\s+go|\bg2g\b|all\s+clear|nothing\s+to\s+deduct)\b/i

function negated(text: string, word: string): boolean {
  const ahead = new RegExp(
    `\\b(?:no|none|without|zero)\\s+(?:\\w+\\s+){0,4}${word}`,
    'i'
  )
  const labeled = new RegExp(`${word}\\s*(?::|-)?\\s*(?:none|no|zero|n/?a)\\b`, 'i')
  return ahead.test(text) || labeled.test(text)
}

function quote(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const clip = clean.length > 180 ? `${clean.slice(0, 177)}…` : clean
  return ` “${clip}”`
}

/** "Jane Broker <jane@broker.com>" → "Jane Broker (jane@broker.com)". */
export function senderLabel(from: string): string {
  const raw = from.trim()
  if (!raw) return ''
  const named = raw.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>/)
  if (named) {
    const name = named[1].trim()
    const email = named[2].trim()
    if (name && email && name.toLowerCase() !== email.toLowerCase()) return `${name} (${email})`
    return email || name
  }
  return raw
}

/** One line naming who sent the reply, for the invoice note. */
export function replyFromLine(from: string, tone: 'confirmed' | 'rejected' | 'unknown'): string {
  const who = senderLabel(from)
  if (!who) return ''
  if (tone === 'confirmed') return `Confirmed by ${who}.`
  if (tone === 'rejected') return `From ${who}.`
  return `Reply from ${who}.`
}

/** Decide OK, Hold, or unknown from the broker's words. */
export function readRateVerificationReply(
  subject: string,
  body: string,
  confirmedBy?: string
): RateVerificationReading {
  const text = `${subject}\n${body}`.trim()
  const who = confirmedBy?.trim()
  const byOk = who ? ` Confirmed by ${who}.` : ''
  const byHold = who ? ` Reported by ${who}.` : ''
  const byUnknown = who ? ` Reply from ${who}.` : ''
  const mentionsAdvance = /\badvances?\b/i.test(text)
  const mentionsDeduction = /\bdeductions?\b/i.test(text)
  const positiveAdvance = mentionsAdvance && !negated(text, 'advances?')
  const positiveDeduction = mentionsDeduction && !negated(text, 'deductions?')
  const hold = positiveAdvance || positiveDeduction || HARD_HOLD.test(text)

  if (hold) {
    return {
      outcome: 'hold',
      summary: `Broker reported advances or deductions on the rate.${byHold}${quote(body)}`,
    }
  }
  if (CLEAR_OK.test(text)) {
    return {
      outcome: 'ok',
      summary: `Broker confirmed the rate. No advances or deductions.${byOk}${quote(body)}`,
    }
  }
  return {
    outcome: 'unknown',
    summary: `Broker replied to the rate check. Credyx could not tell if there are advances or deductions.${byUnknown}${quote(body)}`,
  }
}
