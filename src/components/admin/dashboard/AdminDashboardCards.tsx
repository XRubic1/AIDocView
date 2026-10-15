/**
 * Admin dashboard cards — A/R trend, aging, collections, disputes, batch flow.
 * Styled with adminDashboard.css (adb-*) to match the hero + clients panel.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  FileUp,
  Hourglass,
  Inbox,
  Phone,
  Scale,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { useClientTheme } from '../../../theme/ThemeContext'
import { formatCurrency } from '../../../utils/format'
import type { AgingAR, CollectionsAlert } from '../../../types/admin'
import type { OpenDisputedInvoiceRow } from '../../../utils/clientInvoiceDisputeStatus'

/* ——— Shared shell ——— */

interface CardShellProps {
  title: string
  icon: LucideIcon
  count?: number
  countTone?: 'blue' | 'danger'
  actionLabel?: string
  onAction?: () => void
  aside?: ReactNode
  children: ReactNode
  className?: string
}

function CardShell({
  title,
  icon: Icon,
  count,
  countTone = 'blue',
  actionLabel,
  onAction,
  aside,
  children,
  className = '',
}: CardShellProps) {
  return (
    <section className={`adb-card adb-panel ${className}`} aria-label={title}>
      <header className="adb-card__head">
        <h2 className="adb-card__title">
          <Icon size={16} aria-hidden />
          {title}
          {count ? (
            <span className={`adb-card__count${countTone === 'danger' ? ' adb-card__count--danger' : ''}`}>
              {count}
            </span>
          ) : null}
        </h2>
        {aside}
        {actionLabel && onAction ? (
          <button type="button" className="adb-card__link" onClick={onAction}>
            {actionLabel} <ArrowRight size={13} aria-hidden />
          </button>
        ) : null}
      </header>
      {children}
    </section>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="adb-empty">
      <CheckCircle2 aria-hidden />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  )
}

function compactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`
  return `$${Math.round(value)}`
}

/* ——— A/R trend ——— */

type TrendPoint = { date: string; totalAR: number; collected: number }

export function ArTrendCard({ data, onOpen }: { data: TrendPoint[]; onOpen: () => void }) {
  const c = useClientTheme()
  const first = data[0]?.totalAR ?? 0
  const last = data[data.length - 1]?.totalAR ?? 0
  const change = last - first

  return (
    <CardShell
      title="A/R trend"
      icon={BarChart3}
      actionLabel="Aging A/R"
      onAction={onOpen}
      aside={
        <span className="adb-panel__aside">
          30 days ·{' '}
          <b style={{ color: change > 0 ? c.warning : change < 0 ? c.success : c.secondary }}>
            {change >= 0 ? '+' : '−'}
            {formatCurrency(Math.abs(change))}
          </b>
        </span>
      }
    >
      <div className="adb-legend">
        <span><i style={{ background: c.accent }} />Open A/R</span>
        <span><i style={{ background: c.success }} />Collected (cumulative)</span>
      </div>
      <div className="adb-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="adbArFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.accent} stopOpacity={0.22} />
                <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={c.chartGrid} strokeOpacity={0.7} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              tick={{ fontSize: 11, fill: c.mutedLight }}
            />
            <YAxis
              width={48}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: c.mutedLight }}
              tickFormatter={compactCurrency}
            />
            <Tooltip
              cursor={{ stroke: c.border }}
              formatter={(value: number, name: string) => [
                formatCurrency(value),
                name === 'totalAR' ? 'Open A/R' : 'Collected',
              ]}
              contentStyle={{
                background: c.card,
                border: `1px solid ${c.border}`,
                borderRadius: 10,
                fontSize: 12,
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
              }}
              labelStyle={{ color: c.primary, fontWeight: 600 }}
            />
            <Area
              type="monotone"
              dataKey="totalAR"
              stroke={c.accent}
              strokeWidth={2}
              fill="url(#adbArFill)"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Area
              type="monotone"
              dataKey="collected"
              stroke={c.success}
              strokeWidth={2}
              fill="none"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  )
}

/* ——— Aging buckets ——— */

export function AgingCard({ aging, onOpen }: { aging: AgingAR; onOpen: () => void }) {
  const c = useClientTheme()
  const buckets = [
    { label: '0–15 days', value: aging['1_15'], color: c.accent },
    { label: '16–30 days', value: aging['16_30'], color: c.chart.cyan },
    { label: '31–45 days', value: aging['31_45'], color: c.chart.amber },
    { label: '46–60 days', value: aging['46_60'], color: c.chart.orange },
    { label: '61–90 days', value: aging['61_90'], color: c.error },
    { label: '91+ days', value: aging.over_91, color: c.chart.red },
  ]
  const max = Math.max(...buckets.map((b) => b.value), 1)

  return (
    <CardShell
      title="Aging A/R"
      icon={Hourglass}
      actionLabel="Open report"
      onAction={onOpen}
      aside={
        <span className="adb-panel__aside">
          Total <b>{formatCurrency(aging.total)}</b>
        </span>
      }
    >
      {aging.total === 0 ? (
        <EmptyState title="No open A/R" body="Approved and on-hold invoices age here." />
      ) : (
        <ul className="adb-buckets">
          {buckets.map((b) => {
            const pct = aging.total > 0 ? Math.round((b.value / aging.total) * 100) : 0
            return (
              <li key={b.label} className={b.value === 0 ? 'is-empty' : undefined}>
                <span className="adb-buckets__label">{b.label}</span>
                <span className="adb-buckets__track">
                  <span style={{ width: `${(b.value / max) * 100}%`, background: b.color }} />
                </span>
                <span className="adb-buckets__amount">{b.value > 0 ? formatCurrency(b.value) : '—'}</span>
                <span className="adb-buckets__pct">{pct}%</span>
              </li>
            )
          })}
        </ul>
      )}
    </CardShell>
  )
}

/* ——— Collections ——— */

type CollectionsSort = 'days' | 'amount'

export function CollectionsCard({
  alerts,
  onOpenInvoice,
  onCall,
  onMarkContacted,
  onViewAll,
}: {
  alerts: CollectionsAlert[]
  onOpenInvoice: (invoiceId: string) => void
  onCall: (invoiceId: string) => void
  onMarkContacted: (invoiceId: string) => void
  onViewAll: () => void
}) {
  const [sort, setSort] = useState<CollectionsSort>('days')
  const rows = useMemo(
    () =>
      [...alerts].sort((a, b) =>
        sort === 'amount' ? b.amount - a.amount : b.days_since_expected - a.days_since_expected
      ),
    [alerts, sort]
  )

  return (
    <CardShell
      title="Collections queue"
      icon={Phone}
      count={alerts.length}
      countTone="danger"
      actionLabel="Collections"
      onAction={onViewAll}
    >
      {alerts.length === 0 ? (
        <EmptyState title="Nothing to chase" body="Invoices 15+ days past expected show up here." />
      ) : (
        <>
          <div className="adb-panel__toolbar">
            <div className="adb-tabs" role="tablist" aria-label="Sort collections">
              {(
                [
                  ['days', 'Most overdue'],
                  ['amount', 'Largest'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={sort === id}
                  className={`adb-tab${sort === id ? ' is-active' : ''}`}
                  onClick={() => setSort(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ul className="adb-list">
            {rows.map((alert) => {
              const tone = alert.days_since_expected >= 30 ? 'danger' : alert.days_since_expected >= 20 ? 'warn' : 'blue'
              return (
                <li key={alert.invoice_id}>
                  <div
                    className="adb-list__row"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenInvoice(alert.invoice_id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onOpenInvoice(alert.invoice_id)
                    }}
                  >
                    <div className="adb-list__main">
                      <span className="adb-list__title">
                        {alert.broker_name}
                        <span className={`adb-tag adb-tag--${tone}`}>{alert.days_since_expected}d late</span>
                      </span>
                      <span className="adb-list__detail">
                        {alert.inv_number} · {alert.client_name}
                        {alert.broker_contacted ? ' · contacted' : ''}
                      </span>
                    </div>
                    <span className="adb-list__amount">{formatCurrency(alert.amount)}</span>
                    <div className="adb-list__actions">
                      <button
                        type="button"
                        className="adb-mini-btn adb-mini-btn--primary"
                        onClick={(e) => {
                          e.stopPropagation()
                          onCall(alert.invoice_id)
                        }}
                      >
                        <Phone size={12} aria-hidden /> Call
                      </button>
                      {!alert.broker_contacted ? (
                        <button
                          type="button"
                          className="adb-mini-btn"
                          title="Mark broker contacted"
                          onClick={(e) => {
                            e.stopPropagation()
                            onMarkContacted(alert.invoice_id)
                          }}
                        >
                          Mark
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </CardShell>
  )
}

/* ——— Disputes ——— */

export function DisputesCard({
  rows,
  onOpenInvoice,
  onViewAll,
}: {
  rows: OpenDisputedInvoiceRow[]
  onOpenInvoice: (invoiceId: string) => void
  onViewAll: () => void
}) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.invoice.amount - a.invoice.amount), [rows])

  return (
    <CardShell
      title="Open disputes"
      icon={Scale}
      count={rows.length}
      countTone="danger"
      actionLabel={rows.length > 0 ? 'View all' : undefined}
      onAction={onViewAll}
    >
      {rows.length === 0 ? (
        <EmptyState title="No open disputes" body="Invoice and receipt disputes show up here." />
      ) : (
        <ul className="adb-list">
          {sorted.map((row) => (
            <li key={row.invoice.id}>
              <button type="button" className="adb-list__row" onClick={() => onOpenInvoice(row.invoice.id)}>
                <div className="adb-list__main">
                  <span className="adb-list__title">
                    {row.invoice.invoice_number}
                    <span className="adb-tag adb-tag--warn">{row.source === 'receipt' ? 'Receipt' : 'Invoice'}</span>
                  </span>
                  <span className="adb-list__detail" title={row.reason}>
                    {row.invoice.client_name} → {row.invoice.broker_name} · {row.reason}
                  </span>
                </div>
                <span className="adb-list__amount">{formatCurrency(row.invoice.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  )
}

/* ——— Batch flow + intake ——— */

export type BatchStage = {
  stage: string
  label: string
  count: number
  totalAmount: number
  avgTimeHours: number
  color: string
}

export function BatchFlowCard({
  stages,
  invoicesOnHold,
  invoicesClosed,
  onStageClick,
  onViewAll,
}: {
  stages: BatchStage[]
  invoicesOnHold: number
  invoicesClosed: number
  onStageClick: (stage: string) => void
  onViewAll: () => void
}) {
  const total = stages.reduce((s, st) => s + st.count, 0)

  return (
    <CardShell title="Batch flow" icon={Boxes} count={total} actionLabel="Batches" onAction={onViewAll}>
      {total === 0 ? (
        <EmptyState title="No batches" body="Submitted batches move through these stages." />
      ) : (
        <div className="adb-flow">
          <div className="adb-flow__bar" aria-hidden>
            {stages.map((st) =>
              st.count > 0 ? (
                <span key={st.stage} style={{ flexGrow: st.count, background: st.color }} title={st.label} />
              ) : null
            )}
          </div>
          <ul className="adb-flow__stages">
            {stages.map((st) => (
              <li key={st.stage}>
                <button
                  type="button"
                  className={`adb-flow__stage${st.count === 0 ? ' is-empty' : ''}`}
                  onClick={() => onStageClick(st.stage)}
                >
                  <i style={{ background: st.color }} aria-hidden />
                  <span className="adb-flow__label">{st.label}</span>
                  <span className="adb-flow__meta">
                    {st.count > 0 ? formatCurrency(st.totalAmount) : '—'}
                    {st.count > 0 && st.avgTimeHours > 0 && st.stage !== 'submitted'
                      ? ` · ${Math.round(st.avgTimeHours)}h avg`
                      : ''}
                  </span>
                  <b>{st.count}</b>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="adb-panel__foot">
        <span>
          Invoices on hold <b>{invoicesOnHold}</b>
        </span>
        <span>
          Closed <b>{invoicesClosed}</b>
        </span>
      </div>
    </CardShell>
  )
}

export type IntakeItem = {
  id: string
  kind: 'enrollment' | 'handoff'
  title: string
  detail: string
  href: string
}

export function IntakeCard({ items, onOpen }: { items: IntakeItem[]; onOpen: (href: string) => void }) {
  return (
    <CardShell title="Managed intake" icon={Inbox} count={items.length}>
      {items.length === 0 ? (
        <EmptyState title="Intake is clear" body="New enrollments and doc handoffs land here." />
      ) : (
        <ul className="adb-list">
          {items.slice(0, 6).map((item) => {
            const Icon = item.kind === 'enrollment' ? UserPlus : FileUp
            return (
              <li key={item.id}>
                <button type="button" className="adb-list__row" onClick={() => onOpen(item.href)}>
                  <span className={`adb-attn__icon adb-attn__icon--${item.kind === 'enrollment' ? 'medium' : 'low'}`}>
                    <Icon aria-hidden />
                  </span>
                  <div className="adb-list__main">
                    <span className="adb-list__title">{item.title}</span>
                    <span className="adb-list__detail">{item.detail}</span>
                  </div>
                  <ArrowRight className="adb-attn__chev" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </CardShell>
  )
}
