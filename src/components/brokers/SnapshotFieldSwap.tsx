import { ArrowLeftRight } from 'lucide-react'

type SnapshotFieldSwapProps = {
  label: string
  previous: string
  proposed: string
  /** True when the form currently shows the Snapshot value. */
  usingProposed: boolean
  onUseProposed: () => void
  onUsePrevious: () => void
}

/** Compact “what’s new” strip under a broker form field. */
export default function SnapshotFieldSwap({
  label,
  previous,
  proposed,
  usingProposed,
  onUseProposed,
  onUsePrevious,
}: SnapshotFieldSwapProps) {
  return (
    <div className="mt-1.5 rounded-md border border-sky-200 bg-sky-50/80 px-2 py-1.5 text-[11px] leading-snug">
      <div className="flex items-start gap-2 min-w-0">
        <span className="shrink-0 mt-0.5 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide bg-[#1684FE] text-white">
          New
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-700 capitalize">{label}</p>
          <p className="text-slate-800 break-words">{proposed}</p>
          {usingProposed ? (
            <p className="mt-0.5 text-slate-500">
              Using Snapshot · previous: <span className="break-words">{previous}</span>
            </p>
          ) : null}
        </div>
        <div className="shrink-0 flex flex-col gap-1">
          <button
            type="button"
            onClick={onUseProposed}
            disabled={usingProposed}
            className="inline-flex items-center justify-center gap-1 rounded border border-[#1684FE]/30 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#1684FE] hover:bg-sky-100 disabled:opacity-40 disabled:cursor-default"
            title="Use BrokerSnapshot value"
          >
            <ArrowLeftRight className="w-3 h-3" aria-hidden />
            Use new
          </button>
          <button
            type="button"
            onClick={onUsePrevious}
            disabled={!usingProposed}
            className="inline-flex items-center justify-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-default"
            title="Restore previous value"
          >
            Previous
          </button>
        </div>
      </div>
    </div>
  )
}
