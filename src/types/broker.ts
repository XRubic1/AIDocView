// Type definitions for Brokers

export type EmailCategory = 'accounting' | 'paperwork' | 'noa'
export type PhoneCategory = 'accounts_payable' | 'accounts_receivable' | 'rate_verification'

export interface BrokerEmail {
  email: string
  category: EmailCategory
}

export interface BrokerPhone {
  phone: string
  category: PhoneCategory
}

/** Preferred way Credyx contacts this broker for collections. */
export type BrokerPreferredContact = 'email' | 'phone' | 'either'

export interface Broker {
  id: string
  name: string
  contact_person?: string
  email?: string // Legacy field for backward compatibility
  emails?: BrokerEmail[] // New field for multiple emails with categories
  phone?: string // Legacy field for backward compatibility
  phones?: BrokerPhone[] // New field for multiple phones with categories
  fax?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  mc_number?: string
  dot_number?: string
  notes?: string
  payment_terms_days?: number // Due by (days): 0 = no auto due date; N = today + N
  /**
   * Days after PPW was sent before Credyx asks the broker for payment status.
   * Distinct from Due by (when payment is due).
   */
  payment_status_inquiry_days?: number
  /** How Credyx should chase payment status. */
  preferred_contact?: BrokerPreferredContact
  /**
   * Credyx marks this broker NEW for carriers (thin / no payment history).
   * Surfaces as elevated risk until enough pays are on file.
   */
  is_new?: boolean
  /**
   * Credyx notes visible to carriers (distinct from internal `notes`).
   */
  carrier_notes?: string
  /** Which lifecycle emails this broker accepts. Phone-only preferred_contact defaults these off. */
  email_accept?: {
    packet?: boolean
    paperworkStatus?: boolean
    paymentStatus?: boolean
  }
  /** Optional chase-clock overrides (blank fields use Settings defaults). */
  chase_clocks?: {
    paperwork?: Partial<import('./emailLifecycle').EmailTrackClockDefaults>
    payment?: Partial<import('./emailLifecycle').EmailTrackClockDefaults>
  }
}


