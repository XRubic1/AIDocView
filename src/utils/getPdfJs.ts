import type * as PdfJs from 'pdfjs-dist'

type PdfJsModule = typeof PdfJs

let pdfjsLib: PdfJsModule | undefined

/**
 * Lazy-load PDF.js and point the web worker at a Vite-bundled URL.
 * `new URL('pdfjs-dist/...', import.meta.url)` resolves to
 * `/node_modules/pdfjs-dist/build/pdf.worker.min.mjs`, which the worker
 * cannot import in dev.
 */
export async function getPdfJs(): Promise<PdfJsModule> {
  if (pdfjsLib) return pdfjsLib

  const [{ default: workerSrc }, lib] = await Promise.all([
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    import('pdfjs-dist'),
  ])

  lib.GlobalWorkerOptions.workerSrc = workerSrc
  pdfjsLib = lib
  return lib
}
