const fs = require('fs');
const path = require('path');
const root = 'c:/Users/Work/Desktop/Tools/AIDocView-main';
function read(r){return fs.readFileSync(path.join(root,r),'utf8')}
function write(r,c){fs.writeFileSync(path.join(root,r),c,'utf8')}
function patch(r,fn){write(r,fn(read(r)))}

patch('src/components/batches/AdminInvoiceDetailView.tsx', f =>
  f.replace('onContactBroker?.(invoice.id)', 'onContactBroker?.(currentInvoice?.id ?? \'\')')
);

patch('src/components/client/SimpleUploadModal.tsx', f => f.replace('  clientId,', '  clientId: _clientId,'));

patch('src/hooks/useLandingLiveData.ts', f => {
  f = f.replace(/import \{\n  EXAMPLE_BATCH_LOAD_COUNT,\n  HERO_STATS_BASELINE,\n  TYPICAL_SECONDS_PER_LOAD,\n  estimateBatchMinutes,\n\} from '\.\.\/data\/landingMetrics'/,
    "import { HERO_STATS_BASELINE } from '../data/landingMetrics'");
  return f;
});

patch('src/pages/LoadReviewWorkbench.tsx', f => {
  const lines = f.split(/\r?\n/);
  const out = [];
  let skipNextCompact = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('label="Add PDF"')) {
      // remove compact line immediately before label if duplicate pattern
    }
    if (i === 729 && line.trim() === 'compact') continue; // 0-based line 729 = line 730
    out.push(line);
  }
  return out.join('\n');
});

patch('src/utils/extractBatchFields.ts', f => {
  const fields = ['loadNumber','invoiceLoadNumber','broker','carrier','amount','invoiceNumber','invoiceDate'];
  f = f.replace(/(\w+): ([^,\n]+),/g, (m, key, val) => {
    if (!fields.includes(key)) return m;
    if (val.includes('?? undefined')) return m;
    return `${key}: (${val.trim()}) ?? undefined,`;
  });
  return f;
});

patch('src/utils/invoiceBilledMatch.ts', f => {
  for (const key of ['loadNumber','broker','carrier','invoiceNumber','invoiceDate']) {
    f = f.replace(new RegExp(`${key}: invoice\\.${key.replace('loadNumber','load_number').replace('broker','broker_name').replace('carrier','carrier_name').replace('invoiceNumber','invoice_number').replace('invoiceDate','invoice_date')},`), (m) => {
      return m; // skip complex
    });
  }
  f = f.replace('loadNumber: invoice.load_number,', 'loadNumber: invoice.load_number ?? undefined,');
  f = f.replace('broker: invoice.broker_name,', 'broker: invoice.broker_name ?? undefined,');
  f = f.replace('carrier: invoice.carrier_name,', 'carrier: invoice.carrier_name ?? undefined,');
  f = f.replace('invoiceNumber: invoice.invoice_number,', 'invoiceNumber: invoice.invoice_number ?? undefined,');
  f = f.replace('invoiceDate: invoice.invoice_date,', 'invoiceDate: invoice.invoice_date ?? undefined,');
  return f;
});

patch('src/utils/loadReviewSummary.ts', f => {
  f = f.replace(
    'matchBrokerCarrierFromExcel(excelFileName, excelDebtor ?? undefined, docBroker, docCarrier)',
    'matchBrokerCarrierFromExcel(excelFileName, excelDebtor ?? undefined, docBroker ?? undefined, docCarrier ?? undefined)'
  );
  f = f.replace(
    'cross.multi_stop_coverage.details,\n        { documentValue: stopsDisplay }',
    '(cross.multi_stop_coverage.details ?? \'\'),\n        { documentValue: stopsDisplay }'
  );
  f = f.replace('carrier.summary, {', '(carrier.summary ?? \'\'), {');
  // Remove unused helper functions
  f = f.replace(/function _excelStatusToCheck[\s\S]*?\n\}\n\n/, '');
  f = f.replace(/function _excelField[\s\S]*?\n\}\n\n/, '');
  return f;
});

patch('src/pages/ClientBatches.tsx', f => {
  f = f.replace('setCurrentInvoiceForDocuments(invoice)', 'setCurrentInvoiceForDocuments(invoice as InvoiceFormData)');
  f = f.replace('setViewingInvoiceDocuments(invoice)', 'setViewingInvoiceDocuments(invoice as InvoiceFormData)');
  f = f.replace('setUploadedDocuments(invoice.documents || [])', 'setUploadedDocuments((invoice.documents || []) as InvoiceDocument[])');
  return f;
});

patch('src/services/paymentCorrectionService.ts', f =>
  f.replace(/^\s*const _isOver[^\n]*\n/m, '')
);

patch('src/utils/reviewRulesStore.ts', f =>
  f.replace(/\s*BuiltInReviewRuleOverride,\n?/, '')
);

// Remove unused _getStatusBadge function - find and comment/delete
patch('src/pages/ClientBatches.tsx', f => {
  const start = f.indexOf('  const _getStatusBadge');
  if (start !== -1) {
    const end = f.indexOf('\n  const ', start + 1);
    if (end !== -1) f = f.slice(0, start) + f.slice(end);
  }
  const pdfStart = f.indexOf('  const _clientNameForPdf');
  if (pdfStart !== -1) {
    const end = f.indexOf('\n', pdfStart);
    f = f.slice(0, pdfStart) + f.slice(end);
  }
  return f;
});

patch('src/pages/ClientDocuments.tsx', f => {
  const start = f.indexOf('function _getCategoryPill');
  if (start !== -1) {
    const end = f.indexOf('\nfunction ', start + 1);
    if (end === -1) return f;
    return f.slice(0, start) + f.slice(end);
  }
  return f;
});

patch('src/pages/AuditDashboard.tsx', f => {
  const start = f.indexOf('const _severityColors');
  if (start !== -1) {
    const end = f.indexOf('\n', start);
    return f.slice(0, start) + f.slice(end);
  }
  return f;
});

console.log('batch3');
