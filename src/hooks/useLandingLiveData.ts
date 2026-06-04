import { useEffect, useMemo, useState } from 'react'
import { AI_REVIEW_CONFIG } from '../config/aiReview'
import {
  EXAMPLE_BATCH_LOAD_COUNT,
  HERO_STATS_BASELINE,
  TYPICAL_SECONDS_PER_LOAD,
  estimateBatchMinutes,
} from '../data/landingMetrics'
import { TICKER_ITEMS as EXAMPLE_TICKER, type TickerItem } from '../data/landingData'
import { getLoadHistory } from '../utils/loadHistoryStore'
import { getCustomReviewRules, getEffectiveBuiltInRules } from '../utils/reviewRulesStore'
import { getAllDispatcherRules } from '../utils/shipperRulesStore'

export interface LandingHeroStat {
  target: number
  prefix: string
  suffix: string
  label: string
  footnote?: string
}

export interface LandingLiveData {
  tickerItems: TickerItem[]
  tickerSource: 'history' | 'examples'
  heroStats: LandingHeroStat[]
  totalReviews: number
  approvalRatePercent: number | null
  rulesCount: number
  rulesCountLabel: string
  recentLoadLabel: string | null
  parallelLoads: number
}

function statusToTicker(status: string): TickerItem['status'] {
  if (status === 'APPROVED') return 'approved'
  if (status === 'REJECTED') return 'rejected'
  return 'review'
}

function formatTickerFromHistory(entry: ReturnType<typeof getLoadHistory>[0]): TickerItem {
  const status = statusToTicker(entry.overallStatus)
  const label =
    status === 'approved' ? 'APPROVED' : status === 'rejected' ? 'REJECTED' : 'NEEDS REVIEW'
  const loadId = entry.loadNumber ? `LD-${entry.loadNumber}` : entry.fileNames[0] ?? 'Load'
  const broker = entry.broker?.trim()
  const amount =
    entry.amount != null ? ` · $${entry.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ''
  const detail =
    entry.result.auditSummary?.flags?.find((f) => f.level === 'ERROR')?.message ??
    entry.fileNames[0]?.replace(/\.pdf$/i, '') ??
    ''

  const loadIdLine = broker
    ? `${loadId} · ${broker}${amount}`
    : `${loadId}${amount}${detail ? ` · ${detail.slice(0, 48)}` : ''}`

  return { status, label, loadId: loadIdLine }
}

function computeApprovalRate(history: ReturnType<typeof getLoadHistory>): number | null {
  if (history.length < 3) return null
  const approved = history.filter((e) => e.overallStatus === 'APPROVED').length
  return Math.round((approved / history.length) * 100)
}

/** Real stats from local review history + engine config; falls back to honest baselines. */
export function useLandingLiveData(): LandingLiveData {
  const [historyVersion, setHistoryVersion] = useState(0)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'aidocview-load-history-v1') setHistoryVersion((v) => v + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return useMemo(() => {
    void historyVersion
    const history = getLoadHistory()
    const parallelLoads = AI_REVIEW_CONFIG.PARALLEL_DOCUMENTS
    const approvalRate = computeApprovalRate(history)

    const builtIn = getEffectiveBuiltInRules().filter((r) => r.enabled)
    const custom = getCustomReviewRules().filter((r) => r.enabled)
    const shipper = getAllDispatcherRules()
    const rulesCount = builtIn.length + custom.length + shipper.length

    const tickerFromHistory = history.slice(0, 12).map(formatTickerFromHistory)
    const tickerItems = tickerFromHistory.length > 0 ? tickerFromHistory : EXAMPLE_TICKER
    const tickerSource = tickerFromHistory.length > 0 ? 'history' : 'examples'

    const heroStats: LandingHeroStat[] = [...HERO_STATS_BASELINE.map((s) => ({ ...s }))]

    if (approvalRate !== null) {
      heroStats[2] = {
        target: approvalRate,
        prefix: '',
        suffix: '%',
        label: 'Approval rate',
      }
    }

    heroStats[1] = {
      target: parallelLoads,
      prefix: '',
      suffix: '',
      label: 'Loads reviewed in parallel',
      footnote: 'Multiple PDFs at once per upload',
    }

    return {
      tickerItems,
      tickerSource,
      heroStats,
      totalReviews: history.length,
      approvalRatePercent: approvalRate,
      rulesCount,
      rulesCountLabel:
        rulesCount > 0 ? `Active rules — ${rulesCount}` : 'Built-in rules included',
      recentLoadLabel: null,
      parallelLoads,
    }
  }, [historyVersion])
}
