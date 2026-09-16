/** Temporary page quality / crop settings for Credyx doc review (not saved to packet). */

export type DocPageCrop = {
  /** Inset from each edge as 0–45% of page size. */
  top: number
  right: number
  bottom: number
  left: number
}

export type DocPageQuality = {
  /** 0.5–1.8, 1 = unchanged */
  brightness: number
  /** 0.5–2.2, 1 = unchanged */
  contrast: number
  /** 0–1, pulls shadows darker */
  darkerBlacks: number
  /** Grayscale / black-and-white */
  blackAndWhite: boolean
  crop: DocPageCrop
}

export const DEFAULT_DOC_PAGE_CROP: DocPageCrop = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

export const DEFAULT_DOC_PAGE_QUALITY: DocPageQuality = {
  brightness: 1,
  contrast: 1,
  darkerBlacks: 0,
  blackAndWhite: false,
  crop: { ...DEFAULT_DOC_PAGE_CROP },
}

export function isDefaultDocPageQuality(q: DocPageQuality): boolean {
  return (
    q.brightness === 1 &&
    q.contrast === 1 &&
    q.darkerBlacks === 0 &&
    !q.blackAndWhite &&
    q.crop.top === 0 &&
    q.crop.right === 0 &&
    q.crop.bottom === 0 &&
    q.crop.left === 0
  )
}

/** Build a CSS filter string for live page preview. */
export function docPageQualityFilter(q: DocPageQuality): string | undefined {
  const parts: string[] = []
  // Darker blacks: slightly dim + raise contrast so ink reads heavier.
  const brightness = q.brightness * (1 - q.darkerBlacks * 0.12)
  const contrast = q.contrast * (1 + q.darkerBlacks * 0.55)
  if (Math.abs(brightness - 1) > 0.01) parts.push(`brightness(${brightness.toFixed(3)})`)
  if (Math.abs(contrast - 1) > 0.01) parts.push(`contrast(${contrast.toFixed(3)})`)
  if (q.blackAndWhite) parts.push('grayscale(1)')
  return parts.length > 0 ? parts.join(' ') : undefined
}

/** CSS clip-path inset from crop percentages. */
export function docPageCropClipPath(crop: DocPageCrop): string | undefined {
  const { top, right, bottom, left } = crop
  if (top <= 0 && right <= 0 && bottom <= 0 && left <= 0) return undefined
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`
}

function clampCropPct(n: number): number {
  return Math.min(45, Math.max(0, Math.round(n * 10) / 10))
}

/**
 * Detect content bounds on a canvas and return crop insets (%).
 * Looks for non-near-white pixels from each edge.
 */
export function autoCropFromCanvas(
  canvas: HTMLCanvasElement,
  opts?: { threshold?: number; paddingPct?: number }
): DocPageCrop {
  const threshold = opts?.threshold ?? 245
  const paddingPct = opts?.paddingPct ?? 1.2
  const w = canvas.width
  const h = canvas.height
  if (w < 8 || h < 8) return { ...DEFAULT_DOC_PAGE_CROP }

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { ...DEFAULT_DOC_PAGE_CROP }

  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, w, h)
  } catch {
    return { ...DEFAULT_DOC_PAGE_CROP }
  }

  const px = data.data
  const isInk = (i: number) => {
    const r = px[i]
    const g = px[i + 1]
    const b = px[i + 2]
    const a = px[i + 3]
    if (a < 20) return false
    return r < threshold || g < threshold || b < threshold
  }

  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  let found = false

  // Sample every Nth pixel for speed on large pages.
  const step = Math.max(1, Math.floor(Math.min(w, h) / 400))
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      if (!isInk(i)) continue
      found = true
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (!found || maxX <= minX || maxY <= minY) {
    return { ...DEFAULT_DOC_PAGE_CROP }
  }

  const padX = (w * paddingPct) / 100
  const padY = (h * paddingPct) / 100
  minX = Math.max(0, minX - padX)
  minY = Math.max(0, minY - padY)
  maxX = Math.min(w - 1, maxX + padX)
  maxY = Math.min(h - 1, maxY + padY)

  return {
    top: clampCropPct((minY / h) * 100),
    right: clampCropPct(((w - 1 - maxX) / w) * 100),
    bottom: clampCropPct(((h - 1 - maxY) / h) * 100),
    left: clampCropPct((minX / w) * 100),
  }
}
