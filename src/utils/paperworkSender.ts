import { Invoice } from '../types/invoice'
import { Broker } from '../types/broker'
import { mockBrokers } from '../data/mockBrokers'
import { logAuditEvent } from './auditLogger'

/**
 * Automatically send paperwork for all invoices in a batch
 * This is called when a batch is approved
 */
export const sendPaperworkForBatch = (
  invoices: Invoice[],
  batchNumber: string,
  userId: string = 'system',
  userName: string = 'System',
  userRole: string = 'System'
): { success: number; failed: number; details: Array<{ invoiceId: string; invoiceNumber: string; brokerEmail: string; success: boolean; error?: string }> } => {
  const results = {
    success: 0,
    failed: 0,
    details: [] as Array<{ invoiceId: string; invoiceNumber: string; brokerEmail: string; success: boolean; error?: string }>,
  }

  invoices.forEach((invoice) => {
    // Find broker information
    const broker = mockBrokers.find((b) => b.id === invoice.broker_id)
    
    if (!broker) {
      results.failed++
      results.details.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        brokerEmail: 'N/A',
        success: false,
        error: 'Broker not found',
      })
      
      // Log failed attempt
      logAuditEvent(
        'document_sent',
        'invoice',
        invoice.id,
        invoice.invoice_number,
        `Failed to send paperwork for invoice ${invoice.invoice_number}: Broker not found`,
        userId,
        userName,
        userRole,
        undefined,
        {
          batch_number: batchNumber,
          broker_id: invoice.broker_id,
          error: 'Broker not found',
        },
        'error',
        false
      )
      return
    }

    if (!broker.email) {
      results.failed++
      results.details.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        brokerEmail: 'N/A',
        success: false,
        error: 'Broker email not available',
      })
      
      // Log failed attempt
      logAuditEvent(
        'document_sent',
        'invoice',
        invoice.id,
        invoice.invoice_number,
        `Failed to send paperwork for invoice ${invoice.invoice_number}: Broker email not available`,
        userId,
        userName,
        userRole,
        undefined,
        {
          batch_number: batchNumber,
          broker_id: invoice.broker_id,
          broker_name: broker.name,
          error: 'Broker email not available',
        },
        'error',
        false
      )
      return
    }

    // Prepare document list (mock - in real implementation, this would get actual document names)
    const documentNames = []
    if (invoice.documents_count && invoice.documents_count > 0) {
      for (let i = 0; i < invoice.documents_count; i++) {
        documentNames.push(`Document_${i + 1}.pdf`)
      }
    } else {
      // Default documents
      documentNames.push('Invoice.pdf', 'BOL.pdf')
    }

    // Create document send record
    const sendRecord = {
      email_address: broker.email,
      sent_at: new Date().toISOString(),
      sent_by: userName,
      status: 'delivered' as const,
      documents_sent: documentNames,
    }

    // Add to invoice's document_send_history
    if (!invoice.document_send_history) {
      invoice.document_send_history = []
    }
    invoice.document_send_history.push(sendRecord)

    results.success++
    results.details.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      brokerEmail: broker.email,
      success: true,
    })

    // Log successful send
    logAuditEvent(
      'document_sent',
      'invoice',
      invoice.id,
      invoice.invoice_number,
      `Paperwork automatically sent to ${broker.email} for invoice ${invoice.invoice_number} (Batch: ${batchNumber})`,
      userId,
      userName,
      userRole,
      undefined,
      {
        batch_number: batchNumber,
        broker_id: invoice.broker_id,
        broker_name: broker.name,
        broker_email: broker.email,
        documents_sent: documentNames,
        automatic: true,
      },
      'info',
      true
    )

    // In a real implementation, this would actually send the email with attachments
    console.log(`[PAPERWORK] Sending to ${broker.email} for invoice ${invoice.invoice_number}:`, documentNames)
  })

  // Log batch-level summary
  if (results.success > 0 || results.failed > 0) {
    logAuditEvent(
      'document_sent',
      'batch',
      null,
      batchNumber,
      `Automatic paperwork sending completed for batch ${batchNumber}: ${results.success} successful, ${results.failed} failed`,
      userId,
      userName,
      userRole,
      undefined,
      {
        batch_number: batchNumber,
        total_invoices: invoices.length,
        successful: results.success,
        failed: results.failed,
        details: results.details,
      },
      results.failed > 0 ? 'warning' : 'info',
      results.failed === 0
    )
  }

  return results
}

