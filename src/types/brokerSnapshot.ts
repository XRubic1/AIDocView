/** One active insurance row (UI-safe). */
export interface BrokerSnapshotInsurance {
  companyName: string
  policyNumber: string | null
  effectiveDate: string | null
  maxLimit: number | null
  formCode: number | null
}

/** Cancelled / historical insurance row. */
export interface BrokerSnapshotCancellation {
  companyName: string
  policyNumber: string | null
  effectiveDate: string | null
  cancelEffectiveDate: string | null
  maxLimit: number | null
}

/** Quick top-line insurance verdict for MC Lookup. */
export type BrokerInsuranceVerdict = 'ok' | 'missing' | 'cancelled' | 'warning'

/** UI-safe BrokerSnapshot company summary (Edge Function → client). */
export interface BrokerSnapshotSummary {
  found: boolean
  source?: 'brokersnapshot'
  companyId?: string | null
  name?: string | null
  mcNumber?: string | null
  dotNumber?: number | null
  statusCode?: string | null
  entityType?: string | null
  carrierOperation?: string | null
  operatingStatus?: string | null
  commonAuthority?: string | null
  contractAuthority?: string | null
  brokerAuthority?: string | null
  propertyAuthorized?: boolean | null
  phyAddress?: string | null
  mailAddress?: string | null
  phone?: string | null
  fax?: string | null
  email?: string | null
  officer?: string | null
  officer2?: string | null
  totalTrucks?: number | null
  totalPowerUnits?: number | null
  totalDrivers?: number | null
  ownTractors?: number | null
  ownTrailers?: number | null
  mileage?: number | null
  mileageYear?: number | null
  activeInsuranceCount?: number
  primaryInsurer?: string | null
  insurances?: BrokerSnapshotInsurance[]
  /** Recent cancelled policies from insurance history. */
  cancellations?: BrokerSnapshotCancellation[]
  hasInsuranceCancellation?: boolean
  latestCancellationDate?: string | null
  /** Quick verdict for the top of MC Lookup. */
  insuranceVerdict?: BrokerInsuranceVerdict
  /** Short human note, e.g. "Broker insurance is fine." */
  insuranceNote?: string | null
  safetyRating?: string | null
  safetyRatingDate?: string | null
  addDate?: string | null
  changeDate?: string | null
  cargoGeneralFreight?: boolean | null
  cargoHazmat?: boolean | null
  riskFlags: string[]
  /** Server cache metadata from brokersnapshot-proxy. */
  _meta?: {
    fromCache?: boolean
    fetchedAt?: string
    nextReviewAt?: string
    needsBrokerAdd?: boolean
    pendingChanges?: number
    persistError?: boolean
  }
}

export type BrokerSnapshotLookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; data: BrokerSnapshotSummary }
  | { status: 'not_found'; mcNumber: string }
  | { status: 'error'; message: string }

/** One carrier MC Lookup, with broker status frozen at review time. */
export type BrokerSnapshotLookupLogRow = {
  id: string
  mc_number: string | null
  mc_digits: string
  legal_name: string | null
  insurance_verdict: string | null
  found: boolean | null
  operating_status: string | null
  broker_authority: string | null
  status_label: string | null
  created_at: string
}
