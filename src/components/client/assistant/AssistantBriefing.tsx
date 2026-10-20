import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock, MessageCircle } from 'lucide-react'
import type { Briefing, BriefingItem } from '../../../utils/assistantBriefing'
import { formatCurrency } from '../../../utils/format'
import {
  clientInvoiceDetailPath,
  clientInvoiceUploadPath,
} from '../../../utils/openClientInvoice'
import '../../../styles/assistantBriefing.css'

interface AssistantBriefingProps {
  briefing: Briefing
  /** Hand a question to the chat. */
  onAsk: (prompt: string) => void
}

function BriefingRow({
  item,
  onAsk,
}: {
  item: BriefingItem
  onAsk: (prompt: string) => void
}) {
  const navigate = useNavigate()

  const run = () => {
    if (!item.action) return
    if (item.action.type === 'upload') navigate(clientInvoiceUploadPath(item.invoiceId))
    else if (item.action.type === 'open_payments') navigate('/client/payments')
    else navigate(clientInvoiceDetailPath(item.invoiceId))
  }

  return (
    <li className={`brf-item${item.owner === 'you' ? ' is-you' : ''}`}>
      <div className="brf-item__top">
        <span className={`brf-owner brf-owner--${item.owner}`}>
          {item.owner === 'you' ? 'You' : 'Credyx'}
        </span>
        <h4 className="brf-item__title">{item.title}</h4>
        <span className="brf-item__amount tabular-nums">{item.amountLabel}</span>
      </div>
      <p className="brf-item__meta">
        Invoice #{item.invoiceNumber} · {item.brokerName}
        {item.daysOpen > 0 ? ` · ${item.daysOpen}d` : ''}
      </p>
      <p className="brf-item__why">{item.why}</p>
      <p className="brf-item__next">
        <strong>{item.owner === 'you' ? 'Next step: ' : 'Status: '}</strong>
        {item.nextStep}
      </p>
      <div className="brf-item__actions">
        {item.action ? (
          <button
            type="button"
            className={`brf-btn${item.owner === 'you' ? ' brf-btn--primary' : ''}`}
            onClick={run}
          >
            {item.action.label}
          </button>
        ) : null}
        <button
          type="button"
          className="brf-btn brf-btn--ghost"
          onClick={() =>
            onAsk(
              `Tell me more about invoice #${item.invoiceNumber}: ${item.title.toLowerCase()}. What should I do?`
            )
          }
        >
          <MessageCircle size={13} strokeWidth={2.25} aria-hidden />
          Ask
        </button>
      </div>
    </li>
  )
}

/** Today view: what needs the carrier, what Credyx is handling, and cash coming in. */
export default function AssistantBriefing({ briefing, onAsk }: AssistantBriefingProps) {
  const { totals, items, forecast, brokers } = briefing
  const you = items.filter((i) => i.owner === 'you')
  const credyx = items.filter((i) => i.owner === 'credyx')
  const maxWeek = Math.max(1, ...forecast.map((w) => w.expected + w.onHold))

  return (
    <div className="brf">
      <header className="brf-hero">
        <h2 className="brf-hero__title">{briefing.headline}</h2>
        <p className="brf-hero__sub">{briefing.subline}</p>
        <dl className="brf-stats">
          <div>
            <dt>Needs you</dt>
            <dd className={totals.needsYouCount > 0 ? 'is-warn' : ''}>{totals.needsYouCount}</dd>
          </div>
          <div>
            <dt>On hold</dt>
            <dd className="tabular-nums">{formatCurrency(totals.onHoldAmount)}</dd>
          </div>
          <div>
            <dt>Next 7 days</dt>
            <dd className="tabular-nums">{formatCurrency(totals.expectedNext7Days)}</dd>
          </div>
          <div>
            <dt>Open A/R</dt>
            <dd className="tabular-nums">{formatCurrency(totals.openAmount)}</dd>
          </div>
        </dl>
      </header>

      {you.length > 0 ? (
        <section className="brf-section">
          <h3 className="brf-section__title is-warn">Do these first</h3>
          <ul className="brf-list">
            {you.map((i) => (
              <BriefingRow key={i.id} item={i} onAsk={onAsk} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="brf-clear">
          <CheckCircle2 size={16} strokeWidth={2.25} aria-hidden /> Nothing is waiting on you.
        </p>
      )}

      {credyx.length > 0 ? (
        <section className="brf-section">
          <h3 className="brf-section__title">
            <Clock size={14} strokeWidth={2.25} aria-hidden /> Credyx is handling
          </h3>
          <ul className="brf-list">
            {credyx.map((i) => (
              <BriefingRow key={i.id} item={i} onAsk={onAsk} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="brf-section">
        <h3 className="brf-section__title">Cash coming in</h3>
        <ul className="brf-forecast">
          {forecast.map((w) => (
            <li key={w.startKey}>
              <span className="brf-forecast__label">{w.label}</span>
              <span className="brf-forecast__bar" aria-hidden>
                <i
                  className="is-expected"
                  style={{ width: `${(w.expected / maxWeek) * 100}%` }}
                />
                <i className="is-hold" style={{ width: `${(w.onHold / maxWeek) * 100}%` }} />
              </span>
              <span className="brf-forecast__amount tabular-nums">
                {formatCurrency(w.expected)}
                {w.onHold > 0 ? (
                  <em> + {formatCurrency(w.onHold)} held</em>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="brf-foot">
          Held money is shown separately — it only arrives after the hold is cleared.
        </p>
      </section>

      {brokers.length > 0 ? (
        <section className="brf-section">
          <h3 className="brf-section__title">How your brokers pay</h3>
          <ul className="brf-brokers">
            {brokers.map((b) => (
              <li key={b.brokerName}>
                <div className="brf-brokers__head">
                  <span className="brf-brokers__name">{b.brokerName}</span>
                  <span className="tabular-nums">{formatCurrency(b.openAmount)} open</span>
                </div>
                <p className="brf-brokers__note">{b.note}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
