import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import AdminLayout from '../components/AdminLayout'
import {
  ClipboardList,
  Eye,
  MousePointerClick,
  Users,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Globe2,
  Timer,
} from 'lucide-react'
import { formatDate } from '../utils/format'
import { useToast } from '../components/ui/ToastProvider'
import Spinner from '../components/ui/Spinner'
import {
  fetchWaitlistAdminSummary,
  fetchWaitlistLeads,
  fetchWebsiteEvents,
  formatDurationMs,
  groupWebsiteEventsByVisitor,
  buildJoinedIpIndex,
  type EventRange,
  type WaitlistAdminSummary,
  type WaitlistLead,
  type WebsiteEventRow,
} from '../services/waitlistAdminService'

type TabId = 'leads' | 'interactions'

const EVENT_FILTERS = [
  '',
  'page_view',
  'cta_click',
  'nav_click',
  'section_view',
  'form_submit',
  'form_success',
  'form_error',
  'time_on_page',
] as const

/** Readable label for an interaction event row (shows duration for time_on_page). */
function eventDetailLabel(event: WebsiteEventRow): string {
  if (event.event_name === 'time_on_page') {
    const active = Number(event.meta?.active_ms)
    const reason = typeof event.meta?.reason === 'string' ? event.meta.reason : null
    const duration = formatDurationMs(Number.isFinite(active) ? active : null)
    return reason ? `${duration} (${reason})` : duration
  }
  return event.target || '—'
}

/** Admin waitlist leads + marketing interaction audit. */
export default function AdminWaitlist() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<TabId>('leads')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<WaitlistAdminSummary | null>(null)
  const [leads, setLeads] = useState<WaitlistLead[]>([])
  const [events, setEvents] = useState<WebsiteEventRow[]>([])
  const [eventRange, setEventRange] = useState<EventRange>('7d')
  const [eventName, setEventName] = useState('')
  const [expandedVisitorKey, setExpandedVisitorKey] = useState<string | null>(null)

  const visitorGroups = useMemo(() => {
    const joinedByIp = buildJoinedIpIndex(leads)
    return groupWebsiteEventsByVisitor(events, joinedByIp)
  }, [events, leads])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [nextSummary, nextLeads, nextEvents] = await Promise.all([
        fetchWaitlistAdminSummary(),
        fetchWaitlistLeads(),
        fetchWebsiteEvents({
          range: eventRange,
          eventName: eventName || undefined,
        }),
      ])
      setSummary(nextSummary)
      setLeads(nextLeads)
      setEvents(nextEvents)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load waitlist data', 'error')
    } finally {
      setLoading(false)
    }
  }, [eventName, eventRange, showToast])

  useEffect(() => {
    setExpandedVisitorKey(null)
  }, [eventRange, eventName])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const funnel = summary?.funnel

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Waitlist
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Marketing leads and website interaction history
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {loading && !summary ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                icon={<Users size={18} />}
                label="Signups (all)"
                value={String(summary?.signupsAll ?? 0)}
              />
              <SummaryCard
                icon={<ClipboardList size={18} />}
                label="Signups (7d)"
                value={String(summary?.signups7d ?? 0)}
              />
              <SummaryCard
                icon={<Eye size={18} />}
                label="Page views (7d)"
                value={String(summary?.pageViews7d ?? 0)}
              />
              <SummaryCard
                icon={<Timer size={18} />}
                label="Avg time on page (7d)"
                value={formatDurationMs(summary?.avgTimeOnPageMs7d)}
              />
              <SummaryCard
                icon={<MousePointerClick size={18} />}
                label="Form success (7d)"
                value={String(funnel?.formSuccesses ?? 0)}
              />
            </div>

            {/* Funnel + rankings */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 lg:col-span-1">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Funnel (7 days)
                </h2>
                <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <FunnelRow label="Page views" count={funnel?.pageViews ?? 0} />
                  <FunnelRow label="Saw waitlist form" count={funnel?.formSectionViews ?? 0} />
                  <FunnelRow label="Form submit" count={funnel?.formSubmits ?? 0} />
                  <FunnelRow label="Form success" count={funnel?.formSuccesses ?? 0} />
                </ul>
              </div>

              <RankList title="Top CTAs / nav (7d)" rows={summary?.topCtas ?? []} />
              <RankList title="Top sections viewed (7d)" rows={summary?.topSections ?? []} />
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
              <TabButton active={tab === 'leads'} onClick={() => setTab('leads')}>
                Leads ({leads.length})
              </TabButton>
              <TabButton active={tab === 'interactions'} onClick={() => setTab('interactions')}>
                Interaction history
              </TabButton>
            </div>

            {tab === 'leads' && (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800/60">
                    <tr>
                      <th className="px-4 py-3 font-medium">Company</th>
                      <th className="px-4 py-3 font-medium">Contact</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Fleet</th>
                      <th className="px-4 py-3 font-medium">Heard about</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No waitlist signups yet.
                        </td>
                      </tr>
                    ) : (
                      leads.map((lead) => (
                        <tr
                          key={lead.id}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                        >
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                            {lead.company_name}
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                            {lead.contact_name}
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                            {lead.email}
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                            {lead.fleet_size}
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                            {lead.hear_about || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                              {lead.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {formatDate(lead.created_at)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'interactions' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    Range
                    <select
                      value={eventRange}
                      onChange={(e) => setEventRange(e.target.value as EventRange)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="24h">Last 24h</option>
                      <option value="7d">Last 7 days</option>
                      <option value="30d">Last 30 days</option>
                      <option value="all">All time</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    Event
                    <select
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                      {EVENT_FILTERS.map((name) => (
                        <option key={name || 'all'} value={name}>
                          {name || 'All events'}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  {visitorGroups.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-500">
                      No interactions in this range yet. Visit the waitlist page to generate
                      events.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {visitorGroups.map((group) => {
                        const open = expandedVisitorKey === group.key
                        return (
                          <li key={group.key}>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedVisitorKey((prev) =>
                                  prev === group.key ? null : group.key
                                )
                              }
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                              aria-expanded={open}
                            >
                              <span className="mt-0.5 text-slate-400">
                                {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                              </span>
                              <span className="mt-0.5 rounded-lg bg-sky-50 p-1.5 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                <Globe2 size={16} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {group.ip_address || 'Unknown IP'}
                                  </span>
                                  <span className="text-sm text-slate-600 dark:text-slate-300">
                                    {group.region || 'Unknown region'}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    {group.deviceLabel}
                                  </span>
                                  {group.waitlistJoined ? (
                                    <span
                                      className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                      title={
                                        group.joinedEmails.length
                                          ? `Joined: ${group.joinedEmails.join(', ')}`
                                          : 'Waitlist form completed from this IP'
                                      }
                                    >
                                      Joined
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                      Not joined
                                    </span>
                                  )}
                                </span>
                                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                  <span>
                                    {group.eventCount} interaction
                                    {group.eventCount === 1 ? '' : 's'}
                                  </span>
                                  <span>
                                    {group.sessionCount} session
                                    {group.sessionCount === 1 ? '' : 's'}
                                  </span>
                                  {group.timeOnPageMs != null && (
                                    <span title="Longest active time on page for this visitor">
                                      Time on page {formatDurationMs(group.timeOnPageMs)}
                                    </span>
                                  )}
                                  <span>Last {formatDate(group.lastSeen)}</span>
                                </span>
                              </span>
                            </button>

                            {open && (
                              <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Activity detail
                                </p>
                                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                  <table className="min-w-full text-left text-sm">
                                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800/60">
                                      <tr>
                                        <th className="px-3 py-2 font-medium">Time</th>
                                        <th className="px-3 py-2 font-medium">Event</th>
                                        <th className="px-3 py-2 font-medium">Detail</th>
                                        <th className="px-3 py-2 font-medium">Device</th>
                                        <th className="px-3 py-2 font-medium">Path</th>
                                        <th className="px-3 py-2 font-medium">Session</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {group.events.map((event) => (
                                        <tr
                                          key={event.id}
                                          className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                                        >
                                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                                            {formatDate(event.occurred_at)}
                                          </td>
                                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">
                                            {event.event_name}
                                          </td>
                                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                            {eventDetailLabel(event)}
                                          </td>
                                          <td className="px-3 py-2 capitalize text-slate-700 dark:text-slate-300">
                                            {event.device_type || '—'}
                                          </td>
                                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                            {event.path}
                                          </td>
                                          <td
                                            className="max-w-[120px] truncate px-3 py-2 font-mono text-xs text-slate-500"
                                            title={event.session_id}
                                          >
                                            {event.session_id.slice(0, 8)}…
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  )
}

function FunnelRow({ label, count }: { label: string; count: number }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="font-semibold text-slate-900 dark:text-slate-100">{count}</span>
    </li>
  )
}

function RankList({
  title,
  rows,
}: {
  title: string
  rows: Array<{ key: string; count: number }>
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No data yet.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
              <span className="truncate font-mono text-xs">{row.key}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-[#1684FE] text-[#1684FE]'
          : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}
