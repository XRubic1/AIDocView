/** When-card polarity: match when the event is true, or when it is not. */

import type { BlueprintNodeData } from '../../types/blueprintGraph'
import { lookupEventById, formatCatalogCardLine } from './blueprintCatalog'

export type BlueprintWhenMatch = 'yes' | 'no'

export function normalizeWhenMatch(
  data: Pick<BlueprintNodeData, 'whenMatch'> | null | undefined
): BlueprintWhenMatch {
  return data?.whenMatch === 'no' ? 'no' : 'yes'
}

/** Paired labels for the When switch (event-specific when we have clear copy). */
export function whenMatchSwitchLabels(checkId: string | undefined): {
  yes: string
  no: string
} {
  switch (checkId) {
    case 'on_hold':
      return {
        yes: 'Went on hold / is on hold',
        no: 'Removed from hold',
      }
    case 'broker_created':
      return { yes: 'Just created', no: 'Not a new create' }
    case 'batch_processed':
      return { yes: 'Just processed', no: 'Not just processed' }
    case 'invoice_processed':
      return { yes: 'Just processed', no: 'Not just processed' }
    case 'broker_replied':
      return { yes: 'Broker replied', no: 'No reply yet' }
    case 'no_reply':
      return { yes: 'No reply yet', no: 'Broker replied' }
    case 'payment_posted':
      return { yes: 'Payment posted', no: 'Not paid yet' }
    case 'ppw_sent':
      return { yes: 'Paperwork sent', no: 'Paperwork not sent' }
    case 'paperwork_good':
      return { yes: 'Paperwork good', no: 'Paperwork not confirmed' }
    default:
      return { yes: 'If true', no: 'If false' }
  }
}

/** Plain-English line on the When card. */
export function formatWhenCardLine(data: BlueprintNodeData): string {
  const match = normalizeWhenMatch(data)
  const labels = whenMatchSwitchLabels(data.checkId)
  if (data.checkId === 'on_hold') {
    return match === 'yes' ? 'Invoice is on hold' : 'Invoice removed from hold'
  }
  if (data.checkId === 'broker_replied' || data.checkId === 'no_reply') {
    return match === 'yes' ? labels.yes : labels.no
  }
  const event = lookupEventById(data.checkId)
  const base = event
    ? formatCatalogCardLine(event, data.fieldValue)
    : data.fieldKey?.trim() || 'Choose what happened…'
  if (match === 'no') return `Not: ${base}`
  return base
}

export function whenNodePasses(
  data: BlueprintNodeData,
  rawMatched: boolean
): boolean {
  const match = normalizeWhenMatch(data)
  return match === 'yes' ? rawMatched : !rawMatched
}
