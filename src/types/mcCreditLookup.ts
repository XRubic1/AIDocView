export type McCreditSource = 'compass' | 'trufunding' | 'factorsnetwork'

export type McCreditRecord = {
  /** Omitted on the carrier response so the lookup does not name a provider. */
  source?: McCreditSource
  mc: string
  company: string
  dba?: string
  city?: string
  state?: string
  address?: string
  phone?: string
  email?: string | string[]
  creditRating: string
  paydex: string | number
  creditScore: string | number
  dbRate?: string
  noBuy?: string
  warning?: string
  creditNote?: string
  rateDate?: string
  creditExpireDate?: string
  /** Share of similar brokers that pay faster, when that figure is available. */
  payFasterPercent?: string | number
  calcDaysToPay?: {
    all?: string | number
    days90?: string | number
    days60?: string | number
  }
  calcInvCount?: {
    all?: string | number
    days90?: string | number
    days60?: string | number
  }
}

export type McCreditSourceResult = {
  source: McCreditSource
  ok: boolean
  error?: string
  results: McCreditRecord[]
}

export type McCreditSearchResponse = {
  mc: string
  queriedAt: string
  results: McCreditRecord[]
}

export type McCreditVerdict = 'good' | 'caution' | 'avoid' | 'unknown'

export type McCreditAssessment = {
  verdict: McCreditVerdict
  title: string
  summary: string
  company: string
  mc: string
  reasons: string[]
  positives: string[]
  sourceCount: number
}
