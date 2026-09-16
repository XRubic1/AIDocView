/**
 * Invoice facts block for calendar event detail (admin + carrier).
 */
import type { CalendarInvoiceFacts } from '../../utils/calendarInvoiceDetails'

interface CalendarInvoiceFactsProps {
  facts: CalendarInvoiceFacts
}

/** Extra invoice fields + recent notes under a calendar event. */
export default function CalendarInvoiceFactsPanel({ facts }: CalendarInvoiceFactsProps) {
  return (
    <div className="assistant-event-detail__invoice">
      <dl className="assistant-event-detail__grid">
        {facts.brokerName ? (
          <div>
            <dt>Broker</dt>
            <dd>{facts.brokerName}</dd>
          </div>
        ) : null}
        {facts.loadNumber ? (
          <div>
            <dt>Load</dt>
            <dd>{facts.loadNumber}</dd>
          </div>
        ) : null}
        {facts.purchasedOn ? (
          <div>
            <dt>Purchased</dt>
            <dd>{facts.purchasedOn}</dd>
          </div>
        ) : null}
        {facts.purchasedBy ? (
          <div>
            <dt>Purchased by</dt>
            <dd>{facts.purchasedBy}</dd>
          </div>
        ) : null}
        {facts.submittedOn ? (
          <div>
            <dt>Submitted</dt>
            <dd>{facts.submittedOn}</dd>
          </div>
        ) : null}
        <div>
          <dt>Status</dt>
          <dd>{facts.statusLabel}</dd>
        </div>
      </dl>

      {facts.notes.length > 0 ? (
        <div className="assistant-event-detail__notes">
          <p className="assistant-event-detail__notes-label">Notes</p>
          {facts.notes.map((note) => (
            <article key={note.id} className="assistant-event-detail__note">
              <p className="assistant-event-detail__note-text">{note.text}</p>
              <p className="assistant-event-detail__note-meta">
                {note.typeLabel} · {note.by} · {note.atLabel}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="assistant-event-detail__notes-empty">No notes on this invoice yet.</p>
      )}
    </div>
  )
}
