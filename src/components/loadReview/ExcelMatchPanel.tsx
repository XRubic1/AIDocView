import { CheckCircle, AlertCircle, MinusCircle } from 'lucide-react'

import { ExcelMatchResult } from '../../types/loadSheet'

import { ff } from './factorfox/factorFoxTheme'



interface ExcelMatchPanelProps {

  match: ExcelMatchResult | null | undefined

  title?: string

  sourceColumnLabel?: string

  compareColumnLabel?: string

  /** Use AIDocView dark engine styling */

  variant?: 'light' | 'dark'

}



function StatusIcon({ status, variant }: { status: string; variant: 'light' | 'dark' }) {

  const matchColor = variant === 'dark' ? ff.green : '#2E7D32'

  const mismatchColor = variant === 'dark' ? ff.red : '#991B1B'

  const otherColor = variant === 'dark' ? ff.amber : '#C2A558'

  if (status === 'MATCH') return <CheckCircle className="w-4 h-4" style={{ color: matchColor }} />

  if (status === 'MISMATCH') return <AlertCircle className="w-4 h-4" style={{ color: mismatchColor }} />

  return <MinusCircle className="w-4 h-4" style={{ color: otherColor }} />

}



/** Show Excel vs document field comparison results. */

export default function ExcelMatchPanel({

  match,

  title,

  sourceColumnLabel = 'Excel',

  compareColumnLabel = 'Documents',

  variant = 'light',

}: ExcelMatchPanelProps) {

  if (!match) return null



  const dark = variant === 'dark'

  const headerTitle =

    title ?? `${sourceColumnLabel} cross-check — Load ${match.row.loadNumber ?? '—'}`



  const overallColor =

    match.overall === 'MATCH'

      ? dark

        ? ff.green

        : '#2E7D32'

      : match.overall === 'MISMATCH'

        ? dark

          ? ff.red

          : '#991B1B'

        : dark

          ? ff.amber

          : '#C2A558'



  const borderColor = dark ? ff.border : '#819291'

  const headerBg = dark ? ff.bg3 : '#f8f9fa'

  const rowBg = dark ? ff.mainBg : '#FFFFFF'

  const textPrimary = dark ? ff.text : '#113543'

  const textMuted = dark ? ff.textMuted : '#819291'



  return (

    <div className="rounded-lg border overflow-hidden" style={{ borderColor }}>

      <div

        className="px-4 py-3 border-b flex items-center justify-between"

        style={{ backgroundColor: headerBg, borderColor }}

      >

        <div className="text-sm font-semibold uppercase tracking-wide" style={{ color: textPrimary, fontFamily: dark ? ff.fontDisplay : undefined }}>

          {headerTitle}

        </div>

        <span className="text-xs font-bold uppercase" style={{ color: overallColor, fontFamily: dark ? ff.fontMono : undefined }}>

          {match.overall}

        </span>

      </div>

      <div className="divide-y" style={{ borderColor }}>

        {match.fields.map((field) => (

          <div

            key={field.field}

            className="px-4 py-2.5 flex items-start gap-3 text-xs"

            style={{ backgroundColor: rowBg }}

          >

            <StatusIcon status={field.status} variant={variant} />

            <div className="flex-1 min-w-0">

              <div className="font-semibold" style={{ color: textPrimary }}>

                {field.label}{' '}

                <span style={{ color: textMuted }}>({field.status})</span>

              </div>

              <div className="mt-0.5" style={{ color: textMuted }}>

                {sourceColumnLabel}: {field.excelValue ?? '—'} · {compareColumnLabel}:{' '}

                {field.documentValue ?? '—'}

              </div>

              <div className="mt-0.5" style={{ color: textPrimary }}>

                {field.message}

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  )

}

