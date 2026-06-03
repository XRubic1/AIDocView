/** Pipeline doc types from Prompt 1 classifier. */
export type PipelineDocType =
  | 'RATE_CON'
  | 'BOL'
  | 'INVOICE'
  | 'POD'
  | 'LUMPER_RECEIPT'
  | 'SCALE_TICKET'
  | 'DELIVERY_CONFIRMATION'
  | 'TRAILER_CONTROL_RECORD'
  | 'STAMPED_BOL'
  | 'BLANK'
  | 'UNKNOWN'

export interface RateConAddress {
  name?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  pickup_date?: string
  pickup_time_open?: string
  pickup_time_close?: string
}

export interface RateConDestination extends RateConAddress {
  stop_number?: number
  delivery_date?: string
  delivery_time_open?: string
  delivery_time_close?: string
}

/** Prompt — carrier freight invoice extraction (§3.3). */
export interface InvoiceParse {
  invoice_number?: string | null
  load_number?: string | null
  broker_name?: string | null
  carrier_name?: string | null
  amount_total?: number | null
  invoice_date?: string | null
  line_items?: Array<{ description?: string; amount?: number | null }>
  confidence?: number
  notes?: string | null
}

export interface RateConLineItem {
  description?: string | null
  amount?: number | null
  category?: 'linehaul' | 'fuel' | 'unloading' | 'detention' | 'other'
}

/** Prompt 2 — full rate con parse. */
export interface RateConParse {
  load_number?: string | null
  broker_name?: string | null
  broker_mc?: string | null
  carrier_name?: string | null
  carrier_mc?: string | null
  rate_total?: number | null
  rate_currency?: string
  origin?: RateConAddress
  destinations?: RateConDestination[]
  commodity?: string | null
  weight?: string | null
  temperature?: string | null
  special_instructions?: string | null
  rate_line_items?: RateConLineItem[]
  bol_reference_numbers?: string[]
  confidence?: number
}

export type AuditPassFail = 'PASS' | 'FAIL' | 'PARTIAL' | 'INCOMPLETE' | 'UNKNOWN'
export type SignatureStatus = 'PRESENT' | 'MISSING' | 'UNCLEAR' | 'PASS_BY_RULE'
/** Whether a signature appears authentic vs possibly forged or stamped digitally. */
export type SignatureAuthenticityStatus = 'NONE' | 'NOTED' | 'UNCLEAR'

/** Prompt 3 — BOL audit report. */
export interface BolAudit {
  destination_match: AuditPassFail
  destination_notes?: string
  legibility: 'PASS' | 'FAIL'
  legibility_notes?: string
  page_count: AuditPassFail
  page_count_notes?: string
  signatures: {
    carrier: SignatureStatus
    shipper: SignatureStatus
    receiver: SignatureStatus
    receiver_date: SignatureStatus
    receiver_authenticity?: SignatureAuthenticityStatus
    shipper_authenticity?: SignatureAuthenticityStatus
    carrier_authenticity?: SignatureAuthenticityStatus
    rule_applied?: string | null
  }
  ship_from?: string
  ship_to?: string
  load_number?: string
  reference_numbers?: string[]
  delivery_exceptions?: {
    damages: 'NONE' | 'NOTED' | 'UNCLEAR'
    shortage: 'NONE' | 'NOTED' | 'UNCLEAR'
    protest: 'NONE' | 'NOTED' | 'UNCLEAR'
    notes?: string
  }
  overall: 'APPROVED' | 'NEEDS_REVIEW'
  flags: string[]
}

/** Prompt 4 — cross-validation. */
export type CrossCheckStatus = 'MATCH' | 'MISMATCH' | 'OVERAGE_EXPLAINED' | 'EXPLAINED_BY_LUMPER' | 'CONFIRMED' | 'WARNING' | 'COMPLETE' | 'INCOMPLETE'

export interface CrossValidationFlag {
  level: 'ERROR' | 'WARNING' | 'INFO'
  field: string
  message: string
}

export interface CrossValidationResult {
  load_number: { status: 'MATCH' | 'MISMATCH'; details: string }
  broker: { status: 'MATCH' | 'MISMATCH'; details: string }
  amount: {
    status: 'MATCH' | 'MISMATCH' | 'OVERAGE_EXPLAINED' | 'EXPLAINED_BY_LUMPER'
    rate_con_amount?: number | null
    invoice_amount?: number | null
    difference?: number | null
    details: string
  }
  carrier: { status: 'CONFIRMED' | 'WARNING' | 'MISMATCH'; details: string }
  multi_stop_coverage: {
    status: 'COMPLETE' | 'INCOMPLETE'
    missing_stops: (number | string)[]
    stop_count?: number
    bol_unit_count?: number
    details?: string
  }
  overall: 'APPROVED' | 'NEEDS_REVIEW' | 'REJECTED'
  flags: CrossValidationFlag[]
}

/** Prompt 5 — dispatcher-created shipper rule. */
export interface DispatcherShipperRule {
  rule_id: string
  trigger: {
    shipper_name?: string | null
    doc_type?: string | null
    condition: string
  }
  override: {
    field: string
    result: string
    reason: string
  }
  created_by: string
  example_note?: string
}

/** Prompt 6 — final load audit summary. */
export interface LoadAuditSummary {
  overallStatus: 'APPROVED' | 'NEEDS_REVIEW' | 'REJECTED'
  loadNumber?: string
  broker?: string
  amount?: number
  documentsReceived: Array<{
    name: string
    status: 'ok' | 'missing' | 'partial' | 'info'
    detail?: string
  }>
  flags: CrossValidationFlag[]
  rulesApplied: string[]
  narrative: string
}

/** Attached to batch review after full pipeline. */
export interface LoadAuditPipeline {
  bolAudit?: BolAudit
  crossValidation?: CrossValidationResult
  rateConParse?: RateConParse
  summary?: LoadAuditSummary
}
