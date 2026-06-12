import type { BrokerScoreRow } from '../utils/clientReports'

export type BrokerPayRating = 'green' | 'yellow' | 'red'

export type ClientBrokerNote = {
  id: string
  broker_id: string
  text: string
  created_at: string
  updated_at: string
}

/** Broker profile for the client portal directory. */
export type ClientBrokerProfile = {
  broker_id: string
  broker_name: string
  mc_number: string | null
  dot_number: string | null
  payment_terms_days: number | null
  city: string | null
  state: string | null
  has_worked_with_client: boolean
  in_credyx_network: boolean
  score: BrokerScoreRow | null
  rating: BrokerPayRating
  ai_summary: string
  notes: ClientBrokerNote[]
}
