import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Waitlist from './pages/Waitlist'
import PrivacyPolicy from './pages/PrivacyPolicy'
import WebsiteTerms from './pages/WebsiteTerms'
import ErrorBoundary from './components/ErrorBoundary'

/**
 * Optional marketing-only shell (`npm run build:waitlist` / VITE_MARKETING_ONLY).
 * Production Vercel uses the full App (portals + Schedule Demo at /).
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
          <Route path="/demo" element={<Navigate to="/" replace />} />
          <Route path="/waitlist" element={<Navigate to="/" replace />} />
          <Route path="/join" element={<Navigate to="/" replace />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<WebsiteTerms />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
