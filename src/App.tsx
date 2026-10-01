import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ClientProtectedLayout from './components/client/ClientProtectedLayout'
import AdminProtectedLayout from './components/admin/AdminProtectedLayout'
import { ThemeProvider } from './theme/ThemeContext'
import Login from './pages/Login'
import ClientLogin from './pages/ClientLogin'
import ClientSetupPassword from './pages/ClientSetupPassword'
import Enroll from './pages/Enroll'
import Waitlist from './pages/Waitlist'
import LandingPage from './pages/LandingPage'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/ui/ToastProvider'
import LegacyClientAttentionRedirect from './pages/LegacyClientAttentionRedirect'
import {
  Accounting,
  AdminDashboard,
  AdminWaitlist,
  AdminSales,
  AdminNotifications,
  AdminWorkQueue,
  AdminBrokerRisk,
  AdminBlueprints,
  AdminBrokerSnapshot,
  AgingAR,
  BrokerAgingInvoicesPopup,
  CarrierAgingBrokersPopup,
  AuditDashboard,
  AdminCalendar,
  AdminAssistant,
  Batches,
  Brokers,
  ClientAssistant,
  ClientAttention,
  ClientBatches,
  ClientBrokers,
  ClientCollections,
  ClientCollectionsQueue,
  ClientDashboardV2,
  ClientDashboardV3,
  OnboardingDashboard,
  ClientDocuments,
  ClientInvoices,
  ClientInvoicesV2,
  ClientPayments,
  ClientReports,
  ClientSettings,
  ClientShortPayments,
  ClientTutorials,
  Clients,
  Collections,
  CollectionsInvoicePopup,
  AdminEmailInbox,
  AdminDocs,
  CreateBatch,
  DocSortLandingPage,
  DocumentReviewTest,
  EngineSettingsPage,
  HowItWorks,
  AdminInvoices,
  AdminInvoiceWorkspace,
  Billing,
  BillingInvoiceWorkspace,
  LoadHistoryPage,
  LoadReviewWorkbench,
  PaymentPosting,
  PlatformLandingPage,
  PrivacyPolicy,
  ReviewRulesPage,
  Settings,
  Tour,
  Users,
  WebsiteTerms,
  withRouteSuspense,
} from './routes/lazyPages'

const isDev = import.meta.env.DEV

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/enroll" element={<Enroll />} />
              {/* Public Schedule Demo marketing site — also hosts client + admin login on this deploy */}
              <Route path="/" element={<Waitlist />} />
              <Route path="/demo" element={<Navigate to="/" replace />} />
              <Route path="/waitlist" element={<Navigate to="/" replace />} />
              <Route path="/join" element={<Navigate to="/" replace />} />
              <Route path="/tour" element={withRouteSuspense(Tour, 'Loading tour…')} />
              <Route path="/how-it-works" element={withRouteSuspense(HowItWorks)} />
              <Route
                path="/privacy"
                element={withRouteSuspense(PrivacyPolicy, 'Loading privacy policy…')}
              />
              <Route
                path="/terms"
                element={withRouteSuspense(WebsiteTerms, 'Loading terms…')}
              />
              <Route path="/login" element={<Login />} />
              <Route path="/client/login" element={<ClientLogin />} />
              <Route path="/client/setup-password" element={<ClientSetupPassword />} />
              <Route path="/landing" element={<LandingPage />} />
              <Route path="/home" element={withRouteSuspense(PlatformLandingPage)} />
              <Route path="/docsort" element={withRouteSuspense(DocSortLandingPage)} />

              <Route element={<ClientProtectedLayout />}>
                <Route
                  path="/client/dashboard"
                  element={withRouteSuspense(ClientDashboardV2, 'Loading dashboard…')}
                />
                <Route
                  path="/client/dashboard-v2"
                  element={<Navigate to="/client/dashboard" replace />}
                />
                <Route
                  path="/client/dashboard-v3"
                  element={withRouteSuspense(ClientDashboardV3, 'Loading dashboard…')}
                />
                <Route
                  path="/client/onboarding"
                  element={withRouteSuspense(OnboardingDashboard, 'Loading dashboard…')}
                />
                <Route path="/client/batches" element={withRouteSuspense(ClientBatches)} />
                <Route path="/client/invoices" element={withRouteSuspense(ClientInvoices)} />
                <Route
                  path="/client/invoices-v2"
                  element={withRouteSuspense(ClientInvoicesV2, 'Loading invoices…')}
                />
                <Route
                  path="/client/invoices/needattention"
                  element={withRouteSuspense(ClientAttention, 'Loading invoices…')}
                />
                <Route path="/client/attention" element={<LegacyClientAttentionRedirect />} />
                <Route path="/client/payments" element={withRouteSuspense(ClientPayments)} />
                <Route
                  path="/client/short-payments"
                  element={withRouteSuspense(ClientShortPayments)}
                />
                <Route path="/client/aging-ar" element={withRouteSuspense(ClientCollections)} />
                <Route
                  path="/client/collections"
                  element={withRouteSuspense(ClientCollectionsQueue)}
                />
                <Route path="/client/brokers" element={withRouteSuspense(ClientBrokers)} />
                <Route path="/mclookup" element={<Navigate to="/client/brokers?tab=mc-check" replace />} />
                <Route path="/client/assistant" element={withRouteSuspense(ClientAssistant)} />
                <Route path="/client/reports" element={withRouteSuspense(ClientReports)} />
                <Route path="/client/documents" element={withRouteSuspense(ClientDocuments)} />
                <Route path="/client/tutorials" element={withRouteSuspense(ClientTutorials)} />
                <Route path="/client/settings" element={withRouteSuspense(ClientSettings)} />
              </Route>

              <Route element={<AdminProtectedLayout />}>
                <Route path="/admin/dashboard" element={withRouteSuspense(AdminDashboard)} />
                <Route path="/admin/waitlist" element={withRouteSuspense(AdminWaitlist)} />
                <Route path="/admin/sales" element={withRouteSuspense(AdminSales)} />
                <Route path="/admin/notifications" element={withRouteSuspense(AdminNotifications)} />
                <Route path="/admin/work-queue" element={withRouteSuspense(AdminWorkQueue)} />
                <Route path="/admin/broker-risk" element={withRouteSuspense(AdminBrokerRisk)} />
                <Route path="/admin/blueprints" element={withRouteSuspense(AdminBlueprints)} />
                <Route
                  path="/admin/broker-snapshot"
                  element={withRouteSuspense(AdminBrokerSnapshot)}
                />
                <Route path="/batches" element={withRouteSuspense(Batches)} />
                <Route path="/batches/create" element={withRouteSuspense(CreateBatch)} />
                <Route path="/aging-ar" element={withRouteSuspense(AgingAR)} />
                <Route
                  path="/aging-ar/broker"
                  element={withRouteSuspense(BrokerAgingInvoicesPopup)}
                />
                <Route
                  path="/aging-ar/carrier"
                  element={withRouteSuspense(CarrierAgingBrokersPopup)}
                />
                <Route path="/invoices" element={withRouteSuspense(AdminInvoices)} />
                <Route
                  path="/invoices/workspace"
                  element={withRouteSuspense(AdminInvoiceWorkspace)}
                />
                <Route path="/invoice-search" element={withRouteSuspense(AdminInvoices)} />
                <Route path="/brokers" element={withRouteSuspense(Brokers)} />
                <Route path="/clients" element={withRouteSuspense(Clients)} />
                <Route path="/admin/calendar" element={withRouteSuspense(AdminCalendar)} />
                <Route path="/admin/assistant" element={withRouteSuspense(AdminAssistant)} />
                <Route path="/collections" element={withRouteSuspense(Collections)} />
                <Route
                  path="/collections/invoice/:invoiceId"
                  element={withRouteSuspense(CollectionsInvoicePopup)}
                />
                <Route path="/admin/inbox" element={withRouteSuspense(AdminEmailInbox)} />
                <Route path="/docs" element={withRouteSuspense(AdminDocs)} />
                <Route path="/force-close" element={withRouteSuspense(AdminDocs)} />
                <Route path="/accounting" element={withRouteSuspense(Accounting)} />
                <Route path="/payment-posting" element={withRouteSuspense(PaymentPosting)} />
                <Route path="/billing" element={withRouteSuspense(Billing)} />
                <Route
                  path="/billing/workspace"
                  element={withRouteSuspense(BillingInvoiceWorkspace)}
                />
                <Route path="/Audit/dashboard" element={withRouteSuspense(AuditDashboard)} />
                <Route path="/users" element={withRouteSuspense(Users)} />
                <Route path="/settings" element={withRouteSuspense(Settings)} />
                <Route path="/engine" element={withRouteSuspense(LoadReviewWorkbench)} />
                <Route path="/engine/settings" element={withRouteSuspense(EngineSettingsPage)} />
                <Route path="/engine/rules" element={withRouteSuspense(ReviewRulesPage)} />
              </Route>

              {isDev && (
                <>
                  <Route path="/sort" element={withRouteSuspense(LoadReviewWorkbench)} />
                  <Route path="/dev/load-review" element={withRouteSuspense(LoadReviewWorkbench)} />
                  <Route path="/dev/document-review" element={withRouteSuspense(LoadReviewWorkbench)} />
                  <Route
                    path="/dev/document-review/test"
                    element={withRouteSuspense(DocumentReviewTest)}
                  />
                  <Route path="/dev/rules" element={withRouteSuspense(ReviewRulesPage)} />
                  <Route path="/dev/shipper-rules" element={withRouteSuspense(ReviewRulesPage)} />
                  <Route path="/dev/load-history" element={withRouteSuspense(LoadHistoryPage)} />
                </>
              )}
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
