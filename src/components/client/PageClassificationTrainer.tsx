import { useCallback, useMemo, useState } from 'react'
import {
  DOCUMENT_CATEGORY_COLORS,
  normalizeAiDocumentType,
} from '../../utils/documentCategories'
import { PageClassification, PageDocumentType } from '../../types/documentReview'
import { ff } from '../loadReview/factorfox/factorFoxTheme'

const PAGE_TYPES: PageDocumentType[] = [
  'invoice',
  'rate_confirmation',
  'bill_of_lading',
  'proof_of_delivery',
  'lumper',
  'blank',
  'other',
]

const PAGE_TYPE_LABELS: Record<PageDocumentType, string> = {
  invoice: 'Invoice',
  rate_confirmation: 'Rate con',
  bill_of_lading: 'BOL',
  proof_of_delivery: 'POD',
  lumper: 'Lumper',
  blank: 'Blank',
  other: 'Unknown',
}

export type PageClassifyFeedback = 'correct' | 'incorrect'

export interface PageClassificationEdit {
  pageNumber: number
  pageType: PageDocumentType
  aiCorrect?: PageClassifyFeedback
  userNote?: string
}

interface PageClassificationTrainerProps {
  pages: PageClassification[]
  variant?: 'light' | 'dark'
  onPagesChange: (pages: PageClassification[], edits: PageClassificationEdit[]) => void
}

/** Let users confirm or fix AI page labels (e.g. page 1 invoice vs rate con). */
export default function PageClassificationTrainer({
  pages,
  variant = 'dark',
  onPagesChange,
}: PageClassificationTrainerProps) {
  const dark = variant === 'dark'
  const border = dark ? ff.border : '#819291'
  const panelBg = dark ? ff.bg3 : '#f8f9fa'
  const rowBg = dark ? ff.bg2 : '#FFFFFF'
  const textPrimary = dark ? ff.text : '#113543'
  const textMuted = dark ? ff.textMuted : '#819291'

  const initialFeedback = useMemo(() => {
    const map: Record<number, PageClassifyFeedback | undefined> = {}
    pages.forEach((p) => {
      map[p.pageNumber] = undefined
    })
    return map
  }, [pages])

  const [feedback, setFeedback] = useState<Record<number, PageClassifyFeedback | undefined>>(
    initialFeedback
  )

  const applyUpdate = useCallback(
    (
      pageNumber: number,
      patch: Partial<{ pageType: PageDocumentType; aiCorrect: PageClassifyFeedback }>
    ) => {
      const nextPages = pages.map((page) =>
        page.pageNumber === pageNumber
          ? {
              ...page,
              pageType: patch.pageType ?? page.pageType,
              notes:
                patch.aiCorrect === 'incorrect' || patch.pageType
                  ? 'User corrected page type'
                  : page.notes,
            }
          : page
      )
      const nextFeedback = {
        ...feedback,
        ...(patch.aiCorrect !== undefined ? { [pageNumber]: patch.aiCorrect } : {}),
      }
      setFeedback(nextFeedback)

      const edits: PageClassificationEdit[] = nextPages.map((page) => ({
        pageNumber: page.pageNumber,
        pageType: page.pageType,
        aiCorrect: nextFeedback[page.pageNumber],
      }))
      onPagesChange(nextPages, edits)
    },
    [feedback, onPagesChange, pages]
  )

  if (!pages.length) return null

  return (
    <div
      className="rounded border p-3 space-y-2"
      style={{ borderColor: border, backgroundColor: panelBg }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: textMuted, fontFamily: dark ? ff.fontMono : undefined }}
        >
          Page classifier — confirm or fix
        </div>
        <span className="text-[10px]" style={{ color: textMuted }}>
          Page 1 is often invoice, not rate con
        </span>
      </div>

      <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
        {pages.map((page) => {
          const colors =
            DOCUMENT_CATEGORY_COLORS[normalizeAiDocumentType(page.pageType)] ??
            DOCUMENT_CATEGORY_COLORS.other
          const mark = feedback[page.pageNumber]

          return (
            <div
              key={page.pageNumber}
              className="flex flex-wrap items-center gap-2 text-xs rounded px-2 py-1.5"
              style={{ backgroundColor: rowBg, border: `1px solid ${border}` }}
            >
              <span className="font-semibold shrink-0" style={{ color: textPrimary }}>
                P{page.pageNumber}
              </span>
              <select
                value={page.pageType}
                onChange={(e) =>
                  applyUpdate(page.pageNumber, {
                    pageType: e.target.value as PageDocumentType,
                    aiCorrect: 'incorrect',
                  })
                }
                className="rounded px-1.5 py-0.5 text-[11px] border min-w-0"
                style={{
                  backgroundColor: colors.bg,
                  color: colors.text,
                  borderColor: border,
                  maxWidth: '120px',
                }}
                aria-label={`Page ${page.pageNumber} document type`}
              >
                {PAGE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PAGE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1 ml-auto shrink-0">
                <button
                  type="button"
                  title="AI got this page right"
                  onClick={() => applyUpdate(page.pageNumber, { aiCorrect: 'correct' })}
                  className={`engine-page-mark ${mark === 'correct' ? 'active pass' : ''}`}
                >
                  ✓ OK
                </button>
                <button
                  type="button"
                  title="AI got this page wrong — change type above"
                  onClick={() => applyUpdate(page.pageNumber, { aiCorrect: 'incorrect' })}
                  className={`engine-page-mark ${mark === 'incorrect' ? 'active fail' : ''}`}
                >
                  ✗ Wrong
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
