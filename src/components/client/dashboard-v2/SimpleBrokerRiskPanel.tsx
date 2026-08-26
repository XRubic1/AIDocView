import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, MessageSquareWarning } from 'lucide-react'
import type { Invoice } from '../../../types/invoice'
import type { Payment } from '../../../types/payment'
import type { BrokerRiskLevel } from '../../../types/brokerRisk'
import { useClientSession } from '../../../hooks/useClientSession'
import { useTenantDataRevision } from '../../../hooks/useTenantDataRevision'
import { buildClientBrokerDirectory } from '../../../utils/clientBrokers'

type SimpleBrokerRiskPanelProps = {
  invoices: Invoice[]
  payments: Payment[]
  loading?: boolean
}

type BrokerRiskRow = {
  id: string
  name: string
  riskLevel: BrokerRiskLevel | null
  flagged: boolean
  /** Credyx note visible to this carrier (catalog note or published review). */
  note: string | null
  openAr: number
}

/** Latest non-empty line from a multi-line Credyx note. */
function latestNoteLine(raw: string): string {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines[lines.length - 1] ?? raw.trim()
}

/**
 * Broker Risk card for the calm dashboard —
 * surfaces Credyx notes + flagged risk for brokers this carrier works with.
 */
export default function SimpleBrokerRiskPanel({
  invoices,
  payments,
  loading = false,
}: SimpleBrokerRiskPanelProps) {
  const navigate = useNavigate()
  const { clientId } = useClientSession()
  const tenantRevision = useTenantDataRevision()

  const { rows, noteCount, flaggedCount } = useMemo(() => {
    void tenantRevision
    if (!clientId) {
      return { rows: [] as BrokerRiskRow[], noteCount: 0, flaggedCount: 0 }
    }

    const directory = buildClientBrokerDirectory(clientId, invoices, payments)
    const mapped: BrokerRiskRow[] = directory
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
          riskLevel,
          flagged,
          note,
          openAr: b.score?.open_ar ?? 0,
        }
      })
      // Only brokers with a Credyx note or elevated risk — keep the card actionable.
      .filter((b) => Boolean(b.note) || b.flagged)
      .sort((a, b) => {
        // Notes first, then High > Medium, then open A/R.
        const noteRank = (x: BrokerRiskRow) => (x.note ? 0 : 1)
        if (noteRank(a) !== noteRank(b)) return noteRank(a) - noteRank(b)
        const riskRank = (x: BrokerRiskRow) =>
          x.riskLevel === 'high' ? 0 : x.flagged ? 1 : 2
        if (riskRank(a) !== riskRank(b)) return riskRank(a) - riskRank(b)
        return b.openAr - a.openAr
      })

    return {
      rows: mapped.slice(0, 6),
      noteCount: mapped.filter((b) => Boolean(b.note)).length,
      flaggedCount: mapped.filter((b) => b.flagged).length,
    }
  }, [clientId, invoices, payments, tenantRevision])

  const badge = (level: BrokerRiskLevel | null, flagged: boolean): string | null => {
    if (flagged && level === 'high') return 'High'
    if (flagged && level === 'medium') return 'Medium'
    return null
  }

  return (
    <section
      className={`cdv2-broker-risk${loading ? ' is-loading' : ''}`}
      aria-label="Broker risk"
    >
      <header className="cdv2-broker-risk__head">
        <div className="cdv2-broker-risk__title-row">
          <h2 className="cdv2-broker-risk__title">Broker Risk</h2>
          {noteCount + flaggedCount > 0 ? (
            <span className="cdv2-broker-risk__count tabular-nums" aria-hidden>
              {noteCount + flaggedCount}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="cdv2-broker-risk__link"
          onClick={() => navigate('/client/brokers')}
        >
          View all
        </button>
      </header>

      {loading ? (
        <p className="cdv2-broker-risk__empty">Loading broker risk…</p>
      ) : rows.length === 0 ? (
        <div className="cdv2-broker-risk__empty-block">
          <ShieldAlert size={16} strokeWidth={2} aria-hidden />
          <p className="cdv2-broker-risk__empty">
            No Credyx notes or flagged brokers for your loads right now.
          </p>
        </div>
      ) : (
        <ul className="cdv2-broker-risk__rows">
          {rows.map((row) => {
            const levelBadge = badge(row.riskLevel, row.flagged)
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className="cdv2-broker-risk__row"
                  title={row.note ?? row.name}
                  onClick={() => {
                    navigate(
                      '/client/brokers?broker=' + encodeURIComponent(row.id)
                    )
                  }}
                >
                  <span className="cdv2-broker-risk__row-top">
                    <span className="cdv2-broker-risk__name">{row.name}</span>
                    {levelBadge ? (
                      <span
                        className={`cdv2-broker-risk__flag cdv2-broker-risk__flag--${row.riskLevel}`}
                      >
                        {levelBadge}
                      </span>
                    ) : row.note ? (
                      <span className="cdv2-broker-risk__flag cdv2-broker-risk__flag--note">
                        Note
                      </span>
                    ) : null}
                  </span>
                  {row.note ? (
                    <span className="cdv2-broker-risk__note">
                      <MessageSquareWarning size={12} strokeWidth={2.25} aria-hidden />
                      <span>{row.note}</span>
                    </span>
                  ) : (
                    <span className="cdv2-broker-risk__note cdv2-broker-risk__note--muted">
                      Credyx flagged this broker — open for details.
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
