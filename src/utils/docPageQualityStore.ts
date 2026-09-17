/**
 * Persist Credyx-only page quality / crop prefs (local view, not packet docs).
 * Keys: `bol` | `rate_con` (or any custom pane key).
 */

import {
  DEFAULT_DOC_PAGE_QUALITY,
  type DocPageQuality,
  isDefaultDocPageQuality,
} from './docPageQuality'

const STORAGE_KEY = 'credyx-doc-page-quality-v1'

type QualityMap = Record<string, DocPageQuality>

/** Deep-clone quality so callers can mutate crop safely. */
export function cloneDocPageQuality(q: DocPageQuality = DEFAULT_DOC_PAGE_QUALITY): DocPageQuality {
  return {
    brightness: q.brightness,
    contrast: q.contrast,
    darkerBlacks: q.darkerBlacks,
    blackAndWhite: q.blackAndWhite,
    crop: { ...q.crop },
  }
}

function readMap(): QualityMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as QualityMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(map: QualityMap): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

function sanitizeQuality(raw: unknown): DocPageQuality | null {
  if (!raw || typeof raw !== 'object') return null
  const q = raw as Partial<DocPageQuality>
  const crop = q.crop && typeof q.crop === 'object' ? q.crop : DEFAULT_DOC_PAGE_QUALITY.crop
  const next: DocPageQuality = {
    brightness:
      typeof q.brightness === 'number' && Number.isFinite(q.brightness)
        ? q.brightness
        : DEFAULT_DOC_PAGE_QUALITY.brightness,
    contrast:
      typeof q.contrast === 'number' && Number.isFinite(q.contrast)
        ? q.contrast
        : DEFAULT_DOC_PAGE_QUALITY.contrast,
    darkerBlacks:
      typeof q.darkerBlacks === 'number' && Number.isFinite(q.darkerBlacks)
        ? q.darkerBlacks
        : DEFAULT_DOC_PAGE_QUALITY.darkerBlacks,
    blackAndWhite: Boolean(q.blackAndWhite),
    crop: {
      top: typeof crop.top === 'number' ? crop.top : 0,
      right: typeof crop.right === 'number' ? crop.right : 0,
      bottom: typeof crop.bottom === 'number' ? crop.bottom : 0,
      left: typeof crop.left === 'number' ? crop.left : 0,
    },
  }
  return next
}

/** Load saved quality for a pane key, or defaults when none saved. */
export function loadDocPageQuality(storageKey: string): DocPageQuality {
  const sanitized = sanitizeQuality(readMap()[storageKey])
  return cloneDocPageQuality(sanitized ?? DEFAULT_DOC_PAGE_QUALITY)
}

/** True when a non-default preference is stored for this key. */
export function hasSavedDocPageQuality(storageKey: string): boolean {
  const sanitized = sanitizeQuality(readMap()[storageKey])
  return Boolean(sanitized && !isDefaultDocPageQuality(sanitized))
}

/** Persist quality for a pane. Default settings clear the saved entry. */
export function saveDocPageQuality(storageKey: string, quality: DocPageQuality): void {
  const map = readMap()
  if (isDefaultDocPageQuality(quality)) {
    delete map[storageKey]
  } else {
    map[storageKey] = cloneDocPageQuality(quality)
  }
  writeMap(map)
}

/** Remove saved preference for a pane key. */
export function clearDocPageQuality(storageKey: string): void {
  const map = readMap()
  if (!(storageKey in map)) return
  delete map[storageKey]
  writeMap(map)
}
