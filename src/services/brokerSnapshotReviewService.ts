import { requireSupabase } from '../lib/supabase'
import { updateBrokerAsync, addBroker } from '../data/mockBrokers'
import type { Broker } from '../types/broker'
import type { BrokerSnapshotSummary } from '../types/brokerSnapshot'

export type BrokerSnapshotChangeStatus = 'pending' | 'applied' | 'dismissed' | 'stale'

export interface BrokerSnapshotChangeRow {
  id: string
  snapshot_id: string
  broker_id: string | null
  mc_number: string | null
  field_key: string
  field_label: string
  old_value: string | null
  new_value: string | null
  status: BrokerSnapshotChangeStatus
  reviewed_at: string | null
  reviewed_by: string | null
  review_note: string | null
  created_at: string
  snapshot?: {
    legal_name: string | null
    payload: BrokerSnapshotSummary
    fetched_at: string
    next_review_at: string
    needs_broker_add: boolean
  } | null
}

/** Load pending Snapshot field changes for Credyx review. */
export async function listPendingBrokerSnapshotChanges(): Promise<BrokerSnapshotChangeRow[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('broker_snapshot_changes')
    .select(
      '*, snapshot:broker_external_snapshots(legal_name, payload, fetched_at, next_review_at, needs_broker_add)'
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)
  return (data ?? []) as BrokerSnapshotChangeRow[]
}

export async function countPendingBrokerSnapshotChanges(): Promise<number> {
  const supabase = requireSupabase()
  const { count, error } = await supabase
    .from('broker_snapshot_changes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) return 0
  return count ?? 0
}

function applyFieldToBroker(broker: Broker, fieldKey: string, newValue: string | null): Broker {
  const next = { ...broker }
  const v = newValue?.trim() || undefined
  switch (fieldKey) {
    case 'name':
      if (v) next.name = v
      break
    case 'dot_number':
      next.dot_number = v
      break
    case 'phone':
      next.phone = v
      break
    case 'fax':
      next.fax = v
      break
    case 'email':
      next.email = v
      break
    case 'contact_person':
      next.contact_person = v
      break
    case 'address':
      next.address = v
      break
    case 'insurance_status':
    case 'operating_status': {
      const stamp = `[Snapshot ${new Date().toISOString().slice(0, 10)}] ${v ?? ''}`
      next.carrier_notes = next.carrier_notes
        ? `${next.carrier_notes}\n${stamp}`
        : stamp
      next.notes = next.notes ? `${next.notes}\n${stamp}` : stamp
      break
    }
    default:
      break
  }
  return next
}

/**
 * Apply one pending change onto the Credyx broker record.
 * For `broker_record`, creates a new broker from the Snapshot payload.
 */
export async function applyBrokerSnapshotChange(
  changeId: string,
  reviewedBy?: string
): Promise<void> {
  const supabase = requireSupabase()
  const { data: change, error } = await supabase
    .from('broker_snapshot_changes')
    .select(
      '*, snapshot:broker_external_snapshots(id, legal_name, payload, mc_number, dot_number, needs_broker_add)'
    )
    .eq('id', changeId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!change) throw new Error('Change not found')
  if (change.status !== 'pending') throw new Error('Change is not pending')

  const snap = change.snapshot as {
    id: string
    legal_name: string | null
    payload: BrokerSnapshotSummary
    mc_number: string | null
    dot_number: string | null
    needs_broker_add: boolean
  } | null

  const payload = snap?.payload
  let brokerId = change.broker_id as string | null

  if (change.field_key === 'broker_record') {
    const id = `broker_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    const created: Broker = {
      id,
      name: payload?.name || snap?.legal_name || change.new_value || 'Unknown broker',
      mc_number: payload?.mcNumber || snap?.mc_number || change.mc_number || undefined,
      dot_number:
        payload?.dotNumber != null
          ? String(payload.dotNumber)
          : snap?.dot_number || undefined,
      phone: payload?.phone || undefined,
      fax: payload?.fax || undefined,
      email: payload?.email || undefined,
      contact_person: payload?.officer || undefined,
      address: payload?.phyAddress || undefined,
      is_new: true,
      carrier_notes: payload?.insuranceNote
        ? `[Snapshot] ${payload.insuranceNote}`
        : undefined,
      payment_terms_days: 30,
    }
    await addBroker(created)
    brokerId = id
    if (snap?.id) {
      await supabase
        .from('broker_external_snapshots')
        .update({ broker_id: id, needs_broker_add: false, updated_at: new Date().toISOString() })
        .eq('id', snap.id)
    }
  } else if (brokerId) {
    const { data: brokerRow, error: brokerErr } = await supabase
      .from('brokers')
      .select('*')
      .eq('id', brokerId)
      .maybeSingle()
    if (brokerErr) throw new Error(brokerErr.message)
    if (!brokerRow) throw new Error('Broker not found')

    const { brokerRowToBroker } = await import('./supabase/brokerMappers')
    const current = brokerRowToBroker(brokerRow)
    const updated = applyFieldToBroker(current, change.field_key, change.new_value)

    const patch: Partial<Broker> = {}
    if (updated.name !== current.name) patch.name = updated.name
    if (updated.dot_number !== current.dot_number) patch.dot_number = updated.dot_number
    if (updated.phone !== current.phone) patch.phone = updated.phone
    if (updated.fax !== current.fax) patch.fax = updated.fax
    if (updated.email !== current.email) patch.email = updated.email
    if (updated.contact_person !== current.contact_person) {
      patch.contact_person = updated.contact_person
    }
    if (updated.address !== current.address) patch.address = updated.address
    if (updated.notes !== current.notes) patch.notes = updated.notes
    if (updated.carrier_notes !== current.carrier_notes) {
      patch.carrier_notes = updated.carrier_notes
    }

    await updateBrokerAsync(brokerId, patch)
  } else {
    throw new Error('No broker linked — apply “Add broker” first')
  }

  const { error: updErr } = await supabase
    .from('broker_snapshot_changes')
    .update({
      status: 'applied',
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy ?? 'admin',
      broker_id: brokerId,
    })
    .eq('id', changeId)

  if (updErr) throw new Error(updErr.message)
}

/** Dismiss one pending change without updating the broker. */
export async function dismissBrokerSnapshotChange(
  changeId: string,
  reviewedBy?: string,
  note?: string
): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase
    .from('broker_snapshot_changes')
    .update({
      status: 'dismissed',
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy ?? 'admin',
      review_note: note ?? null,
    })
    .eq('id', changeId)
  if (error) throw new Error(error.message)
}
