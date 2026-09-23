/** Per-invoice blueprint assignment (localStorage until live engine). */

export interface InvoiceBlueprintAssignment {
  invoiceId: string
  blueprintId: string
  blueprintName: string
  assignedAt: string
}

const STORAGE_KEY = 'credyx.invoice_blueprint_assignments.v1'

/** Fired when an invoice assignment changes (list UIs can refresh). */
export const INVOICE_BLUEPRINT_CHANGED_EVENT = 'credyx:invoice-blueprint-changed'

function notifyChanged(invoiceId: string): void {
  try {
    window.dispatchEvent(
      new CustomEvent(INVOICE_BLUEPRINT_CHANGED_EVENT, { detail: { invoiceId } })
    )
  } catch {
    /* ignore */
  }
}

function readAll(): Record<string, InvoiceBlueprintAssignment> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, InvoiceBlueprintAssignment>
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, InvoiceBlueprintAssignment>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function getInvoiceBlueprintAssignment(
  invoiceId: string
): InvoiceBlueprintAssignment | null {
  return readAll()[invoiceId] ?? null
}

/** True when staff assigned a blueprint (not merely a demo Activity run). */
export function isInvoiceBlueprintAssigned(invoiceId: string): boolean {
  return Boolean(getInvoiceBlueprintAssignment(invoiceId))
}

export function assignInvoiceBlueprint(
  invoiceId: string,
  blueprintId: string,
  blueprintName: string
): InvoiceBlueprintAssignment {
  const next: InvoiceBlueprintAssignment = {
    invoiceId,
    blueprintId,
    blueprintName,
    assignedAt: new Date().toISOString(),
  }
  const map = readAll()
  map[invoiceId] = next
  writeAll(map)
  notifyChanged(invoiceId)
  return next
}

export function clearInvoiceBlueprintAssignment(invoiceId: string): void {
  const map = readAll()
  delete map[invoiceId]
  writeAll(map)
  notifyChanged(invoiceId)
}
