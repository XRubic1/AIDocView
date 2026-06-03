import { FieldRegionBox } from '../types/documentReview'

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1, value))
}

/** Parse normalized bounding box from AI JSON (0–1, top-left origin). */
export function parseSourceRegion(
  raw: unknown,
  defaultPage = 1
): FieldRegionBox | undefined {
  if (!raw || typeof raw !== 'object') return undefined

  const region = raw as Record<string, unknown>
  const x = Number(region.x)
  const y = Number(region.y)
  const width = Number(region.width ?? region.w)
  const height = Number(region.height ?? region.h)

  if ([x, y, width, height].some((value) => Number.isNaN(value))) return undefined
  if (width <= 0 || height <= 0) return undefined

  const pageNumber = Number(region.page_number ?? region.pageNumber ?? defaultPage)

  return {
    pageNumber: Number.isNaN(pageNumber) ? defaultPage : pageNumber,
    x: clamp01(x),
    y: clamp01(y),
    width: clamp01(width),
    height: clamp01(height),
  }
}
