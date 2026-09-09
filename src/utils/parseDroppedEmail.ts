/**
 * Parse emails dropped from Outlook (.msg / .eml) or as plain text.
 */
export interface ParsedDroppedEmail {
  fromAddress: string
  subject: string
  bodyText: string
  sourceName: string
}

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]

function isOleCompound(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false
  return OLE_MAGIC.every((b, i) => bytes[i] === b)
}

function decodeQuotedPrintable(raw: string): string {
  return raw
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function headerValue(headers: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*(.*(?:\\n[ \\t].*)*)`, 'im')
  const m = headers.match(re)
  if (!m) return ''
  return m[1].replace(/\s+/g, ' ').trim()
}

function emailFromHeader(fromLine: string): string {
  const angle = fromLine.match(/<([^>]+)>/)
  if (angle) return angle[1].trim()
  const bare = fromLine.match(/[\w.+-]+@[\w.-]+\.\w+/)
  return bare?.[0] ?? fromLine.trim()
}

/** Parse RFC822 / .eml (Outlook “Save as”, Apple Mail, new Outlook). */
export function parseEmlString(raw: string, sourceName = 'email.eml'): ParsedDroppedEmail {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const split = normalized.search(/\n\n/)
  const headers = split >= 0 ? normalized.slice(0, split) : normalized
  let body = split >= 0 ? normalized.slice(split + 2) : ''
  const encoding = headerValue(headers, 'Content-Transfer-Encoding').toLowerCase()
  const contentType = headerValue(headers, 'Content-Type').toLowerCase()

  if (encoding.includes('quoted-printable')) body = decodeQuotedPrintable(body)
  if (contentType.includes('text/html') || /<html/i.test(body)) body = htmlToText(body)

  const textPart = body.match(/Content-Type:\s*text\/plain[\s\S]*?\n\n([\s\S]*?)(?=\n--|\nContent-Type:|$)/i)
  if (textPart?.[1]) {
    body = decodeQuotedPrintable(textPart[1]).trim()
  }

  return {
    fromAddress: emailFromHeader(headerValue(headers, 'From')) || 'broker@unknown',
    subject: headerValue(headers, 'Subject') || '(no subject)',
    bodyText: body.trim(),
    sourceName,
  }
}

function extractUtf16Chunks(bytes: Uint8Array): string[] {
  const chunks: string[] = []
  let cur = ''
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8)
    const ok =
      code === 10 ||
      code === 13 ||
      code === 9 ||
      (code >= 32 && code < 0xd800) ||
      (code >= 0xe000 && code <= 0xfffd)
    if (ok) {
      cur += String.fromCharCode(code)
    } else if (cur.length >= 8) {
      chunks.push(cur.trim())
      cur = ''
    } else {
      cur = ''
    }
  }
  if (cur.length >= 8) chunks.push(cur.trim())
  return chunks.filter((s) => s.length >= 8)
}

function parseMsgLoose(bytes: Uint8Array, sourceName: string): ParsedDroppedEmail {
  const chunks = extractUtf16Chunks(bytes)
  const email =
    chunks.map((s) => s.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0]).find(Boolean) || 'broker@unknown'
  const subject =
    chunks.find((s) => /invoice|load|hold|lumper|pod|re:/i.test(s) && s.length < 180) ||
    '(no subject)'
  const body = [...chunks].sort((a, b) => b.length - a.length)[0] || ''
  return { fromAddress: email, subject, bodyText: body, sourceName }
}

async function parseMsgBuffer(buffer: ArrayBuffer, sourceName: string): Promise<ParsedDroppedEmail> {
  try {
    const { default: MsgReader } = await import('@kenjiuno/msgreader')
    const reader = new MsgReader(buffer)
    const file = reader.getFileData() as {
      subject?: string
      senderEmail?: string
      senderName?: string
      body?: string
      bodyHtml?: string
    }
    const body =
      (file.body && file.body.trim()) ||
      (file.bodyHtml ? htmlToText(file.bodyHtml) : '') ||
      ''
    if (body || file.subject) {
      return {
        fromAddress: file.senderEmail || file.senderName || 'broker@unknown',
        subject: file.subject || '(no subject)',
        bodyText: body,
        sourceName,
      }
    }
  } catch {
    /* browser / iconv fallback */
  }
  return parseMsgLoose(new Uint8Array(buffer), sourceName)
}

/** Read a dropped File (.msg, .eml, or Outlook OLE). */
export async function parseDroppedEmailFile(file: File): Promise<ParsedDroppedEmail> {
  const name = file.name || 'outlook-email'
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const lower = name.toLowerCase()

  if (isOleCompound(bytes) || lower.endsWith('.msg')) {
    return parseMsgBuffer(buffer, name)
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  return parseEmlString(text, name)
}

/** Outlook sometimes drops the message as text/html or text/plain instead of a file. */
export function parseDroppedEmailText(plain: string, html: string): ParsedDroppedEmail | null {
  const raw = plain.trim() || (html ? htmlToText(html) : '')
  if (!raw) return null
  if (/^from:\s/im.test(raw) || /^subject:\s/im.test(raw)) {
    return parseEmlString(raw, 'outlook-drop')
  }
  return {
    fromAddress: 'broker@unknown',
    subject: '(dropped email)',
    bodyText: raw,
    sourceName: 'outlook-drop',
  }
}
