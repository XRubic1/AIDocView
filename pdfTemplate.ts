/**
 * Professional PDF Template Utility
 * 
 * This utility provides a consistent, professional PDF template that can be used
 * throughout the application for generating various reports and documents.
 * 
 * Features:
 * - Clean, professional design
 * - Consistent styling across all PDFs
 * - Print-optimized layout
 * - Flexible content structure
 * - Status badges with color coding
 * - Responsive design
 */

export interface PDFTemplateOptions {
  title: string;
  content: string;
  status?: string;
  subtitle?: string;
  filename?: string;
  logoBase64?: string;
  layout?: 'default' | 'invoice-full-page';
}

export interface InvoiceCharge {
  description: string;
  amount: number;
}

export interface InvoiceOptions {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceAmount: number;
  loadNumber?: string;
  brokerName: string;
  brokerAddress?: string;
  carrierName: string;
  clientName?: string;
  clientAddress?: string;
  clientAddressLines?: string;
  remittanceInfo?: string;
  bankName?: string;
  accountNumber?: string;
  routingNumber?: string;
  routingType?: 'ACH' | 'WIRE';
  charges?: InvoiceCharge[];
  logoBase64?: string;
  filename?: string;
}

/**
 * Generates a professional HTML template for PDF export
 * 
 * @param options - PDF template configuration
 * @returns HTML string ready for PDF generation
 */
export const generatePDFTemplate = (options: PDFTemplateOptions): string => {
  const { title, content, status, subtitle, logoBase64, layout = 'default' } = options;
  const isInvoiceFullPage = layout === 'invoice-full-page';
  
  return `
  <!DOCTYPE html>
  <html>
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
          * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
          }

          body {
              font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
              background: #f5f5f5;
              padding: 30px 20px;
              color: #000;
              display: flex;
              flex-direction: column;
              min-height: 100vh;
          }

          .container {
              max-width: 800px;
              margin: 0 auto;
              background: white;
              border: 1px solid #e0e0e0;
              position: relative;
              display: flex;
              flex-direction: column;
              min-height: 100vh;
              padding-bottom: 60px;
          }

          .logo-top-left {
              position: absolute;
              top: 0;
              left: 50%;
              transform: translateX(-50%);
              padding: 10px 20px 0px 20px;
              z-index: 10;
          }

          .header {
              padding: 30px 40px;
              border-bottom: 2px solid #000;
          }

          .header.no-border {
              border-bottom: none;
          }

          .header-top {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 20px;
          }

          .logo {
              max-height: 70px;
              max-width: 200px;
              height: auto;
              width: auto;
              object-fit: contain;
              display: block;
          }

          .header h1 {
              font-size: 28px;
              font-weight: 700;
              color: #000;
              margin-bottom: 5px;
          }

          .loan-id {
              font-size: 14px;
              color: #666;
          }

          .status {
              background: ${getStatusColor(status)};
              color: white;
              padding: 6px 14px;
              border-radius: 4px;
              font-size: 12px;
              font-weight: 600;
          }

          .content {
              padding: 30px 40px;
              flex: 1;
          }

          .section {
              margin-bottom: 30px;
          }

          .section-title {
              font-size: 14px;
              font-weight: 700;
              color: #000;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 12px;
              padding-bottom: 6px;
              border-bottom: 1px solid #e0e0e0;
          }

          .info-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #f0f0f0;
          }

          .info-row:last-child {
              border-bottom: none;
          }

          .info-label {
              font-size: 13px;
              color: #666;
              font-weight: 500;
          }

          .info-value {
              font-size: 13px;
              color: #000;
              font-weight: 600;
          }

          .two-column {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 30px;
          }

          .three-column {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 20px;
          }

          .payment-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 13px;
              margin-top: 10px;
          }

          .payment-table thead {
              background: #f5f5f5;
          }

          .payment-table th {
              padding: 10px 12px;
              text-align: left;
              font-weight: 600;
              color: #000;
              border-bottom: 2px solid #e0e0e0;
              font-size: 12px;
              text-transform: uppercase;
          }

          .payment-table td {
              padding: 10px 12px;
              border-bottom: 1px solid #f0f0f0;
              color: #333;
          }

          .payment-table tbody tr:hover {
              background: #fafafa;
          }

          .total-row {
              background: #f5f5f5;
              font-weight: 700;
          }

          .total-row td {
              color: #000;
              border-top: 2px solid #000;
              border-bottom: 2px solid #000;
              padding-top: 12px;
              padding-bottom: 12px;
          }

          .summary {
              background: #fafafa;
              padding: 20px;
              border: 1px solid #e0e0e0;
              margin-top: 30px;
          }

          .summary-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
          }

          .summary-label {
              font-size: 14px;
              color: #666;
              font-weight: 500;
          }

          .summary-value {
              font-size: 16px;
              font-weight: 700;
          }

          .summary-value.paid {
              color: #22c55e;
          }

          .summary-value.balance {
              color: #000;
          }

          .summary-value.positive {
              color: #22c55e;
          }

          .summary-value.negative {
              color: #dc2626;
          }

          .footer {
              position: absolute;
              bottom: 0;
              left: 0;
              right: 0;
              padding: 15px 40px;
              border-top: 1px solid #e0e0e0;
              font-size: 9px;
              color: #999;
              background: #fff;
          }

          .footer-left {
              color: #666;
          }

          .divider {
              height: 1px;
              background: #e0e0e0;
              margin: 20px 0;
          }

          .highlight {
              background: #fef3c7;
              padding: 2px 6px;
              border-radius: 4px;
              font-weight: 600;
          }

          .currency {
              color: #059669;
              font-weight: 600;
          }

          .text-center {
              text-align: center;
          }

          .text-right {
              text-align: right;
          }

          .mb-20 {
              margin-bottom: 20px;
          }

          .mt-20 {
              margin-top: 20px;
          }

          .invoice-header-section {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 30px;
          }

          .invoice-company-info {
              flex: 1;
          }

          .company-name {
              font-size: 24px;
              font-weight: 700;
              color: #000;
              margin-bottom: 12px;
          }

          .carrier-address {
              font-size: 13px;
              color: #666;
              line-height: 1.6;
              margin-bottom: 15px;
              padding-right: 40px;
          }

          .remittance-info-header {
              margin-top: 15px;
              padding-top: 15px;
              padding-right: 40px;
              position: relative;
          }

          .remittance-info-header::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 40px;
              height: 1px;
              background: #e0e0e0;
          }

          .remittance-label {
              font-size: 12px;
              font-weight: 700;
              color: #000;
              text-transform: uppercase;
              margin-bottom: 6px;
          }

          .remittance-text {
              font-size: 12px;
              color: #666;
              line-height: 1.5;
              margin-bottom: 12px;
          }

          .bank-info {
              margin-top: 12px;
              padding-top: 12px;
              padding-right: 40px;
              position: relative;
          }

          .bank-info::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 40px;
              height: 1px;
              background: #e0e0e0;
          }

          .bank-detail {
              font-size: 12px;
              margin-bottom: 6px;
              line-height: 1.5;
          }

          .bank-detail:last-child {
              margin-bottom: 0;
          }

          .bank-label {
              font-weight: 600;
              color: #000;
              margin-right: 8px;
          }

          .bank-value {
              color: #333;
          }

          .invoice-details {
              flex: 1;
              text-align: right;
              padding-top: 0;
              margin-top: 0;
          }

          .invoice-title {
              font-size: 32px;
              font-weight: 700;
              color: #000;
              margin-bottom: 20px;
              margin-top: 0;
              text-transform: uppercase;
              letter-spacing: 1px;
          }

          .address-block {
              margin-top: 10px;
          }

          .address-name {
              font-size: 15px;
              font-weight: 700;
              color: #000;
              margin-bottom: 8px;
          }

          .address-text {
              font-size: 13px;
              color: #666;
              line-height: 1.6;
          }

          .remittance-block {
              background: #fafafa;
              padding: 15px 20px;
              border-left: 3px solid #000;
              font-size: 13px;
              color: #333;
              line-height: 1.6;
              margin-top: 10px;
          }

          .invoice-summary {
              background: #f5f5f5;
              padding: 25px 30px;
              border: 2px solid #000;
              margin-top: 30px;
          }

          .summary-row-large {
              display: flex;
              justify-content: space-between;
              align-items: center;
          }

          .summary-label-large {
              font-size: 18px;
              font-weight: 600;
              color: #000;
              text-transform: uppercase;
              letter-spacing: 0.5px;
          }

          .summary-value-large {
              font-size: 24px;
              font-weight: 700;
              color: #000;
          }

          .charges-breakdown {
              margin-bottom: 15px;
          }

          .charge-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              font-size: 14px;
          }

          .charge-label {
              color: #666;
              font-weight: 500;
          }

          .charge-value {
              color: #000;
              font-weight: 600;
          }

          .divider-small {
              height: 1px;
              background: #e0e0e0;
              margin: 15px 0;
          }

          /* Invoice document layout */
          .inv-document {
              color: #113543;
          }

          .inv-top {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 24px;
              margin-bottom: 24px;
          }

          .inv-from {
              flex: 1;
              min-width: 0;
          }

          .inv-eyebrow {
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 1.2px;
              text-transform: uppercase;
              color: #819291;
              margin-bottom: 8px;
          }

          .inv-company-name {
              font-size: 22px;
              font-weight: 700;
              color: #113543;
              margin-bottom: 6px;
              line-height: 1.2;
          }

          .inv-address {
              font-size: 12px;
              color: #4b5c63;
              line-height: 1.6;
          }

          .inv-meta-card {
              min-width: 260px;
              background: #f8f9fa;
              border: 1px solid #d8dedf;
              border-top: 3px solid #113543;
              padding: 18px 20px;
          }

          .inv-title {
              font-size: 26px;
              font-weight: 700;
              letter-spacing: 2px;
              color: #113543;
              text-align: right;
              margin-bottom: 14px;
          }

          .inv-meta-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
          }

          .inv-meta-table td {
              padding: 5px 0;
              vertical-align: top;
          }

          .inv-meta-table td:first-child {
              color: #819291;
              font-weight: 600;
              padding-right: 16px;
              white-space: nowrap;
          }

          .inv-meta-table td:last-child {
              color: #113543;
              font-weight: 700;
              text-align: right;
          }

          .inv-meta-table tr.amount-row td:last-child {
              font-size: 16px;
              color: #113543;
          }

          .inv-payment-box {
              background: #f8f9fa;
              border: 1px solid #d8dedf;
              border-left: 3px solid #C2A558;
              padding: 14px 18px;
              margin-bottom: 22px;
          }

          .inv-payment-text {
              font-size: 12px;
              color: #4b5c63;
              line-height: 1.55;
              margin-bottom: 10px;
          }

          .inv-payment-instructions p {
              font-size: 12px;
              color: #4b5c63;
              line-height: 1.6;
              margin-bottom: 6px;
          }

          .inv-payment-instructions p:last-child {
              margin-bottom: 0;
          }

          .inv-payment-instructions strong {
              color: #113543;
          }

          .inv-payment-email {
              color: #113543;
              font-weight: 600;
          }

          .inv-table-section {
              margin-top: 0;
          }

          .inv-bank-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 12px;
              margin-top: 10px;
              padding-top: 10px;
              border-top: 1px solid #e4e8e9;
          }

          .inv-bank-item {
              font-size: 11px;
              color: #4b5c63;
              line-height: 1.5;
          }

          .inv-bank-item strong {
              display: block;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.6px;
              color: #819291;
              margin-bottom: 2px;
          }

          .inv-parties {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 18px;
              margin-bottom: 22px;
          }

          .inv-party-card {
              border: 1px solid #d8dedf;
              padding: 14px 16px;
              background: #fff;
          }

          .inv-party-name {
              font-size: 15px;
              font-weight: 700;
              color: #113543;
              margin-bottom: 6px;
          }

          .inv-line-items {
              width: 100%;
              border-collapse: collapse;
              margin-top: 4px;
              font-size: 12px;
          }

          .inv-line-items thead th {
              background: #113543;
              color: #fff;
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.8px;
              text-transform: uppercase;
              padding: 10px 14px;
              text-align: left;
          }

          .inv-line-items thead th:last-child {
              text-align: right;
          }

          .inv-line-items tbody td {
              padding: 12px 14px;
              border-bottom: 1px solid #e8ecec;
              color: #113543;
          }

          .inv-line-items tbody td:last-child {
              text-align: right;
              font-weight: 600;
          }

          .inv-line-items tfoot td {
              padding: 14px;
              background: #f8f9fa;
              border-top: 2px solid #113543;
              font-size: 13px;
              font-weight: 700;
              color: #113543;
          }

          .inv-line-items tfoot td:last-child {
              text-align: right;
              font-size: 18px;
          }

          body.invoice-full-page {
              padding: 0;
              margin: 0;
              background: #fff;
              width: 100%;
          }

          body.invoice-full-page .container {
              max-width: none;
              width: 100%;
              margin: 0;
              border: none;
              box-shadow: none;
              min-height: 100%;
              padding-bottom: 0;
          }

          body.invoice-full-page .header {
              display: none;
          }

          body.invoice-full-page .content {
              padding: 16px 36px 12px;
              flex: 1;
              display: flex;
              flex-direction: column;
          }

          body.invoice-full-page .footer {
              position: relative;
              margin-top: auto;
              padding: 10px 36px;
              border-top: 1px solid #e4e8e9;
          }

          body.invoice-full-page .inv-document {
              flex: 1;
              display: flex;
              flex-direction: column;
              min-height: 100%;
          }

          body.invoice-full-page .inv-content-block {
              flex-shrink: 0;
          }

          body.invoice-full-page .inv-page-fill {
              flex: 1;
              min-height: 0;
          }

          body.invoice-full-page .inv-top {
              margin-bottom: 28px;
          }

          body.invoice-full-page .inv-payment-box {
              margin-bottom: 28px;
          }

          body.invoice-full-page .inv-parties {
              margin-bottom: 20px;
          }

          @media print {
              @page {
                  size: letter;
                  margin: 0.5in;
              }
              
              body {
                  background: white;
                  padding: 0;
                  margin: 0;
                  display: flex;
                  flex-direction: column;
                  min-height: 100vh;
              }
              
              .container {
                  border: none;
                  max-width: 100%;
                  margin: 0;
                  box-shadow: none;
                  display: flex;
                  flex-direction: column;
                  min-height: 100vh;
              }
              
              .logo-top-left {
                  position: absolute;
                  top: 0;
                  left: 50%;
                  transform: translateX(-50%);
                  padding: 10px 20px 0px 20px;
                  margin-top: 0;
              }
              
              .header {
                  padding: 20px 0;
                  page-break-inside: avoid;
              }
              
              .content {
                  padding: 20px 0;
                  flex: 1;
              }
              
              .invoice-header-section {
                  page-break-inside: avoid;
              }
              
              .invoice-summary {
                  page-break-inside: avoid;
              }
              
              .footer {
                  position: absolute;
                  bottom: 0;
                  left: 0;
                  right: 0;
                  page-break-inside: avoid;
                  font-size: 9px;
                  background: #fff;
              }
          }
      </style>
  </head>
  <body class="${isInvoiceFullPage ? 'invoice-full-page' : ''}">
      <div class="container">
          ${logoBase64 ? `<div class="logo-top-left"><img src="${logoBase64}" alt="Logo" class="logo" /></div>` : ''}
          ${!isInvoiceFullPage ? `
          <div class="header ${logoBase64 ? 'no-border' : ''}">
              <div class="header-top">
                  ${title ? `<div><h1>${title}</h1>${subtitle ? `<div class="loan-id">${subtitle}</div>` : ''}</div>` : ''}
                  ${status ? `<div class="status">${status}</div>` : ''}
              </div>
          </div>
          ` : ''}

          <div class="content">
              ${content}
          </div>

          <div class="footer">
              <div class="footer-left">Powered by Credyx A/R Solutions</div>
          </div>
      </div>
  </body>
  </html>
  `;
};

/**
 * Gets the appropriate color for status badges
 * 
 * @param status - Status string
 * @returns CSS color value
 */
const getStatusColor = (status?: string): string => {
  if (!status) return '#6b7280';
  
  const statusLower = status.toLowerCase();
  
  if (statusLower.includes('paid') || statusLower.includes('complete') || statusLower.includes('active')) {
    return '#22c55e'; // Green
  }
  
  if (statusLower.includes('outstanding') || statusLower.includes('pending') || statusLower.includes('in progress')) {
    return '#f59e0b'; // Amber
  }
  
  if (statusLower.includes('overdue') || statusLower.includes('cancelled') || statusLower.includes('failed')) {
    return '#dc2626'; // Red
  }
  
  return '#6b7280'; // Gray (default)
};

/**
 * Downloads a PDF file using the generated HTML template
 * 
 * @param options - PDF template configuration
 */
export const downloadPDF = (options: PDFTemplateOptions): void => {
  const htmlContent = generatePDFTemplate(options);
  const filename = options.filename || `${options.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
  
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

/**
 * Helper function to format currency values
 * 
 * @param amount - Numeric amount
 * @returns Formatted currency string
 */
export const formatCurrency = (amount: number): string => {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Helper function to format dates
 * 
 * @param date - Date object or string
 * @returns Formatted date string
 */
export const formatDate = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString();
};

/**
 * Converts an image file to base64 string (for browser use)
 * 
 * @param file - File object or path to image
 * @returns Promise that resolves to base64 string
 */
export const imageToBase64 = async (file: File | string): Promise<string> => {
  if (typeof file === 'string') {
    // If it's a path, we'll need to fetch it (for browser)
    const response = await fetch(file);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } else {
    // If it's a File object
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
};

/**
 * Generates an invoice PDF template
 * 
 * @param options - Invoice configuration
 * @returns HTML string ready for PDF generation
 */
const splitNameAndAddress = (name: string, fullAddress?: string, addressLines?: string) => {
  if (addressLines) {
    return { name, lines: addressLines };
  }

  if (!fullAddress) {
    return { name, lines: '' };
  }

  const parts = fullAddress.split('\n').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 0 && parts[0].toLowerCase() === name.toLowerCase()) {
    return { name, lines: parts.slice(1).join('\n') };
  }

  return { name, lines: fullAddress };
};

export const generateInvoice = (options: InvoiceOptions): string => {
  const {
    invoiceNumber,
    invoiceDate,
    invoiceAmount,
    loadNumber,
    brokerName,
    brokerAddress = '',
    carrierName,
    clientName,
    clientAddress = '',
    clientAddressLines,
    remittanceInfo,
    bankName,
    accountNumber,
    routingNumber,
    routingType = 'ACH',
    charges = [],
    logoBase64,
  } = options;

  const resolvedClientName = clientName || carrierName;
  const fromAddress = splitNameAndAddress(carrierName, clientAddress, clientAddressLines);
  const clientParty = splitNameAndAddress(resolvedClientName, clientAddress, clientAddressLines);
  const lineItems = charges.length > 0
    ? charges
    : [{ description: 'Linehaul', amount: invoiceAmount }];
  const routingLabel = routingType === 'WIRE' ? 'Routing # (WIRE)' : 'Routing # (ACH)';

  const invoiceContent = `
    <div class="inv-document"${logoBase64 ? ' style="padding-top: 58px;"' : ''}>
      <div class="inv-content-block">
      <div class="inv-top">
        <div class="inv-from">
          <div class="inv-eyebrow">From</div>
          <div class="inv-company-name">${carrierName}</div>
          ${fromAddress.lines ? `<div class="inv-address">${fromAddress.lines.replace(/\n/g, '<br>')}</div>` : ''}
        </div>
        <div class="inv-meta-card">
          <div class="inv-title">INVOICE</div>
          <table class="inv-meta-table">
            <tr>
              <td>Invoice #</td>
              <td>${invoiceNumber}</td>
            </tr>
            ${loadNumber ? `<tr><td>Load #</td><td>${loadNumber}</td></tr>` : ''}
            <tr>
              <td>Invoice Date</td>
              <td>${invoiceDate}</td>
            </tr>
            <tr class="amount-row">
              <td>Amount Due</td>
              <td>${formatCurrency(invoiceAmount)}</td>
            </tr>
          </table>
        </div>
      </div>

      <div class="inv-payment-box">
        <div class="inv-eyebrow">Payment Information</div>
        <div class="inv-payment-instructions">
          <p><strong>Checks:</strong> Remit to the address above.</p>
          <p><strong>All remittance:</strong> <span class="inv-payment-email">remittance@credyxar.com</span></p>
        </div>
        ${remittanceInfo ? `<div class="inv-payment-text">${remittanceInfo}</div>` : ''}
        ${bankName || accountNumber || routingNumber ? `
          <div class="inv-bank-grid">
            ${bankName ? `<div class="inv-bank-item"><strong>Bank</strong>${bankName}</div>` : ''}
            ${accountNumber ? `<div class="inv-bank-item"><strong>Account #</strong>${accountNumber}</div>` : ''}
            ${routingNumber ? `<div class="inv-bank-item"><strong>${routingLabel}</strong>${routingNumber}</div>` : ''}
          </div>
        ` : ''}
      </div>

      <div class="inv-parties">
        <div class="inv-party-card">
          <div class="inv-eyebrow">Bill To</div>
          <div class="inv-party-name">${brokerName}</div>
          ${brokerAddress ? `<div class="inv-address">${brokerAddress.replace(/\n/g, '<br>')}</div>` : ''}
        </div>
        <div class="inv-party-card">
          <div class="inv-eyebrow">Client</div>
          <div class="inv-party-name">${clientParty.name}</div>
          ${clientParty.lines ? `<div class="inv-address">${clientParty.lines.replace(/\n/g, '<br>')}</div>` : ''}
        </div>
      </div>

      <div class="inv-table-section">
      <table class="inv-line-items">
        <thead>
          <tr>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((charge) => `
            <tr>
              <td>${charge.description}</td>
              <td>${formatCurrency(charge.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td>TOTAL:</td>
            <td>${formatCurrency(invoiceAmount)}</td>
          </tr>
        </tfoot>
      </table>
      </div>
      </div>
      <div class="inv-page-fill"></div>
    </div>
  `;

  return generatePDFTemplate({
    title: '',
    content: invoiceContent,
    logoBase64: logoBase64,
    layout: 'invoice-full-page',
  });
};

/**
 * Downloads an invoice PDF file using browser print functionality
 * 
 * @param options - Invoice configuration
 */
export const downloadInvoice = (options: InvoiceOptions): void => {
  const htmlContent = generateInvoice(options);
  // Create a new window for printing to PDF
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.error('Popup blocked. Please allow popups to download PDF.');
    return;
  }
  
  // Add instructions to remove headers/footers
  const instructionsHTML = `
    <div style="position: fixed; top: 10px; right: 10px; background: #fff3cd; border: 2px solid #ffc107; padding: 15px; border-radius: 5px; z-index: 10000; max-width: 300px; font-size: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);">
      <strong>Before printing:</strong><br>
      In the print dialog, look for "More settings" or "Options" and:<br><br>
      <strong>Chrome/Edge:</strong> Uncheck "Headers and footers"<br>
      <strong>Firefox:</strong> Set Headers & Footers to "--blank--"<br>
      <strong>Safari:</strong> Set Headers & Footers to "None"<br><br>
      <button onclick="this.parentElement.remove(); window.print();" style="background: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">Continue to Print</button>
    </div>
  `;
  
  printWindow.document.write(htmlContent + instructionsHTML);
  printWindow.document.close();
  
  // Wait for content to load
  printWindow.onload = function() {
    // Don't auto-print, let user see instructions first
    // User will click the button to print
  };
};

/**
 * Common PDF content templates
 */
export const PDFContentTemplates = {
  /**
   * Creates a two-column info section
   */
  twoColumnInfo: (leftContent: string, rightContent: string): string => `
    <div class="two-column">
      <div class="section">
        ${leftContent}
      </div>
      <div class="section">
        ${rightContent}
      </div>
    </div>
  `,

  /**
   * Creates a three-column info section
   */
  threeColumnInfo: (leftContent: string, middleContent: string, rightContent: string): string => `
    <div class="three-column">
      <div class="section">
        ${leftContent}
      </div>
      <div class="section">
        ${middleContent}
      </div>
      <div class="section">
        ${rightContent}
      </div>
    </div>
  `,

  /**
   * Creates a section with title and content
   */
  section: (title: string, content: string): string => `
    <div class="section">
      <div class="section-title">${title}</div>
      ${content}
    </div>
  `,

  /**
   * Creates an info row
   */
  infoRow: (label: string, value: string): string => `
    <div class="info-row">
      <span class="info-label">${label}</span>
      <span class="info-value">${value}</span>
    </div>
  `,

  /**
   * Creates a summary section
   */
  summary: (rows: Array<{label: string, value: string, type?: 'paid' | 'balance' | 'positive' | 'negative'}>): string => `
    <div class="summary">
      ${rows.map(row => `
        <div class="summary-row">
          <span class="summary-label">${row.label}</span>
          <span class="summary-value ${row.type || ''}">${row.value}</span>
        </div>
      `).join('')}
    </div>
  `,

  /**
   * Creates a table
   */
  table: (headers: string[], rows: string[][], hasTotalRow: boolean = false): string => `
    <table class="payment-table">
      <thead>
        <tr>
          ${headers.map(header => `<th>${header}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            ${row.map(cell => `<td>${cell}</td>`).join('')}
          </tr>
        `).join('')}
        ${hasTotalRow ? `
          <tr class="total-row">
            <td>TOTAL</td>
            ${headers.slice(1).map((_, index) => {
              // Calculate totals for each column (skip first column which is label)
              const columnIndex = index + 1;
              if (rows.length > 0) {
                // Try to parse and sum numeric values
                let total = 0;
                rows.forEach(row => {
                  const cellValue = row[columnIndex] || '';
                  // Remove currency symbols and parse
                  const numValue = parseFloat(cellValue.replace(/[^0-9.-]/g, ''));
                  if (!isNaN(numValue)) {
                    total += numValue;
                  }
                });
                // Format based on whether it looks like currency or percentage
                const firstCell = rows[0][columnIndex] || '';
                if (firstCell.includes('$')) {
                  return `<td>${formatCurrency(total)}</td>`;
                } else if (firstCell.includes('%')) {
                  return `<td></td>`;
                } else {
                  return `<td>${Math.round(total)}</td>`;
                }
              }
              return '<td></td>';
            }).join('')}
          </tr>
        ` : ''}
      </tbody>
    </table>
  `,

  /**
   * Creates a revenue report PDF content
   */
  createRevenueReport: (clients: Array<{
    name: string;
    totalLoans: number;
    feesOwed: number;
    feesCollected: number;
    outstanding: number;
    collectionRate: number;
  }>, summary: {
    totalFeesOwed: number;
    totalFeesCollected: number;
    totalOutstanding: number;
    overallCollectionRate: number;
  }): string => {
    const summaryContent = PDFContentTemplates.section('Summary', `
      ${PDFContentTemplates.infoRow('Total Fees Owed', formatCurrency(summary.totalFeesOwed))}
      ${PDFContentTemplates.infoRow('Total Fees Collected', formatCurrency(summary.totalFeesCollected))}
      ${PDFContentTemplates.infoRow('Total Outstanding', formatCurrency(summary.totalOutstanding))}
      ${PDFContentTemplates.infoRow('Overall Collection Rate', `${summary.overallCollectionRate}%`)}
    `);

    const clientTableRows = clients.map(client => [
      client.name,
      client.totalLoans.toString(),
      formatCurrency(client.feesOwed),
      formatCurrency(client.feesCollected),
      formatCurrency(client.outstanding),
      `${client.collectionRate}%`
    ]);
    
    // Add total row
    clientTableRows.push([
      'TOTAL',
      clients.reduce((sum, c) => sum + c.totalLoans, 0).toString(),
      formatCurrency(summary.totalFeesOwed),
      formatCurrency(summary.totalFeesCollected),
      formatCurrency(summary.totalOutstanding),
      `${summary.overallCollectionRate}%`
    ]);

    const clientTableContent = PDFContentTemplates.table(
      ['Client', 'Total Loans', 'Fees Owed', 'Fees Collected', 'Outstanding', 'Collection Rate'],
      clientTableRows,
      false
    );

    const clientBreakdownContent = PDFContentTemplates.section('Revenue Breakdown by Client', clientTableContent);

    const summarySection = PDFContentTemplates.summary([
      {
        label: 'Total Fees Owed',
        value: formatCurrency(summary.totalFeesOwed),
        type: 'balance'
      },
      {
        label: 'Total Fees Collected',
        value: formatCurrency(summary.totalFeesCollected),
        type: 'paid'
      },
      {
        label: 'Total Outstanding',
        value: formatCurrency(summary.totalOutstanding),
        type: summary.totalOutstanding > 0 ? 'negative' : 'paid'
      },
      {
        label: 'Overall Collection Rate',
        value: `${summary.overallCollectionRate}%`,
        type: summary.overallCollectionRate >= 80 ? 'paid' : summary.overallCollectionRate >= 60 ? 'positive' : 'negative'
      }
    ]);

    return `
      ${summaryContent}
      <div class="divider"></div>
      ${clientBreakdownContent}
      ${summarySection}
    `;
  }
};
