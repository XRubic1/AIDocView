import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Waitlist from './pages/Waitlist'
import PrivacyPolicy from './pages/PrivacyPolicy'
import WebsiteTerms from './pages/WebsiteTerms'
import ErrorBoundary from './components/ErrorBoundary'

/**
 * Public waitlist site shell for Vercel marketing deploys.
 * Only marketing routes — product app is not included in this bundle.
 */
export default function WaitlistApp() {
  return (
    <ErrorBoundary>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/" element={<Waitlist />} />
          <Route path="/waitlist" element={<Waitlist />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<WebsiteTerms />} />
          <Route path="/join" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
