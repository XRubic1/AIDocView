import { useState } from 'react'
import { Header } from '../components/admin/Header'
import AgingInvoicesTab from '../components/invoices/AgingInvoicesTab'
import InvoiceDetailModal from '../components/invoices/InvoiceDetailModal'
import { Invoice } from '../types/invoice'
import { mockInvoices } from '../data/mockInvoices'

export default function AgingAR() {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [lastViewedInvoiceId, setLastViewedInvoiceId] = useState<string | null>(null)

  const handleInvoiceSelect = (invoiceId: string) => {
    const invoice = mockInvoices.find((inv) => inv.id === invoiceId)
    setSelectedInvoice(invoice || null)
    // Clear the last viewed highlight when opening a new invoice
    if (lastViewedInvoiceId !== invoiceId) {
      setLastViewedInvoiceId(null)
    }
  }

  const handleClose = () => {
    // Store the invoice ID before closing so we can highlight it
    if (selectedInvoice) {
      setLastViewedInvoiceId(selectedInvoice.id)
    }
    setSelectedInvoice(null)
  }

  const handleApprove = (invoiceId: string) => {
    console.log('Approving invoice:', invoiceId)
    // TODO: Implement approval logic
  }

  const handleReject = (invoiceId: string) => {
    console.log('Rejecting invoice:', invoiceId)
    // TODO: Implement rejection logic
  }

  const handleHold = (invoiceId: string) => {
    console.log('Holding invoice:', invoiceId)
    // TODO: Implement hold logic
  }

  const handleReleaseHold = (invoiceId: string) => {
    console.log('Releasing hold on invoice:', invoiceId)
    // TODO: Implement release hold logic
  }

  const handleContactBroker = (invoiceId: string) => {
    console.log('Contacting broker for invoice:', invoiceId)
    // The modal will handle opening the contact broker modal
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName="Admin User" userRole="Administrator" />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-black mb-2">Aging A/R</h1>
          <p className="text-gray-600">View invoices grouped by days since expected payment date</p>
        </div>

        <div className="bg-white border border-gray-200">
          <AgingInvoicesTab 
            onInvoiceSelect={handleInvoiceSelect} 
            lastViewedInvoiceId={lastViewedInvoiceId}
          />
        </div>
      </main>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={handleClose}
          onApprove={handleApprove}
          onReject={handleReject}
          onHold={handleHold}
          onReleaseHold={handleReleaseHold}
          onContactBroker={handleContactBroker}
        />
      )}
    </div>
  )
}

