import EngineLayout from '../components/engine/EngineLayout'
import BolVerificationFiltersSection from '../components/loadReview/factorfox/BolVerificationFiltersSection'
import AiRateLimitSettingsPanel from '../components/admin/AiRateLimitSettingsPanel'
import { Settings } from 'lucide-react'
import { ff } from '../components/loadReview/factorfox/factorFoxTheme'

/** AIDocView engine settings — TPM / DocSort pacing and BOL filters. */
export default function EngineSettingsPage() {
  return (
    <EngineLayout
      headerTitle={
        <div>
          <h1
            className="text-xl font-bold uppercase tracking-wide flex items-center gap-2"
            style={{ color: ff.text, fontFamily: ff.fontDisplay }}
          >
            <Settings className="w-5 h-5" style={{ color: ff.accent }} />
            Settings
          </h1>
          <p className="text-xs mt-1 max-w-xl" style={{ color: ff.textMuted, fontFamily: ff.fontMono }}>
            TPM limits, DocSort pacing, BOL verification filters. Changes apply on the next scan
            or Run review.
          </p>
        </div>
      }
    >
      <div className="p-4 sm:p-6 max-w-3xl mx-auto w-full space-y-6">
        <AiRateLimitSettingsPanel variant="admin" />
        <BolVerificationFiltersSection />
      </div>
    </EngineLayout>
  )
}
