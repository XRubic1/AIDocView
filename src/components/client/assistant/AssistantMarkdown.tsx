import type { ReactNode } from 'react'

/**
 * Lightweight Markdown for Assistant bubbles (no extra dependency).
 * Supports: paragraphs, line breaks, **bold**, lists, clickable invoice refs.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** True when text looks like an invoice / load reference number. */
function looksLikeInvoiceRef(raw: string): boolean {
  const t = raw.trim().replace(/^#/, '')
  return /^\d{3,}[A-Za-z0-9-]*$/.test(t)
}

/** List row like `**64830**: $2140` or `#64830 — hold` or `**1260** · $250 · Approved`. */
function parseInvoiceListItem(
  item: string
): { invoiceNumber: string; rest: string } | null {
  const bold = item.match(
    /^\*\*(#?\d{3,}[A-Za-z0-9-]*)\*\*\s*[:：·\-—]?\s*(.*)$/
  )
  if (bold) {
    return {
      invoiceNumber: bold[1].replace(/^#/, ''),
      rest: bold[2].trim().replace(/^[·\-—:：]\s*/, ''),
    }
  }
  const hash = item.match(/^#(\d{3,}[A-Za-z0-9-]*)\s*[:：·\-—]?\s*(.*)$/)
  if (hash) {
    return {
      invoiceNumber: hash[1],
      rest: hash[2].trim().replace(/^[·\-—:：]\s*/, ''),
    }
  }
  const labeled = item.match(
    /^(?:invoice|inv)\s*#?\s*(\d{3,}[A-Za-z0-9-]*)\s*[:：·\-—]?\s*(.*)$/i
  )
  if (labeled) {
    return {
      invoiceNumber: labeled[1],
      rest: labeled[2].trim().replace(/^[·\-—:：]\s*/, ''),
    }
  }
  return null
}

type InlineHandler = (invoiceNumber: string) => void

/**
 * Render inline markdown with invoice numbers as buttons.
 * Works on raw (unescaped) text so we can keep ** markers for parsing.
 */
function renderInline(raw: string, onOpenInvoice?: InlineHandler): ReactNode[] {
  const parts: ReactNode[] = []
  // Bold segments OR bare #1234 / Invoice 1234
  const re =
    /\*\*(.+?)\*\*|#(\d{3,}[A-Za-z0-9-]*)|\b(?:invoice|inv)\s*#?\s*(\d{3,}[A-Za-z0-9-]*)\b/gi
  let last = 0
  let match: RegExpExecArray | null
  let key = 0

  const pushText = (text: string) => {
    if (!text) return
    parts.push(escapeHtml(text))
  }

  const pushInvoiceBtn = (num: string, label: string, bold = false) => {
    if (!onOpenInvoice || !looksLikeInvoiceRef(num)) {
      parts.push(
        bold ? (
          <strong key={`b-${key++}`}>{escapeHtml(label)}</strong>
        ) : (
          escapeHtml(label)
        )
      )
      return
    }
    parts.push(
      <button
        key={`inv-${key++}`}
        type="button"
        className={`assistant-md__inv-link${bold ? ' assistant-md__inv-link--bold' : ''}`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onOpenInvoice(num.replace(/^#/, ''))
        }}
      >
        {label}
      </button>
    )
  }

  while ((match = re.exec(raw)) !== null) {
    if (match.index > last) pushText(raw.slice(last, match.index))

    if (match[1] != null) {
      const boldInner = match[1]
      if (looksLikeInvoiceRef(boldInner)) {
        pushInvoiceBtn(boldInner, boldInner.replace(/^#/, ''), true)
      } else {
        parts.push(<strong key={`b-${key++}`}>{escapeHtml(boldInner)}</strong>)
      }
    } else if (match[2] != null) {
      pushInvoiceBtn(match[2], `#${match[2]}`)
    } else if (match[3] != null) {
      pushInvoiceBtn(match[3], match[0])
    }

    last = match.index + match[0].length
  }
  if (last < raw.length) pushText(raw.slice(last))
  return parts
}

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }

function parseBlocks(text: string): Block[] {
  // Coalesce ugly model output like "#1260\n$250 — Approved" into one line.
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(
      /(?:^|\n)(?:[-*•]\s*)?#(\d{3,}[A-Za-z0-9-]*)\s*\n+\s*(\$?[\d,]+\.?\d*)/g,
      '\n- **$1** · $2'
    )
  const lines = normalized.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    if (!trimmed) {
      i += 1
      continue
    }

    // Bare "#1260 $250 — Approved" (no bullet) → treat as a list item.
    const bareInvoice = trimmed.match(
      /^#(\d{3,}[A-Za-z0-9-]*)\s+(.+)$/
    )
    if (bareInvoice) {
      const items: string[] = []
      while (i < lines.length) {
        const t = lines[i].trim()
        const m = t.match(/^#(\d{3,}[A-Za-z0-9-]*)\s+(.+)$/)
        if (!m) break
        items.push(`**${m[1]}** · ${m[2]}`)
        i += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    const bullet = trimmed.match(/^[-*•]\s+(.+)$/)
    if (bullet) {
      const items: string[] = []
      while (i < lines.length) {
        const t = lines[i].trim()
        const m = t.match(/^[-*•]\s+(.+)$/)
        if (!m) break
        items.push(m[1])
        i += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/)
    if (numbered) {
      const items: string[] = []
      while (i < lines.length) {
        const t = lines[i].trim()
        const m = t.match(/^\d+[.)]\s+(.+)$/)
        if (!m) break
        items.push(m[1])
        i += 1
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    const paraLines: string[] = [trimmed]
    i += 1
    while (i < lines.length) {
      const t = lines[i].trim()
      if (!t) break
      if (/^[-*•]\s+/.test(t) || /^\d+[.)]\s+/.test(t) || /^#\d{3,}/.test(t)) break
      paraLines.push(t)
      i += 1
    }
    blocks.push({ type: 'p', lines: paraLines })
  }

  return blocks
}

interface AssistantMarkdownProps {
  text: string
  className?: string
  /** Open invoice by number (or id-like token) when a ref is clicked. */
  onOpenInvoice?: (invoiceNumber: string) => void
}

/** Render assistant reply text with simple Markdown + invoice deep-links. */
export default function AssistantMarkdown({
  text,
  className,
  onOpenInvoice,
}: AssistantMarkdownProps) {
  const blocks = parseBlocks(text.trim())
  if (blocks.length === 0) return null

  const renderListItem = (item: string, j: number) => {
    const parsed = onOpenInvoice ? parseInvoiceListItem(item) : null
    if (parsed && onOpenInvoice) {
      return (
        <li key={j} className="assistant-md__li--invoice">
          <button
            type="button"
            className="assistant-md__inv-chip"
            onClick={() => onOpenInvoice(parsed.invoiceNumber)}
          >
            <span className="assistant-md__inv-chip-num">#{parsed.invoiceNumber}</span>
            {parsed.rest ? (
              <span className="assistant-md__inv-chip-rest">{parsed.rest}</span>
            ) : null}
          </button>
        </li>
      )
    }
    return <li key={j}>{renderInline(item, onOpenInvoice)}</li>
  }

  return (
    <div className={className ? `assistant-md ${className}` : 'assistant-md'}>
      {blocks.map((block, idx) => {
        if (block.type === 'ul') {
          return (
            <ul key={idx} className="assistant-md__list">
              {block.items.map((item, j) => renderListItem(item, j))}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={idx} className="assistant-md__list assistant-md__list--ol">
              {block.items.map((item, j) => renderListItem(item, j))}
            </ol>
          )
        }
        return (
          <p key={idx} className="assistant-md__p">
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 ? <br /> : null}
                {renderInline(line, onOpenInvoice)}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
