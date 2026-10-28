/**
 * Post-build SEO step: writes a prerendered /free-broker-mc-check page (real <title>, meta, JSON-LD and
 * body copy in the HTML), plus robots.txt and sitemap.xml, into dist/. Vercel serves real files before
 * the SPA rewrite, so crawlers get the content without running JavaScript.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MC_CHECK_DESCRIPTION,
  MC_CHECK_FAQS,
  MC_CHECK_H1,
  MC_CHECK_LEAD,
  MC_CHECK_PATH,
  MC_CHECK_SECTIONS,
  MC_CHECK_TITLE,
  MC_CHECK_URL,
  SITE_URL,
  buildMcCheckJsonLd,
} from '../src/seo/mcCheckSeo'

const dist = join(process.cwd(), 'dist')

const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function bodyHtml(): string {
  const sections = MC_CHECK_SECTIONS.map(
    (s) =>
      `<h2>${esc(s.heading)}</h2>` +
      (s.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join('') +
      (s.bullets ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '')
  ).join('')
  const faqs = MC_CHECK_FAQS.map((f) => `<h3>${esc(f.question)}</h3><p>${esc(f.answer)}</p>`).join('')
  return (
    `<main id="seo-prerender"><h1>${esc(MC_CHECK_H1)}</h1><p>${esc(MC_CHECK_LEAD)}</p>` +
    `${sections}<h2>Frequently asked questions</h2>${faqs}` +
    `<p><a href="${SITE_URL}/">Credyx</a></p></main>`
  )
}

function headTags(): string {
  const jsonLd = JSON.stringify(buildMcCheckJsonLd()).replace(/</g, '\\u003c')
  return [
    `<meta name="description" content="${esc(MC_CHECK_DESCRIPTION)}" />`,
    `<link rel="canonical" href="${MC_CHECK_URL}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Credyx" />`,
    `<meta property="og:title" content="${esc(MC_CHECK_TITLE)}" />`,
    `<meta property="og:description" content="${esc(MC_CHECK_DESCRIPTION)}" />`,
    `<meta property="og:url" content="${MC_CHECK_URL}" />`,
    `<meta property="og:image" content="${SITE_URL}/credyx-hero-dashboard.png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<script type="application/ld+json" id="mc-check-jsonld">${jsonLd}</script>`,
  ].join('\n    ')
}

const shell = readFileSync(join(dist, 'index.html'), 'utf8')
if (!shell.includes('<div id="root">') || !/<title>.*<\/title>/.test(shell)) {
  throw new Error('[prerender-seo] dist/index.html no longer matches the expected shell layout')
}

const page = shell
  .replace(/<title>.*<\/title>/, `<title>${esc(MC_CHECK_TITLE)}</title>\n    ${headTags()}`)
  .replace('<div id="root">', `<div id="root">\n      ${bodyHtml()}`)

const outDir = join(dist, MC_CHECK_PATH)
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'index.html'), page)

writeFileSync(
  join(dist, 'robots.txt'),
  [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /client',
    'Disallow: /logistics.login',
    'Disallow: /enroll',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n')
)

const today = new Date().toISOString().slice(0, 10)
const urls = [
  { loc: `${SITE_URL}/`, priority: '0.8' },
  { loc: MC_CHECK_URL, priority: '1.0' },
]
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`)
      .join('\n') +
    `\n</urlset>\n`
)

console.log(`[prerender-seo] wrote ${MC_CHECK_PATH}/index.html, robots.txt, sitemap.xml`)
