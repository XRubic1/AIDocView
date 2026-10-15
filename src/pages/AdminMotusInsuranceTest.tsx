import { FormEvent, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ExternalLink, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { lookupMotusInsurance } from '../services/motusInsuranceService'
import { parseMotusDotSheet, type MotusSheetEntry } from '../utils/motusDotSheet'
import {
  classifyMotusReport,
  currentMotusPolicies,
  isRetryableMotusFailure,
  type MotusAuthority,
  type MotusInsurancePolicy,
  type MotusInsuranceReport,
  type MotusListVerdict,
} from '../utils/motusInsurance'

type BatchRow = {
  query: string
  sheetName: string
  state: 'pending' | 'checking' | 'done' | 'error'
  legalName: string
  dotNumber: string
  verdict: MotusListVerdict | null
  authorityStatus: string
  docketNumber: string
  cancellationDates: string
  summary: string
  accountUrl: string
}

const VERDICT_ORDER: MotusListVerdict[] = ['good', 'cancellation', 'inactive']

const VERDICT_COPY: Record<MotusListVerdict, { title: string; detail: string; tone: string }> = {
  good: {
    title: 'Good',
    detail: 'Authority is active and insurance is active with no cancellation date on that policy.',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
  cancellation: {
    title: 'Cancellation',
    detail: 'Authority is active, and the insurance on file is canceled or has a cancellation date.',
    tone: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
  },
  inactive: {
    title: 'Inactive',
    detail: 'The operating authority is not active, or there is no insurance on file.',
    tone: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  },
}

function showDate(value: string | null): string {
  return value || '—'
}

function policyTone(policy: MotusInsurancePolicy): string {
  if (policy.active) return 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40'
  if (policy.activeWithCancellation) return 'text-amber-800 bg-amber-50 dark:text-amber-200 dark:bg-amber-950/40'
  return 'text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800'
}

function AuthorityCard({ authority }: { authority: MotusAuthority }) {
  const policies = currentMotusPolicies(authority.policies)
  const withCancellation = policies.filter((policy) => policy.hasCancellationDate).length
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{authority.legalName}</h2>
          <p className="mt-1 text-sm text-slate-500">{authority.authorityType}</p>
        </div>
        <a
          href={authority.detailUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
        >
          Open on MOTUS
          <ExternalLink size={14} />
        </a>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Docket" value={authority.docketNumber} />
        <Fact label="Current status" value={authority.status} />
        <Fact label="Status reason" value={authority.statusReason || '—'} />
        <Fact label="Minimum insurance" value={authority.minimumInsurance || '—'} />
      </dl>

      <p className="text-sm text-slate-600 dark:text-slate-300">
        {authority.insuranceActive
          ? 'Active insurance is on file, with no cancellation date.'
          : 'No active insurance without a cancellation date.'}{' '}
        {withCancellation > 0
          ? `Current cancellation date on file.`
          : 'No current cancellation date.'}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 font-medium">Company</th>
              <th className="px-2 py-2 font-medium">Policy</th>
              <th className="px-2 py-2 font-medium">Form</th>
              <th className="px-2 py-2 font-medium">Insurance filed</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Received</th>
              <th className="px-2 py-2 font-medium">Effective</th>
              <th className="px-2 py-2 font-medium">Cancellation</th>
            </tr>
          </thead>
          <tbody>
            {policies.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-4 text-slate-500">
                  No insurance filings on this authority.
                </td>
              </tr>
            ) : (
              policies.map((policy) => (
                <tr key={`${policy.policyNumber}-${policy.effectiveDate}-${policy.status}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{policy.companyName}</td>
                  <td className="px-2 py-2">{policy.policyNumber}</td>
                  <td className="px-2 py-2">{policy.form}</td>
                  <td className="px-2 py-2">{policy.insuranceFiled}</td>
                  <td className="px-2 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${policyTone(policy)}`}>
                      {policy.status}
                    </span>
                  </td>
                  <td className="px-2 py-2">{showDate(policy.receivedDate)}</td>
                  <td className="px-2 py-2">{showDate(policy.effectiveDate)}</td>
                  <td className="px-2 py-2">{showDate(policy.cancellationDate)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function emptyBatchRow(entry: MotusSheetEntry): BatchRow {
  return {
    query: entry.query,
    sheetName: entry.label,
    state: 'pending',
    legalName: entry.label,
    dotNumber: entry.query,
    verdict: null,
    authorityStatus: '',
    docketNumber: '',
    cancellationDates: '',
    summary: '',
    accountUrl: '',
  }
}

function MotusDotImport() {
  const stopRef = useRef(false)
  const [rows, setRows] = useState<BatchRow[]>([])
  const [running, setRunning] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [passLabel, setPassLabel] = useState('')

  const finished = rows.filter((row) => row.state === 'done' || row.state === 'error').length

  function updateRow(query: string, patch: Partial<BatchRow>) {
    setRows((current) => current.map((row) => (row.query === query ? { ...row, ...patch } : row)))
  }

  async function onFile(file: File | null) {
    if (!file) return
    setFileError(null)
    setRows([])
    try {
      const entries = parseMotusDotSheet(await file.arrayBuffer())
      setFileName(file.name)
      setRows(entries.map(emptyBatchRow))
    } catch (err) {
      setFileName('')
      setFileError(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }

  async function checkEntries(pending: BatchRow[], retryFailures: boolean) {
    const failed: BatchRow[] = []
    let cursor = 0
    const worker = async () => {
      while (!stopRef.current) {
        const index = cursor
        cursor += 1
        const entry = pending[index]
        if (!entry) return
        updateRow(entry.query, { state: 'checking', summary: retryFailures ? 'Retrying MOTUS failure' : '' })
        try {
          const report = await lookupMotusInsurance(entry.query)
          const classified = classifyMotusReport(report)
          updateRow(entry.query, {
            state: 'done',
            legalName: report.legalName || entry.sheetName || entry.query,
            dotNumber: report.dotNumber,
            verdict: classified.verdict,
            authorityStatus: classified.authorityStatus,
            docketNumber: classified.docketNumber,
            cancellationDates: classified.cancellationDates.join(', '),
            summary: classified.summary,
            accountUrl: report.accountUrl,
          })
        } catch (err) {
          const summary = err instanceof Error ? err.message : 'MOTUS lookup failed'
          updateRow(entry.query, {
            state: 'error',
            verdict: null,
            summary,
          })
          if (isRetryableMotusFailure(summary)) failed.push(entry)
        }
      }
    }
    await Promise.all([worker(), worker(), worker()])
    return failed
  }

  async function runList() {
    const pending = rows.filter((row) => row.state !== 'done')
    if (!pending.length) return
    stopRef.current = false
    setRunning(true)
    setPassLabel('')
    const failed = await checkEntries(pending, false)
    if (!stopRef.current && failed.length) {
      setPassLabel(`Retrying ${failed.length} failed`)
      await checkEntries(failed, true)
    }
    setPassLabel('')
    setRunning(false)
  }

  function download() {
    const done = rows.filter((row) => row.state === 'done' && row.verdict)
    const sheet = XLSX.utils.json_to_sheet(
      done.map((row) => ({
        Result: VERDICT_COPY[row.verdict as MotusListVerdict].title,
        Client: row.legalName,
        DOT: row.dotNumber,
        Authority: row.authorityStatus,
        Docket: row.docketNumber,
        'Cancellation dates': row.cancellationDates,
        Note: row.summary,
      }))
    )
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'MOTUS')
    XLSX.writeFile(book, 'motus-dot-check.xlsx')
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import a DOT list</h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload an Excel or CSV file with a DOT column. Each number is checked and placed in Good, Cancellation, or Inactive.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          disabled={running}
          onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
          className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-100"
        />
        <button
          type="button"
          disabled={running || rows.length === 0}
          onClick={() => void runList()}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {running ? passLabel || `Checking ${finished} of ${rows.length}` : 'Check list'}
        </button>
        {running ? (
          <button
            type="button"
            onClick={() => {
              stopRef.current = true
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            Stop
          </button>
        ) : null}
        {rows.some((row) => row.state === 'done') ? (
          <button
            type="button"
            onClick={download}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            Download results
          </button>
        ) : null}
      </div>
      {fileName ? <p className="text-sm text-slate-500">{fileName} · {rows.length} numbers</p> : null}
      {fileError ? <p className="text-sm text-red-700 dark:text-red-300">{fileError}</p> : null}
      {rows.some((row) => row.state === 'done' || row.state === 'error') ? (
        <div className="space-y-4">
          {VERDICT_ORDER.map((verdict) => {
            const group = rows.filter((row) => row.verdict === verdict)
            const copy = VERDICT_COPY[verdict]
            return (
              <div key={verdict} className="space-y-2">
                <div className={`rounded-lg border px-3 py-2 ${copy.tone}`}>
                  <p className="text-sm font-semibold">
                    {copy.title} · {group.length}
                  </p>
                  <p className="text-xs">{copy.detail}</p>
                </div>
                {group.length > 0 ? <BatchTable rows={group} /> : null}
              </div>
            )
          })}
          {rows.some((row) => row.state === 'error') ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                Could not check · {rows.filter((row) => row.state === 'error').length}
              </p>
              <BatchTable rows={rows.filter((row) => row.state === 'error')} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function BatchTable({ rows }: { rows: BatchRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-2 font-medium">Client</th>
            <th className="px-2 py-2 font-medium">DOT</th>
            <th className="px-2 py-2 font-medium">Authority</th>
            <th className="px-2 py-2 font-medium">Docket</th>
            <th className="px-2 py-2 font-medium">Cancellation</th>
            <th className="px-2 py-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.query} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{row.legalName || row.sheetName || '—'}</td>
              <td className="px-2 py-2">
                {row.accountUrl ? (
                  <a href={row.accountUrl} target="_blank" rel="noreferrer" className="font-medium text-sky-700 hover:underline dark:text-sky-300">
                    {row.dotNumber}
                  </a>
                ) : (
                  row.dotNumber
                )}
              </td>
              <td className="px-2 py-2">{row.authorityStatus || '—'}</td>
              <td className="px-2 py-2">{row.docketNumber || '—'}</td>
              <td className="px-2 py-2">{row.cancellationDates || '—'}</td>
              <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{row.summary || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  )
}

/** Admin-only test of public MOTUS insurance. It does not change MC Check. */
export default function AdminMotusInsuranceTest() {
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<MotusInsuranceReport | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next = query.trim()
    if (!next) {
      setError('Enter a DOT number, an MC number, or a MOTUS account link.')
      return
    }
    setLoading(true)
    setError(null)
    setReport(null)
    try {
      setReport(await lookupMotusInsurance(next))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MOTUS lookup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="client-shell-scroll h-full min-h-0 overflow-y-auto p-5">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Test</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">MOTUS insurance</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Reads the public FMCSA MOTUS account for a carrier or broker, opens each operating authority,
            and checks whether insurance is active and whether a cancellation date is on file.
          </p>
        </div>

        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="DOT, MC, or motus.dot.gov account link"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Look up
          </button>
        </form>

        <MotusDotImport />

        <p className="text-sm text-slate-500">
          <Link to="/admin/mc-checks" className="font-medium text-sky-700 hover:underline dark:text-sky-300">
            Back to MC Checks
          </Link>
        </p>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {report ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                DOT {report.dotNumber}
                {report.insuranceActive ? ' · Active insurance' : ' · No active insurance'}
              </p>
              <a
                href={report.accountUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
              >
                Account on MOTUS
                <ExternalLink size={14} />
              </a>
            </div>
            {report.authorities.map((authority) => (
              <AuthorityCard key={authority.id} authority={authority} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
