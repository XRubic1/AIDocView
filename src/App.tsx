import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ClientProtectedLayout from './components/client/ClientProtectedLayout'
import { ThemeProvider } from './theme/ThemeContext'
import AdminDashboard from './pages/AdminDashboard'
import ClientDashboard from './pages/ClientDashboard'
import ClientBatches from './pages/ClientBatches'
import ClientInvoices from './pages/ClientInvoices'
import ClientPayments from './pages/ClientPayments'
import ClientShortPayments from './pages/ClientShortPayments'
import ClientCollections from './pages/ClientCollections'
import ClientReports from './pages/ClientReports'
import ClientBrokers from './pages/ClientBrokers'
import ClientSettings from './pages/ClientSettings'
import ClientDocuments from './pages/ClientDocuments'
import Login from './pages/Login'
import ClientLogin from './pages/ClientLogin'
import Enroll from './pages/Enroll'
import LandingPage from './pages/LandingPage'
import PlatformLandingPage from './pages/PlatformLandingPage'
import HowItWorks from './pages/HowItWorks'
import Batches from './pages/Batches'
import CreateBatch from './pages/CreateBatch'
import AgingAR from './pages/AgingAR'
import InvoiceSearch from './pages/InvoiceSearch'
import Brokers from './pages/Brokers'
import Clients from './pages/Clients'
import Collections from './pages/Collections'
import Accounting from './pages/Accounting'
import AuditDashboard from './pages/AuditDashboard'
import Users from './pages/Users'
import Settings from './pages/Settings'
import DocumentReviewTest from './pages/DocumentReviewTest'
import LoadReviewWorkbench from './pages/LoadReviewWorkbench'
import ReviewRulesPage from './pages/ReviewRulesPage'
import LoadHistoryPage from './pages/LoadHistoryPage'
import EngineSettingsPage from './pages/EngineSettingsPage'
import TestTailwind from './components/TestTailwind'
import DocSortLandingPage from './products/docSort/pages/DocSortLandingPage'
import DocSortWorkbench from './products/docSort/pages/DocSortWorkbench'

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ThemeProvider>
        <Routes>
        <Route path="/enroll" element={<Enroll />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/login" element={<Login />} />
        <Route path="/client/login" element={<ClientLogin />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="/home" element={<PlatformLandingPage />} />
        <Route path="/docsort" element={<DocSortLandingPage />} />
        <Route path="/sort" element={<DocSortWorkbench />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route element={<ClientProtectedLayout />}>
          <Route path="/client/dashboard" element={<ClientDashboard />} />
          <Route path="/client/batches" element={<ClientBatches />} />
          <Route path="/client/invoices" element={<ClientInvoices />} />
          <Route path="/client/payments" element={<ClientPayments />} />
          <Route path="/client/short-payments" element={<ClientShortPayments />} />
          <Route path="/client/collections" element={<ClientCollections />} />
          <Route path="/client/brokers" element={<ClientBrokers />} />
          <Route path="/client/reports" element={<ClientReports />} />
          <Route path="/client/documents" element={<ClientDocuments />} />
          <Route path="/client/settings" element={<ClientSettings />} />
        </Route>
        <Route path="/batches" element={<Batches />} />
        <Route path="/batches/create" element={<CreateBatch />} />
        <Route path="/aging-ar" element={<AgingAR />} />
        <Route path="/invoice-search" element={<InvoiceSearch />} />
        <Route path="/brokers" element={<Brokers />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/accounting" element={<Accounting />} />
        <Route path="/Audit/dashboard" element={<AuditDashboard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/engine" element={<LoadReviewWorkbench />} />
        <Route path="/engine/settings" element={<EngineSettingsPage />} />
        <Route path="/engine/rules" element={<ReviewRulesPage />} />
        <Route path="/dev/load-review" element={<LoadReviewWorkbench />} />
        <Route path="/dev/document-review" element={<LoadReviewWorkbench />} />
        <Route path="/dev/document-review/test" element={<DocumentReviewTest />} />
        <Route path="/dev/rules" element={<ReviewRulesPage />} />
        <Route path="/dev/shipper-rules" element={<ReviewRulesPage />} />
        <Route path="/dev/load-history" element={<LoadHistoryPage />} />
        <Route path="/test" element={<TestTailwind />} />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App

