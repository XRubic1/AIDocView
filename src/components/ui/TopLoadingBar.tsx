import '../../styles/loadingBar.css'

/** Thin indeterminate bar pinned to the top of its (relatively positioned) parent. */
export default function TopLoadingBar({ active, fixed = false }: { active: boolean; fixed?: boolean }) {
  if (!active) return null
  return (
    <div className={`top-loading-bar${fixed ? ' top-loading-bar--fixed' : ''}`} role="progressbar" aria-label="Loading" aria-busy="true">
      <span className="top-loading-bar__fill" />
    </div>
  )
}
