import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, MessageSquareWarning } from 'lucide-react'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import type { BrokerRiskLevel } from '../../../types/brokerRisk'
import {
  computeAttentionActions,
  computeConfirmPaymentActions,
  type RequiredAction,
} from '../../../utils/clientActivityMetrics'
import { formatCurrency } from '../../../utils/format'
import { AMOUNT_EPSILON, getInvoiceOpenArBalance } from '../../../utils/paymentVariance'
import { useClientSession } from '../../../hooks/useClientSession'
import { useTenantDataRevision } from '../../../hooks/useTenantDataRevision'
import { buildClientBrokerDirectory } from '../../../utils/clientBrokers'

export type DashboardMainTab = 'cash' | 'overdue' | 'held' | 'confirm' | 'broker'

type DashboardWorkPanelProps = {
  tab: Exclude<DashboardMainTab, 'cash'>
  invoices: Invoice[]
  payments: Payment[]
  loading?: boolean
}

function actionTitle(action: RequiredAction): string {
  const parts = action.label.split(' · ')
  return parts.length > 1 ? parts.slice(1).join(' · ') : action.label
}

function actionBroker(action: RequiredAction): string {
  const parts = action.detail.split(' · ').map((p) => p.trim())
  return parts[1] || ''
}

function actionAmount(
  action: RequiredAction,
  invoices: Invoice[],
  payments: Payment[]
): number {
  if (action.type === 'confirm_payment') {
    const paymentId = action.id.replace(/^confirm-/, '')
    const payment = payments.find((p) => p.id === paymentId)
    return payment?.amount ?? 0
  }
  if (action.type === 'held_invoice') {
    const invoiceId = action.id.replace(/^held-/, '')
    const invoice = invoices.find((inv) => inv.id === invoiceId)
    if (!invoice) return 0
    const balance = getInvoiceOpenArBalance(invoice, payments)
    return balance > AMOUNT_EPSILON ? balance : invoice.amount
  }
  const invoiceId = action.id.replace(/^overdue-/, '')
  const invoice = invoices.find((inv) => inv.id === invoiceId)
  if (!invoice) return 0
  return getInvoiceOpenArBalance(invoice, payments)
}

function latestNoteLine(raw: string): string {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines[lines.length - 1] ?? raw.trim()
}

/**
 * Tab body for Overdue / On hold / Confirm / Broker risk —
 * swaps in place of Cash collected on V3.
 */
export default function DashboardWorkPanel({
  tab,
  invoices,
  payments,
  loading = false,
}: DashboardWorkPanelProps) {
  const navigate = useNavigate()
  const { clientId } = useClientSession()
  const tenantRevision = useTenantDataRevision()

  const actionRows = useMemo(() => {
    const confirms = computeConfirmPaymentActions(payments)
    const attention = computeAttentionActions({ invoices, payments })
    const all = [...confirms, ...attention]
    if (tab === 'overdue') return all.filter((a) => a.type === 'overdue_invoice')
    if (tab === 'held') return all.filter((a) => a.type === 'held_invoice')
    if (tab === 'confirm') return all.filter((a) => a.type === 'confirm_payment')
    return []
  }, [invoices, payments, tab])

  const brokerRows = useMemo(() => {
    void tenantRevision
    if (tab !== 'broker' || !clientId) return []
    const directory = buildClientBrokerDirectory(clientId, invoices, payments)
    return directory
      .filter((b) => b.has_worked_with_client)
      .map((b) => {
        const riskLevel = b.risk?.risk_level ?? null
        const flagged = riskLevel === 'medium' || riskLevel === 'high'
        const catalogNote = b.carrier_notes?.trim() || null
        const reviewNote = b.risk?.review_note?.trim() || null
        const note = catalogNote
          ? latestNoteLine(catalogNote)
          : reviewNote
            ? latestNoteLine(reviewNote)
            : null
        return {
          id: b.broker_id,
          name: b.broker_name,
          riskLevel: riskLevel as BrokerRiskLevel | null,
          flagged,
          note,
          openAr: b.score?.open_ar ?? 0,
        }
      })
      .filter((b) => Boolean(b.note) || b.flagged)
      .sort((a, b) => {
        const noteRank = (x: { note: string | null }) => (x.note ? 0 : 1)
        if (noteRank(a) !== noteRank(b)) return noteRank(a) - noteRank(b)
        const riskRank = (x: { riskLevel: BrokerRiskLevel | null; flagged: boolean }) =>
          x.riskLevel === 'high' ? 0 : x.flagged ? 1 : 2
        if (riskRank(a) !== riskRank(b)) return riskRank(a) - riskRank(b)
        return b.openAr - a.openAr
      })
      .slice(0, 12)
  }, [tab, clientId, invoices, payments, tenantRevision])

  const meta = {
    overdue: {
      title: 'Overdue',
      empty: 'No overdue invoices right now.',
      viewAll: '/client/invoices?status=overdue',
      viewAllLabel: 'View all overdue',
    },
    held: {
      title: 'On hold',
      empty: 'No invoices on hold right now.',
      viewAll: '/client/invoices?status=hold',
      viewAllLabel: 'View all holds',
    },
    confirm: {
      title: 'Confirm pay',
      empty: 'Nothing waiting for confirmation.',
      viewAll: '/client/payments?status=awaiting_receipt',
      viewAllLabel: 'View payments',
    },
    broker: {
      title: 'Broker risk',
      empty: 'No Credyx notes or flagged brokers for your loads right now.',
      viewAll: '/client/brokers',
      viewAllLabel: 'View all brokers',
    },
  }[tab]

  const count = tab === 'broker' ? brokerRows.length : actionRows.length

  return (
    <section
      className={`cdv3-work${loading ? ' is-loading' : ''}`}
      aria-label={meta.title}
    >
      <header className="cdv3-work__head">
        <div className="cdv3-work__titles">
          <h2 className="cdv3-work__title">{meta.title}</h2>
          {count > 0 ? (
            <span className="cdv3-work__count tabular-nums">{count}</span>
          ) : null}
        </div>
        <button
          type="button"
          className="cdv3-work__link"
          onClick={() => navigate(meta.viewAll)}
        >
          {meta.viewAllLabel}
        </button>
      </header>

      {loading ? (
        <p className="cdv3-work__empty">Loading…</p>
      ) : tab === 'broker' ? (
        brokerRows.length === 0 ? (
          <div className="cdv3-work__empty-block">
            <ShieldAlert size={16} strokeWidth={2} aria-hidden />
            <p className="cdv3-work__empty">{meta.empty}</p>
          </div>
        ) : (
          <ul className="cdv3-work__rows">
            {brokerRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="cdv3-work__row"
                  title={row.note ?? row.name}
                  onClick={() =>
                    navigate('/client/brokers?broker=' + encodeURIComponent(row.id))
                  }
                >
                  <span className="cdv3-work__row-main">
                    <span className="cdv3-work__row-top">
                      <span className="cdv3-work__label">{row.name}</span>
                      {row.flagged && row.riskLevel === 'high' ? (
                        <span className="cdv3-work__pill tone-danger">High</span>
                      ) : row.flagged && row.riskLevel === 'medium' ? (
                        <span className="cdv3-work__pill tone-warn">Medium</span>
                      ) : row.note ? (
                        <span className="cdv3-work__pill tone-info">Note</span>
                      ) : null}
                    </span>
                    {row.note ? (
                      <span className="cdv3-work__meta">
                        <MessageSquareWarning size={12} strokeWidth={2.25} aria-hidden />
                        {row.note}
                      </span>
                    ) : (
                      <span className="cdv3-work__meta is-muted">
                        Credyx flagged this broker — open for details.
                      </span>
                    )}
                  </span>
                  {row.openAr > 0 ? (
                    <span className="cdv3-work__amt tabular-nums">
                      {formatCurrency(row.openAr)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : actionRows.length === 0 ? (
        <p className="cdv3-work__empty">{meta.empty}</p>
      ) : (
        <ul className="cdv3-work__rows">
          {actionRows.map((action) => {
            const broker = actionBroker(action)
            const amount = actionAmount(action, invoices, payments)
            const tone =
              action.type === 'overdue_invoice'
                ? 'danger'
                : action.type === 'held_invoice'
                  ? 'warn'
                  : 'info'
            const pill =
              action.type === 'overdue_invoice'
                ? 'Overdue'
                : action.type === 'held_invoice'
                  ? 'On hold'
                  : 'Confirm'
            return (
              <li key={action.id}>
                <button
                  type="button"
                  className="cdv3-work__row"
                  title={action.detail}
                  onClick={() => navigate(action.navigateTo)}
                >
                  <span className={`cdv3-work__pill tone-${tone}`}>{pill}</span>
                  <span className="cdv3-work__row-main">
                    <span className="cdv3-work__label">{actionTitle(action)}</span>
                    {broker ? <span className="cdv3-work__meta">{broker}</span> : null}
                  </span>
                  <span className="cdv3-work__amt tabular-nums">
                    {formatCurrency(amount)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
