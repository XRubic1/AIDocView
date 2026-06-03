import { useMemo, useState } from 'react'

import { History, Search, Trash2 } from 'lucide-react'

import LoadAuditSummaryPanel from '../components/client/LoadAuditSummaryPanel'

import ExcelMatchPanel from '../components/loadReview/ExcelMatchPanel'

import EngineLayout from '../components/engine/EngineLayout'

import { ff } from '../components/loadReview/factorfox/factorFoxTheme'

import {

  clearLoadHistory,

  deleteLoadHistoryEntry,

  getLoadHistory,

  SavedLoadReview,

} from '../utils/loadHistoryStore'



/** Searchable load review history (browser local storage). */

export default function LoadHistoryPage() {

  const [entries, setEntries] = useState<SavedLoadReview[]>(() => getLoadHistory())

  const [query, setQuery] = useState('')

  const [statusFilter, setStatusFilter] = useState<string>('all')

  const [selected, setSelected] = useState<SavedLoadReview | null>(null)



  const filtered = useMemo(() => {

    const q = query.trim().toLowerCase()

    return entries.filter((entry) => {

      if (statusFilter !== 'all' && entry.overallStatus !== statusFilter) return false

      if (!q) return true

      return (

        entry.loadNumber?.toLowerCase().includes(q) ||

        entry.broker?.toLowerCase().includes(q) ||

        entry.fileNames.some((name) => name.toLowerCase().includes(q))

      )

    })

  }, [entries, query, statusFilter])



  const refresh = () => setEntries(getLoadHistory())



  return (

    <EngineLayout

      headerTitle={

        <div>

          <h1

            className="text-xl font-bold uppercase tracking-wide flex items-center gap-2"

            style={{ color: ff.text, fontFamily: ff.fontDisplay }}

          >

            <History className="w-5 h-5" style={{ color: ff.accent }} />

            Load History

          </h1>

          <p className="text-xs mt-1" style={{ color: ff.textMuted, fontFamily: ff.fontMono }}>

            {entries.length} saved review{entries.length !== 1 ? 's' : ''} · browser local storage

          </p>

        </div>

      }

      headerActions={

        entries.length > 0 ? (

          <button

            type="button"

            onClick={() => {

              if (confirm('Clear all load history?')) {

                clearLoadHistory()

                setSelected(null)

                refresh()

              }

            }}

            className="text-xs px-3 py-1.5 rounded-lg border engine-btn-secondary"

            style={{ color: ff.red, borderColor: ff.redBorder }}

          >

            Clear all

          </button>

        ) : undefined

      }

    >

      <div className="max-w-6xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="space-y-4">

          <div className="flex flex-col sm:flex-row gap-2">

            <div className="relative flex-1">

              <Search

                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"

                style={{ color: ff.textMuted }}

              />

              <input

                type="search"

                placeholder="Search load #, broker, file..."

                value={query}

                onChange={(e) => setQuery(e.target.value)}

                className="w-full pl-9 pr-3 py-2 text-sm"

              />

            </div>

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm">

              <option value="all">All statuses</option>

              <option value="APPROVED">Approved</option>

              <option value="NEEDS_REVIEW">Needs review</option>

              <option value="REJECTED">Rejected</option>

            </select>

          </div>



          <div

            className="rounded-xl border overflow-hidden"

            style={{ borderColor: ff.border, backgroundColor: ff.mainBg }}

          >

            {filtered.length === 0 ? (

              <p className="p-6 text-sm text-center" style={{ color: ff.textMuted }}>

                No saved loads. Run a review and click Save on the workbench.

              </p>

            ) : (

              <ul className="divide-y max-h-[70vh] overflow-y-auto" style={{ borderColor: ff.border }}>

                {filtered.map((entry) => (

                  <li key={entry.id}>

                    <button

                      type="button"

                      className="w-full px-4 py-3 text-left flex items-center justify-between gap-2 transition-colors engine-hover-surface"

                      onClick={() => setSelected(entry)}

                      style={{

                        backgroundColor: selected?.id === entry.id ? ff.accentDim : undefined,

                      }}

                    >

                      <div>

                        <div

                          className="text-sm font-semibold uppercase tracking-wide"

                          style={{ color: ff.text, fontFamily: ff.fontDisplay }}

                        >

                          Load {entry.loadNumber ?? '—'}

                        </div>

                        <div className="text-xs mt-0.5" style={{ color: ff.textMuted, fontFamily: ff.fontMono }}>

                          {new Date(entry.reviewedAt).toLocaleString()} · {entry.overallStatus}

                        </div>

                      </div>

                      <button

                        type="button"

                        className="p-1 rounded engine-hover-surface"

                        onClick={(e) => {

                          e.stopPropagation()

                          deleteLoadHistoryEntry(entry.id)

                          if (selected?.id === entry.id) setSelected(null)

                          refresh()

                        }}

                        aria-label="Delete entry"

                      >

                        <Trash2 className="w-4 h-4" style={{ color: ff.textMuted }} />

                      </button>

                    </button>

                  </li>

                ))}

              </ul>

            )}

          </div>

        </div>



        <div>

          {selected ? (

            <div className="space-y-4 lg:sticky lg:top-6">

              <LoadAuditSummaryPanel result={selected.result} variant="dark" />

              <ExcelMatchPanel match={selected.excelMatch} variant="dark" />

              <div

                className="text-xs rounded-xl border p-3"

                style={{ borderColor: ff.border, backgroundColor: ff.mainBg }}

              >

                <div

                  className="font-semibold mb-1 uppercase tracking-wide"

                  style={{ color: ff.text, fontFamily: ff.fontDisplay }}

                >

                  Files

                </div>

                <ul style={{ color: ff.textMuted, fontFamily: ff.fontMono }}>

                  {selected.fileNames.map((name) => (

                    <li key={name}>{name}</li>

                  ))}

                </ul>

              </div>

            </div>

          ) : (

            <p className="text-sm text-center py-12" style={{ color: ff.textMuted }}>

              Select a load to view its audit trail.

            </p>

          )}

        </div>

      </div>

    </EngineLayout>

  )

}

