/**
 * Generate branded Credyx sales PDFs from docs/sales/*.md
 * - Caller sheet + pay/forecast
 * - Header logo + navy/blue palette, faded watermark (same look as legal PDFs)
 * - Real table rendering, script boxes (fenced code), callouts (blockquotes), inline bold
 *
 * Usage: npm run sales:pdf   (or: npx tsx scripts/generateSalesPlaybookPdf.ts)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'pdf-lib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'docs', 'sales', 'pdf')
const LOGO_PATH = join(ROOT, 'public', 'credyx-logo-black-cred-no-bg.png')

const SALES_DOCS: {
  file: string
  outName: string
  title: string
  subject: string
  headerTag: string
}[] = [
  {
    file: 'CREDYX_SALES_CALL_SHEET.md',
    outName: 'Credyx-Sales-Call-Sheet.pdf',
    title: 'Credyx Sales Caller Sheet',
    subject: 'How to approach carriers: script, pricing, objections',
    headerTag: 'CALLER SHEET  ·  INTERNAL',
  },
  {
    file: 'CREDYX_SALES_COMP_PLAN.md',
    outName: 'Credyx-Sales-Pay-and-Forecast.pdf',
    title: 'Credyx Sales Pay and Year-1 Forecast',
    subject: 'Commission-only plan: 40% of Credyx fees on first 20 clients',
    headerTag: 'PAY + FORECAST  ·  INTERNAL',
  },
]

/** Credyx brand palette */
const NAVY = rgb(15 / 255, 42 / 255, 53 / 255)
const BLUE = rgb(22 / 255, 132 / 255, 254 / 255)
const BLUE_SOFT = rgb(0.93, 0.96, 1)
const MUTED = rgb(90 / 255, 110 / 255, 120 / 255)
const BODY = rgb(30 / 255, 45 / 255, 55 / 255)
const RULE = rgb(200 / 255, 214 / 255, 222 / 255)
const ROW_ALT = rgb(0.972, 0.98, 0.988)
const WHITE = rgb(1, 1, 1)

const PAGE_W = 612 // Letter
const PAGE_H = 792
const MARGIN_X = 54
const MARGIN_TOP = 72
const MARGIN_BOTTOM = 48
const CONTENT_W = PAGE_W - MARGIN_X * 2

type Block =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'h4'; text: string }
  | { type: 'p'; text: string }
  | { type: 'li'; text: string; ordered?: string }
  | { type: 'quote'; text: string }
  | { type: 'script'; lines: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'tagline'; text: string }
  | { type: 'hr' }
  | { type: 'spacer' }

/** Map characters Helvetica/WinAnsi cannot encode. */
function toWinAnsi(text: string): string {
  return text
    .replace(/\u2192/g, '->')
    .replace(/\u2248/g, '~')
    .replace(/\u2713|\u2714/g, 'v')
    .replace(/\u2717|\u2718/g, 'x')
    .replace(/[\u2610\u25A1]/g, '[ ]')
    .replace(/[\u2611\u2612]/g, '[x]')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x00-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, '?')
}

/** Strip links / code ticks / italics but keep ** markers for rich rendering. */
function cleanInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .trim()
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((c) => c.trim())
}

/** Parse the markdown subset used by the playbook into layout blocks. */
function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trimEnd()
    i += 1

    if (!line.trim()) {
      blocks.push({ type: 'spacer' })
      continue
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      continue
    }
    if (line.trim().startsWith('```')) {
      const body: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i].trimEnd())
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push({ type: 'script', lines: body })
      continue
    }
    if (line.trim().startsWith('|')) {
      const header = splitTableRow(line)
      const rows: string[][] = []
      // separator row
      if (i < lines.length && /^\s*\|?\s*:?-+/.test(lines[i])) i += 1
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[i]))
        i += 1
      }
      blocks.push({ type: 'table', header: header.map(cleanInline), rows: rows.map((r) => r.map(cleanInline)) })
      continue
    }
    if (line.startsWith('#### ')) {
      blocks.push({ type: 'h4', text: cleanInline(line.slice(5)) })
      continue
    }
    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: cleanInline(line.slice(4)) })
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: cleanInline(line.slice(3)) })
      continue
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: cleanInline(line.slice(2)) })
      continue
    }
    if (line.trim().startsWith('> ')) {
      blocks.push({ type: 'quote', text: cleanInline(line.trim().slice(2)) })
      continue
    }
    if (/^\*[^*].*[^*]\*$/.test(line.trim())) {
      blocks.push({ type: 'tagline', text: line.trim().slice(1, -1) })
      continue
    }
    const ol = line.trim().match(/^(\d+)\.\s+(.*)$/)
    if (ol) {
      blocks.push({ type: 'li', text: cleanInline(ol[2]), ordered: `${ol[1]}.` })
      continue
    }
    if (/^[-*]\s+/.test(line.trim())) {
      blocks.push({ type: 'li', text: cleanInline(line.trim().replace(/^[-*]\s+/, '')) })
      continue
    }
    blocks.push({ type: 'p', text: cleanInline(line) })
  }

  return blocks
}

// ---------- Rich text (inline bold) ----------

interface Run {
  text: string
  bold: boolean
}

/** Split "a **b** c" into runs. */
function toRuns(text: string): Run[] {
  const runs: Run[] = []
  const parts = toWinAnsi(text).split(/\*\*/)
  parts.forEach((part, idx) => {
    if (part) runs.push({ text: part, bold: idx % 2 === 1 })
  })
  return runs
}

interface Word {
  text: string
  bold: boolean
}

function toWords(runs: Run[]): Word[] {
  const words: Word[] = []
  for (const run of runs) {
    const tokens = run.text.split(/(\s+)/)
    for (const tok of tokens) {
      if (!tok) continue
      if (/^\s+$/.test(tok)) {
        // mark a space boundary by appending to previous word
        if (words.length) words[words.length - 1].text += ' '
        continue
      }
      // Glue to previous word if no space separated them (e.g. "**bold**," -> "bold,")
      const prev = words[words.length - 1]
      if (prev && !prev.text.endsWith(' ') && prev.bold === run.bold) {
        prev.text += tok
      } else if (prev && !prev.text.endsWith(' ')) {
        words.push({ text: tok, bold: run.bold })
        // mark as glued: handled during layout by zero-width join (see layoutWords)
        ;(words[words.length - 1] as Word & { glued?: boolean }).glued = true
      } else {
        words.push({ text: tok, bold: run.bold })
      }
    }
  }
  return words
}

interface Segment {
  text: string
  bold: boolean
}
type RichLine = Segment[]

function measure(seg: Segment, fonts: DocFonts, size: number): number {
  const f = seg.bold ? fonts.bold : fonts.regular
  return f.widthOfTextAtSize(seg.text, size)
}

/** Word-wrap rich runs into lines of segments. */
function layoutRich(text: string, fonts: DocFonts, size: number, maxW: number): RichLine[] {
  const words = toWords(toRuns(text)) as (Word & { glued?: boolean })[]
  const lines: RichLine[] = []
  let current: RichLine = []
  let currentW = 0

  const pushSeg = (seg: Segment) => {
    const last = current[current.length - 1]
    if (last && last.bold === seg.bold) last.text += seg.text
    else current.push({ ...seg })
  }

  for (const w of words) {
    const segW = measure({ text: w.text, bold: w.bold }, fonts, size)
    if (current.length && !w.glued && currentW + segW > maxW) {
      // trim trailing space width
      lines.push(current)
      current = []
      currentW = 0
    }
    // hard-break very long tokens
    if (segW > maxW) {
      let chunk = ''
      for (const ch of w.text) {
        const trial = chunk + ch
        if (measure({ text: trial, bold: w.bold }, fonts, size) > maxW && chunk) {
          pushSeg({ text: chunk, bold: w.bold })
          lines.push(current)
          current = []
          currentW = 0
          chunk = ch
        } else chunk = trial
      }
      pushSeg({ text: chunk, bold: w.bold })
      currentW += measure({ text: chunk, bold: w.bold }, fonts, size)
      continue
    }
    pushSeg({ text: w.text, bold: w.bold })
    currentW += segW
  }
  if (current.length) lines.push(current)
  // strip trailing spaces on line ends
  for (const l of lines) {
    const last = l[l.length - 1]
    if (last) last.text = last.text.replace(/\s+$/, '')
  }
  return lines.length ? lines : [[{ text: '', bold: false }]]
}

function richLinesHeight(lines: RichLine[], size: number, gap: number): number {
  return lines.length * (size + gap)
}

// ---------- Page state ----------

interface DocFonts {
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
}

interface PageState {
  doc: PDFDocument
  page: PDFPage
  y: number
  fonts: DocFonts
  logo: PDFImage
  logoDims: { width: number; height: number }
  pageNumber: number
  headerTag: string
}

function drawHeaderAndWatermark(state: PageState) {
  const { page, logo, logoDims } = state
  page.drawRectangle({ x: 0, y: PAGE_H - 64, width: PAGE_W, height: 64, color: rgb(0.97, 0.98, 0.99) })

  const headerH = 28
  const scale = headerH / logoDims.height
  const headerW = logoDims.width * scale
  page.drawImage(logo, { x: MARGIN_X, y: PAGE_H - 48, width: headerW, height: headerH })
  page.drawText('A/R SOLUTIONS', {
    x: MARGIN_X + headerW + 10,
    y: PAGE_H - 38,
    size: 8,
    font: state.fonts.bold,
    color: BLUE,
  })
  const tag = state.headerTag
  const tagW = state.fonts.bold.widthOfTextAtSize(tag, 8)
  page.drawText(toWinAnsi(tag), {
    x: PAGE_W - MARGIN_X - tagW,
    y: PAGE_H - 38,
    size: 8,
    font: state.fonts.bold,
    color: MUTED,
  })
  page.drawRectangle({ x: MARGIN_X, y: PAGE_H - 58, width: CONTENT_W, height: 2, color: BLUE })

  const wmH = 220
  const wmScale = wmH / logoDims.height
  const wmW = logoDims.width * wmScale
  page.drawImage(logo, {
    x: (PAGE_W - wmW) / 2,
    y: (PAGE_H - wmH) / 2 - 20,
    width: wmW,
    height: wmH,
    opacity: 0.05,
  })
}

function drawFooter(state: PageState) {
  const { page, fonts, pageNumber } = state
  page.drawRectangle({ x: MARGIN_X, y: 36, width: CONTENT_W, height: 1, color: RULE })
  page.drawText(toWinAnsi('Credyx A/R Solutions  ·  Internal caller sheet  ·  Not factoring'), {
    x: MARGIN_X,
    y: 22,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  })
  const label = `Page ${pageNumber}`
  const w = fonts.regular.widthOfTextAtSize(label, 8)
  page.drawText(label, { x: PAGE_W - MARGIN_X - w, y: 22, size: 8, font: fonts.regular, color: MUTED })
}

function startPage(state: PageState): void {
  state.page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE })
  drawHeaderAndWatermark(state)
}

function newPage(state: PageState): void {
  drawFooter(state)
  state.page = state.doc.addPage([PAGE_W, PAGE_H])
  state.pageNumber += 1
  state.y = PAGE_H - MARGIN_TOP
  startPage(state)
}

function ensureSpace(state: PageState, needed: number) {
  if (state.y - needed < MARGIN_BOTTOM + 16) newPage(state)
}

function drawRichLine(state: PageState, line: RichLine, x: number, y: number, size: number, color: RGB) {
  let cx = x
  for (const seg of line) {
    const font = seg.bold ? state.fonts.bold : state.fonts.regular
    state.page.drawText(seg.text, { x: cx, y, size, font, color })
    cx += font.widthOfTextAtSize(seg.text, size)
  }
}

function drawRich(
  state: PageState,
  text: string,
  opts: { size: number; color: RGB; indent?: number; lineGap?: number; maxW?: number }
) {
  const indent = opts.indent ?? 0
  const lineGap = opts.lineGap ?? 3.5
  const maxW = opts.maxW ?? CONTENT_W - indent
  const lines = layoutRich(text, state.fonts, opts.size, maxW)
  const lh = opts.size + lineGap
  for (const line of lines) {
    ensureSpace(state, lh)
    drawRichLine(state, line, MARGIN_X + indent, state.y - opts.size, opts.size, opts.color)
    state.y -= lh
  }
}

function drawHeading(
  state: PageState,
  text: string,
  size: number,
  color: RGB,
  font: PDFFont,
  before: number,
  after: number,
  keepWith = 48
) {
  // Keep headings with at least a few lines of the content that follows
  ensureSpace(state, size * 3 + before + keepWith)
  state.y -= before
  const lines = layoutRich(`**${text}**`, state.fonts, size, CONTENT_W)
  for (const line of lines) {
    state.page.drawText(line.map((s) => s.text).join(''), {
      x: MARGIN_X,
      y: state.y - size,
      size,
      font,
      color,
    })
    state.y -= size + 4
  }
  state.y -= after
}

// ---------- Tables ----------

const TABLE_FONT = 8.2
const TABLE_GAP = 2.2
const CELL_PAD_X = 5
const CELL_PAD_Y = 3.5

function computeColumnWidths(header: string[], rows: string[][], fonts: DocFonts): number[] {
  const cols = header.length
  const natural: number[] = new Array(cols).fill(0)
  const all = [header, ...rows]
  for (const row of all) {
    row.forEach((cell, c) => {
      if (c >= cols) return
      // natural width: longest single word plus a share of the total text length
      const plain = toWinAnsi(cell.replace(/\*\*/g, ''))
      const longestWord = Math.max(0, ...plain.split(/\s+/).map((w) => fonts.bold.widthOfTextAtSize(w, TABLE_FONT)))
      const total = fonts.regular.widthOfTextAtSize(plain, TABLE_FONT)
      // favour proportional share but ensure long words fit
      natural[c] = Math.max(natural[c], Math.min(total, 260), longestWord + CELL_PAD_X * 2)
    })
  }
  const sum = natural.reduce((a, b) => a + b, 0) || 1
  const minW = 60
  let widths = natural.map((w) => Math.max(minW, (w / sum) * CONTENT_W))
  // normalise to CONTENT_W
  const total = widths.reduce((a, b) => a + b, 0)
  widths = widths.map((w) => (w / total) * CONTENT_W)
  return widths
}

function drawTable(state: PageState, header: string[], rows: string[][]) {
  const widths = computeColumnWidths(header, rows, state.fonts)
  const lh = TABLE_FONT + TABLE_GAP

  const layoutRow = (cells: string[], boldAll: boolean) => {
    const laid = widths.map((w, c) => {
      const text = cells[c] ?? ''
      return layoutRich(boldAll ? `**${text.replace(/\*\*/g, '')}**` : text, state.fonts, TABLE_FONT, w - CELL_PAD_X * 2)
    })
    const h = Math.max(...laid.map((l) => richLinesHeight(l, TABLE_FONT, TABLE_GAP))) + CELL_PAD_Y * 2
    return { laid, h }
  }

  const drawRow = (laid: RichLine[][], h: number, fill: RGB | null, textColor: RGB) => {
    const top = state.y
    if (fill) state.page.drawRectangle({ x: MARGIN_X, y: top - h, width: CONTENT_W, height: h, color: fill })
    let x = MARGIN_X
    laid.forEach((lines, c) => {
      let y = top - CELL_PAD_Y - TABLE_FONT
      for (const line of lines) {
        drawRichLine(state, line, x + CELL_PAD_X, y, TABLE_FONT, textColor)
        y -= lh
      }
      x += widths[c]
    })
    // bottom rule
    state.page.drawRectangle({ x: MARGIN_X, y: top - h, width: CONTENT_W, height: 0.6, color: RULE })
    state.y -= h
  }

  const head = layoutRow(header, true)
  const hasHeader = header.some((h) => h.trim().length > 0)

  const drawHeader = () => {
    if (!hasHeader) return
    drawRow(head.laid, head.h, NAVY, WHITE)
  }

  state.y -= 4
  // Never orphan the header: require room for header + first body row
  const firstRowH = rows.length ? layoutRow(rows[0], false).h : 0
  ensureSpace(state, head.h + firstRowH + 8)
  drawHeader()

  rows.forEach((row, idx) => {
    const { laid, h } = layoutRow(row, false)
    if (state.y - h < MARGIN_BOTTOM + 16) {
      newPage(state)
      drawHeader()
    }
    drawRow(laid, h, idx % 2 === 1 ? ROW_ALT : null, BODY)
  })
  state.y -= 6
}

// ---------- Boxes ----------

function drawScriptBox(state: PageState, lines: string[]) {
  const size = 9
  const gap = 2.6
  const padX = 10
  const padY = 6
  const label = 'SAY THIS'
  const laid = lines.map((l) => (l.trim() ? layoutRich(l, state.fonts, size, CONTENT_W - padX * 2 - 6) : null))
  const textH = laid.reduce((acc, l) => acc + (l ? richLinesHeight(l, size, gap) + 2 : 6), 0)
  const boxH = textH + padY * 2 + 12

  ensureSpace(state, Math.min(boxH, 200))
  if (state.y - boxH < MARGIN_BOTTOM + 16 && boxH < PAGE_H - MARGIN_TOP - MARGIN_BOTTOM - 40) newPage(state)

  const top = state.y
  state.page.drawRectangle({ x: MARGIN_X, y: top - boxH, width: CONTENT_W, height: boxH, color: rgb(0.965, 0.975, 0.99) })
  state.page.drawRectangle({ x: MARGIN_X, y: top - boxH, width: 3, height: boxH, color: BLUE })
  state.page.drawText(label, { x: MARGIN_X + padX, y: top - padY - 6, size: 6.5, font: state.fonts.bold, color: BLUE })

  let y = top - padY - 12 - size
  for (const l of laid) {
    if (!l) {
      y -= 6
      continue
    }
    for (const line of l) {
      drawRichLine(state, line, MARGIN_X + padX + 3, y, size, NAVY)
      y -= size + gap
    }
    y -= 2
  }
  state.y -= boxH + 5
}

function drawQuote(state: PageState, text: string) {
  const size = 9.2
  const gap = 3.2
  const laid = layoutRich(text, state.fonts, size, CONTENT_W - 24)
  const boxH = richLinesHeight(laid, size, gap) + 16
  ensureSpace(state, boxH)
  const top = state.y
  state.page.drawRectangle({
    x: MARGIN_X,
    y: top - boxH,
    width: CONTENT_W,
    height: boxH,
    color: BLUE_SOFT,
    borderColor: BLUE,
    borderWidth: 0.6,
  })
  let y = top - 8 - size
  for (const line of laid) {
    drawRichLine(state, line, MARGIN_X + 12, y, size, NAVY)
    y -= size + gap
  }
  state.y -= boxH + 5
}

/** How much room a heading must keep with the block that follows it (tables/boxes need more). */
function keepWithNext(blocks: Block[], idx: number): number {
  let j = idx + 1
  while (j < blocks.length && (blocks[j].type === 'spacer' || blocks[j].type === 'hr')) j += 1
  const next = blocks[j]
  if (!next) return 0
  if (next.type === 'table') return 90
  if (next.type === 'script' || next.type === 'quote') return 70
  if (next.type === 'h3' || next.type === 'h4') return 80
  return 36
}

// ---------- Build ----------

async function buildOne(
  spec: (typeof SALES_DOCS)[number],
  logoBytes: Uint8Array
): Promise<string> {
  const mdPath = join(ROOT, 'docs', 'sales', spec.file)
  const outPath = join(OUT_DIR, spec.outName)
  if (!existsSync(mdPath)) throw new Error(`Source not found: ${mdPath}`)

  const md = readFileSync(mdPath, 'utf8')
  const blocks = parseMarkdown(md)

  const doc = await PDFDocument.create()
  doc.setTitle(spec.title)
  doc.setAuthor('Credyx A/R Solutions')
  doc.setSubject(spec.subject)
  const fonts: DocFonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  }
  const logo = await doc.embedPng(logoBytes)
  const logoDims = { width: logo.width, height: logo.height }

  const state: PageState = {
    doc,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN_TOP,
    fonts,
    logo,
    logoDims,
    pageNumber: 1,
    headerTag: spec.headerTag,
  }
  startPage(state)

  let seenH1 = false
  let subtitleDone = false
  let lastWasSpacer = false

  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx]

    if (block.type === 'spacer') {
      if (!lastWasSpacer) state.y -= 3
      lastWasSpacer = true
      continue
    }
    lastWasSpacer = false

    switch (block.type) {
      case 'h1': {
        seenH1 = true
        state.y -= 8
        drawRich(state, `**${block.text}**`, { size: 20, color: NAVY, lineGap: 4 })
        state.page.drawRectangle({ x: MARGIN_X, y: state.y - 2, width: 72, height: 3, color: BLUE })
        state.y -= 10
        break
      }
      case 'h2': {
        // Section headings stay with the block that follows
        ensureSpace(state, keepWithNext(blocks, idx) + 28)
        state.y -= 6
        state.page.drawRectangle({ x: MARGIN_X, y: state.y, width: CONTENT_W, height: 0.7, color: RULE })
        state.y -= 8
        drawRich(state, `**${block.text}**`, { size: 13, color: NAVY, lineGap: 3 })
        state.y -= 3
        break
      }
      case 'h3': {
        drawHeading(state, block.text, 12, NAVY, fonts.bold, 10, 3, keepWithNext(blocks, idx))
        break
      }
      case 'h4': {
        drawHeading(state, block.text, 10.4, BLUE, fonts.bold, 6, 1, keepWithNext(blocks, idx))
        break
      }
      case 'hr': {
        state.y -= 6
        break
      }
      case 'p': {
        // Cover subtitle + meta line styling
        if (seenH1 && !subtitleDone && /^\*\*/.test(block.text)) {
          subtitleDone = true
          drawRich(state, block.text, { size: 10.5, color: BLUE, lineGap: 3 })
          state.y -= 2
          break
        }
        if (seenH1 && subtitleDone && /^Internal/.test(block.text)) {
          state.page.drawText(toWinAnsi(block.text), {
            x: MARGIN_X,
            y: state.y - 9,
            size: 9,
            font: fonts.regular,
            color: MUTED,
          })
          state.y -= 20
          break
        }
        drawRich(state, block.text, { size: 9.4, color: BODY, lineGap: 2.8 })
        state.y -= 2
        break
      }
      case 'tagline': {
        ensureSpace(state, 30)
        state.y -= 10
        state.page.drawText(toWinAnsi(block.text), {
          x: MARGIN_X,
          y: state.y - 10,
          size: 10.5,
          font: fonts.italic,
          color: BLUE,
        })
        state.y -= 16
        break
      }
      case 'li': {
        ensureSpace(state, 14)
        const marker = block.ordered ?? '•'
        const markerFont = block.ordered ? fonts.bold : fonts.regular
        state.page.drawText(toWinAnsi(marker), {
          x: MARGIN_X + (block.ordered ? 4 : 6),
          y: state.y - 10,
          size: 10,
          font: markerFont,
          color: BLUE,
        })
        drawRich(state, block.text, { size: 10, color: BODY, indent: block.ordered ? 20 : 18 })
        state.y -= 2.5
        break
      }
      case 'quote': {
        drawQuote(state, block.text)
        break
      }
      case 'script': {
        drawScriptBox(state, block.lines)
        break
      }
      case 'table': {
        drawTable(state, block.header, block.rows)
        break
      }
    }
  }

  drawFooter(state)
  const bytes = await doc.save()
  try {
    writeFileSync(outPath, bytes)
    return outPath
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : ''
    if (code === 'EBUSY' || code === 'EPERM') {
      const alt = outPath.replace(/\.pdf$/i, '.new.pdf')
      writeFileSync(alt, bytes)
      console.warn(`  ! locked, wrote ${alt} instead — close the open PDF and re-run`)
      return alt
    }
    throw err
  }
}

async function main() {
  if (!existsSync(LOGO_PATH)) throw new Error(`Logo not found: ${LOGO_PATH}`)
  mkdirSync(OUT_DIR, { recursive: true })
  const logoBytes = new Uint8Array(readFileSync(LOGO_PATH))
  for (const spec of SALES_DOCS) {
    const out = await buildOne(spec, logoBytes)
    console.log(`✓ ${spec.outName} → ${out}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
