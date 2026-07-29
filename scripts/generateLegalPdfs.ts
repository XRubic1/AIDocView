/**
 * Generate branded Credyx legal PDFs from docs/legal/*.md
 * - Header logo + navy/blue palette
 * - Faded center watermark on every page
 *
 * Usage: npx tsx scripts/generateLegalPdfs.ts
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
} from 'pdf-lib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LEGAL_DIR = join(ROOT, 'docs', 'legal')
const OUT_DIR = join(LEGAL_DIR, 'pdf')
const LOGO_PATH = join(ROOT, 'public', 'credyx-logo-black-cred-no-bg.png')

/** Credyx brand palette */
const NAVY = rgb(15 / 255, 42 / 255, 53 / 255) // #0F2A35
const BLUE = rgb(22 / 255, 132 / 255, 254 / 255) // #1684FE
const MUTED = rgb(90 / 255, 110 / 255, 120 / 255)
const BODY = rgb(30 / 255, 45 / 255, 55 / 255)
const RULE = rgb(200 / 255, 214 / 255, 222 / 255)
const WHITE = rgb(1, 1, 1)

const PAGE_W = 612 // Letter
const PAGE_H = 792
const MARGIN_X = 54
const MARGIN_TOP = 78
const MARGIN_BOTTOM = 54
const CONTENT_W = PAGE_W - MARGIN_X * 2

const DOCS: { file: string; outName: string }[] = [
  { file: 'CARRIER_MSA.md', outName: 'Credyx-Carrier-MSA.pdf' },
  { file: 'FEE_SCHEDULE.md', outName: 'Credyx-Fee-Schedule-Exhibit-A.pdf' },
  { file: 'AUTHORIZATION_TO_ACT.md', outName: 'Credyx-Authorization-to-Act-Exhibit-B.pdf' },
  { file: 'PRIVACY_POLICY.md', outName: 'Credyx-Privacy-Policy.pdf' },
  { file: 'WEBSITE_TERMS.md', outName: 'Credyx-Website-Terms.pdf' },
]

type Block =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'li'; text: string }
  | { type: 'note'; text: string }
  | { type: 'spacer' }

/** Strip markdown emphasis / links for plain PDF text. */
function stripMd(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .trim()
}

/** Map characters Helvetica/WinAnsi cannot encode. */
function toWinAnsi(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2610\u25A1]/g, '[ ]') // empty checkbox
    .replace(/[\u2611\u2612]/g, '[x]')
    .replace(/\u2022/g, '-')
    .replace(/\u00B7/g, '|')
    .replace(/[^\x00-\xFF]/g, '?')
}

/** Parse a subset of markdown into layout blocks. */
function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trimEnd()
    i += 1

    if (!line.trim()) {
      blocks.push({ type: 'spacer' })
      continue
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'spacer' })
      continue
    }
    // Skip markdown tables (render as plain lines instead)
    if (line.trim().startsWith('|')) {
      const cells = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue
      blocks.push({ type: 'p', text: cells.join('  ·  ') })
      continue
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: stripMd(line.slice(2)) })
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: stripMd(line.slice(3)) })
      continue
    }
    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: stripMd(line.slice(4)) })
      continue
    }
    if (/^[-*]\s+/.test(line.trim())) {
      blocks.push({ type: 'li', text: stripMd(line.trim().replace(/^[-*]\s+/, '')) })
      continue
    }
    if (line.trim().startsWith('```')) {
      // Skip fenced code blocks but keep inner lines as monospace-ish paragraphs
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        const codeLine = lines[i].trimEnd()
        i += 1
        if (codeLine.trim()) blocks.push({ type: 'note', text: codeLine })
      }
      if (i < lines.length) i += 1
      continue
    }

    // Draft callouts
    if (/draft for attorney/i.test(line) || line.includes('**Draft')) {
      blocks.push({ type: 'note', text: stripMd(line) })
      continue
    }

    blocks.push({ type: 'p', text: stripMd(line) })
  }

  return blocks
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = toWinAnsi(text).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next
    } else {
      if (current) lines.push(current)
      // Hard-break very long tokens
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = ''
        for (const ch of word) {
          const trial = chunk + ch
          if (font.widthOfTextAtSize(trial, size) > maxWidth && chunk) {
            lines.push(chunk)
            chunk = ch
          } else {
            chunk = trial
          }
        }
        current = chunk
      } else {
        current = word
      }
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

interface DocFonts {
  regular: PDFFont
  bold: PDFFont
}

interface PageState {
  doc: PDFDocument
  page: PDFPage
  y: number
  fonts: DocFonts
  logo: PDFImage
  logoDims: { width: number; height: number }
  pageNumber: number
}

function drawHeaderAndWatermark(state: PageState) {
  const { page, logo, logoDims } = state

  // Soft top wash
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 64,
    width: PAGE_W,
    height: 64,
    color: rgb(0.97, 0.98, 0.99),
  })

  // Header logo
  const headerH = 28
  const scale = headerH / logoDims.height
  const headerW = logoDims.width * scale
  page.drawImage(logo, {
    x: MARGIN_X,
    y: PAGE_H - 48,
    width: headerW,
    height: headerH,
  })

  // Brand tagline
  page.drawText('A/R SOLUTIONS', {
    x: MARGIN_X + headerW + 10,
    y: PAGE_H - 38,
    size: 8,
    font: state.fonts.bold,
    color: BLUE,
  })

  // Accent rule
  page.drawRectangle({
    x: MARGIN_X,
    y: PAGE_H - 58,
    width: CONTENT_W,
    height: 2,
    color: BLUE,
  })

  // Center faded watermark
  const wmH = 220
  const wmScale = wmH / logoDims.height
  const wmW = logoDims.width * wmScale
  page.drawImage(logo, {
    x: (PAGE_W - wmW) / 2,
    y: (PAGE_H - wmH) / 2 - 20,
    width: wmW,
    height: wmH,
    opacity: 0.06,
  })
}

function drawFooter(state: PageState) {
  const { page, fonts, pageNumber } = state
  page.drawRectangle({
    x: MARGIN_X,
    y: 36,
    width: CONTENT_W,
    height: 1,
    color: RULE,
  })
  page.drawText(toWinAnsi('Credyx A/R Solutions  ·  Confidential draft'), {
    x: MARGIN_X,
    y: 22,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  })
  const label = `Page ${pageNumber}`
  const w = fonts.regular.widthOfTextAtSize(label, 8)
  page.drawText(label, {
    x: PAGE_W - MARGIN_X - w,
    y: 22,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  })
}

function newPage(state: PageState): void {
  drawFooter(state)
  state.page = state.doc.addPage([PAGE_W, PAGE_H])
  state.pageNumber += 1
  state.y = PAGE_H - MARGIN_TOP
  // White background
  state.page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: PAGE_H,
    color: WHITE,
  })
  drawHeaderAndWatermark(state)
}

function ensureSpace(state: PageState, needed: number) {
  if (state.y - needed < MARGIN_BOTTOM + 16) {
    newPage(state)
  }
}

function drawWrapped(
  state: PageState,
  text: string,
  opts: { size: number; font: PDFFont; color: ReturnType<typeof rgb>; indent?: number; lineGap?: number }
) {
  const indent = opts.indent ?? 0
  const lineGap = opts.lineGap ?? 3
  const maxW = CONTENT_W - indent
  const lines = wrapText(text, opts.font, opts.size, maxW)
  const lineHeight = opts.size + lineGap

  for (const line of lines) {
    ensureSpace(state, lineHeight)
    state.page.drawText(line, {
      x: MARGIN_X + indent,
      y: state.y - opts.size,
      size: opts.size,
      font: opts.font,
      color: opts.color,
    })
    state.y -= lineHeight
  }
}

async function buildPdf(mdPath: string, outPath: string, logoBytes: Uint8Array) {
  const md = readFileSync(mdPath, 'utf8')
  const blocks = parseMarkdown(md)

  const doc = await PDFDocument.create()
  const fonts: DocFonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  const logo = await doc.embedPng(logoBytes)
  const logoDims = { width: logo.width, height: logo.height }

  const page = doc.addPage([PAGE_W, PAGE_H])
  const state: PageState = {
    doc,
    page,
    y: PAGE_H - MARGIN_TOP,
    fonts,
    logo,
    logoDims,
    pageNumber: 1,
  }

  state.page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: PAGE_H,
    color: WHITE,
  })
  drawHeaderAndWatermark(state)

  for (const block of blocks) {
    if (block.type === 'spacer') {
      state.y -= 8
      continue
    }
    if (block.type === 'h1') {
      ensureSpace(state, 36)
      state.y -= 6
      drawWrapped(state, block.text, {
        size: 18,
        font: fonts.bold,
        color: NAVY,
        lineGap: 4,
      })
      state.page.drawRectangle({
        x: MARGIN_X,
        y: state.y + 2,
        width: 72,
        height: 3,
        color: BLUE,
      })
      state.y -= 14
      continue
    }
    if (block.type === 'h2') {
      ensureSpace(state, 28)
      state.y -= 10
      drawWrapped(state, block.text, {
        size: 12,
        font: fonts.bold,
        color: NAVY,
        lineGap: 3,
      })
      state.y -= 4
      continue
    }
    if (block.type === 'h3') {
      ensureSpace(state, 22)
      state.y -= 6
      drawWrapped(state, block.text, {
        size: 10.5,
        font: fonts.bold,
        color: BLUE,
        lineGap: 3,
      })
      state.y -= 2
      continue
    }
    if (block.type === 'note') {
      ensureSpace(state, 24)
      // Soft blue callout bar
      const noteLines = wrapText(block.text, fonts.regular, 9, CONTENT_W - 16)
      const boxH = noteLines.length * 12 + 12
      ensureSpace(state, boxH)
      state.page.drawRectangle({
        x: MARGIN_X,
        y: state.y - boxH,
        width: CONTENT_W,
        height: boxH,
        color: rgb(0.93, 0.96, 1),
        borderColor: BLUE,
        borderWidth: 0.75,
      })
      let ny = state.y - 10
      for (const nl of noteLines) {
        state.page.drawText(nl, {
          x: MARGIN_X + 8,
          y: ny - 9,
          size: 9,
          font: fonts.regular,
          color: NAVY,
        })
        ny -= 12
      }
      state.y -= boxH + 8
      continue
    }
    if (block.type === 'li') {
      ensureSpace(state, 14)
      state.page.drawText('-', {
        x: MARGIN_X + 4,
        y: state.y - 10,
        size: 10,
        font: fonts.regular,
        color: BLUE,
      })
      drawWrapped(state, block.text, {
        size: 10,
        font: fonts.regular,
        color: BODY,
        indent: 16,
        lineGap: 3,
      })
      state.y -= 2
      continue
    }
    // paragraph
    drawWrapped(state, block.text, {
      size: 10,
      font: fonts.regular,
      color: BODY,
      lineGap: 3,
    })
    state.y -= 4
  }

  drawFooter(state)

  const bytes = await doc.save()
  try {
    writeFileSync(outPath, bytes)
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
  return outPath
}

async function main() {
  if (!existsSync(LOGO_PATH)) {
    throw new Error(`Logo not found: ${LOGO_PATH}`)
  }
  mkdirSync(OUT_DIR, { recursive: true })
  const logoBytes = new Uint8Array(readFileSync(LOGO_PATH))

  console.log('Generating Credyx legal PDFs…')
  for (const item of DOCS) {
    const mdPath = join(LEGAL_DIR, item.file)
    if (!existsSync(mdPath)) {
      console.warn(`  skip missing ${item.file}`)
      continue
    }
    const outPath = join(OUT_DIR, item.outName)
    await buildPdf(mdPath, outPath, logoBytes)
    console.log(`  ✓ ${item.outName}`)
  }
  console.log(`Done → ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
