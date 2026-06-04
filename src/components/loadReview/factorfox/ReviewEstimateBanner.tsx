import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { ReviewBatchTokenEstimate } from '../../utils/estimateReviewTokens'
import { ff } from './factorFoxTheme'

interface ReviewEstimateBannerProps {
  estimate: ReviewBatchTokenEstimate
  timeLabel?: string | null
}

function formatCostUsd(usd: number): string {
  return usd >= 1 ? `~$${usd.toFixed(2)}` : `~$${usd.toFixed(2)}`
}

/** Compact pre-run TPM + cost estimate — batch list collapsed by default. */
export default function ReviewEstimateBanner({ estimate, timeLabel }: ReviewEstimateBannerProps) {
  const [batchesOpen, setBatchesOpen] = useState(false)

  const riskBg =
    estimate.riskLevel === 'exceeded'
      ? ff.redLight
      : estimate.riskLevel === 'warning'
        ? ff.amberLight
        : ff.bg2
  const riskBorder =
    estimate.riskLevel === 'exceeded'
      ? ff.redBorder
      : estimate.riskLevel === 'warning'
        ? ff.amberBorder
        : ff.border

  const showBatchToggle = estimate.waves.length > 1
  const batchPreview = useMemo(() => {
    if (estimate.waves.length <= 3) return estimate.waves
    return estimate.waves.slice(0, 2)
  }, [estimate.waves])

  return (
    <div
      className="engine-review-estimate"
      style={{ backgroundColor: riskBg, borderColor: riskBorder }}
    >
      <div className="engine-review-estimate-top">
        <span className="engine-review-estimate-label">AI estimate</span>
        <span className="engine-review-estimate-cost">{formatCostUsd(estimate.estimatedCostUsd)}</span>
        <span className="engine-review-estimate-stat">
          ~{estimate.totalTokens.toLocaleString()} tokens
        </span>
        <span className="engine-review-estimate-stat">{estimate.apiCalls} calls</span>
        {timeLabel && <span className="engine-review-estimate-stat">{timeLabel}</span>}
      </div>

      <p className="engine-review-estimate-summary">{estimate.runSummary}</p>

      <p className="engine-review-estimate-meta">
        {estimate.message} · budget {estimate.planBudget.toLocaleString()} TPM (limit{' '}
        {estimate.tpmLimit.toLocaleString()})
      </p>

      {estimate.suggestedParallel === 1 && estimate.configuredParallel > 1 && (
        <p className="engine-review-estimate-warn">
          Running 1 PDF at a time to stay under rate limits (classify + rate con + invoice + BOL per
          file).
        </p>
      )}

      {estimate.maxConcurrentBeforeLimit > 0 &&
        estimate.maxConcurrentBeforeLimit < estimate.configuredParallel && (
          <p className="engine-review-estimate-warn">
            Settings allow {estimate.configuredParallel} parallel — only{' '}
            {estimate.maxConcurrentBeforeLimit} fit under {estimate.tpmLimit.toLocaleString()} TPM.
            Review will use {estimate.suggestedParallel} at a time.
          </p>
        )}

      {showBatchToggle && (
        <div className="engine-review-estimate-batches">
          <button
            type="button"
            className="engine-review-estimate-toggle"
            onClick={() => setBatchesOpen((open) => !open)}
            aria-expanded={batchesOpen}
          >
            <ChevronDown
              className={`engine-review-estimate-chevron${batchesOpen ? ' open' : ''}`}
              aria-hidden
            />
            {batchesOpen
              ? 'Hide batch list'
              : `Show ${estimate.waves.length} batch${estimate.waves.length === 1 ? '' : 'es'}`}
          </button>

          {(batchesOpen || estimate.waves.length <= 3) && (
            <ul className="engine-review-estimate-batch-list">
              {(batchesOpen ? estimate.waves : batchPreview).map((wave) => (
                <li key={wave.waveIndex}>
                  Batch {wave.waveIndex} · {wave.fileCount} file{wave.fileCount === 1 ? '' : 's'} · ~
                  {wave.estimatedPeakTpm.toLocaleString()} TPM — {wave.fileNames.join(', ')}
                </li>
              ))}
              {!batchesOpen && estimate.waves.length > 3 && (
                <li className="engine-review-estimate-more">
                  …and {estimate.waves.length - 2} more batches
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
