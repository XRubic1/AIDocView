/**
 * Live runner + assigned chase-email blueprint → skip old payment track.
 * Kept separate from ownership helpers to avoid import cycles with assignment.
 */
import { isBlueprintsRunnerEnabled } from '../../config/blueprintsRuntime'
import { resolveBlueprintOwnsChaseFlag } from './blueprintChaseOwnership'
import { getInvoiceBlueprintAssignment } from './invoiceBlueprintAssignment'

export function shouldSkipEmailLifecyclePaymentChase(invoiceId: string): boolean {
  if (!isBlueprintsRunnerEnabled()) return false
  const assignment = getInvoiceBlueprintAssignment(invoiceId)
  if (!assignment) return false
  return resolveBlueprintOwnsChaseFlag(assignment.blueprintId)
}
