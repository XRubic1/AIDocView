import {
  DOCUMENT_CATEGORY_COLORS,
  getCategoryLabel,
  normalizeAiDocumentType,
} from '../../utils/documentCategories'
import { PageClassification, PageDocumentType } from '../../types/documentReview'
import { ff } from '../loadReview/factorfox/factorFoxTheme'

const PAGE_TYPE_LABELS: Record<PageDocumentType, string> = {
  invoice: 'Invoice (billed info)',
  blank: 'Blank / unreadable',
  rate_confirmation: 'Rate Con',
  bill_of_lading: 'BOL',
  proof_of_delivery: 'POD',
  delivery_confirmation: 'Delivery confirmation',
  lumper: 'Lumper',
  other: 'Unknown',
}

const PAGE_TYPE_COLORS: Record<PageDocumentType, { bg: string; text: string }> = {
  ...DOCUMENT_CATEGORY_COLORS,
  invoice: { bg: '#E3F2FD', text: '#1565C0' },
  blank: { bg: '#FEE2E2', text: '#991B1B' },
  other: { bg: '#F3F4F6', text: '#6B7280' },
}

interface PageClassificationPanelProps {
  pages: PageClassification[]
  variant?: 'light' | 'dark'
}

export default function PageClassificationPanel({ pages, variant = 'light' }: PageClassificationPanelProps) {
  if (!pages.length) return null
  const dark = variant === 'dark'
  const border = dark ? ff.border : '#64748b'
  const panelBg = dark ? ff.bg2 : '#f8f9fa'
  const rowBg = dark ? ff.mainBg : '#FFFFFF'
  const textPrimary = dark ? ff.text : '#113543'
  const textMuted = dark ? ff.textMuted : '#64748b'

  return (
    <div className="rounded border p-3 space-y-2" style={{ borderColor: border, backgroundColor: panelBg }}>
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: textMuted, fontFamily: dark ? ff.fontMono : undefined }}>
        Document classifier — page map
      </div>
      <div className="space-y-1.5">
        {pages.map((page) => {
          const colors = PAGE_TYPE_COLORS[page.pageType] ?? PAGE_TYPE_COLORS.other
          const label =
            page.pageType === 'invoice' || page.pageType === 'blank'
              ? PAGE_TYPE_LABELS[page.pageType]
              : getCategoryLabel(normalizeAiDocumentType(page.pageType))

          return (
            <div
              key={page.pageNumber}
              className="flex flex-wrap items-center gap-2 text-xs rounded px-2 py-1.5"
              style={{ backgroundColor: rowBg, border: `1px solid ${border}` }}
            >
              <span className="font-semibold" style={{ color: textPrimary }}>
                Page {page.pageNumber}
              </span>
              <span
                className="inline-flex px-2 py-0.5 rounded font-medium"
                style={{ backgroundColor: colors.bg, color: colors.text }}
              >
                {label}
              </span>
              {page.skipped && (
                <span style={{ color: textMuted }}>{page.skipReason ?? 'Skipped'}</span>
              )}
              {!page.isLegible && !page.isBlank && (
                <span style={{ color: dark ? ff.amber : '#0891b2' }}>Low legibility</span>
              )}
              {page.notes && (
                <span className="min-w-0 break-words" style={{ color: textMuted }}>
                  {page.notes}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
