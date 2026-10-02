import '../styles/credyxMarketing.css'
import { MarketingHeader } from '../components/enroll/MarketingHeader'
import ClientMcLookup from './ClientMcLookup'

/** MC, DOT, and FF lookup with no client sign-in. */
export default function PublicMcCheck() {
  return (
    <div
      className="credyx-page credyx-page--waitlist credyx-page--mc-check flex h-screen flex-col"
    >
      <MarketingHeader />
      <main className="min-h-0 flex-1">
        <ClientMcLookup introduce />
      </main>
    </div>
  )
}
