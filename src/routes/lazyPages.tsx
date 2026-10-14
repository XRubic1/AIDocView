import { lazy, type ComponentType, type ReactNode, Suspense } from 'react'
import PageLoader from '../components/ui/PageLoader'

/** Wrap lazy route elements with a branded Suspense fallback. */
export function withRouteSuspense(
  Component: ComponentType,
  message = 'Loading page…'
): ReactNode {
  return (
    <Suspense fallback={<PageLoader message={message} fullScreen={false} />}>
      <Component />
    </Suspense>
  )
}

// ——— Client portal ———
export const ClientDashboardV2 = lazy(() => import('../pages/ClientDashboardV2'))
export const ClientDashboardV3 = lazy(() => import('../pages/ClientDashboardV3'))
export const OnboardingDashboard = lazy(() => import('../pages/OnboardingDashboard'))
export const ClientBatches = lazy(() => import('../pages/ClientBatches'))
export const ClientInvoices = lazy(() => import('../pages/ClientInvoices'))
export const ClientInvoicesV2 = lazy(() => import('../pages/ClientInvoicesV2'))
export const ClientPayments = lazy(() => import('../pages/ClientPayments'))
export const ClientShortPayments = lazy(() => import('../pages/ClientShortPayments'))
export const ClientCollections = lazy(() => import('../pages/ClientCollections'))
export const ClientCollectionsQueue = lazy(() => import('../pages/ClientCollectionsQueue'))
export const ClientReports = lazy(() => import('../pages/ClientReports'))
export const ClientBrokers = lazy(() => import('../pages/ClientBrokers'))
export const ClientMcLookup = lazy(() => import('../pages/ClientMcLookup'))
export const PublicMcCheck = lazy(() => import('../pages/PublicMcCheck'))
export const ClientAssistant = lazy(() => import('../pages/ClientAssistant'))
export const ClientSettings = lazy(() => import('../pages/ClientSettings'))
export const ClientDocuments = lazy(() => import('../pages/ClientDocuments'))
export const ClientTutorials = lazy(() => import('../pages/ClientTutorials'))
export const ClientAttention = lazy(() => import('../pages/ClientAttention'))

// ——— Admin portal ———
export const AdminDashboard = lazy(() => import('../pages/AdminDashboard'))
export const AdminWaitlist = lazy(() => import('../pages/AdminWaitlist'))
export const AdminSales = lazy(() => import('../pages/AdminSales'))
export const AdminNotifications = lazy(() => import('../pages/AdminNotifications'))
export const AdminWorkQueue = lazy(() => import('../pages/AdminWorkQueue'))
export const AdminBrokerRisk = lazy(() => import('../pages/AdminBrokerRisk'))
export const AdminBlueprints = lazy(() => import('../pages/AdminBlueprints'))
export const AdminBrokerSnapshot = lazy(() => import('../pages/AdminBrokerSnapshot'))
export const AdminPublicMcChecks = lazy(() => import('../pages/AdminPublicMcChecks'))
export const Batches = lazy(() => import('../pages/Batches'))
export const CreateBatch = lazy(() => import('../pages/CreateBatch'))
export const AgingAR = lazy(() => import('../pages/AgingAR'))
export const BrokerAgingInvoicesPopup = lazy(() => import('../pages/BrokerAgingInvoicesPopup'))
export const CarrierAgingBrokersPopup = lazy(() => import('../pages/CarrierAgingBrokersPopup'))
export const InvoiceSearch = lazy(() => import('../pages/AdminInvoices'))
export const AdminInvoices = lazy(() => import('../pages/AdminInvoices'))
export const AdminInvoiceWorkspace = lazy(() => import('../pages/AdminInvoiceWorkspace'))
export const Brokers = lazy(() => import('../pages/Brokers'))
export const Clients = lazy(() => import('../pages/Clients'))
export const AdminCalendar = lazy(() => import('../pages/AdminCalendar'))
export const AdminAssistant = lazy(() => import('../pages/AdminAssistant'))
export const Collections = lazy(() => import('../pages/Collections'))
export const CollectionsInvoicePopup = lazy(() => import('../pages/CollectionsInvoicePopup'))
export const AdminEmailInbox = lazy(() => import('../pages/AdminEmailInbox'))
export const AdminDocs = lazy(() => import('../pages/AdminDocs'))
export const Accounting = lazy(() => import('../pages/Accounting'))
export const AuditDashboard = lazy(() => import('../pages/AuditDashboard'))
export const Users = lazy(() => import('../pages/Users'))
export const Settings = lazy(() => import('../pages/Settings'))
export const PaymentPosting = lazy(() => import('../pages/PaymentPosting'))
export const Billing = lazy(() => import('../pages/Billing'))
export const BillingInvoiceWorkspace = lazy(() => import('../pages/BillingInvoiceWorkspace'))
export const LoadReviewWorkbench = lazy(() => import('../pages/LoadReviewWorkbench'))
export const EngineSettingsPage = lazy(() => import('../pages/EngineSettingsPage'))
export const ReviewRulesPage = lazy(() => import('../pages/ReviewRulesPage'))

// ——— Marketing / secondary public ———
export const Tour = lazy(() => import('../pages/Tour'))
export const HowItWorks = lazy(() => import('../pages/HowItWorks'))
export const PrivacyPolicy = lazy(() => import('../pages/PrivacyPolicy'))
export const WebsiteTerms = lazy(() => import('../pages/WebsiteTerms'))
export const PlatformLandingPage = lazy(() => import('../pages/PlatformLandingPage'))
export const DocSortLandingPage = lazy(
  () => import('../products/docSort/pages/DocSortLandingPage')
)

// ——— Dev-only ———
export const DocumentReviewTest = lazy(() => import('../pages/DocumentReviewTest'))
export const LoadHistoryPage = lazy(() => import('../pages/LoadHistoryPage'))
