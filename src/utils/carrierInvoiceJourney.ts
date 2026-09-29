/**
 * Plain-language path a carrier sees on an invoice.
 * Credyx runs these steps. A person steps in only when a window is missed.
 */
import type { Invoice } from '../types/invoice'
import { hasPpwBeenSent } from './ppwSent'
import { getWillPayScheduledDate, invoiceHasWillPayStatus } from './invoiceWillPay'

export type CarrierJourneyState = 'done' | 'current' | 'upcoming'

export type CarrierJourneyStep = {
  id: 'paperwork' | 'confirm' | 'payment' | 'paid'
  label: string
  state: CarrierJourneyState
}

export type CarrierInvoiceJourney = {
  headline: string
  steps: CarrierJourneyStep[]
}

function steps(
  states: [CarrierJourneyState, CarrierJourneyState, CarrierJourneyState, CarrierJourneyState]
): CarrierJourneyStep[] {
  const labels = ['Paperwork sent', 'Broker confirms', 'Payment follow-up', 'Paid'] as const
  const ids = ['paperwork', 'confirm', 'payment', 'paid'] as const
  return ids.map((id, index) => ({
    id,
    label: labels[index],
    state: states[index],
  }))
}

export function getCarrierInvoiceJourney(
  invoice: Invoice,
  opts?: { dueDate?: string | null }
): CarrierInvoiceJourney {
  const paid = invoice.status === 'paid'
  const ppw = hasPpwBeenSent(invoice)
  const confirmed = invoice.email_lifecycle?.paperwork_status === 'good'
  const willPay = invoiceHasWillPayStatus(invoice)
  const willPayDate = getWillPayScheduledDate(invoice)
  const due = opts?.dueDate?.slice(0, 10) || invoice.due_date?.slice(0, 10) || null

  if (paid) {
    return {
      headline: 'Paid. Credyx closed this invoice from the remittance.',
      steps: steps(['done', 'done', 'done', 'done']),
    }
  }
  if (willPay && willPayDate) {
    return {
      headline: `Broker will pay on ${willPayDate}. Credyx watches for the remittance.`,
      steps: steps(['done', 'done', 'done', 'current']),
    }
  }
  if (confirmed) {
    return {
      headline: due
        ? `Broker confirmed paperwork. Payment follow-up on ${due}, the broker net date.`
        : 'Broker confirmed paperwork. Payment follow-up starts on the broker net date.',
      steps: steps(['done', 'done', 'current', 'upcoming']),
    }
  }
  if (ppw) {
    return {
      headline: 'Paperwork is with the broker. Credyx is waiting for them to confirm it.',
      steps: steps(['done', 'current', 'upcoming', 'upcoming']),
    }
  }
  return {
    headline: 'When this invoice is processed, Credyx sends the paperwork to the broker.',
    steps: steps(['current', 'upcoming', 'upcoming', 'upcoming']),
  }
}
