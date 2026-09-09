import type { EmailTemplateId } from './emailTemplateDefaults'
import { sampleCarrierIssueFields, toTemplateData } from '../utils/carrierDocumentIssueEmail'
import { defaultPortalLink } from '../utils/carrierAttentionLink'

/** Sample placeholder values so Settings preview looks like a real email. */
export function getEmailPreviewSampleData(templateId: EmailTemplateId): Record<string, string> {
  const carrier = toTemplateData(sampleCarrierIssueFields())

  const shared = {
    companyLogoHtml: carrier.companyLogoHtml,
    contactName: 'Alex',
    clientName: 'Northline Transport',
    invoiceNumber: 'INV-10428',
    loadNumber: 'LD-8831',
    brokerName: 'Summit Freight Brokers',
    portalLink: defaultPortalLink(),
  }

  switch (templateId) {
    case 'carrier_document_issue':
      return carrier
    case 'carrier_batch_processed':
      return {
        ...shared,
        batchNumber: 'B-2408',
        invoiceCount: '12',
        holdCount: '2',
        holdList: 'INV-10428: Missing signed POD\nINV-10431: Rate con does not match load',
        ppwSummary: 'Summit Freight Brokers — INV-10420, INV-10422',
      }
    case 'carrier_batch_holds':
      return {
        ...shared,
        batchNumber: 'B-2408',
        holdCount: '2',
        holdList: 'INV-10428: Missing signed POD\nINV-10431: Rate con does not match load',
      }
    case 'carrier_batch_verified':
      return {
        ...shared,
        batchNumber: 'B-2408',
        invoiceCount: '12',
        ppwSummary: 'Summit Freight Brokers — INV-10420, INV-10422',
      }
    case 'broker_packet':
      return {
        ...shared,
        documentList: 'Invoice PDF, POD, Rate confirmation',
        remittanceMessage:
          'All payments must be sent to the carrier per the remit-to on the attached invoice.',
        message: '',
        partSuffix: '',
        partNoteHtml: '',
        remittanceChangeNoteHtml: '',
      }
    case 'client_invite':
      return {
        ...shared,
        feeTermsLabel: '2.5%',
        feePercentage: '2.5',
        websiteUrl: 'https://credyx.com',
        contactEmail: 'ops@credyx.net',
        portalLink: `${shared.portalLink}/client/login`,
        setupLink: `${shared.portalLink}/client/setup-password`,
        inviteLink: `${shared.portalLink}/client/setup-password`,
        ctaLabel: 'Create your password',
      }
    case 'auth_signup':
    case 'auth_invite':
    case 'auth_magiclink':
    case 'auth_recovery':
    case 'auth_email_change':
    case 'auth_email_otp':
    case 'auth_reauthentication':
    case 'auth_password_changed':
    case 'auth_email_changed':
      return {
        ...shared,
        email: 'alex@northline.example',
        confirmation_url: `${shared.portalLink}/client/login`,
        token: '305805',
        site_url: shared.portalLink,
        redirect_to: `${shared.portalLink}/client/login`,
        new_email: 'alex.new@northline.example',
        old_email: 'alex@northline.example',
      }
    default:
      return {
        ...shared,
        email: 'ops@example.com',
        amount: '$2,450.00',
        eventTitle: 'Follow up',
        eventType: 'Reminder',
        whenLabel: 'Tue 10:00 AM',
        message: 'Please review when you have a moment.',
        meetingBlock: '',
        recipientRole: '',
        companyName: 'Northline Transport',
        phone: '(555) 010-2200',
        fleetSize: '12',
        hearAbout: 'Referral',
        notes: 'Interested in managed A/R.',
        batchNumber: 'B-2408',
        scope: 'verification',
        issueMessage: 'Could not read page 2 of the POD.',
        carrierName: 'Northline Transport',
        effectiveDate: '2026-09-08',
      }
  }
}
